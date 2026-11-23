import secrets
from datetime import datetime, timezone

from bson import ObjectId

from app.database.mongodb import db

JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous 0/O/1/I


def generate_join_code(length: int = 8) -> str:
    return "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(length))


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------
# TEACHER PROFILE
# --------------------------------


async def upsert_teacher_profile(user_id: str, data) -> dict | None:
    database = db.get_db()
    now = _now()

    profile = await database.teacher_profiles.find_one_and_update(
        {"user_id": user_id},
        {
            "$set": {
                "bio": data.bio,
                "institution": data.institution,
                "subjects": data.subjects,
                "updated_at": now,
            },
            "$setOnInsert": {
                "user_id": user_id,
                "created_at": now,
            },
        },
        upsert=True,
        return_document=True,  # resolved to ReturnDocument.AFTER by the driver
    )
    return profile


async def get_teacher_profile(user_id: str) -> dict | None:
    database = db.get_db()
    return await database.teacher_profiles.find_one({"user_id": user_id})


# --------------------------------
# CLASSROOMS (TEACHER)
# --------------------------------


async def create_classroom(user_id: str, data) -> dict:
    database = db.get_db()

    # Retry on the (extremely unlikely) join-code collision
    for _ in range(5):
        join_code = generate_join_code()
        existing = await database.classrooms.find_one({"join_code": join_code})
        if existing is None:
            break
    else:
        raise RuntimeError("Could not generate a unique join code")

    doc = {
        "teacher_id": user_id,
        "name": data.name.strip(),
        "description": data.description.strip(),
        "join_code": join_code,
        "is_active": True,
        "created_at": _now(),
        "updated_at": _now(),
    }
    result = await database.classrooms.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


async def list_teacher_classrooms(user_id: str) -> list[dict]:
    database = db.get_db()

    classrooms = await database.classrooms.find(
        {"teacher_id": user_id}, sort=[("created_at", -1)]
    ).to_list(length=1000)

    result = []
    for classroom in classrooms:
        classroom_id = str(classroom["_id"])
        count = await database.enrollments.count_documents(
            {"classroom_id": classroom_id, "status": "active"}
        )
        result.append(
            {
                "id": classroom_id,
                "name": classroom["name"],
                "description": classroom["description"],
                "join_code": classroom["join_code"],
                "is_active": classroom["is_active"],
                "student_count": count,
            }
        )
    return result


async def list_classroom_students(user_id: str, classroom_id: str) -> list[dict] | None:
    database = db.get_db()

    if not ObjectId.is_valid(classroom_id):
        return None

    # Ownership check: the classroom must belong to the requesting teacher
    classroom = await database.classrooms.find_one(
        {"_id": ObjectId(classroom_id), "teacher_id": user_id}
    )
    if classroom is None:
        return None

    enrollments = await database.enrollments.find(
        {"classroom_id": classroom_id, "status": "active"},
        sort=[("joined_at", -1)],
    ).to_list(length=1000)

    student_ids = [ObjectId(e["student_id"]) for e in enrollments]
    students = await database.users.find({"_id": {"$in": student_ids}}, {"name": 1, "email": 1}).to_list(length=1000)
    student_map = {str(s["_id"]): s for s in students}

    return [
        {
            "id": str(enrollment["_id"]),
            "student_id": enrollment["student_id"],
            "name": student_map.get(enrollment["student_id"], {}).get("name", "Unknown"),
            "email": student_map.get(enrollment["student_id"], {}).get("email", "Unknown"),
            "joined_at": enrollment["joined_at"],
        }
        for enrollment in enrollments
    ]


async def set_classroom_status(user_id: str, classroom_id: str, is_active: bool) -> dict | None:
    database = db.get_db()

    if not ObjectId.is_valid(classroom_id):
        return None

    return await database.classrooms.find_one_and_update(
        {"_id": ObjectId(classroom_id), "teacher_id": user_id},
        {"$set": {"is_active": is_active, "updated_at": _now()}},
        return_document=True,
    )


# --------------------------------
# ENROLLMENT (STUDENT)
# --------------------------------


async def join_classroom(user_id: str, join_code: str) -> dict | None:
    """Returns ('joined'|'already', classroom) or None when code is invalid."""
    database = db.get_db()

    code = join_code.upper().strip()
    classroom = await database.classrooms.find_one({"join_code": code})
    if classroom is None or not classroom["is_active"]:
        return None

    classroom_id = str(classroom["_id"])

    existing = await database.enrollments.find_one(
        {"classroom_id": classroom_id, "student_id": user_id}
    )
    if existing:
        return {"status": "already", "classroom": classroom}

    enrollment = {
        "classroom_id": classroom_id,
        "teacher_id": classroom["teacher_id"],
        "student_id": user_id,
        "status": "active",
        "joined_at": _now(),
    }
    await database.enrollments.insert_one(enrollment)
    return {"status": "joined", "classroom": classroom}


async def list_student_classrooms(user_id: str) -> list[dict]:
    database = db.get_db()

    enrollments = await database.enrollments.find(
        {"student_id": user_id, "status": "active"}
    ).to_list(length=1000)

    classroom_ids = [
        ObjectId(item["classroom_id"]) for item in enrollments if ObjectId.is_valid(item["classroom_id"])
    ]
    classrooms = await database.classrooms.find(
        {"_id": {"$in": classroom_ids}, "is_active": True}
    ).to_list(length=1000)

    teacher_ids = list({classroom["teacher_id"] for classroom in classrooms})
    teachers = await database.users.find(
        {
            "_id": {"$in": [ObjectId(item) for item in teacher_ids if ObjectId.is_valid(item)]},
            "role": "teacher",
        },
        {"name": 1},
    ).to_list(length=1000)
    teacher_map = {str(teacher["_id"]): teacher["name"] for teacher in teachers}

    return [
        {
            "id": str(classroom["_id"]),
            "name": classroom["name"],
            "description": classroom["description"],
            "teacher_name": teacher_map.get(classroom["teacher_id"], "Unknown"),
        }
        for classroom in classrooms
    ]
