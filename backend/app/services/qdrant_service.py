import hashlib
import logging

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: QdrantClient | None = None
_ensured_collections: dict[str, int] = {}  # collection name -> dim already ensured


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        if not settings.QDRANT_CLUSTER_ENDPOINT:
            raise RuntimeError("QDRANT_CLUSTER_ENDPOINT is not configured in .env")
        if not settings.QDRANT_API_KEY:
            raise RuntimeError("QDRANT_API_KEY is not configured in .env")
        _client = QdrantClient(
            url=settings.QDRANT_CLUSTER_ENDPOINT,
            api_key=settings.QDRANT_API_KEY,
            timeout=30,
        )
    return _client


def _point_id(chapter_id: str, index: int) -> str:
    """Stable UUID-ish id per chunk so re-processing overwrites the same points."""
    return hashlib.md5(f"{chapter_id}:{index}".encode()).hexdigest()


def ensure_collection(dim: int) -> str:
    """Create the collection for this embedding dimension if it doesn't exist."""
    name = settings.QDRANT_COLLECTION
    if _ensured_collections.get(name) == dim:
        return name

    client = get_client()
    existing = [c.name for c in client.get_collections().collections]
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
        )
        info = None
    else:
        # A collection already exists with some dimension; verify compatibility
        info = client.get_collection(name)
        existing_dim = info.config.params.vectors.size
        if existing_dim != dim:
            raise RuntimeError(
                f"Qdrant collection '{name}' has vector size {existing_dim} "
                f"but the embedding model returned {dim}. Use a different "
                f"QDRANT_COLLECTION name or re-index."
            )

    # Payload indexes required for filtered search (Qdrant rejects filters on
    # unindexed fields with 'Index required but not found').
    from qdrant_client.models import PayloadSchemaType

    indexed_fields = set(info.payload_schema.keys()) if info and info.payload_schema else set()
    for field in ("classroom_id", "chapter_id"):
        if field not in indexed_fields:
            client.create_payload_index(
                collection_name=name,
                field_name=field,
                field_schema=PayloadSchemaType.KEYWORD,
                wait=True,
            )
            logger.info("Qdrant payload index created: %s (keyword)", field)
    _ensured_collections[name] = dim
    return name


def upsert_chunks(
    chapter_id: str,
    classroom_id: str,
    teacher_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
    embedding_model: str,
) -> int:
    """Store chunk texts + vectors in Qdrant. Returns the number of points."""
    if not chunks:
        return 0
    dim = len(embeddings[0])
    ensure_collection(dim)

    points = [
        PointStruct(
            id=_point_id(chapter_id, i),
            vector=vector,
            payload={
                "chapter_id": chapter_id,
                "classroom_id": classroom_id,
                "teacher_id": teacher_id,
                "chunk_index": i,
                "text": text,
                "embedding_model": embedding_model,
            },
        )
        for i, (text, vector) in enumerate(zip(chunks, embeddings))
    ]
    get_client().upsert(collection_name=settings.QDRANT_COLLECTION, points=points, wait=True)
    logger.info(
        "Qdrant upsert: %d points into '%s' (dim=%d, model=%s)",
        len(points), settings.QDRANT_COLLECTION, dim, embedding_model,
    )
    return len(points)


def delete_chapter_chunks(chapter_id: str) -> None:
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    get_client().delete(
        collection_name=settings.QDRANT_COLLECTION,
        points_selector=Filter(
            must=[FieldCondition(key="chapter_id", match=MatchValue(value=chapter_id))]
        ),
        wait=True,
    )


def get_chapter_chunks(chapter_id: str, limit: int = 30) -> list[dict]:
    """Scroll all stored chunks of one chapter (for question generation)."""
    from qdrant_client.models import FieldCondition, Filter, MatchValue

    hits = get_client().scroll(
        collection_name=settings.QDRANT_COLLECTION,
        scroll_filter=Filter(
            must=[FieldCondition(key="chapter_id", match=MatchValue(value=chapter_id))]
        ),
        limit=limit,
        with_payload=True,
    )[0]
    return [
        {
            "chunk_id": f"{hit.payload['chapter_id']}_{hit.payload['chunk_index']}",
            "chapter_id": hit.payload["chapter_id"],
            "chunk_index": hit.payload["chunk_index"],
            "text": hit.payload["text"],
        }
        for hit in hits
    ]


def get_classroom_chunks(classroom_id: str, chapter_id: str | None = None, limit: int = 1000) -> list[dict]:
    """Scroll stored chunks for a whole classroom or a single chapter in that classroom."""
    from qdrant_client.models import FieldCondition, Filter, MatchValue

    must_conditions = [
        FieldCondition(key="classroom_id", match=MatchValue(value=classroom_id))
    ]
    if chapter_id:
        must_conditions.append(
            FieldCondition(key="chapter_id", match=MatchValue(value=chapter_id))
        )

    hits = get_client().scroll(
        collection_name=settings.QDRANT_COLLECTION,
        scroll_filter=Filter(must=must_conditions),
        limit=limit,
        with_payload=True,
    )[0]
    return [
        {
            "chunk_id": f"{hit.payload['chapter_id']}_{hit.payload['chunk_index']}",
            "chapter_id": hit.payload["chapter_id"],
            "classroom_id": hit.payload.get("classroom_id", classroom_id),
            "chunk_index": hit.payload["chunk_index"],
            "text": hit.payload["text"],
        }
        for hit in hits
    ]


def search_classroom(query_vector: list[float], classroom_id: str, top_k: int = 5, chapter_id: str | None = None) -> list[dict]:
    from qdrant_client.models import FieldCondition, Filter, MatchValue

    dim = len(query_vector)
    ensure_collection(dim)

    must_conditions = [
        FieldCondition(key="classroom_id", match=MatchValue(value=classroom_id))
    ]
    if chapter_id:
        must_conditions.append(
            FieldCondition(key="chapter_id", match=MatchValue(value=chapter_id))
        )

    hits = get_client().query_points(
        collection_name=settings.QDRANT_COLLECTION,
        query=query_vector,
        query_filter=Filter(must=must_conditions),
        limit=top_k,
        with_payload=True,
    ).points
    logger.info(
        "Qdrant search: %d hits for classroom %s (top_k=%d)",
        len(hits), classroom_id, top_k,
    )

    return [
        {
            "chunk_id": f"{hit.payload['chapter_id']}_{hit.payload['chunk_index']}",
            "chapter_id": hit.payload["chapter_id"],
            "chunk_index": hit.payload["chunk_index"],
            "text": hit.payload["text"],
            "score": hit.score,
        }
        for hit in hits
    ]


from qdrant_client.models import PayloadSchemaType

def ensure_payload_indexes():
    client = get_client()

    for field in ["classroom_id", "chapter_id", "teacher_id"]:
        client.create_payload_index(
            collection_name=settings.QDRANT_COLLECTION,
            field_name=field,
            field_schema=PayloadSchemaType.KEYWORD,
            wait=True,
        )