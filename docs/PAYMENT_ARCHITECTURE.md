# Payment architecture

The immutable `BookingPriceSnapshot` supplies the order amount in paise. `PaymentIntent` is the provider order; `Payment` records a provider verified capture; `PaymentEvent` records signed webhook metadata and a payload digest without storing the full payload. `Refund` and `ReconciliationException` are separate records.

The booking state and payment state remain separate. Prepaid booking creation consumes the Phase 2 slot hold and creates `AWAITING_PAYMENT` with a ten minute default payment lease, capped at the slot's lead time boundary. Availability counts live prepaid leases and confirmed bookings. A scheduled task expires unpaid bookings. A late capture is retained in `Payment` but cannot confirm an expired booking; it enters finance review.

Razorpay network calls occur outside database transactions. The initial order row uses `CREATING` before the provider call. `checkout_started_at` prevents a second checkout response while the first attempt remains unresolved, even after a page reload. A provider verified failure permits retry on the same order. An uncertain provider outcome blocks a new order and requires finance reconciliation. The slot and booking are locked before a verified capture changes state. SQLite tests do not prove PostgreSQL lock behavior.

`GET /api/v1/customers/payments/` returns a signed-in customer's payment attempts and refund statuses, 20 per page. Booking detail exposes invoice availability, but actual issuance remains disabled.
