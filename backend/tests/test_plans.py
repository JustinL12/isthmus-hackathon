from urllib.parse import quote

from app.services import databricks, email

from .conftest import MOCHI


def total(items, only_selected=False):
    return sum(i["price"] for i in items if i["selected"] or not only_selected)


def test_reference_data(client):
    assert len(client.get("/api/catalog").json()) >= 30
    assert {t["id"] for t in client.get("/api/templates").json()} >= {"vomiting-senior-cat", "limping-dog"}
    assert any(s["id"] == "vomiting" for s in client.get("/api/symptoms").json())
    assert client.get("/health").json()["database"] == "memory"


def test_mochi_template_flow(client, monkeypatch):
    exported = []
    monkeypatch.setattr(databricks, "export_agreed_plan", exported.append)

    plan = client.post("/api/plans", json={**MOCHI, "template_id": "vomiting-senior-cat"}).json()
    assert plan["source"] == "template" and plan["suggested"] == []
    assert total(plan["items"]) == 780
    assert sum(i["price"] for i in plan["items"] if i["group"] == "essential") == 360

    items = [{**i, "selected": i["group"] == "essential"} for i in plan["items"]]
    r = client.patch(f"/api/plans/{plan['id']}", json={"items": items, "payment_choice": "split"})
    assert r.status_code == 200 and total(r.json()["items"], only_selected=True) == 360

    agreed = client.post(f"/api/plans/{plan['id']}/agree").json()
    assert agreed["status"] == "agreed" and agreed["share_token"]
    assert all(i["recheck_date"] for i in agreed["items"] if not i["selected"])
    assert [p.id for p in exported] == [plan["id"]]

    assert client.patch(f"/api/plans/{plan['id']}", json={"budget": 1}).status_code == 409
    assert client.get(f"/api/share/{agreed['share_token']}").json()["id"] == plan["id"]
    pdf = client.get(f"/api/share/{agreed['share_token']}/pdf")
    assert pdf.headers["content-type"] == "application/pdf" and pdf.content.startswith(b"%PDF")


def test_pdf_download_any_pet_name(client):
    # Header values must be Latin-1: names like these used to crash the PDF download (500)
    # or produce a broken header.
    cases = {
        "Mochi": 'filename="Mochi-care-plan.pdf"',
        'Mr. "Whiskers"': 'filename="Mr.-Whiskers-care-plan.pdf"',
        "Café": 'filename="Caf-care-plan.pdf"',
        "Mochi 🐱": 'filename="Mochi-care-plan.pdf"',
        "小白": 'filename="care-plan.pdf"',
    }
    for name, ascii_part in cases.items():
        plan = client.post(
            "/api/plans", json={**MOCHI, "pet": {**MOCHI["pet"], "name": name}, "template_id": "vomiting-senior-cat"}
        ).json()
        token = client.post(f"/api/plans/{plan['id']}/agree").json()["share_token"]
        pdf = client.get(f"/api/share/{token}/pdf")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF"), name
        disposition = pdf.headers["content-disposition"]
        assert disposition.startswith("attachment; ") and ascii_part in disposition, (name, disposition)
        assert f"filename*=UTF-8''{quote(f'{name}-care-plan.pdf', safe='')}" in disposition, (name, disposition)


def test_create_from_suggested_items(client):
    body = {**MOCHI, "symptoms": ["vomiting"], "items": [
        {"catalog_id": "exam", "group": "essential", "reason": "Needed first."},
        {"catalog_id": "t4", "group": "optional"},
    ]}
    plan = client.post("/api/plans", json=body).json()
    assert plan["source"] == "suggest" and plan["symptoms"] == ["vomiting"]
    assert plan["items"][0]["reason"] == "Needed first." and plan["items"][0]["explanation"]
    # the AI draft is kept as sent, and survives the vet's edits
    assert [s["catalog_id"] for s in plan["suggested"]] == ["exam", "t4"]
    edited = client.patch(f"/api/plans/{plan['id']}", json={"items": plan["items"][:1]}).json()
    assert len(edited["items"]) == 1 and len(edited["suggested"]) == 2

    blank = client.post("/api/plans", json={**MOCHI, "items": [], "template_id": None}).json()
    assert blank["source"] == "blank" and blank["items"] == [] and blank["suggested"] == []

    bad = client.post("/api/plans", json={**MOCHI, "items": [{"catalog_id": "nope", "group": "soon"}]})
    assert bad.status_code == 422
    assert client.post("/api/plans", json=MOCHI).status_code == 422


def test_email(client, monkeypatch):
    sent = []

    class Ok:
        def raise_for_status(self):
            pass

    monkeypatch.setenv("RESEND_API_KEY", "test")
    monkeypatch.setattr(email.httpx, "post", lambda url, **kw: sent.append(kw["json"]) or Ok())
    monkeypatch.setattr(databricks, "export_agreed_plan", lambda plan: None)

    plan = client.post("/api/plans", json={**MOCHI, "template_id": "vomiting-senior-cat"}).json()
    assert client.post(f"/api/plans/{plan['id']}/email", json={"email": "a@b.c"}).status_code == 409

    client.patch(f"/api/plans/{plan['id']}", json={"owner_email": "alex@example.com"})
    client.post(f"/api/plans/{plan['id']}/agree")  # emails automatically
    assert sent[-1]["to"] == ["alex@example.com"]
    assert sent[-1]["attachments"][0]["filename"] == "Mochi-care-plan.pdf"

    assert client.post(f"/api/plans/{plan['id']}/email", json={"email": "a@b.c"}).json() == {"sent": True}
    assert sent[-1]["to"] == ["a@b.c"]


def test_add_symptom(client):
    r = client.post("/api/symptoms", json={"label": "  pale   gums "})
    assert r.status_code == 201 and r.json() == {"id": "pale-gums", "label": "Pale gums", "species": ["cat", "dog"]}
    assert client.get("/api/symptoms").json()[-1]["id"] == "pale-gums"
    # Same name (any case) returns the existing symptom instead of a duplicate.
    assert client.post("/api/symptoms", json={"label": "VOMITING"}).json()["id"] == "vomiting"
    assert client.post("/api/symptoms", json={"label": "   "}).status_code == 422
    # Usable in /suggest right away (template fallback here: nothing matches pale gums alone).
    r = client.post("/api/suggest", json={"species": "cat", "age_years": 3, "symptoms": ["pale-gums", "vomiting"]}).json()
    assert r["source"] == "template"
