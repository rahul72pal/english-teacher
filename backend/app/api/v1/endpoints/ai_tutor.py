from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.dependencies import require_roles
from app.database.mongodb import db
from app.services import ai_tutor_service
from app.services.ai_tutor_service import tutor_answer

router = APIRouter(prefix="/student", tags=["AI Tutor"])


class TutorQuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    # Optional: ask about a specific chapter. When omitted, the tutor searches
    # all chapters in the classroom.
    chapter_id: str | None = Field(default=None)


class TutorAnswerResponse(BaseModel):
    success: bool = True
    answer: str
    citations: list[dict]


async def _enrollment_active(student_id: str, classroom_id: str):
    database = db.get_db()
    return await database.enrollments.find_one(
        {"classroom_id": classroom_id, "student_id": student_id, "status": "active"}
    )


async def _validate_access(current_user: dict, classroom_id: str, chapter_id: str | None) -> None:
    """Students must be enrolled; teachers must own the classroom."""
    database = db.get_db()
    if current_user["role"] == "student":
        enrollment = await _enrollment_active(current_user["id"], classroom_id)
        if enrollment is None:
            raise HTTPException(status_code=403, detail="You are not enrolled in this classroom")
    else:
        if not ObjectId.is_valid(classroom_id):
            raise HTTPException(status_code=404, detail="Classroom not found")
        classroom = await database.classrooms.find_one(
            {"_id": ObjectId(classroom_id), "teacher_id": current_user["id"]}
        )
        if classroom is None:
            raise HTTPException(status_code=404, detail="Classroom not found")

    # The requested chapter must belong to this classroom
    if chapter_id is not None:
        if not ObjectId.is_valid(chapter_id):
            raise HTTPException(status_code=404, detail="Chapter not found")
        chapter = await database.chapters.find_one(
            {"_id": ObjectId(chapter_id), "classroom_id": classroom_id}
        )
        if chapter is None:
            raise HTTPException(status_code=404, detail="Chapter not found in this classroom")


@router.post("/classrooms/{classroom_id}/tutor", response_model=TutorAnswerResponse)
async def ask_tutor(
    classroom_id: str,
    data: TutorQuestionRequest,
    current_user=Depends(require_roles("teacher", "student")),
):
    await _validate_access(current_user, classroom_id, data.chapter_id)

    try:
        result = await tutor_answer(classroom_id, data.question, data.chapter_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


@router.post("/classrooms/{classroom_id}/tutor/stream")
async def ask_tutor_stream(
    classroom_id: str,
    data: TutorQuestionRequest,
    current_user=Depends(require_roles("teacher", "student")),
):
    from fastapi.responses import StreamingResponse

    from app.services.ai_tutor_service import tutor_answer_stream

    await _validate_access(current_user, classroom_id, data.chapter_id)
    return StreamingResponse(
        tutor_answer_stream(classroom_id, data.question, data.chapter_id),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
