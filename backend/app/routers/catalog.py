"""Clinic price list: list, add, edit, remove (soft) and restore procedures.

Plans keep the price they were built with; edits only affect new plans.
TODO: protect the write endpoints with a clinic PIN before sharing the URL widely.
"""

import re

from fastapi import APIRouter, HTTPException

from .. import store
from ..models import CatalogItem, CatalogItemCreate, CatalogItemDetail, CatalogItemUpdate, Explanation

router = APIRouter(prefix="/catalog", tags=["catalog"])


def _slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "item"
    taken, slug, n = store.all_catalog(), base, 1
    while slug in taken:
        n += 1
        slug = f"{base}-{n}"
    return slug


def _check_name_free(name: str, except_id: str | None = None) -> None:
    key = name.strip().lower()
    for item in store.catalog().values():
        if item.id != except_id and item.name.strip().lower() == key:
            raise HTTPException(409, f"'{item.name}' is already on the price list")


def _get_or_404(item_id: str) -> CatalogItem:
    item = store.all_catalog().get(item_id)
    if not item:
        raise HTTPException(404, "Procedure not found")
    return item


@router.get("", response_model=list[CatalogItem])
def list_catalog(include_inactive: bool = False):
    """Active items; `?include_inactive=true` also returns removed ones (for the clinic's list).
    `default_group` includes the groups of AI-made templates, which keep them on the template."""
    items = list((store.all_catalog() if include_inactive else store.catalog()).values())
    grouped = [t for t in store.templates().values() if t.groups]
    if not grouped:
        return items
    return [
        i.model_copy(update={"default_group": {**i.default_group, **{t.id: t.groups[i.id] for t in grouped if i.id in t.groups}}})
        for i in items
    ]


@router.post("", response_model=CatalogItemDetail, status_code=201)
def create_item(req: CatalogItemCreate):
    name = req.name.strip()
    _check_name_free(name)
    item = CatalogItem(id=_slug(name), name=name, code=req.code.strip(), price=req.price)
    explanation = Explanation(**req.explanation.model_dump()) if req.explanation else None
    return store.save_catalog_item(item, explanation)


@router.patch("/{item_id}", response_model=CatalogItemDetail)
def update_item(item_id: str, req: CatalogItemUpdate):
    item = _get_or_404(item_id)
    changes = req.model_dump(exclude_none=True, exclude={"explanation"})
    if "name" in changes:
        changes["name"] = changes["name"].strip()
    if "code" in changes:
        changes["code"] = changes["code"].strip()
    updated = item.model_copy(update=changes)
    if updated.active and (updated.name != item.name or not item.active):
        _check_name_free(updated.name, except_id=item_id)
    explanation = Explanation(**req.explanation.model_dump()) if req.explanation else None
    return store.save_catalog_item(updated, explanation)


@router.delete("/{item_id}", response_model=CatalogItemDetail)
def remove_item(item_id: str):
    """Soft delete: hidden from templates, search, suggestions and new plans; restore with PATCH active=true."""
    item = _get_or_404(item_id)
    return store.save_catalog_item(item.model_copy(update={"active": False}), None)
