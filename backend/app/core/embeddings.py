"""Embedding client — NVIDIA model via the LangChain integration.

Uses langchain_nvidia_ai_endpoints.NVIDIAEmbeddings with SYNCHRONOUS calls
run in a threadpool (no raw httpx/async HTTP). NVIDIAEmbeddings talks to
NVIDIA's own endpoint — no custom base URL is needed. Configured from .env:

- EMBEDDING_MODEL  e.g. "nvidia/nemotron-3.5-embed-1b"
- OPENAI_API_KEY   the NVIDIA API key
"""

import logging
import os

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


async def create_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts (sync SDK call in a threadpool)."""
    client = _get_client()
    vectors = await run_in_threadpool(client.embed_documents, texts)
    return [list(map(float, v)) for v in vectors]


async def create_embedding_query(text: str) -> list[float]:
    """Generate one query embedding for vector search."""
    client = _get_client()
    vector = await run_in_threadpool(client.embed_query, text)
    return list(map(float, vector))
