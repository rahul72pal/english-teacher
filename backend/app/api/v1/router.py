from fastapi import APIRouter

from app.api.v1.endpoints import ai_tutor, auth, chapters, classrooms, teacher

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(teacher.router)
api_router.include_router(classrooms.teacher_router)
api_router.include_router(classrooms.student_router)
api_router.include_router(chapters.router)
api_router.include_router(ai_tutor.router)
