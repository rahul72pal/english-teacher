from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import require_roles
from app.schemas.classroom import (
    ClassroomCreateRequest,
    ClassroomStatusRequest,
    JoinClassroomRequest,
)
from app.services import classroom_service

teacher_router = APIRouter(prefix="/classrooms", tags=["Classrooms"])
student_router = APIRouter(prefix="/student", tags=["Student"])


def _classroom_response(classroom, student_count: int = 0) -> dict:
    return {
        "id": str(classroom["_id"]),
        "name": classroom["name"],
        "description": classroom.get("description", ""),
        "join_code": classroom["join_code"],
        "is_active": classroom["is_active"],
        "student_count": student_count,
    }


# --------------------------------
# CREATE CLASSROOM (teacher)
# --------------------------------


@teacher_router.post("", status_code=status.HTTP_201_CREATED)
async def create_classroom(
    data: ClassroomCreateRequest,
    current_user=Depends(require_roles("teacher")),
):
    classroom = await classroom_service.create_classroom(current_user["id"], data)
    return {
        "success": True,
        "message": "Classroom created successfully",
        "classroom": _classroom_response(classroom),
    }


# --------------------------------
# LIST OWN CLASSROOMS (teacher)
# --------------------------------


@teacher_router.get("")
async def list_classrooms(current_user=Depends(require_roles("teacher"))):
    classrooms = await classroom_service.list_teacher_classrooms(current_user["id"])
    return {"success": True, "classrooms": classrooms}


# --------------------------------
# LIST ENROLLED STUDENTS (teacher)
# --------------------------------


@teacher_router.get("/{classroom_id}/students")
async def list_classroom_students(
    classroom_id: str,
    current_user=Depends(require_roles("teacher")),
):
    students = await classroom_service.list_classroom_students(
        current_user["id"], classroom_id
    )
    if students is None:
        raise HTTPException(status_code=404, detail="Classroom not found")
    return {"success": True, "students": students}


# --------------------------------
# ACTIVATE / DEACTIVATE CLASSROOM (teacher)
# --------------------------------


@teacher_router.patch("/{classroom_id}/status")
async def set_classroom_status(
    classroom_id: str,
    data: ClassroomStatusRequest,
    current_user=Depends(require_roles("teacher")),
):
    classroom = await classroom_service.set_classroom_status(
        current_user["id"], classroom_id, data.is_active
    )
    if classroom is None:
        raise HTTPException(status_code=404, detail="Classroom not found")
    return {
        "success": True,
        "message": "Classroom activated" if data.is_active else "Classroom deactivated",
        "classroom": _classroom_response(classroom),
    }


# --------------------------------
# JOIN CLASSROOM USING CODE (student)
# --------------------------------


@student_router.post("/classrooms/join", status_code=status.HTTP_201_CREATED)
async def join_classroom(
    data: JoinClassroomRequest,
    current_user=Depends(require_roles("student")),
):
    result = await classroom_service.join_classroom(current_user["id"], data.join_code)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid join code or classroom is inactive",
        )

    classroom = result["classroom"]
    return {
        "success": True,
        "message": (
            "Joined classroom successfully"
            if result["status"] == "joined"
            else "Already enrolled in this classroom"
        ),
        "classroom": {
            "id": str(classroom["_id"]),
            "name": classroom["name"],
            "teacher_id": classroom["teacher_id"],
        },
    }


# --------------------------------
# LIST JOINED CLASSROOMS (student)
# --------------------------------


@student_router.get("/classrooms")
async def get_student_classrooms(current_user=Depends(require_roles("student"))):
    classrooms = await classroom_service.list_student_classrooms(current_user["id"])
    return {"success": True, "classrooms": classrooms}


@student_router.get("/dashboard")
async def student_dashboard(current_user=Depends(require_roles("student"))):
    return {
        "message": "Welcome to student dashboard",
        "user": current_user,
    }
