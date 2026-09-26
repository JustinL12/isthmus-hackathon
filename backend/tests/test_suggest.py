import pytest

from app.models import ItemChoice
from app.services import claude, databricks

REQ = {"species": "cat", "age_years": 12, "symptoms": ["vomiting", "not-eating"]}

CASES = [
    [{"catalog_id": "exam", "group": "essential"}, {"catalog_id": "blood-panel", "group": "essential"}],
    [{"catalog_id": "exam", "group": "essential"}, {"catalog_id": "blood-panel", "group": "soon"},
     {"catalog_id": "blood-panel", "group": "essential"}],  # duplicate in one case counts once
    [{"catalog_id": "exam", "group": "essential"}, {"catalog_id": "t4", "group": "optional"}],
    [{"catalog_id": "exam", "group": "essential"}, {"catalog_id": "not-in-catalog", "group": "soon"}],
]


@pytest.fixture
def dbx_on(monkeypatch):
    monkeypatch.setattr(databricks, "is_configured", lambda: True)
    monkeypatch.setattr(databricks, "similar_cases", lambda *a, **k: databricks.aggregate(CASES))


def test_aggregate():
    stats = {s.catalog_id: s for s in databricks.aggregate(CASES).items}
    assert stats["exam"].count == 4 and stats["blood-panel"].count == 2
    assert stats["blood-panel"].group == "essential" and "not-in-catalog" not in stats


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
