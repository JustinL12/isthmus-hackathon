"""Databricks: case history for suggestions, and export of agreed plans.

Tables (created by scripts/load_databricks.py) in {DATABRICKS_CATALOG}.{DATABRICKS_SCHEMA}:
  cases         synthetic seed cases   (case_id, species, age_years, symptoms array<string>, items_json, created_at)
  agreed_plans  plans agreed in the app (same columns, plus plan_id instead of case_id,
                suggested_json = the AI draft the vet started from, and source)

Real plans rank above synthetic ones, and comparing their AI draft with the vet's
final list tells suggestions which items vets keep removing or adding.

Similar-case search is plain SQL (Jaccard overlap of symptom tags + an age bonus),
so it runs on any SQL warehouse, including Free Edition. Every query here is
built from validated ids/numbers only, so values are inlined rather than bound.
"""

import json
import logging
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass

from .. import store
from ..models import Plan

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


# ---- Similar cases ----

REAL_BONUS = 0.15  # real vet plans outrank synthetic cases with the same symptom overlap
REAL_WEIGHT = 2  # and their group choices count double


@dataclass
class CaseRecord:
    items: list[dict]  # final plan: [{catalog_id, group}]
    suggested: list[dict] | None = None  # the AI draft the vet started from (real plans only)
    is_real: bool = False  # agreed in the app, not synthetic


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


def similar_cases(species: str, age_years: float | None, symptoms: list[str], k: int = 20) -> SimilarCases:
    """Top-k past cases by symptom overlap, and how often each item was used in them."""
    if species not in ("cat", "dog") or not symptoms or not all(_SAFE_ID.match(s) for s in symptoms):
        raise ValueError("invalid species or symptoms")
    wanted = array_lit(symptoms)
    age_bonus = "0" if age_years is None else (
        f"CASE WHEN age_years IS NULL THEN 0 ELSE 0.2 * greatest(0, 1 - abs(age_years - {float(age_years)}) / 10) END"
    )
    query = f"""
        WITH all_cases AS (
          SELECT species, age_years, symptoms, items_json, CAST(NULL AS STRING) AS suggested_json, false AS is_real
          FROM {table('cases')}
          UNION ALL
          SELECT species, age_years, symptoms, items_json, suggested_json, true AS is_real
          FROM {table('agreed_plans')}
        )
        SELECT items_json, suggested_json, is_real,
               size(array_intersect(symptoms, {wanted})) / size(array_union(symptoms, {wanted})) + {age_bonus}
               + CASE WHEN is_real THEN {REAL_BONUS} ELSE 0 END AS score
        FROM all_cases
        WHERE species = {lit(species)} AND size(array_intersect(symptoms, {wanted})) > 0
        ORDER BY score DESC
        LIMIT {int(k)}
    """
    rows = run(query)
    return aggregate([
        CaseRecord(json.loads(items), json.loads(draft) if draft else None, bool(real)) for items, draft, real, _ in rows
    ])


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
    return SimilarCases(case_count=len(cases), items=stats, vet_case_count=sum(c.is_real for c in cases))


# ---- Export ----


def export_agreed_plan(plan: Plan) -> None:
    """Add an agreed plan to Databricks so future suggestions learn from it.

    Runs as a background task after /agree; failures are logged, never raised.
    """
    if not is_configured():
        return
    try:
        items = [{"catalog_id": i.catalog_id, "group": i.group, "selected": i.selected} for i in plan.items]
        draft = [{"catalog_id": i.catalog_id, "group": i.group} for i in plan.suggested]
        symptoms = [s for s in plan.symptoms if _SAFE_ID.match(s)]
        age = "NULL" if plan.pet.age_years is None else str(float(plan.pet.age_years))
        run(
            f"INSERT INTO {table('agreed_plans')} "
            f"(plan_id, species, age_years, symptoms, items_json, suggested_json, source, created_at) "
            f"VALUES ({lit(plan.id)}, {lit(plan.pet.species)}, {age}, {array_lit(symptoms)}, "
            f"{lit(json.dumps(items))}, {lit(json.dumps(draft)) if draft else 'NULL'}, {lit(plan.source)}, "
            f"current_timestamp())"
        )
    except Exception:
        log.exception("Databricks export failed for plan %s", plan.id)


def ensure_tables() -> None:
    """Add the columns introduced after launch to agreed_plans. Safe to re-run."""
    have = {r[0] for r in run(f"DESCRIBE TABLE {table('agreed_plans')}")}
    missing = [f"{c} STRING" for c in ("suggested_json", "source") if c not in have]
    if missing:
        run(f"ALTER TABLE {table('agreed_plans')} ADD COLUMNS ({', '.join(missing)})")


def ping() -> bool:
    """Wakes a stopped SQL warehouse (can take a minute) and warms the similar-case query."""
    try:
        similar_cases("cat", 12, ["vomiting", "not-eating"])
        return True
    except Exception:
        log.exception("Databricks ping failed")
        return False
