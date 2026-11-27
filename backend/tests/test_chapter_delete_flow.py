"""Regression test for teacher-only chapter deletion + Qdrant embedding cleanup (fake DB)."""
from datetime import datetime, timezone
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.core import dependencies
from app.database import mongodb
from app.services import auth_service, chapter_service, cloudinary_service, qdrant_service
from app.core.security import create_access_token


class Cursor:
    def __init__(self, docs, sort=None):
        self._docs = list(docs); self._sort = sort or []
    async def to_list(self, length=None):
        for key, d in self._sort:
            self._docs.sort(key=lambda x: x.get(key) or "", reverse=d == -1)
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
        for i, d in enumerate(self.store):
            if self._match(d, q):
                self.store.pop(i)
                return type("D", (), {"deleted_count": 1})()
        return type("D", (), {"deleted_count": 0})()
    def find(self, q, projection=None, sort=None):
        return Cursor([d for d in self.store if self._match(d, q)], sort)

users, classrooms, chapters, enrollments = [], [], [], []
fake = type("DB", (), {})()
fake.users = FakeCollection(users)
fake.classrooms = FakeCollection(classrooms)
fake.chapters = FakeCollection(chapters)
fake.enrollments = FakeCollection(enrollments)
fake.get_db = lambda: fake
for mod in (auth_service, dependencies, chapter_service): mod.db = fake
async def fc(self): mongodb.Database.db = fake
async def fd(self): mongodb.Database.db = None
mongodb.Database.connect = fc
mongodb.Database.disconnect = fd

# record qdrant + cloudinary calls instead of hitting real services
qdrant_calls, cloudinary_calls = [], []
def fake_delete_chunks(chapter_id):
    qdrant_calls.append(chapter_id)
def fake_delete_pdf(public_id):
    cloudinary_calls.append(public_id)
qdrant_service.delete_chapter_chunks = fake_delete_chunks
cloudinary_service.delete_pdf = fake_delete_pdf

checks = []
def check(name, cond):
    checks.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


def main():
    now = datetime.now(timezone.utc)
    teacher_id = str(ObjectId())
    other_teacher = str(ObjectId())
    student_id = str(ObjectId())
    users.extend([
        {"_id": ObjectId(teacher_id), "name": "T1", "email": "t1@x.com", "role": "teacher", "is_active": True},
        {"_id": ObjectId(other_teacher), "name": "T2", "email": "t2@x.com", "role": "teacher", "is_active": True},
        {"_id": ObjectId(student_id), "name": "S", "email": "s@x.com", "role": "student", "is_active": True},
    ])
    classroom_id = str(ObjectId())
    classrooms.append({"_id": ObjectId(classroom_id), "name": "8B", "teacher_id": teacher_id})
    other_classroom = str(ObjectId())
    classrooms.append({"_id": ObjectId(other_classroom), "name": "9A", "teacher_id": other_teacher})

    chapter_id = str(ObjectId())
    chapters.append({
        "_id": ObjectId(chapter_id), "classroom_id": classroom_id, "teacher_id": teacher_id,
        "title": "Past Simple", "file_public_id": "english_teacher/pdfs/past_simple",
        "file_url": "https://cloudinary/x.pdf", "status": "ready", "chunk_count": 12,
        "error": None, "created_at": now, "updated_at": now,
    })

    t_tok = create_access_token(teacher_id, "teacher")
    t2_tok = create_access_token(other_teacher, "teacher")
    s_tok = create_access_token(student_id, "student")

    with TestClient(app) as client:
        url = f"/api/v1/classrooms/{classroom_id}/chapters/{chapter_id}"

        # student cannot delete
        r = client.delete(url, headers={"Authorization": f"Bearer {s_tok}"})
        check("student delete 403", r.status_code == 403)
        check("chapter still there", any(str(c["_id"]) == chapter_id for c in chapters))

        # another teacher cannot delete
        r = client.delete(url, headers={"Authorization": f"Bearer {t2_tok}"})
        check("foreign teacher 404", r.status_code == 404)
        check("chapter still there (2)", any(str(c["_id"]) == chapter_id for c in chapters))

        # wrong classroom id for the owner
        r = client.delete(f"/api/v1/classrooms/{other_classroom}/chapters/{chapter_id}",
                          headers={"Authorization": f"Bearer {t_tok}"})
        check("chapter not in that classroom 404", r.status_code == 404)

        # owner deletes successfully
        r = client.delete(url, headers={"Authorization": f"Bearer {t_tok}"})
        check("owner delete 200", r.status_code == 200)
        check("chapter removed from DB", not any(str(c["_id"]) == chapter_id for c in chapters))
        check("qdrant delete called with chapter_id", qdrant_calls == [chapter_id])
        check("cloudinary delete called", cloudinary_calls == ["english_teacher/pdfs/past_simple"])

        # deleting again → 404
        r = client.delete(url, headers={"Authorization": f"Bearer {t_tok}"})
        check("second delete 404", r.status_code == 404)

        # invalid id
        r = client.delete(f"/api/v1/classrooms/{classroom_id}/chapters/notanid",
                          headers={"Authorization": f"Bearer {t_tok}"})
        check("invalid id 404", r.status_code == 404)

    ok = sum(1 for _, c in checks if c)
    print(f"\n{ok}/{len(checks)} checks passed")
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
