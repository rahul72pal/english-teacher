"""Student performance analytics computed from actual test_results / test_answers."""

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId

from app.services.attempt_service import _iso, _serialize_result


async def get_result_detail(database, student_id: str, result_id: str) -> dict | None:
    """Full result with per-question breakdown (student-safe: no answer keys)."""
    try:
        oid = ObjectId(result_id)
    except (InvalidId, TypeError):
        return None
    result = await database.test_results.find_one({"_id": oid, "student_id": student_id})
    if not result:
        return None
    test = await database.tests.find_one({"_id": ObjectId(result["test_id"])})

    # graded answers for this attempt
    graded = await database.test_answers.find({"attempt_id": result["attempt_id"]}).to_list(length=500)
    questions = {}
    for qid in {g["question_id"] for g in graded}:
        q = await database.test_questions.find_one({"question_id": qid, "test_id": result["test_id"]})
        if q:
            questions[qid] = q

    answers_out = []
    for g in graded:
        q = questions.get(g["question_id"], {})
        answers_out.append({
            "question_id": g["question_id"],
            "type": q.get("type", "unknown"),
            "question": q.get("question", ""),
            "marks_awarded": g.get("marks_awarded"),
            "is_correct": g.get("is_correct", False),
            "feedback": g.get("feedback"),
            "student_answer": g.get("student_answer"),
        })
    answers_out.sort(key=lambda a: a["question_id"])

    return {
        **_serialize_result(result, (test or {}).get("title", "")),
        "result_id": str(result["_id"]),
        "attempt_id": result["attempt_id"],
        "classroom_id": result.get("classroom_id", ""),
        "answers": answers_out,
    }


async def get_performance(database, student_id: str) -> dict:
    results = await database.test_results.find(
        {"student_id": student_id, "evaluation_status": "completed"}
    ).to_list(length=200)

    percentages = [r["percentage"] for r in results]
    passed = sum(1 for r in results if r["passed"])
    failed = len(results) - passed
    total_obtained = sum(r["obtained_marks"] for r in results)
    total_possible = sum(r["total_marks"] for r in results)

    performance = {
        "total_tests": len(results),
        "completed_tests": len(results),
        "average_percentage": round(sum(percentages) / len(percentages), 2) if percentages else 0.0,
        "average_marks": round(total_obtained / total_possible * 100, 2) if total_possible else 0.0,
        "highest_percentage": max(percentages) if percentages else 0.0,
        "lowest_percentage": min(percentages) if percentages else 0.0,
        "passed_tests": passed,
        "failed_tests": failed,
        "trend": [],
    }

    # trend over time (oldest → newest)
    ordered = sorted(results, key=lambda r: r.get("evaluated_at") or datetime.min.replace(tzinfo=timezone.utc))
    performance["trend"] = [
        {"test_title": "", "test_id": r["test_id"], "percentage": r["percentage"],
         "evaluated_at": _iso(r.get("evaluated_at"))}
        for r in ordered
    ]

    # fill test titles once
    title_cache: dict[str, str] = {}
    chapter_map: dict[str, set] = {}
    for r in results:
        tid = r["test_id"]
        if tid not in title_cache:
            t = await database.tests.find_one({"_id": ObjectId(tid)})
            title_cache[tid] = (t or {}).get("title", "")
            chapter_map[tid] = set((t or {}).get("chapter_ids") or [])
        for tr in performance["trend"]:
            if tr["test_id"] == tid:
                tr["test_title"] = title_cache[tid]

    # chapter performance
    chapter_scores: dict[str, list[float]] = {}
    for r in results:
        for cid in chapter_map.get(r["test_id"], set()):
            chapter_scores.setdefault(cid, []).append(r["percentage"])
    chapter_performance = []
    for cid, scores in chapter_scores.items():
        chapter = await database.chapters.find_one({"_id": ObjectId(cid)}) if cid else None
        chapter_performance.append({
            "chapter_id": cid,
            "chapter": (chapter or {}).get("title", "Unknown chapter"),
            "average_percentage": round(sum(scores) / len(scores), 2),
            "attempts": len(scores),
        })
    performance["chapter_performance"] = sorted(chapter_performance, key=lambda c: c["average_percentage"])

    # question-type accuracy from graded answers of this student's attempts
    type_stats: dict[str, dict] = {}
    for r in results:
        graded = await database.test_answers.find({"attempt_id": r["attempt_id"]}).to_list(length=500)
        qtypes = {}
        for g in graded:
            if g["question_id"] not in qtypes:
                q = await database.test_questions.find_one(
                    {"question_id": g["question_id"], "test_id": r["test_id"]})
                qtypes[g["question_id"]] = (q or {}).get("type", "unknown")
            t = qtypes[g["question_id"]]
            st = type_stats.setdefault(t, {"correct": 0, "total": 0})
            st["total"] += 1
            if g.get("is_correct"):
                st["correct"] += 1
    performance["type_performance"] = [
        {"type": t, "accuracy": round(s["correct"] / s["total"] * 100, 2) if s["total"] else 0.0,
         "answered": s["total"]}
        for t, s in sorted(type_stats.items(), key=lambda kv: kv[1]["correct"] / max(1, kv[1]["total"]))
    ]

    # weak chapters: lowest average first, flagged under 60%
    performance["weak_chapters"] = [
        {"chapter_id": c["chapter_id"], "chapter": c["chapter"], "average_percentage": c["average_percentage"]}
        for c in performance["chapter_performance"] if c["average_percentage"] < 60
    ]

    return performance
