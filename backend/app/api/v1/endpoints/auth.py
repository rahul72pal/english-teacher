from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserResponse
from app.services.auth_service import login_user, register_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/teacher/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
async def teacher_signup(data: SignupRequest):
    result = await register_user(data, role="teacher")
    if result is None:
        raise HTTPException(status_code=409, detail="Email is already registered")
    return result


@router.post(
    "/student/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
async def student_signup(data: SignupRequest):
    result = await register_user(data, role="student")
    if result is None:
        raise HTTPException(status_code=409, detail="Email is already registered")
    return result


@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest):
    result = await login_user(data)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return result


@router.get("/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_user)):
    return current_user
