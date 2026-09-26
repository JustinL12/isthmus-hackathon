"""AI endpoints (stretch goal)."""

from fastapi import APIRouter, HTTPException, UploadFile

from ..models import ParsedLineItem
from ..services import claude

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/parse-estimate", response_model=list[ParsedLineItem])
async def parse_estimate(file: UploadFile):
    if not claude.is_configured():
        raise HTTPException(503, "ANTHROPIC_API_KEY not set")
    try:
        return await claude.parse_estimate(await file.read(), file.content_type or "application/pdf")
    except NotImplementedError:
        raise HTTPException(501, "Estimate parsing not built yet")
