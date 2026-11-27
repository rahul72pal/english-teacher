"""Student test attempts: discovery, start/resume, answers, submit, results."""

import logging
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.services import evaluation_service
from app.services.evaluation_service import evaluate_attempt

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | str | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt if dt.endswith("Z") or "+" in dt or ("T" in dt and "-" in dt[10:]) else f"{dt}Z"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _serialize_attempt(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "test_id": doc["test_id"],
        "classroom_id": doc["classroom_id"],
        "status": doc["status"],
        "test_version": doc.get("test_version", 1),
        "started_at": _iso(doc.get("started_at")),
        "expires_at": _iso(doc.get("expires_at")),
        "submitted_at": _iso(doc.get("submitted_at")),
        "obtained_marks": doc.get("obtained_marks"),
        "total_marks": doc.get("total_marks", 0),
        "evaluation_status": doc.get("evaluation_status", "pending"),
    }


def _student_safe_question(doc: dict) -> dict:
    return {
        "question_id": doc.get("question_id", ""),
        "type": doc["type"],
        "question": doc["question"],
        "options": doc.get("options"),
        "marks": doc["marks"],
    }


def _serialize_result(doc: dict, test_title: str = "") -> dict:
    return {
        "result_id": str(doc["_id"]),
        "attempt_id": doc["attempt_id"],
        "test_id": doc["test_id"],
        "test_title": test_title,
        "obtained_marks": doc["obtained_marks"],
        "total_marks": doc["total_marks"],
        "percentage": doc["percentage"],
        "passed": doc["passed"],
        "evaluation_status": doc["evaluation_status"],
        "evaluated_at": _iso(doc.get("evaluated_at")),
    }


# ---------- discovery ----------


async def list_classroom_tests(database, student_id: str, classroom_id: str) -> list[dict]:
    enrollment = await database.enrollments.find_one(
        {"classroom_id": classroom_id, "student_id": student_id, "status": "active"}
    )
    if enrollment is None:
        return None
    tests = await database.tests.find(
        {"classroom_id": classroom_id, "status": "published"}, sort=[("created_at", -1)]
    ).to_list(length=200)
    return [
        {
            "id": str(t["_id"]),
            "title": t["title"],
            "difficulty": t.get("difficulty", "medium"),
            "total_questions": t.get("total_questions", 0),
            "total_marks": t.get("total_marks", 0),
            "duration_minutes": t.get("duration_minutes", 30),
            "passing_percentage": t.get("passing_percentage", 40),
            "attempts_allowed": t.get("attempts_allowed", 1),
            "status": t["status"],
            "start_at": _iso(t.get("start_at")),
            "end_at": _iso(t.get("end_at")),
        }
        for t in tests
    ]


async def get_student_test(database, student_id: str, test_id: str) -> dict | None:
    """Student-safe test details (no answer keys), with enrollment check."""
    if not ObjectId.is_valid(test_id):
        return None
    test = await database.tests.find_one({"_id": ObjectId(test_id), "status": "published"})
    if test is None:
        return None
    enrollment = await database.enrollments.find_one(
        {"classroom_id": test["classroom_id"], "student_id": student_id, "status": "active"}
    )
    if enrollment is None:
        return None
    questions = await database.test_questions.find(
        {"test_id": test_id}, sort=[("question_id", 1)]
    ).to_list(length=300)
    return {
        "test": {
            "id": str(test["_id"]),
            "title": test["title"],
            "difficulty": test.get("difficulty", "medium"),
            "total_questions": test.get("total_questions", len(questions)),
            "total_marks": test.get("total_marks", sum(q["marks"] for q in questions)),
            "duration_minutes": test.get("duration_minutes", 30),
            "passing_percentage": test.get("passing_percentage", 40),
            "attempts_allowed": test.get("attempts_allowed", 1),
            "status": test["status"],
            "start_at": _iso(test.get("start_at")),
            "end_at": _iso(test.get("end_at")),
        },
        "questions": [_student_safe_question(q) for q in questions],
        "version": test.get("test_version", 1),
    }


# ---------- attempts ----------


async def start_attempt(database, student_id: str, test_id: str) -> dict:
    """Start or resume an attempt. Raises ValueError with an error message."""
    if not ObjectId.is_valid(test_id):
        raise ValueError("Test not found")

    test = await database.tests.find_one({"_id": ObjectId(test_id), "status": "published"})
    if test is None:
        raise ValueError("Test not found or not published")

    enrollment = await database.enrollments.find_one(
        {"classroom_id": test["classroom_id"], "student_id": student_id, "status": "active"}
    )
    if enrollment is None:
        raise ValueError("You are not enrolled in this classroom")

    now = _now()
    start_at = test.get("start_at")
    end_at = test.get("end_at")
    if start_at and now < start_at.replace(tzinfo=start_at.tzinfo or timezone.utc):
        raise ValueError("This test has not started yet")
    if end_at and now > end_at.replace(tzinfo=end_at.tzinfo or timezone.utc):
        raise ValueError("This test deadline has passed")

    # resume an in-progress attempt (deadline-enforced server side)
    existing = await database.test_attempts.find_one(
        {"test_id": test_id, "student_id": student_id, "status": "in_progress"}
    )
    if existing:
        expires = existing.get("expires_at")
        if expires and now > expires.replace(tzinfo=expires.tzinfo or timezone.utc):
            await auto_submit(database, existing, test)
            existing = None
        else:
            return {"attempt": _serialize_attempt(existing), "resumed": True}

    # If student has an empty zero-answer attempt that was auto-submitted due to client glitch,
    # clean it up so the student is not locked out of their legitimate attempt.
    attempts = await database.test_attempts.find(
        {"test_id": test_id, "student_id": student_id}
    ).to_list(length=50)
    empty_attempt_ids = []
    for a in attempts:
        ans_count = await database.test_answers.count_documents({"attempt_id": str(a["_id"])})
        if ans_count == 0 and a.get("obtained_marks") in (0, None):
            empty_attempt_ids.append(a["_id"])

    if empty_attempt_ids:
        logger.warning(
            "Cleaning up %d empty attempt(s) for student %s on test %s",
            len(empty_attempt_ids),
            student_id,
            test_id,
        )
        await database.test_attempts.delete_many({"_id": {"$in": empty_attempt_ids}})
        await database.test_results.delete_many(
            {"attempt_id": {"$in": [str(eid) for eid in empty_attempt_ids]}}
        )

    attempts_used = await database.test_attempts.count_documents(
        {"test_id": test_id, "student_id": student_id}
    )
    if attempts_used >= test.get("attempts_allowed", 1):
        raise ValueError("You have already used all allowed attempts for this test")

    questions = await database.test_questions.find(
        {"test_id": test_id}, sort=[("question_id", 1)]
    ).to_list(length=300)
    if not questions:
        raise ValueError("Test has no questions")

    duration = test.get("duration_minutes", 30)
    attempt_doc = {
        "test_id": test_id,
        "student_id": student_id,
        "classroom_id": test["classroom_id"],
        "test_version": test.get("test_version", 1),
        "status": "in_progress",
        "started_at": now,
        "expires_at": now + timedelta(minutes=duration),
        "submitted_at": None,
        "obtained_marks": None,
        "total_marks": test.get("total_marks", sum(q["marks"] for q in questions)),
        "passing_percentage": test.get("passing_percentage", 40),
        # snapshot with question details + answer keys for post-submission review
        "question_snapshot": [
            _student_safe_question(q)
            | {
                "correct_answer": q.get("correct_answer") or q.get("expected_answer"),
                "expected_answer": q.get("expected_answer") or q.get("correct_answer"),
                "explanation": q.get("explanation"),
            }
            for q in questions
        ],
        "evaluation_status": "pending",
    }
    result = await database.test_attempts.insert_one(attempt_doc)
    attempt_doc["_id"] = result.inserted_id
    return {"attempt": _serialize_attempt(attempt_doc), "resumed": False}


async def get_attempt(database, student_id: str, attempt_id: str) -> dict | None:
    """Attempt detail: safe questions + saved answers + deadline handling."""
    if not ObjectId.is_valid(attempt_id):
        return None
    attempt = await database.test_attempts.find_one(
        {"_id": ObjectId(attempt_id), "student_id": student_id}
    )
    if attempt is None:
        return None

    if attempt["status"] == "in_progress":
        expires = attempt.get("expires_at")
        if expires and _now() > expires.replace(tzinfo=expires.tzinfo or timezone.utc):
            test = await database.tests.find_one({"_id": ObjectId(attempt["test_id"])})
            attempt = await auto_submit(database, attempt, test or {})

    answers = await database.test_answers.find(
        {"attempt_id": attempt_id, "marks_awarded": {"$eq": None}}
    ).to_list(length=500)
    return {
        "attempt": _serialize_attempt(attempt),
        "questions": [
            {
                k: v
                for k, v in q.items()
                if k not in ("expected_answer", "correct_answer", "explanation")
            }
            for q in attempt.get("question_snapshot", [])
        ],
        "answers": [
            {"question_id": a["question_id"], "student_answer": a.get("student_answer")}
            for a in answers
        ],
    }


async def save_answer(
    database, student_id: str, attempt_id: str, question_id: str, student_answer
) -> dict | None:
    """Autosave one answer. Raises ValueError on conflict/invalid."""
    if not ObjectId.is_valid(attempt_id):
        raise ValueError("Attempt not found")
    attempt = await database.test_attempts.find_one(
        {"_id": ObjectId(attempt_id), "student_id": student_id}
    )
    if attempt is None:
        raise ValueError("Attempt not found")
    if attempt["status"] != "in_progress":
        raise ValueError("This test has already been submitted")

    expires = attempt.get("expires_at")
    if expires and _now() > expires.replace(tzinfo=expires.tzinfo or timezone.utc):
        test = await database.tests.find_one({"_id": ObjectId(attempt["test_id"])})
        await auto_submit(database, attempt, test or {})
        raise ValueError("Time is up — the test was submitted automatically")

    in_snapshot = any(
        q["question_id"] == question_id for q in attempt.get("question_snapshot", [])
    )
    if not in_snapshot:
        raise ValueError("Unknown question for this attempt")

    existing = await database.test_answers.find_one(
        {"attempt_id": attempt_id, "question_id": question_id, "marks_awarded": {"$eq": None}}
    )
    if existing:
        await database.test_answers.update_one(
            {"_id": existing["_id"]},
            {"$set": {"student_answer": student_answer, "saved_at": _now()}},
        )
    else:
        await database.test_answers.insert_one(
            {
                "attempt_id": attempt_id,
                "question_id": question_id,
                "student_answer": student_answer,
                "saved_at": _now(),
            }
        )
    return {"question_id": question_id, "student_answer": student_answer, "saved": True}


async def auto_submit(database, attempt: dict, test: dict) -> dict:
    """Submit an expired attempt. Returns the refreshed attempt doc."""
    if attempt.get("status") != "in_progress":
        return attempt
    logger.info("Auto-submitting expired attempt %s", attempt["_id"])
    await submit_attempt(database, attempt["student_id"], str(attempt["_id"]), auto=True)
    refreshed = await database.test_attempts.find_one({"_id": attempt["_id"]})
    return refreshed or attempt


async def submit_attempt(database, student_id: str, attempt_id: str, auto: bool = False) -> dict | None:
    """Submit an attempt and evaluate it. Idempotent: double submit returns the existing result."""
    if not ObjectId.is_valid(attempt_id):
        return None
    attempt = await database.test_attempts.find_one(
        {"_id": ObjectId(attempt_id), "student_id": student_id}
    )
    if attempt is None:
        return None

    if attempt["status"] != "in_progress":
        # already submitted — return existing result (idempotent)
        result = await database.test_results.find_one({"attempt_id": attempt_id})
        test = await database.tests.find_one({"_id": ObjectId(attempt["test_id"])})
        return _serialize_result(result, test["title"]) if result else _serialize_attempt(attempt)

    if not auto:
        expires = attempt.get("expires_at")
        if expires and _now() > expires.replace(tzinfo=expires.tzinfo or timezone.utc):
            auto = True  # past deadline — submit regardless

    snapshot = attempt.get("question_snapshot", [])
    if not snapshot:
        return _serialize_attempt(attempt)

    await database.test_attempts.update_one(
        {"_id": attempt["_id"]}, {"$set": {"status": "evaluating"}}
    )
    result = await evaluate_attempt(database, attempt)
    test = await database.tests.find_one({"_id": ObjectId(attempt["test_id"])})
    return _serialize_result(result, (test or {}).get("title", ""))


# ---------- results ----------


async def get_attempt_result(database, student_id: str, attempt_id: str) -> dict | None:
    if not ObjectId.is_valid(attempt_id):
        return None
    attempt = await database.test_attempts.find_one(
        {"_id": ObjectId(attempt_id), "student_id": student_id}
    )
    if attempt is None:
        return None
    result = await database.test_results.find_one({"attempt_id": attempt_id})
    if result is None:
        return {
            "attempt_id": attempt_id,
            "test_id": attempt["test_id"],
            "obtained_marks": attempt.get("obtained_marks") or 0,
            "total_marks": attempt.get("total_marks", 0),
            "percentage": attempt.get("percentage") or 0,
            "passed": False,
            "evaluation_status": attempt.get("evaluation_status", "pending"),
            "evaluated_at": None,
            "answers": [],
        }
    test = await database.tests.find_one({"_id": ObjectId(attempt["test_id"])})
    graded = await database.test_answers.find(
        {"attempt_id": attempt_id, "marks_awarded": {"$ne": None}}
    ).to_list(length=500)

    # Question details from snapshot or test_questions
    q_map = {q.get("question_id"): q for q in attempt.get("question_snapshot", [])}
    raw_questions = await database.test_questions.find(
        {"test_id": attempt["test_id"]}
    ).to_list(length=300)
    raw_map = {q.get("question_id"): q for q in raw_questions}

    out = _serialize_result(result, (test or {}).get("title", ""))
    out["answers"] = [
        {
            "question_id": a["question_id"],
            "question": (q_map.get(a["question_id"]) or raw_map.get(a["question_id"]) or {}).get("question", ""),
            "type": (q_map.get(a["question_id"]) or raw_map.get(a["question_id"]) or {}).get("type", "mcq"),
            "options": (q_map.get(a["question_id"]) or raw_map.get(a["question_id"]) or {}).get("options"),
            "correct_answer": (raw_map.get(a["question_id"]) or {}).get("correct_answer")
            or (q_map.get(a["question_id"]) or {}).get("correct_answer")
            or (raw_map.get(a["question_id"]) or {}).get("expected_answer")
            or (q_map.get(a["question_id"]) or {}).get("expected_answer"),
            "marks_awarded": a["marks_awarded"],
            "max_marks": (raw_map.get(a["question_id"]) or q_map.get(a["question_id"]) or {}).get("marks", 1),
            "is_correct": a["is_correct"],
            "feedback": a.get("feedback"),
            "student_answer": a.get("student_answer"),
            "explanation": (raw_map.get(a["question_id"]) or q_map.get(a["question_id"]) or {}).get("explanation"),
        }
        for a in graded
    ]
    return out


async def list_test_attempts(database, student_id: str, test_id: str) -> list[dict] | None:
    if not ObjectId.is_valid(test_id):
        return None
    test = await database.tests.find_one({"_id": ObjectId(test_id), "status": "published"})
    if test is None:
        return None
    attempts = await database.test_attempts.find(
        {"test_id": test_id, "student_id": student_id}, sort=[("started_at", -1)]
    ).to_list(length=20)
    results = {
        r["attempt_id"]: r
        for r in await database.test_results.find(
            {"test_id": test_id, "student_id": student_id}
        ).to_list(length=20)
    }
    out = []
    for a in attempts:
        entry = _serialize_attempt(a)
        r = results.get(str(a["_id"]))
        if r:
            entry["percentage"] = r["percentage"]
            entry["passed"] = r["passed"]
        out.append(entry)
    return out


async def list_student_results(database, student_id: str) -> list[dict]:
    results = await database.test_results.find(
        {"student_id": student_id}, sort=[("evaluated_at", -1)]
    ).to_list(length=100)
    out = []
    for r in results:
        test = await database.tests.find_one({"_id": ObjectId(r["test_id"])})
        out.append(_serialize_result(r, (test or {}).get("title", "")))
    return out
