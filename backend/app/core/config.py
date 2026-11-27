from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "English Teacher API"
    APP_ENV: str = "development"
    DEBUG: bool = True

    MONGODB_URL: str
    MONGODB_DB: str = "english_teacher"

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    REDIS_URL: str = "redis://localhost:6379/0"

    GEMINI_API_KEY: str = ""

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_BUCKET_NAME: str = ""
    AWS_REGION: str = "ap-south-1"

    # Cloudinary (PDF storage)
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # OpenAI-compatible embedding model (base_url, key, model from env)
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_API_KEY: str = ""
    NVIDIA_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # OpenAI-compatible chat LLM for the AI tutor agent
    LLM_BASE_URL: str = ""
    LLM_MODEL_NAME: str = ""
    LLM_API_KEY: str = ""

    # Chapter processing
    CHUNK_SIZE: int = 800
    CHUNK_OVERLAP: int = 100

    # Qdrant (vector storage for chapter embeddings)
    QDRANT_CLUSTER_ENDPOINT: str = ""
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION: str = "english_teacher_chunks"

    # Semantic Caching (Qdrant)
    SEMANTIC_CACHE_COLLECTION: str = "english_teacher_semantic_cache"
    SEMANTIC_CACHE_ENABLED: bool = True
    SEMANTIC_CACHE_THRESHOLD: float = 0.85
    SEMANTIC_CACHE_TTL_SECONDS: int = 86400  # 24 hours

    # Celery worker (PDF processing)
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_ENABLED: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()