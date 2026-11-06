# Release blockers and verification status

`VERIFIED` requires observed behavior in a representative environment. None of the critical workflows below reached that standard in Phase 8. Public launch is **blocked**.

| Critical workflow | Status | Required evidence or decision |
| --- | --- | --- |
| Customer authentication | UNVERIFIED | Staging OTP delivery, throttling, session expiry, CSRF, and account isolation on real domains. |
| Booking capacity and confirmation | BLOCKED | PostgreSQL concurrent holds/confirmations, expiry, idempotent retry, price change, and rescheduling capacity checks; select pilot zone/services/limit. |
| Technician verification and assignment | UNVERIFIED | Manual review, KYC authorization, suspension, dispatch offer, acceptance, overlap, and reassignment journeys. |
| Customer quotation approval | UNVERIFIED | Assigned-job quotation, customer authorization, approval/rejection, and status/notification outcomes. |
| Payment processing | BLOCKED | Provider test-mode order, signature, webhook replay, duplicate capture, late capture, and reconciliation review; keep live collection off. |
| Refund handling | BLOCKED | Independent approval, provider test refund, partial amount ceiling, callbacks, and reconciliation. |
| Ledger integrity | UNVERIFIED | Configure chart of accounts; reconcile balanced entries to provider and database records, including duplicate capture and refund cases. |
| Technician settlements | UNVERIFIED | Finance review of earnings allocation, independent approval, idempotency, and refund holds on staging data. |
| Payout authorization | BLOCKED | No transfer provider or verified-account workflow; code intentionally stops before transfer. |
| Admin RBAC and data protection | UNVERIFIED | Deployed role matrix, object ownership, KYC/private-media access, signed URLs, and secret access review. |
| Backup and recovery | BLOCKED | Provision database backups, perform a restore drill, confirm retention and alerting. |
| Final invoice issuance | BLOCKED | Approved seller identity, tax treatment, numbering rule, and issuance event are still needed. |

## Environment and approval gates

No staging or production deployment, domains, secrets, database/Redis/object storage connectivity, scheduler, backup restore, or alert delivery was available to verify here. Review Linux dependency resolution and build the container image before deployment. Approve pilot scope and complete the manual evidence above before opening public booking. Production deployment, live payment collection, and payouts require separate explicit approval; payouts also require implementation of the missing provider controls.
