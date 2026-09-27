"""Reference data: explanation library, templates (ranked for a patient; vets can hide
AI-made ones), symptoms (vets can add to the list), Madison resources. The catalog (price
list) lives in routers/catalog.py."""

import re

from fastapi import APIRouter, HTTPException

from .. import store
from ..models import Explanation, Resource, SuggestRequest, Symptom, SymptomCreate, Template, TemplateRank
from ..services import templates

router = APIRouter(tags=["reference"])


@router.get("/symptoms", response_model=list[Symptom])
def list_symptoms():
    return list(store.symptoms().values())


@router.post("/symptoms", response_model=Symptom, status_code=201)
def add_symptom(req: SymptomCreate):
    """Add a symptom to the list (or return the existing one with the same name).
    New symptoms reach suggestions once agreed plans that use them are in Databricks."""
    label = " ".join(req.label.split())
    for s in store.symptoms().values():
        if s.label.lower() == label.lower():
            return s
    base = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-") or "symptom"
    taken, slug, n = store.symptoms(), base, 1
    while slug in taken:
        n += 1
        slug = f"{base}-{n}"
    return store.add_symptom(Symptom(id=slug, label=label[0].upper() + label[1:], species=req.species))


@router.get("/explanations", response_model=dict[str, Explanation])
def list_explanations():
    """Explanation library keyed by catalog item id (for items the vet adds to a plan)."""
    return store.explanations()


@router.get("/templates", response_model=list[Template])
def list_templates():
    return list(store.templates().values())


@router.post("/templates/rank", response_model=list[TemplateRank])
async def rank_templates(req: SuggestRequest):
    """This species' templates, best fit for the patient first, with short reasons."""
    return await templates.rank_templates(req)


@router.delete("/templates/{template_id}", response_model=Template)
def hide_template(template_id: str):
    """Hide an AI-made template. It isn't made again for the same patients and symptom."""
    template = store.all_templates().get(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    if template.origin != "ai":
        raise HTTPException(403, "Only AI-made templates can be hidden")
    return store.save_template(template.model_copy(update={"active": False}))


@router.get("/resources", response_model=list[Resource])
def list_resources():
    return store.resources()
