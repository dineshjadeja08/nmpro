# Technical architecture

## Recommendation

Independent monorepo: four Next.js applications (`customer`, `pro`, `admin`, `ops`) plus one Django REST API organized by domain modules, one PostgreSQL database, Redis cache/broker, Celery worker/beat, object storage. Share typed API client, design tokens, primitives and validation contracts as packages. Separate deployments/hostnames and role-bound auth policies; avoid microservices. A single backend gives one transaction boundary for booking, slot and payment journal while one developer can work domain by domain. Splitting Next apps raises deployment overhead but gives cleaner bundles, portal isolation and release cadence; start with customer and minimal staff apps, share packages sparingly to avoid coupling.

```text
customer/pro/admin/ops Next apps -> HTTPS API gateway -> Django domains
  identity/catalog/locations/availability/booking/dispatch/payment/finance/support
  -> PostgreSQL (source of truth, transactional outbox)
  -> Redis (cache, Celery broker) -> workers -> MSG91/FCM, reconciliation, expiry
  -> Razorpay, Firebase Auth, object storage, Maps
```

Boundaries: identity owns users/roles and token exchange; catalog owns versioned offer/price; availability owns zone capacity and holds; booking owns state and snapshots; payment owns provider interactions; finance owns balanced ledger, invoices, refunds and payouts; dispatch owns assignments; support owns tickets; notifications consumes outbox events. External calls occur outside DB transactions where possible; reserve intent and finalize by webhook/reconciliation. Use domain service functions, serializer validation, repository/ORM query boundaries, versioned REST and generated OpenAPI/TypeScript client. Every command logs actor, request ID and idempotency key; sensitive metadata redacted.

Source migration: port only authorized, tested algorithms after contract tests. `B/apps/scheduling/services.py:87-92` and `B/apps/technicians/services.py:113-170` show useful locking patterns; `B/apps/payments/services.py` has HMAC/idempotency patterns. Replace slot lifecycle, auth storage, finance and notification delivery. No shared runtime package with Purple Squad, no production DB link, no live record migration. Keep Purple Squad operational and unchanged.

Security/ops: separate Firebase/Razorpay/MSG91 credentials per environment and product; secret manager, least-privilege service accounts, TLS, scoped CORS, CSP, private KYC buckets, malware scan, immutable audit/ledger, backups and restore drills. Domain event outbox provides durable, at-least-once processing with idempotent consumers. Health endpoints distinguish liveness/readiness; traces and alerts cover booking confirmation, payment lag, failed jobs, holds and dispatch SLA.
