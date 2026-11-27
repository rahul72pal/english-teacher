"""Unit & integration tests for BM25 lexical search and Hybrid Search (RRF)."""

import asyncio
from bson import ObjectId

from app.services import bm25_service, hybrid_search_service
from app.services.bm25_service import (
    build_bm25_index,
    invalidate_bm25_cache,
    search_bm25,
    tokenize,
    _bm25_cache,
)
from app.services.hybrid_search_service import (
    hybrid_search,
    reciprocal_rank_fusion,
)


def test_tokenization():
    text = "The quick, brown fox jumps over Little Red Riding-Hood's dog!"
    tokens = tokenize(text)
    assert "quick" in tokens
    assert "brown" in tokens
    assert "fox" in tokens
    assert "riding-hood's" in tokens or "riding" in tokens
    print("PASS: tokenization")


def test_bm25_search_and_caching():
    chunks = [
        {"chunk_id": "c1_0", "chapter_id": "c1", "chunk_index": 0, "text": "Little Red Riding Hood went into the forest to visit grandmother."},
        {"chunk_id": "c1_1", "chapter_id": "c1", "chunk_index": 1, "text": "Snow White ate a poisoned red apple from the wicked queen."},
        {"chunk_id": "c2_0", "chapter_id": "c2", "chunk_index": 0, "text": "The woodcutter split the wolf open and saved grandmother."},
    ]

    index = build_bm25_index(chunks)
    results = search_bm25("grandmother wolf", chunks, index, top_k=2)
    assert len(results) > 0
    # Chunk with wolf and grandmother should rank high
    assert results[0]["chunk_id"] in ("c2_0", "c1_0")
    assert results[0]["bm25_score"] > 0
    print("PASS: bm25_search")


def test_reciprocal_rank_fusion():
    semantic_results = [
        {"chunk_id": "doc1", "text": "Doc 1 text", "score": 0.95},
        {"chunk_id": "doc2", "text": "Doc 2 text", "score": 0.85},
        {"chunk_id": "doc3", "text": "Doc 3 text", "score": 0.75},
    ]
    bm25_results = [
        {"chunk_id": "doc2", "text": "Doc 2 text", "bm25_score": 12.5},
        {"chunk_id": "doc4", "text": "Doc 4 text", "bm25_score": 10.0},
        {"chunk_id": "doc1", "text": "Doc 1 text", "bm25_score": 8.0},
    ]

    fused = reciprocal_rank_fusion(semantic_results, bm25_results, top_k=3, k=60)
    assert len(fused) == 3

    # doc2 is rank 2 in semantic and rank 1 in bm25: (1/62) + (1/61)
    # doc1 is rank 1 in semantic and rank 3 in bm25: (1/61) + (1/63)
    # Both doc1 and doc2 appear in both and should be at the top
    top_ids = [item["chunk_id"] for item in fused]
    assert "doc1" in top_ids[:2]
    assert "doc2" in top_ids[:2]
    assert fused[0]["rrf_score"] > 0
    assert fused[0]["score"] == fused[0]["rrf_score"]
    print("PASS: reciprocal_rank_fusion")


async def test_bm25_cache_reuse_and_invalidation():
    invalidate_bm25_cache()
    classroom_id = str(ObjectId())
    chapter_id = str(ObjectId())

    # Mock DB chapters
    fake_chunks = [
        {"chunk_index": 0, "text": "Present simple tense is used for habitual actions."},
        {"chunk_index": 1, "text": "He plays football every weekend in London."},
    ]

    # Pre-populate cache directly or test invalidation
    key = bm25_service._cache_key(classroom_id, chapter_id)
    idx = build_bm25_index([{"text": c["text"], "chunk_index": c["chunk_index"]} for c in fake_chunks])
    _bm25_cache[key] = {"index": idx, "chunks": fake_chunks}

    # Retrieve from cache
    cached_idx, cached_chunks = await bm25_service.get_or_build_bm25_index(classroom_id, chapter_id)
    assert cached_idx is idx
    assert cached_chunks is fake_chunks
    print("PASS: bm25_cache_reuse (index NOT rebuilt)")

    # Invalidate
    invalidate_bm25_cache(classroom_id, chapter_id)
    assert key not in _bm25_cache
    print("PASS: bm25_cache_invalidation")


async def test_hybrid_search_integration():
    classroom_id = str(ObjectId())
    chapter_id = str(ObjectId())

    # Stub dense search
    async def fake_dense(query, classroom_id, chapter_id=None, top_k=20):
        return [
            {"chunk_id": f"{chapter_id}_0", "chapter_id": chapter_id, "chapter_title": "Grammar 1", "chunk_index": 0, "text": "Present continuous tense", "score": 0.91}
        ]

    # Stub bm25 search
    async def fake_bm25(query, classroom_id, chapter_id=None, top_k=20):
        return [
            {"chunk_id": f"{chapter_id}_0", "chapter_id": chapter_id, "chapter_title": "Grammar 1", "chunk_index": 0, "text": "Present continuous tense", "bm25_score": 5.2}
        ]

    hybrid_search_service.dense_search_classroom_chunks = fake_dense
    hybrid_search_service.bm25_search_classroom_chunks = fake_bm25

    results = await hybrid_search("continuous", classroom_id, chapter_id, top_k=5)
    assert len(results) == 1
    assert results[0]["chunk_id"] == f"{chapter_id}_0"
    assert results[0]["rrf_score"] > 0
    assert results[0]["chapter_title"] == "Grammar 1"
    print("PASS: hybrid_search_integration")


if __name__ == "__main__":
    test_tokenization()
    test_bm25_search_and_caching()
    test_reciprocal_rank_fusion()
    asyncio.run(test_bm25_cache_reuse_and_invalidation())
    asyncio.run(test_hybrid_search_integration())
    print("\nALL HYBRID SEARCH TESTS PASSED!")
