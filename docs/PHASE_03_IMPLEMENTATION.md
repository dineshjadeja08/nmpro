# Phase 3 implementation status

Phase 3 is **partial**. No production deployment or real provider transaction was attempted. Purple Squad source was not changed.

## Implemented

- Prepaid bookings remain `AWAITING_PAYMENT` until a provider verified captured payment matches the server price snapshot. They occupy slot capacity only through `payment_expires_at`; an expired booking releases capacity. Late capture creates a reconciliation exception and `REFUND_PENDING`.
- Razorpay adapter, server order, customer checkout verification, raw body signed webhook, durable event ID deduplication, bounded retry task, and order reconciliation checks.
- Finance grants, payment/event/invoice lists, refund request and separate approver flow, provider refund initiation and status reconciliation. Refund allocation includes pending amounts. The `/finance` page reads these restricted APIs.
- MSG91 production OTP send and verify adapter with existing challenge cooldown, attempt limits, CSRF and session flow. Local development codes remain limited to nonproduction.
- Customer prepaid checkout handoff, payment status refresh, owner scoped payment history/refund status, and invoice download link when issued.
- Notification intents created idempotently from the existing outbox, with template keys and opt-in aware channel selection. Configured MSG91 WhatsApp and SMS, and SMTP email adapters can submit messages; provider acceptance is separate from delivery. Unconfigured intents remain blocked. Customers manage opt-in from the account page.
- PDF invoice renderer and authenticated owner scoped download for an already issued invoice. No issuance trigger is enabled.

## Not implemented

Live provider verification and delivery callbacks; invoice issuance and credit notes; provider paginated settlement reconciliation; real PostgreSQL concurrency tests.

## Changed areas

`services/api/domains/{bookings,payments,users,notifications}`, `services/api/config`, `services/api/.env.example`, `apps/web/src/{app,lib,features}`, backend and frontend tests, and these docs. Migrations: bookings `0007` and `0008`, payments `0002`–`0005`, notifications `0005`.

See `PHASE_03_KNOWN_LIMITATIONS.md` before considering rollout.
