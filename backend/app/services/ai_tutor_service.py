"""AI English tutor: a LangChain/LangGraph agent with a document-search tool.

The chat model is any OpenAI-compatible endpoint configured via
LLM_BASE_URL, LLM_MODEL_NAME and LLM_API_KEY in .env.
"""

import logging
import re

from bson import ObjectId
from langchain_core.tools import StructuredTool
from langgraph.prebuilt import create_react_agent

from app.core import embeddings
from app.core.config import settings
from app.database.mongodb import db
from app.services import semantic_cache_service
from app.services.chapter_service import (
    get_classroom_chapters_summary,
    search_classroom_chunks,
)

logger = logging.getLogger(__name__)

PROMPT_VERSION = "tutor-v3"


def clean_tutor_response(text: str) -> str:
    """Remove any accidental internal passage citations (e.g. (Text [4]), [1], etc.) from the response."""
    if not text:
        return ""
    # Strip (Text [4], Text [5]) or (Text [4])
    text = re.sub(
        r"\s*\((?:Text\s*)?\[?\d+\]?(?:\s*,\s*(?:Text\s*)?\[?\d+\]?)*\)",
        "",
        text,
        flags=re.IGNORECASE,
    )
    # Strip standalone bracketed numbers [1], [4]
    text = re.sub(r"\s*\[\d+\]", "", text)
    # Fix any spacing before punctuation
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)
    return text.strip()


SYSTEM_PROMPT = (
    "You are a friendly, encouraging English tutor for school students.\n"
    "Rules:\n"
    "1. For questions about grammar, vocabulary, stories, or lesson content, use the\n"
    "   search_documents tool to search the classroom's uploaded chapters.\n"
    "2. For questions about how many chapters or lessons exist in this classroom, or to list\n"
    "   available chapters, use the get_total_chapters tool.\n"
    "3. Base your explanation on the retrieved document content or chapter info; if the\n"
    "   documents do not contain the answer, say so honestly.\n"
    "4. Explain in simple, clear English suitable for school students.\n"
    "5. Keep explanations engaging and concise (under 250 words).\n"
    "6. Never invent content that is not in the documents. If a detail is not\n"
    "   stated, say it is not specified — do not guess.\n"
    "7. If the search is limited to one chapter, stay within that chapter's content.\n"
    "8. Write in a clean, natural conversational tone. Quote key phrases naturally when helpful (e.g. \"white as snow\").\n"
    "   NEVER write internal or passage citations (such as '(Text [4])', '[1]', '[2]', chunk numbers, or score tags).\n"
    "   Chapter sources are already presented to the student automatically by the app UI.\n"
    "9. Quote character names and key terms exactly as written in the text.\n"
    "10. If the text presents more than one version or ending, highlight the different versions.\n"
    "11. FORMATTING & READABILITY (Essential):\n"
    "    - Structure all responses with clean, readable Markdown.\n"
    "    - Never return dense walls of text or long unbroken paragraphs.\n"
    "    - Use clear section headings with emojis (e.g., `### 📖 Summary`, `### 🌟 Key Points`, `### 💡 Vocabulary`).\n"
    "    - Use bullet points (`- `) with bold keywords (`**keyword**: explanation`) so students can scan and read effortlessly.\n"
    "    - For chapter summaries, break down by main stories/events and end with a short key takeaway.\n"
    "    - For vocabulary, format as: `- **Word**: Simple definition — *example from text*`.\n"
    "    - For quiz questions, use clear numbered items with choices.\n"
    "    - DO NOT include citation references like `(Text [4])` or bracketed numbers in the text. Keep all text clean and readable for young students.\n"
)


def _llm(streaming: bool = False):
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
        streaming=streaming,
    )


def _build_search_tool(classroom_id: str, chapter_id: str | None = None) -> StructuredTool:
    async def search_documents(query: str) -> str:
        """Search the chapter documents uploaded for this classroom and return the most relevant passages."""
        chunks = await search_classroom_chunks(query, classroom_id, top_k=5, chapter_id=chapter_id)
        if not chunks:
            return "No relevant document content found for this query."
        parts = []
        for chunk in chunks:
            parts.append(
                f"--- Excerpt from '{chunk['chapter_title']}' ---\n"
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


def _build_chapter_count_tool(classroom_id: str) -> StructuredTool:
    async def get_total_chapters() -> str:
        """Get the total number of chapters and their titles in the current classroom."""
        summary = await get_classroom_chapters_summary(classroom_id)
        total = summary["total"]
        ready = summary["ready"]
        if total == 0:
            return "There are 0 chapters uploaded in this classroom."

        chapter_list = "\n".join(
            f"{i}. {ch['title']} (status: {ch['status']})"
            for i, ch in enumerate(summary["chapters"], 1)
        )
        return (
            f"This classroom has a total of {total} chapter(s) "
            f"({ready} ready for learning):\n{chapter_list}"
        )

    def sync_get_total_chapters() -> str:
        import asyncio
        return asyncio.run(get_total_chapters())

    return StructuredTool.from_function(
        func=sync_get_total_chapters,
        coroutine=get_total_chapters,
        name="get_total_chapters",
        description=(
            "Get the total number of chapters and a list of all chapter titles uploaded "
            "in the current classroom. Takes no arguments. Call this whenever the user asks "
            "how many chapters or lessons there are, or asks what chapters are in the classroom."
        ),
    )


def _build_prompt(chapter_title: str | None = None) -> str:
    if not chapter_title:
        return SYSTEM_PROMPT
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"CURRENT CHAPTER CONTEXT:\n"
        f"- The student is currently studying the chapter titled: \"{chapter_title}\".\n"
        f"- When the student asks to summarize, give key points, list vocabulary, generate questions/quiz, "
        f"or asks questions about 'this chapter', 'this lesson', 'the story', or asks general questions without specifying a title, "
        f"they are referring to \"{chapter_title}\".\n"
        f"- Use the get_chapter_content tool to read the chapter's passages in order, or search_documents to find specific details.\n"
        f"- Always format your answer using clean Markdown with clear headings (`###`), bullet points (`- `), and bold terms (`**concept**`). Avoid dense paragraphs.\n"
        f"- Never ask the student which story or chapter they want to summarize or ask about — they are already viewing \"{chapter_title}\". Directly answer about \"{chapter_title}\"."
    )


def _build_chapter_content_tool(
    classroom_id: str,
    chapter_id: str | None = None,
    chapter_title: str | None = None,
) -> StructuredTool:
    async def get_chapter_content() -> str:
        """Retrieve the text passages of the current chapter in reading order."""
        if not chapter_id:
            return "No specific chapter is selected. Use search_documents or get_total_chapters."

        from fastapi.concurrency import run_in_threadpool
        from app.services import qdrant_service

        try:
            chunks = await run_in_threadpool(qdrant_service.get_chapter_chunks, chapter_id, 30)
            if chunks:
                chunks.sort(key=lambda c: c.get("chunk_index", 0))
                header = f"Content for chapter '{chapter_title or 'Current Chapter'}' (ordered passages):\n"
                passages = [
                    f"[Part {c.get('chunk_index', i) + 1}]\n{c['text']}"
                    for i, c in enumerate(chunks)
                ]
                return header + "\n\n".join(passages)
        except Exception as exc:
            logger.warning("get_chapter_content: Qdrant scroll failed: %s", exc)

        database = db.get_db()
        if ObjectId.is_valid(chapter_id):
            ch = await database.chapters.find_one({"_id": ObjectId(chapter_id)})
            if ch:
                pages = ch.get("pages")
                if pages:
                    return f"Content for chapter '{chapter_title or ch.get('title', 'Chapter')}':\n\n" + "\n\n".join(
                        f"[Page {i+1}]\n{p}" for i, p in enumerate(pages) if p
                    )

        return "No content could be retrieved for this chapter."

    def sync_get_chapter_content() -> str:
        import asyncio
        return asyncio.run(get_chapter_content())

    return StructuredTool.from_function(
        func=sync_get_chapter_content,
        coroutine=get_chapter_content,
        name="get_chapter_content",
        description=(
            "Retrieve the full text passages of the current chapter in chronological order. "
            "Call this tool when the student asks for a summary, key points, main ideas, "
            "vocabulary list, or quiz questions for the current chapter."
        ),
    )


async def _get_chapter_title(classroom_id: str, chapter_id: str | None) -> str | None:
    if not chapter_id or not ObjectId.is_valid(chapter_id):
        return None
    try:
        database = db.get_db()
        chapter = await database.chapters.find_one(
            {"_id": ObjectId(chapter_id), "classroom_id": classroom_id}
        )
        return chapter.get("title") if chapter else None
    except Exception as exc:
        logger.warning("Failed to lookup chapter title for %s: %s", chapter_id, exc)
        return None


def _agent(
    classroom_id: str,
    chapter_id: str | None = None,
    chapter_title: str | None = None,
):
    return create_react_agent(
        model=_llm(streaming=True),
        tools=[
            _build_search_tool(classroom_id, chapter_id),
            _build_chapter_content_tool(classroom_id, chapter_id, chapter_title),
            _build_chapter_count_tool(classroom_id),
        ],
        prompt=_build_prompt(chapter_title),
    )


async def tutor_answer(classroom_id: str, question: str, chapter_id: str | None = None) -> dict:
    """Run the agent or return a semantically cached answer if similarity >= threshold."""
    scope_key = semantic_cache_service.create_scope_key(chapter_id)
    query_vector: list[float] | None = None

    if settings.SEMANTIC_CACHE_ENABLED and semantic_cache_service.is_cacheable_question(question):
        try:
            query_vector = await embeddings.create_embedding_query(question)
            cached = await semantic_cache_service.find_cached_answer(
                query_vector=query_vector,
                classroom_id=classroom_id,
                scope_key=scope_key,
                prompt_version=PROMPT_VERSION,
            )
            if cached and cached.get("answer"):
                logger.info(
                    "🎯 [SEMANTIC CACHE HIT] similarity=%.4f for question: '%s' (matched: '%s')",
                    cached["similarity"], question, cached.get("question", "")
                )
                return {
                    "answer": cached["answer"],
                    "citations": cached.get("citations", []),
                    "source": "semantic_cache",
                }
        except Exception as exc:
            logger.debug("Semantic cache lookup failed: %s", exc)

    logger.info("⚡ [SEMANTIC CACHE MISS] Running RAG pipeline for: '%s'", question)

    chapter_title = await _get_chapter_title(classroom_id, chapter_id)
    try:
        agent = _agent(classroom_id, chapter_id, chapter_title)
    except TypeError:
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
    answer = clean_tutor_response(answer)

    citations = await search_classroom_chunks(question, classroom_id, top_k=3, chapter_id=chapter_id)
    formatted_citations = [
        {
            "chapter_id": c["chapter_id"],
            "chapter_title": c["chapter_title"],
            "chunk_index": c["chunk_index"],
            "score": c["score"],
            "text": c["text"],
        }
        for c in citations
    ]

    # Save to semantic cache for future similar queries
    if settings.SEMANTIC_CACHE_ENABLED and semantic_cache_service.is_cacheable_question(question) and answer:
        try:
            if query_vector is None:
                query_vector = await embeddings.create_embedding_query(question)
            await semantic_cache_service.save_cached_answer(
                question=question,
                answer=answer,
                query_vector=query_vector,
                classroom_id=classroom_id,
                chapter_id=chapter_id,
                citations=formatted_citations,
                prompt_version=PROMPT_VERSION,
            )
        except Exception as exc:
            logger.debug("Failed to save answer to semantic cache: %s", exc)

    return {
        "answer": answer,
        "citations": formatted_citations,
    }


# -------------------------
# STREAMING (NDJSON events)
# -------------------------
# Event lines, each a JSON object:
#   {"type": "citations", "citations": [...]}   (sent first)
#   {"type": "token", "text": "..."}            (incremental answer tokens, markdown)
#   {"type": "error", "text": "..."}
#   {"type": "done"}

import json as _json  # noqa: E402


def _content_to_tokens(content) -> list[str]:
    if not content:
        return []
    if isinstance(content, str):
        return [content]
    if isinstance(content, list):
        return [p["text"] for p in content if isinstance(p, dict) and p.get("text")]
    return []


async def tutor_answer_stream(
    classroom_id: str,
    question: str,
    chapter_id: str | None = None,
):
    """Async generator of NDJSON events: checks semantic cache first, then streams."""
    scope_key = semantic_cache_service.create_scope_key(chapter_id)
    query_vector: list[float] | None = None

    if settings.SEMANTIC_CACHE_ENABLED and semantic_cache_service.is_cacheable_question(question):
        try:
            query_vector = await embeddings.create_embedding_query(question)
            cached = await semantic_cache_service.find_cached_answer(
                query_vector=query_vector,
                classroom_id=classroom_id,
                scope_key=scope_key,
                prompt_version=PROMPT_VERSION,
            )
            if cached and cached.get("answer"):
                logger.info(
                    "🎯 [SEMANTIC CACHE HIT (STREAM)] similarity=%.4f for: '%s' (matched: '%s')",
                    cached["similarity"], question, cached.get("question", "")
                )
                yield _json.dumps(
                    {
                        "type": "citations",
                        "citations": cached.get("citations", []),
                    }
                ) + "\n"

                answer_text = clean_tutor_response(cached["answer"])
                words = answer_text.split(" ")
                chunk_size = 4
                for i in range(0, len(words), chunk_size):
                    chunk = " ".join(words[i : i + chunk_size])
                    if i + chunk_size < len(words):
                        chunk += " "
                    yield _json.dumps({"type": "token", "text": chunk}) + "\n"

                yield _json.dumps({"type": "done"}) + "\n"
                return
        except Exception as exc:
            logger.debug("Semantic cache stream lookup failed: %s", exc)

    logger.info("⚡ [SEMANTIC CACHE MISS (STREAM)] Running RAG pipeline for: '%s'", question)

    formatted_citations: list[dict] = []
    try:
        citations = await search_classroom_chunks(
            question, classroom_id, top_k=3, chapter_id=chapter_id
        )
        formatted_citations = [
            {
                "chapter_id": c["chapter_id"],
                "chapter_title": c["chapter_title"],
                "chunk_index": c["chunk_index"],
                "score": c["score"],
                "text": c["text"],
            }
            for c in citations
        ]
        yield _json.dumps(
            {
                "type": "citations",
                "citations": formatted_citations,
            }
        ) + "\n"
    except Exception as exc:
        logger.warning("Tutor stream: citation search failed: %s", exc)
        yield _json.dumps({"type": "citations", "citations": []}) + "\n"

    chapter_title = await _get_chapter_title(classroom_id, chapter_id)
    try:
        agent = _agent(classroom_id, chapter_id, chapter_title)
    except TypeError:
        agent = _agent(classroom_id, chapter_id)

    full_answer_parts: list[str] = []
    has_error = False

    try:
        async for msg, meta in agent.astream(
            {"messages": [("user", question)]}, stream_mode="messages"
        ):
            # Only stream tokens from the agent node (ignore tools node and tool call requests)
            if meta.get("langgraph_node") != "agent":
                continue
            if getattr(msg, "tool_calls", None) or getattr(msg, "tool_call_chunks", None):
                continue

            for token in _content_to_tokens(getattr(msg, "content", None)):
                if token:
                    full_answer_parts.append(token)
                    yield _json.dumps({"type": "token", "text": token}) + "\n"
    except Exception as exc:
        has_error = True
        logger.error(
            "Tutor stream failed for classroom %s (model=%s base_url=%s): %s: %s",
            classroom_id, settings.LLM_MODEL_NAME,
            settings.LLM_BASE_URL or "(provider default)",
            type(exc).__name__, str(exc)[:400],
        )
        yield _json.dumps({"type": "error", "text": str(exc)[:300]}) + "\n"

    # Save to semantic cache if completed successfully without errors
    if not has_error and full_answer_parts and settings.SEMANTIC_CACHE_ENABLED and semantic_cache_service.is_cacheable_question(question):
        full_answer = clean_tutor_response("".join(full_answer_parts).strip())
        if full_answer:
            try:
                if query_vector is None:
                    query_vector = await embeddings.create_embedding_query(question)
                await semantic_cache_service.save_cached_answer(
                    question=question,
                    answer=full_answer,
                    query_vector=query_vector,
                    classroom_id=classroom_id,
                    chapter_id=chapter_id,
                    citations=formatted_citations,
                    prompt_version=PROMPT_VERSION,
                )
            except Exception as exc:
                logger.debug("Failed to save streamed answer to semantic cache: %s", exc)

    yield _json.dumps({"type": "done"}) + "\n"
