"""AI English tutor: a LangChain/LangGraph agent with a document-search tool.

The chat model is any OpenAI-compatible endpoint configured via
LLM_BASE_URL, LLM_MODEL_NAME and LLM_API_KEY in .env.
"""

import logging

from langchain_core.tools import StructuredTool
from langgraph.prebuilt import create_react_agent

from app.core.config import settings
from app.services.chapter_service import search_classroom_chunks

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a friendly English tutor for school students.\n"
    "Rules:\n"
    "1. ALWAYS use the search_documents tool before answering. It searches the\n"
    "   chapter documents the teacher uploaded for this classroom.\n"
    "2. Base your explanation on the retrieved document content; if the\n"
    "   documents do not contain the answer, say so honestly.\n"
    "3. Explain in simple English a school student can understand.\n"
    "4. Keep answers short (under 200 words, or under 250 for list-style\n"
    "   questions) and include an example.\n"
    "5. Never invent content that is not in the documents. If a detail is not\n"
    "   stated (e.g., a color or a name), say it is not specified — do not guess.\n"
    "6. If the search is limited to one chapter, stay within that chapter's\n"
    "   content and say so if the answer lies in another chapter.\n"
    "7. Support every factual claim with a short direct quote from the\n"
    "   retrieved text, in quotation marks.\n"
    "8. Quote character names exactly as written in the text.\n"
    "9. If the text presents more than one version or ending, mention that\n"
    "   multiple versions exist and summarize them.\n"
    "10. When possible, mention which story or section the answer comes from.\n"
    "11. If the search returns no relevant results, tell the student the\n"
    "    material doesn't cover it and suggest asking the teacher.\n"
)


def _llm():
    if not settings.LLM_API_KEY:
        raise RuntimeError("LLM_API_KEY is not configured in .env")
    if not settings.LLM_MODEL_NAME:
        raise RuntimeError("LLM_MODEL_NAME is not configured in .env")

    from langchain_openai import ChatOpenAI

    base_url = settings.LLM_BASE_URL.strip().rstrip("/") if settings.LLM_BASE_URL else None
    if base_url and base_url.endswith("/chat/completions"):
        base_url = base_url.removesuffix("/chat/completions").rstrip("/")

    logger.info(
        "Tutor LLM client: model=%s base_url=%s",
        settings.LLM_MODEL_NAME,
        base_url or "(provider default)",
    )
    return ChatOpenAI(
        model=settings.LLM_MODEL_NAME,
        api_key=settings.LLM_API_KEY,
        base_url=base_url,
        temperature=0.3,
    )


def _build_search_tool(classroom_id: str, chapter_id: str | None = None) -> StructuredTool:
    async def search_documents(query: str) -> str:
        """Search the chapter documents uploaded for this classroom and return the most relevant passages."""
        chunks = await search_classroom_chunks(query, classroom_id, top_k=5, chapter_id=chapter_id)
        if not chunks:
            return "No relevant document content found for this query."
        parts = []
        for i, chunk in enumerate(chunks, 1):
            parts.append(
                f"[{i}] (chapter: {chunk['chapter_title']}, score: {chunk['score']})\n"
                f"{chunk['text']}"
            )
        return "\n\n".join(parts)

    def sync_search_documents(query: str) -> str:
        import asyncio
        return asyncio.run(search_documents(query))

    return StructuredTool.from_function(
        func=sync_search_documents,
        coroutine=search_documents,
        name="search_documents",
        description=(
            "Search the English lesson documents (chapters) uploaded by the teacher "
            "for this classroom. Use it for any question about grammar, vocabulary "
            "or the lesson content."
        ),
    )


def _agent(classroom_id: str, chapter_id: str | None = None):
    return create_react_agent(
        model=_llm(),
        tools=[_build_search_tool(classroom_id, chapter_id)],
        prompt=SYSTEM_PROMPT,
    )


async def tutor_answer(classroom_id: str, question: str, chapter_id: str | None = None) -> dict:
    """Run the agent and return its grounded answer + the passages it used."""
    agent = _agent(classroom_id, chapter_id)
    try:
        result = await agent.ainvoke({"messages": [("user", question)]})
    except Exception as exc:
        logger.error(
            "Tutor agent failed for classroom %s (model=%s base_url=%s): %s: %s",
            classroom_id, settings.LLM_MODEL_NAME,
            settings.LLM_BASE_URL or "(provider default)",
            type(exc).__name__, str(exc)[:400],
        )
        raise RuntimeError(
            f"AI tutor is unavailable: the chat model '{settings.LLM_MODEL_NAME}' "
            f"at '{settings.LLM_BASE_URL or 'provider default'}' could not be used "
            f"({type(exc).__name__}). Check LLM_MODEL_NAME / LLM_BASE_URL / LLM_API_KEY."
        ) from exc
    answer = result["messages"][-1].content
    if isinstance(answer, list):
        answer = "".join(part.get("text", "") for part in answer if isinstance(part, dict))

    citations = await search_classroom_chunks(question, classroom_id, top_k=3, chapter_id=chapter_id)
    return {
        "answer": answer,
        "citations": [
            {
                "chapter_id": c["chapter_id"],
                "chapter_title": c["chapter_title"],
                "chunk_index": c["chunk_index"],
                "score": c["score"],
                "text": c["text"],
            }
            for c in citations
        ],
    }
