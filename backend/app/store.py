"""Data access layer.

For now: seed data comes from app/data/*.json and plans live in memory
(lost on restart). Swap the plan functions for Supabase calls later —
routers only talk to this module, so nothing else should need to change.
"""

import json
import secrets
from functools import cache
from pathlib import Path

from .models import CatalogItem, Explanation, Plan, Resource, Template

DATA_DIR = Path(__file__).parent / "data"


def _load(name: str):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


@cache
def catalog() -> dict[str, CatalogItem]:
    return {c["id"]: CatalogItem(**c) for c in _load("catalog.json")}


@cache
def explanations() -> dict[str, Explanation]:
    return {k: Explanation(**v) for k, v in _load("explanations.json").items()}


@cache
def templates() -> dict[str, Template]:
    return {t["id"]: Template(**t) for t in _load("templates.json")}


@cache
def resources() -> list[Resource]:
    return [Resource(**r) for r in _load("resources.json")]


# ---- Plans (in-memory for now; TODO: Supabase `plans` + `plan_items`) ----

_plans: dict[str, Plan] = {}


def new_id() -> str:
    return secrets.token_urlsafe(6)


def save_plan(plan: Plan) -> Plan:
    _plans[plan.id] = plan
    return plan


def get_plan(plan_id: str) -> Plan | None:
    return _plans.get(plan_id)


def get_plan_by_token(token: str) -> Plan | None:
    return next((p for p in _plans.values() if p.share_token == token), None)
