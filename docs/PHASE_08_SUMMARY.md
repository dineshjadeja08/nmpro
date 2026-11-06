# Phase 8 implementation summary

## Critical fixes

- Booking: rescheduling rechecks destination slot capacity; pilot booking is restricted by explicit zone UUIDs, service slugs, and a daily cap. Managed environments reject public booking without pilot limits. Slot and zone locks protect the capacity decisions. Same-day rescheduling when the pilot cap is full currently needs operator assistance because a new hold cannot be acquired.
- Technician and operations: Phase 6 staff roles now reach the existing technician review and dispatch services. Suspended or unverified technicians cannot retrieve assigned job details, customer addresses, or upload service photos.
- Payments: a second distinct captured payment for an already paid booking creates a reconciliation exception without changing the booking's paid state. Refund approval rejects a disabled provider before advancing state.
- Customer: the booking UI displays the backend's public-booking gate message instead of a generic retry message.

## Checks and limits

`manage.py check`, migration dry run, Python compilation, focused Ruff undefined-name checks, TypeScript checks for all four apps (admin via direct `tsc`), and four production builds passed. No automated suites, live provider calls, destructive database operations, or deployment were performed. No staging environment was available for a health or manual workflow check. Compilation and inspection do not verify deployed behavior or PostgreSQL concurrency.

The pilot and public booking gates remain disabled in production examples. Online payment, automatic dispatch, WhatsApp, new zones, and technician payouts remain disabled. Invoice issuance still needs the approved seller, tax, numbering, and issuance policy; live payouts lack a provider and account verification workflow. See [release blockers](RELEASE_BLOCKERS.md) and [pilot checklist](PILOT_LAUNCH_CHECKLIST.md).
