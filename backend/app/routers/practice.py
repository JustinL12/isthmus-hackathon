"""Vet student practice: random case, ask the owner, run tests, grade the plan."""

from fastapi import APIRouter, HTTPException

from ..models import AskRequest, AskResponse, GradeRequest, GradeResponse, PracticeCase, TestRequest, TestResponse
from ..services import owner_ai, practice

router = APIRouter(prefix="/practice", tags=["practice"])


def _case(case_id: str) -> dict:
    case = practice.get_case(case_id)
    if case is None:
        raise HTTPException(404, "Case not found")
    return case


@router.post("/cases", response_model=PracticeCase)
def new_case(exclude: str | None = None):
    """A random stored case: basics only. `exclude` skips the case just played."""
    return practice.public_case(practice.random_case(exclude))


@router.post("/cases/{case_id}/ask", response_model=AskResponse)
async def ask(case_id: str, req: AskRequest):
    case = _case(case_id)
    parsed = await owner_ai.classify(req.question)
    return practice.compose_answer(case, parsed, req.known)


@router.post("/cases/{case_id}/tests", response_model=TestResponse)
def run_test(case_id: str, req: TestRequest):
    result = practice.run_test(_case(case_id), req.catalog_id)
    if result is None:
        raise HTTPException(422, "Not a test")
    return result


@router.post("/cases/{case_id}/grade", response_model=GradeResponse)
def grade(case_id: str, req: GradeRequest):
    return practice.grade(_case(case_id), req)
