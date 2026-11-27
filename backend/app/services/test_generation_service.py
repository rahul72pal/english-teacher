"""AI test generation grounded in chapter chunks (Qdrant)."""

import logging

from bson import ObjectId
from fastapi.concurrency import run_in_threadpool

from app.core.llm import invoke_llm, parse_json_block
from app.core.prompts.question_generation import (
    DEFAULT_MARKS,
    QUESTION_GENERATION_PROMPT,
    SCHEMA_EXAMPLES,
    TYPE_INSTRUCTIONS,
)
from app.services import qdrant_service
from app.services.question_validation_service import validate_and_clean

logger = logging.getLogger(__name__)

TYPE_LABELS = {"mcq": "multiple choice", "true_false": "true/false", "descriptive": "descriptive"}


def _format_chunks(chunks: list[dict]) -> str:
    return "\n\n".join(
        f"[{i + 1}] (chapter {c['chapter_id']}) {c['text']}"
        for i, c in enumerate(chunks)
    )


async def generate_questions_for_type(
    qtype: str,
    count: int,
    difficulty: str,
    chunks: list[dict],
) -> tuple[list[dict], list[str]]:
    """Generate and validate `count` questions of one type from the given chunks."""
    if count <= 0:
        return [], []
    # Ask for extra questions; validation + dedupe may remove some
    request_count = min(count + 3, 30)
    prompt = QUESTION_GENERATION_PROMPT.format(
        difficulty=difficulty,
        qtype_label=TYPE_LABELS[qtype],
        chunks=_format_chunks(chunks[:30]),
        count=request_count,
        type_instructions=TYPE_INSTRUCTIONS[qtype],
        n_chunks=min(len(chunks), 30),
        schema_example=SCHEMA_EXAMPLES[qtype].format(difficulty=difficulty),
    )
    logger.info("Generating %d %s questions (difficulty=%s, %d chunks)", count, qtype, difficulty, len(chunks))
    raw = await invoke_llm(prompt)
    try:
        data = parse_json_block(raw)
    except Exception as exc:
        logger.error("Failed to parse %s generation JSON: %s", qtype, exc)
        return [], [f"{qtype}: could not parse AI response"]

    questions = data.get("questions", [])
    # Map the model's excerpt number back to a real chunk id
    for q in questions:
        src = q.pop("source", None)
        if isinstance(src, int) and 1 <= src <= len(chunks):
            q["source_chunks"] = [chunks[src - 1]["chapter_id"]]
        elif isinstance(src, str) and src.startswith("chunk_"):
            q["source_chunks"] = [src]
        else:
            q["source_chunks"] = []
        q.setdefault("marks", DEFAULT_MARKS[qtype])
        q.setdefault("difficulty", difficulty)

    valid, errors = validate_and_clean(questions, qtype)
    logger.info("%s: %d valid of %d generated", qtype, len(valid), len(questions))
    return valid[:count], errors


async def resolve_chapters(
    teacher_id: str, classroom_id: str, chapter_ids: list[str], database
) -> list[dict]:
    """Validate ownership; fall back to all ready chapters of the classroom."""
    classroom = await database.classrooms.find_one(
        {"_id": ObjectId(classroom_id), "teacher_id": teacher_id}
    )
    if classroom is None:
        return []

    if chapter_ids:
        valid = []
        for cid in chapter_ids:
            if not ObjectId.is_valid(cid):
                continue
            chapter = await database.chapters.find_one(
                {"_id": ObjectId(cid), "classroom_id": classroom_id, "teacher_id": teacher_id}
            )
            if chapter:
                valid.append(chapter)
        return valid

    return await database.chapters.find(
        {"classroom_id": classroom_id, "teacher_id": teacher_id, "status": "ready"}
    ).to_list(length=100)


async def generate_test_questions(
    teacher_id: str,
    classroom_id: str,
    chapter_ids: list[str],
    difficulty: str,
    distribution: dict,
    database,
) -> tuple[list[dict], list[str], list[str]]:
    """Generate all questions. Returns (questions, warnings, chapter_ids_used)."""
    chapters = await resolve_chapters(teacher_id, classroom_id, chapter_ids, database)
    if not chapters:
        return [], ["No ready chapters found for this classroom"], []

    warnings: list[str] = []
    all_questions: list[dict] = []

    for chapter in chapters:
        chapter_id = str(chapter["_id"])
        chunks = await run_in_threadpool(qdrant_service.get_chapter_chunks, chapter_id, 30)
        if not chunks:
            warnings.append(f"Chapter '{chapter.get('title')}' has no indexed content — skipped")
            continue

        for qtype, count in distribution.items():
            if count <= 0:
                continue
            questions, errors = await generate_questions_for_type(
                qtype, count, difficulty, chunks
            )
            for q in questions:
                q["source_chunks"] = [chapter_id] if not q.get("source_chunks") else q["source_chunks"]
            all_questions.extend(questions)
            warnings.extend(errors)

    chapter_ids_used = list({str(c["_id"]) for c in chapters})
    return all_questions, warnings, chapter_ids_used
