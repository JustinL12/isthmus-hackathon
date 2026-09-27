"""Symptom -> suggested items, with the fallback chain:

1. Databricks similar cases + Claude picks and explains  (source "databricks+claude")
2. Claude down: most-used items from similar cases       (source "databricks")
3. Databricks down / no matches: best-matching template  (source "template")
4. No template for this species/symptoms either           (source "none")
"""

import asyncio
import logging

from .. import store
from ..models import ItemChoice, SuggestedItem, SuggestRequest, SuggestResponse
from . import claude, databricks, templates

log = logging.getLogger(__name__)

MIN_SHARE = 0.3  # without Claude, keep items used in at least 30% of similar cases
MAX_REMOVAL_RATE = 0.5  # ...unless vets removed it from at least half the drafts it was in
MIN_FEEDBACK = 2  # vet feedback counts once it has happened at least this often


def _priced(items: list[ItemChoice]) -> list[SuggestedItem]:
    catalog = store.catalog()
    return [SuggestedItem(**i.model_dump(), name=catalog[i.catalog_id].name, price=catalog[i.catalog_id].price) for i in items]


def _keep(s: databricks.ItemStat, case_count: int) -> bool:
    if s.suggested >= MIN_FEEDBACK and s.removal_rate >= MAX_REMOVAL_RATE:
        return False
    return s.added >= MIN_FEEDBACK or s.count / case_count >= MIN_SHARE


def from_frequencies(similar: databricks.SimilarCases) -> list[ItemChoice]:
    return [
        ItemChoice(catalog_id=s.catalog_id, group=s.group, reason=f"Used in {s.count} of {similar.case_count} similar cases.")
        for s in similar.items
        if _keep(s, similar.case_count)
    ]


def best_template(req: SuggestRequest):
    """Best-ranked template for this patient that shares a symptom, or None."""
    wanted = set(req.symptoms)
    all_templates = store.templates()
    for r in templates.rank(req):
        if wanted & set(all_templates[r.template_id].symptoms):
            return all_templates[r.template_id]
    return None


def from_template(req: SuggestRequest) -> SuggestResponse:
    template = best_template(req)
    if not template:
        return SuggestResponse(items=[], source="none")
    catalog = store.catalog()
    items = [
        ItemChoice(catalog_id=cid, group=template.group_for(catalog[cid]), reason=f"From the '{template.name}' template.")
        for cid in template.item_ids
    ]
    return SuggestResponse(items=_priced(items), source="template", fallback_template_id=template.id)


def clean(req: SuggestRequest) -> SuggestRequest:
    """Known symptoms only (no repeats), and a tidy breed."""
    symptoms = store.symptoms()
    breed = " ".join((req.breed or "").split()) or None
    return req.model_copy(update={"symptoms": [s for s in dict.fromkeys(req.symptoms) if s in symptoms], "breed": breed})


async def suggest(req: SuggestRequest) -> SuggestResponse:
    req = clean(req)
    if not req.symptoms:
        return SuggestResponse(items=[], source="none")

    if not databricks.is_configured():
        return from_template(req)
    try:
        similar = await asyncio.wait_for(
            asyncio.to_thread(
                databricks.similar_cases, req.species, req.age_years, req.symptoms,
                breed=req.breed, weight_lbs=req.weight_lbs,
            ),
            timeout=databricks.QUERY_TIMEOUT_S,
        )
    except Exception:
        log.exception("Databricks similar-case search failed; using template")
        return from_template(req)
    if similar.case_count == 0:
        return from_template(req)

    counts = {"similar_case_count": similar.case_count, "vet_case_count": similar.vet_case_count}
    if claude.is_configured():
        try:
            items = await claude.suggest_items(req, similar)
            return SuggestResponse(items=_priced(items), source="databricks+claude", **counts)
        except Exception:
            log.exception("Claude suggestion failed; using case frequencies")

    return SuggestResponse(items=_priced(from_frequencies(similar)), source="databricks", **counts)
