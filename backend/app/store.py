"""Data access layer. Routers only talk to this module.

Two backends, picked on first use:
- Postgres (Neon) when DATABASE_URL is set. Seed it with `python -m scripts.seed`.
- Otherwise reference data comes from app/data/*.json and plans live in memory
  (lost on restart). Used for local dev without a database and for tests.
"""

import json
import os
import secrets
from functools import cache
from pathlib import Path

from .models import CatalogItem, Explanation, Plan, Resource, Symptom, Template

DATA_DIR = Path(__file__).parent / "data"


def load_json(name: str):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


@cache
def engine():
    """SQLAlchemy engine for Neon, or None to use JSON + memory."""
    url = os.getenv("DATABASE_URL")
    if not url:
        return None
    from sqlalchemy import create_engine

    # Neon hands out postgres:// or postgresql:// URLs; SQLAlchemy needs the psycopg 3 driver name.
    url = url.replace("postgres://", "postgresql://", 1).replace("postgresql://", "postgresql+psycopg://", 1)
    # pre_ping: Neon suspends idle compute, so stale pooled connections are common.
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


def backend_name() -> str:
    return "postgres" if engine() else "memory"


def _rows(sql: str, **params) -> list[dict]:
    from sqlalchemy import text

    with engine().connect() as conn:
        return [dict(r._mapping) for r in conn.execute(text(sql), params)]


# ---- Reference data (cached: it only changes when we re-seed) ----


@cache
def catalog() -> dict[str, CatalogItem]:
    rows = _rows("select * from catalog_items order by id") if engine() else load_json("catalog.json")
    return {r["id"]: CatalogItem(**{**r, "price": float(r["price"])}) for r in rows}


@cache
def explanations() -> dict[str, Explanation]:
    if engine():
        return {r["catalog_id"]: Explanation(**r) for r in _rows("select * from explanations")}
    return {k: Explanation(**v) for k, v in load_json("explanations.json").items()}


@cache
def templates() -> dict[str, Template]:
    rows = _rows("select * from templates order by id") if engine() else load_json("templates.json")
    return {t["id"]: Template(**t) for t in rows}


@cache
def symptoms() -> dict[str, Symptom]:
    return {s["id"]: Symptom(**s) for s in load_json("symptoms.json")}


@cache
def resources() -> list[Resource]:
    rows = _rows("select * from resources order by sort_order") if engine() else load_json("resources.json")
    return [Resource(**r) for r in rows]


# ---- Plans ----

_plans: dict[str, Plan] = {}

_PLAN_COLUMNS = (
    "id", "pet", "owner_name", "owner_email", "budget", "payment_choice", "status",
    "share_token", "symptoms", "notes", "source", "items",
)
_JSON_COLUMNS = {"pet", "items"}


def new_id() -> str:
    return secrets.token_urlsafe(6)


def save_plan(plan: Plan) -> Plan:
    if not engine():
        _plans[plan.id] = plan
        return plan

    data = plan.model_dump(mode="json")
    params = {c: json.dumps(data[c]) if c in _JSON_COLUMNS else data[c] for c in _PLAN_COLUMNS}
    values = ", ".join(f"cast(:{c} as jsonb)" if c in _JSON_COLUMNS else f":{c}" for c in _PLAN_COLUMNS)
    updates = ", ".join(f"{c} = excluded.{c}" for c in _PLAN_COLUMNS if c != "id")
    from sqlalchemy import text

    with engine().begin() as conn:
        conn.execute(
            text(
                f"insert into plans ({', '.join(_PLAN_COLUMNS)}) values ({values}) "
                f"on conflict (id) do update set {updates}, updated_at = now()"
            ),
            params,
        )
    return plan


def _plan_from_row(rows: list[dict]) -> Plan | None:
    if not rows:
        return None
    row = rows[0]
    return Plan.model_validate({c: row[c] for c in _PLAN_COLUMNS})


def get_plan(plan_id: str) -> Plan | None:
    if not engine():
        return _plans.get(plan_id)
    return _plan_from_row(_rows("select * from plans where id = :id", id=plan_id))


def get_plan_by_token(token: str) -> Plan | None:
    if not engine():
        return next((p for p in _plans.values() if p.share_token == token), None)
    return _plan_from_row(_rows("select * from plans where share_token = :t", t=token))


def ping() -> bool:
    """True if the database answers (always True in memory mode)."""
    if not engine():
        return True
    try:
        _rows("select 1")
        return True
    except Exception:
        return False
