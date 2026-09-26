from app.services import claude

from .conftest import MOCHI

EXPLANATION = {"what": "A quick ultrasound of the heart.", "why": "Checks for heart disease.", "if_postponed": "Ask your vet."}


def ids(client, path="/api/catalog"):
    return {i["id"] for i in client.get(path).json()}


def test_create_item_shows_up_immediately(client):
    r = client.post("/api/catalog", json={"name": "  Heart ultrasound ", "price": 300, "code": "IM530", "explanation": EXPLANATION})
    assert r.status_code == 201
    item = r.json()
    assert item["id"] == "heart-ultrasound" and item["name"] == "Heart ultrasound" and item["active"]
    assert item["explanation"]["what"] == EXPLANATION["what"]
    assert "heart-ultrasound" in ids(client)
    assert client.get("/api/explanations").json()["heart-ultrasound"]["why"] == EXPLANATION["why"]

    # Usable in a new plan right away.
    plan = client.post("/api/plans", json={**MOCHI, "items": [{"catalog_id": "heart-ultrasound", "group": "soon"}]}).json()
    assert plan["items"][0]["price"] == 300 and plan["items"][0]["explanation"]


def test_slug_collisions_and_explanation_optional(client):
    client.delete("/api/catalog/exam")  # frees the name, but the id stays taken
    r = client.post("/api/catalog", json={"name": "Exam", "price": 10})
    assert r.status_code == 201 and r.json()["id"] == "exam-2" and r.json()["explanation"] is None


def test_price_change_only_affects_new_plans(client):
    old = client.post("/api/plans", json={**MOCHI, "template_id": "vomiting-senior-cat"}).json()
    r = client.patch("/api/catalog/blood-panel", json={"price": 199.5})
    assert r.status_code == 200 and r.json()["price"] == 199.5 and r.json()["name"] == "Blood panel"

    kept = client.get(f"/api/plans/{old['id']}").json()
    assert next(i for i in kept["items"] if i["catalog_id"] == "blood-panel")["price"] == 170
    new = client.post("/api/plans", json={**MOCHI, "template_id": "vomiting-senior-cat"}).json()
    assert next(i for i in new["items"] if i["catalog_id"] == "blood-panel")["price"] == 199.5


def test_edit_name_and_explanation(client):
    r = client.patch("/api/catalog/t4", json={"name": "Thyroid blood test", "explanation": EXPLANATION})
    assert r.json()["name"] == "Thyroid blood test"
    assert client.get("/api/explanations").json()["t4"]["what"] == EXPLANATION["what"]


def test_remove_hides_everywhere_and_restore_brings_back(client):
    r = client.delete("/api/catalog/t4")
    assert r.status_code == 200 and r.json()["active"] is False
    assert client.delete("/api/catalog/t4").status_code == 200  # safe to repeat

    assert "t4" not in ids(client)
    assert "t4" in ids(client, "/api/catalog?include_inactive=true")
    mochi = next(t for t in client.get("/api/templates").json() if t["id"] == "vomiting-senior-cat")
    assert "t4" not in mochi["item_ids"]
    plan = client.post("/api/plans", json={**MOCHI, "template_id": "vomiting-senior-cat"}).json()
    assert "t4" not in {i["catalog_id"] for i in plan["items"]}
    suggested = client.post("/api/suggest", json={"species": "cat", "age_years": 12, "symptoms": ["vomiting"]}).json()
    assert suggested["source"] == "template" and "t4" not in {i["catalog_id"] for i in suggested["items"]}
    assert "t4" not in claude.catalog_tool_schema("x", "y")["input_schema"]["properties"]["items"]["items"]["properties"]["catalog_id"]["enum"]
    bad = client.post("/api/plans", json={**MOCHI, "items": [{"catalog_id": "t4", "group": "soon"}]})
    assert bad.status_code == 422

    assert client.patch("/api/catalog/t4", json={"active": True}).json()["active"] is True
    assert "t4" in ids(client)
    plan = client.post("/api/plans", json={**MOCHI, "template_id": "vomiting-senior-cat"}).json()
    assert sum(i["price"] for i in plan["items"]) == 780


def test_validation(client):
    assert client.post("/api/catalog", json={"name": "X", "price": -1}).status_code == 422
    assert client.post("/api/catalog", json={"name": "   ", "price": 1}).status_code == 422
    assert client.post("/api/catalog", json={"name": "X", "price": 100_001}).status_code == 422
    assert client.post("/api/catalog", json={"name": "X", "price": 1, "explanation": {**EXPLANATION, "why": " "}}).status_code == 422
    assert client.post("/api/catalog", json={"name": "blood PANEL", "price": 1}).status_code == 409
    assert client.patch("/api/catalog/t4", json={"name": "Blood panel"}).status_code == 409
    assert client.patch("/api/catalog/nope", json={"price": 1}).status_code == 404
    assert client.delete("/api/catalog/nope").status_code == 404


def test_restore_blocked_if_name_reused(client):
    client.delete("/api/catalog/t4")
    client.post("/api/catalog", json={"name": "Thyroid test", "price": 80})
    assert client.patch("/api/catalog/t4", json={"active": True}).status_code == 409
