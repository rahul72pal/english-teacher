"""Unit and integration tests for Semantic Caching in AI Tutor."""

import asyncio
import time
from bson import ObjectId

from app.core.config import settings
from app.services import semantic_cache_service, ai_tutor_service
from app.services.semantic_cache_service import (
    create_scope_key,
    is_cacheable_question,
)


def test_is_cacheable_question():
    # Good candidates
    assert is_cacheable_question("What is photosynthesis?") is True
    assert is_cacheable_question("Explain nouns and verbs with examples.") is True
    assert is_cacheable_question("What is the past tense of run?") is True

    # Bad candidates (conversation-dependent)
    assert is_cacheable_question("Explain the previous answer.") is False
    assert is_cacheable_question("What did you just say?") is False
    assert is_cacheable_question("As you mentioned earlier, explain again.") is False

    # Bad candidates (personal / dynamic / test generation)
    assert is_cacheable_question("How much did I score?") is False
    assert is_cacheable_question("What is my result?") is False
    assert is_cacheable_question("Show my progress in this class.") is False
    assert is_cacheable_question("Generate a test for chapter 1.") is False

    # Boundary lengths
    assert is_cacheable_question("hi") is False  # < 3
    assert is_cacheable_question("a" * 700) is False  # > 600

    print("PASS: is_cacheable_question rules")


def test_create_scope_key():
    assert create_scope_key("ch_99") == "chapter:ch_99"
    assert create_scope_key(None) == "classroom:all"
    assert create_scope_key("") == "classroom:all"
    print("PASS: create_scope_key")


async def test_semantic_cache_flow():
    # Mock in-memory Qdrant points store
    cache_store: list[dict] = []

    class FakeHit:
        def __init__(self, score, payload):
            self.score = score
            self.payload = payload

    class FakePointsResult:
        def __init__(self, points):
            self.points = points

    class FakeClient:
        def get_collections(self):
            class Col:
                name = settings.SEMANTIC_CACHE_COLLECTION
            class R:
                collections = [Col()]
            return R()

        def get_collection(self, name):
            class P:
                vectors = type("V", (), {"size": 3})()
            class I:
                config = type("C", (), {"params": P()})()
                payload_schema = {}
            return I()

        def create_collection(self, **kwargs):
            pass

        def create_payload_index(self, **kwargs):
            pass

        def upsert(self, collection_name, points, **kwargs):
            for pt in points:
                cache_store[:] = [p for p in cache_store if p["id"] != pt.id]
                cache_store.append({
                    "id": pt.id,
                    "vector": pt.vector,
                    "payload": pt.payload,
                })

        def query_points(self, collection_name, query, query_filter, limit=1, score_threshold=None, **kwargs):
            hits = []
            now = int(time.time())
            for item in cache_store:
                payload = item["payload"]
                # Match filter
                classroom_id = None
                scope_key = None
                prompt_version = None
                for cond in query_filter.must:
                    if getattr(cond, "key", None) == "classroom_id":
                        classroom_id = cond.match.value
                    elif getattr(cond, "key", None) == "scope_key":
                        scope_key = cond.match.value
                    elif getattr(cond, "key", None) == "prompt_version":
                        prompt_version = cond.match.value

                if classroom_id and payload.get("classroom_id") != classroom_id:
                    continue
                if scope_key and payload.get("scope_key") != scope_key:
                    continue
                if prompt_version and payload.get("prompt_version") != prompt_version:
                    continue
                if payload.get("expires_at", 0) < now:
                    continue

                # Cosine dot product
                v1, v2 = query, item["vector"]
                score = sum(a * b for a, b in zip(v1, v2))
                if score_threshold is None or score >= score_threshold:
                    hits.append(FakeHit(score, payload))

            hits.sort(key=lambda h: h.score, reverse=True)
            return FakePointsResult(hits[:limit])

        def delete(self, collection_name, points_selector, **kwargs):
            cache_store.clear()

    import app.services.qdrant_service as qs
    qs.get_client = lambda: FakeClient()
    semantic_cache_service._ensured_cache_dim = 3

    classroom_id = "class_1"
    chapter_id = "chap_1"
    scope_key = create_scope_key(chapter_id)
    query_vec = [1.0, 0.0, 0.0]

    # 1. Cache Miss Initially
    miss = await semantic_cache_service.find_cached_answer(
        query_vector=query_vec,
        classroom_id=classroom_id,
        scope_key=scope_key,
        prompt_version="tutor-v2",
        threshold=0.90,
    )
    assert miss is None
    print("PASS: initial cache miss")

    # 2. Save Answer to Cache
    await semantic_cache_service.save_cached_answer(
        question="What is photosynthesis?",
        answer="Photosynthesis is the process plants use to make food.",
        query_vector=query_vec,
        classroom_id=classroom_id,
        chapter_id=chapter_id,
        citations=[{"chapter_id": chapter_id, "chapter_title": "Biology", "chunk_index": 0, "score": 1.0, "text": "passage"}],
        prompt_version="tutor-v2",
    )
    assert len(cache_store) == 1
    print("PASS: answer saved to semantic cache")

    # 3. Cache Hit on identical vector
    hit = await semantic_cache_service.find_cached_answer(
        query_vector=query_vec,
        classroom_id=classroom_id,
        scope_key=scope_key,
        prompt_version="tutor-v2",
        threshold=0.90,
    )
    assert hit is not None
    assert hit["similarity"] == 1.0
    assert "Photosynthesis" in hit["answer"]
    assert len(hit["citations"]) == 1
    print("PASS: cache hit on identical query vector")

    # 4. Cache Hit on semantically close vector (cosine >= 0.92)
    # [0.98, 0.198, 0.0] dot [1.0, 0.0, 0.0] = 0.98
    close_vec = [0.98, 0.198, 0.0]
    hit_close = await semantic_cache_service.find_cached_answer(
        query_vector=close_vec,
        classroom_id=classroom_id,
        scope_key=scope_key,
        prompt_version="tutor-v2",
        threshold=0.92,
    )
    assert hit_close is not None
    assert hit_close["similarity"] == 0.98
    print("PASS: semantic cache hit on similar question vector (0.98 >= 0.92)")

    # 5. Cache Miss on semantically distant vector (cosine < 0.92)
    distant_vec = [0.5, 0.866, 0.0]
    miss_distant = await semantic_cache_service.find_cached_answer(
        query_vector=distant_vec,
        classroom_id=classroom_id,
        scope_key=scope_key,
        prompt_version="tutor-v2",
        threshold=0.92,
    )
    assert miss_distant is None
    print("PASS: semantic cache miss on distant question vector (0.50 < 0.92)")

    # 6. Cache Miss on different classroom / scope
    miss_other_class = await semantic_cache_service.find_cached_answer(
        query_vector=query_vec,
        classroom_id="other_classroom",
        scope_key=scope_key,
        prompt_version="tutor-v2",
        threshold=0.90,
    )
    assert miss_other_class is None
    print("PASS: classroom isolation verified")

    # 7. Invalidate cache
    await semantic_cache_service.invalidate_semantic_cache(classroom_id, chapter_id)
    assert len(cache_store) == 0
    print("PASS: cache invalidation")


def test_clean_tutor_response():
    assert ai_tutor_service.clean_tutor_response("hair black as night (Text [4]).") == "hair black as night."
    assert ai_tutor_service.clean_tutor_response("wicked and vain (Text [4], Text [5]).") == "wicked and vain."
    assert ai_tutor_service.clean_tutor_response("sweet and gentle [1].") == "sweet and gentle."
    print("PASS: clean_tutor_response")


async def test_tutor_answer_integration_with_cache():
    # Verify tutor_answer returns source='semantic_cache' on hit
    async def fake_embed(text):
        if "photosynthesis" in text.lower():
            return [1.0, 0.0, 0.0]
        return [0.0, 1.0, 0.0]

    import app.core.embeddings as emb
    emb.create_embedding_query = fake_embed

    classroom_id = str(ObjectId())
    chapter_id = str(ObjectId())

    # Pre-populate cache directly
    await semantic_cache_service.save_cached_answer(
        question="What is photosynthesis?",
        answer="Photosynthesis is plant food generation.",
        query_vector=[1.0, 0.0, 0.0],
        classroom_id=classroom_id,
        chapter_id=chapter_id,
        citations=[],
        prompt_version=ai_tutor_service.PROMPT_VERSION,
    )

    result = await ai_tutor_service.tutor_answer(classroom_id, "Explain photosynthesis please.", chapter_id)
    assert result.get("source") == "semantic_cache"
    assert "Photosynthesis" in result["answer"]
    print("PASS: tutor_answer cache hit skipped LLM!")


if __name__ == "__main__":
    test_clean_tutor_response()
    test_is_cacheable_question()
    test_create_scope_key()
    asyncio.run(test_semantic_cache_flow())
    asyncio.run(test_tutor_answer_integration_with_cache())
    print("\nALL SEMANTIC CACHE TESTS PASSED!")
