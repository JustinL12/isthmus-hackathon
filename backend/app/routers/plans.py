"""Plans: create from a template, update on the shared screen, agree, and share."""

import secrets

from fastapi import APIRouter, HTTPException

from .. import store
from ..models import CreatePlanRequest, Plan, PlanItem, UpdatePlanRequest
from ..services.rechecks import suggest_recheck

router = APIRouter(tags=["plans"])


def _get_or_404(plan_id: str) -> Plan:
    plan = store.get_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    return plan


@router.post("/plans", response_model=Plan)
def create_plan(req: CreatePlanRequest):
    template = store.templates().get(req.template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    catalog, explanations = store.catalog(), store.explanations()
    items = [
        PlanItem(
            id=store.new_id(),
            catalog_id=cid,
            name=catalog[cid].name,
            price=catalog[cid].price,
            group=catalog[cid].default_group.get(template.id, "soon"),
            explanation=explanations.get(cid),
        )
        for cid in template.item_ids
    ]
    plan = Plan(id=store.new_id(), pet=req.pet, owner_name=req.owner_name, budget=req.budget, items=items)
    return store.save_plan(plan)


@router.get("/plans/{plan_id}", response_model=Plan)
def get_plan(plan_id: str):
    return _get_or_404(plan_id)


@router.patch("/plans/{plan_id}", response_model=Plan)
def update_plan(plan_id: str, req: UpdatePlanRequest):
    plan = _get_or_404(plan_id)
    if plan.status == "agreed":
        raise HTTPException(409, "Plan already agreed")
    updated = Plan.model_validate(plan.model_dump() | req.model_dump(exclude_none=True))
    # TODO: broadcast to other screens (Supabase realtime) once we have a DB.
    return store.save_plan(updated)


@router.post("/plans/{plan_id}/agree", response_model=Plan)
def agree_plan(plan_id: str):
    """Lock the plan, create a share link, and schedule rechecks for postponed items."""
    plan = _get_or_404(plan_id)
    items = [
        i if i.selected else i.model_copy(update={"recheck_date": suggest_recheck(i.group)})
        for i in plan.items
    ]
    agreed = plan.model_copy(
        update={"status": "agreed", "share_token": plan.share_token or secrets.token_urlsafe(8), "items": items}
    )
    return store.save_plan(agreed)


@router.get("/share/{token}", response_model=Plan)
def get_shared_plan(token: str):
    plan = store.get_plan_by_token(token)
    if not plan:
        raise HTTPException(404, "Share link not found")
    return plan
