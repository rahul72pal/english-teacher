"""Regression test for the teacher test module (fake DB + stubbed LLM)."""
import asyncio
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.core import dependencies
from app.database import mongodb
from app.services import auth_service, test_generation_service, test_service
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
            if isinstance(v, dict) and "$in" in v:
                if doc.get(k) not in v["$in"]: return False
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
    async def delete_one(self, q):
        for d in self.store:
            if self._match(d, q):
                self.store.remove(d)
                class R: deleted_count = 1
                return R()
        class R: deleted_count = 0
        return R()
    async def delete_many(self, q):
        n = 0
        for d in list(self.store):
            if self._match(d, q): self.store.remove(d); n += 1
        return {"deleted_count": n}
    async def update_one(self, q, u):
        for d in self.store:
            if self._match(d, q):
                for k, v in u.get("$set", {}).items(): d[k] = v
                return
    async def update_many(self, q, u):
        for d in self.store:
            if self._match(d, q):
                for k, v in u.get("$set", {}).items(): d[k] = v
    async def find_one_and_update(self, q, u, upsert=False, return_document=None):
        f = next((d for d in self.store if self._match(d, q)), None)
        if f is None and upsert:
            f = {k: v for k, v in q.items() if not isinstance(v, dict)}; f["_id"] = ObjectId(); self.store.append(f)
        if f is None: return None
        for k, v in u.get("$set", {}).items(): f[k] = v
        for k, v in u.get("$setOnInsert", {}).items(): f.setdefault(k, v)
        return f
    def find(self, q, projection=None, sort=None):
        return Cursor([d for d in self.store if self._match(d, q)], sort)

users, profiles, classrooms, enrollments, chapters, tests, questions = [], [], [], [], [], [], []
fake = type("DB", (), {})()
fake.users = FakeCollection(users); fake.teacher_profiles = FakeCollection(profiles, ["user_id"])
fake.classrooms = FakeCollection(classrooms, ["join_code"]); fake.enrollments = FakeCollection(enrollments)
fake.chapters = FakeCollection(chapters)
fake.tests = FakeCollection(tests); fake.test_questions = FakeCollection(questions)
fake.get_db = lambda: fake
for mod in (auth_service, dependencies):
    mod.db = fake
# test services use db via direct module import too
test_generation_service.db = fake
test_service.db = fake
async def fc(self): mongodb.Database.db = fake
async def fd(self): mongodb.Database.db = None
mongodb.Database.connect = fc
mongodb.Database.disconnect = fd

# stub chunk retrieval + LLM
import app.services.qdrant_service as qdrant
qdrant.get_chapter_chunks = lambda chapter_id, limit=30: [
    {"chapter_id": chapter_id, "chunk_index": 0, "text": "Tom lives in a small village."},
    {"chapter_id": chapter_id, "chunk_index": 1, "text": "The village school has twenty students."},
]
import app.core.llm as llm_mod
async def fake_invoke(prompt):
    if "multiple choice" in prompt:
        return '{"questions": [{"type": "mcq", "question": "Where does Tom live?", "options": ["city", "small village", "farm", "boat"], "correct_answer": "small village", "marks": 2, "difficulty": "medium", "source": 1}, {"type": "mcq", "question": "Where does Tom live?", "options": ["a", "b", "c", "d"], "correct_answer": "a", "marks": 2, "difficulty": "medium", "source": 2}]}'
    if "true/false" in prompt:
        return '{"questions": [{"type": "true_false", "question": "The village school has twenty students.", "correct_answer": true, "marks": 1, "difficulty": "medium", "source": 2}]}'
    return '{"questions": [{"type": "descriptive", "question": "Describe the village where Tom lives.", "expected_answer": "small, village life", "marks": 3, "difficulty": "medium", "evaluation_rubric": [{"criterion": "mention village", "marks": 2}, {"criterion": "detail", "marks": 1}], "source": 1}]}'
llm_mod.invoke_llm = fake_invoke
# services imported invoke_llm by name — patch both references
test_generation_service.invoke_llm = fake_invoke
test_service.invoke_llm = fake_invoke

teacher = {"_id": ObjectId(), "name": "T", "email": "t@x.com", "role": "teacher", "is_active": True}
student = {"_id": ObjectId(), "name": "S", "email": "s@x.com", "role": "student", "is_active": True}
users.extend([teacher, student])
t_tok = create_access_token(str(teacher["_id"]), "teacher")
s_tok = create_access_token(str(student["_id"]), "student")

with TestClient(app) as c:
    H = {"Authorization": f"Bearer {t_tok}"}
    r = c.post("/api/v1/classrooms", headers=H, json={"name": "Class 8 English", "description": ""})
    cid = r.json()["classroom"]["id"]

    # chapter must exist & be ready
    ch_id = str(ObjectId())
    chapters.append({"_id": ObjectId(ch_id), "classroom_id": cid, "teacher_id": str(teacher["_id"]), "title": "Tom's village", "status": "ready"})

    # student cannot generate tests
    r = c.post("/api/v1/teacher/tests/generate", headers={"Authorization": f"Bearer {s_tok}"},
               json={"classroom_id": cid, "title": "Hack", "question_distribution": {"mcq": 1}})
    print("student generate -> 403:", r.status_code == 403)

    # generate test
    r = c.post("/api/v1/teacher/tests/generate", headers=H, json={
        "classroom_id": cid, "chapter_ids": [ch_id], "title": "Tom's Village Test",
        "difficulty": "medium",
        "question_distribution": {"mcq": 1, "true_false": 1, "descriptive": 1},
        "duration_minutes": 20, "passing_percentage": 50,
    })
    body = r.json()
    print("generate 201:", r.status_code == 201, body["test"]["status"] == "draft", "warnings mention dup:", any("duplicate" in w for w in body["warnings"]))
    test_id = body["test"]["id"]

    # get test with questions (has correct answers for teacher)
    r = c.get(f"/api/v1/teacher/tests/{test_id}", headers=H)
    qs = r.json()["questions"]
    print("test detail:", r.status_code == 200, len(qs) == 3, "answers visible:", all(q["correct_answer"] is not None for q in qs))
    print("totals:", r.json()["test"]["total_questions"] == 3, r.json()["test"]["total_marks"] == 6)

    # duplicate question was dropped (both MCQs had same question text)
    mcq_count = sum(1 for q in qs if q["type"] == "mcq")
    print("dedupe worked:", mcq_count == 1)

    # edit question
    qid = qs[0]["id"]
    r = c.patch(f"/api/v1/teacher/tests/{test_id}/questions/{qid}", headers=H,
                json={"question": "Where exactly does Tom live?", "correct_answer": "small village", "options": ["city", "small village", "farm", "boat"]})
    print("edit question:", r.status_code == 200, r.json()["question"]["approved"] is True)

    # invalid edit: answer not in options
    r = c.patch(f"/api/v1/teacher/tests/{test_id}/questions/{qid}", headers=H,
                json={"correct_answer": "castle"})
    print("invalid answer edit -> 400:", r.status_code == 400)

    # approve + regenerate
    r = c.post(f"/api/v1/teacher/tests/{test_id}/questions/{qid}/approve", headers=H)
    print("approve:", r.status_code == 200)

    # publish
    r = c.post(f"/api/v1/teacher/tests/{test_id}/publish", headers=H, json={"duration_minutes": 25})
    print("publish:", r.status_code == 200, r.json()["test"]["status"] == "published", r.json()["test"]["duration_minutes"] == 25)

    # double publish blocked
    r = c.post(f"/api/v1/teacher/tests/{test_id}/publish", headers=H, json={})
    print("re-publish blocked:", r.status_code == 400)

    # teacher list
    r = c.get("/api/v1/teacher/tests", headers=H)
    print("list tests:", len(r.json()["tests"]) == 1)

    # delete
    r = c.delete(f"/api/v1/teacher/tests/{test_id}", headers=H)
    print("delete:", r.status_code == 200, len(questions) == 0)
