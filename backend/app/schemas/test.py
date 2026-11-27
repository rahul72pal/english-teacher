from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------- generation / config ----------

class QuestionDistribution(BaseModel):
    mcq: int = Field(default=0, ge=0, le=50)
    true_false: int = Field(default=0, ge=0, le=50)
    descriptive: int = Field(default=0, ge=0, le=20)


class GenerateTestRequest(BaseModel):
    classroom_id: str
    chapter_ids: list[str] = Field(default_factory=list)  # empty = all ready chapters
    title: str = Field(min_length=2, max_length=150)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    question_distribution: QuestionDistribution
    duration_minutes: int = Field(default=30, ge=1, le=300)
    passing_percentage: int = Field(default=40, ge=1, le=100)
    attempts_allowed: int = Field(default=1, ge=1, le=5)
    start_at: datetime | None = None
    end_at: datetime | None = None
    model_config = ConfigDict(extra="forbid")


class TestUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=150)
    duration_minutes: int | None = Field(default=None, ge=1, le=300)
    passing_percentage: int | None = Field(default=None, ge=1, le=100)
    attempts_allowed: int | None = Field(default=None, ge=1, le=5)
    start_at: datetime | None = None
    end_at: datetime | None = None
    model_config = ConfigDict(extra="forbid")


class PublishRequest(BaseModel):
    start_at: datetime | None = None
    end_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=300)
    passing_percentage: int | None = Field(default=None, ge=1, le=100)
    attempts_allowed: int | None = Field(default=None, ge=1, le=5)
    model_config = ConfigDict(extra="forbid")


# ---------- questions ----------

class QuestionEditRequest(BaseModel):
    question: str | None = Field(default=None, min_length=5, max_length=1000)
    options: list[str] | None = None
    correct_answer: str | bool | None = None
    marks: int | None = Field(default=None, ge=1, le=20)
    model_config = ConfigDict(extra="forbid")


class RegenerateQuestionRequest(BaseModel):
    question_id: str
    model_config = ConfigDict(extra="forbid")


class QuestionOut(BaseModel):
    id: str
    question_id: str
    type: str
    question: str
    options: list[str] | None = None
    correct_answer: str | bool | None = None
    marks: int
    difficulty: str
    source_chunks: list[str] = []
    evaluation_rubric: list[dict] | None = None
    expected_answer: str | None = None
    approved: bool = False


class TestOut(BaseModel):
    id: str
    teacher_id: str
    classroom_id: str
    chapter_ids: list[str]
    title: str
    difficulty: str
    total_questions: int
    total_marks: int
    duration_minutes: int
    passing_percentage: int
    attempts_allowed: int
    status: str  # draft | published | closed
    start_at: datetime | None = None
    end_at: datetime | None = None
    created_at: datetime
