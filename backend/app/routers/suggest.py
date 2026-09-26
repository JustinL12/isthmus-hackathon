"""Symptom-based suggestions (Databricks similar cases + Claude, with template fallback)."""

from fastapi import APIRouter

from ..models import SuggestRequest, SuggestResponse
from ..services import suggest as suggest_service

router = APIRouter(tags=["suggest"])


@router.post("/suggest", response_model=SuggestResponse)
async def suggest(req: SuggestRequest):
    return await suggest_service.suggest(req)
