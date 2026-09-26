import pytest

from app.models import ItemChoice, Pet, Plan, PlanItem
from app.services import claude, databricks, suggest
from app.services.databricks import CaseRecord

REQ = {"species": "cat", "age_years": 12, "symptoms": ["vomiting", "not-eating"]}


def items(*pairs: tuple[str, str]) -> list[dict]:
    return [{"catalog_id": cid, "group": group} for cid, group in pairs]


EXAM = ("exam", "essential")

CASES = [
    CaseRecord(items(EXAM, ("blood-panel", "essential"))),
    CaseRecord(items(EXAM, ("blood-panel", "soon"), ("blood-panel", "essential"))),  # duplicate in one case counts once
    CaseRecord(items(EXAM, ("t4", "optional"))),
    CaseRecord(items(EXAM, ("not-in-catalog", "soon"))),
]

# Real plans: the AI drafted urinalysis each time and vets removed it 3 of 4 times; vets added t4 twice.
DRAFT = items(EXAM, ("urinalysis", "soon"))
VET_CASES = [
    CaseRecord(items(EXAM, ("t4", "essential")), DRAFT, is_real=True),
    CaseRecord(items(EXAM, ("t4", "essential")), DRAFT, is_real=True),
    CaseRecord(items(EXAM), DRAFT, is_real=True),
    CaseRecord(items(EXAM, ("urinalysis", "soon")), DRAFT, is_real=True),
    *[CaseRecord(items(EXAM, ("urinalysis", "soon"), ("t4", "optional"))) for _ in range(6)],
]


@pytest.fixture
def dbx_on(monkeypatch):
    monkeypatch.setattr(databricks, "is_configured", lambda: True)
    monkeypatch.setattr(databricks, "similar_cases", lambda *a, **k: databricks.aggregate(CASES))


def test_aggregate():
    stats = {s.catalog_id: s for s in databricks.aggregate(CASES).items}
    assert stats["exam"].count == 4 and stats["blood-panel"].count == 2
    assert stats["blood-panel"].group == "essential" and "not-in-catalog" not in stats


def test_aggregate_vet_feedback():
    similar = databricks.aggregate(VET_CASES)
    stats = {s.catalog_id: s for s in similar.items}
    assert similar.case_count == 10 and similar.vet_case_count == 4
    assert (stats["urinalysis"].suggested, stats["urinalysis"].removed, stats["urinalysis"].vet_uses) == (4, 3, 1)
    assert (stats["t4"].added, stats["t4"].vet_uses) == (2, 2)
    # t4: 6 synthetic votes for optional vs 2 real ones for essential, weighted 2x -> still optional
    assert stats["t4"].group == "optional"
    assert "removed it 3 of 4 times" in claude._history_line(stats["urinalysis"], 10, "Urinalysis")


def test_frequencies_follow_vet_feedback():
    ids = [i.catalog_id for i in suggest.from_frequencies(databricks.aggregate(VET_CASES))]
    # urinalysis is in 7/10 cases but vets keep removing it; t4 stays (8/10, and vets add it)
    assert "urinalysis" not in ids and {"exam", "t4"} <= set(ids)


def test_export_includes_ai_draft(monkeypatch):
    queries = []
    monkeypatch.setattr(databricks, "is_configured", lambda: True)
    monkeypatch.setattr(databricks, "run", queries.append)
    plan = Plan(
        id="p1", pet=Pet(name="Mochi", species="cat", age_years=12), owner_name="Alex", source="suggest",
        symptoms=["vomiting"], suggested=[ItemChoice(catalog_id="urinalysis", group="soon")],
        items=[PlanItem(id="i1", catalog_id="exam", name="Exam", price=75, group="essential")],
    )
    databricks.export_agreed_plan(plan)
    assert "suggested_json" in queries[0] and '"catalog_id": "urinalysis"' in queries[0] and "'suggest'" in queries[0]


def test_no_databricks_uses_template(client):
    r = client.post("/api/suggest", json=REQ).json()
    assert r["source"] == "template" and r["fallback_template_id"] == "vomiting-senior-cat"
    assert sum(i["price"] for i in r["items"]) == 780


def test_unknown_symptoms(client):
    assert client.post("/api/suggest", json={**REQ, "symptoms": ["made-up"]}).json()["source"] == "none"
    assert client.post("/api/suggest", json={**REQ, "species": "dog", "symptoms": ["seizure"]}).json()["source"] == "none"


def test_databricks_error_uses_template(client, monkeypatch):
    monkeypatch.setattr(databricks, "is_configured", lambda: True)

    def boom(*a, **k):
        raise RuntimeError("warehouse down")

    monkeypatch.setattr(databricks, "similar_cases", boom)
    assert client.post("/api/suggest", json=REQ).json()["source"] == "template"


def test_databricks_without_claude(client, dbx_on):
    r = client.post("/api/suggest", json=REQ).json()
    assert r["source"] == "databricks" and r["similar_case_count"] == 4
    # t4 is in 1 of 4 cases (25%), below the 30% cutoff
    assert [i["catalog_id"] for i in r["items"]] == ["exam", "blood-panel"]


def test_databricks_with_claude(client, dbx_on, monkeypatch):
    monkeypatch.setattr(claude, "is_configured", lambda: True)

    async def fake(req, similar):
        return [ItemChoice(catalog_id="exam", group="essential", reason="First step.")]

    monkeypatch.setattr(claude, "suggest_items", fake)
    r = client.post("/api/suggest", json=REQ).json()
    assert r["source"] == "databricks+claude"
    assert r["items"] == [{"catalog_id": "exam", "group": "essential", "reason": "First step.", "name": "Sick-visit exam", "price": 75.0}]


def test_claude_error_uses_frequencies(client, dbx_on, monkeypatch):
    monkeypatch.setattr(claude, "is_configured", lambda: True)

    async def boom(req, similar):
        raise RuntimeError("api down")

    monkeypatch.setattr(claude, "suggest_items", boom)
    assert client.post("/api/suggest", json=REQ).json()["source"] == "databricks"


def test_similar_cases_rejects_unsafe_input():
    with pytest.raises(ValueError):
        databricks.similar_cases("cat", 3, ["vomiting'); DROP TABLE x;--"])
