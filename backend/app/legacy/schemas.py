from datetime import date, datetime

from pydantic import BaseModel, EmailStr


class StudentBase(BaseModel):
    name: str
    email: EmailStr
    level: str = "beginner"


class StudentCreate(StudentBase):
    pass


class StudentOut(StudentBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class TeacherBase(BaseModel):
    name: str
    email: EmailStr
    specialty: str = "general english"


class TeacherCreate(TeacherBase):
    pass


class TeacherOut(TeacherBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class LessonBase(BaseModel):
    title: str
    lesson_date: date | None = None
    student_id: int
    teacher_id: int


class LessonCreate(LessonBase):
    pass


class LessonOut(LessonBase):
    id: int
    completed: bool
    created_at: datetime

    class Config:
        from_attributes = True
