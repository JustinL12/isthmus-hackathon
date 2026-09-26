"""Databricks: case history for suggestions, and export of agreed plans.

Tables (created by scripts/load_databricks.py) in {DATABRICKS_CATALOG}.{DATABRICKS_SCHEMA}:
  cases         synthetic seed cases   (case_id, species, age_years, symptoms array<string>, items_json, created_at)
  agreed_plans  plans agreed in the app (same columns, plus plan_id instead of case_id)

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

QUERY_TIMEOUT_S = 8
_SAFE_ID = re.compile(r"^[a-z0-9-]+$")


def is_configured() -> bool:
    return all(os.getenv(k) for k in ("DATABRICKS_HOST", "DATABRICKS_HTTP_PATH", "DATABRICKS_TOKEN"))


def table(name: str) -> str:
    catalog, schema = os.getenv("DATABRICKS_CATALOG", ""), os.getenv("DATABRICKS_SCHEMA", "isthmus")
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


@dataclass
class ItemStat:
    catalog_id: str
    count: int  # how many of the similar cases used it
    group: str  # most common group across those cases


@dataclass
class SimilarCases:
    case_count: int
    items: list[ItemStat]  # most-used first


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
          SELECT species, age_years, symptoms, items_json FROM {table('cases')}
          UNION ALL
          SELECT species, age_years, symptoms, items_json FROM {table('agreed_plans')}
        )
        SELECT items_json,
               size(array_intersect(symptoms, {wanted})) / size(array_union(symptoms, {wanted})) + {age_bonus} AS score
        FROM all_cases
        WHERE species = {lit(species)} AND size(array_intersect(symptoms, {wanted})) > 0
        ORDER BY score DESC
        LIMIT {int(k)}
    """
    rows = run(query)
    return aggregate([json.loads(r[0]) for r in rows])


def aggregate(cases_items: list[list[dict]]) -> SimilarCases:
    """Count item use across cases; each item's group is the one vets picked most often."""
    known = store.catalog()
    counts: Counter[str] = Counter()
    groups: dict[str, Counter[str]] = defaultdict(Counter)
    for items in cases_items:
        for it in {i["catalog_id"]: i for i in items if i["catalog_id"] in known}.values():
            counts[it["catalog_id"]] += 1
            groups[it["catalog_id"]][it["group"]] += 1
    stats = [ItemStat(cid, n, groups[cid].most_common(1)[0][0]) for cid, n in counts.most_common()]
    return SimilarCases(case_count=len(cases_items), items=stats)


# ---- Export ----


def export_agreed_plan(plan: Plan) -> None:
    """Add an agreed plan to Databricks so future suggestions learn from it.

    Runs as a background task after /agree; failures are logged, never raised.
    """
    if not is_configured():
        return
    try:
        items = [{"catalog_id": i.catalog_id, "group": i.group, "selected": i.selected} for i in plan.items]
        symptoms = [s for s in plan.symptoms if _SAFE_ID.match(s)]
        age = "NULL" if plan.pet.age_years is None else str(float(plan.pet.age_years))
        run(
            f"INSERT INTO {table('agreed_plans')} (plan_id, species, age_years, symptoms, items_json, created_at) "
            f"VALUES ({lit(plan.id)}, {lit(plan.pet.species)}, {age}, {array_lit(symptoms)}, "
            f"{lit(json.dumps(items))}, current_timestamp())"
        )
    except Exception:
        log.exception("Databricks export failed for plan %s", plan.id)


def ping() -> bool:
    """Runs SELECT 1, which also wakes a stopped SQL warehouse (can take a minute)."""
    try:
        run("SELECT 1")
        return True
    except Exception:
        log.exception("Databricks ping failed")
        return False
