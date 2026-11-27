"""Hybrid Search service: combines Dense Vector search (Qdrant) and
Lexical BM25 search with Reciprocal Rank Fusion (RRF).
"""

import asyncio
import logging
from typing import Any

from bson import ObjectId
from fastapi.concurrency import run_in_threadpool

from app.core import embeddings
from app.database.mongodb import db
from app.services import bm25_service, qdrant_service

logger = logging.getLogger(__name__)


def reciprocal_rank_fusion(
    semantic_results: list[dict],
    bm25_results: list[dict],
    top_k: int = 10,
    k: int = 60,
) -> list[dict]:
    """Combine dense semantic and lexical BM25 results via Reciprocal Rank Fusion (RRF).

    RRF score = sum(1.0 / (k + rank)) across ranking systems.
    Also tracks whether each candidate originated from semantic, BM25, or both.
    """
    fused: dict[str, dict[str, Any]] = {}

    # Process semantic results
    for rank, chunk in enumerate(semantic_results, start=1):
        chunk_id = (
            chunk.get("chunk_id")
            or f"{chunk.get('chapter_id')}_{chunk.get('chunk_index')}"
        )
        if chunk_id not in fused:
            fused[chunk_id] = {
                "chunk": chunk,
                "rrf_score": 0.0,
                "sources": ["semantic"],
                "semantic_rank": rank,
                "semantic_score": chunk.get("score"),
                "bm25_rank": None,
                "bm25_score": None,
            }
        fused[chunk_id]["rrf_score"] += 1.0 / (k + rank)

    # Process BM25 results
    for rank, chunk in enumerate(bm25_results, start=1):
        chunk_id = (
            chunk.get("chunk_id")
            or f"{chunk.get('chapter_id')}_{chunk.get('chunk_index')}"
        )
        if chunk_id not in fused:
            fused[chunk_id] = {
                "chunk": chunk,
                "rrf_score": 0.0,
                "sources": ["bm25"],
                "semantic_rank": None,
                "semantic_score": None,
                "bm25_rank": rank,
                "bm25_score": chunk.get("bm25_score"),
            }
        else:
            if "bm25" not in fused[chunk_id]["sources"]:
                fused[chunk_id]["sources"].append("bm25")
            fused[chunk_id]["bm25_rank"] = rank
            fused[chunk_id]["bm25_score"] = chunk.get("bm25_score")
        fused[chunk_id]["rrf_score"] += 1.0 / (k + rank)

    ranked = sorted(
        fused.values(),
        key=lambda x: x["rrf_score"],
        reverse=True,
    )

    final_results: list[dict] = []
    for item in ranked[:top_k]:
        chunk = item["chunk"].copy()
        chunk["rrf_score"] = round(item["rrf_score"], 6)
        chunk["score"] = round(item["rrf_score"], 6)
        chunk["sources"] = item["sources"]
        chunk["source"] = "both (semantic + bm25)" if len(item["sources"]) >= 2 else item["sources"][0]
        chunk["semantic_rank"] = item["semantic_rank"]
        chunk["bm25_rank"] = item["bm25_rank"]
        final_results.append(chunk)

    return final_results


async def dense_search_classroom_chunks(
    query: str,
    classroom_id: str,
    chapter_id: str | None = None,
    top_k: int = 20,
) -> list[dict]:
    """Dense vector search over Qdrant scoped to classroom and optional chapter."""
    try:
        query_vector = await embeddings.create_embedding_query(query)
    except Exception as exc:
        logger.warning("Dense search embedding generation failed: %s", exc)
        return []

    try:
        try:
            hits = await run_in_threadpool(
                qdrant_service.search_classroom,
                query_vector,
                classroom_id,
                top_k,
                chapter_id,
            )
        except TypeError:
            hits = await run_in_threadpool(
                qdrant_service.search_classroom,
                query_vector,
                classroom_id,
                top_k,
            )
    except Exception as exc:
        logger.warning("Dense search in Qdrant failed: %s", exc)
        return []

    results: list[dict] = []
    for h in hits:
        item = h.copy()
        item["chunk_id"] = (
            item.get("chunk_id")
            or f"{item['chapter_id']}_{item['chunk_index']}"
        )
        results.append(item)

    return results


async def bm25_search_classroom_chunks(
    query: str,
    classroom_id: str,
    chapter_id: str | None = None,
    top_k: int = 20,
) -> list[dict]:
    """BM25 lexical search over indexed classroom chunks."""
    try:
        return await bm25_service.bm25_search_classroom_chunks(
            query=query,
            classroom_id=classroom_id,
            chapter_id=chapter_id,
            top_k=top_k,
        )
    except Exception as exc:
        logger.warning("BM25 search failed: %s", exc)
        return []


async def hybrid_search(
    query: str,
    classroom_id: str,
    chapter_id: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """Execute parallel Dense + BM25 search, fuse with RRF, and enrich metadata."""
    # Run both retrieval methods in parallel
    semantic_results, bm25_results = await asyncio.gather(
        dense_search_classroom_chunks(
            query=query,
            classroom_id=classroom_id,
            chapter_id=chapter_id,
            top_k=20,
        ),
        bm25_search_classroom_chunks(
            query=query,
            classroom_id=classroom_id,
            chapter_id=chapter_id,
            top_k=20,
        ),
    )

    logger.debug(
        "Hybrid retrieval hits for classroom %s: dense=%d, bm25=%d",
        classroom_id, len(semantic_results), len(bm25_results),
    )

    # Combine with Reciprocal Rank Fusion
    fused_results = reciprocal_rank_fusion(
        semantic_results=semantic_results,
        bm25_results=bm25_results,
        top_k=max(top_k * 2, 10),
    )

    # Enrich with chapter metadata if chapter_title is missing
    missing_title_ids = [
        item["chapter_id"]
        for item in fused_results
        if (not item.get("chapter_title") or item.get("chapter_title") == "Unknown") and "chapter_id" in item
    ]
    if missing_title_ids:
        try:
            database = db.get_db()
            chapters = {
                str(c["_id"]): c
                for c in await database.chapters.find(
                    {"_id": {"$in": [ObjectId(cid) for cid in set(missing_title_ids) if ObjectId.is_valid(cid)]}}
                ).to_list(length=100)
            }
            for item in fused_results:
                if not item.get("chapter_title") or item.get("chapter_title") == "Unknown":
                    ch = chapters.get(item.get("chapter_id"), {})
                    item["chapter_title"] = ch.get("title", "Unknown")
        except Exception as exc:
            logger.debug("Failed to enrich chapter titles from DB: %s", exc)

    final_top_k = fused_results[:top_k]

    # Detailed logs: Semantic vs BM25 vs Hybrid Fusion
    logger.info("=== [HYBRID SEARCH] Query: '%s' (classroom: %s, chapter: %s) ===", query, classroom_id, chapter_id or "all")

    # 1. Semantic / Dense logs
    logger.info("--- [1. SEMANTIC / DENSE SEARCH] (%d candidates retrieved) ---", len(semantic_results))
    for i, item in enumerate(semantic_results[:5], 1):
        txt = (item.get("text", "")[:70] + "...") if len(item.get("text", "")) > 70 else item.get("text", "")
        logger.info(
            "   [SEMANTIC #%d] chunk_id=%s, score=%.4f, chapter='%s' | %s",
            i, item.get("chunk_id"), float(item.get("score", 0.0)), item.get("chapter_title", "Unknown"), txt.replace("\n", " "),
        )
    if len(semantic_results) > 5:
        logger.info("   ... and %d more semantic candidates", len(semantic_results) - 5)

    # 2. BM25 / Lexical logs
    logger.info("--- [2. BM25 / LEXICAL SEARCH] (%d candidates retrieved) ---", len(bm25_results))
    for i, item in enumerate(bm25_results[:5], 1):
        txt = (item.get("text", "")[:70] + "...") if len(item.get("text", "")) > 70 else item.get("text", "")
        logger.info(
            "   [BM25 #%d] chunk_id=%s, bm25_score=%.4f, chapter='%s' | %s",
            i, item.get("chunk_id"), float(item.get("bm25_score", 0.0)), item.get("chapter_title", "Unknown"), txt.replace("\n", " "),
        )
    if len(bm25_results) > 5:
        logger.info("   ... and %d more BM25 candidates", len(bm25_results) - 5)

    # 3. Hybrid Fused (RRF) logs
    logger.info("--- [3. HYBRID FUSED (RRF)] (Final Top %d) ---", len(final_top_k))
    for i, item in enumerate(final_top_k, 1):
        txt = (item.get("text", "")[:70] + "...") if len(item.get("text", "")) > 70 else item.get("text", "")
        logger.info(
            "   [HYBRID #%d] source=[%s], chunk_id=%s, rrf_score=%.6f, chapter='%s' | %s",
            i, item.get("source", "hybrid"), item.get("chunk_id"), float(item.get("rrf_score", 0.0)), item.get("chapter_title", "Unknown"), txt.replace("\n", " "),
        )
    logger.info("=== [END HYBRID SEARCH] ===")

    # Final top_k cut
    return final_top_k
