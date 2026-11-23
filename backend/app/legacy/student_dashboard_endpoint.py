from fastapi import APIRouter, Depends

from app.core.dependencies import require_roles

router = APIRouter(prefix="/student", tags=["Student"])


@router.get("/dashboard")
async def student_dashboard(current_user=Depends(require_roles("student"))):
    return {
        "message": "Welcome to student dashboard",
        "user": current_user,
    }
