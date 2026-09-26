"""Create the Neon tables and upsert reference data from app/data/*.json.

Run from backend/:  python -m scripts.seed
Safe to re-run. Plans are never touched.
"""

import json
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()

from app import store  # noqa: E402  (needs DATABASE_URL from .env)

SCHEMA = Path(__file__).parent.parent / "db" / "schema.sql"


def upsert(conn, table: str, key: str, rows: list[dict], json_cols: set[str] = frozenset()):
    if not rows:
        return
    cols = list(rows[0])
    values = ", ".join(f"cast(:{c} as jsonb)" if c in json_cols else f":{c}" for c in cols)
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c != key)
    sql = text(f"insert into {table} ({', '.join(cols)}) values ({values}) on conflict ({key}) do update set {updates}")
    conn.execute(sql, [{c: json.dumps(r[c]) if c in json_cols else r[c] for c in cols} for r in rows])


def main():
    engine = store.engine()
    if engine is None:
        raise SystemExit("DATABASE_URL is not set (see backend/.env.example)")

    catalog = store.load_json("catalog.json")
    explanations = [{"catalog_id": k, **v} for k, v in store.load_json("explanations.json").items()]
    templates = [{"symptoms": [], **t} for t in store.load_json("templates.json")]
    resources = [
        {"eligibility": None, "url": None, "phone": None, **r, "sort_order": i}
        for i, r in enumerate(store.load_json("resources.json"))
    ]

    with engine.begin() as conn:
        for statement in SCHEMA.read_text(encoding="utf-8").split(";"):
            if statement.strip():
                conn.exec_driver_sql(statement)
        upsert(conn, "catalog_items", "id", catalog, {"default_group"})
        upsert(conn, "explanations", "catalog_id", explanations)
        upsert(conn, "templates", "id", templates)
        upsert(conn, "resources", "id", resources)

    print(f"Seeded {len(catalog)} catalog items, {len(explanations)} explanations, "
          f"{len(templates)} templates, {len(resources)} resources.")


if __name__ == "__main__":
    main()
