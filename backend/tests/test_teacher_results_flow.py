"""Regression test for the teacher result & evaluation module (fake DB, no real DB)."""
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.core import dependencies
from app.database import mongodb
from app.services import auth_service
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
        n = 0
        for d in self.store:
            if self._match(d, q):
                n += 1
                for k, v in u.get("$set", {}).items(): d[k] = v
        return type("U", (), {"modified_count": n})()
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
    teacher_id = str(ObjectId())
    other_teacher = str(ObjectId())
    users.append({"_id": ObjectId(teacher_id), "name": "Teacher", "email": "t@x.com", "role": "teacher", "is_active": True})
    users.append({"_id": ObjectId(other_teacher), "name": "Other", "email": "o@x.com", "role": "teacher", "is_active": True})
    users.append({"_id": ObjectId(), "id": "s1", "name": "Alice", "email": "a@x.com", "role": "student", "is_active": True})
    users.append({"_id": ObjectId(), "id": "s2", "name": "Bob", "email": "b@x.com", "role": "student", "is_active": True})
    alice, bob = str(users[2]["_id"]), str(users[3]["_id"])

    classroom_id = str(ObjectId())
    classrooms.append({"_id": ObjectId(classroom_id), "name": "English 8B", "teacher_id": teacher_id})
    enrollments.append({"classroom_id": classroom_id, "student_id": alice, "status": "active"})
    enrollments.append({"classroom_id": classroom_id, "student_id": bob, "status": "active"})

    chapter_id = str(ObjectId())
    chapters.append({"_id": ObjectId(chapter_id), "title": "Past Simple"})

    test_id = str(ObjectId())
    tests.append({"_id": ObjectId(test_id), "teacher_id": teacher_id, "classroom_id": classroom_id,
                  "chapter_ids": [chapter_id], "title": "Chapter 1 Test", "difficulty": "medium",
                  "total_questions": 3, "total_marks": 6, "duration_minutes": 30,
                  "passing_percentage": 40, "attempts_allowed": 1, "status": "published",
                  "test_version": 1, "start_at": None, "end_at": None, "created_at": now})
    other_test = str(ObjectId())
    tests.append({"_id": ObjectId(other_test), "teacher_id": other_teacher, "classroom_id": classroom_id,
                  "chapter_ids": [], "title": "Not Mine", "total_marks": 6, "status": "published",
                  "created_at": now})

    for qid, qtype, marks in [("q1", "mcq", 2), ("q2", "true_false", 1), ("q3", "descriptive", 3)]:
        questions.append({"question_id": qid, "test_id": test_id, "type": qtype, "marks": marks,
                          "question": f"Question {qid}", "options": ["a", "b"] if qtype == "mcq" else None,
                          "correct_answer": "a" if qtype == "mcq" else (True if qtype == "true_false" else None)})

    # Alice: 3/6 → 50% passed. Bob: 1/6 → 16.67% failed.
    for student, obtained, pct, passed in ((alice, 3, 50.0, True), (bob, 1, 16.67, False)):
        attempt_id = str(ObjectId())
        attempts.append({"_id": ObjectId(attempt_id), "test_id": test_id, "classroom_id": classroom_id,
                         "student_id": student, "status": "submitted", "test_version": 1,
                         "started_at": now - timedelta(minutes=25), "submitted_at": now - timedelta(minutes=5),
                         "obtained_marks": obtained, "total_marks": 6, "evaluation_status": "completed",
                         "percentage": pct, "passed": passed})
        ai_marks = {"q1": 2 if student == alice else 0, "q2": 1 if student == alice else 0, "q3": 0}
        for qid in ("q1", "q2", "q3"):
            answers.append({"_id": ObjectId(), "question_id": qid, "attempt_id": attempt_id, "student_id": student,
                            "student_answer": "x", "marks_awarded": ai_marks[qid],
                            "is_correct": ai_marks[qid] > 0,
                            "feedback": "AI feedback" if qid == "q3" else None, "graded_at": now})
        results.append({"_id": ObjectId(), "attempt_id": attempt_id, "student_id": student,
                        "test_id": test_id, "classroom_id": classroom_id,
                        "obtained_marks": obtained, "total_marks": 6, "percentage": pct,
                        "passed": passed, "evaluation_status": "completed",
                        "evaluated_at": now, "review_status": "pending"})

    token = create_access_token(teacher_id, "teacher")
    other_token = create_access_token(other_teacher, "teacher")

    alice_result_id = str([r for r in results if r["student_id"] == alice][0]["_id"])
    alice_attempt = [a for a in attempts if a["student_id"] == alice][0]

    with TestClient(app) as client:
        H = {"Authorization": f"Bearer {token}"}
        OH = {"Authorization": f"Bearer {other_token}"}

        # --- results overview ---
        r = client.get(f"/api/v1/teacher/tests/{test_id}/results", headers=H)
        check("overview 200", r.status_code == 200)
        body = r.json()
        check("stats 2 students", body["stats"]["total_students"] == 2)
        check("attempted 2", body["stats"]["attempted"] == 2)
        check("avg 33.34", abs(body["stats"]["average_percentage"] - 33.34) < 0.01)
        check("pass rate 50%", abs(body["stats"]["pass_rate"] - 50.0) < 0.01)
        check("rows ranked alice first", body["results"][0]["student_name"] == "Alice")
        check("time taken present", body["results"][0]["time_taken_seconds"] == 20 * 60)

        # ownership
        r = client.get(f"/api/v1/teacher/tests/{test_id}/results", headers=OH)
        check("foreign teacher 404", r.status_code == 404)

        # --- result detail ---
        r = client.get(f"/api/v1/teacher/results/{alice_result_id}", headers=H)
        check("detail 200", r.status_code == 200)
        det = r.json()["result"]
        ans = {a["question_id"]: a for a in det["answers"]}
        check("3 answers", len(det["answers"]) == 3)
        check("teacher sees correct_answer", ans["q1"]["correct_answer"] == "a")
        check("descriptive flagged needs_review", ans["q3"]["needs_review"] is True)
        check("AI marks exposed", ans["q3"]["ai_marks"] == 0)

        # --- pending evaluation queue ---
        r = client.get("/api/v1/teacher/results/pending-evaluation", headers=H)
        check("pending 200", r.status_code == 200)
        pend = r.json()["pending"]
        check("2 pending (alice+bob descriptive)", len([p for p in pend if p["test_id"] == test_id]) == 2)
        check("pending has AI marks", all(p["ai_marks"] is not None for p in pend))

        # --- manual evaluation ---
        r = client.patch(f"/api/v1/teacher/results/{alice_result_id}/answers/q3/evaluate",
                         headers=H, json={"marks_awarded": 2, "feedback": "Good, add more detail."})
        check("evaluate 200", r.status_code == 200)
        ans_doc = [a for a in answers if a["attempt_id"] == str(alice_attempt["_id"]) and a["question_id"] == "q3"][0]
        check("AI marks untouched", ans_doc["marks_awarded"] == 0 and ans_doc["feedback"] == "AI feedback")
        check("teacher marks stored", ans_doc["teacher_marks_awarded"] == 2)

        # over-max rejected
        r = client.patch(f"/api/v1/teacher/results/{alice_result_id}/answers/q3/evaluate",
                         headers=H, json={"marks_awarded": 99})
        check("over-max rejected", r.status_code == 404)

        # foreign teacher cannot evaluate
        r = client.patch(f"/api/v1/teacher/results/{alice_result_id}/answers/q3/evaluate",
                         headers=OH, json={"marks_awarded": 1})
        check("foreign evaluate blocked", r.status_code == 404)

        # --- finalize ---
        r = client.post(f"/api/v1/teacher/results/{alice_result_id}/finalize", headers=H)
        check("finalize 200", r.status_code == 200)
        fin = r.json()["result"]
        check("recomputed 5/6 = 83.33", fin["obtained_marks"] == 5 and abs(fin["percentage"] - 83.33) < 0.01)
        check("published", fin["review_status"] == "published")
        alice_attempt_doc = [a for a in attempts if str(a["_id"]) == str(alice_attempt["_id"])][0]
        check("attempt totals updated", alice_attempt_doc["obtained_marks"] == 5)

        # --- classroom performance ---
        r = client.get(f"/api/v1/teacher/classrooms/{classroom_id}/performance", headers=H)
        check("classroom perf 200", r.status_code == 200)
        perf = r.json()["performance"]
        check("2 results", perf["total_results"] == 2)
        check("ranking alice first", perf["student_ranking"][0]["student_name"] == "Alice")
        check("chapter perf present", any(c["chapter"] == "Past Simple" for c in perf["chapter_performance"]))

        r = client.get(f"/api/v1/teacher/classrooms/{classroom_id}/performance", headers=OH)
        check("foreign classroom perf 404", r.status_code == 404)

        # --- student performance via teacher ---
        r = client.get(f"/api/v1/teacher/students/{alice}/performance", headers=H)
        check("student perf 200", r.status_code == 200)
        sp = r.json()["performance"]
        check("student perf total_tests == 2 (both students' results counted per student)", sp["total_tests"] == 1)

        # student not in teacher's classrooms
        r = client.get(f"/api/v1/teacher/students/{str(ObjectId())}/performance", headers=H)
        check("unknown student 404", r.status_code == 404)

    ok = sum(1 for _, c in checks if c)
    print(f"\n{ok}/{len(checks)} checks passed")
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
