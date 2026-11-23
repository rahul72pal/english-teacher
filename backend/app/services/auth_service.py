from datetime import datetime, timezone

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.core.security import create_access_token, hash_password, verify_password
from app.database.mongodb import db


def _user_response(user) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "is_active": user["is_active"],
    }


async def register_user(data, role: str):
    database = db.get_db()
    user = {
        "name": data.name.strip(),
        "email": str(data.email).lower().strip(),
        "password_hash": hash_password(data.password),
        "role": role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    try:
        result = await database.users.insert_one(user)
    except DuplicateKeyError:
        return None

    user_id = str(result.inserted_id)
    token = create_access_token(user_id, role)

    return {
        "access_token": token,
        "user": {
            "id": user_id,
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "is_active": user["is_active"],
        },
    }


async def login_user(data):
    database = db.get_db()
    email = str(data.email).lower().strip()

    user = await database.users.find_one({"email": email})
    if not user:
        return None
    if not user["is_active"]:
        return None
    if not verify_password(data.password, user["password_hash"]):
        return None

    token = create_access_token(str(user["_id"]), user["role"])

    return {
        "access_token": token,
        "user": _user_response(user),
    }
