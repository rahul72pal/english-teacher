"""Embedding client — NVIDIA model via the LangChain integration.

Uses langchain_nvidia_ai_endpoints.NVIDIAEmbeddings with SYNCHRONOUS calls
run in a threadpool (no raw httpx/async HTTP). NVIDIAEmbeddings talks to
NVIDIA's own endpoint — no custom base URL is needed. Configured from .env:

- EMBEDDING_MODEL  e.g. "nvidia/nemotron-3.5-embed-1b"
- OPENAI_API_KEY   the NVIDIA API key
"""

import logging
import os
from typing import Any

from fastapi.concurrency import run_in_threadpool

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = settings.NVIDIA_API_KEY or settings.OPENAI_API_KEY
        if not api_key:
            raise RuntimeError("NVIDIA_API_KEY or OPENAI_API_KEY is not configured in .env")
        if not settings.EMBEDDING_MODEL:
            raise RuntimeError("EMBEDDING_MODEL is not configured in .env")

        from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings

        _client = NVIDIAEmbeddings(
            model=settings.EMBEDDING_MODEL,
            api_key=api_key,
            truncate="END",
            max_batch_size=4,
        )
        if hasattr(_client, "_client") and hasattr(_client._client, "timeout"):
            _client._client.timeout = 180.0
        if hasattr(_client, "_async_client") and hasattr(_client._async_client, "timeout"):
            _client._async_client.timeout = 180.0
        logger.info(
            "Embedding client ready: model=%s (NVIDIA default endpoint) "
            "api_key_fingerprint=%s...%s length=%d dots=%d spaces=%d quotes=%d "
            "(source: %s)",
            settings.EMBEDDING_MODEL,
            api_key[:6], api_key[-4:], len(api_key), api_key.count("."),
            any(c.isspace() for c in api_key),
            api_key[:1] in ('"', "'"),
            "NVIDIA_API_KEY" if settings.NVIDIA_API_KEY else ("environment variable" if os.environ.get("OPENAI_API_KEY") else ".env file"),
        )
    return _client


async def create_embeddings_with_metadata(
    texts: list[str],
) -> tuple[list[list[float]], list[dict[str, Any]]]:
    """Generate embeddings for a batch of texts and track any flagged/fallback chunks."""
    client = _get_client()

    def _sync_embed() -> tuple[list[list[float]], list[dict[str, Any]]]:
        results: list[list[float]] = []
        flagged_items: list[dict[str, Any]] = []
        batch_size = 10

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            try:
                batch_vectors = client.embed_documents(batch)
                results.extend([list(map(float, v)) for v in batch_vectors])
            except Exception as batch_exc:
                logger.warning(
                    "Embedding batch %d-%d failed (%s: %s). Falling back to per-chunk processing.",
                    i, i + len(batch), type(batch_exc).__name__, batch_exc,
                )
                for j, item in enumerate(batch, i):
                    try:
                        single_v = client.embed_documents([item])
                        results.append(list(map(float, single_v[0])))
                    except Exception as single_exc:
                        reason = "Content safety screening (sensitive links/phrases)" if "content safety" in str(single_exc).lower() else str(single_exc)[:150]
                        logger.warning(
                            "Chunk %d embedding rejected by provider (%s: %s). Using safe fallback embedding.",
                            j, type(single_exc).__name__, single_exc,
                        )
                        flagged_items.append({"chunk_index": j, "reason": reason})
                        try:
                            fallback_v = client.embed_documents(["[Content omitted due to content screening]"])
                            results.append(list(map(float, fallback_v[0])))
                        except Exception:
                            dim = len(results[-1]) if results else 4096
                            neutral = [0.0] * dim
                            neutral[0] = 0.0001
                            results.append(neutral)

        return results, flagged_items

    return await run_in_threadpool(_sync_embed)


async def create_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts (sync SDK call in a threadpool)."""
    vectors, _ = await create_embeddings_with_metadata(texts)
    return vectors


async def create_embedding_query(text: str) -> list[float]:
    """Generate one query embedding for vector search."""
    client = _get_client()
    vector = await run_in_threadpool(client.embed_query, text)
    return list(map(float, vector))
