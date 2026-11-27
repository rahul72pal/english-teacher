"""Evaluation of student answers: objective auto-grading + AI descriptive grading."""

import logging

from bson import ObjectId

from app.core.llm import invoke_llm, parse_json_block
from app.core.prompts.question_generation import EVALUATION_PROMPT

logger = logging.getLogger(__name__)


def evaluate_objective(question: dict, student_answer) -> tuple[int, bool, str | None]:
    """Grade MCQ / true_false by exact comparison. Returns (marks_awarded, is_correct, feedback)."""
    correct = question.get("correct_answer")
    qtype = question["type"]

    if qtype == "true_false":
        is_correct = isinstance(student_answer, bool) and student_answer == correct
    else:  # mcq
        is_correct = isinstance(student_answer, str) and student_answer.strip() == correct

    return (question["marks"] if is_correct else 0), is_correct, None


async def evaluate_descriptive(question: dict, student_answer) -> tuple[int, str]:
    """Grade a descriptive answer with the LLM against the rubric.

    Treats the student answer as untrusted text. Enforces the marks cap here.
    Returns (marks_awarded, feedback). Falls back to 0 marks on any failure.
    """
    if not isinstance(student_answer, str) or not student_answer.strip():
        return 0, "No answer provided."

    rubric_text = "\n".join(
        f"- {r['criterion']} (max {r['marks']})"
        for r in (question.get("evaluation_rubric") or [])
        if isinstance(r, dict) and "criterion" in r
    )
    prompt = EVALUATION_PROMPT.format(
        question=question["question"],
        expected_answer=question.get("expected_answer", ""),
        rubric=rubric_text or "- General correctness",
        student_answer=str(student_answer)[:4000],
    )
    try:
        data = parse_json_block(await invoke_llm(prompt))
    except Exception as exc:
        logger.error("Descriptive evaluation failed: %s", exc)
        return 0, "Automatic evaluation failed — the teacher will review this answer."

    marks = 0
    for criterion in data.get("criteria", []):
        if isinstance(criterion, dict) and isinstance(criterion.get("marks"), int):
            marks += criterion["marks"]
    marks = max(0, min(int(marks), int(question["marks"])))
    feedback = str(data.get("feedback", ""))[:500]
    return marks, feedback


async def evaluate_attempt(
    database,
    attempt: dict,
) -> dict:
    """Grade all saved answers for an attempt (idempotent — called once at submit).

    Grading uses the full teacher question docs (answer keys + rubrics) fetched
    fresh from test_questions; the attempt's student-safe snapshot defines the
    structure and totals so active attempts are version-stable.
    """
    from datetime import datetime, timezone

    attempt_id = str(attempt["_id"])
    snapshot = attempt.get("question_snapshot", [])

    # fetch the answer-key-bearing question docs for the snapshot's questions
    snapshot_ids = [q["question_id"] for q in snapshot]
    full_questions = await database.test_questions.find(
        {"test_id": attempt["test_id"], "question_id": {"$in": snapshot_ids}}
    ).to_list(length=500)
    full_by_qid = {q["question_id"]: q for q in full_questions}

    answers = await database.test_answers.find({"attempt_id": attempt_id}).to_list(length=500)
    answer_map = {a["question_id"]: a.get("student_answer") for a in answers}

    obtained = 0
    total = 0
    graded_answers = []

    for snapshot_question in snapshot:
        # grade against the full teacher doc; fall back to the snapshot if it was deleted
        question = full_by_qid.get(snapshot_question["question_id"], snapshot_question)
        total += question["marks"]
        student_answer = answer_map.get(question["question_id"])
        if question["type"] in ("mcq", "true_false"):
            marks, is_correct, _ = evaluate_objective(question, student_answer)
            feedback = None
        else:
            marks, feedback = await evaluate_descriptive(question, student_answer)
            is_correct = marks == question["marks"]
        obtained += marks
        graded_answers.append(
            {
                "question_id": question["question_id"],
                "student_answer": student_answer,
                "marks_awarded": marks,
                "is_correct": is_correct,
                "feedback": feedback,
            }
        )

    percentage = round(obtained / total * 100, 2) if total else 0.0
    passed = percentage >= attempt.get("passing_percentage", 40)

    # Replace any previously saved answer grades (grading is idempotent)
    await database.test_answers.delete_many({"attempt_id": attempt_id, "marks_awarded": {"$ne": None}})
    for graded in graded_answers:
        await database.test_answers.insert_one({**graded, "attempt_id": attempt_id, "graded_at": datetime.now(timezone.utc)})

    result_doc = {
        "attempt_id": attempt_id,
        "student_id": attempt["student_id"],
        "test_id": attempt["test_id"],
        "classroom_id": attempt["classroom_id"],
        "obtained_marks": obtained,
        "total_marks": total,
        "percentage": percentage,
        "passed": passed,
        "evaluation_status": "completed",
        "evaluated_at": datetime.now(timezone.utc),
    }
    existing = await database.test_results.find_one({"attempt_id": attempt_id})
    if existing:
        await database.test_results.update_one({"_id": existing["_id"]}, {"$set": result_doc})
        result_doc["_id"] = existing["_id"]
    else:
        result = await database.test_results.insert_one(result_doc)
        result_doc["_id"] = result.inserted_id

    await database.test_attempts.update_one(
        {"_id": ObjectId(attempt_id)},
        {"$set": {
            "status": "submitted",
            "submitted_at": datetime.now(timezone.utc),
            "obtained_marks": obtained,
            "total_marks": total,
            "percentage": percentage,
            "evaluation_status": "completed",
        }},
    )
    return {**result_doc, "answers": graded_answers}
