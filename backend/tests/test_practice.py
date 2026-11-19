import pytest

from app.services import owner_ai, practice

CASE = {
    "case_id": "t-1",
    "species": "cat",
    "age_years": 12.0,
    "breed": "Domestic Shorthair",
    "weight_lbs": 9.5,
    "symptoms": ["vomiting", "weight-loss", "lethargy"],
    "items": [
        {"catalog_id": "exam", "group": "essential"},
        {"catalog_id": "blood-panel", "group": "essential"},
        {"catalog_id": "antiemetic-inj", "group": "essential"},
        {"catalog_id": "urinalysis", "group": "soon"},
        {"catalog_id": "t4", "group": "soon"},
        {"catalog_id": "xrays-abd", "group": "soon"},
        {"catalog_id": "ultrasound-abd", "group": "optional"},
    ],
}


@pytest.fixture
def case(monkeypatch):
    real = practice.cases()
    monkeypatch.setattr(practice, "cases", lambda: {**real, CASE["case_id"]: CASE})
    return CASE


def grade(tests=(), plan=()):
    from app.models import GradeRequest

    return practice.grade(CASE, GradeRequest(tests=list(tests), plan=[{"catalog_id": c, "group": g} for c, g in plan]))


def test_cases_load_and_tests_are_catalog_items():
    assert len(practice.cases()) > 100
    from app import store

    assert set(practice.tests()) <= set(store.catalog())


def test_new_case_hides_answers(client):
    body = client.post("/api/practice/cases").json()
    assert {"case_id", "name", "species", "tests"} <= body.keys()
    assert "symptoms" not in body and "items" not in body
    assert body["name"] == practice.pet_name(body["case_id"])


def test_perfect_plan_scores_100():
    # 3/3 essential, 3/3 soon, nothing extra; tests count as plan items
    r = grade(tests=["exam", "blood-panel"], plan=[("antiemetic-inj", "essential"), ("urinalysis", "soon"),
                                                   ("t4", "soon"), ("xrays-abd", "soon")])
    assert r.score == 100 and r.penalty == 0


def test_soon_full_marks_at_75_percent_and_optional_ignored():
    # soon 2/3 = 67% < 75%: 0.7*1 + 0.3*(0.667/0.75) = 96.7 -> 97
    r = grade(plan=[("exam", "essential"), ("blood-panel", "essential"), ("antiemetic-inj", "essential"),
                    ("urinalysis", "soon"), ("t4", "soon"), ("ultrasound-abd", "optional")])
    assert r.score == 97 and r.penalty == 0


def test_essential_needs_95_percent():
    # 2/3 essential: 0.7*(0.667/0.95) + 0.3*1 = 79.1
    r = grade(plan=[("exam", "essential"), ("blood-panel", "essential"), ("urinalysis", "soon"),
                    ("t4", "soon"), ("xrays-abd", "soon")])
    assert r.score == 79


def test_wrong_group_half_credit():
    r = grade(plan=[("exam", "essential"), ("blood-panel", "soon"), ("antiemetic-inj", "essential")])
    assert r.essential.credit == 2.5


def test_extras_penalised_and_capped():
    perfect = [("exam", "essential"), ("blood-panel", "essential"), ("antiemetic-inj", "essential"),
               ("urinalysis", "soon"), ("t4", "soon"), ("xrays-abd", "soon")]
    assert grade(tests=["xrays-chest"], plan=perfect).score == 97
    extras = ["rabies", "dhpp", "fvrcp", "microchip", "bordetella", "fecal", "ear-meds"]
    r = grade(plan=perfect + [(c, "optional") for c in extras])
    assert r.penalty == 15 and r.score == 85


def test_test_results_only_show_case_symptoms(case):
    r = practice.run_test(case, "blood-panel")
    assert set(r.revealed) == {"weight-loss", "lethargy", "vomiting"}
    assert practice.run_test(case, "urinalysis").findings == []  # no urinary symptoms in this case
    assert practice.run_test(case, "rabies") is None  # not a test


def test_test_endpoint(client, case):
    assert client.post("/api/practice/cases/t-1/tests", json={"catalog_id": "exam"}).status_code == 200
    assert client.post("/api/practice/cases/t-1/tests", json={"catalog_id": "rabies"}).status_code == 422
    assert client.post("/api/practice/cases/nope/tests", json={"catalog_id": "exam"}).status_code == 404


UNSURE = ["not really sure", "don't know", "couldn't tell"]


@pytest.mark.parametrize(
    "question, revealed, phrases",
    [
        ("Why did you bring them in today?", ["vomiting"], ["throwing up"]),
        ("Is she throwing up?", ["vomiting"], ["throwing up"]),
        ("Any coughing?", [], ["no"]),
        ("What do you feed at home?", [], UNSURE),
        ("Has she been vaccinated?", [], UNSURE),
        ("How old is the cat?", [], ["12 years old"]),
    ],
)
def test_ask_keyword_fallback(client, case, question, revealed, phrases):
    for _ in range(6):  # each reply is picked from several wordings
        r = client.post("/api/practice/cases/t-1/ask", json={"question": question}).json()
        assert r["revealed"] == revealed
        assert any(p in r["answer"].lower() for p in phrases), r["answer"]


def test_every_symptom_has_an_owner_phrase():
    from app import store

    assert set(store.symptoms()) - {"wellness"} <= set(practice.OWNER_PHRASES)


def test_anything_else_reveals_one_new_symptom(client, case):
    r = client.post("/api/practice/cases/t-1/ask", json={"question": "Anything else?", "known": ["vomiting"]}).json()
    assert r["revealed"] == ["weight-loss"]
    r = client.post("/api/practice/cases/t-1/ask",
                    json={"question": "Anything else?", "known": ["vomiting", "weight-loss", "lethargy"]}).json()
    assert r["revealed"] == [] and "tired" not in r["answer"]


def test_ai_cannot_add_facts(client, case, monkeypatch):
    """Whatever the classifier says, only the case's own symptoms are confirmed."""
    monkeypatch.setattr(owner_ai, "is_configured", lambda: True)

    async def fake(_q):
        return {"symptoms": ["seizure", "vomiting", "made-up"], "reason": "yes", "anything_else": False,
                "basics": "age"}

    monkeypatch.setattr(owner_ai, "_gemini", fake)
    r = client.post("/api/practice/cases/t-1/ask", json={"question": "seizures or vomiting?"}).json()
    assert r["revealed"] == ["vomiting"]
    assert "no seizure" in r["answer"] and "made-up" not in r["answer"] and "years old" not in r["answer"]


def test_gemini_failure_falls_back(client, case, monkeypatch):
    monkeypatch.setattr(owner_ai, "is_configured", lambda: True)

    async def boom(_q):
        raise RuntimeError("down")

    monkeypatch.setattr(owner_ai, "_gemini", boom)
    r = client.post("/api/practice/cases/t-1/ask", json={"question": "Is she vomiting?"}).json()
    assert r["revealed"] == ["vomiting"]


def test_grade_endpoint(client, case):
    r = client.post("/api/practice/cases/t-1/grade",
                    json={"tests": ["exam"], "plan": [{"catalog_id": "blood-panel", "group": "essential"}]}).json()
    assert 0 <= r["score"] <= 100 and r["symptoms"]
    assert {i["catalog_id"] for i in r["items"]} >= {"exam", "ultrasound-abd"}
