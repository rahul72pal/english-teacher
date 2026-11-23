from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/lessons", tags=["lessons"])


@router.get("/", response_model=list[schemas.LessonOut])
def list_lessons(db: Session = Depends(get_db)):
    return db.query(models.Lesson).all()


@router.post("/", response_model=schemas.LessonOut, status_code=201)
def create_lesson(payload: schemas.LessonCreate, db: Session = Depends(get_db)):
    for field, model in (("student_id", models.Student), ("teacher_id", models.Teacher)):
        if not db.get(model, getattr(payload, field)):
            raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    lesson = models.Lesson(**payload.model_dump())
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return lesson


@router.patch("/{lesson_id}/complete", response_model=schemas.LessonOut)
def complete_lesson(lesson_id: int, db: Session = Depends(get_db)):
    lesson = db.get(models.Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lesson.completed = True
    db.commit()
    db.refresh(lesson)
    return lesson
