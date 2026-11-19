"""Vet student practice: a stored case becomes a game.

The student starts with the basics (name, species, breed, age, weight), asks the owner questions,
runs tests (which go on the bill) and builds a plan. The plan is then scored against the case.

Everything the owner says and every test result comes from the stored case (symptom tags and
basics) through fixed phrases. The AI in owner_ai.py only decides which facts a question is about;
it never writes the reply, so it can't make anything up.
"""

import hashlib
import json
import random
from functools import cache

from .. import store
from ..models import (
    AskResponse,
    CategoryScore,
    GradedItem,
    GradeRequest,
    GradeResponse,
    PracticeCase,
    TestResponse,
)
from ..species import noun

ESSENTIAL_TARGET = 0.95  # coverage of the case's essential items that earns full marks
SOON_TARGET = 0.75
ESSENTIAL_WEIGHT = 0.7  # the rest goes to "soon"
EXTRA_PENALTY = 3  # points off per item that isn't in the case at all
MAX_PENALTY = 15

NOTHING = "Nothing out of the ordinary that I've noticed."
UNKNOWN = "I'm not sure, sorry. Nothing out of the ordinary that I've noticed."


@cache
def cases() -> dict[str, dict]:
    path = store.DATA_DIR / "synthetic_cases.jsonl"
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return {r["case_id"]: r for r in rows if r.get("symptoms") and r.get("items")}


@cache
def _data() -> dict:
    return store.load_json("practice.json")


def tests() -> dict[str, dict[str, str]]:
    """Runnable tests (active catalog items only): catalog id -> {symptom id: finding}."""
    catalog = store.catalog()
    return {k: v for k, v in _data()["tests"].items() if k in catalog}


def get_case(case_id: str) -> dict | None:
    return cases().get(case_id)


def pet_name(case_id: str) -> str:
    """A generic name, fixed per case so every call agrees on it."""
    names = _data()["pet_names"]
    return names[int(hashlib.sha256(case_id.encode()).hexdigest(), 16) % len(names)]


def random_case(exclude: str | None = None) -> dict:
    pool = [c for cid, c in cases().items() if cid != exclude]
    return random.choice(pool)


def public_case(case: dict) -> PracticeCase:
    return PracticeCase(
        case_id=case["case_id"],
        name=pet_name(case["case_id"]),
        species=case["species"],
        breed=case.get("breed"),
        age_years=case.get("age_years"),
        weight_lbs=case.get("weight_lbs"),
        tests=list(tests()),
    )


def symptom_label(symptom_id: str) -> str:
    s = store.symptoms().get(symptom_id)
    return s.label if s else symptom_id.replace("-", " ")


# ---- Tests ----


def run_test(case: dict, catalog_id: str) -> TestResponse | None:
    test = tests().get(catalog_id)
    if test is None:
        return None
    item = store.catalog()[catalog_id]
    revealed = [s for s in case["symptoms"] if s in test]
    return TestResponse(
        catalog_id=catalog_id,
        name=item.name,
        price=item.price,
        findings=[test[s] for s in revealed],
        revealed=revealed,
    )


# ---- Owner answers ----

BASICS = ("name", "species", "breed", "age", "weight")


def _age(years: float) -> str:
    if years < 1:
        months = max(1, round(years * 12))
        return f"{months} month{'s' if months != 1 else ''} old"
    return f"{years:g} year{'s' if years != 1 else ''} old"


def _basic_answer(case: dict, field: str) -> str:
    name = pet_name(case["case_id"])
    if field == "name":
        return f"This is {name}."
    if field == "species":
        return f"{name} is a {noun(case['species'])}."
    if field == "breed":
        return f"{name} is a {case['breed']}." if case.get("breed") else "I don't know the breed."
    if field == "age":
        return f"{name} is {_age(case['age_years'])}." if case.get("age_years") else "I'm not sure how old."
    if field == "weight":
        w = case.get("weight_lbs")
        return f"Last time we weighed, about {w:g} lbs." if w else "I don't know the weight."
    return UNKNOWN


def compose_answer(case: dict, parsed: dict, known: list[str]) -> AskResponse:
    """Build the owner's reply from the facts a question is about. Only the case's own
    symptom tags and basics are ever stated; everything else is 'nothing / not sure'."""
    case_symptoms: list[str] = case["symptoms"]
    def ids(key: str) -> list[str]:
        v = parsed.get(key)
        return list(dict.fromkeys(x for x in v if isinstance(x, str))) if isinstance(v, list) else []

    asked = [s for s in ids("symptoms") if s in store.symptoms()]
    parts: list[str] = []
    revealed: list[str] = []

    def reveal(s: str) -> None:
        if s not in revealed:
            revealed.append(s)

    if parsed.get("reason") is True:
        main = case_symptoms[0]
        if main == "wellness":
            parts.append("We're just here for a routine checkup.")
        else:
            parts.append(f"I brought {pet_name(case['case_id'])} in because of this: {symptom_label(main).lower()}.")
        reveal(main)

    for s in asked:
        if s in case_symptoms:
            if s == "wellness":
                parts.append("Yes, it's a routine checkup.")
            else:
                parts.append(f"Yes, I've noticed that: {symptom_label(s).lower()}.")
            reveal(s)
        elif s != "wellness":  # "vaccinated?" etc. is history the case doesn't record: not sure, not "no"
            parts.append(f"{symptom_label(s)}? No, nothing like that.")

    if parsed.get("anything_else") is True:
        told = set(known) | set(revealed)
        rest = [s for s in case_symptoms if s not in told and s != "wellness"]
        if rest:
            parts.append(f"Now that you ask, also this: {symptom_label(rest[0]).lower()}.")
            reveal(rest[0])
        else:
            parts.append("No, that's everything I've noticed.")

    for field in ids("basics"):
        if field in BASICS:
            parts.append(_basic_answer(case, field))

    if not parts:
        parts.append(UNKNOWN)
    return AskResponse(answer=" ".join(parts), revealed=revealed)


# ---- Grading ----


def _category(credits: list[float], target: float) -> CategoryScore:
    total = len(credits)
    credit = sum(credits)
    return CategoryScore(total=total, credit=credit, coverage=credit / total if total else 1.0, target=target)


def grade(case: dict, req: GradeRequest) -> GradeResponse:
    catalog = store.all_catalog()
    expected = {}
    for it in case["items"]:
        if it["catalog_id"] in catalog:
            expected.setdefault(it["catalog_id"], it["group"])

    chosen: dict[str, str] = {}  # catalog id -> "test" or the plan group
    for cid in req.tests:
        if cid in catalog:
            chosen[cid] = "test"
    for it in req.plan:
        if it.catalog_id in catalog:
            chosen.setdefault(it.catalog_id, it.group)  # a test run already covers it

    def credit(cid: str, group: str) -> float:
        got = chosen.get(cid)
        if got is None:
            return 0.0
        return 1.0 if got in ("test", group) else 0.5  # a test was done today: right for any group

    essential = _category([credit(c, g) for c, g in expected.items() if g == "essential"], ESSENTIAL_TARGET)
    soon = _category([credit(c, g) for c, g in expected.items() if g == "soon"], SOON_TARGET)

    def part(cat: CategoryScore) -> float:
        return min(1.0, cat.coverage / cat.target)

    if essential.total and soon.total:
        base = 100 * (ESSENTIAL_WEIGHT * part(essential) + (1 - ESSENTIAL_WEIGHT) * part(soon))
    elif essential.total or soon.total:
        base = 100 * part(essential if essential.total else soon)
    else:
        base = 100.0
    extras = [cid for cid in chosen if cid not in expected]
    penalty = min(MAX_PENALTY, EXTRA_PENALTY * len(extras))
    score = max(0, min(100, round(base) - penalty))

    order = {"essential": 0, "soon": 1, "optional": 2}
    ids = sorted(
        {*expected, *chosen},
        key=lambda c: (order.get(expected.get(c, ""), 3), catalog[c].name),
    )
    items = [
        GradedItem(
            catalog_id=c,
            name=catalog[c].name,
            price=catalog[c].price,
            expected=expected.get(c),
            chosen=chosen.get(c),
        )
        for c in ids
    ]
    return GradeResponse(
        score=score,
        essential=essential,
        soon=soon,
        penalty=penalty,
        items=items,
        symptoms=[symptom_label(s) for s in case["symptoms"]],
        student_total=sum(catalog[c].price for c in chosen),
        case_total=sum(catalog[c].price for c, g in expected.items() if g != "optional"),
    )
