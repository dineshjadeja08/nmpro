# Phase 5 implementation summary

## Frontend

- `apps/operations` now has an independent OTP login and grant-protected operations interface: dashboard, bookings and detail, dispatch board, technicians and detail, schedule, customers and detail, support and detail, escalations, reports, and settings. It has a collapsible sidebar, search/filter controls, pagination on list APIs, loading/empty states, and confirmations for booking and dispatch actions.
- All displayed records and actions use Django APIs; there are no sample bookings, technicians, or tickets.

## Backend, data, and APIs

- New `domains.operations` models: `OperationsGrant`, `DispatchRule`, `DispatchAttempt`, `OperatorNote`, `SLAPolicy`, `SLATracker`, `SLABreach`, `SupportTicket`, `SupportTicketEvent`, and `OperationalEscalation`. Existing `JobAssignment`, `JobOffer`, and `AuditLog` remain authoritative. Migrations: `operations/0001`, `0002`, and `0003`.
- `/api/v1/operations/` exposes dashboard; filtered/paginated bookings and detail; assign, reassign, offer, unpaid cancel, reschedule, notes, and available slots; dispatch board, candidates, and attempts; technician and customer views; schedule; support tickets; escalations; reports with daily CSV; and dispatch/SLA settings.
- Explicit operations grants enforce viewer, dispatch, support, manager, and super admin access. Dispatch checks verified skill, assigned zone, online status, working hours, time off, overlap, travel buffer, and workload. A configurable score explains rankings. Booking and technician row locks plus the existing exclusive assignment constraint guard acceptance. Manual assignment and sequential automatic offers use Phase 4 records. Automatic dispatch starts disabled.
- Celery evaluates automatic offer fallback and four configurable SLA types. It records breaches and in-app alerts. Support tickets, offer expiry, escalations, and technician assignment reuse the existing notification and audit infrastructure. External provider delivery remains governed by configured templates and opt-in.
- Reports aggregate bookings by creation date, service, and zone. Assignment/cancellation/completion rates share the created-booking denominator; technician utilization uses completed appointment minutes divided by weekly scheduled minutes in the selected date range.

## Checks and unverified behavior

- Django system and migration consistency checks, targeted Ruff, operations TypeScript, and operations production build passed.
- Automated tests were neither written nor run, as requested. PostgreSQL concurrency, Celery scheduling, OTP/provider delivery, visual layouts, and complete operator journeys remain unverified.

## Known limits and Phase 6 prerequisites

- Operations grants, dispatch weights, and SLA policies require deliberate setup. No contractual SLA duration is preconfigured. Production must add the operations origin to explicit CORS/CSRF settings.
- Paid booking cancellation requires finance review; online rescheduling of offered or assigned visits remains blocked by the existing booking policy. These are surfaced as backend conflicts rather than unsafe edits.
- The dispatch board and schedule cap each response at 100 and 200 records respectively. Large deployments need cursor pagination or narrower server filters. Schedule technician/zone filters currently accept IDs.
- GPS proximity, customer language, performance history, and external CRM integration are omitted because reliable inputs are unavailable. KYC documents remain inaccessible to general operations roles.
- Existing provider templates and consent still determine external notifications. Some requested event types are represented as dashboard metrics or in-app alerts rather than outbound messages. The package lock audit reports 16 moderate advisories; dependency remediation was not part of this phase.
- Phase 6 should address the approved invoice/tax policy, finance workflows, provider template setup, role provisioning, full operational QA, and dependency review before any production claim.
