"""Databricks: visit history for suggestions and templates, and export of agreed visits.

Tables (created by scripts/load_databricks.py) in {DATABRICKS_CATALOG}.{DATABRICKS_SCHEMA}:
  cases         synthetic seed cases   (case_id, species, age_years, breed, weight_lbs,
                symptoms array<string>, items_json, created_at)
  agreed_plans  every visit agreed in the app: the same columns, plus plan_id instead of case_id,
                suggested_json = the AI draft the vet started from, source, and template_id
                (the template the vet started from, or "ai" / "blank")

Real plans rank above synthetic ones, and comparing their AI draft with the vet's
final list tells suggestions which items vets keep removing or adding.

Similar-case search is plain SQL (Jaccard overlap of symptom tags, plus bonuses for a
similar age, a similar weight and the same breed), so it runs on any SQL warehouse,
including Free Edition. Every query here is built from validated ids/numbers or
escaped literals, so values are inlined rather than bound.
"""

import json
import logging
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .. import store
from ..models import Plan
from ..species import SPECIES

log = logging.getLogger(__name__)

QUERY_TIMEOUT_S = 12  # first query after idle can be slow; template fallback after this
_SAFE_ID = re.compile(r"^[a-z0-9-]+$")


def is_configured() -> bool:
    return all(os.getenv(k) for k in ("DATABRICKS_HOST", "DATABRICKS_HTTP_PATH", "DATABRICKS_TOKEN"))


def table(name: str) -> str:
    catalog, schema = os.getenv("DATABRICKS_CATALOG", ""), (os.getenv("DATABRICKS_SCHEMA") or "isthmus")
    return f"{catalog}.{schema}.{name}" if catalog else f"{schema}.{name}"


def connect():
    from databricks import sql

    host = os.environ["DATABRICKS_HOST"].removeprefix("https://").rstrip("/")
    return sql.connect(
        server_hostname=host,
        http_path=os.environ["DATABRICKS_HTTP_PATH"],
        access_token=os.environ["DATABRICKS_TOKEN"],
    )


def run(query: str) -> list[tuple]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(query)
        return cur.fetchall() if cur.description else []


def lit(s: str | None) -> str:
    """Spark SQL string literal."""
    if s is None:
        return "NULL"
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def array_lit(ids: list[str]) -> str:
    if not ids:
        return "CAST(array() AS ARRAY<STRING>)"
    return "array(" + ", ".join(lit(i) for i in ids) + ")"


def _check_input(species: str, symptoms: list[str]) -> None:
    if species not in SPECIES or not all(_SAFE_ID.match(s) for s in symptoms):
        raise ValueError("invalid species or symptoms")


# ---- Similar cases ----

REAL_BONUS = 0.15  # real vet plans outrank synthetic cases with the same symptom overlap
REAL_WEIGHT = 2  # and their group choices count double
AGE_BONUS = 0.2  # same age; fades to 0 at 10 years apart
WEIGHT_BONUS = 0.15  # same weight; fades to 0 at half the pet's weight apart (at least 5 lbs)
BREED_BONUS = 0.1  # same breed (not for "Mixed" / "Unknown")
_VAGUE_BREEDS = {"", "mixed", "mixed breed", "unknown", "other"}


def specific_breed(breed: str | None) -> str | None:
    """Lower-cased breed, or None when it says nothing about the pet (blank, mixed, unknown)."""
    b = " ".join((breed or "").lower().split())
    return None if b in _VAGUE_BREEDS else b


@dataclass
class CaseRecord:
    items: list[dict]  # final plan: [{catalog_id, group}]
    suggested: list[dict] | None = None  # the AI draft the vet started from (real plans only)
    is_real: bool = False  # agreed in the app, not synthetic
    age_years: float | None = None
    breed: str | None = None
    weight_lbs: float | None = None
    symptoms: list[str] = field(default_factory=list)


@dataclass
class ItemStat:
    catalog_id: str
    count: int  # how many of the similar cases used it
    group: str  # most common group across those cases (real plans weighted)
    vet_uses: int = 0  # of `count`, how many were real vet plans
    suggested: int = 0  # times the AI drafted it for a similar real plan
    removed: int = 0  # ... and the vet took it out
    added: int = 0  # times a vet added it to an AI draft

    @property
    def removal_rate(self) -> float:
        return self.removed / self.suggested if self.suggested else 0.0


@dataclass
class SimilarCases:
    case_count: int
    items: list[ItemStat]  # most-used first
    vet_case_count: int = 0
    profile: str = ""  # who the cases were, e.g. "ages 9-15; 7-12 lbs; mostly Siamese (4)"


def _pet_bonuses(age_years: float | None, breed: str | None, weight_lbs: float | None) -> str:
    """SQL adding up the age, weight and breed bonuses for a case row."""
    parts = []
    if age_years is not None:
        parts.append(
            f"CASE WHEN age_years IS NULL THEN 0 "
            f"ELSE {AGE_BONUS} * greatest(0, 1 - abs(age_years - {float(age_years)}) / 10) END"
        )
    if weight_lbs is not None:
        w = float(weight_lbs)
        parts.append(
            f"CASE WHEN weight_lbs IS NULL THEN 0 "
            f"ELSE {WEIGHT_BONUS} * greatest(0, 1 - abs(weight_lbs - {w}) / {max(w * 0.5, 5.0)}) END"
        )
    if b := specific_breed(breed):
        parts.append(f"CASE WHEN lower(breed) = {lit(b)} THEN {BREED_BONUS} ELSE 0 END")
    return " + ".join(parts) or "0"


def _all_cases() -> str:
    """Synthetic cases and real visits as one table, with is_real telling them apart."""
    return f"""
          SELECT species, age_years, breed, weight_lbs, symptoms, items_json,
                 CAST(NULL AS STRING) AS suggested_json, false AS is_real, created_at
          FROM {table('cases')}
          UNION ALL
          SELECT species, age_years, breed, weight_lbs, symptoms, items_json,
                 suggested_json, true AS is_real, created_at
          FROM {table('agreed_plans')}"""


def _record(items, draft, real, age, breed, weight, symptoms=None) -> CaseRecord:
    return CaseRecord(
        json.loads(items),
        json.loads(draft) if draft else None,
        bool(real),
        None if age is None else float(age),
        breed,
        None if weight is None else float(weight),
        list(symptoms or []),
    )


def similar_cases(
    species: str,
    age_years: float | None,
    symptoms: list[str],
    k: int = 20,
    *,
    breed: str | None = None,
    weight_lbs: float | None = None,
) -> SimilarCases:
    """Top-k past cases by symptom overlap and how alike the pets are, and how often each item was used in them."""
    _check_input(species, symptoms)
    if not symptoms:
        raise ValueError("no symptoms")
    wanted = array_lit(symptoms)
    query = f"""
        WITH all_cases AS ({_all_cases()})
        SELECT items_json, suggested_json, is_real, age_years, breed, weight_lbs,
               size(array_intersect(symptoms, {wanted})) / size(array_union(symptoms, {wanted}))
               + {_pet_bonuses(age_years, breed, weight_lbs)}
               + CASE WHEN is_real THEN {REAL_BONUS} ELSE 0 END AS score
        FROM all_cases
        WHERE species = {lit(species)} AND size(array_intersect(symptoms, {wanted})) > 0
        ORDER BY score DESC
        LIMIT {int(k)}
    """
    return aggregate([_record(*row[:6]) for row in run(query)])


def _range(values: list[float], unit: str = "") -> str:
    lo, hi = f"{min(values):g}", f"{max(values):g}"
    return (lo if lo == hi else f"{lo}-{hi}") + unit


def describe_profile(cases: list[CaseRecord]) -> str:
    """Who a set of cases were: age and weight ranges and the most common breeds."""
    parts = []
    if ages := [c.age_years for c in cases if c.age_years is not None]:
        parts.append(f"ages {_range(ages)}")
    if weights := [c.weight_lbs for c in cases if c.weight_lbs is not None]:
        parts.append(_range(weights, " lbs"))
    if breeds := Counter(" ".join(c.breed.split()) for c in cases if specific_breed(c.breed)):
        parts.append("mostly " + ", ".join(f"{b} ({n})" for b, n in breeds.most_common(3)))
    return "; ".join(parts)


def aggregate(cases: list[CaseRecord]) -> SimilarCases:
    """Count item use across cases, plus how vets changed AI drafts in the real ones."""
    known = store.catalog()
    counts, vet_uses, suggested, removed, added = (Counter() for _ in range(5))
    groups: dict[str, Counter[str]] = defaultdict(Counter)
    for case in cases:
        final = {i["catalog_id"]: i for i in case.items if i["catalog_id"] in known}
        for cid, it in final.items():
            counts[cid] += 1
            groups[cid][it["group"]] += REAL_WEIGHT if case.is_real else 1
            vet_uses[cid] += case.is_real
        if case.is_real and case.suggested:
            draft = {i["catalog_id"]: i for i in case.suggested if i["catalog_id"] in known}
            for cid, it in draft.items():
                suggested[cid] += 1
                if cid not in final:
                    removed[cid] += 1
                    groups[cid].setdefault(it["group"], 0)  # a group to report if vets never kept it
            for cid in final.keys() - draft.keys():
                added[cid] += 1

    ids = sorted(counts.keys() | suggested.keys(), key=lambda cid: -counts[cid])
    stats = [
        ItemStat(cid, counts[cid], groups[cid].most_common(1)[0][0], vet_uses[cid], suggested[cid], removed[cid], added[cid])
        for cid in ids
    ]
    return SimilarCases(
        case_count=len(cases),
        items=stats,
        vet_case_count=sum(c.is_real for c in cases),
        profile=describe_profile(cases),
    )


# ---- Templates: which ones vets start from, and groups of visits to make new ones from ----


def template_usage(
    species: str, age_years: float | None, weight_lbs: float | None, symptoms: list[str]
) -> Counter[str]:
    """How often vets started from each template for visits like this one (same species,
    a shared symptom, age within 4 years, weight within half the pet's weight)."""
    _check_input(species, symptoms)
    where = [f"species = {lit(species)}", "template_id IS NOT NULL"]
    if symptoms:
        where.append(f"size(array_intersect(symptoms, {array_lit(symptoms)})) > 0")
    if age_years is not None:
        where.append(f"(age_years IS NULL OR abs(age_years - {float(age_years)}) <= 4)")
    if weight_lbs is not None:
        w = float(weight_lbs)
        where.append(f"(weight_lbs IS NULL OR abs(weight_lbs - {w}) <= {w * 0.5})")
    rows = run(
        f"SELECT template_id, count(*) FROM {table('agreed_plans')} WHERE {' AND '.join(where)} GROUP BY template_id"
    )
    return Counter({tid: int(n) for tid, n in rows})


# Bands that visits are grouped into when looking for patterns worth a template: (min, max).
AGE_BANDS = {"young": (None, 2.0), "adult": (2.0, 8.0), "senior": (8.0, None)}
DOG_SIZES = {"toy": (None, 12.0), "small": (12.0, 25.0), "medium": (25.0, 55.0), "large": (55.0, None)}
REAL_SUPPORT = 3  # a real visit counts as this many synthetic ones when looking for patterns


def _band_sql(column: str, bands: dict[str, tuple[float | None, float | None]]) -> str:
    whens = " ".join(f"WHEN {column} < {hi} THEN '{name}'" for name, (_, hi) in bands.items() if hi is not None)
    last = next(name for name, (_, hi) in bands.items() if hi is None)
    return f"CASE WHEN {column} IS NULL THEN 'any' {whens} ELSE '{last}' END"


def _banded() -> str:
    size = f"CASE WHEN species <> 'dog' THEN 'any' ELSE {_band_sql('weight_lbs', DOG_SIZES)} END"
    return f"""
        WITH all_cases AS ({_all_cases()}),
        banded AS (
          SELECT *, {_band_sql('age_years', AGE_BANDS)} AS age_band, {size} AS size_band FROM all_cases
        )"""


@dataclass
class Cluster:
    species: str
    age_band: str  # a key of AGE_BANDS
    size_band: str  # a key of DOG_SIZES, or "any" (cats, or weight unknown)
    symptom: str
    support: int  # visits, real ones counted REAL_SUPPORT times
    real_count: int


def clusters(min_support: int, species: str | None = None, symptoms: list[str] | None = None) -> list[Cluster]:
    """Groups of past visits (species, age band, dog size, one shared symptom) with enough support."""
    where = ["age_band <> 'any'"]
    if species is not None:
        _check_input(species, symptoms or [])
        where.append(f"species = {lit(species)}")
    if symptoms:
        where.append(f"symptom IN ({', '.join(lit(s) for s in symptoms)})")
    rows = run(f"""
        {_banded()}
        SELECT species, age_band, size_band, symptom,
               sum(CASE WHEN is_real THEN {REAL_SUPPORT} ELSE 1 END) AS support,
               sum(CASE WHEN is_real THEN 1 ELSE 0 END) AS real_count
        FROM banded LATERAL VIEW explode(symptoms) s AS symptom
        WHERE {' AND '.join(where)}
        GROUP BY species, age_band, size_band, symptom
        HAVING support >= {int(min_support)}
        ORDER BY support DESC
    """)
    return [Cluster(sp, age, size, sym, int(sup), int(real)) for sp, age, size, sym, sup, real in rows]


def cluster_cases(c: Cluster, k: int = 40) -> list[CaseRecord]:
    """The visits in a cluster, real and most recent first."""
    _check_input(c.species, [c.symptom])
    if c.age_band not in AGE_BANDS or c.size_band not in (*DOG_SIZES, "any"):
        raise ValueError("invalid band")
    rows = run(f"""
        {_banded()}
        SELECT items_json, suggested_json, is_real, age_years, breed, weight_lbs, symptoms
        FROM banded
        WHERE species = {lit(c.species)} AND age_band = {lit(c.age_band)} AND size_band = {lit(c.size_band)}
          AND array_contains(symptoms, {lit(c.symptom)})
        ORDER BY is_real DESC, created_at DESC
        LIMIT {int(k)}
    """)
    return [_record(*row) for row in rows]


# ---- Export ----


def export_agreed_plan(plan: Plan) -> None:
    """Add an agreed visit to Databricks so future suggestions and templates learn from it.

    Runs as a background task after /agree; failures are logged, never raised.
    """
    if not is_configured():
        return
    try:
        items = [{"catalog_id": i.catalog_id, "group": i.group, "selected": i.selected} for i in plan.items]
        draft = [{"catalog_id": i.catalog_id, "group": i.group} for i in plan.suggested]
        symptoms = [s for s in plan.symptoms if _SAFE_ID.match(s)]
        pet = plan.pet
        breed = " ".join(pet.breed.split()) if pet.breed and pet.breed.strip() else None

        def num(x: float | None) -> str:
            return "NULL" if x is None else str(float(x))

        run(
            f"INSERT INTO {table('agreed_plans')} "
            f"(plan_id, species, age_years, breed, weight_lbs, symptoms, items_json, suggested_json, source, "
            f"template_id, created_at) "
            f"VALUES ({lit(plan.id)}, {lit(pet.species)}, {num(pet.age_years)}, {lit(breed)}, {num(pet.weight_lbs)}, "
            f"{array_lit(symptoms)}, {lit(json.dumps(items))}, {lit(json.dumps(draft)) if draft else 'NULL'}, "
            f"{lit(plan.source)}, {lit(plan.template_id)}, current_timestamp())"
        )
    except Exception:
        log.exception("Databricks export failed for plan %s", plan.id)


# Columns added after launch. The app runs ensure_tables() at startup.
_NEW_COLUMNS = {
    "agreed_plans": {
        "suggested_json": "STRING",
        "source": "STRING",
        "breed": "STRING",
        "weight_lbs": "DOUBLE",
        "template_id": "STRING",
    },
    "cases": {"breed": "STRING", "weight_lbs": "DOUBLE"},
}


def ensure_tables() -> None:
    """Add any missing columns to cases and agreed_plans. Safe to re-run."""
    for name, columns in _NEW_COLUMNS.items():
        have = {r[0] for r in run(f"DESCRIBE TABLE {table(name)}")}
        missing = [f"{c} {t}" for c, t in columns.items() if c not in have]
        if missing:
            run(f"ALTER TABLE {table(name)} ADD COLUMNS ({', '.join(missing)})")
            log.info("Added %s to %s", ", ".join(missing), table(name))


def ping() -> bool:
    """Wakes a stopped SQL warehouse (can take a minute) and warms the similar-case query."""
    try:
        similar_cases("cat", 12, ["vomiting", "not-eating"], breed="Domestic Shorthair", weight_lbs=9.5)
        return True
    except Exception:
        log.exception("Databricks ping failed")
        return False
