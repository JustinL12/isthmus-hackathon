import asyncio
from collections import Counter

import pytest

from app import store
from app.models import ItemChoice, Pet, Plan, PlanItem, SuggestRequest, Template
from app.services import claude, databricks, template_gen, templates
from app.services.databricks import CaseRecord, Cluster

from .conftest import MOCHI

SENIOR_CAT = {"species": "cat", "age_years": 12, "breed": "Domestic Shorthair", "weight_lbs": 9.5, "symptoms": ["vomiting"]}


def ranked(req: dict, usage: Counter | None = None):
    return templates.rank(SuggestRequest(**req), usage)


# ---- Similar cases and export use the patient profile ----


def test_similar_cases_scores_breed_and_weight_only_when_given(monkeypatch):
    queries = []
    monkeypatch.setattr(databricks, "run", lambda q: queries.append(q) or [])
    databricks.similar_cases("cat", 12, ["vomiting"])
    databricks.similar_cases("cat", 12, ["vomiting"], breed="Siamese", weight_lbs=9.5)
    databricks.similar_cases("cat", 12, ["vomiting"], breed="Mixed breed")
    assert "weight_lbs -" not in queries[0] and "lower(breed)" not in queries[0]
    assert "abs(weight_lbs - 9.5)" in queries[1] and "lower(breed) = 'siamese'" in queries[1]
    assert "lower(breed)" not in queries[2]  # "Mixed" says nothing about the pet


def test_similar_cases_escapes_breed(monkeypatch):
    queries = []
    monkeypatch.setattr(databricks, "run", lambda q: queries.append(q) or [])
    databricks.similar_cases("dog", 3, ["limping"], breed="O'Brien's hound")
    assert "'o\\'brien\\'s hound'" in queries[0]


def test_profile_summary():
    cases = [
        CaseRecord([], age_years=9, breed="Siamese", weight_lbs=8),
        CaseRecord([], age_years=15, breed="Siamese", weight_lbs=12),
        CaseRecord([], breed="Mixed breed"),
    ]
    assert databricks.describe_profile(cases) == "ages 9-15; 8-12 lbs; mostly Siamese (2)"


def test_export_includes_patient_and_template(monkeypatch):
    queries = []
    monkeypatch.setattr(databricks, "is_configured", lambda: True)
    monkeypatch.setattr(databricks, "run", queries.append)
    plan = Plan(
        id="p1", owner_name="Alex", template_id="vomiting-senior-cat", symptoms=["vomiting"],
        pet=Pet(name="Mochi", species="cat", age_years=12, breed="  Domestic   Shorthair ", weight_lbs=9.5),
        items=[PlanItem(id="i1", catalog_id="exam", name="Exam", price=75, group="essential")],
    )
    databricks.export_agreed_plan(plan)
    q = queries[0]
    assert "breed, weight_lbs" in q and "template_id" in q
    assert "'Domestic Shorthair', 9.5" in q and "'vomiting-senior-cat'" in q


# ---- Plans remember the starting template ----


def test_plans_record_starting_template(client):
    by_template = client.post("/api/plans", json={**MOCHI, "template_id": "vomiting-senior-cat"}).json()
    by_ai = client.post("/api/plans", json={**MOCHI, "items": [{"catalog_id": "exam", "group": "essential"}]}).json()
    blank = client.post("/api/plans", json={**MOCHI, "items": []}).json()
    assert [p["template_id"] for p in (by_template, by_ai, blank)] == ["vomiting-senior-cat", "ai", "blank"]


def test_pet_profile_round_trips(client):
    pet = {**MOCHI["pet"], "breed": "Siamese", "weight_lbs": 9.5}
    plan = client.post("/api/plans", json={**MOCHI, "pet": pet, "template_id": "vomiting-senior-cat"}).json()
    assert (plan["pet"]["breed"], plan["pet"]["weight_lbs"]) == ("Siamese", 9.5)
    bad = client.post("/api/plans", json={**MOCHI, "pet": {**pet, "weight_lbs": -1}, "template_id": "vomiting-senior-cat"})
    assert bad.status_code == 422


def ai_template(**kw) -> Template:
    base = dict(
        id="ai-cat-senior-vomiting", name="Senior cat: vomiting", species="cat", item_ids=["exam", "t4"],
        symptoms=["vomiting"], groups={"exam": "essential", "t4": "essential"}, origin="ai", based_on=20, age_min=8,
    )
    return Template(**{**base, **kw})


def test_template_groups_used_for_plans_and_catalog(client):
    store.save_template(ai_template())
    plan = client.post("/api/plans", json={**MOCHI, "template_id": "ai-cat-senior-vomiting"}).json()
    assert {i["catalog_id"]: i["group"] for i in plan["items"]} == {"exam": "essential", "t4": "essential"}
    t4 = next(c for c in client.get("/api/catalog").json() if c["id"] == "t4")
    assert t4["default_group"]["ai-cat-senior-vomiting"] == "essential"


# ---- Ranking ----


def test_rank_senior_cat():
    r = ranked(SENIOR_CAT)
    assert r[0].template_id == "vomiting-senior-cat"
    assert r[0].reasons == ["Matches 1 symptom", "Fits age 8+ yrs"]


def test_rank_penalizes_age_misfit():
    senior = ranked(SENIOR_CAT)[0].score
    kitten = ranked({**SENIOR_CAT, "age_years": 0.5})[0].score
    assert kitten < senior


def test_rank_weight_and_breed():
    store.save_template(Template(
        id="big-dog-limp", name="Large dog limping", species="dog", item_ids=["exam"], symptoms=["limping"],
        weight_min_lbs=55, breeds=["Labrador Retriever"],
    ))
    lab = {"species": "dog", "age_years": 6, "breed": "labrador retriever", "weight_lbs": 80, "symptoms": ["limping"]}
    chihuahua = {**lab, "breed": "Chihuahua", "weight_lbs": 6}
    assert ranked(lab)[0].template_id == "big-dog-limp"
    assert "Made for labrador retriever" in ranked(lab)[0].reasons
    assert ranked(chihuahua)[0].template_id == "limping-dog"


def test_rank_misfit_drops_below_general_template():
    store.save_template(ai_template(
        id="ai-dog-adult-large-limping", species="dog", symptoms=["limping"], age_min=2, age_max=8, weight_min_lbs=55,
    ))
    chihuahua = {"species": "dog", "age_years": 6, "weight_lbs": 6, "symptoms": ["limping"]}
    lab = {**chihuahua, "weight_lbs": 80}
    assert ranked(chihuahua)[0].template_id == "limping-dog"
    assert ranked(lab)[0].template_id == "ai-dog-adult-large-limping"


def test_rank_uses_vet_experience():
    req = {"species": "dog", "age_years": 5, "symptoms": []}
    assert ranked(req)[0].template_id == "annual-wellness"  # only one with an age range that fits
    top = ranked(req, Counter({"diarrhea-dog": 3}))[0]
    assert top.template_id == "diarrhea-dog" and "Picked for 3 similar visits" in top.reasons


def test_rank_endpoint(client, monkeypatch):
    r = client.post("/api/templates/rank", json=SENIOR_CAT).json()
    assert [x["template_id"] for x in r] == ["vomiting-senior-cat"]  # the only cat template

    monkeypatch.setattr(databricks, "is_configured", lambda: True)
    monkeypatch.setattr(databricks, "template_usage", lambda *a: Counter({"diarrhea-dog": 4}))
    r = client.post("/api/templates/rank", json={"species": "dog", "symptoms": ["made-up"]}).json()
    assert r[0]["template_id"] == "diarrhea-dog"


def test_rank_survives_databricks_error(client, monkeypatch):
    monkeypatch.setattr(databricks, "is_configured", lambda: True)

    def boom(*a):
        raise RuntimeError("warehouse down")

    monkeypatch.setattr(databricks, "template_usage", boom)
    assert client.post("/api/templates/rank", json=SENIOR_CAT).status_code == 200


def test_hide_only_ai_templates(client):
    store.save_template(ai_template())
    assert client.delete("/api/templates/vomiting-senior-cat").status_code == 403
    assert client.delete("/api/templates/nope").status_code == 404
    assert client.delete("/api/templates/ai-cat-senior-vomiting").json()["active"] is False
    assert "ai-cat-senior-vomiting" not in {t["id"] for t in client.get("/api/templates").json()}


# ---- AI-made templates ----

DOG_LIMP = Cluster("dog", "adult", "large", "limping", support=30, real_count=4)
CAT_VOMIT = Cluster("cat", "senior", "any", "vomiting", support=40, real_count=0)  # covered by vomiting-senior-cat


@pytest.fixture
def gen_stubs(monkeypatch):
    drafted = []
    monkeypatch.setattr(databricks, "clusters", lambda *a, **k: [CAT_VOMIT, DOG_LIMP])
    monkeypatch.setattr(databricks, "cluster_cases", lambda c, k=40: [
        CaseRecord([{"catalog_id": "exam", "group": "essential"}, {"catalog_id": "xrays-limb", "group": "essential"}],
                   age_years=5, breed="Labrador Retriever", weight_lbs=75, symptoms=["limping", "pain"]),
    ])

    async def draft(patients, symptom, similar, co):
        drafted.append((patients, symptom, similar.profile, co))
        return {
            "name": "Large dog: limping", "summary": "Adult large-breed dogs that are lame.",
            "symptoms": ["limping", "pain"],
            "items": [ItemChoice(catalog_id="exam", group="essential"), ItemChoice(catalog_id="xrays-limb", group="soon")],
        }

    monkeypatch.setattr(claude, "draft_template", draft)
    return drafted


def test_generate_makes_template_for_uncovered_cluster(gen_stubs):
    made = asyncio.run(template_gen.generate())
    assert [t.id for t in made] == ["ai-dog-adult-large-limping"]  # the cat group is covered already
    t = store.templates()["ai-dog-adult-large-limping"]
    assert (t.origin, t.based_on, t.age_min, t.age_max, t.weight_min_lbs, t.weight_max_lbs) == ("ai", 22, 2.0, 8.0, 55.0, None)
    assert t.groups == {"exam": "essential", "xrays-limb": "soon"} and t.symptoms == ["limping", "pain"]
    patients, symptom, profile, co = gen_stubs[0]
    assert patients == "adult large dogs (2-8 yrs, 55+ lbs)" and symptom == "limping" and co["pain"] == 1
    assert "Labrador Retriever" in profile


def test_generate_is_idempotent_and_respects_hidden(gen_stubs, client):
    asyncio.run(template_gen.generate())
    assert asyncio.run(template_gen.generate()) == []  # covered by the one it made
    client.delete("/api/templates/ai-dog-adult-large-limping")
    assert asyncio.run(template_gen.generate()) == []  # hidden by a vet: not made again
    assert len(gen_stubs) == 1


def test_learn_from_visit_needs_real_visits(gen_stubs, monkeypatch):
    monkeypatch.setattr(databricks, "is_configured", lambda: True)
    monkeypatch.setattr(claude, "is_configured", lambda: True)
    pet = Pet(name="Rex", species="dog", age_years=5, weight_lbs=80)
    asyncio.run(template_gen.learn_from_visit(Plan(id="p", pet=pet, owner_name="Sam", symptoms=["limping"])))
    assert "ai-dog-adult-large-limping" in store.templates()

    store.reset_memory()
    monkeypatch.setattr(databricks, "clusters", lambda *a, **k: [Cluster("dog", "adult", "large", "limping", 30, 2)])
    asyncio.run(template_gen.learn_from_visit(Plan(id="p", pet=pet, owner_name="Sam", symptoms=["limping"])))
    assert "ai-dog-adult-large-limping" not in store.templates()  # only 2 real visits so far


def test_learn_from_visit_matches_the_pets_band(gen_stubs, monkeypatch):
    monkeypatch.setattr(databricks, "is_configured", lambda: True)
    monkeypatch.setattr(claude, "is_configured", lambda: True)
    small = Pet(name="Bit", species="dog", age_years=5, weight_lbs=8)  # toy, not large
    asyncio.run(template_gen.learn_from_visit(Plan(id="p", pet=small, owner_name="Sam", symptoms=["limping"])))
    assert gen_stubs == []
