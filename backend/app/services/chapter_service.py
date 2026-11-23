import logging
import re
from datetime import datetime, timezone
from fastapi.concurrency import run_in_threadpool

from bson import ObjectId

from app.core.config import settings
from app.core.embeddings import create_embedding_query, create_embeddings
from app.database.mongodb import db
from app.services import qdrant_service

logger = logging.getLogger(__name__)

CHAPTER_STATUS_PROCESSING = "processing"
CHAPTER_STATUS_READY = "ready"
CHAPTER_STATUS_FAILED = "failed"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    from io import BytesIO

    from pypdf import PdfReader

    reader = PdfReader(BytesIO(file_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def chunk_text(text: str, chunk_size: int | None = None, overlap: int | None = None) -> list[str]:
    """Fixed-size character chunks with overlap; paragraphs/whitespace aware enough for v1."""
    chunk_size = chunk_size or settings.CHUNK_SIZE
    overlap = overlap if overlap is not None else settings.CHUNK_OVERLAP

    # Normalize whitespace to make chunks stable
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    if not text:
        return []

    chunks: list[str] = []
    start = 0
    step = max(chunk_size - overlap, 1)
    while start < len(text):
        end = start + chunk_size
        # Try to break at a sentence/paragraph boundary near the end
        if end < len(text):
            window = text[start:end]
            boundary = max(window.rfind(". "), window.rfind("\n"), window.rfind("! "), window.rfind("? "))
            if boundary > chunk_size // 2:
                end = start + boundary + 1
        chunks.append(text[start:end].strip())
        start = end - overlap if end < len(text) else end
    return [c for c in chunks if c]


# --------------------------------
# CHAPTER CRUD / STATUS
# --------------------------------


async def create_chapter(
    user_id: str,
    classroom_id: str,
    title: str,
    upload_result: dict,
) -> dict:
    database = db.get_db()
    doc = {
        "classroom_id": classroom_id,
        "teacher_id": user_id,
        "title": title.strip(),
        "file_public_id": upload_result["public_id"],
        "file_url": upload_result["secure_url"],
        "file_bytes": upload_result.get("bytes"),
        "status": CHAPTER_STATUS_PROCESSING,
        "chunk_count": 0,
        "error": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    result = await database.chapters.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def chapter_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "classroom_id": doc["classroom_id"],
        "teacher_id": doc["teacher_id"],
        "title": doc["title"],
        "file_url": doc.get("file_url", ""),
        "status": doc["status"],
        "chunk_count": doc.get("chunk_count", 0),
        "error": doc.get("error"),
    }


async def list_classroom_chapters(classroom_id: str) -> list[dict]:
    database = db.get_db()
    docs = await database.chapters.find(
        {"classroom_id": classroom_id}, sort=[("created_at", -1)]
    ).to_list(length=1000)
    return [chapter_out(doc) for doc in docs]


async def get_chapter_for_teacher(user_id: str, chapter_id: str) -> dict | None:
    database = db.get_db()
    if not ObjectId.is_valid(chapter_id):
        return None
    return await database.chapters.find_one(
        {"_id": ObjectId(chapter_id), "teacher_id": user_id}
    )


# --------------------------------
# BACKGROUND PROCESSING
# (called by the Celery worker or the fallback background task)
# --------------------------------


async def process_chapter(chapter_id: str) -> None:
    database = db.get_db()

    if not ObjectId.is_valid(chapter_id):
        return
    chapter = await database.chapters.find_one({"_id": ObjectId(chapter_id)})
    if chapter is None:
        return

    print("Chapter processing start..........")
    stage = "fetch chapter metadata"
    try:
        # 1. Extract text from the PDF stored in Cloudinary
        import httpx

        stage = "download PDF from Cloudinary"
        logger.info("[%s] Stage: %s (%s)", chapter_id, stage, chapter["file_url"])
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.get(chapter["file_url"])
            response.raise_for_status()

        stage = "extract text from PDF"
        text = extract_text_from_pdf(response.content)
        logger.info(
            "[%s] PDF downloaded and text extracted: %d characters",
            chapter_id, len(text),
        )

        # 2. Split into chunks
        stage = "chunk text"
        chunks = chunk_text(text)
        if not chunks:
            raise RuntimeError("No extractable text found in PDF (scanned image PDFs are not supported yet)")

        stage = "generate embeddings"
        logger.info(
            "[%s] Generating embeddings for %d chunks via %s (LangChain NVIDIAEmbeddings)",
            chapter_id, len(chunks), settings.EMBEDDING_MODEL,
        )
        embeddings = await create_embeddings(chunks)
        logger.info(
            "[%s] Embeddings generated: %d vectors of dimension %d",
            chapter_id, len(embeddings), len(embeddings[0]) if embeddings else 0,
        )

        stage = "store vectors in Qdrant"
        logger.info(
            "[%s] Upserting %d chunk vectors into Qdrant collection '%s'",
            chapter_id, len(chunks), settings.QDRANT_COLLECTION,
        )
        stored = await run_in_threadpool(
            qdrant_service.upsert_chunks,
            chapter_id,
            chapter["classroom_id"],
            chapter["teacher_id"],
            chunks,
            embeddings,
            settings.EMBEDDING_MODEL,
        )

        logger.info(
            "[%s] Chapter processed successfully: %d vectors stored in Qdrant",
            chapter_id, stored,
        )
        await database.chapters.update_one(
            {"_id": ObjectId(chapter_id)},
            {
                "$set": {
                    "status": CHAPTER_STATUS_READY,
                    "chunk_count": stored,
                    "error": None,
                    "updated_at": _now(),
                }
            },
        )
    except Exception as exc:
        logger.error(
            "[%s] Chapter processing failed at stage '%s': %s: %s",
            chapter_id, stage, type(exc).__name__, exc,
        )
        await database.chapters.update_one(
            {"_id": ObjectId(chapter_id)},
            {
                "$set": {
                    "status": CHAPTER_STATUS_FAILED,
                    "error": str(exc)[:500],
                    "updated_at": _now(),
                }
            },
        )


# --------------------------------
# SIMPLE VECTOR SEARCH (student queries)
# --------------------------------


async def search_classroom_chunks(query: str, classroom_id: str, top_k: int = 5, chapter_id: str | None = None) -> list[dict]:
    """Vector search over Qdrant, scoped to the classroom (and optionally one chapter)."""
    query_vector = await create_embedding_query(query)

    hits = await run_in_threadpool(
        qdrant_service.search_classroom, query_vector, classroom_id, top_k, chapter_id
    )
    if not hits:
        return []

    database = db.get_db()
    chapter_ids = list({hit["chapter_id"] for hit in hits})
    chapters = {
        str(c["_id"]): c
        for c in await database.chapters.find(
            {"_id": {"$in": [ObjectId(cid) for cid in chapter_ids if ObjectId.is_valid(cid)]}}
        ).to_list(length=100)
    }

    results = []
    for hit in hits:
        chapter = chapters.get(hit["chapter_id"], {})
        results.append(
            {
                "chapter_id": hit["chapter_id"],
                "chapter_title": chapter.get("title", "Unknown"),
                "chunk_index": hit["chunk_index"],
                "text": hit["text"],
                "score": round(hit["score"], 4),
            }
        )
    return results
