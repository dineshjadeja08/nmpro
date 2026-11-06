# nammapros.

Independent NammaPros customer website and API foundation with a Phase 2 database-backed booking implementation. No Purple Squad source, credentials or records are included. Pay-at-visit bookings require explicitly configured service coverage, prices and capacity. Production phone authentication is unavailable until a real OTP provider is connected, and online payment is not implemented.

See [Environment setup](docs/ENVIRONMENT_SETUP.md), [Phase 2 implementation](docs/PHASE_02_IMPLEMENTATION.md), [architecture](docs/ARCHITECTURE.md), and [Phase 2 limitations](docs/PHASE_02_KNOWN_LIMITATIONS.md).

## Quick start

1. `npm install --legacy-peer-deps` from the repository root.
2. Create `services/api/.venv` with Python 3.12 and install `pip install -e ".[dev]"` from `services/api`.
3. For PostgreSQL and Redis, start `docker compose -f infrastructure/docker/compose.yml up -d` if Docker is installed; copy `services/api/.env.example` to `.env` and load its variables. Without Docker, omit `DATABASE_URL` for a local SQLite development fallback.
4. In `services/api`, run `python manage.py migrate`, then `python manage.py seed_demo_catalog`, then `python manage.py runserver 127.0.0.1:8000`.
5. From the root, run `npm run dev`; open `http://localhost:3000`.

The demo seed contains service names and descriptions only. No service price, zone, slot, customer or technician record is invented. Never run the seed in production. The booking engine returns no bookable appointments until approved operating data is configured. PostgreSQL/Redis integration remains unverified on this host.
