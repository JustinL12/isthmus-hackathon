"""Pydantic models. These mirror frontend/src/lib/types.ts — keep them in sync."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Group = Literal["essential", "soon", "optional"]
PaymentChoice = Literal["pay_today", "split"]
PlanStatus = Literal["draft", "agreed"]


class Explanation(BaseModel):
    what: str  # plain-language description
    why: str  # why it matters
    if_postponed: str


class CatalogItem(BaseModel):
    id: str
    name: str
    code: str
    price: float
    aliases: list[str] = []  # messy estimate names, e.g. "CBC w/ diff"
    default_group: dict[str, Group] = {}  # visit template id -> suggested group


class Template(BaseModel):
    id: str
    name: str
    species: Literal["cat", "dog"]
    item_ids: list[str]


class Resource(BaseModel):
    id: str
    name: str
    offers: str
    eligibility: str | None = None
    url: str | None = None
    phone: str | None = None


class Pet(BaseModel):
    name: str
    species: Literal["cat", "dog"]
    age_years: float | None = None
    reason: str = ""


class PlanItem(BaseModel):
    id: str
    catalog_id: str
    name: str
    price: float
    group: Group
    selected: bool = True
    vet_note: str | None = None
    explanation: Explanation | None = None
    recheck_date: date | None = None


class Plan(BaseModel):
    id: str
    pet: Pet
    owner_name: str
    budget: float | None = None
    payment_choice: PaymentChoice = "pay_today"
    status: PlanStatus = "draft"
    share_token: str | None = None
    items: list[PlanItem] = []


# ---- Request bodies ----


class CreatePlanRequest(BaseModel):
    template_id: str
    pet: Pet
    owner_name: str
    budget: float | None = None


class UpdatePlanRequest(BaseModel):
    """Partial update: any field left as None is unchanged."""

    budget: float | None = None
    payment_choice: PaymentChoice | None = None
    items: list[PlanItem] | None = None


class ParsedLineItem(BaseModel):
    raw_name: str
    price: float | None = None
    catalog_id: str | None = Field(None, description="Matched catalog item, if any")
