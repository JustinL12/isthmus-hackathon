"""Rank visit templates for a patient: symptoms, whether the template fits the pet's age,
weight and breed, and how often vets started from it for similar visits (Databricks).

Deterministic and fast (no Claude call); without Databricks the experience part is skipped.
"""

import asyncio
import logging
from collections import Counter

from .. import store
from ..models import SuggestRequest, Template, TemplateRank
from . import databricks

log = logging.getLogger(__name__)

USAGE_TIMEOUT_S = 5
AGE_FIT, AGE_MISFIT = 0.2, -0.5  # a template aimed at other patients drops below the general ones
WEIGHT_FIT, WEIGHT_MISFIT = 0.15, -0.5
BREED_FIT = 0.15
PER_USE, MAX_USES = 0.1, 5  # experience: up to +0.5 for templates vets keep picking


def _fits(value: float | None, lo: float | None, hi: float | None) -> bool | None:
    """True/False when both the pet's value and the template's range are known, else None."""
    if value is None or (lo is None and hi is None):
        return None
    return (lo is None or value >= lo) and (hi is None or value < hi)


def range_label(lo: float | None, hi: float | None, unit: str) -> str:
    if lo is None:
        return f"under {hi:g} {unit}"
    if hi is None:
        return f"{lo:g}+ {unit}"
    return f"{lo:g}-{hi:g} {unit}"


def score(t: Template, req: SuggestRequest, uses: int = 0) -> TemplateRank:
    wanted, reasons, total = set(req.symptoms), [], 0.0

    if matched := len(wanted & set(t.symptoms)):
        # Mostly: how many of the pet's symptoms it covers; a little: how focused the template is.
        total += matched / len(wanted) + 0.25 * matched / len(t.symptoms)
        reasons.append(f"Matches {matched} symptom{'s' if matched != 1 else ''}")

    age_fit = _fits(req.age_years, t.age_min, t.age_max)
    if age_fit is not None:
        total += AGE_FIT if age_fit else AGE_MISFIT
        if age_fit:
            reasons.append(f"Fits age {range_label(t.age_min, t.age_max, 'yrs')}")

    weight_fit = _fits(req.weight_lbs, t.weight_min_lbs, t.weight_max_lbs)
    if weight_fit is not None:
        total += WEIGHT_FIT if weight_fit else WEIGHT_MISFIT
        if weight_fit:
            reasons.append(f"Fits {range_label(t.weight_min_lbs, t.weight_max_lbs, 'lbs')}")

    breed = databricks.specific_breed(req.breed)
    if breed and breed in {databricks.specific_breed(b) for b in t.breeds}:
        total += BREED_FIT
        reasons.append(f"Made for {req.breed.strip()}")

    if uses:
        total += PER_USE * min(uses, MAX_USES)
        reasons.append(f"Picked for {uses} similar visit{'s' if uses != 1 else ''}")

    return TemplateRank(template_id=t.id, score=round(total, 3), reasons=reasons)


def rank(req: SuggestRequest, usage: Counter[str] | None = None) -> list[TemplateRank]:
    """This species' templates, best fit first."""
    usage = usage or Counter()
    ranked = [score(t, req, usage[t.id]) for t in store.templates().values() if t.species == req.species]
    names = {t.id: t.name for t in store.templates().values()}
    return sorted(ranked, key=lambda r: (-r.score, names[r.template_id]))


async def rank_templates(req: SuggestRequest) -> list[TemplateRank]:
    known = store.symptoms()
    req = req.model_copy(update={"symptoms": [s for s in dict.fromkeys(req.symptoms) if s in known]})
    usage: Counter[str] = Counter()
    if databricks.is_configured():
        try:
            usage = await asyncio.wait_for(
                asyncio.to_thread(databricks.template_usage, req.species, req.age_years, req.weight_lbs, req.symptoms),
                timeout=USAGE_TIMEOUT_S,
            )
        except Exception:
            log.exception("Databricks template usage failed; ranking without it")
    return rank(req, usage)
