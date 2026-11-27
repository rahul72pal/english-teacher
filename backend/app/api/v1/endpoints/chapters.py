import asyncio

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.dependencies import require_roles
from app.schemas.chapter import ChapterListResponse, ChapterPagesResponse, ChunkSearchRequest
from app.services import chapter_service, cloudinary_service
from app.database.mongodb import db

router = APIRouter(tags=["Chapters"])

ALLOWED_CONTENT_TYPES = {"application/pdf"}
MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB


def _classroom_owned_by(classroom_id: str, teacher_id: str):
    database = db.get_db()
    if not ObjectId.is_valid(classroom_id):
        return None
    return database.classrooms.find_one(
        {"_id": ObjectId(classroom_id), "teacher_id": teacher_id}
    )


def _enrollment_active(student_id: str, classroom_id: str):
    database = db.get_db()
    return database.enrollments.find_one(
        {"classroom_id": classroom_id, "student_id": student_id, "status": "active"}
    )


def _dispatch_processing(chapter_id: str) -> None:
    """Send the chapter to the Celery worker; fall back to a background task."""
    if settings.CELERY_ENABLED:
        try:
            from app.workers.celery_app import process_chapter_task

            process_chapter_task.delay(chapter_id)
            return
        except Exception:
            pass  # broker unavailable — fall through to inline processing

    # Fallback: process in this process (FastAPI BackgroundTasks-equivalent)
    async def run():
        await chapter_service.process_chapter(chapter_id)

    asyncio.get_running_loop().create_task(run())


# --------------------------------
# UPLOAD CHAPTER (teacher)
# --------------------------------


@router.post("/classrooms/{classroom_id}/chapters", status_code=status.HTTP_201_CREATED)
async def upload_chapter(
    classroom_id: str,
    title: str = Form(..., min_length=1, max_length=200),
    file: UploadFile = File(...),
    current_user=Depends(require_roles("teacher")),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    database = db.get_db()
    classroom = await _classroom_owned_by(classroom_id, current_user["id"])
    if classroom is None:
        raise HTTPException(status_code=404, detail="Classroom not found")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    upload_result = await run_in_threadpool(
        cloudinary_service.upload_pdf, file_bytes, file.filename or "chapter.pdf", classroom_id
    )
    chapter = await chapter_service.create_chapter(
        current_user["id"], classroom_id, title, upload_result
    )
    _dispatch_processing(str(chapter["_id"]))

    return {
        "success": True,
        "message": "Chapter uploaded and queued for processing",
        "chapter": chapter_service.chapter_out(chapter),
    }


# --------------------------------
# LIST CHAPTERS (teacher)
# --------------------------------


@router.get("/classrooms/{classroom_id}/chapters", response_model=ChapterListResponse)
async def list_chapters_teacher(
    classroom_id: str,
    current_user=Depends(require_roles("teacher")),
):
    classroom = await _classroom_owned_by(classroom_id, current_user["id"])
    if classroom is None:
        raise HTTPException(status_code=404, detail="Classroom not found")
    chapters = await chapter_service.list_classroom_chapters(classroom_id)
    return {"chapters": chapters}


# --------------------------------
# LIST CHAPTERS (student, enrolled only)
# --------------------------------


@router.get("/student/classrooms/{classroom_id}/chapters", response_model=ChapterListResponse)
async def list_chapters_student(
    classroom_id: str,
    current_user=Depends(require_roles("student")),
):
    database = db.get_db()
    enrollment = await _enrollment_active(current_user["id"], classroom_id)
    if enrollment is None:
        raise HTTPException(status_code=403, detail="You are not enrolled in this classroom")

    chapters = await database.chapters.find(
        {"classroom_id": classroom_id, "status": chapter_service.CHAPTER_STATUS_READY},
        sort=[("created_at", -1)],
    ).to_list(length=1000)
    return {"chapters": [chapter_service.chapter_out(doc) for doc in chapters]}


# --------------------------------
# RETRY PROCESSING (teacher)
# --------------------------------


# --------------------------------
# DELETE CHAPTER (teacher owner only — also deletes related embeddings)
# --------------------------------


@router.delete("/classrooms/{classroom_id}/chapters/{chapter_id}")
async def delete_chapter(
    classroom_id: str,
    chapter_id: str,
    current_user=Depends(require_roles("teacher")),
):
    # the classroom must belong to the requesting teacher
    classroom = await _classroom_owned_by(classroom_id, current_user["id"])
    if classroom is None:
        raise HTTPException(status_code=404, detail="Classroom not found")

    # the chapter must exist AND belong to this teacher
    database = db.get_db()
    deleted = await chapter_service.delete_chapter(database, current_user["id"], chapter_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if deleted["classroom_id"] != classroom_id:
        raise HTTPException(status_code=404, detail="Chapter not found")

    return {
        "success": True,
        "message": "Chapter and its embeddings deleted",
        "chapter": deleted,
    }


@router.post("/chapters/{chapter_id}/reprocess")
async def reprocess_chapter(
    chapter_id: str,
    current_user=Depends(require_roles("teacher")),
):
    chapter = await chapter_service.get_chapter_for_teacher(current_user["id"], chapter_id)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    _dispatch_processing(chapter_id)
    return {"success": True, "message": "Chapter queued for reprocessing"}


# --------------------------------
# SEMANTIC SEARCH INSIDE A CLASSROOM (student)
# --------------------------------


@router.post("/student/classrooms/{classroom_id}/search")
async def search_chapters(
    classroom_id: str,
    data: ChunkSearchRequest,
    current_user=Depends(require_roles("student")),
):
    database = db.get_db()
    enrollment = await _enrollment_active(current_user["id"], classroom_id)
    if enrollment is None:
        raise HTTPException(status_code=403, detail="You are not enrolled in this classroom")

    results = await chapter_service.search_classroom_chunks(
        data.query, classroom_id, data.top_k
    )
    return {"success": True, "results": results}


# --------------------------------
# INLINE PDF STREAM & PAGES
# --------------------------------


@router.get("/chapters/{chapter_id}/pdf")
async def get_chapter_pdf(chapter_id: str):
    """Stream PDF with Content-Disposition: inline to prevent download redirection."""
    result = await chapter_service.get_chapter_pdf_bytes(chapter_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Chapter PDF not found")
    pdf_bytes, title = result
    safe_title = "".join(c for c in title if c.isalnum() or c in (" ", "-", "_")).strip() or "chapter"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe_title}.pdf"',
            "Content-Type": "application/pdf",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/chapters/{chapter_id}/pages", response_model=ChapterPagesResponse)
async def get_chapter_pages(chapter_id: str):
    """Retrieve text of individual pages for direct in-app reading."""
    data = await chapter_service.get_chapter_pages_data(chapter_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return data

