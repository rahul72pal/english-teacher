from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.core.dependencies import require_roles
from app.database.mongodb import db
from app.schemas.attempt import AnswerSaveRequest
from app.services import attempt_service, performance_service

router = APIRouter(tags=["Student Tests"])


def _bad(message: str, code: int = 400):
    return HTTPException(status_code=code, detail=message)


@router.get("/student/classrooms/{classroom_id}/tests")
async def list_classroom_tests(classroom_id: str, current_user=Depends(require_roles("student"))):
    database = db.get_db()
    tests = await attempt_service.list_classroom_tests(
        database, current_user["id"], classroom_id
    )
    if tests is None:
        raise _bad("You are not enrolled in this classroom", 403)
    return {"success": True, "tests": tests}


@router.get("/student/tests/{test_id}")
async def get_student_test(test_id: str, current_user=Depends(require_roles("student"))):
    database = db.get_db()
    result = await attempt_service.get_student_test(database, current_user["id"], test_id)
    if result is None:
        raise _bad("Test not found or not available for you", 404)
    return {"success": True, **result}


@router.post("/student/tests/{test_id}/attempts", status_code=status.HTTP_201_CREATED)
async def start_attempt(test_id: str, current_user=Depends(require_roles("student"))):
    database = db.get_db()
    try:
        result = await attempt_service.start_attempt(database, current_user["id"], test_id)
    except ValueError as e:
        raise _bad(str(e))
    return {"success": True, "resumed": result["resumed"], **result["attempt"]}


@router.get("/student/attempts/{attempt_id}")
async def get_attempt(attempt_id: str, current_user=Depends(require_roles("student"))):
    database = db.get_db()
    result = await attempt_service.get_attempt(database, current_user["id"], attempt_id)
    if result is None:
        raise _bad("Attempt not found", 404)
    return {"success": True, **result}


@router.put("/student/attempts/{attempt_id}/answers/{question_id}")
async def save_answer(
    attempt_id: str,
    question_id: str,
    data: AnswerSaveRequest,
    current_user=Depends(require_roles("student")),
):
    database = db.get_db()
    try:
        saved = await attempt_service.save_answer(
            database, current_user["id"], attempt_id, question_id, data.student_answer
        )
    except ValueError as e:
        message = str(e)
        code = 409 if "submitted" in message else 400
        raise _bad(message, code)
    return {"success": True, **saved}


@router.post("/student/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, current_user=Depends(require_roles("student"))):
    database = db.get_db()
    try:
        result = await attempt_service.submit_attempt(
            database, current_user["id"], attempt_id
        )
    except ValueError as e:
        raise _bad(str(e))
    if result is None:
        raise _bad("Attempt not found", 404)
    return {"success": True, "result": result}


@router.get("/student/attempts/{attempt_id}/result")
async def get_result(attempt_id: str, current_user=Depends(require_roles("student"))):
    database = db.get_db()
    result = await attempt_service.get_attempt_result(database, current_user["id"], attempt_id)
    if result is None:
        raise _bad("Result not found", 404)
    return {"success": True, "result": result}


@router.get("/student/tests/{test_id}/my-attempts")
async def my_attempts(test_id: str, current_user=Depends(require_roles("student"))):
    database = db.get_db()
    attempts = await attempt_service.list_test_attempts(database, current_user["id"], test_id)
    if attempts is None:
        raise _bad("Test not found", 404)
    return {"success": True, "attempts": attempts}


@router.get("/student/results")
async def all_results(current_user=Depends(require_roles("student"))):
    database = db.get_db()
    return {
        "success": True,
        "results": await attempt_service.list_student_results(database, current_user["id"]),
    }


@router.get("/student/performance")
async def performance(current_user=Depends(require_roles("student"))):
    database = db.get_db()
    perf = await performance_service.get_performance(database, current_user["id"])
    return {"success": True, "performance": perf}


@router.get("/student/results/{result_id}")
async def result_detail(result_id: str, current_user=Depends(require_roles("student"))):
    database = db.get_db()
    detail = await performance_service.get_result_detail(database, current_user["id"], result_id)
    if detail is None:
        raise _bad("Result not found", 404)
    return {"success": True, "result": detail}
