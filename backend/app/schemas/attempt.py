from pydantic import BaseModel, ConfigDict, Field


class AnswerSaveRequest(BaseModel):
    student_answer: str | bool | None = Field(default=None)
    model_config = ConfigDict(extra="forbid")


class AttemptOut(BaseModel):
    id: str
    test_id: str
    classroom_id: str
    status: str  # in_progress | submitted | evaluating
    test_version: int
    started_at: str | None = None
    expires_at: str | None = None
    submitted_at: str | None = None
    obtained_marks: int | None = None
    total_marks: int = 0
    evaluation_status: str = "pending"


class StudentTestOut(BaseModel):
    id: str
    title: str
    difficulty: str
    total_questions: int
    total_marks: int
    duration_minutes: int
    passing_percentage: int
    attempts_allowed: int
    status: str
    start_at: str | None = None
    end_at: str | None = None


class StudentQuestionOut(BaseModel):
    question_id: str
    type: str
    question: str
    options: list[str] | None = None
    marks: int


class AttemptDetailOut(BaseModel):
    attempt: AttemptOut
    questions: list[StudentQuestionOut]
    answers: list[dict]


class ResultOut(BaseModel):
    attempt_id: str
    test_id: str
    test_title: str = ""
    obtained_marks: int
    total_marks: int
    percentage: float
    passed: bool
    evaluation_status: str
    evaluated_at: str | None = None
    answers: list[dict] = []
