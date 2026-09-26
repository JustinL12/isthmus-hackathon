"""Pydantic models. These mirror frontend/src/lib/types.ts — keep them in sync."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Group = Literal["essential", "soon", "optional"]
PaymentChoice = Literal["pay_today", "split"]
PlanStatus = Literal["draft", "agreed"]
Species = Literal["cat", "dog"]
PlanSource = Literal["suggest", "template"]


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
    active: bool = True  # False = removed by the clinic (hidden, kept for history)


class CatalogItemDetail(CatalogItem):
    explanation: Explanation | None = None


# ---- Clinic price list edits ----

NonBlank = Field(min_length=1, max_length=400, pattern=r"\S")


class ExplanationIn(BaseModel):
    what: str = NonBlank
    why: str = NonBlank
    if_postponed: str = NonBlank


class CatalogItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80, pattern=r"\S")
    price: float = Field(ge=0, le=100_000)
    code: str = Field("", max_length=20)
    explanation: ExplanationIn | None = None


class CatalogItemUpdate(BaseModel):
    """Partial update: fields left out are unchanged."""

    name: str | None = Field(None, min_length=1, max_length=80, pattern=r"\S")
    price: float | None = Field(None, ge=0, le=100_000)
    code: str | None = Field(None, max_length=20)
    explanation: ExplanationIn | None = None
    active: bool | None = None


class Template(BaseModel):
    id: str
    name: str
    species: Species
    item_ids: list[str]
    symptoms: list[str] = []  # symptom ids, used to pick a fallback template


class Symptom(BaseModel):
    id: str
    label: str
    species: list[Species]


class Resource(BaseModel):
    id: str
    name: str
    offers: str
    eligibility: str | None = None
    url: str | None = None
    phone: str | None = None


class Pet(BaseModel):
    name: str
    species: Species
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
    reason: str | None = None  # why it was suggested (AI / similar cases)
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
    symptoms: list[str] = []
    notes: str | None = None
    owner_email: str | None = None
    source: PlanSource = "template"
    suggested: list["ItemChoice"] = []  # the AI draft as first shown, so vet changes can be learned from


# ---- Request bodies ----


class ItemChoice(BaseModel):
    catalog_id: str
    group: Group
    reason: str | None = None


Plan.model_rebuild()  # resolve the forward reference to ItemChoice


class CreatePlanRequest(BaseModel):
    """Build from `items` (from /suggest) or, failing that, from `template_id`."""

    template_id: str | None = None
    items: list[ItemChoice] | None = None
    pet: Pet
    owner_name: str
    budget: float | None = None
    symptoms: list[str] = []
    notes: str | None = None
    owner_email: str | None = None


class UpdatePlanRequest(BaseModel):
    """Partial update: any field left as None is unchanged."""

    budget: float | None = None
    payment_choice: PaymentChoice | None = None
    items: list[PlanItem] | None = None
    owner_email: str | None = None


class SuggestRequest(BaseModel):
    species: Species
    age_years: float | None = None
    symptoms: list[str]
    notes: str | None = None


class SuggestedItem(ItemChoice):
    name: str
    price: float


class SuggestResponse(BaseModel):
    items: list[SuggestedItem]
    source: Literal["databricks+claude", "databricks", "template", "none"]
    similar_case_count: int = 0
    vet_case_count: int = 0  # how many of the similar cases are real plans from this clinic
    fallback_template_id: str | None = None


class EmailRequest(BaseModel):
    email: str


class ParsedLineItem(BaseModel):
    raw_name: str
    price: float | None = None
    catalog_id: str | None = Field(None, description="Matched catalog item, if any")
