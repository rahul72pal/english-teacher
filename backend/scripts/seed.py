"""Seed demo teacher & student accounts.

Usage (from the backend folder):
    uv run python scripts/seed.py

Upserts the accounts below into MongoDB (safe to run repeatedly).
Credentials are documented in backend/README.md.
"""

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bson import ObjectId  # noqa: E402
from pymongo import AsyncMongoClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402

# email, name, password, role
SEED_USERS = [
    ("teacher@demo.com", "Demo Teacher", "Teacher@12345", "teacher"),
    ("student@demo.com", "Demo Student", "Student@12345", "student"),
]


async def seed() -> None:
    client = AsyncMongoClient(settings.MONGODB_URL)
    try:
        await client.admin.command("ping")
        db = client[settings.MONGODB_DB]
        await db.users.create_index("email", unique=True)

        for email, name, password, role in SEED_USERS:
            doc = {
                "name": name,
                "email": email,
                "password_hash": hash_password(password),
                "role": role,
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            existing = await db.users.find_one({"email": email})
            if existing:
                doc.pop("created_at")
                await db.users.update_one({"_id": existing["_id"]}, {"$set": doc})
                print(f"updated: {email} ({role})")
            else:
                doc["_id"] = ObjectId()
                await db.users.insert_one(doc)
                print(f"created: {email} ({role})")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(seed())
