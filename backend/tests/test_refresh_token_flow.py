"""Regression test for JWT Access & Refresh Token lifecycle."""
import asyncio
from datetime import datetime, timezone
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.database import mongodb
from app.core.security import create_access_token, create_refresh_token


class FakeCollection:
    def __init__(self, store):
        self.store = store

    async def insert_one(self, doc):
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = ObjectId()
        self.store.append(d)
        class R:
            inserted_id = d["_id"]
        return R()

    async def find_one(self, q):
        for d in self.store:
            match = True
            for k, v in q.items():
                if k == "_id":
                    if str(d.get("_id")) != str(v) and d.get("_id") != v:
                        match = False
                        break
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                return dict(d)
        return None


class FakeDB:
    def __init__(self):
        self.users = FakeCollection([])


def run_tests():
    fake_db = FakeDB()
    mongodb.db.get_db = lambda: fake_db

    c = TestClient(app)

    # 1. Teacher Signup -> returns access_token and refresh_token
    r = c.post(
        "/api/v1/auth/teacher/signup",
        json={"name": "Teacher Alice", "email": "alice@school.com", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["role"] == "teacher"
    t_access = data["access_token"]
    t_refresh = data["refresh_token"]

    # 2. Student Signup -> returns access_token and refresh_token
    r = c.post(
        "/api/v1/auth/student/signup",
        json={"name": "Student Bob", "email": "bob@school.com", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["role"] == "student"
    s_access = data["access_token"]
    s_refresh = data["refresh_token"]

    # 3. Access /auth/me with access token -> 200
    r = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {t_access}"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "alice@school.com"

    r = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {s_access}"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "bob@school.com"

    # 4. Try to access /auth/me with refresh token directly -> rejected with 401
    r = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {t_refresh}"})
    assert r.status_code == 401, f"Expected 401 when using refresh token as bearer, got {r.status_code}"

    # 5. Refresh token endpoint -> yields new access and refresh tokens
    r = c.post("/api/v1/auth/refresh", json={"refresh_token": t_refresh})
    assert r.status_code == 200, r.text
    refreshed_data = r.json()
    assert "access_token" in refreshed_data
    assert "refresh_token" in refreshed_data
    new_t_access = refreshed_data["access_token"]
    new_t_refresh = refreshed_data["refresh_token"]

    # 6. Access /auth/me with newly generated access token -> 200
    r = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_t_access}"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "alice@school.com"

    # 7. Student refresh token endpoint
    r = c.post("/api/v1/auth/refresh", json={"refresh_token": s_refresh})
    assert r.status_code == 200, r.text
    new_s_access = r.json()["access_token"]

    r = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_s_access}"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "bob@school.com"

    # 8. Invalid refresh token -> 401
    r = c.post("/api/v1/auth/refresh", json={"refresh_token": "invalid_fake_token"})
    assert r.status_code == 401

    # 9. Access token used as refresh token -> 401
    r = c.post("/api/v1/auth/refresh", json={"refresh_token": t_access})
    assert r.status_code == 401

    # 10. Login endpoint returns refresh_token as well
    r = c.post(
        "/api/v1/auth/login",
        json={"email": "alice@school.com", "password": "password123"},
    )
    assert r.status_code == 200, r.text
    login_data = r.json()
    assert "access_token" in login_data
    assert "refresh_token" in login_data

    print("ALL REFRESH TOKEN TESTS PASSED!")


if __name__ == "__main__":
    run_tests()
