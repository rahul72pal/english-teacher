"""Regression test for the AI tutor endpoint (stubbed LLM agent + fake DB)."""
import asyncio
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.core import dependencies
from app.database import mongodb
from app.services import auth_service
from app.core.security import create_access_token
from app.services import ai_tutor_service


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
    def find(self, q, projection=None, sort=None):
        return Cursor([d for d in self.store if self._match(d, q)], sort)

users, profiles, classrooms, enrollments, chapters = [], [], [], [], []
fake = type("DB", (), {})()
fake.users = FakeCollection(users); fake.teacher_profiles = FakeCollection(profiles, ["user_id"])
fake.classrooms = FakeCollection(classrooms, ["join_code"]); fake.enrollments = FakeCollection(enrollments)
fake.chapters = FakeCollection(chapters)
fake.get_db = lambda: fake
for mod in (auth_service, dependencies):
    mod.db = fake
async def fake_connect(self):
    mongodb.Database.db = fake
async def fake_disconnect(self):
    mongodb.Database.db = None
mongodb.Database.connect = fake_connect
mongodb.Database.disconnect = fake_disconnect

teacher = {"_id": ObjectId(), "name": "T", "email": "t@x.com", "role": "teacher", "is_active": True}
student = {"_id": ObjectId(), "name": "S", "email": "s@x.com", "role": "student", "is_active": True}
users.extend([teacher, student])
t_tok = create_access_token(str(teacher["_id"]), "teacher")
s_tok = create_access_token(str(student["_id"]), "student")

# stub the agent: verify it receives the search tool and returns a grounded answer
calls = []
class FakeAgent:
    async def ainvoke(self, payload):
        calls.append(payload)
        return {"messages": [type("M", (), {"content": "The present simple is used for daily habits."})()]}

search_tool_built = []
import app.services.ai_tutor_service as ats
async def fake_search_chunks(query, classroom_id, top_k=5, chapter_id=None):
    search_tool_built.append((classroom_id, chapter_id))
    return [{"chapter_id": "c1", "chapter_title": "Ch", "chunk_index": 0, "score": 0.9, "text": "t"}]
ats.search_classroom_chunks = fake_search_chunks

def fake_agent(classroom_id, chapter_id=None, chapter_title=None):
    search_tool_built.append(("agent", classroom_id, chapter_id, chapter_title))
    return FakeAgent()

ai_tutor_service._agent = fake_agent

with TestClient(app) as c:
    r = c.post("/api/v1/classrooms", headers={"Authorization": f"Bearer {t_tok}"}, json={"name": "C8", "description": ""})
    cid = r.json()["classroom"]["id"]; code = r.json()["classroom"]["join_code"]

    r = c.post(f"/api/v1/student/classrooms/{cid}/tutor", headers={"Authorization": f"Bearer {s_tok}"}, json={"question": "What is present simple?"})
    print("unenrolled -> 403:", r.status_code == 403)

    c.post("/api/v1/student/classrooms/join", headers={"Authorization": f"Bearer {s_tok}"}, json={"join_code": code})
    r = c.post(f"/api/v1/student/classrooms/{cid}/tutor", headers={"Authorization": f"Bearer {s_tok}"}, json={"question": "What is present simple?"})
    ok = r.status_code == 200 and "present simple" in r.json()["answer"].lower()
    print("tutor 200 + answer:", ok, "citations:", len(r.json()["citations"]) == 1, "agent built for classroom:", ("agent", cid, None, None) in search_tool_built)

    r = c.post(f"/api/v1/student/classrooms/{cid}/tutor", headers={"Authorization": f"Bearer {t_tok}"}, json={"question": "hi"})
    print("teacher also allowed -> 200:", r.status_code == 200)

    # chapter-specific question: chapter validated against classroom, scoped tool
    fake_ch = ObjectId()
    chapters.append({"_id": fake_ch, "classroom_id": cid, "teacher_id": str(teacher["_id"]), "title": "T", "status": "ready"})
    other_cid = str(ObjectId())
    r = c.post(f"/api/v1/student/classrooms/{cid}/tutor", headers={"Authorization": f"Bearer {s_tok}"}, json={"question": "q", "chapter_id": str(fake_ch)})
    print("chapter-scoped 200:", r.status_code == 200, "tool scoped to chapter with title:", ("agent", cid, str(fake_ch), "T") in search_tool_built)
    r = c.post(f"/api/v1/student/classrooms/{cid}/tutor", headers={"Authorization": f"Bearer {s_tok}"}, json={"question": "q", "chapter_id": str(ObjectId())})
    print("foreign chapter -> 404:", r.status_code == 404)
    other = {"_id": ObjectId(), "name": "O", "email": "o@x.com", "role": "teacher", "is_active": True}
    users.append(other)
    o_tok = create_access_token(str(other["_id"]), "teacher")
    r = c.post(f"/api/v1/student/classrooms/{cid}/tutor", headers={"Authorization": f"Bearer {o_tok}"}, json={"question": "hi"})
    print("other teacher -> 404:", r.status_code == 404)
