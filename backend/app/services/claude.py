"""Claude API helpers: suggestion ranking, AI-made templates, synthetic data (scripts/), estimate parsing (stretch)."""

import json
import os
from collections import Counter

from .. import store
from ..models import Explanation, ItemChoice, ParsedLineItem, SuggestRequest
from ..species import noun
from .databricks import ItemStat, SimilarCases

MODEL = "claude-sonnet-5"
GROUPS = ["essential", "soon", "optional"]


def is_configured() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def client():
    from anthropic import AsyncAnthropic

    return AsyncAnthropic(timeout=20, max_retries=1)


def catalog_tool_schema(
    name: str, description: str, extra_props: dict | None = None, top_props: dict | None = None
) -> dict:
    """A tool whose input is a list of catalog items with groups, limited to our catalog ids.
    `extra_props` are extra per-item fields; `top_props` are extra fields beside the list (all required)."""
    item = {
        "type": "object",
        "properties": {
            "catalog_id": {"type": "string", "enum": sorted(store.catalog())},
            "group": {"type": "string", "enum": GROUPS},
            **(extra_props or {}),
        },
        "required": ["catalog_id", "group", *(extra_props or {})],
    }
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": {**(top_props or {}), "items": {"type": "array", "items": item}},
            "required": [*(top_props or {}), "items"],
        },
    }


SUGGEST_SYSTEM = """You help a veterinarian draft a treatment estimate for an exam-room screen \
the pet owner also sees. Pick items only from the catalog. Group them:
- essential: needed today for safety or diagnosis
- soon: important within 1-2 weeks
- optional: nice to have
Lean on what similar past cases used, but adjust for this pet's species, age, breed, weight \
and notes: breed predispositions, size (e.g. large-breed joint risk, brachycephalic airways), \
weight-based dosing and life stage. Corrections from this clinic's vets outrank the rest of the \
history: drop items they usually remove from drafts, include items they usually add. Keep the \
list focused (usually 4-9 items). Each reason is one short, plain-language sentence an owner \
can understand. The vet reviews and makes the final call."""


def describe_pet(species: str, age_years: float | None, breed: str | None, weight_lbs: float | None) -> str:
    """e.g. "cat, Domestic Shorthair, 12 years, 9.5 lbs" (unknown breed and weight left out)."""
    parts = [
        noun(species),  # "guinea pig", not the id "guinea-pig"
        breed.strip() if breed else None,
        f"{age_years:g} years" if age_years is not None else "age unknown",
        f"{weight_lbs:g} lbs" if weight_lbs is not None else None,
    ]
    return ", ".join(p for p in parts if p)


def _history_line(s: ItemStat, case_count: int, name: str) -> str:
    line = f"- {s.catalog_id} ({name}): used in {s.count}/{case_count} cases, usually '{s.group}'"
    feedback = []
    if s.suggested:
        feedback.append(f"vets removed it {s.removed} of {s.suggested} times it was drafted")
    if s.added:
        feedback.append(f"vets added it to a draft {s.added} time{'s' if s.added != 1 else ''}")
    return line + (f"; {'; '.join(feedback)}" if feedback else "")


def _as_list(x) -> list:
    """A tool-input list; now and then Claude sends it (or its entries) JSON-encoded as a string."""
    if isinstance(x, str):
        try:
            x = json.loads(x)
        except ValueError:
            return []
    return x if isinstance(x, list) else []


def _usable_items(raw) -> list[ItemChoice]:
    """Claude's items that are in the catalog with a valid group, without repeats."""
    catalog, seen, items = store.catalog(), set(), []
    for it in _as_list(raw):
        if isinstance(it, str):
            try:
                it = json.loads(it)
            except ValueError:
                continue
        if not isinstance(it, dict):
            continue
        if it.get("catalog_id") in catalog and it.get("group") in GROUPS and it["catalog_id"] not in seen:
            seen.add(it["catalog_id"])
            items.append(ItemChoice(catalog_id=it["catalog_id"], group=it["group"], reason=it.get("reason")))
    return items


def _history_and_menu(similar: SimilarCases) -> tuple[str, str]:
    catalog = store.catalog()
    history = "\n".join(_history_line(s, similar.case_count, catalog[s.catalog_id].name) for s in similar.items)
    menu = "\n".join(f"- {c.id}: {c.name} (${c.price:.0f})" for c in catalog.values())
    return history, menu


async def suggest_items(req: SuggestRequest, similar: SimilarCases) -> list[ItemChoice]:
    symptoms = store.symptoms()
    labels = ", ".join(symptoms[s].label if s in symptoms else s for s in req.symptoms)
    history, menu = _history_and_menu(similar)
    prompt = (
        f"Pet: {describe_pet(req.species, req.age_years, req.breed, req.weight_lbs)}\n"
        f"Symptoms: {labels}\n"
        f"Vet notes: {req.notes or 'none'}\n\n"
        f"What {similar.case_count} similar past cases used ({similar.vet_case_count} are real plans "
        f"from this clinic's vets; {similar.profile or 'no age, breed or weight on record'}):\n{history}\n\n"
        f"Catalog:\n{menu}"
    )
    tool = catalog_tool_schema(
        "draft_plan",
        "Return the suggested items for this visit.",
        {"reason": {"type": "string", "description": "One plain-language sentence for the owner."}},
    )
    resp = await client().messages.create(
        model=MODEL,
        max_tokens=2000,
        system=SUGGEST_SYSTEM,
        tools=[tool],
        tool_choice={"type": "tool", "name": "draft_plan"},
        messages=[{"role": "user", "content": prompt}],
    )
    items = _usable_items(next(b.input for b in resp.content if b.type == "tool_use").get("items"))
    if not items:
        raise ValueError("Claude returned no usable items")
    return items


TEMPLATE_SYSTEM = """You turn a veterinary clinic's past visits into a reusable visit template: \
the starting item list a vet picks for a common kind of visit, then adjusts. Pick items only \
from the catalog, usually 4-9: what these visits most often used, following the clinic vets' \
corrections (leave out items they usually remove from AI drafts, include items they add). \
Group them:
- essential: needed today for safety or diagnosis
- soon: important within 1-2 weeks
- optional: nice to have
name: at most 40 characters, saying who and what, e.g. "Senior cat: vomiting & weight loss" \
or "Large dog: limping". symptoms: the 2-5 symptom ids the template is for, the main one first. \
summary: one sentence for vets on which patients it suits."""


async def draft_template(patients: str, main_symptom: str, similar: SimilarCases, co_symptoms: Counter[str]) -> dict:
    """Name, summary, symptoms and grouped items for a new template made from a group of past visits."""
    symptoms = store.symptoms()

    def label(s: str) -> str:
        return symptoms[s].label if s in symptoms else s

    seen_with = ", ".join(f"{label(s)} [{s}] ({n})" for s, n in co_symptoms.most_common(8))
    history, menu = _history_and_menu(similar)
    prompt = (
        f"Patients: {patients}\n"
        f"Main symptom: {label(main_symptom)} [{main_symptom}]\n"
        f"Symptoms seen in these visits (count): {seen_with}\n"
        f"Who they were: {similar.profile or 'unknown'}\n\n"
        f"What these {similar.case_count} past visits used ({similar.vet_case_count} are real plans "
        f"from this clinic's vets):\n{history}\n\n"
        f"Catalog:\n{menu}"
    )
    tool = catalog_tool_schema(
        "save_template",
        "Save the new visit template.",
        top_props={
            "name": {"type": "string"},
            "summary": {"type": "string"},
            "symptoms": {"type": "array", "items": {"type": "string", "enum": sorted(symptoms)}},
        },
    )
    resp = await client().messages.create(
        model=MODEL,
        max_tokens=2000,
        system=TEMPLATE_SYSTEM,
        tools=[tool],
        tool_choice={"type": "tool", "name": "save_template"},
        messages=[{"role": "user", "content": prompt}],
    )
    out = next(b.input for b in resp.content if b.type == "tool_use")
    items = _usable_items(out.get("items", []))
    name = " ".join(str(out.get("name", "")).split())
    if not items or not name:
        raise ValueError("Claude returned no usable template")
    others = [s for s in dict.fromkeys(_as_list(out.get("symptoms"))) if s in symptoms and s != main_symptom]
    return {
        "name": name[:60],
        "summary": " ".join(str(out.get("summary", "")).split())[:300] or None,
        "symptoms": [main_symptom, *others][:5],
        "items": items,
    }


async def parse_estimate(file_bytes: bytes, media_type: str) -> list[ParsedLineItem]:
    """Read an estimate PDF/photo and return its line items as JSON."""
    # TODO (stretch): send the file as a document/image block, ask for
    # [{"raw_name": str, "price": float}] via a tool, then run each
    # through services.matching.match_catalog_id.
    raise NotImplementedError


async def draft_explanation(item_name: str) -> Explanation:
    """Draft an explanation for an item missing from the library (vet must review)."""
    # TODO (stretch)
    raise NotImplementedError
