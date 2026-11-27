"""Regression test for student results & performance analytics (fake DB + TestClient, no real DB)."""
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.core import dependencies
from app.database import mongodb
from app.services import auth_service, performance_service
from app.core.security import create_access_token


class Cursor:
    def __init__(self, docs, sort=None):
        self._docs = list(docs); self._sort = sort or []
    async def to_list(self, length=None):
        for key, d in self._sort:
            self._docs.sort(key=lambda x: x.get(key) or 0, reverse=d == -1)
        return self._docs[: length or 0]

class FakeCollection:
    def __init__(self, store, unique_fields=()):
        self.store = store; self.unique_fields = unique_fields
    def _match(self, doc, q):
        for k, v in q.items():
            if isinstance(v, dict):
                if "$in" in v:
                    if doc.get(k) not in v["$in"]: return False
                elif "$ne" in v:
                    if doc.get(k) == v["$ne"]: return False
                elif "$gt" in v:
                    if not (doc.get(k) or 0) > v["$gt"]: return False
                elif "$eq" in v:
                    if doc.get(k) != v["$eq"]: return False
            elif k == "_id":
                if str(doc.get("_id")) != str(v) and doc.get("_id") != v: return False
            elif doc.get(k) != v: return False
        return True
    async def insert_one(self, doc):
        doc["_id"] = ObjectId(); self.store.append(doc)
        class R: inserted_id = doc["_id"]
        return R()
    async def find_one(self, q):
        return next((d for d in self.store if self._match(d, q)), None)
    async def count_documents(self, q):
        return sum(1 for d in self.store if self._match(d, q))
    async def update_one(self, q, u):
        for d in self.store:
            if self._match(d, q):
                for k, v in u.get("$set", {}).items(): d[k] = v
                return
    async def delete_many(self, q):
        for d in list(self.store):
            if self._match(d, q): self.store.remove(d)
    def find(self, q, projection=None, sort=None):
        return Cursor([d for d in self.store if self._match(d, q)], sort)

users, classrooms, enrollments, chapters = [], [], [], []
tests, questions, attempts, answers, results = [], [], [], [], []
fake = type("DB", (), {})()
fake.users = FakeCollection(users)
fake.classrooms = FakeCollection(classrooms); fake.enrollments = FakeCollection(enrollments)
fake.chapters = FakeCollection(chapters)
fake.tests = FakeCollection(tests); fake.test_questions = FakeCollection(questions)
fake.test_attempts = FakeCollection(attempts); fake.test_answers = FakeCollection(answers)
fake.test_results = FakeCollection(results)
fake.get_db = lambda: fake
for mod in (auth_service, dependencies): mod.db = fake
async def fc(self): mongodb.Database.db = fake
async def fd(self): mongodb.Database.db = None
mongodb.Database.connect = fc
mongodb.Database.disconnect = fd

checks = []
def check(name, cond):
    checks.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


def main():
    now = datetime.now(timezone.utc)
    users.append({"_id": ObjectId(), "id": "student-perf-1", "email": "s@x.com", "name": "Perf Student",
                  "role": "student", "is_active": True})
    users.append({"_id": ObjectId(), "id": "student-other", "email": "o@x.com", "name": "Other Student",
                  "role": "student", "is_active": True})
    student_id, other_student = str(users[0]["_id"]), str(users[1]["_id"])
    classroom_id = str(ObjectId())
    chapter1, chapter2 = str(ObjectId()), str(ObjectId())
    chapters.append({"_id": ObjectId(chapter1), "title": "Past Simple"})
    chapters.append({"_id": ObjectId(chapter2), "title": "Present Perfect"})

    test1, test2 = str(ObjectId()), str(ObjectId())
    tests.append({"_id": ObjectId(test1), "title": "Test A", "classroom_id": classroom_id,
                  "chapter_ids": [chapter1], "passing_percentage": 40})
    tests.append({"_id": ObjectId(test2), "title": "Test B", "classroom_id": classroom_id,
                  "chapter_ids": [chapter1, chapter2], "passing_percentage": 40})

    enrollments.append({"student_id": student_id, "classroom_id": classroom_id})

    token = create_access_token(student_id, "student")

    for qid, qtype, marks in [("q_t1_1", "mcq", 2), ("q_t1_2", "true_false", 1), ("q_t1_3", "descriptive", 3)]:
        questions.append({"question_id": qid, "test_id": test1, "type": qtype, "marks": marks,
                          "question": f"Question {qid}", "options": ["a", "b"] if qtype == "mcq" else None})

    # attempt 1 on test1: 2/3 objective correct, descriptive good → 5/6 = 83.33%
    attempt1 = str(ObjectId())
    attempts.append({"_id": ObjectId(attempt1), "test_id": test1, "classroom_id": classroom_id,
                     "student_id": student_id, "status": "submitted", "test_version": 1,
                     "started_at": (now - timedelta(days=3)).isoformat(),
                     "expires_at": (now - timedelta(days=3) + timedelta(minutes=30)).isoformat(),
                     "submitted_at": (now - timedelta(days=3)).isoformat(),
                     "obtained_marks": 5, "total_marks": 6, "evaluation_status": "completed",
                     "percentage": 83.33, "passed": True})
    answers.append({"question_id": "q_t1_1", "attempt_id": attempt1, "student_answer": "a",
                    "marks_awarded": 2, "is_correct": True, "feedback": None, "graded_at": now})
    answers.append({"question_id": "q_t1_2", "attempt_id": attempt1, "student_answer": False,
                    "marks_awarded": 0, "is_correct": False, "feedback": None, "graded_at": now})
    answers.append({"question_id": "q_t1_3", "attempt_id": attempt1, "student_answer": "long text",
                    "marks_awarded": 3, "is_correct": False, "feedback": "Good use of details.", "graded_at": now})
    results.append({"_id": ObjectId(), "attempt_id": attempt1, "student_id": student_id, "test_id": test1,
                    "classroom_id": classroom_id, "obtained_marks": 5, "total_marks": 6,
                    "percentage": 83.33, "passed": True, "evaluation_status": "completed",
                    "evaluated_at": now - timedelta(days=3)})

    # attempt on test2 by another student (must stay invisible)
    attempt_other = str(ObjectId())
    attempts.append({"_id": ObjectId(attempt_other), "test_id": test2, "classroom_id": classroom_id,
                     "student_id": other_student, "status": "submitted", "test_version": 1,
                     "evaluation_status": "completed", "obtained_marks": 1, "total_marks": 6,
                     "percentage": 16.7, "passed": False})
    results.append({"_id": ObjectId(), "attempt_id": attempt_other, "student_id": other_student, "test_id": test2,
                    "classroom_id": classroom_id, "obtained_marks": 1, "total_marks": 6,
                    "percentage": 16.7, "passed": False, "evaluation_status": "completed",
                    "evaluated_at": now - timedelta(days=2)})

    # attempt 3 on test2: failed → 2/6 = 33.33%
    attempt3 = str(ObjectId())
    attempts.append({"_id": ObjectId(attempt3), "test_id": test2, "classroom_id": classroom_id,
                     "student_id": student_id, "status": "submitted", "test_version": 1,
                     "evaluation_status": "completed", "obtained_marks": 2, "total_marks": 6,
                     "percentage": 33.33, "passed": False})
    for qid, qtype, marks in [("q_t2_1", "mcq", 2), ("q_t2_2", "true_false", 1), ("q_t2_3", "descriptive", 3)]:
        questions.append({"question_id": qid, "test_id": test2, "type": qtype, "marks": marks,
                          "question": f"Question {qid}", "options": ["a", "b"] if qtype == "mcq" else None})
    answers.append({"question_id": "q_t2_1", "attempt_id": attempt3, "student_answer": "b",
                    "marks_awarded": 0, "is_correct": False, "feedback": None, "graded_at": now})
    answers.append({"question_id": "q_t2_2", "attempt_id": attempt3, "student_answer": True,
                    "marks_awarded": 1, "is_correct": True, "feedback": None, "graded_at": now})
    answers.append({"question_id": "q_t2_3", "attempt_id": attempt3, "student_answer": "short",
                    "marks_awarded": 1, "is_correct": False, "feedback": "Needs more detail.", "graded_at": now})
    results.append({"_id": ObjectId(), "attempt_id": attempt3, "student_id": student_id, "test_id": test2,
                    "classroom_id": classroom_id, "obtained_marks": 2, "total_marks": 6,
                    "percentage": 33.33, "passed": False, "evaluation_status": "completed",
                    "evaluated_at": now - timedelta(days=1)})

    with TestClient(app) as client:
        # --- GET /student/results ---
        r = client.get("/api/v1/student/results", headers={"Authorization": f"Bearer {token}"})
        check("results list 200", r.status_code == 200)
        rl = r.json()["results"]
        check("only own results (2)", len(rl) == 2)
        check("newest first", rl[0]["test_title"] == "Test B")

        # --- GET /student/performance ---
        r = client.get("/api/v1/student/performance", headers={"Authorization": f"Bearer {token}"})
        check("performance 200", r.status_code == 200)
        p = r.json()["performance"]
        check("total_tests == 2", p["total_tests"] == 2)
        check("avg == 58.33", abs(p["average_percentage"] - 58.33) < 0.01)
        check("highest == 83.33", abs(p["highest_percentage"] - 83.33) < 0.01)
        check("passed 1 failed 1", p["passed_tests"] == 1 and p["failed_tests"] == 1)
        check("trend oldest first", p["trend"][0]["test_title"] == "Test A")
        cp = {c["chapter"]: c["average_percentage"] for c in p["chapter_performance"]}
        check("chapter1 avg 58.33", abs(cp["Past Simple"] - 58.33) < 0.01)
        check("chapter2 avg 33.33", abs(cp["Present Perfect"] - 33.33) < 0.01)
        check("weak_chapters flags Present Perfect", any(c["chapter"] == "Present Perfect" for c in p["weak_chapters"]))
        tp = {t["type"]: t["accuracy"] for t in p["type_performance"]}
        check("mcq accuracy 50%", abs(tp["mcq"] - 50.0) < 0.01)
        check("true_false accuracy 50%", abs(tp["true_false"] - 50.0) < 0.01)

        # --- GET /student/results/{result_id} ---
        result_id = str([d for d in results if d["student_id"] == student_id and d["test_id"] == test1][0]["_id"])
        r = client.get(f"/api/v1/student/results/{result_id}", headers={"Authorization": f"Bearer {token}"})
        check("result detail 200", r.status_code == 200)
        det = r.json()["result"]
        check("detail has 3 answers", len(det["answers"]) == 3)
        ans = {a["question_id"]: a for a in det["answers"]}
        check("descriptive feedback present", ans["q_t1_3"]["feedback"] == "Good use of details.")
        check("no answer-key leak", all("correct_answer" not in a and "evaluation_rubric" not in a for a in det["answers"]))

        # another student's result is invisible
        other_result = str([d for d in results if d["student_id"] == other_student][0]["_id"])
        r = client.get(f"/api/v1/student/results/{other_result}", headers={"Authorization": f"Bearer {token}"})
        check("foreign result 404", r.status_code == 404)

        r = client.get("/api/v1/student/results/notanid", headers={"Authorization": f"Bearer {token}"})
        check("bad id 404", r.status_code == 404)

    ok = sum(1 for _, c in checks if c)
    print(f"\n{ok}/{len(checks)} checks passed")
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
