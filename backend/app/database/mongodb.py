import asyncio
import logging

from pymongo import AsyncMongoClient
from app.core.config import settings

logger = logging.getLogger(__name__)


class Database:

    client: AsyncMongoClient = None
    db = None
    _loop = None  # event loop the client was created on

    @classmethod
    async def connect(cls):
        cls.client = AsyncMongoClient(settings.MONGODB_URL)

        await cls.client.admin.command("ping")

        cls.db = cls.client[settings.MONGODB_DB]
        cls._loop = asyncio.get_running_loop()

        # Users
        await cls.db.users.create_index("email", unique=True)

        # One teacher profile per user
        await cls.db.teacher_profiles.create_index("user_id", unique=True)

        # Unique classroom join codes
        await cls.db.classrooms.create_index("join_code", unique=True)

        # Find classrooms owned by a teacher
        await cls.db.classrooms.create_index([("teacher_id", 1), ("created_at", -1)])

        # Prevent duplicate student enrollment in the same classroom
        await cls.db.enrollments.create_index(
            [("classroom_id", 1), ("student_id", 1)], unique=True
        )

        # Find a student's classrooms
        await cls.db.enrollments.create_index([("student_id", 1), ("status", 1)])

        # Find students in a teacher's classroom
        await cls.db.enrollments.create_index(
            [("teacher_id", 1), ("classroom_id", 1), ("status", 1)]
        )

        # Tests module
        await cls.db.tests.create_index([("teacher_id", 1), ("created_at", -1)])
        await cls.db.tests.create_index([("classroom_id", 1), ("status", 1)])
        await cls.db.test_questions.create_index("test_id")
        await cls.db.test_attempts.create_index([("test_id", 1), ("student_id", 1)])
        await cls.db.test_answers.create_index("attempt_id")
        await cls.db.test_results.create_index(
            [("test_id", 1), ("percentage", -1)]
        )  # leaderboard queries

        logger.info("MongoDB connected (loop=%s)", cls._loop)

    @classmethod
    async def disconnect(cls):
        if cls.client:
            await cls.client.close()
            logger.info("MongoDB disconnected")
        cls.client = None
        cls.db = None
        cls._loop = None

    @classmethod
    async def ensure_connected(cls):
        """Guarantee a client usable on the CURRENT event loop.

        AsyncMongoClient binds itself to the loop it was created on. Celery
        tasks each get a fresh loop via asyncio.run(), so a client from a
        previous loop must be discarded and reconnected.
        """
        current_loop = asyncio.get_running_loop()
        if cls.client is not None and cls._loop is current_loop:
            return  # healthy, same loop

        if cls.client is not None:
            logger.info("Mongo client bound to a stale event loop - reconnecting")
            try:
                await cls.disconnect()
            except Exception as exc:
                logger.warning("Stale Mongo client close failed (ignored): %s", exc)
            cls.client = None
            cls.db = None
            cls._loop = None

        await cls.connect()

    @classmethod
    def get_db(cls):
        if cls.db is None:
            raise RuntimeError("Database is not initialized")

        return cls.db


db = Database()
