"""Validation for AI-generated questions before they are saved as a draft."""

import logging
import re

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (text or "").lower()).strip()


def validate_question(q: dict) -> tuple[bool, str]:
    """Validate one generated question dict. Returns (ok, error)."""
    qtype = q.get("type")
    question = (q.get("question") or "").strip()

    if qtype not in ("mcq", "true_false", "descriptive"):
        return False, f"unknown question type: {qtype}"
    if len(question) < 8:
        return False, "question text too short"
    if not isinstance(q.get("marks"), int) or q["marks"] < 1 or q["marks"] > 20:
        return False, "marks must be an integer between 1 and 20"
    if q.get("difficulty") not in ("easy", "medium", "hard"):
        return False, "invalid difficulty"

    if qtype == "mcq":
        options = q.get("options")
        if not isinstance(options, list) or len(options) < 2 or len(options) > 6:
            return False, "mcq must have 2-6 options"
        if len({o.strip().lower() for o in options}) != len(options):
            return False, "mcq options must be unique"
        if any(not isinstance(o, str) or not o.strip() for o in options):
            return False, "mcq options must be non-empty strings"
        answer = q.get("correct_answer")
        if not isinstance(answer, str) or answer.strip() not in options:
            return False, "mcq correct_answer must be one of the options"
        q["correct_answer"] = answer.strip()

    elif qtype == "true_false":
        if not isinstance(q.get("correct_answer"), bool):
            return False, "true_false correct_answer must be a boolean"

    elif qtype == "descriptive":
        rubric = q.get("evaluation_rubric")
        if not isinstance(rubric, list) or not rubric:
            return False, "descriptive question needs an evaluation_rubric"
        total = 0
        for criterion in rubric:
            if (
                not isinstance(criterion, dict)
                or not isinstance(criterion.get("criterion"), str)
                or not isinstance(criterion.get("marks"), int)
                or criterion["marks"] < 1
            ):
                return False, "invalid evaluation_rubric entry"
            total += criterion["marks"]
        if total != q["marks"]:
            return False, f"rubric marks ({total}) must equal question marks ({q['marks']})"
        if not (q.get("expected_answer") or "").strip():
            return False, "descriptive question needs expected_answer"

    return True, ""


def dedupe_questions(questions: list[dict]) -> tuple[list[dict], int]:
    """Drop duplicate/similar questions (normalized text prefix match)."""
    seen: set[str] = set()
    unique = []
    dropped = 0
    for q in questions:
        key = _normalize(q.get("question", ""))[:120]
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        unique.append(q)
    return unique, dropped


def validate_and_clean(raw_questions: list[dict], qtype: str) -> tuple[list[dict], list[str]]:
    """Validate a list of generated questions of one type; returns (valid, errors)."""
    errors = []
    valid = []
    for q in raw_questions:
        q["type"] = qtype  # enforce the requested type
        ok, err = validate_question(q)
        if ok:
            valid.append(q)
        else:
            errors.append(f"{err}: {(q.get('question') or '')[:60]}")
    valid, dropped = dedupe_questions(valid)
    if dropped:
        logger.info("Dropped %d duplicate %s questions", dropped, qtype)
    return valid, errors
