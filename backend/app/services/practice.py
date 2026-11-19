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
# Replies are picked from these owner-voice sentences, so they sound like a person but can only
# ever state the case's own facts. {name} is the pet, {it} the owner's phrase for a symptom.

BASICS = ("name", "species", "breed", "age", "weight")

# How an owner would say each symptom. No sex is on record, so the name stands in for he/she.
OWNER_PHRASES = {
    "vomiting": "{name} has been throwing up",
    "diarrhea": "{name} has had diarrhea",
    "not-eating": "{name} has barely been eating",
    "weight-loss": "{name} seems to be losing weight",
    "lethargy": "{name} has been really tired, just no energy",
    "drinking-more": "{name} is drinking way more water than usual",
    "urinating-more": "{name} is peeing a lot more than usual",
    "straining-to-urinate": "{name} keeps straining to pee",
    "blood-in-urine": "I've seen blood in {name}'s pee",
    "coughing": "{name} has been coughing",
    "sneezing": "{name} keeps sneezing, and there's a runny nose",
    "breathing-trouble": "{name} seems to be struggling to breathe",
    "limping": "{name} has been limping",
    "pain": "{name} seems to be in pain",
    "swelling": "I noticed some swelling on {name}",
    "itching": "{name} won't stop scratching",
    "hair-loss": "{name} has been losing fur in places",
    "ear-scratching": "{name} keeps scratching at the ears and shaking that head",
    "eye-discharge": "there's been gunk coming out of {name}'s eyes",
    "squinting": "{name} has been squinting a lot",
    "bad-breath": "{name}'s breath smells really bad",
    "lump": "I found a lump on {name}",
    "wound": "{name} has a wound",
    "seizure": "{name} had what looked like a seizure",
    "ate-something": "I think {name} ate something that wasn't food",
}

REASON = [
    "Well, {it}, and that's what got me worried.",
    "Mostly because {it}. It's just not like {name}.",
    "Honestly, {it}, so I figured we'd better come in.",
]
REASON_WELLNESS = [
    "Just a routine checkup for {name}. Nothing's wrong as far as I know.",
    "We're just here for {name}'s regular checkup.",
]
YES = ["Yes, actually, {it}.", "Now that you mention it, yes. {It}.", "Yeah, {it}."]
NO_ONE = ["Hmm, no, I haven't noticed anything like that.", "No, not that I've seen.", "No, nothing like that."]
NO_SOME = "But no {label}, as far as I can tell."
ELSE_YES = ["Oh, and {it} too.", "Hmm, let me think... {it}, actually.", "Come to think of it, {it}."]
ELSE_NO = ["No, I think that's everything.", "That's all I can think of, really.", "No, that's about it."]
UNKNOWNS = [
    "Hmm, I'm not really sure. Nothing out of the ordinary that I've noticed.",
    "I don't know, honestly. I haven't noticed anything unusual.",
    "Sorry, I couldn't tell you. Nothing's seemed out of the ordinary.",
]

_rng = random.Random()


def _say(options: list[str] | str, case: dict, symptom: str | None = None) -> str:
    name = pet_name(case["case_id"])
    text = _rng.choice(options) if isinstance(options, list) else options
    it = OWNER_PHRASES.get(symptom or "", "{name} hasn't been right").format(name=name)
    label = symptom_label(symptom).lower() if symptom else ""
    out = text.format(name=name, it=it, It=it[:1].upper() + it[1:], label=label)
    return out[:1].upper() + out[1:]


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
        return f"{name}'s a {noun(case['species'])}."
    if field == "breed":
        return f"{name}'s a {case['breed']}." if case.get("breed") else "I honestly don't know the breed."
    if field == "age":
        return f"{name} is {_age(case['age_years'])}." if case.get("age_years") else "I'm not sure how old, to be honest."
    if field == "weight":
        w = case.get("weight_lbs")
        return f"Last time we checked, about {w:g} pounds." if w else "I don't know the weight, sorry."
    return _say(UNKNOWNS, case)


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
        parts.append(_say(REASON_WELLNESS, case) if main == "wellness" else _say(REASON, case, main))
        reveal(main)

    yes = [s for s in asked if s in case_symptoms and s not in revealed]
    # "Vaccinated?" maps to wellness, but vaccine history isn't on record: not sure, not "no".
    no = [s for s in asked if s not in case_symptoms and s != "wellness"]
    for s in yes:
        parts.append(_say(REASON_WELLNESS, case) if s == "wellness" else _say(YES, case, s))
        reveal(s)
    if no and not parts:
        parts.append(_say(NO_ONE, case) if len(no) == 1 else "No, none of that.")
    else:
        parts.extend(_say(NO_SOME, case, s) for s in no)

    if parsed.get("anything_else") is True:
        told = set(known) | set(revealed)
        rest = [s for s in case_symptoms if s not in told and s != "wellness"]
        if rest:
            parts.append(_say(ELSE_YES, case, rest[0]))
            reveal(rest[0])
        else:
            parts.append(_say(ELSE_NO, case))

    for field in ids("basics"):
        if field in BASICS:
            parts.append(_basic_answer(case, field))

    if not parts:
        parts.append(_say(UNKNOWNS, case))
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
