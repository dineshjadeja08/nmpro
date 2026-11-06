# Phase 4 implementation summary

## Frontend

- `apps/technician`: separate responsive partner app with OTP sign in, registration, onboarding, verification status, dashboard, job offers, assigned jobs, inspection, quotation, completion, availability, earnings, profile, and support routes. The mobile navigation and install manifest use the NammaPros brand. Screens use live Django APIs.
- `apps/web`: booking detail now shows itemized additional work quotations and explicit approve or reject actions.
- `apps/admin`: minimal reviewer screen for document review, skill verification, zone assignment, application decisions, suspension, and manually creating eligible job offers. Access is enforced by backend grants.

## Backend, database, and APIs

- Expanded technician profile and added skills, assigned zones, weekly availability, time off, private documents, verification events, reviewer grants, offers, exclusive assignments, job events, inspection, quotations and items, completion, compensation rules, and earnings.
- Migrations: `technicians/0003`, `0004`, and `0005` (normalizes legacy `PENDING` profiles).
- `/api/v1/technicians/`: apply, me, submit, verification, skills, zones, availability and time off, private document upload, offers and accept/decline, jobs and lifecycle actions, inspection, quotation, completion, earnings, notifications; `/admin/` application, document, skill, zone, review, and offer endpoints.
- `/api/v1/bookings/{id}/quotations/`: customer scoped list and approve/reject endpoints.
- Reuses OTP sessions, booking and payment records, notification adapters, audit logs, and Celery. Offer and quotation expiry run through Celery beat. Cancellation withdraws open offers and cancels active assignments. Acceptance locks booking and technician records before checking eligibility.

## Validation

- Django system check and migration consistency check passed; no new migration changes detected.
- Technician, admin, and customer web TypeScript checks and production builds passed. Targeted Ruff check passed.
- Automated suites were neither created nor run, as requested. End to end flows, concurrent acceptance under PostgreSQL, provider delivery, and visual behavior remain unverified.

## Known limitations and prerequisites

- Reviewer grants and package compensation rules must be configured by operations. No automatic bank payouts or payout reconciliation is included.
- Earnings accrue only with a configured compensation rule and enough captured booking receipts. A periodic task handles captures after service completion and skips bookings with refund activity; changes to an already accrued earning still need finance review.
- Additional quotations are approval records only: they do not collect payment or change immutable booking price snapshots or invoices. Tax is currently zero pending the approved tax and invoicing policy. Do not issue a final invoice for additional work from this flow.
- Private documents use the configured private media directory; deployment needs durable private storage, retention policy, and access review. The install manifest does not yet provide offline job access.
- The minimal reviewer screen uses manual booking and technician IDs for offer creation. Full operations tooling, pagination, and support channel configuration remain later work.
- The current booking model has no customer instruction field, so job detail cannot display customer instructions yet. The package lock update reported 16 moderate dependency advisories; these were not assessed in this phase.
- Phase 5 should start after policy decisions for additional charge collection, tax, compensation and payout reconciliation, private storage, and provider templates; then perform end to end QA with real PostgreSQL, Redis, and provider sandbox accounts.
