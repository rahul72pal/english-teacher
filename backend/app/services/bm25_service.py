"""Lexical BM25 retrieval service with in-memory index caching.

Architectural guarantee:
Indexes are built once per (classroom_id, chapter_id) scope and reused across
student queries. Cache is invalidated when chapters are added, processed, or deleted.
"""

import logging
import re
import threading
from typing import Any

from bson import ObjectId
from rank_bm25 import BM25Okapi

from app.database.mongodb import db

logger = logging.getLogger(__name__)

# Cache: "classroom_id:chapter_id|all" -> {"index": BM25Okapi, "chunks": list[dict]}
_bm25_cache: dict[str, dict[str, Any]] = {}
_cache_lock = threading.Lock()


def tokenize(text: str) -> list[str]:
    """Tokenize query or document text into normalized alphanumeric word tokens."""
    return re.findall(
        r"[a-zA-Z0-9]+(?:[-'][a-zA-Z0-9]+)*",
        text.lower(),
    )


def build_bm25_index(chunks: list[dict]) -> BM25Okapi:
    """Build a BM25Okapi index over a list of document chunks."""
    tokenized_documents = [
        tokenize(chunk.get("text", ""))
        for chunk in chunks
    ]
    return BM25Okapi(tokenized_documents)


def search_bm25(query: str, chunks: list[dict], bm25_index: BM25Okapi, top_k: int = 20) -> list[dict]:
    """Search the BM25 index with a tokenized query and return ranked chunks."""
    if not chunks or not query.strip():
        return []

    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    scores = bm25_index.get_scores(query_tokens)

    ranked_indices = sorted(
        range(len(scores)),
        key=lambda i: scores[i],
        reverse=True,
    )

    results = []
    for index in ranked_indices[:top_k]:
        if scores[index] <= 0:
            continue
        chunk = chunks[index].copy()
        chunk["bm25_score"] = float(scores[index])
        results.append(chunk)

    return results


def _cache_key(classroom_id: str, chapter_id: str | None = None) -> str:
    return f"{classroom_id}:{chapter_id or 'all'}"


def invalidate_bm25_cache(classroom_id: str | None = None, chapter_id: str | None = None) -> None:
    """Invalidate cached BM25 indexes when documents change."""
    with _cache_lock:
        if classroom_id is None and chapter_id is None:
            _bm25_cache.clear()
            logger.info("BM25 cache cleared completely")
            return

        keys_to_remove = []
        for key in list(_bm25_cache.keys()):
            if classroom_id and key.startswith(f"{classroom_id}:"):
                keys_to_remove.append(key)
            elif chapter_id and f":{chapter_id}" in key:
                keys_to_remove.append(key)

        for key in keys_to_remove:
            _bm25_cache.pop(key, None)

        if keys_to_remove:
            logger.info("BM25 cache invalidated keys: %s", keys_to_remove)


async def _fetch_chunks_for_scope(classroom_id: str, chapter_id: str | None = None) -> list[dict]:
    """Fetch chunks for the given classroom/chapter from MongoDB or Qdrant."""
    database = db.get_db()
    chunks: list[dict] = []

    # 1. Try fetching stored chunks or pages from MongoDB chapters
    query: dict[str, Any] = {"classroom_id": classroom_id, "status": "ready"}
    if chapter_id and ObjectId.is_valid(chapter_id):
        query["_id"] = ObjectId(chapter_id)

    chapters = await database.chapters.find(query).to_list(length=100)

    for ch in chapters:
        ch_id = str(ch["_id"])
        ch_title = ch.get("title", "Unknown")

        # If chapter doc already stores chunks array
        if ch.get("chunks"):
            for c in ch["chunks"]:
                chunks.append({
                    "chunk_id": f"{ch_id}_{c['chunk_index']}",
                    "chapter_id": ch_id,
                    "chapter_title": ch_title,
                    "chunk_index": c["chunk_index"],
                    "text": c["text"],
                })
        elif ch.get("pages"):
            from app.services.chapter_service import chunk_text
            page_text = "\n\n".join(ch["pages"])
            text_chunks = chunk_text(page_text)
            for i, txt in enumerate(text_chunks):
                chunks.append({
                    "chunk_id": f"{ch_id}_{i}",
                    "chapter_id": ch_id,
                    "chapter_title": ch_title,
                    "chunk_index": i,
                    "text": txt,
                })

    if chunks:
        return chunks

    # 2. Fallback: Scroll chunks from Qdrant if available
    try:
        from fastapi.concurrency import run_in_threadpool
        from app.services import qdrant_service

        q_chunks = await run_in_threadpool(
            qdrant_service.get_classroom_chunks, classroom_id, chapter_id, 1000
        )
        if q_chunks:
            chapters_map = {str(c["_id"]): c.get("title", "Unknown") for c in chapters}
            for qc in q_chunks:
                qc["chapter_title"] = chapters_map.get(qc["chapter_id"], "Unknown")
            return q_chunks
    except Exception as exc:
        logger.debug("BM25 fallback Qdrant scroll failed: %s", exc)

    return []


async def get_or_build_bm25_index(
    classroom_id: str,
    chapter_id: str | None = None,
) -> tuple[BM25Okapi | None, list[dict]]:
    """Retrieve existing cached BM25 index or build and cache a new one."""
    key = _cache_key(classroom_id, chapter_id)

    with _cache_lock:
        cached = _bm25_cache.get(key)
        if cached is not None:
            return cached["index"], cached["chunks"]

    # Not cached: retrieve chunks and build index
    chunks = await _fetch_chunks_for_scope(classroom_id, chapter_id)
    if not chunks:
        return None, []

    bm25_index = build_bm25_index(chunks)

    with _cache_lock:
        _bm25_cache[key] = {
            "index": bm25_index,
            "chunks": chunks,
        }
    logger.info("Built and cached BM25 index for scope '%s' (%d chunks)", key, len(chunks))

    return bm25_index, chunks


async def bm25_search_classroom_chunks(
    query: str,
    classroom_id: str,
    chapter_id: str | None = None,
    top_k: int = 20,
) -> list[dict]:
    """Run BM25 lexical search for the scoped classroom and optional chapter."""
    bm25_index, chunks = await get_or_build_bm25_index(classroom_id, chapter_id)
    if not bm25_index or not chunks:
        return []

    return search_bm25(query, chunks, bm25_index, top_k=top_k)
