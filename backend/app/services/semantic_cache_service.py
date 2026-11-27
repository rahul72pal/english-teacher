"""Semantic Cache service using Qdrant vector storage.

Caches AI tutor answers by question embedding similarity (cosine distance >= threshold).
Bypasses both hybrid retrieval and LLM calls on high-confidence cache hits.
"""

import logging
import re
import time
import uuid
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    Range,
    VectorParams,
)

from app.core.config import settings
from app.services import qdrant_service

logger = logging.getLogger(__name__)

_ensured_cache_dim: int | None = None

# Patterns that indicate a question is conversation-dependent or personal/dynamic
NON_CACHEABLE_PATTERNS = [
    r"\b(previous|earlier|last)\s+(answer|response|message|question)\b",
    r"\b(you\s+(just\s+)?(said|mentioned)|did\s+you\s+(just\s+)?say)\b",
    r"\bas\s+you\s+mentioned\b",
    r"\b(my|our)\s+(score|marks|grade|result|progress|status|test|submission)\b",
    r"\bhow\s+much\s+did\s+i\s+(score|get)\b",
    r"\b(generate|create|make)\s+(a\s+)?(test|quiz|exam)\b",
    r"\bwho\s+am\s+i\b",
    r"\bwhat\s+time\s+is\s+it\b",
]
NON_CACHEABLE_REGEX = re.compile("|".join(NON_CACHEABLE_PATTERNS), re.IGNORECASE)


def is_cacheable_question(question: str) -> str | bool:
    """Determine whether a question is suitable for semantic caching.

    Excludes:
    - Questions with personal user context or scoring/progress inquiries.
    - Conversation-dependent references ('as you said earlier', 'the previous answer').
    - Dynamic request triggers ('generate a test for chapter 1').
    """
    clean = question.strip()
    if len(clean) < 3 or len(clean) > 600:
        return False #return false becuase the question is too short or too long

    if NON_CACHEABLE_REGEX.search(clean):
        return False # return false becuase the question is conversation-dependent or personal/dynamic

    return True


def create_scope_key(chapter_id: str | None = None) -> str:
    """Construct a deterministic isolation scope key."""
    return f"chapter:{chapter_id}" if chapter_id else "classroom:all"


def ensure_cache_collection(dim: int) -> str:
    """Ensure the semantic cache collection and its required payload indexes exist."""
    global _ensured_cache_dim
    name = settings.SEMANTIC_CACHE_COLLECTION
    if _ensured_cache_dim == dim:
        return name

    client = qdrant_service.get_client()
    existing = [c.name for c in client.get_collections().collections]
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
        )
        info = None
        logger.info("Created Qdrant semantic cache collection: '%s' (dim=%d)", name, dim)
    else:
        info = client.get_collection(name)
        existing_dim = info.config.params.vectors.size
        if existing_dim != dim:
            raise RuntimeError(
                f"Semantic cache collection '{name}' has dim {existing_dim} "
                f"but embedding model returned {dim}."
            )

    indexed = set(info.payload_schema.keys()) if info and info.payload_schema else set()

    keyword_fields = [
        "classroom_id",
        "scope_key",
        "chapter_id",
        "prompt_version",
        "embedding_model",
    ]
    for field in keyword_fields:
        if field not in indexed:
            client.create_payload_index(
                collection_name=name,
                field_name=field,
                field_schema=PayloadSchemaType.KEYWORD,
                wait=True,
            )

    if "expires_at" not in indexed:
        client.create_payload_index(
            collection_name=name,
            field_name="expires_at",
            field_schema=PayloadSchemaType.INTEGER,
            wait=True,
        )

    _ensured_cache_dim = dim
    return name


async def find_near_duplicate(
    query_vector: list[float],
    classroom_id: str,
    scope_key: str,
    prompt_version: str,
    duplicate_threshold: float = 0.95,
    threshold: float | None = None,
):
    target_threshold = threshold if threshold is not None else duplicate_threshold
    from fastapi.concurrency import run_in_threadpool

    def _sync_lookup():
        ensure_cache_collection(len(query_vector))

        client = qdrant_service.get_client()

        hits = client.query_points(
            collection_name=settings.SEMANTIC_CACHE_COLLECTION,
            query=query_vector,
            query_filter=Filter(
                must=[
                    FieldCondition(
                        key="classroom_id",
                        match=MatchValue(value=classroom_id),
                    ),
                    FieldCondition(
                        key="scope_key",
                        match=MatchValue(value=scope_key),
                    ),
                    FieldCondition(
                        key="prompt_version",
                        match=MatchValue(value=prompt_version),
                    ),
                    FieldCondition(
                        key="embedding_model",
                        match=MatchValue(
                            value=settings.EMBEDDING_MODEL
                        ),
                    ),
                    FieldCondition(
                        key="expires_at",
                        range=Range(gte=int(time.time())),
                    ),
                ]
            ),
            limit=1,
            with_payload=True,
        ).points

        if not hits:
            return None

        hit = hits[0]

        if hit.score >= target_threshold:
            return {
                "question": hit.payload.get("question"),
                "score": float(hit.score),
                "answer": hit.payload.get("answer"),
            }

        return None

    return await run_in_threadpool(_sync_lookup)


async def find_cached_answer(
    query_vector: list[float],
    classroom_id: str,
    scope_key: str,
    prompt_version: str = "tutor-v2",
    threshold: float | None = None,
) -> dict[str, Any] | None:
    """Look up a semantic cache hit in Qdrant based on cosine similarity threshold."""
    if not settings.SEMANTIC_CACHE_ENABLED:
        return None

    threshold = threshold if threshold is not None else settings.SEMANTIC_CACHE_THRESHOLD
    dim = len(query_vector)

    from fastapi.concurrency import run_in_threadpool

    def _sync_lookup():
        ensure_cache_collection(dim)
        client = qdrant_service.get_client()
        now = int(time.time())

        must_conditions = [
            FieldCondition(key="classroom_id", match=MatchValue(value=classroom_id)),
            FieldCondition(key="scope_key", match=MatchValue(value=scope_key)),
            FieldCondition(key="prompt_version", match=MatchValue(value=prompt_version)),
            FieldCondition(key="embedding_model", match=MatchValue(value=settings.EMBEDDING_MODEL)),
            FieldCondition(key="expires_at", range=Range(gte=now)),
        ]

        hits = client.query_points(
            collection_name=settings.SEMANTIC_CACHE_COLLECTION,
            query=query_vector,
            query_filter=Filter(must=must_conditions),
            limit=1,
            with_payload=True,
        ).points

        if not hits:
            logger.info("ℹ️ [SEMANTIC CACHE] No cached questions found in scope '%s'", scope_key)
            return None

        hit = hits[0]
        score = float(hit.score)
        payload = hit.payload or {}
        cached_question = payload.get("question", "")

        if score < threshold:
            logger.info(
                "⚡ [SEMANTIC CACHE MISS (BELOW THRESHOLD)] Closest cached: '%s' | similarity=%.4f < threshold=%.2f",
                cached_question, score, threshold
            )
            return None

        logger.info(
            "🎯 [SEMANTIC CACHE HIT] Matched: '%s' | similarity=%.4f >= threshold=%.2f",
            cached_question, score, threshold
        )
        return {
            "answer": payload.get("answer", ""),
            "citations": payload.get("citations", []),
            "question": cached_question,
            "similarity": round(score, 4),
            "cached_at": payload.get("created_at"),
            "scope_key": payload.get("scope_key"),
        }

    return await run_in_threadpool(_sync_lookup)


async def save_cached_answer(
    question: str,
    answer: str,
    query_vector: list[float],
    classroom_id: str,
    chapter_id: str | None = None,
    citations: list[dict] | None = None,
    prompt_version: str = "tutor-v2",
) -> None:
    """Store a grounded tutor answer in the semantic cache with expiry and scope metadata."""
    if not settings.SEMANTIC_CACHE_ENABLED:
        return
    if not answer or not answer.strip():
        return

    dim = len(query_vector)
    scope_key = create_scope_key(chapter_id)
    now = int(time.time())
    expires_at = now + settings.SEMANTIC_CACHE_TTL_SECONDS

    # Check whether a similar question already exists
    duplicate = await find_near_duplicate(
        query_vector=query_vector,
        classroom_id=classroom_id,
        scope_key=create_scope_key(chapter_id),
        prompt_version=prompt_version,
        threshold=0.85
    )

    if duplicate:
        logger.info(
            "Duplicate cache entry skipped. "
            "Question='%s', existing='%s', similarity=%.4f",
            question,
            duplicate["question"],
            duplicate["score"],
        )
        return
    
    from fastapi.concurrency import run_in_threadpool

    def _sync_save():
        ensure_cache_collection(dim)
        client = qdrant_service.get_client()

        point_id = str(uuid.uuid4())
        point = PointStruct(
            id=point_id,
            vector=query_vector,
            payload={
                "question": question.strip(),
                "answer": answer.strip(),
                "citations": citations or [],
                "classroom_id": classroom_id,
                "chapter_id": chapter_id or "",
                "scope_key": scope_key,
                "prompt_version": prompt_version,
                "embedding_model": settings.EMBEDDING_MODEL,
                "created_at": now,
                "expires_at": expires_at,
            },
        )
        client.upsert(
            collection_name=settings.SEMANTIC_CACHE_COLLECTION,
            points=[point],
            wait=False,
        )
        logger.info(
            "💾 [SEMANTIC CACHE SAVED] scope='%s' question='%s' (expires in %ds)",
            scope_key, question[:60], settings.SEMANTIC_CACHE_TTL_SECONDS,
        )

    await run_in_threadpool(_sync_save)


async def invalidate_semantic_cache(
    classroom_id: str | None = None,
    chapter_id: str | None = None,
) -> None:
    """Invalidate semantic cache entries when chapters or classroom contents change."""
    from fastapi.concurrency import run_in_threadpool

    def _sync_invalidate():
        client = qdrant_service.get_client()
        name = settings.SEMANTIC_CACHE_COLLECTION

        # Check if collection exists first
        existing = [c.name for c in client.get_collections().collections]
        if name not in existing:
            return

        must_conditions = []
        if classroom_id:
            must_conditions.append(
                FieldCondition(key="classroom_id", match=MatchValue(value=classroom_id))
            )
        if chapter_id:
            must_conditions.append(
                FieldCondition(key="chapter_id", match=MatchValue(value=chapter_id))
            )

        if not must_conditions:
            # Clear all
            client.delete(
                collection_name=name,
                points_selector=Filter(must=[]),
                wait=True,
            )
            logger.info("Semantic cache completely wiped")
            return

        client.delete(
            collection_name=name,
            points_selector=Filter(must=must_conditions),
            wait=True,
        )
        logger.info(
            "🗑️ [SEMANTIC CACHE INVALIDATED] classroom=%s chapter=%s",
            classroom_id, chapter_id,
        )

    try:
        await run_in_threadpool(_sync_invalidate)
    except Exception as exc:
        logger.warning("Failed to invalidate semantic cache in Qdrant: %s", exc)


async def cleanup_expired_cache() -> None:
    """Remove expired semantic cache entries."""
    from fastapi.concurrency import run_in_threadpool

    def _sync_cleanup():
        client = qdrant_service.get_client()
        name = settings.SEMANTIC_CACHE_COLLECTION
        existing = [c.name for c in client.get_collections().collections]
        if name not in existing:
            return

        now = int(time.time())
        client.delete(
            collection_name=name,
            points_selector=Filter(
                must=[FieldCondition(key="expires_at", range=Range(lt=now))]
            ),
            wait=True,
        )
        logger.info("Cleaned up expired semantic cache entries older than %d", now)

    try:
        await run_in_threadpool(_sync_cleanup)
    except Exception as exc:
        logger.warning("Failed to cleanup expired semantic cache: %s", exc)
