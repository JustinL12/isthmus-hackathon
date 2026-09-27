"""AI-made visit templates, from patterns in past visits (Databricks).

Visits are grouped by species, age band, dog size and one shared symptom (see
databricks.clusters). A group with enough visits that no template covers yet becomes a
new template: Claude names it and picks its items from what those visits used, following
vet corrections. Saved with origin "ai"; vets can hide ones they don't want.

Runs after each agreed visit (only for that visit's groups, and only once enough real
visits share the pattern), and from `python -m scripts.generate_templates` for all groups.
"""

import asyncio
import logging
import math
from collections import Counter

from .. import store
from ..models import Plan, Template
from . import claude, databricks
from .databricks import AGE_BANDS, DOG_SIZES, Cluster

log = logging.getLogger(__name__)

MIN_SUPPORT = 12  # visits in a group before it's worth a template (a real visit counts 3)
MIN_REAL = 3  # after a visit: only make a template once this many real visits share the pattern
MAX_PER_RUN = 8

_AGE_WORDS = {"young": "young", "adult": "adult", "senior": "senior"}


def band_ranges(c: Cluster) -> dict:
    age_min, age_max = AGE_BANDS[c.age_band]
    weight_min, weight_max = DOG_SIZES.get(c.size_band, (None, None))
    return {"age_min": age_min, "age_max": age_max, "weight_min_lbs": weight_min, "weight_max_lbs": weight_max}


def _overlaps(a: tuple[float | None, float | None], b: tuple[float | None, float | None]) -> bool:
    lo = lambda x: -math.inf if x is None else x  # noqa: E731
    hi = lambda x: math.inf if x is None else x  # noqa: E731
    return lo(a[0]) < hi(b[1]) and lo(b[0]) < hi(a[1])


def covers(t: Template, c: Cluster) -> bool:
    """A template (including hidden ones) already serves this group of visits: same species and
    symptom, and aimed at these patients. A catch-all template (no age range, or no weight range
    for a dog size) doesn't count, so the AI can make targeted ones beside it."""
    r = band_ranges(c)
    age, weight = (t.age_min, t.age_max), (t.weight_min_lbs, t.weight_max_lbs)
    return (
        t.species == c.species
        and c.symptom in t.symptoms
        and age != (None, None)
        and _overlaps(age, (r["age_min"], r["age_max"]))
        and (c.size_band == "any" or (weight != (None, None) and _overlaps(weight, (r["weight_min_lbs"], r["weight_max_lbs"]))))
    )


def template_id(c: Cluster) -> str:
    return "-".join(["ai", c.species, c.age_band, *([c.size_band] if c.size_band != "any" else []), c.symptom])


def describe_patients(c: Cluster) -> str:
    """e.g. "senior cats (8+ yrs)" or "adult large dogs (2-8 yrs, 55+ lbs)"."""
    from .templates import range_label

    r = band_ranges(c)
    size = f" {c.size_band}" if c.size_band != "any" else ""
    ranges = [range_label(r["age_min"], r["age_max"], "yrs")]
    if c.size_band != "any":
        ranges.append(range_label(r["weight_min_lbs"], r["weight_max_lbs"], "lbs"))
    return f"{_AGE_WORDS[c.age_band]}{size} {c.species}s ({', '.join(ranges)})"


def visit_count(c: Cluster) -> int:
    return c.support - (databricks.REAL_SUPPORT - 1) * c.real_count


async def make_template(c: Cluster) -> Template | None:
    cases = await asyncio.to_thread(databricks.cluster_cases, c)
    if not cases:
        return None
    similar = databricks.aggregate(cases)
    co_symptoms = Counter(s for case in cases for s in case.symptoms)
    draft = await claude.draft_template(describe_patients(c), c.symptom, similar, co_symptoms)
    catalog = store.catalog()
    items = [i for i in draft["items"] if i.catalog_id in catalog]
    return Template(
        id=template_id(c),
        name=draft["name"],
        species=c.species,
        item_ids=[i.catalog_id for i in items],
        symptoms=draft["symptoms"],
        groups={i.catalog_id: i.group for i in items},
        origin="ai",
        based_on=visit_count(c),
        summary=draft["summary"],
        **band_ranges(c),
    )


async def generate(
    *,
    min_support: int = MIN_SUPPORT,
    min_real: int = 0,
    limit: int = MAX_PER_RUN,
    species: str | None = None,
    symptoms: list[str] | None = None,
    bands: tuple[str, str] | None = None,
    save: bool = True,
) -> list[Template]:
    """Make templates for the best-supported groups of visits no template covers yet."""
    found = await asyncio.to_thread(databricks.clusters, min_support, species, symptoms)
    made: list[Template] = []
    for c in found:
        if len(made) >= limit:
            break
        if c.real_count < min_real or (bands and (c.age_band, c.size_band) != bands):
            continue
        # Hidden templates count too, so a template a vet hid isn't made again.
        if any(covers(t, c) for t in [*store.all_templates().values(), *made]):
            continue
        try:
            template = await make_template(c)
        except Exception:
            log.exception("Couldn't make a template for %s", template_id(c))
            continue
        if template:
            made.append(store.save_template(template) if save else template)
            log.info("AI template %s: %s (from %d visits)", template.id, template.name, template.based_on)
    return made


def _band(value: float | None, bands: dict[str, tuple[float | None, float | None]]) -> str:
    if value is None:
        return "any"
    return next(name for name, (lo, hi) in bands.items() if (lo is None or value >= lo) and (hi is None or value < hi))


async def learn_from_visit(plan: Plan) -> None:
    """After an agreed visit: make a template if this visit's pattern now has enough real visits.

    Background task (runs after the Databricks export); failures are logged, never raised.
    """
    if not (databricks.is_configured() and claude.is_configured()) or not plan.symptoms:
        return
    pet = plan.pet
    age_band = _band(pet.age_years, AGE_BANDS)
    if age_band == "any":
        return
    size_band = _band(pet.weight_lbs, DOG_SIZES) if pet.species == "dog" else "any"
    known = store.symptoms()
    try:
        await generate(
            min_real=MIN_REAL,
            limit=1,
            species=pet.species,
            symptoms=[s for s in plan.symptoms if s in known],
            bands=(age_band, size_band),
        )
    except Exception:
        log.exception("Template learning failed for plan %s", plan.id)
