"""Pydantic models. These mirror frontend/src/lib/types.ts — keep them in sync."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from .species import SPECIES_IDS

Group = Literal["essential", "soon", "optional"]
PaymentChoice = Literal["pay_today", "split"]
PlanStatus = Literal["draft", "agreed"]
Species = Literal[SPECIES_IDS]  # type: ignore[valid-type]  # the ids in species.py
PlanSource = Literal["suggest", "template", "blank"]


class Explanation(BaseModel):
    what: str  # plain-language description
    why: str  # why it matters
    if_postponed: str
    # Fuller details for the item's details dialog (optional; shown when present).
    steps: str | None = None  # what happens, step by step, and how long it takes
    cost_includes: str | None = None  # what the price covers
    questions: list[str] = []  # questions the owner might ask the vet


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
    steps: str | None = Field(None, max_length=400)
    cost_includes: str | None = Field(None, max_length=400)
    questions: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field([], max_length=5)


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


TemplateOrigin = Literal["clinic", "ai"]


class Template(BaseModel):
    id: str
    name: str
    species: Species
    item_ids: list[str]
    symptoms: list[str] = []  # symptom ids, used to rank templates and pick a fallback
    # Patients the template is for (None / [] = any); used to rank templates for a patient.
    age_min: float | None = None
    age_max: float | None = None
    weight_min_lbs: float | None = None
    weight_max_lbs: float | None = None
    breeds: list[str] = []
    groups: dict[str, Group] = {}  # catalog id -> group; else the item's default_group for this template
    origin: TemplateOrigin = "clinic"  # "ai" = made by services/template_gen.py from past visits
    based_on: int = 0  # AI templates: how many past visits they were made from
    summary: str | None = None  # AI templates: one line on who they're for
    active: bool = True  # False = hidden by a vet

    def group_for(self, item: CatalogItem) -> Group:
        return self.groups.get(item.id) or item.default_group.get(self.id, "soon")


class TemplateRank(BaseModel):
    template_id: str
    score: float
    reasons: list[str]  # short chips for the vet, e.g. "Matches 2 symptoms"


class Symptom(BaseModel):
    id: str
    label: str
    species: list[Species]


class SymptomCreate(BaseModel):
    label: str = Field(min_length=1, max_length=60, pattern=r"\S")
    species: list[Species] = ["cat", "dog"]


class Resource(BaseModel):
    id: str
    name: str
    offers: str
    eligibility: str | None = None
    url: str | None = None
    phone: str | None = None


Breed = Field(None, max_length=60)
AgeYears = Field(None, ge=0, le=150)  # long-lived pets (tortoises, parrots) can pass 100
WeightLbs = Field(None, gt=0, le=300)


class Pet(BaseModel):
    name: str
    species: Species
    age_years: float | None = AgeYears
    breed: str | None = Breed  # free text; the setup form suggests common breeds
    weight_lbs: float | None = WeightLbs
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
    template_id: str | None = None  # what the vet started from: a template id, "ai" or "blank"


class PlanSummary(BaseModel):
    """One visit in the vet's "Previous visits" list (GET /plans)."""

    id: str
    pet: Pet
    owner_name: str
    status: PlanStatus
    share_token: str | None = None
    item_count: int
    total_today: float  # items selected for today
    created_at: datetime | None = None


# ---- Request bodies ----


class ItemChoice(BaseModel):
    catalog_id: str
    group: Group
    reason: str | None = None


Plan.model_rebuild()  # resolve the forward reference to ItemChoice


class CreatePlanRequest(BaseModel):
    """Build from `items` (from /suggest), else from `template_id`. `items: []` starts a blank plan."""

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
    age_years: float | None = AgeYears
    breed: str | None = Breed
    weight_lbs: float | None = WeightLbs
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
