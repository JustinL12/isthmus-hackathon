"""Make AI templates from patterns in past visits (Databricks), and save them to the app database.

Run from backend/:  python -m scripts.generate_templates [--dry-run] [--limit 8] [--min-support 12]
Only groups of visits no template covers yet get one, so re-running is safe.
--dry-run prints what would be made without saving.
"""

import argparse
import asyncio

from dotenv import load_dotenv

load_dotenv()

from app import store  # noqa: E402
from app.services import claude, databricks, template_gen  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print the templates without saving them")
    ap.add_argument("--limit", type=int, default=template_gen.MAX_PER_RUN)
    ap.add_argument("--min-support", type=int, default=template_gen.MIN_SUPPORT)
    args = ap.parse_args()
    if not databricks.is_configured() or not claude.is_configured():
        raise SystemExit("Set the DATABRICKS_* variables and ANTHROPIC_API_KEY in backend/.env")

    found = databricks.clusters(args.min_support)
    print(f"{len(found)} groups of visits with support >= {args.min_support}")
    made = asyncio.run(template_gen.generate(min_support=args.min_support, limit=args.limit, save=not args.dry_run))
    catalog = store.catalog()
    for t in made:
        print(f"\n{t.id}: {t.name}  (from {t.based_on} visits)\n  {t.summary}\n  symptoms: {', '.join(t.symptoms)}")
        for cid in t.item_ids:
            print(f"    {t.groups[cid]:<9}  {catalog[cid].name}")
    print(f"\n{'Would make' if args.dry_run else 'Saved'} {len(made)} templates ({store.backend_name()}).")


if __name__ == "__main__":
    main()
