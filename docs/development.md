# Development

## Prerequisites

- Node.js 20+
- Python 3.12+ (3.14 OK if deps resolve)
- PostgreSQL 16 (optional locally; SQLite for smoke tests)

## Backend

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# Linux/macOS
# source .venv/bin/activate

pip install -r requirements.txt
copy ..\.env.example .env   # or cp
# set DATABASE_URL / SECRET_KEY

alembic upgrade head
python -m app.cli create-admin --email admin@example.com --password 'ChangeMe!123'
python -m app.cli seed
uvicorn app.main:app --reload --port 8000
```

## Frontend

```bash
cd frontend
npm install
# create .env with VITE_API_URL=http://localhost:8000
npm run dev
```

Open http://localhost:5173 — login with the admin you created.

## Tests

```bash
cd backend
pytest -q
cd ../frontend
npm run test   # if configured
```

## i18n key parity

Ensure every key in `en/translation.json` exists in `ar/translation.json` (CI/script under `scripts/`).

## Font

UI uses bundled **Qamra** (`frontend/src/assets/fonts/Qamra.ttf`), copied from `خط قمرة.ttf` in the project root.
