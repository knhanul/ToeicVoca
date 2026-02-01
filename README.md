# ToeicVoca (/voca)

## Backend (FastAPI)

- Base path: `/voca` (FastAPI `root_path`)
- API prefix: `/api`
- Example endpoint: `GET /voca/api/health`

### Run (local)

1. Create venv and install deps

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend/requirements.txt
```

2. Start API server on port 4000

```bash
uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload
```

### Environment

Backend reads `.env` if present (optional). Default `database_url` is set in `backend/app/settings.py`.

## Frontend (React + Vite)

- Vite base: `/voca/`
- React Router basename: `/voca`
- Dev proxy: `/voca/api` -> `http://localhost:4000/api`

### Run (local)

```bash
cd frontend
npm install
npm run dev
```

## Nginx (server)

Example config is in `infra/nginx-voca.conf`.

- `/voca/` serves frontend build from `/srv/apps/ToeicVoca/frontend/dist`
- `/voca/api` proxies to `http://localhost:4000`
- `/voca/uploads/` serves files from `/srv/apps/ToeicVoca/backend/uploads/`
