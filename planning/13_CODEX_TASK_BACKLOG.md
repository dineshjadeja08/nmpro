# Executable Codex task backlog

Each ticket is scoped to one reviewable change in a **new** NammaPros repository after this audit is approved. Dependencies refer to prior ticket IDs. Every ticket includes a focused test and artifact. Do not edit either supplied archive.

| ID | Depends | Task and acceptance artifact |
|---|---|---|
| N00 | Audit review | Record rights, pilot zone, payment/cancellation/inspection and GST decisions in ADRs; unresolved fields explicit. |
| N01 | N00 | Scaffold monorepo, four Next apps and Django API, local Postgres/Redis, CI; all empty apps build. |
| N02 | N01 | Add tokens, typography, accessible buttons/forms/skeletons; Storybook or visual fixture across widths. |
| N03 | N01 | Implement identity schema, Firebase exchange and secure refresh flow; stolen/replayed token tests. |
| N04 | N03 | Implement explicit role/action grants and owner filters; negative access matrix. |
| N05 | N01 | Implement catalog/category/package/zone schema and seed fixtures; unique/version tests. |
| N06 | N05 | Implement address/serviceability API and customer forms; unsupported zone/error tests. |
| N07 | N02,N05 | Build home, search and Step 1; keyboard and no-results checks. |
| N08 | N05,N06 | Implement slot inventory/hold TTL with PostgreSQL locking; 100 concurrent hold test. |
| N09 | N08 | Implement quote snapshot and pricing validation; price-change/expiry tests. |
| N10 | N03,N08,N09 | Implement booking state machine/idempotency and Step 2/3 UI; retry and recovery tests. |
| N11 | N10 | Implement Razorpay order/webhook/reconciliation; duplicate/late/fail capture tests in sandbox. |
| N12 | N10,N11 | Implement durable outbox/worker, MSG91 templates and notification status; retry/dead-letter test. |
| N13 | N11 | Implement invoices, refunds and balanced ledger; journal invariants. |
| N14 | N04,N10 | Implement technician profile/skills/zones/KYC private upload and PWA shell; access and malicious upload tests. |
| N15 | N14 | Implement jobs, accept/start/complete, photos, inspection/quotation; transition and overlap tests. |
| N16 | N10,N15 | Implement ops queue, dispatch, SLA and tickets; assignment concurrency tests. |
| N17 | N04,N05,N13 | Implement admin catalog/pricing, finance, role and audit screens; permission tests. |
| N18 | N16,N17 | Build reports/payout approval and reconciliation view; double payout test. |
| N19 | N07–N18 | Perform accessibility/performance/security/load passes and fix measured defects; release evidence pack. |
| N20 | N19 | Set up staging/prod isolated infrastructure, restore/rollback drill and controlled pilot; signed runbook. |

For each ticket: inspect current contract, implement narrow slice, add meaningful tests, run relevant checks, document API/schema change, show diff and acceptance evidence. Do not claim completion from code presence alone.
