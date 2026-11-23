# English Teacher

Monorepo with a Python backend and a Turborepo React Native frontend (student & teacher apps).

## Structure

```
English-Teacher/
├── backend/                # FastAPI + SQLAlchemy (SQLite)
│   ├── app/
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── models.py       # Student, Teacher, Lesson
│   │   ├── schemas.py
│   │   └── routers/        # students, teachers, lessons
│   └── requirements.txt
└── frontend/               # Turborepo (npm workspaces)
    ├── turbo.json
    ├── apps/
    │   ├── student/        # Expo app for students
    │   └── teacher/        # Expo app for teachers
    └── packages/
        └── shared/         # shared types + API client
```

## Backend

```bash
cd backend
.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000  (docs at /docs)
```

The first run creates `english_teacher.db` automatically.

## Frontend

```bash
cd frontend
npm install
npm run student   # Expo student app
npm run teacher   # Expo teacher app
```

Both apps share one theme + screens (in `packages/shared/src`):

- **AuthScreen** — login/signup toggle, role-specific (Teacher or Student),
  demo-account autofill buttons, error display
- **DashboardScreen** — success page after login: greeting with the user's
  name, list of classrooms. Teachers see a **create classroom** form (join code
  + student count on each card); students see a **join by code** form and each
  card shows the teacher's name
- Sessions persist via AsyncStorage (auto-login on next launch; Log out clears it)

The role is fixed per app (`ROLE` in each `App.tsx`): the student app always
signs up/logs in as a student, the teacher app as a teacher — the backend
still decides the role by endpoint.

For a physical device, set `API_BASE_URL` in `frontend/packages/shared/src/index.ts`
to your machine's LAN IP (Android emulator: `http://10.0.2.2:8000`).

Run the backend first (`uv run uvicorn app.main:app --reload`), then the app:
signup → dashboard, or log in with the seeded demo accounts.
