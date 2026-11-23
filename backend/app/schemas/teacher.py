from pydantic import BaseModel, ConfigDict, Field


class TeacherProfileRequest(BaseModel):
    bio: str = Field(default="", max_length=500)
    institution: str = Field(default="", max_length=150)
    subjects: list[str] = Field(default_factory=list, max_length=20)
    model_config = ConfigDict(extra="forbid")


class TeacherProfileResponse(BaseModel):
    id: str
    user_id: str
    bio: str
    institution: str
    subjects: list[str]
