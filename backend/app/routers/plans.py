"""Plans: create (from suggestions or a template), update on the shared screen, agree, share, email."""

import secrets

from fastapi import APIRouter, BackgroundTasks, HTTPException, Response

from .. import store
from ..models import CreatePlanRequest, EmailRequest, ItemChoice, Plan, PlanItem, UpdatePlanRequest
from ..services import databricks, email
from ..services.rechecks import suggest_recheck
from ..services.summary_pdf import build_pdf

router = APIRouter(tags=["plans"])


def _get_or_404(plan_id: str) -> Plan:
    plan = store.get_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    return plan


def _shared_or_404(token: str) -> Plan:
    plan = store.get_plan_by_token(token)
    if not plan:
        raise HTTPException(404, "Share link not found")
    return plan


@router.post("/plans", response_model=Plan)
def create_plan(req: CreatePlanRequest):
    catalog, explanations = store.catalog(), store.explanations()

    if req.items:
        choices, source = req.items, "suggest"
    elif req.template_id:
        template = store.templates().get(req.template_id)
        if not template:
            raise HTTPException(404, "Template not found")
        choices = [ItemChoice(catalog_id=cid, group=catalog[cid].default_group.get(template.id, "soon")) for cid in template.item_ids]
        source = "template"
    elif req.items is not None:
        choices, source = [], "blank"  # the vet adds everything from the price list
    else:
        raise HTTPException(422, "Send either items or template_id")

    unknown = [c.catalog_id for c in choices if c.catalog_id not in catalog]
    if unknown:
        raise HTTPException(422, f"Unknown catalog ids: {unknown}")

    items = [
        PlanItem(
            id=store.new_id(),
            catalog_id=c.catalog_id,
            name=catalog[c.catalog_id].name,
            price=catalog[c.catalog_id].price,
            group=c.group,
            reason=c.reason,
            explanation=explanations.get(c.catalog_id),
        )
        for c in choices
    ]
    plan = Plan(
        id=store.new_id(),
        pet=req.pet,
        owner_name=req.owner_name,
        owner_email=req.owner_email,
        budget=req.budget,
        symptoms=req.symptoms,
        notes=req.notes,
        source=source,
        items=items,
        suggested=choices if source == "suggest" else [],
    )
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
    return store.save_plan(updated)


@router.post("/plans/{plan_id}/agree", response_model=Plan)
def agree_plan(plan_id: str, background: BackgroundTasks):
    """Lock the plan, create a share link, schedule rechecks, then (in the background)
    export it to Databricks and email the owner if we have their address."""
    plan = _get_or_404(plan_id)
    items = [
        i if i.selected else i.model_copy(update={"recheck_date": suggest_recheck(i.group)})
        for i in plan.items
    ]
    agreed = plan.model_copy(
        update={"status": "agreed", "share_token": plan.share_token or secrets.token_urlsafe(8), "items": items}
    )
    store.save_plan(agreed)
    if plan.status != "agreed":
        background.add_task(databricks.export_agreed_plan, agreed)
        if agreed.owner_email and email.is_configured():
            background.add_task(email.send_summary_quietly, agreed, agreed.owner_email)
    return agreed


@router.post("/plans/{plan_id}/email")
def email_plan(plan_id: str, req: EmailRequest):
    plan = _get_or_404(plan_id)
    if plan.status != "agreed":
        raise HTTPException(409, "Agree to the plan before emailing it")
    if not email.is_configured():
        raise HTTPException(503, "RESEND_API_KEY not set")
    try:
        email.send_summary(plan, req.email)
    except Exception as e:
        raise HTTPException(502, f"Email failed: {e}")
    return {"sent": True}


@router.get("/share/{token}", response_model=Plan)
def get_shared_plan(token: str):
    return _shared_or_404(token)


@router.get("/share/{token}/pdf")
def get_shared_pdf(token: str):
    plan = _shared_or_404(token)
    return Response(
        build_pdf(plan),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{plan.pet.name}-care-plan.pdf"'},
    )
