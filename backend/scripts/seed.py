"""Create the Neon tables and upsert reference data from app/data/*.json.

Run from backend/:  python -m scripts.seed [--reset]
Safe to re-run. Plans are never touched.

Catalog items, explanations and symptoms are insert-only, so edits and additions made in
the app survive a re-seed. --reset overwrites them with app/data/*.json. Treatment details
(steps, cost_includes, questions) are filled in only where an explanation has none yet.
"""

import argparse
import json
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()

from app import store  # noqa: E402  (needs DATABASE_URL from .env)
from app.models import Template  # noqa: E402

SCHEMA = Path(__file__).parent.parent / "db" / "schema.sql"


def upsert(conn, table: str, key: str, rows: list[dict], json_cols: set[str] = frozenset(), overwrite: bool = True):
    if not rows:
        return
    cols = list(rows[0])
    values = ", ".join(f"cast(:{c} as jsonb)" if c in json_cols else f":{c}" for c in cols)
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c != key)
    on_conflict = f"do update set {updates}" if overwrite else "do nothing"
    sql = text(f"insert into {table} ({', '.join(cols)}) values ({values}) on conflict ({key}) {on_conflict}")
    conn.execute(sql, [{c: json.dumps(r[c]) if c in json_cols else r[c] for c in cols} for r in rows])


def fill_missing_details(conn, explanations: list[dict]) -> None:
    """Add treatment details to explanations that don't have them, keeping any the clinic wrote."""
    rows = [
        {"catalog_id": e["catalog_id"], "steps": e.get("steps"), "cost_includes": e.get("cost_includes"),
         "questions": e.get("questions", [])}
        for e in explanations
    ]
    conn.execute(
        text(
            "update explanations set steps = coalesce(steps, :steps), "
            "cost_includes = coalesce(cost_includes, :cost_includes), "
            "questions = case when cardinality(questions) = 0 then :questions else questions end "
            "where catalog_id = :catalog_id"
        ),
        rows,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="overwrite catalog/explanation edits from app/data")
    reset = ap.parse_args().reset
    engine = store.engine()
    if engine is None:
        raise SystemExit("DATABASE_URL is not set (see backend/.env.example)")

    catalog = store.load_json("catalog.json")
    explanations = [{"catalog_id": k, **v} for k, v in store.load_json("explanations.json").items()]
    symptoms = store.load_json("symptoms.json")
    templates = [Template(**t).model_dump() for t in store.load_json("templates.json")]  # AI-made ones are kept
    resources = [
        {"eligibility": None, "url": None, "phone": None, **r, "sort_order": i}
        for i, r in enumerate(store.load_json("resources.json"))
    ]

    with engine.begin() as conn:
        for statement in SCHEMA.read_text(encoding="utf-8").split(";"):
            if statement.strip():
                conn.exec_driver_sql(statement)
        upsert(conn, "catalog_items", "id", catalog, {"default_group"}, overwrite=reset)
        upsert(conn, "explanations", "catalog_id", explanations, overwrite=reset)
        fill_missing_details(conn, explanations)
        upsert(conn, "symptoms", "id", symptoms, overwrite=reset)
        upsert(conn, "templates", "id", templates, {"groups"})
        upsert(conn, "resources", "id", resources)

    print(f"Seeded {len(catalog)} catalog items, {len(explanations)} explanations, {len(symptoms)} symptoms, "
          f"{len(templates)} templates, {len(resources)} resources.")


if __name__ == "__main__":
    main()
