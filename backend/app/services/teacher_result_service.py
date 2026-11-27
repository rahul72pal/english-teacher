"""Teacher result & evaluation management.

Consumes the SAME test_results / test_answers records the student module uses —
no separate grading logic. AI evaluation (marks_awarded/feedback) is never
overwritten; teacher adjustments live in teacher_* fields and the final
approved totals are recomputed at finalize time.
"""

import logging
from datetime import datetime, timezone
from math import isfinite

from bson import ObjectId
from bson.errors import InvalidId

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | str | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.isoformat()


def _effective_marks(answer: dict) -> int | None:
    """Teacher-adjusted marks win; AI marks are the fallback. AI values are never mutated."""
    if answer.get("teacher_marks_awarded") is not None:
        return answer["teacher_marks_awarded"]
    return answer.get("marks_awarded")


def _effective_feedback(answer: dict) -> str | None:
    if answer.get("teacher_feedback"):
        return answer["teacher_feedback"]
    return answer.get("feedback")


def _serialize_result_row(doc: dict, student: dict | None, test: dict | None, attempt: dict | None = None) -> dict:
    time_taken = None
    started = (attempt or {}).get("started_at") or doc.get("started_at")
    submitted = (attempt or {}).get("submitted_at") or doc.get("submitted_at")
    try:
        if isinstance(started, datetime) and isinstance(submitted, datetime):
            time_taken = int((submitted - started).total_seconds())
    except Exception:
        time_taken = None
    return {
        "result_id": str(doc["_id"]),
        "attempt_id": doc["attempt_id"],
        "test_id": doc["test_id"],
        "student_id": doc["student_id"],
        "student_name": (student or {}).get("name", "Unknown student"),
        "test_title": (test or {}).get("title", ""),
        "total_marks": doc["total_marks"],
        "obtained_marks": doc["obtained_marks"],
        "percentage": doc["percentage"],
        "passed": doc["passed"],
        "evaluation_status": doc.get("evaluation_status", "completed"),
        "review_status": doc.get("review_status", "pending"),
        "published_at": _iso(doc.get("published_at")),
        "time_taken_seconds": time_taken,
        "submitted_at": _iso(submitted),
    }


async def _own_test(database, teacher_id: str, test_id: str) -> dict | None:
    if not ObjectId.is_valid(test_id):
        return None
    return await database.tests.find_one({"_id": ObjectId(test_id), "teacher_id": teacher_id})


async def list_test_results(database, teacher_id: str, test_id: str) -> dict | None:
    """Results overview for one test: rows + aggregate stats. Ownership enforced."""
    test = await _own_test(database, teacher_id, test_id)
    if not test:
        return None

    enrolled = await database.enrollments.find({"classroom_id": test["classroom_id"]}).to_list(length=500)
    total_students = len(enrolled)

    attempts = await database.test_attempts.find(
        {"test_id": test_id, "status": {"$ne": "in_progress"}}
    ).to_list(length=500)
    attempt_map = {a["attempt_id"] if "attempt_id" in a else str(a["_id"]): a for a in attempts}
    attempted_students = {a["student_id"] for a in attempts}

    results = await database.test_results.find({"test_id": test_id}).to_list(length=500)
    students = await database.users.find({}).to_list(length=1000)
    name_map = {str(u["_id"]): u.get("name", "") for u in students}

    rows = []
    for r in results:
        if r["student_id"] not in {str(e.get("student_id")) for e in enrolled} and r["student_id"] not in attempted_students:
            continue
        rows.append(_serialize_result_row(r, {"name": name_map.get(r["student_id"], "")}, test, attempt_map.get(r["attempt_id"])))

    pending = [r for r in results if r.get("review_status", "pending") == "pending"]
    percentages = [r["percentage"] for r in results]
    stats = {
        "total_students": total_students,
        "attempted": len(attempted_students),
        "pending_evaluation": len(pending),
        "average_percentage": round(sum(percentages) / len(percentages), 2) if percentages else 0.0,
        "highest_percentage": max(percentages) if percentages else 0.0,
        "lowest_percentage": min(percentages) if percentages else 0.0,
        "pass_rate": round(
            sum(1 for r in results if r["passed"]) / len(results) * 100, 2
        ) if results else 0.0,
    }
    rows.sort(key=lambda r: (-r["percentage"], r["student_name"]))
    return {"test": test, "results": rows, "stats": stats}


async def get_result_detail(database, teacher_id: str, result_id: str) -> dict | None:
    """Individual result for the teacher — includes correct answers & rubric info."""
    if not ObjectId.is_valid(result_id):
        return None
    result = await database.test_results.find_one({"_id": ObjectId(result_id)})
    if not result:
        return None
    test = await _own_test(database, teacher_id, result["test_id"])
    if not test:
        return None
    student = await database.users.find_one({"_id": ObjectId(result["student_id"])})

    graded = await database.test_answers.find({"attempt_id": result["attempt_id"]}).to_list(length=500)
    questions: dict[str, dict] = {}
    for qid in {g["question_id"] for g in graded}:
        q = await database.test_questions.find_one({"question_id": qid, "test_id": result["test_id"]})
        if q:
            questions[qid] = q

    answers_out = []
    for g in sorted(graded, key=lambda a: a["question_id"]):
        q = questions.get(g["question_id"], {})
        needs_review = q.get("type") == "descriptive" and g.get("teacher_marks_awarded") is None
        answers_out.append({
            "question_id": g["question_id"],
            "type": q.get("type", "unknown"),
            "question": q.get("question", ""),
            "student_answer": g.get("student_answer"),
            "correct_answer": q.get("correct_answer"),  # teacher-only: safe here
            "marks": q.get("marks", 0),
            "ai_marks": g.get("marks_awarded"),
            "ai_feedback": g.get("feedback"),
            "teacher_marks": g.get("teacher_marks_awarded"),
            "teacher_feedback": g.get("teacher_feedback"),
            "effective_marks": _effective_marks(g),
            "is_correct": g.get("is_correct", False),
            "needs_review": needs_review,
        })

    row = _serialize_result_row(result, student, test)
    row["answers"] = answers_out
    return row


async def pending_evaluation(database, teacher_id: str) -> list[dict]:
    """Descriptive answers awaiting teacher review across all the teacher's tests."""
    tests = await database.tests.find({"teacher_id": teacher_id}).to_list(length=200)
    test_map = {str(t["_id"]): t for t in tests}
    out = []
    for tid, test in test_map.items():
        results = await database.test_results.find(
            {"test_id": tid, "evaluation_status": "completed"}
        ).to_list(length=500)
        for r in results:
            graded = await database.test_answers.find({"attempt_id": r["attempt_id"]}).to_list(length=500)
            for g in graded:
                q = await database.test_questions.find_one(
                    {"question_id": g["question_id"], "test_id": tid})
                if not q or q.get("type") != "descriptive":
                    continue
                if g.get("teacher_marks_awarded") is not None:
                    continue
                student = await database.users.find_one({"_id": ObjectId(r["student_id"])})
                out.append({
                    "result_id": str(r["_id"]),
                    "attempt_id": r["attempt_id"],
                    "test_id": tid,
                    "test_title": test.get("title", ""),
                    "student_name": (student or {}).get("name", ""),
                    "question_id": g["question_id"],
                    "question": q.get("question", ""),
                    "student_answer": g.get("student_answer"),
                    "ai_marks": g.get("marks_awarded"),
                    "ai_feedback": g.get("feedback"),
                    "max_marks": q.get("marks", 0),
                })
    out.sort(key=lambda x: x["test_title"])
    return out


async def evaluate_answer(
    database,
    teacher_id: str,
    result_id: str,
    question_id: str,
    marks_awarded: float | int,
    feedback: str | None,
) -> dict | None:
    """Manual evaluation of ONE answer. Never touches the AI evaluation fields."""
    if not ObjectId.is_valid(result_id):
        return None
    result = await database.test_results.find_one({"_id": ObjectId(result_id)})
    if not result:
        return None
    test = await _own_test(database, teacher_id, result["test_id"])
    if not test:
        return None

    question = await database.test_questions.find_one(
        {"question_id": question_id, "test_id": result["test_id"]})
    if not question:
        return None

    marks = int(marks_awarded)
    if marks < 0 or marks > question.get("marks", 0):
        return None

    answer = await database.test_answers.find_one(
        {"attempt_id": result["attempt_id"], "question_id": question_id})
    if not answer:
        return None

    await database.test_answers.update_one(
        {"_id": answer["_id"]},
        {"$set": {
            "teacher_marks_awarded": marks,
            "teacher_feedback": (feedback or "").strip() or None,
            "teacher_id": teacher_id,
            "teacher_evaluated_at": _now(),
        }},
    )
    await database.test_results.update_one(
        {"_id": result["_id"]},
        {"$set": {"review_status": "reviewed"}},
    )
    return {"question_id": question_id, "teacher_marks_awarded": marks}


async def finalize_result(database, teacher_id: str, result_id: str) -> dict | None:
    """Approve + publish: recompute totals from effective (teacher-adjusted) marks."""
    if not ObjectId.is_valid(result_id):
        return None
    result = await database.test_results.find_one({"_id": ObjectId(result_id)})
    if not result:
        return None
    test = await _own_test(database, teacher_id, result["test_id"])
    if not test:
        return None

    graded = await database.test_answers.find({"attempt_id": result["attempt_id"]}).to_list(length=500)
    obtained = sum(m for g in graded if (m := _effective_marks(g)) is not None)
    total = result["total_marks"]
    if not total:
        question_docs = await database.test_questions.find({"test_id": result["test_id"]}).to_list(length=500)
        total = sum(q.get("marks", 0) for q in question_docs)
    percentage = round(obtained / total * 100, 2) if total else 0.0
    passing = test.get("passing_percentage", 40)
    passed = percentage >= passing

    await database.test_results.update_one(
        {"_id": result["_id"]},
        {"$set": {
            "obtained_marks": obtained,
            "percentage": percentage,
            "passed": passed,
            "review_status": "published",
            "evaluated_by": teacher_id,
            "published_at": _now(),
            "updated_at": _now(),
        }},
    )
    await database.test_attempts.update_one(
        {"_id": ObjectId(result["attempt_id"])},
        {"$set": {"obtained_marks": obtained, "percentage": percentage, "passed": passed}},
    )
    return {
        "result_id": result_id,
        "obtained_marks": obtained,
        "total_marks": total,
        "percentage": percentage,
        "passed": passed,
        "review_status": "published",
    }


async def classroom_performance(database, teacher_id: str, classroom_id: str) -> dict | None:
    """Classroom analytics: per-test averages, student ranking, chapter performance."""
    classroom = await database.classrooms.find_one(
        {"_id": ObjectId(classroom_id), "teacher_id": teacher_id})
    if not classroom:
        return None

    tests = await database.tests.find(
        {"classroom_id": classroom_id, "status": {"$ne": "draft"}}, sort=[("created_at", -1)]
    ).to_list(length=200)
    test_map = {str(t["_id"]): t for t in tests}

    results = await database.test_results.find(
        {"classroom_id": classroom_id, "evaluation_status": "completed"}
    ).to_list(length=1000)

    per_test: dict[str, list[float]] = {}
    per_student: dict[str, list[float]] = {}
    chapter_scores: dict[str, list[float]] = {}
    students = await database.users.find({}).to_list(length=1000)
    name_map = {str(u["_id"]): u.get("name", "") for u in students}

    for r in results:
        tid = r["test_id"]
        per_test.setdefault(tid, []).append(r["percentage"])
        per_student.setdefault(r["student_id"], []).append(r["percentage"])
        t = test_map.get(tid, {})
        for cid in t.get("chapter_ids") or []:
            chapter_scores.setdefault(cid, []).append(r["percentage"])

    test_stats = [
        {
            "test_id": tid,
            "title": t.get("title", ""),
            "average_percentage": round(sum(v) / len(v), 2),
            "attempts": len(v),
        }
        for tid, v in per_test.items()
    ]
    ranking = sorted(
        (
            {
                "student_id": sid,
                "student_name": name_map.get(sid, "Unknown"),
                "average_percentage": round(sum(v) / len(v), 2),
                "tests_taken": len(v),
            }
            for sid, v in per_student.items()
        ),
        key=lambda x: -x["average_percentage"],
    )
    chapters_out = []
    for cid, v in chapter_scores.items():
        chapter = await database.chapters.find_one({"_id": ObjectId(cid)})
        chapters_out.append({
            "chapter_id": cid,
            "chapter": (chapter or {}).get("title", "Unknown"),
            "average_percentage": round(sum(v) / len(v), 2),
        })
    chapters_out.sort(key=lambda c: c["average_percentage"])

    enrolled = await database.enrollments.find({"classroom_id": classroom_id}).to_list(length=500)
    total_results = len(results)
    all_percentages = [r["percentage"] for r in results]
    return {
        "classroom_id": classroom_id,
        "classroom_name": classroom.get("name", ""),
        "total_students": len(enrolled),
        "total_results": total_results,
        "average_percentage": round(sum(all_percentages) / len(all_percentages), 2) if all_percentages else 0.0,
        "pass_rate": round(sum(1 for r in results if r["passed"]) / total_results * 100, 2) if total_results else 0.0,
        "test_stats": test_stats,
        "student_ranking": ranking,
        "chapter_performance": chapters_out,
    }


async def student_performance_for_teacher(database, teacher_id: str, student_id: str) -> dict | None:
    """Individual student performance — allowed only if the student is in one of the teacher's classrooms."""
    classrooms = await database.classrooms.find({"teacher_id": teacher_id}).to_list(length=200)
    owned = {str(c["_id"]) for c in classrooms}
    enrollments = await database.enrollments.find({"student_id": student_id}).to_list(length=200)
    if not any(e.get("classroom_id") in owned for e in enrollments):
        return None

    # reuse the exact same performance computation as the student module
    from app.services.performance_service import get_performance
    return await get_performance(database, student_id)
