"""Claude API helpers: suggestion ranking, synthetic data (scripts/), estimate parsing (stretch)."""

import os

from .. import store
from ..models import Explanation, ItemChoice, ParsedLineItem, SuggestRequest
from .databricks import SimilarCases

MODEL = "claude-sonnet-5"
GROUPS = ["essential", "soon", "optional"]


def is_configured() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def client():
    from anthropic import AsyncAnthropic

    return AsyncAnthropic(timeout=20, max_retries=1)


def catalog_tool_schema(name: str, description: str, extra_props: dict | None = None) -> dict:
    """A tool whose input is a list of catalog items with groups, limited to our catalog ids."""
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
            "properties": {"items": {"type": "array", "items": item}},
            "required": ["items"],
        },
    }


SUGGEST_SYSTEM = """You help a veterinarian draft a treatment estimate for an exam-room screen \
the pet owner also sees. Pick items only from the catalog. Group them:
- essential: needed today for safety or diagnosis
- soon: important within 1-2 weeks
- optional: nice to have
Lean on what similar past cases used, but adjust for this pet's age, species and notes. \
Keep the list focused (usually 4-9 items). Each reason is one short, plain-language \
sentence an owner can understand. The vet reviews and makes the final call."""


async def suggest_items(req: SuggestRequest, similar: SimilarCases) -> list[ItemChoice]:
    catalog, symptoms = store.catalog(), store.symptoms()
    labels = ", ".join(symptoms[s].label if s in symptoms else s for s in req.symptoms)
    history = "\n".join(
        f"- {s.catalog_id} ({catalog[s.catalog_id].name}): used in {s.count}/{similar.case_count} cases, usually '{s.group}'"
        for s in similar.items
    )
    menu = "\n".join(f"- {c.id}: {c.name} (${c.price:.0f})" for c in catalog.values())
    prompt = (
        f"Pet: {req.species}, age {req.age_years if req.age_years is not None else 'unknown'}\n"
        f"Symptoms: {labels}\n"
        f"Vet notes: {req.notes or 'none'}\n\n"
        f"What {similar.case_count} similar past cases used:\n{history}\n\n"
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
    raw = next(b.input for b in resp.content if b.type == "tool_use")["items"]

    seen, items = set(), []
    for it in raw:
        if it.get("catalog_id") in catalog and it.get("group") in GROUPS and it["catalog_id"] not in seen:
            seen.add(it["catalog_id"])
            items.append(ItemChoice(**it))
    if not items:
        raise ValueError("Claude returned no usable items")
    return items


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
