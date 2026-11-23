from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import settings
from app.database.mongodb import db
from app.services.qdrant_service import ensure_payload_indexes


@asynccontextmanager
async def lifespan(app: FastAPI):

    # Application startup
    await db.connect()

    yield

    # Application shutdown
    await db.disconnect()


app = FastAPI(
    title=settings.APP_NAME,
    description="AI Powered English Learning Platform",
    version="1.0.0",
    lifespan=lifespan
)


app.include_router(api_router)


@app.get("/")
async def root():
    return {
        "success": True,
        "message": "English Teacher API is running"
    }


@app.get("/health")
async def health():
    ensure_payload_indexes()
    return {
        "success": True,
        "status": "healthy"
    }


@app.get("/ready")
async def ready():
    await db.client.admin.command("ping")

    return {
        "success": True,
        "database": "connected"
    }