"""Test & question management (draft, review, publish)."""

import logging
from datetime import datetime, timezone

from bson import ObjectId

from app.core.prompts.question_generation import QUESTION_GENERATION_PROMPT, SCHEMA_EXAMPLES, TYPE_INSTRUCTIONS
from app.services import qdrant_service
from app.services.question_validation_service import validate_and_clean

logger = logging.getLogger(__name__)

TYPE_LABELS = {"mcq": "multiple choice", "true_false": "true/false", "descriptive": "descriptive"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_test(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "teacher_id": doc["teacher_id"],
        "classroom_id": doc["classroom_id"],
        "chapter_ids": doc.get("chapter_ids", []),
        "title": doc["title"],
        "difficulty": doc.get("difficulty", "medium"),
        "total_questions": doc.get("total_questions", 0),
        "total_marks": doc.get("total_marks", 0),
        "duration_minutes": doc.get("duration_minutes", 30),
        "passing_percentage": doc.get("passing_percentage", 40),
        "attempts_allowed": doc.get("attempts_allowed", 1),
        "status": doc["status"],
        "start_at": doc.get("start_at"),
        "end_at": doc.get("end_at"),
        "created_at": doc["created_at"],
    }


def _serialize_question(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "question_id": doc.get("question_id", ""),
        "type": doc["type"],
        "question": doc["question"],
        "options": doc.get("options"),
        "correct_answer": doc.get("correct_answer"),
        "marks": doc["marks"],
        "difficulty": doc.get("difficulty", "medium"),
        "source_chunks": doc.get("source_chunks", []),
        "evaluation_rubric": doc.get("evaluation_rubric"),
        "expected_answer": doc.get("expected_answer"),
        "approved": doc.get("approved", False),
    }


async def get_test_for_teacher(database, teacher_id: str, test_id: str) -> dict | None:
    if not ObjectId.is_valid(test_id):
        return None
    return await database.tests.find_one({"_id": ObjectId(test_id), "teacher_id": teacher_id})


async def create_draft(
    database,
    teacher_id: str,
    classroom_id: str,
    payload: dict,
    questions: list[dict],
    chapter_ids: list[str],
    warnings: list[str],
) -> dict:
    total_marks = sum(q["marks"] for q in questions)
    test_doc = {
        "teacher_id": teacher_id,
        "classroom_id": classroom_id,
        "chapter_ids": chapter_ids,
        "title": payload["title"].strip(),
        "difficulty": payload["difficulty"],
        "total_questions": len(questions),
        "total_marks": total_marks,
        "duration_minutes": payload["duration_minutes"],
        "passing_percentage": payload["passing_percentage"],
        "attempts_allowed": payload["attempts_allowed"],
        "status": "draft",
        "start_at": payload.get("start_at"),
        "end_at": payload.get("end_at"),
        "warnings": warnings[:20],
        "created_at": _now(),
        "updated_at": _now(),
    }
    result = await database.tests.insert_one(test_doc)
    test_id = str(result.inserted_id)

    for i, q in enumerate(questions, 1):
        q_doc = {
            "test_id": test_id,
            "question_id": f"q_{i:03d}",
            "type": q["type"],
            "question": q["question"],
            "options": q.get("options"),
            "correct_answer": q.get("correct_answer"),
            "marks": q["marks"],
            "difficulty": q.get("difficulty", "medium"),
            "source_chunks": q.get("source_chunks", []),
            "evaluation_rubric": q.get("evaluation_rubric"),
            "expected_answer": q.get("expected_answer"),
            "approved": False,
            "created_at": _now(),
        }
        await database.test_questions.insert_one(q_doc)

    return test_doc


async def list_tests(database, teacher_id: str) -> list[dict]:
    docs = await database.tests.find(
        {"teacher_id": teacher_id}, sort=[("created_at", -1)]
    ).to_list(length=200)
    return [_serialize_test(d) for d in docs]


async def get_test_with_questions(database, teacher_id: str, test_id: str) -> dict | None:
    test = await get_test_for_teacher(database, teacher_id, test_id)
    if test is None:
        return None
    questions = await database.test_questions.find(
        {"test_id": test_id}, sort=[("question_id", 1)]
    ).to_list(length=200)
    return {
        "test": _serialize_test(test),
        "questions": [_serialize_question(q) for q in questions],
    }


async def update_test(database, teacher_id: str, test_id: str, fields: dict) -> dict | None:
    test = await get_test_for_teacher(database, teacher_id, test_id)
    if test is None:
        return None
    updates = {k: v for k, v in fields.items() if v is not None}
    updates["updated_at"] = _now()
    await database.tests.update_one({"_id": test["_id"]}, {"$set": updates})
    return await get_test_for_teacher(database, teacher_id, test_id)


async def delete_test(database, teacher_id: str, test_id: str) -> bool:
    test = await get_test_for_teacher(database, teacher_id, test_id)
    if test is None:
        return False
    await database.tests.delete_one({"_id": test["_id"]})
    await database.test_questions.delete_many({"test_id": test_id})
    return True


async def edit_question(
    database, teacher_id: str, test_id: str, question_id: str, fields: dict
) -> dict | None:
    test = await get_test_for_teacher(database, teacher_id, test_id)
    if test is None or not ObjectId.is_valid(question_id):
        return None

    question = await database.test_questions.find_one(
        {"_id": ObjectId(question_id), "test_id": test_id}
    )
    if question is None:
        return None

    updates = {}
    for key in ("question", "options", "correct_answer", "marks"):
        if fields.get(key) is not None:
            updates[key] = fields[key]

    if "options" in updates or "correct_answer" in updates:
        options = updates.get("options", question.get("options"))
        answer = updates.get("correct_answer", question.get("correct_answer"))
        if question["type"] == "mcq" and (
            not options or answer not in options
        ):
            return None  # invalid answer key edit
    if "marks" in updates:
        marks = updates["marks"]
        if question["type"] == "descriptive" and question.get("evaluation_rubric"):
            rubric_marks = sum(r.get("marks", 0) for r in question["evaluation_rubric"])
            if rubric_marks != marks:
                return None  # rubric must match new marks
        updates["evaluation_rubric"] = question.get("evaluation_rubric")

    updates["approved"] = True  # teacher-edited questions count as approved
    updates["updated_at"] = _now()
    await database.test_questions.update_one({"_id": question["_id"]}, {"$set": updates})
    updated = await database.test_questions.find_one({"_id": question["_id"]})
    return _serialize_question(updated)


async def approve_question(database, teacher_id: str, test_id: str, question_id: str) -> dict | None:
    test = await get_test_for_teacher(database, teacher_id, test_id)
    if test is None or not ObjectId.is_valid(question_id):
        return None
    await database.test_questions.update_one(
        {"_id": ObjectId(question_id), "test_id": test_id}, {"$set": {"approved": True}}
    )
    question = await database.test_questions.find_one({"_id": ObjectId(question_id)})
    return _serialize_question(question) if question else None


async def delete_question(database, teacher_id: str, test_id: str, question_id: str) -> bool:
    test = await get_test_for_teacher(database, teacher_id, test_id)
    if test is None or not ObjectId.is_valid(question_id):
        return False
    result = await database.test_questions.delete_one(
        {"_id": ObjectId(question_id), "test_id": test_id}
    )
    if result.deleted_count:
        # recompute totals
        questions = await database.test_questions.find({"test_id": test_id}).to_list(length=200)
        total_marks = sum(q["marks"] for q in questions)
        await database.tests.update_one(
            {"_id": test["_id"]},
            {"$set": {"total_questions": len(questions), "total_marks": total_marks, "updated_at": _now()}},
        )
        return True
    return False


async def regenerate_question(
    database, teacher_id: str, test_id: str, question_id: str
) -> dict | None:
    """Regenerate one question with the LLM, grounded in its source chapter."""
    from app.core.llm import invoke_llm, parse_json_block
    from app.services.question_validation_service import validate_and_clean

    test = await get_test_for_teacher(database, teacher_id, test_id)
    if test is None or not ObjectId.is_valid(question_id):
        return None
    question = await database.test_questions.find_one(
        {"_id": ObjectId(question_id), "test_id": test_id}
    )
    if question is None:
        return None

    chapter_id = (question.get("source_chunks") or [None])[0]
    chunks = (
        await run_in_threadpool(qdrant_service.get_chapter_chunks, chapter_id, 10)
        if chapter_id
        else []
    )
    if not chunks:
        return None

    qtype = question["type"]
    difficulty = question.get("difficulty", test.get("difficulty", "medium"))
    # avoid regenerating the exact same question: pass the old one to avoid
    avoid = question["question"]
    prompt = QUESTION_GENERATION_PROMPT.format(
        difficulty=difficulty,
        qtype_label=TYPE_LABELS[qtype],
        chunks="\n\n".join(f"[{i + 1}] {c['text']}" for i, c in enumerate(chunks)),
        count=3,
        type_instructions=TYPE_INSTRUCTIONS[qtype] + f'\nAvoid producing a question similar to this one: "{avoid}"',
        n_chunks=len(chunks),
        schema_example=SCHEMA_EXAMPLES[qtype].format(difficulty=difficulty),
    )
    try:
        data = parse_json_block(await invoke_llm(prompt))
    except Exception as exc:
        logger.error("Regeneration parse failed: %s", exc)
        return None

    valid, _ = validate_and_clean(data.get("questions", []), qtype)
    if not valid:
        return None
    new_q = valid[0]
    new_q["source_chunks"] = [chapter_id]
    if qtype != "descriptive" or not new_q.get("marks"):
        new_q["marks"] = question["marks"]  # keep the configured marks

    updates = {
        "question": new_q["question"],
        "options": new_q.get("options"),
        "correct_answer": new_q.get("correct_answer"),
        "evaluation_rubric": new_q.get("evaluation_rubric"),
        "expected_answer": new_q.get("expected_answer"),
        "approved": False,
        "updated_at": _now(),
    }
    await database.test_questions.update_one({"_id": question["_id"]}, {"$set": updates})
    updated = await database.test_questions.find_one({"_id": question["_id"]})
    return _serialize_question(updated)


async def publish_test(database, teacher_id: str, test_id: str, fields: dict) -> dict | None:
    test = await get_test_for_teacher(database, teacher_id, test_id)
    if test is None:
        return None
    if test["status"] == "published":
        return None  # already published (version snapshot stays fixed)

    questions = await database.test_questions.find({"test_id": test_id}).to_list(length=200)
    if not questions:
        return None
    # auto-approve remaining questions on publish
    await database.test_questions.update_many(
        {"test_id": test_id, "approved": False}, {"$set": {"approved": True}}
    )

    updates = {k: v for k, v in fields.items() if v is not None}
    updates.update(
        {
            "status": "published",
            "published_at": _now(),
            "updated_at": _now(),
            "total_questions": len(questions),
            "total_marks": sum(q["marks"] for q in questions),
        }
    )
    await database.tests.update_one({"_id": test["_id"]}, {"$set": updates})
    return await get_test_for_teacher(database, teacher_id, test_id)
