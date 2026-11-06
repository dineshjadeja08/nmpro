# Phase 6 implementation summary

## Delivered

- `apps/admin` now has an OTP sign-in, role-aware responsive shell, dashboard, booking/customer/technician details, catalog, pricing, zones, finance, commissions, reports, staff/roles, notifications, settings, and audit views. Tables use server pagination, search and status filters where supported. Forms and confirmation prompts call Django APIs; data and charts are loaded from records rather than fixture metrics.
- `domains.administration` adds staff roles and capability checks, audit records, platform settings, commission rules, adjustments, ledger accounts and balanced transactions, settlements and line items, payout account references and payout requests. Admin APIs cover the Phase 6 routes. Phase 4 technician review and Phase 5 operations services remain in use.
- Catalog descriptions/images/package requirements and zone capacity/working hours were added. Pricing changes create a new version; existing booking snapshots are unchanged. Approved commission rules accrue technician earnings against captured, unrefunded payments, with a calculation snapshot. Settlement generation locks approved, unallocated items, holds refunded bookings, and requires an independent reviewer. Payout reservations are idempotent, locked against the settlement balance, and require a provider-verified account. Approval stops at `BLOCKED_PROVIDER`; no transfer API executes.
- The ledger posts balanced captured-payment and completed-refund entries when `CASH` and `CUSTOMER_ADVANCES` accounts have been configured. Posted transactions and entries are immutable through model writes. Revenue recognition is not inferred from gross booking value or cash collections.
- Existing refund controls limit requests to captured amounts and require independent approval. Privileged refund, settlement, commission, payout, staff-role, and adjustment approvals require recent OTP sign-in. Sensitive settings and provider secrets are excluded from the admin settings API.

## Migrations

`administration` 0001–0004; `catalog` 0004–0005; `locations` 0004; `technicians` 0006; `payments` 0006. Apply with the normal deployment migration process. No migration was applied to a production database here.

## Validation

`python manage.py check`, `python manage.py makemigrations --check --dry-run`, a focused Ruff undefined-name check, TypeScript type checking, and `npm run build --workspace @nammapros/admin` passed. No automated tests or live provider calls were run, as requested. Database-backed workflow behavior, concurrency under PostgreSQL, provider callbacks, and deployed UI behavior remain unverified.

## Blockers and next prerequisites

- Live technician payout execution remains disabled until a provider integration, verified account workflow, reconciliation process, and explicit launch approval exist. Newly added payout references remain unverified.
- Final invoice issuance and nonzero tax configuration remain blocked until the approved seller, tax, numbering, and issuance policy promised earlier is supplied. Existing issued invoices remain viewable and downloadable.
- Payment method distribution cannot be shown because the current Payment record does not store a verified method. Revenue recognition requires an approved accounting policy and corresponding ledger postings.
- Before a later phase or production launch: apply and review migrations on staging PostgreSQL, seed and reconcile chart of accounts, bootstrap a SUPER_ADMIN through a trusted operator workflow, configure provider credentials in environment/Secret Manager, and perform manual finance and access-control acceptance checks. Phase 7 and production deployment were not started.
