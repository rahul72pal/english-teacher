"""Shared chat LLM client (OpenAI-compatible, config from .env)."""

import logging

from fastapi.concurrency import run_in_threadpool

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_chat_llm(streaming: bool = False, temperature: float = 0.3):
    if not settings.LLM_API_KEY:
        raise RuntimeError("LLM_API_KEY is not configured in .env")
    if not settings.LLM_MODEL_NAME:
        raise RuntimeError("LLM_MODEL_NAME is not configured in .env")

    from langchain_openai import ChatOpenAI

    base_url = settings.LLM_BASE_URL.strip().rstrip("/") if settings.LLM_BASE_URL else None
    if base_url and base_url.endswith("/chat/completions"):
        base_url = base_url.removesuffix("/chat/completions").rstrip("/")

    return ChatOpenAI(
        model=settings.LLM_MODEL_NAME,
        api_key=settings.LLM_API_KEY,
        base_url=base_url,
        temperature=temperature,
        streaming=streaming,
    )


async def invoke_llm(prompt: str) -> str:
    """Invoke the chat LLM with a single prompt, in a threadpool."""
    llm = get_chat_llm()
    response = await run_in_threadpool(llm.invoke, prompt)
    content = response.content
    if isinstance(content, list):
        return "".join(p.get("text", "") for p in content if isinstance(p, dict))
    return content


def parse_json_block(text: str) -> dict:
    """Parse JSON from an LLM response, tolerating markdown fences."""
    import json
    import re

    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    return json.loads(text)
