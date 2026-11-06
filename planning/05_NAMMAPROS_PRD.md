# NammaPros product requirements

**Product:** nammapros. **Promise:** Your Home. Our Expertise. Managed home-services marketplace. Initial catalogue: AC servicing/repair/installation/uninstallation/gas refill, washing machine service/repair, refrigerator service/repair, electrical and plumbing. Add categories through data/admin configuration, not route code.

## Users and outcomes

Customer finds a service or describes a fault, sees transparent starting price and inclusions, verifies an address and appointment, confirms once, tracks and resolves the visit. Technician completes verified onboarding, declares skills/availability, accepts and documents jobs, views earnings. Operations coordinates queue, capacity, dispatch and escalations. Admin controls catalogue, pricing, access, finance and reports.

## MVP scope and rules

Three-step booking is the default; quick rebook is a shortcut. Service selection may be a diagnostic inspection with a clearly disclosed fee and post-inspection quotation. All prices are server-quoted in integer paise and snapshotted at confirmation. Slot availability comes from backend, with expiring holds; customer sees expiry and recovery. Online advance requires confirmed capture, or an explicitly configured pay-after-service policy with audit trail. Booking status and payment state are separate. Staff actions use least privilege and audit events. Refunds, cancellations, reschedules and technician reassignment need policy and notifications.

MVP includes customer web, responsive technician PWA, operations queue/dispatch, essential admin catalogue/booking/permissions/payment views, Razorpay, OTP, MSG91 notifications, invoices, support ticket intake, basic reports. A full automated dispatch optimizer, complex promotions, and detailed settlement automation can follow pilot only if manual controls and immutable ledger exist first. Live Purple Squad data is not in scope.

## Success and acceptance

Returning customers with a saved address complete a simple booking in 30–60 seconds excluding OTP/provider delays, measured in moderated tasks (at least 10 participants) and funnel telemetry. Booking completion rate, abandonment by step, contact rate and first-time resolution are tracked. Technical release gates are in `04_PERFORMANCE_AUDIT.md`; security and finance gates in `03_SECURITY_AUDIT.md` and `11_DEVELOPMENT_ROADMAP.md`. No benchmark is claimed. Proposed hostnames are unconfirmed.

## Dependencies and open decisions

Confirm source/asset reuse rights, owned domains, legal seller/GST details, cancellation and inspection-fee policy, pay-after-service eligibility, pilot cities/zones, staffing/capacity, payout cadence, consent/privacy retention, and payment/OTP provider accounts. Treat these as product decisions before phase 4–8 implementation, not as reasons to alter Purple Squad.
