"""Reference data: explanation library, templates, symptoms (vets can add to the list),
Madison resources. The catalog (price list) lives in routers/catalog.py."""

import re

from fastapi import APIRouter

from .. import store
from ..models import Explanation, Resource, Symptom, SymptomCreate, Template

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


@router.get("/resources", response_model=list[Resource])
def list_resources():
    return store.resources()
