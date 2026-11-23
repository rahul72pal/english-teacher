from pydantic import BaseModel, ConfigDict, Field


class ClassroomCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=500)
    model_config = ConfigDict(extra="forbid")


class JoinClassroomRequest(BaseModel):
    join_code: str = Field(min_length=8, max_length=8)
    model_config = ConfigDict(extra="forbid")


class ClassroomStatusRequest(BaseModel):
    is_active: bool


class ClassroomResponse(BaseModel):
    id: str
    name: str
    description: str
    join_code: str
    is_active: bool
    student_count: int = 0
