from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import require_roles
from app.database.mongodb import db
from app.schemas.test import (
    GenerateTestRequest,
    PublishRequest,
    QuestionEditRequest,
    RegenerateQuestionRequest,
    TestUpdateRequest,
)
from app.services import test_generation_service, test_service

router = APIRouter(tags=["Teacher Tests"])


@router.post("/teacher/tests/generate", status_code=status.HTTP_201_CREATED)
async def generate_test(
    data: GenerateTestRequest,
    current_user=Depends(require_roles("teacher")),
):
    if sum(data.question_distribution.model_dump().values()) == 0:
        raise HTTPException(status_code=400, detail="Select at least one question to generate")

    database = db.get_db()
    questions, warnings, chapter_ids = await test_generation_service.generate_test_questions(
        current_user["id"],
        data.classroom_id,
        data.chapter_ids,
        data.difficulty,
        data.question_distribution.model_dump(),
        database,
    )
    if not questions:
        raise HTTPException(
            status_code=400,
            detail="Could not generate any valid questions. " + "; ".join(warnings[:5]),
        )

    test_doc = await test_service.create_draft(
        database,
        current_user["id"],
        data.classroom_id,
        {
            "title": data.title,
            "difficulty": data.difficulty,
            "duration_minutes": data.duration_minutes,
            "passing_percentage": data.passing_percentage,
            "attempts_allowed": data.attempts_allowed,
            "start_at": data.start_at,
            "end_at": data.end_at,
        },
        questions,
        chapter_ids,
        warnings,
    )
    return {
        "success": True,
        "message": "Test generated as draft. Review the questions and publish.",
        "test": test_service._serialize_test(test_doc),
        "warnings": warnings,
    }


@router.get("/teacher/tests")
async def list_tests(current_user=Depends(require_roles("teacher"))):
    database = db.get_db()
    return {"tests": await test_service.list_tests(database, current_user["id"])}


@router.get("/teacher/tests/{test_id}")
async def get_test(test_id: str, current_user=Depends(require_roles("teacher"))):
    database = db.get_db()
    result = await test_service.get_test_with_questions(database, current_user["id"], test_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return {"success": True, **result}


@router.patch("/teacher/tests/{test_id}")
async def update_test(
    test_id: str,
    data: TestUpdateRequest,
    current_user=Depends(require_roles("teacher")),
):
    database = db.get_db()
    doc = await test_service.update_test(
        database, current_user["id"], test_id, data.model_dump(exclude_unset=True)
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return {"success": True, "test": test_service._serialize_test(doc)}


@router.patch("/teacher/tests/{test_id}/questions/{question_id}")
async def edit_question(
    test_id: str,
    question_id: str,
    data: QuestionEditRequest,
    current_user=Depends(require_roles("teacher")),
):
    database = db.get_db()
    question = await test_service.edit_question(
        database, current_user["id"], test_id, question_id, data.model_dump(exclude_unset=True)
    )
    if question is None:
        raise HTTPException(
            status_code=400, detail="Question not found or edit invalid (e.g. answer not in options)"
        )
    return {"success": True, "question": question}


@router.post("/teacher/tests/{test_id}/questions/{question_id}/approve")
async def approve_question(
    test_id: str,
    question_id: str,
    current_user=Depends(require_roles("teacher")),
):
    database = db.get_db()
    question = await test_service.approve_question(
        database, current_user["id"], test_id, question_id
    )
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"success": True, "question": question}


@router.delete("/teacher/tests/{test_id}/questions/{question_id}")
async def delete_question(
    test_id: str,
    question_id: str,
    current_user=Depends(require_roles("teacher")),
):
    database = db.get_db()
    deleted = await test_service.delete_question(
        database, current_user["id"], test_id, question_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"success": True, "message": "Question deleted and test totals recalculated"}


@router.post("/teacher/tests/{test_id}/questions/regenerate")
async def regenerate_question(
    test_id: str,
    data: RegenerateQuestionRequest,
    current_user=Depends(require_roles("teacher")),
):
    database = db.get_db()
    question = await test_service.regenerate_question(
        database, current_user["id"], test_id, data.question_id
    )
    if question is None:
        raise HTTPException(status_code=400, detail="Could not regenerate this question")
    return {"success": True, "question": question}


@router.post("/teacher/tests/{test_id}/publish")
async def publish_test(
    test_id: str,
    data: PublishRequest,
    current_user=Depends(require_roles("teacher")),
):
    database = db.get_db()
    doc = await test_service.publish_test(
        database, current_user["id"], test_id, data.model_dump(exclude_unset=True)
    )
    if doc is None:
        raise HTTPException(
            status_code=400,
            detail="Test not found, already published, or has no questions",
        )
    return {
        "success": True,
        "message": "Test published. Students can now attempt it within the schedule.",
        "test": test_service._serialize_test(doc),
    }


@router.delete("/teacher/tests/{test_id}")
async def delete_test(test_id: str, current_user=Depends(require_roles("teacher"))):
    database = db.get_db()
    deleted = await test_service.delete_test(database, current_user["id"], test_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Test not found")
    return {"success": True, "message": "Test and its questions deleted"}
