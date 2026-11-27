import asyncio, io
from bson import ObjectId
from fastapi.testclient import TestClient
from app.main import app
from app.core import dependencies
from app.database import mongodb
from app.services import auth_service, classroom_service, chapter_service, cloudinary_service
from app.core import embeddings
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
    async def insert_many(self, docs):
        for d in docs: await self.insert_one(d)
    async def delete_many(self, q):
        self.store[:] = [d for d in self.store if not self._match(d, q)]
    async def update_one(self, q, u):
        for d in self.store:
            if self._match(d, q):
                for k, v in u.get("$set", {}).items(): d[k] = v
                return
    async def find_one(self, q):
        return next((d for d in self.store if self._match(d, q)), None)
    async def count_documents(self, q):
        return sum(1 for d in self.store if self._match(d, q))
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

users, profiles, classrooms, enrollments, chapters = [], [], [], [], []
fake = type("DB", (), {})()
fake.users = FakeCollection(users); fake.teacher_profiles = FakeCollection(profiles, ["user_id"])
fake.classrooms = FakeCollection(classrooms, ["join_code"]); fake.enrollments = FakeCollection(enrollments)
fake.chapters = FakeCollection(chapters)
fake.get_db = lambda: fake
for mod in (auth_service, classroom_service, chapter_service, dependencies):
    mod.db = fake
async def fake_connect(self):
    mongodb.Database.db = fake
async def fake_disconnect(self):
    self.db = None
mongodb.Database.connect = fake_connect
mongodb.Database.disconnect = fake_disconnect

cloudinary_service.upload_pdf = lambda b, fn, cid: {"public_id": f"english-teacher/classrooms/{cid}/test", "secure_url": "http://fake/pdf", "bytes": len(b)}
async def fake_embeddings(texts):
    return [[0.1, 0.2, 0.3] for _ in texts]
async def fake_embeddings_meta(texts):
    return [[0.1, 0.2, 0.3] for _ in texts], []
embeddings.create_embeddings = fake_embeddings
chapter_service.create_embeddings = fake_embeddings
embeddings.create_embeddings_with_metadata = fake_embeddings_meta
chapter_service.create_embeddings_with_metadata = fake_embeddings_meta
async def fake_embed_query(text):
    return [0.1, 0.2, 0.3]
embeddings.create_embedding_query = fake_embed_query
chapter_service.create_embedding_query = fake_embed_query

# in-memory Qdrant mock
qdrant_points = []
import app.services.qdrant_service as qdrant_service
def fake_upsert(chapter_id, classroom_id, teacher_id, chunks, embeddings, model):
    qdrant_points[:] = [p for p in qdrant_points if p["chapter_id"] != chapter_id]
    for i, (t, v) in enumerate(zip(chunks, embeddings)):
        qdrant_points.append({
            "chapter_id": chapter_id, "classroom_id": classroom_id,
            "chunk_index": i, "text": t, "embedding": v, "embedding_model": model,
        })
    return len(chunks)
qdrant_service.upsert_chunks = fake_upsert
def fake_search(query_vector, classroom_id, top_k=5, chapter_id=None, **kwargs):
    scored = [(sum(a*b for a, b in zip(query_vector, p["embedding"])), p) for p in qdrant_points if p["classroom_id"] == classroom_id]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{"chapter_id": p["chapter_id"], "chunk_index": p["chunk_index"], "text": p["text"], "score": s} for s, p in scored[:top_k]]
qdrant_service.search_classroom = fake_search
chapter_service.extract_pdf_pages_list = lambda b: ["The present simple tense. She walks to school every day. " * 60]
chapter_service.extract_text_from_pdf = lambda b: ("The present simple tense. She walks to school every day. " * 60)

from pypdf import PdfWriter
w = PdfWriter(); w.add_blank_page(width=200, height=200)
buf = io.BytesIO(); w.write(buf); PDF = buf.getvalue()

# stub the PDF download step inside process_chapter
import httpx as _httpx
class _FakeResponse:
    def raise_for_status(self): pass
    content = PDF
async def _fake_get(self, url):
    if "nowhere" in str(url):
        raise RuntimeError("download failed")
    return _FakeResponse()
_httpx.AsyncClient.get = _fake_get

teacher = {"_id": ObjectId(), "name": "T", "email": "t@x.com", "role": "teacher", "is_active": True}
student = {"_id": ObjectId(), "name": "S", "email": "s@x.com", "role": "student", "is_active": True}
other = {"_id": ObjectId(), "name": "O", "email": "o@x.com", "role": "teacher", "is_active": True}
users.extend([teacher, student, other])
t_tok = create_access_token(str(teacher["_id"]), "teacher")
s_tok = create_access_token(str(student["_id"]), "student")
o_tok = create_access_token(str(other["_id"]), "teacher")

import app.api.v1.endpoints.chapters as chapters_ep
chapters_ep.settings.CELERY_ENABLED = False
dispatched = []
import threading

def fake_run(cid):
    dispatched.append(cid)
    t = threading.Thread(target=lambda: asyncio.run(chapter_service.process_chapter(cid)))
    t.start()
    t.join()
chapters_ep._dispatch_processing = fake_run

with TestClient(app) as c:
    H = {"Authorization": f"Bearer {t_tok}"}
    r = c.post("/api/v1/classrooms", headers=H, json={"name": "Class 8 English", "description": ""})
    cid = r.json()["classroom"]["id"]; code = r.json()["classroom"]["join_code"]

    r = c.get(f"/api/v1/student/classrooms/{cid}/chapters", headers={"Authorization": f"Bearer {s_tok}"})
    print("unenrolled student -> 403:", r.status_code == 403)
    r = c.post(f"/api/v1/student/classrooms/{cid}/search", headers={"Authorization": f"Bearer {s_tok}"}, json={"query": "tense", "classroom_id": cid})
    print("unenrolled student search -> 403:", r.status_code == 403)
    r = c.post(f"/api/v1/classrooms/{cid}/chapters", headers={"Authorization": f"Bearer {o_tok}"}, data={"title": "X"}, files={"file": ("a.pdf", PDF, "application/pdf")})
    print("other teacher upload -> 404:", r.status_code == 404)
    r = c.post(f"/api/v1/classrooms/{cid}/chapters", headers=H, data={"title": "X"}, files={"file": ("a.txt", b"hello", "text/plain")})
    print("non-pdf -> 400:", r.status_code == 400)

    c.post("/api/v1/student/classrooms/join", headers={"Authorization": f"Bearer {s_tok}"}, json={"join_code": code})
    r = c.post(f"/api/v1/classrooms/{cid}/chapters", headers=H, data={"title": "Present Simple"}, files={"file": ("chapter.pdf", PDF, "application/pdf")})
    ch = r.json()["chapter"]
    print("upload 201:", r.status_code == 201, ch["status"], "dispatched:", dispatched == [ch["id"]])

    r = c.get(f"/api/v1/classrooms/{cid}/chapters", headers=H)
    ch2 = r.json()["chapters"][0]
    print("processed -> ready:", ch2["status"] == "ready", "chunks>0:", ch2["chunk_count"] > 0, "error:", ch2["error"])
    print("qdrant points stored:", len(qdrant_points) == ch2["chunk_count"], "embedding size ok:", len(qdrant_points[0]["embedding"]) == 3)

    r = c.get(f"/api/v1/student/classrooms/{cid}/chapters", headers={"Authorization": f"Bearer {s_tok}"})
    print("student sees ready chapter:", r.status_code == 200 and len(r.json()["chapters"]) == 1)

    r = c.post(f"/api/v1/student/classrooms/{cid}/search", headers={"Authorization": f"Bearer {s_tok}"}, json={"query": "present simple tense", "classroom_id": cid})
    res = r.json()["results"]
    print("search ok:", r.status_code == 200, len(res) > 0, res[0]["chapter_title"] == "Present Simple", res[0]["score"] > 0)

    r2 = c.post(f"/api/v1/classrooms/{cid}/chapters", headers=H, data={"title": "Bad"}, files={"file": ("bad.pdf", PDF, "application/pdf")})
    bad_id = r2.json()["chapter"]["id"]
    chapters[-1]["file_url"] = "http://fake/nowhere"
    asyncio.run(chapter_service.process_chapter(bad_id))
    r = c.get(f"/api/v1/classrooms/{cid}/chapters", headers=H)
    bad = next(ch for ch in r.json()["chapters"] if ch["id"] == bad_id)
    print("failed chapter:", bad["status"] == "failed", bool(bad["error"]))
    r = c.get(f"/api/v1/student/classrooms/{cid}/chapters", headers={"Authorization": f"Bearer {s_tok}"})
    print("failed hidden from student:", all(ch["id"] != bad_id for ch in r.json()["chapters"]))
