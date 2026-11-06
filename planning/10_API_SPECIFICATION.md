# NammaPros REST API v1

Base `/api/v1`; JSON UTF-8, ISO-8601 instants, integer `*_paise`, UUID identifiers, E.164 phones. Auth: user session with role/scopes; every private query filters owner or explicit staff resource grant. `Idempotency-Key` required for POST financial/booking commands; body hash bound to actor and key, same request returns original result, changed body returns 409. `If-Match` version for staff mutations. Standard error `{error:{code,message,fields,request_id}}`; 400 validation, 401 unauthenticated, 403 forbidden, 404 hidden foreign object, 409 state/capacity, 410 expired, 429 rate limit. Cursor pagination on lists. Contracts below are new proposals; existing endpoints are listed in `02_FEATURE_REUSE_MATRIX.md`.

## Critical contracts

| Method/route | Request -> response and invariants |
|---|---|
| `GET /catalog?zone_id=` | Returns categories/services/packages with starting price and inclusion summary, catalogue version. |
| `POST /serviceability/check` | `{service_id,address_id}` -> `{supported,zone_id,reason,alternatives}`; never trust client pincode alone. |
| `GET /availability?service_id=&address_id=&from=&to=` | `{slots:[{id,start_at,end_at,remaining,version}]}`; advisory only, may change. |
| `POST /slot-holds` | `{service_id,address_id,slot_id}` -> 201 `{hold_id,expires_at,slot_version}`. Lock slot, reclaim expired holds, enforce capacity; same key returns same live hold. |
| `POST /quotes` | `{hold_id,service_id,package_id,problem}` -> `{quote_id,expires_at,price_version,lines:[{code,amount_paise}],total_paise,currency,inclusions,exclusions,payment_policy}`. Fresh server catalogue price and applicable taxes. |
| `POST /bookings` | `{hold_id,quote_id,address_id,payment_method}` -> `{booking_id,reference,status,version,payment_required,amount_due_paise}`. Atomically consume hold; quote owner/address/service/expiry match; repeat key returns same booking. |
| `POST /bookings/{id}/payment-orders` | `{}` -> `{payment_intent_id,provider_order_id,amount_paise,currency,public_key}`; owner-only; provider order made via resilient saga; server amount only. |
| `POST /payments/verify` | `{provider_order_id,provider_payment_id,signature}` -> `{payment_status,booking_status}`. HMAC, owner, amount/currency/order and capture check. Callback may return pending; webhook/reconcile is authoritative. |
| `POST /webhooks/razorpay` | Raw signed body -> 200 `{accepted:true}` after durable event persist; dedupe provider event/payment/refund IDs, process async. No user auth; signed and size limited. |
| `POST /bookings/{id}/cancel` | `{reason,expected_version}` -> `{status,refund_status,version}`. Policy and financial authorization, idempotent. |
| `POST /bookings/{id}/reschedule` | `{new_hold_id,expected_version}` -> `{slot,status,version}`. Atomic old/new occupancy switch. |
| `POST /ops/bookings/{id}/assignments` | `{technician_id,reason,expected_version}` -> `{assignment_id,status,booking_version}`; check skills, zone, schedule/overlap; audit. |
| `POST /technician/jobs/{id}/accept` | `{assignment_id,expected_version}` -> `{status,version}`; assigned technician only, offer expiry. |
| `POST /technician/jobs/{id}/inspections` | `{findings,photo_ids}` -> `{inspection_id,status}`; job actor and state checked. |
| `POST /bookings/{id}/quotations` | Staff/technician request `{inspection_id,lines:[{description,quantity,unit_paise}],expires_at}` -> `{quotation_id,version,total_paise,status}`; server validates totals and authorization. |
| `POST /bookings/{id}/quotations/{qid}/decision` | Customer `{decision:ACCEPT|REJECT,expected_version}` -> `{status,change_order_id?}`; one decision, explicit incremental payment if needed. |
| `POST /admin/refunds` | Finance `{payment_id,amount_paise,reason}` -> `{refund_id,status}`; two-person approval above threshold. |

Also provide owner-scoped `GET /bookings`, `/bookings/{id}`, `/addresses`, `/support/tickets`, `/notifications`; technician jobs/availability/earnings; ops queue/tickets/capacity; admin catalog/prices/users/finance/audit. Generate OpenAPI from serializers and contract tests for each portal. Never expose KYC object keys or provider secrets. Version breaking contracts at `/api/v2`, preserve v1 for one migration window.
