# English Teacher — Backend

FastAPI backend for the English Teacher app (Student & Teacher mobile apps).

- **Framework:** FastAPI
- **Python:** 3.12+ (managed with **uv** — no pip needed)
- **Database:** MongoDB (via `pymongo` AsyncMongoClient)
- **Config:** `.env` file loaded by pydantic-settings

> ⚠️ Note: the codebase is mid-migration to MongoDB. Some legacy SQLAlchemy files
> (`app/database.py`, old routers) still exist and conflict with the new
> `app/database/` package — see "Known issue" at the bottom.

## Requirements

- [uv](https://docs.astral.sh/uv/getting-started/installation/): `brew install uv`
- A MongoDB instance running locally (`mongodb://localhost:27017`) or an Atlas cluster

## Setup

```bash
cd backend

# 1. Install dependencies (creates .venv from pyproject.toml + uv.lock)
uv sync

# 2. Create your environment file
cp .env.example .env
# then edit .env: set MONGODB_URL and JWT_SECRET
```

## Start the server

```bash
# Development (auto-reload)
uv run uvicorn app.main:app --reload

# Production
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API is then available at http://localhost:8000

## Teacher & Classroom Management

| Method | Endpoint                           | Permission | Purpose                       |
| ------ | ---------------------------------- | ---------- | ----------------------------- |
| PUT    | `/api/v1/teacher/profile`          | Teacher    | Create/update profile         |
| GET    | `/api/v1/teacher/profile`          | Teacher    | Get profile                   |
| POST   | `/api/v1/classrooms`               | Teacher    | Create classroom              |
| GET    | `/api/v1/classrooms`               | Teacher    | List own classrooms           |
| GET    | `/api/v1/classrooms/{id}/students` | Teacher    | List enrolled students        |
| PATCH  | `/api/v1/classrooms/{id}/status`   | Teacher    | Activate/deactivate classroom |
| POST   | `/api/v1/student/classrooms/join`  | Student    | Join using join code          |
| GET    | `/api/v1/student/classrooms`       | Student    | List joined classrooms        |

Flow: teacher creates a classroom → backend generates a unique 8-character join
code (ambiguous characters 0/O/1/I excluded) → teacher shares the code → student
joins via `POST /api/v1/student/classrooms/join` → enrollment is created. Every
teacher operation filters by both the classroom ID and the authenticated teacher
ID, so one teacher can never access another's classroom.

Collections: `teacher_profiles` (one per teacher), `classrooms` (owner + unique
join code), `enrollments` (classroom ↔ student link, unique per pair).

Swagger test sequence: teacher signup → login → `PUT /teacher/profile` →
`POST /classrooms` (copy the join code) → student signup → login →
`POST /student/classrooms/join` with the code → back as teacher, check
`GET /classrooms/{id}/students`.

- Health check: `GET /health`
- DB check: `GET /ready`

## Chapter Management (Cloudinary + embeddings)

| Method | Endpoint                                    | Permission | Purpose                        |
| ------ | ------------------------------------------- | ---------- | ------------------------------ |
| POST   | `/api/v1/classrooms/{id}/chapters`          | Teacher    | Upload PDF chapter (multipart) |
| GET    | `/api/v1/classrooms/{id}/chapters`          | Teacher    | List chapters + status         |
| POST   | `/api/v1/chapters/{id}/reprocess`           | Teacher    | Retry processing               |
| GET    | `/api/v1/student/classrooms/{id}/chapters`  | Student    | List ready chapters (enrolled) |
| POST   | `/api/v1/student/classrooms/{id}/search`    | Student    | Semantic search inside content |

Pipeline: upload PDF → stored on **Cloudinary** (`resource_type=raw`) → metadata
in the `chapters` collection with status `processing` → **Celery** worker
(`CELERY_BROKER_URL`) downloads the PDF → `pypdf` extracts text → text is split
into overlapping chunks (`CHUNK_SIZE`/`CHUNK_OVERLAP`) → embeddings generated
with **NVIDIA's model via the LangChain integration**
(`langchain_nvidia_ai_endpoints.NVIDIAEmbeddings`, synchronous SDK calls run in
a threadpool — no async HTTP) → chunk texts + vectors stored in **Qdrant**
(`QDRANT_CLUSTER_ENDPOINT`, `QDRANT_API_KEY`, collection `QDRANT_COLLECTION`;
a collection is auto-created with the embedding's dimension) → status `ready`
with the final `chunk_count`. Failures set status `failed` with the failing
stage in the error message (retry via reprocess). Search embeds the query with
the same model and queries Qdrant filtered by `classroom_id`.

Run the worker:

```bash
cd backend
uv run celery -A app.workers.celery_app worker --loglevel=info
```

If `CELERY_ENABLED=false` (or the broker is down) uploads are processed inline.

Required new env keys (see `.env.example`): `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `EMBEDDING_MODEL`
(e.g. `nvidia/nemotron-3.5-embed-1b`), `OPENAI_API_KEY` (NVIDIA API key —
no base URL needed, NVIDIAEmbeddings uses NVIDIA's endpoint directly),
`CHUNK_SIZE`, `CHUNK_OVERLAP`, `QDRANT_CLUSTER_ENDPOINT`, `QDRANT_API_KEY`,
`QDRANT_COLLECTION`, `CELERY_BROKER_URL`, `CELERY_ENABLED`.

A regression test for the whole flow lives in `tests/test_chapters_flow.py`
(run: `uv run python -m tests.test_chapters_flow`).

## AI Tutor (LangChain agent)

`POST /api/v1/student/classrooms/{classroom_id}/tutor` (teacher + student, both
enrollment/ownership enforced) with:

```json
{ "question": "...", "chapter_id": "optional-chapter-id" }
```

A LangGraph ReAct agent built on any **OpenAI-compatible chat endpoint**
(`LLM_BASE_URL`, `LLM_MODEL_NAME`, `LLM_API_KEY` in `.env`) with one tool:
`search_documents` — semantic search over that classroom's chapters in Qdrant.
When `chapter_id` is supplied the search (and citations) are scoped to that
chapter only — the agent stays chapter-specific. The system prompt forces tool
use and grounds answers in the retrieved passages. Responses include `answer`
plus `citations` (top passages with chapter titles and scores).

Required env keys: `LLM_BASE_URL` (e.g. `https://integrate.api.nvidia.com/v1` for
NVIDIA, or `https://api.openai.com/v1`), `LLM_MODEL_NAME` (a chat model the
provider actually serves, e.g. `meta/llama-3.1-405b-instruct` on NVIDIA —
an embedding model name will 404), `LLM_API_KEY`. On provider errors the
endpoint returns 502 with the model/base URL named, and the worker/API log
shows the same detail.

## Seed accounts (demo)

Create the demo accounts with the seeder:

```bash
cd backend
uv run python scripts/seed.py
```

Safe to run repeatedly — it upserts the accounts by email.

| Role    | Email             | Password      |
| ------- | ----------------- | ------------- |
| Teacher | teacher@demo.com  | Teacher@12345 |
| Student | student@demo.com  | Student@12345 |

## Login request format

The login endpoint requires a JSON body with **Content-Type: application/json**:

```json
{ "email": "teacher@demo.com", "password": "Teacher@12345" }
```

A `422 Unprocessable Content` on `/api/v1/auth/login` means the request body
failed validation — usually a missing `Content-Type: application/json` header,
invalid email syntax, or a missing/empty `password` field. The response body
contains the exact validation error.

## Authentication (JWT + Argon2)

| Method | Endpoint                      | Purpose                |
| ------ | ----------------------------- | ---------------------- |
| POST   | `/api/v1/auth/teacher/signup` | Teacher registration   |
| POST   | `/api/v1/auth/student/signup` | Student registration   |
| POST   | `/api/v1/auth/login`          | Common login           |
| GET    | `/api/v1/auth/me`             | Current logged-in user |

- Passwords are stored as **Argon2** hashes (never plaintext), JWT carries `sub` + `role`.
- Role is assigned by the backend based on the signup endpoint — never accepted from the request body.
- A unique index on `users.email` is created at startup.
- Protected endpoints use `Depends(require_roles("teacher"))` / `Depends(require_roles("student"))`.

Signup / login request body:

```json
{ "name": "Rahul Sharma", "email": "rahul@example.com", "password": "Rahul@12345" }
```

Response:

```json
{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": { "id": "673f...", "name": "Rahul Sharma", "email": "rahul@example.com", "role": "teacher", "is_active": true }
}
```

> ⚠️ Make sure `JWT_SECRET` in `.env` is at least 32 bytes (a long random string) —
> PyJWT warns and shorter keys are insecure.

- Interactive docs: http://localhost:8000/docs
- Alternative docs: http://localhost:8000/redoc

## Useful commands

```bash
uv add <package>        # add a dependency (updates pyproject.toml + uv.lock)
uv remove <package>     # remove a dependency
uv sync                 # reinstall/sync exactly what uv.lock specifies
uv run python ...       # run any command inside the project venv
```

## Project structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app + lifespan + /api/v1 router
│   ├── core/
│   │   ├── config.py              # Settings from .env
│   │   ├── security.py            # Argon2 hashing + JWT creation
│   │   └── dependencies.py        # get_current_user, require_roles
│   ├── database/
│   │   └── mongodb.py             # MongoDB client wrapper + email index
│   ├── schemas/
│   │   └── auth.py                # Signup/Login/Auth schemas
│   ├── services/
│   │   └── auth_service.py        # register_user, login_user
│   ├── api/v1/
│   │   ├── router.py              # /api/v1 aggregation
│   │   └── endpoints/auth.py      # auth endpoints
│   └── legacy/                    # (legacy) old SQLAlchemy files, unused
├── .env                           # environment variables (not committed)
├── .env.example                   # template
├── pyproject.toml                 # dependencies (uv-managed)
└── uv.lock                        # lockfile (uv-managed)
```

## Known issue

The legacy SQLAlchemy files were superseded by the MongoDB setup, but
`app/database.py` and the `app/database/` package cannot coexist — importing
`app.database.mongodb` currently fails until the legacy files are removed or
moved. The API endpoints for students/teachers/lessons are likewise still the
old SQLAlchemy versions and are not yet wired into `main.py`.
