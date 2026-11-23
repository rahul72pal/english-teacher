from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/teachers", tags=["teachers"])


@router.get("/", response_model=list[schemas.TeacherOut])
def list_teachers(db: Session = Depends(get_db)):
    return db.query(models.Teacher).all()


@router.post("/", response_model=schemas.TeacherOut, status_code=201)
def create_teacher(payload: schemas.TeacherCreate, db: Session = Depends(get_db)):
    teacher = models.Teacher(**payload.model_dump())
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


@router.get("/{teacher_id}", response_model=schemas.TeacherOut)
def get_teacher(teacher_id: int, db: Session = Depends(get_db)):
    teacher = db.get(models.Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return teacher


@router.get("/{teacher_id}/lessons", response_model=list[schemas.LessonOut])
def teacher_lessons(teacher_id: int, db: Session = Depends(get_db)):
    return db.query(models.Lesson).filter(models.Lesson.teacher_id == teacher_id).all()
