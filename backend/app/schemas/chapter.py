from pydantic import BaseModel, Field


class ChapterOut(BaseModel):
    id: str
    classroom_id: str
    teacher_id: str
    title: str
    file_url: str
    status: str  # processing | ready | failed
    chunk_count: int = 0
    total_pages: int = 0
    error: str | None = None


class ChapterPage(BaseModel):
    page_number: int
    text: str


class ChapterPagesResponse(BaseModel):
    chapter_id: str
    title: str
    total_pages: int
    pages: list[ChapterPage]


class ChapterListResponse(BaseModel):
    success: bool = True
    chapters: list[ChapterOut]


class ChunkSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    classroom_id: str
    top_k: int = Field(default=5, ge=1, le=20)


class ChunkSearchResult(BaseModel):
    chapter_id: str
    chapter_title: str
    chunk_index: int
    text: str
    score: float
