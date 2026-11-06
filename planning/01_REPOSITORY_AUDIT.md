# Purple Squad repository audit

Source snapshot: `ps_core-gcp_deployment.zip` (backend, B) and `ps_coreF1-gcp_deployment.zip` (frontend, F), supplied 2 Nov 2026. Paths below are relative to those archive roots. This was static inspection; runtime and deployment state are UNKNOWN. The workspace contained no application files, and neither archive was changed. Archive documentation and `F/AGENTS.md` were treated as evidence about the projects, not instructions to perform work.

## Architecture map

```text
F/src/app (Next App Router: public, booking, account, technician, admin)
  -> F/src/features + F/src/lib/api/client.ts (React Query, browser JWT)
  -> B/config/urls.py -> /api/v1/ -> 11 Django apps
      accounts, catalogue, locations, scheduling, bookings, payments,
      technicians, operations, reviews, notifications, audit
  -> PostgreSQL in production; Redis for shared Django cache/throttling
  -> Firebase Auth/FCM, Razorpay, MSG91, Google Maps, Cloudinary
```

## Actual stack and structure

| Area | Evidence and finding |
|---|---|
| Frontend | `F/package.json`: Next `^16.3.5`, React `19.2.8`, TypeScript `^5`, Tailwind `^4`, Radix, React Query, React Hook Form and Zod, Firebase, Framer Motion. App Router under `F/src/app`; one application houses all roles. `F/src/components/providers.tsx` installs React Query. `F/src/app/globals.css` and `F/src/config/design.ts` hold styling. Exact resolved versions require lockfile verification. |
| Backend | `B/pyproject.toml`: Python >=3.12, Django >=5.2,<5.3, DRF >=3.17.2,<3.18, SimpleJWT, drf-spectacular, django-redis, psycopg, Razorpay SDK. `B/config/v1_urls.py` composes domain URL modules. |
| Database | `B/config/settings/base.py:112-117` uses SQLite fallback locally; `B/config/settings/production.py:12-21` requires DATABASE_URL. 103 migration files were found including `__init__.py`; actual applied state UNKNOWN. Core entities listed in `09_DATABASE_SCHEMA.md`. |
| Infrastructure | `B/Dockerfile`, `B/deploy/gcp/README.md`, `B/scripts/cloud-run-*.sh`: Cloud Run, Cloud SQL, Memorystore, Secret Manager deployment instructions. `B/render.yaml` is an alternative. `F/apphosting.yaml` and `F/netlify.toml` show multiple frontend deployment options; actual host UNKNOWN. |
| CI | Both `.github/workflows/ci.yml`; backend runs pytest, frontend runs lint/typecheck/Vitest/build/npm audit. Presence does not establish passing results. 37 backend and 50 frontend test files in snapshots. |
| Documentation | `B/docs/openapi.yaml`, `F/docs/openapi.yaml`, auth/booking/payment flow notes. API truth is source routes; generated schema parity is unverified. |

## Frontend discovery

Public homepage `F/src/app/page.tsx`, service listing/detail and SEO pages `F/src/app/services`, `F/src/app/[serviceSlug]`, search, blog, sitemap/robots exist. The booking route is `/book` -> `/book/review` -> `/book/pay/[bookingId]`/success; `F/src/features/bookings/components/booking-scheduling-shell.tsx` and `booking-review-shell.tsx` reveal cart coupling and several pages. Customer bookings/profile, one technician jobs page, and extensive `/admin` screens exist. `F/src/features/auth/storage.ts:3-29` stores JWTs in localStorage. Auth guard and admin permission guard are client components. `F/src/features/catalogue/server.tsx` has 300-second revalidation for some catalogue fetches, while `F/src/app/page.tsx:9` forces dynamic rendering. Next Image is used widely but some images are unoptimized. Responsive Tailwind classes and mobile navigation exist; visual quality, keyboard access, and Core Web Vitals require browser audit. No separate operations application or full technician PWA manifest was established.

## Backend discovery

`B/apps/accounts`: Firebase ID-token verification, password login, JWT, roles/group rules, support notes. `catalogue`: categories, services, packages, SEO content. `locations`: postal service areas, addresses, geocoding. `scheduling`: time slots, closures, capacity. `bookings`: cart, direct booking, operations and status history. `payments`: advance orders, signature verification, webhook/refund, invoices. `technicians`: profiles, KYC documents, skills, hours, leave, assignments, jobs. `operations`: leads, banners, FAQ, dashboard/report summaries. `reviews`, `notifications`, `audit` are separate apps. `B/apps/notifications/tasks.py:7-24` explicitly delivers synchronously; Celery is absent from `B/pyproject.toml`. Redis is a cache/throttle store, not an observed job broker.

## Maturity verdict

Substantial functional reference with tests and useful transaction patterns, but not a safe drop-in NammaPros foundation. Separate the new product and selectively port audited domain logic. Major gaps: expiring slot holds, provider reconciliation, complete quotations and financial ledger/payouts, reliable async delivery, stronger staff privilege defaults, fresh design, and dedicated technician/operations experiences. Production performance, backups, incident operations, and live security posture are UNKNOWN.
