"""Teacher result & evaluation endpoints. All routes verify teacher ownership."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.dependencies import require_roles
from app.database.mongodb import db
from app.services import teacher_result_service

router = APIRouter(tags=["Teacher Results"])


def _bad(message: str, code: int = 400):
    return HTTPException(status_code=code, detail=message)


class EvaluateAnswerRequest(BaseModel):
    marks_awarded: int = Field(ge=0)
    feedback: str | None = None
    model_config = ConfigDict(extra="forbid")


@router.get("/teacher/tests/{test_id}/results")
async def test_results(test_id: str, current_user=Depends(require_roles("teacher"))):
    database = db.get_db()
    data = await teacher_result_service.list_test_results(database, current_user["id"], test_id)
    if data is None:
        raise _bad("Test not found", 404)
    return {
        "success": True,
        "stats": data["stats"],
        "results": data["results"],
    }


@router.get("/teacher/results/pending-evaluation")
async def pending_evaluation(current_user=Depends(require_roles("teacher"))):
    database = db.get_db()
    return {
        "success": True,
        "pending": await teacher_result_service.pending_evaluation(database, current_user["id"]),
    }


@router.get("/teacher/results/{result_id}")
async def result_detail(result_id: str, current_user=Depends(require_roles("teacher"))):
    database = db.get_db()
    detail = await teacher_result_service.get_result_detail(database, current_user["id"], result_id)
    if detail is None:
        raise _bad("Result not found", 404)
    return {"success": True, "result": detail}


@router.patch("/teacher/results/{result_id}/answers/{question_id}/evaluate")
async def evaluate_answer(
    result_id: str,
    question_id: str,
    body: EvaluateAnswerRequest,
    current_user=Depends(require_roles("teacher")),
):
    database = db.get_db()
    updated = await teacher_result_service.evaluate_answer(
        database, current_user["id"], result_id, question_id, body.marks_awarded, body.feedback
    )
    if updated is None:
        raise _bad("Answer not found, or marks outside the allowed range", 404)
    return {"success": True, **updated}


@router.post("/teacher/results/{result_id}/finalize")
async def finalize_result(result_id: str, current_user=Depends(require_roles("teacher"))):
    database = db.get_db()
    finalized = await teacher_result_service.finalize_result(database, current_user["id"], result_id)
    if finalized is None:
        raise _bad("Result not found", 404)
    return {"success": True, "result": finalized}


@router.get("/teacher/classrooms/{classroom_id}/performance")
async def classroom_performance(classroom_id: str, current_user=Depends(require_roles("teacher"))):
    database = db.get_db()
    perf = await teacher_result_service.classroom_performance(database, current_user["id"], classroom_id)
    if perf is None:
        raise _bad("Classroom not found", 404)
    return {"success": True, "performance": perf}


@router.get("/teacher/students/{student_id}/performance")
async def student_performance(student_id: str, current_user=Depends(require_roles("teacher"))):
    database = db.get_db()
    perf = await teacher_result_service.student_performance_for_teacher(
        database, current_user["id"], student_id
    )
    if perf is None:
        raise _bad("Student not found in your classrooms", 404)
    return {"success": True, "performance": perf}
