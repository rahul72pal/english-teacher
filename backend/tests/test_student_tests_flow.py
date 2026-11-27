"""Regression test for the student test lifecycle (fake DB + stubbed LLM)."""
import asyncio
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.core import dependencies
from app.database import mongodb
from app.services import auth_service, attempt_service, evaluation_service
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

users, profiles, classrooms, enrollments, chapters = [], [], [], [], []
tests, questions, attempts, answers, results = [], [], [], [], []
fake = type("DB", (), {})()
fake.users = FakeCollection(users); fake.teacher_profiles = FakeCollection(profiles, ["user_id"])
fake.classrooms = FakeCollection(classrooms, ["join_code"]); fake.enrollments = FakeCollection(enrollments)
fake.chapters = FakeCollection(chapters)
fake.tests = FakeCollection(tests); fake.test_questions = FakeCollection(questions)
fake.test_attempts = FakeCollection(attempts); fake.test_answers = FakeCollection(answers)
fake.test_results = FakeCollection(results)
fake.get_db = lambda: fake
for mod in (auth_service, dependencies): mod.db = fake
for svc in (attempt_service,): svc.db = fake
async def fc(self): mongodb.Database.db = fake
async def fd(self): mongodb.Database.db = None
mongodb.Database.connect = fc
mongodb.Database.disconnect = fd

# stub descriptive evaluation
async def fake_descriptive(question, student_answer):
    if isinstance(student_answer, str) and "village" in student_answer.lower():
        return question["marks"], "Good use of details."
    return 1, "Needs more detail."
evaluation_service.evaluate_descriptive = fake_descriptive
attempt_service.evaluate_attempt.__globals__["evaluate_descriptive"] = fake_descriptive

teacher = {"_id": ObjectId(), "name": "T", "email": "t@x.com", "role": "teacher", "is_active": True}
student = {"_id": ObjectId(), "name": "S", "email": "s@x.com", "role": "student", "is_active": True}
other_student = {"_id": ObjectId(), "name": "S2", "email": "s2@x.com", "role": "student", "is_active": True}
users.extend([teacher, student, other_student])
t_tok = create_access_token(str(teacher["_id"]), "teacher")
s_tok = create_access_token(str(student["_id"]), "student")
o_tok = create_access_token(str(other_student["_id"]), "student")

now = datetime.now(timezone.utc)
with TestClient(app) as c:
    H = {"Authorization": f"Bearer {t_tok}"}
    SH = {"Authorization": f"Bearer {s_tok}"}
    r = c.post("/api/v1/classrooms", headers=H, json={"name": "C8", "description": ""})
    cid = r.json()["classroom"]["id"]; code = r.json()["classroom"]["join_code"]

    test_id = str(ObjectId())
    q1, q2, q3 = f"q_001", "q_002", "q_003"
    tests.append({
        "_id": ObjectId(test_id), "teacher_id": str(teacher["_id"]), "classroom_id": cid,
        "chapter_ids": [], "title": "Village Test", "difficulty": "medium",
        "total_questions": 3, "total_marks": 6, "duration_minutes": 30,
        "passing_percentage": 50, "attempts_allowed": 1, "status": "published",
        "test_version": 1, "start_at": None, "end_at": None, "created_at": now,
    })
    questions.extend([
        {"_id": ObjectId(), "test_id": test_id, "question_id": q1, "type": "mcq",
         "question": "Where does Tom live?", "options": ["city", "small village"], "correct_answer": "small village",
         "marks": 2, "difficulty": "easy", "approved": True},
        {"_id": ObjectId(), "test_id": test_id, "question_id": q2, "type": "true_false",
         "question": "The school has twenty students.", "correct_answer": True, "marks": 1, "difficulty": "easy", "approved": True},
        {"_id": ObjectId(), "test_id": test_id, "question_id": q3, "type": "descriptive",
         "question": "Describe the village.", "marks": 3, "difficulty": "medium", "approved": True,
         "expected_answer": "small village", "evaluation_rubric": [{"criterion": "village", "marks": 3}]},
    ])

    # not enrolled
    r = c.get(f"/api/v1/student/classrooms/{cid}/tests", headers=SH)
    print("unenrolled list -> 403:", r.status_code == 403)
    r = c.post(f"/api/v1/student/tests/{test_id}/attempts", headers=SH)
    print("unenrolled start -> 400 with enrollment msg:", r.status_code == 400 and "enrolled" in r.json()["detail"])

    # enroll
    enrollments.append({"_id": ObjectId(), "classroom_id": cid, "student_id": str(student["_id"]), "status": "active", "joined_at": now})
    r = c.get(f"/api/v1/student/classrooms/{cid}/tests", headers=SH)
    print("list published tests:", r.status_code == 200, len(r.json()["tests"]) == 1)

    # student-safe test details: NO correct answers
    r = c.get(f"/api/v1/student/tests/{test_id}", headers=SH)
    qs = r.json()["questions"]
    print("safe questions:", len(qs) == 3, "no answer keys:", all("correct_answer" not in q and "evaluation_rubric" not in q for q in qs))

    # draft test invisible to students
    draft_id = str(ObjectId())
    tests.append({"_id": ObjectId(draft_id), "teacher_id": str(teacher["_id"]), "classroom_id": cid,
                  "title": "Draft", "status": "draft", "total_questions": 0, "total_marks": 0, "created_at": now})
    r = c.get(f"/api/v1/student/tests/{draft_id}", headers=SH)
    print("draft test -> 404:", r.status_code == 404)

    # start attempt
    r = c.post(f"/api/v1/student/tests/{test_id}/attempts", headers=SH)
    attempt_id = r.json()["id"]
    print("start attempt 201:", r.status_code == 201, r.json()["status"] == "in_progress", "expires set:", r.json()["expires_at"] is not None)

    # resume returns same attempt
    r2 = c.post(f"/api/v1/student/tests/{test_id}/attempts", headers=SH)
    print("resume same attempt:", r2.json()["id"] == attempt_id and r2.json().get("resumed") is True)

    # second student blocked by attempts_allowed=1 later; first save answers
    r = c.put(f"/api/v1/student/attempts/{attempt_id}/answers/{q1}", headers=SH, json={"student_answer": "small village"})
    print("save mcq answer:", r.status_code == 200)
    r = c.put(f"/api/v1/student/attempts/{attempt_id}/answers/{q2}", headers=SH, json={"student_answer": False})
    print("save tf answer:", r.status_code == 200)
    r = c.put(f"/api/v1/student/attempts/{attempt_id}/answers/{q3}", headers=SH, json={"student_answer": "The village is small and quiet."})
    print("save descriptive:", r.status_code == 200)

    # other student's attempt -> 404
    r = c.get(f"/api/v1/student/attempts/{attempt_id}", headers={"Authorization": f"Bearer {o_tok}"})
    print("other student attempt -> 404:", r.status_code == 404)

    # get attempt shows answers
    r = c.get(f"/api/v1/student/attempts/{attempt_id}", headers=SH)
    print("attempt detail:", r.status_code == 200, len(r.json()["answers"]) == 3)

    # submit + evaluate
    r = c.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=SH)
    res = r.json()["result"]
    print("submit marks:", r.status_code == 200, res["obtained_marks"], res["total_marks"])
    r = c.get(f"/api/v1/student/attempts/{attempt_id}/result", headers=SH)
    res = r.json()["result"]
    print("grading:", res["obtained_marks"] == 5, res["total_marks"] == 6, res["passed"] is True)
    print("descriptive graded by AI:", any(a["feedback"] == "Good use of details." for a in res["answers"]))

    # double submit idempotent
    r = c.post(f"/api/v1/student/attempts/{attempt_id}/submit", headers=SH)
    print("double submit returns existing:", r.status_code == 200, r.json()["result"]["attempt_id"] == attempt_id)

    # answer after submission -> 409
    r = c.put(f"/api/v1/student/attempts/{attempt_id}/answers/{q1}", headers=SH, json={"student_answer": "city"})
    print("answer after submit -> 409:", r.status_code == 409)

    # result endpoint
    r = c.get(f"/api/v1/student/attempts/{attempt_id}/result", headers=SH)
    print("result endpoint:", r.status_code == 200, r.json()["result"]["percentage"] > 80)

    # my attempts
    r = c.get(f"/api/v1/student/tests/{test_id}/my-attempts", headers=SH)
    print("my attempts:", len(r.json()["attempts"]) == 1, r.json()["attempts"][0]["percentage"] > 80)

    # all results
    r = c.get("/api/v1/student/results", headers=SH)
    print("all results:", len(r.json()["results"]) == 1)

    # second student: attempts_allowed=1 blocks after one attempt exists? none yet -> can start, then blocked on new attempt after submit? verify limit using same student after used
    r = c.post(f"/api/v1/student/tests/{test_id}/attempts", headers=SH)
    print("attempts limit enforced -> 400:", r.status_code == 400 and "attempts" in r.json()["detail"])

    # deadline: expired attempt auto-submits on access
    exp_id = str(ObjectId())
    attempts.append({
        "_id": ObjectId(exp_id), "test_id": test_id, "student_id": str(other_student["_id"]),
        "classroom_id": cid, "test_version": 1, "status": "in_progress",
        "started_at": now - timedelta(minutes=60), "expires_at": now - timedelta(minutes=30),
        "total_marks": 6, "passing_percentage": 50,
        "question_snapshot": [{"question_id": q1, "type": "mcq", "question": "Where?", "options": ["a", "b"], "marks": 2}],
        "evaluation_status": "pending",
    })
    enrollments.append({"_id": ObjectId(), "classroom_id": cid, "student_id": str(other_student["_id"]), "status": "active", "joined_at": now})
    r = c.get(f"/api/v1/student/attempts/{exp_id}", headers={"Authorization": f"Bearer {o_tok}"})
    print("expired attempt auto-submitted:", r.status_code == 200, r.json()["attempt"]["status"] == "submitted")
