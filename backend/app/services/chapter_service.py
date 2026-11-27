import logging
import re
from datetime import datetime, timezone
from fastapi.concurrency import run_in_threadpool

from bson import ObjectId

from app.core.config import settings
from app.core.embeddings import (
    create_embedding_query,
    create_embeddings,
    create_embeddings_with_metadata,
)
from app.database.mongodb import db
from app.services import cloudinary_service, qdrant_service

logger = logging.getLogger(__name__)

CHAPTER_STATUS_PROCESSING = "processing"
CHAPTER_STATUS_READY = "ready"
CHAPTER_STATUS_FAILED = "failed"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    pages = extract_pdf_pages_list(file_bytes)
    return "\n".join(pages).strip()


def extract_pdf_pages_list(file_bytes: bytes) -> list[str]:
    from io import BytesIO

    from pypdf import PdfReader

    reader = PdfReader(BytesIO(file_bytes))
    return [page.extract_text() or "" for page in reader.pages]


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
        "total_pages": doc.get("total_pages", len(doc.get("pages", []))),
        "warning": doc.get("warning"),
        "flagged_chunks": doc.get("flagged_chunks", []),
        "error": doc.get("error"),
    }


async def list_classroom_chapters(classroom_id: str) -> list[dict]:
    database = db.get_db()
    docs = await database.chapters.find(
        {"classroom_id": classroom_id}, sort=[("created_at", -1)]
    ).to_list(length=1000)
    return [chapter_out(doc) for doc in docs]


async def delete_chapter(database, teacher_id: str, chapter_id: str) -> dict | None:
    """Delete a chapter (teacher-owner only) and all related data.

    Order of operations:
      1. verify the chapter exists AND teacher_id matches the requester
      2. delete related embeddings from Qdrant (chapter_id payload filter)
      3. delete the PDF from Cloudinary (best effort — never blocks deletion)
      4. remove the chapter document from MongoDB
    Returns the serialized chapter that was deleted, or None if not found/not owned.
    """
    if not ObjectId.is_valid(chapter_id):
        return None
    doc = await database.chapters.find_one(
        {"_id": ObjectId(chapter_id), "teacher_id": teacher_id}
    )
    if not doc:
        return None

    # embeddings first, so the AI tutor/search never surfaces the deleted chapter
    try:
        await run_in_threadpool(qdrant_service.delete_chapter_chunks, chapter_id)
    except Exception:
        logger.exception("Qdrant cleanup failed for chapter %s (continuing with deletion)", chapter_id)

    # stored PDF (best effort)
    if doc.get("file_public_id"):
        try:
            await run_in_threadpool(cloudinary_service.delete_pdf, doc["file_public_id"])
        except Exception:
            logger.exception("Cloudinary cleanup failed for chapter %s (continuing with deletion)", chapter_id)

    await database.chapters.delete_one({"_id": doc["_id"]})
    return chapter_out(doc)


async def get_classroom_chapters_summary(classroom_id: str) -> dict:
    """Get count and titles of chapters for a classroom."""
    database = db.get_db()
    query: dict = {"classroom_id": classroom_id}
    if ObjectId.is_valid(classroom_id):
        query = {"$or": [{"classroom_id": classroom_id}, {"classroom_id": ObjectId(classroom_id)}]}

    chapters = await database.chapters.find(
        query,
        {"title": 1, "status": 1}
    ).sort("created_at", 1).to_list(length=1000)

    total = len(chapters)
    ready = sum(1 for c in chapters if c.get("status") == CHAPTER_STATUS_READY)
    return {
        "total": total,
        "ready": ready,
        "chapters": [{"title": c.get("title", "Untitled"), "status": c.get("status", "")} for c in chapters],
    }


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
        pages_list = extract_pdf_pages_list(response.content)
        text = "\n".join(pages_list).strip()
        logger.info(
            "[%s] PDF downloaded and text extracted: %d characters across %d pages",
            chapter_id, len(text), len(pages_list),
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
        embeddings, flagged_items = await create_embeddings_with_metadata(chunks)
        warning_msg = None
        if flagged_items:
            flagged_indices = [item["chunk_index"] for item in flagged_items]
            indices_str = ", #".join(map(str, flagged_indices[:3]))
            if len(flagged_indices) > 3:
                indices_str += f" (+{len(flagged_indices) - 3} more)"
            warning_msg = (
                f"{len(flagged_items)} chunk(s) (chunk #{indices_str}) were flagged by AI content safety "
                "filters (sensitive links/references) and safely isolated."
            )
            logger.warning("[%s] Chapter processing warning: %s", chapter_id, warning_msg)

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
        chunks_payload = [{"chunk_index": i, "text": t} for i, t in enumerate(chunks)]
        await database.chapters.update_one(
            {"_id": ObjectId(chapter_id)},
            {
                "$set": {
                    "status": CHAPTER_STATUS_READY,
                    "chunk_count": stored,
                    "total_pages": len(pages_list),
                    "pages": pages_list,
                    "chunks": chunks_payload,
                    "warning": warning_msg,
                    "flagged_chunks": [item["chunk_index"] for item in flagged_items],
                    "error": None,
                    "updated_at": _now(),
                }
            },
        )
        try:
            from app.services.bm25_service import invalidate_bm25_cache
            from app.services.semantic_cache_service import invalidate_semantic_cache
            invalidate_bm25_cache(chapter["classroom_id"], chapter_id)
            await invalidate_semantic_cache(chapter["classroom_id"], chapter_id)
        except Exception as cache_exc:
            logger.debug("Failed to invalidate BM25/semantic cache: %s", cache_exc)
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
# HYBRID SEARCH (Dense + BM25 + RRF)
# --------------------------------

from app.services.hybrid_search_service import hybrid_search


async def search_classroom_chunks(
    query: str,
    classroom_id: str,
    top_k: int = 5,
    chapter_id: str | None = None,
) -> list[dict]:
    """Hybrid search combining Dense vector retrieval (Qdrant) and BM25 lexical retrieval."""
    results = await hybrid_search(
        query=query,
        classroom_id=classroom_id,
        chapter_id=chapter_id,
        top_k=top_k,
    )

    # When querying a specific chapter, if hybrid search returned no hits (e.g. meta/overview queries),
    # fall back to sequential chapter chunks so the tutor/citations still have context.
    if chapter_id and not results:
        try:
            sequential = await run_in_threadpool(qdrant_service.get_chapter_chunks, chapter_id, top_k)
            if sequential:
                database = db.get_db()
                ch = await database.chapters.find_one({"_id": ObjectId(chapter_id)})
                ch_title = ch.get("title", "Unknown") if ch else "Unknown"
                sequential.sort(key=lambda c: c.get("chunk_index", 0))
                results = [
                    {
                        "chapter_id": c["chapter_id"],
                        "chapter_title": ch_title,
                        "chunk_index": c["chunk_index"],
                        "text": c["text"],
                        "rrf_score": 1.0,
                    }
                    for c in sequential[:top_k]
                ]
        except Exception as exc:
            logger.warning("Sequential chunk fallback failed: %s", exc)

    return [
        {
            "chapter_id": item["chapter_id"],
            "chapter_title": item.get("chapter_title", "Unknown"),
            "chunk_index": item["chunk_index"],
            "text": item["text"],
            "score": item.get("rrf_score", item.get("score", 0.0)),
        }
        for item in results
    ]


# --------------------------------
# PDF STREAMING & PAGE EXTRACTION
# --------------------------------


async def get_chapter_pdf_bytes(chapter_id: str) -> tuple[bytes, str] | None:
    """Fetch PDF bytes for in-app inline rendering without download redirection."""
    database = db.get_db()
    if not ObjectId.is_valid(chapter_id):
        return None
    chapter = await database.chapters.find_one({"_id": ObjectId(chapter_id)})
    if not chapter or not chapter.get("file_url"):
        return None

    import httpx

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(chapter["file_url"])
        if response.status_code != 200:
            return None
        return response.content, chapter.get("title", "chapter")


async def get_chapter_pages_data(chapter_id: str) -> dict | None:
    """Return paginated text pages for direct on-screen rendering."""
    database = db.get_db()
    if not ObjectId.is_valid(chapter_id):
        return None
    chapter = await database.chapters.find_one({"_id": ObjectId(chapter_id)})
    if not chapter:
        return None

    pages = chapter.get("pages")
    if pages is None and chapter.get("file_url"):
        import httpx

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.get(chapter["file_url"])
                if response.status_code == 200:
                    pages = extract_pdf_pages_list(response.content)
                    await database.chapters.update_one(
                        {"_id": ObjectId(chapter_id)},
                        {
                            "$set": {
                                "pages": pages,
                                "total_pages": len(pages),
                                "updated_at": _now(),
                            }
                        },
                    )
        except Exception as exc:
            logger.warning("Failed on-demand page extraction for chapter %s: %s", chapter_id, exc)

    pages = pages or []
    return {
        "chapter_id": str(chapter["_id"]),
        "title": chapter.get("title", "Chapter"),
        "total_pages": len(pages),
        "pages": [
            {"page_number": idx + 1, "text": p.strip()}
            for idx, p in enumerate(pages)
        ],
    }

