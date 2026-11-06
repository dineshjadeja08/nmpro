# Local environment

Verified host: Windows, Node 22.23.3, npm 10.9.9, Python 3.12.4. Docker command unavailable. Next 16.4.3 and Django 5.2.x are compatible with those runtimes. npm uses workspaces and a root lockfile.

Copy `apps/web/.env.example` to `.env.local`. `API_BASE_URL` is server-only and defaults to `http://127.0.0.1:8000`. `NEXT_PUBLIC_SITE_URL` is for metadata, defaulting to localhost. No provider secret belongs in a `NEXT_PUBLIC_` variable. Copy `services/api/.env.example` to `.env` and load variables in your shell; Django does not auto-load `.env` files.

With Docker installed, run `docker compose -f infrastructure/docker/compose.yml up -d` from repo root, then set `DATABASE_URL` and `REDIS_URL` from the example. For a temporary local-only fallback, leave `DATABASE_URL` unset and Django uses ignored `db.sqlite3`. Tests use in-memory SQLite. Production rejects missing PostgreSQL, Redis, secret, host or CORS configuration.

Commands: `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run audit`; backend from `services/api`: `.venv/Scripts/python manage.py migrate`, `.venv/Scripts/python manage.py seed_demo_catalog`, `.venv/Scripts/python manage.py runserver`, `.venv/Scripts/python -m pytest`, `.venv/Scripts/ruff check .`. On PowerShell use `.\.venv\Scripts\python.exe`.
