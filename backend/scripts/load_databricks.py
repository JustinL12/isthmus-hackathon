"""Create the Databricks tables and load app/data/synthetic_cases.jsonl into `cases`.

Run from backend/:  python -m scripts.load_databricks [--check]
Re-running replaces `cases`; `agreed_plans` (written by the app) is kept.
--check skips the reload: it only adds any missing agreed_plans columns, then runs
a similar-case search for Mochi (vomiting senior cat) and prints it.
"""

import argparse
import json

from dotenv import load_dotenv

load_dotenv()

from app import store  # noqa: E402
from app.services import databricks as dbx  # noqa: E402

BATCH = 100


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="only run the Mochi similar-case check")
    args = ap.parse_args()
    if not dbx.is_configured():
        raise SystemExit("Set DATABRICKS_HOST, DATABRICKS_HTTP_PATH and DATABRICKS_TOKEN in backend/.env")

    if not args.check:
        load()
    dbx.ensure_tables()

    result = dbx.similar_cases("cat", 12, ["vomiting", "not-eating", "lethargy"])
    catalog = store.catalog()
    print(f"\nMochi check: {result.case_count} similar cases ({result.vet_case_count} from vets)")
    for s in result.items:
        feedback = f"  vets removed {s.removed}/{s.suggested}, added {s.added}" if s.suggested or s.added else ""
        print(f"  {s.count:>3}  {s.group:<9}  {catalog[s.catalog_id].name}{feedback}")


def load():
    path = store.DATA_DIR / "synthetic_cases.jsonl"
    cases = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    schema = dbx.table("x").rsplit(".", 1)[0]

    dbx.run(f"CREATE SCHEMA IF NOT EXISTS {schema}")
    cols = "species STRING, age_years DOUBLE, symptoms ARRAY<STRING>, items_json STRING, created_at TIMESTAMP"
    dbx.run(f"CREATE OR REPLACE TABLE {dbx.table('cases')} (case_id STRING, {cols})")
    dbx.run(f"CREATE TABLE IF NOT EXISTS {dbx.table('agreed_plans')} (plan_id STRING, {cols})")

    for start in range(0, len(cases), BATCH):
        rows = ", ".join(
            f"({dbx.lit(c['case_id'])}, {dbx.lit(c['species'])}, "
            f"{'NULL' if c.get('age_years') is None else float(c['age_years'])}, "
            f"{dbx.array_lit(c['symptoms'])}, {dbx.lit(json.dumps(c['items']))}, current_timestamp())"
            for c in cases[start:start + BATCH]
        )
        dbx.run(f"INSERT INTO {dbx.table('cases')} VALUES {rows}")
    print(f"Loaded {len(cases)} cases into {dbx.table('cases')}")


if __name__ == "__main__":
    main()
