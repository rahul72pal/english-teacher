from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import require_roles
from app.schemas.teacher import TeacherProfileRequest, TeacherProfileResponse
from app.services import classroom_service

router = APIRouter(prefix="/teacher", tags=["Teacher"])


@router.get("/dashboard")
async def teacher_dashboard(current_user=Depends(require_roles("teacher"))):
    return {
        "message": "Welcome to teacher dashboard",
        "user": current_user,
    }


# --------------------------------
# TEACHER PROFILE
# --------------------------------


@router.put("/profile", response_model=TeacherProfileResponse)
async def update_teacher_profile(
    data: TeacherProfileRequest,
    current_user=Depends(require_roles("teacher")),
):
    profile = await classroom_service.upsert_teacher_profile(current_user["id"], data)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {
        "id": str(profile["_id"]),
        "user_id": profile["user_id"],
        "bio": profile.get("bio", ""),
        "institution": profile.get("institution", ""),
        "subjects": profile.get("subjects", []),
    }


@router.get("/profile", response_model=TeacherProfileResponse)
async def get_teacher_profile(current_user=Depends(require_roles("teacher"))):
    profile = await classroom_service.get_teacher_profile(current_user["id"])
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {
        "id": str(profile["_id"]),
        "user_id": profile["user_id"],
        "bio": profile.get("bio", ""),
        "institution": profile.get("institution", ""),
        "subjects": profile.get("subjects", []),
    }
