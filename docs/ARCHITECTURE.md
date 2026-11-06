# Implemented architecture

The repository is independent of Purple Squad. npm workspaces contain `apps/web` (customer Next.js App Router), three placeholder portal apps, and shared `packages/config`, `packages/ui`, `packages/types`, `packages/api-client`. `services/api` is a modular Django REST Framework service. There is one API process and one database; no microservices or production integrations.

`apps/web` server components fetch `/api/v1/catalog/` through the typed client. The browser receives catalog data for the booking draft; it does not hold auth tokens. Service pages are server-rendered. The booking shell keeps only draft form fields in sessionStorage and never sends a create-booking request. Placeholder technician/admin/operations apps have no privileged endpoints.

The Django service has users, catalog, locations, bookings, technicians, payments, notifications and audit domain apps with foundational models. Only health, readiness and public read-only catalog/service endpoints are exposed. Production mode requires explicit secret, PostgreSQL URL, host/CORS allowlists and Redis URL. Celery is configured for future durable jobs but no worker task is active. PostgreSQL and Redis Compose services are for local development; this host did not have Docker at implementation time.

Purple Squad and competitor implementations were examined as reference material only. No source/assets/records were copied. Future booking state, financial ledger, OTP and role authorization must follow the planning documents before write endpoints exist.
