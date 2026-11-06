# Deployment plan

Proposed names, ownership **UNKNOWN**: `nammapros.in`, `pro.nammapros.in`, `admin.nammapros.in`, `ops.nammapros.in`, `api.nammapros.in`. Use Vercel for four Next apps and GCP Cloud Run for Django API plus separate Cloud Run worker/periodic jobs; Cloud SQL PostgreSQL, Memorystore Redis, private Cloud Storage bucket, Secret Manager. This aligns with `B/deploy/gcp/README.md` patterns without sharing Purple Squad resources. Confirm data residency, service agreements and cost before purchase.

| Environment | Isolation and release path |
|---|---|
| Development | Docker/Postgres/Redis and provider sandbox, synthetic fixtures, local env files excluded from Git. |
| Staging | Separate GCP project/Vercel project, isolated database/bucket/keys, sanitized synthetic data, same topology and CI gates as production. |
| Production | Separate project, least privilege service accounts, private DB and Redis, Cloud Run min/max scaling, Cloud Armor/rate protection as needed, independent provider keys and verified domains. |

CI/CD: PR lint/type/unit/contract/security scan; build immutable images and Next artifacts; deploy staging; run additive migration via one Cloud Run job under lock; smoke and synthetic booking/payment test; approval gate for production; deploy worker then API then portals with compatibility window. No production migration from Purple Squad. Database schema changes are expand/backfill/contract; backup/PITR snapshot before high-risk changes. Secret Manager versions with rotation and access audit; no secrets in NEXT_PUBLIC except provider publishable values. CORS allow exact four origins; CSP per portal; TLS/HSTS and DNS verification before cutover.

Monitoring: OpenTelemetry traces, structured redacted logs, web vitals RUM, Cloud SQL/Redis metrics, payment reconciliation lag, outbox age/failure, slot hold count, unassigned booking SLA and 5xx/p95 alerts. Readiness checks DB/critical dependencies carefully; liveness avoids dependency cascades. Daily encrypted backups plus PITR, monthly restore drill and documented RPO/RTO (propose RPO 15 min/RTO 2 h; validate cost). Rollback uses previous immutable image/portal release; forward-fix additive schema, never rely on unsafe down-migrations. Incident runbook: on-call owner, severity, provider outage handling, stop new orders if reconciliation unsafe, customer communication and postmortem. Pilot starts with one city/zone, limited services and technicians; expand only after booking/finance reconciliation and support metrics pass.
