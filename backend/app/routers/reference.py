"""Read-only reference data: catalog, templates, Madison resources."""

from fastapi import APIRouter

from .. import store
from ..models import CatalogItem, Resource, Template

router = APIRouter(tags=["reference"])


@router.get("/catalog", response_model=list[CatalogItem])
def list_catalog():
    return list(store.catalog().values())


@router.get("/templates", response_model=list[Template])
def list_templates():
    return list(store.templates().values())


@router.get("/resources", response_model=list[Resource])
def list_resources():
    return store.resources()
