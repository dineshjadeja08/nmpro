# Phase 1 test results — 2026-11-02

## Executed and passed

- Frontend: `npm run typecheck`, `npm run lint`, and `npm test` (5 Vitest/React Testing Library tests: homepage, service cards, problem suggestions, mobile navigation, booking flow and validation).
- Backend: `pytest -q -p no:cacheprovider` (6 tests: health/readiness, catalog, model uniqueness, public write boundary, safe error envelope, production configuration guard); `ruff check .`; `manage.py check`; `manage.py makemigrations --check --dry-run`.
- Production builds: `npm run build` for customer web, plus `next build` for technician, admin and operations placeholders. All four completed.
- Development database: initial Django migrations applied to local SQLite; `seed_demo_catalog` created seven demonstration services with null starting prices.
- HTTP/browser smoke: local API catalog returned seven services; homepage and booking page returned HTTP 200. In the local browser, a service card opened the booking shell, the form advanced through three steps and kept draft address data. Final confirmation stayed disabled. The browser was checked at a narrow viewport.
- Dependency scan after updates: `pip-audit --local` reported no known vulnerabilities in indexed dependencies (the editable local package itself is not on PyPI); `npm audit --omit=dev --audit-level=moderate` reported zero vulnerabilities in production dependencies.

## Findings and unrun checks

- Full `npm audit` reports 14 moderate advisories in transitive `minimatch` copies used by ESLint and related development tooling. `npm audit fix --legacy-peer-deps` reduced the count from 16 to 14; its remaining proposed `--force` change is breaking and was not applied. Production dependency audit is clear.
- Docker was unavailable. PostgreSQL, Redis, and Docker Compose startup were not executed; the successful migration and API tests used SQLite. Redis-backed throttling and Celery worker execution remain unverified.
- Playwright, Lighthouse, Core Web Vitals, automated contrast/accessibility audit, and cross-browser checks were not run. No score or WCAG certification is claimed.
- Production Django system check with temporary non-secret values reported one `security.W021` warning for HSTS preload, which is intentionally disabled pending domain/subdomain policy review. No production service was deployed.
