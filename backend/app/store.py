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

from .models import CatalogItem, CatalogItemDetail, Explanation, Plan, Resource, Symptom, Template

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


# ---- Reference data ----
# Cached per process; the catalog writes below clear the caches. (Render runs one process.)

# Memory mode: editable copies of the JSON, loaded on first use.
_mem_catalog: dict[str, dict] | None = None
_mem_explanations: dict[str, dict] | None = None


def _mem() -> tuple[dict[str, dict], dict[str, dict]]:
    global _mem_catalog, _mem_explanations
    if _mem_catalog is None:
        _mem_catalog = {c["id"]: c for c in load_json("catalog.json")}
        _mem_explanations = load_json("explanations.json")
    return _mem_catalog, _mem_explanations


@cache
def all_catalog() -> dict[str, CatalogItem]:
    """Every catalog item, including ones the clinic removed."""
    rows = _rows("select * from catalog_items order by id") if engine() else list(_mem()[0].values())
    return {r["id"]: CatalogItem(**{**r, "price": float(r["price"])}) for r in rows}


@cache
def catalog() -> dict[str, CatalogItem]:
    """Active items only: what templates, suggestions, search and new plans may use."""
    return {k: v for k, v in all_catalog().items() if v.active}


@cache
def explanations() -> dict[str, Explanation]:
    if engine():
        return {r["catalog_id"]: Explanation(**r) for r in _rows("select * from explanations")}
    return {k: Explanation(**v) for k, v in _mem()[1].items()}


@cache
def templates() -> dict[str, Template]:
    """Templates, with removed items left out of item_ids."""
    rows = _rows("select * from templates order by id") if engine() else load_json("templates.json")
    active = catalog()
    return {t["id"]: Template(**{**t, "item_ids": [i for i in t["item_ids"] if i in active]}) for t in rows}


def clear_caches() -> None:
    for f in (all_catalog, catalog, explanations, templates):
        f.cache_clear()


def reset_memory() -> None:
    """Tests: throw away in-memory edits and plans."""
    global _mem_catalog, _mem_explanations
    _mem_catalog = _mem_explanations = None
    _plans.clear()
    clear_caches()


# ---- Catalog edits (clinic price list) ----


def catalog_detail(item_id: str) -> CatalogItemDetail | None:
    item = all_catalog().get(item_id)
    return item and CatalogItemDetail(**item.model_dump(), explanation=explanations().get(item_id))


def save_catalog_item(item: CatalogItem, explanation: Explanation | None) -> CatalogItemDetail:
    """Insert or update one item (and its explanation, when given) in a single transaction."""
    if engine():
        from sqlalchemy import text

        with engine().begin() as conn:
            conn.execute(
                text(
                    "insert into catalog_items (id, name, code, price, aliases, default_group, active, updated_at) "
                    "values (:id, :name, :code, :price, :aliases, cast(:default_group as jsonb), :active, now()) "
                    "on conflict (id) do update set name = excluded.name, code = excluded.code, "
                    "price = excluded.price, active = excluded.active, updated_at = now()"
                ),
                {**item.model_dump(), "default_group": json.dumps(item.default_group)},
            )
            if explanation:
                conn.execute(
                    text(
                        "insert into explanations (catalog_id, what, why, if_postponed) "
                        "values (:id, :what, :why, :if_postponed) on conflict (catalog_id) do update set "
                        "what = excluded.what, why = excluded.why, if_postponed = excluded.if_postponed"
                    ),
                    {"id": item.id, **explanation.model_dump()},
                )
    else:
        cat, exp = _mem()
        cat[item.id] = item.model_dump()
        if explanation:
            exp[item.id] = explanation.model_dump()
    clear_caches()
    return catalog_detail(item.id)


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
    "share_token", "symptoms", "notes", "source", "items", "suggested",
)
_JSON_COLUMNS = {"pet", "items", "suggested"}


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
