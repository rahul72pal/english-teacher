import asyncio

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "english-teacher",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_BROKER_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
)


from app.database.mongodb import db as mongo_db


@celery_app.task(name="chapters.process")
def process_chapter_task(chapter_id: str) -> dict:
    from app.services.chapter_service import process_chapter

    async def run():
        # reconnect if the previous task's client is bound to a stale loop
        await mongo_db.ensure_connected()
        await process_chapter(chapter_id)

    asyncio.run(run())
    return {"chapter_id": chapter_id, "status": "done"}
