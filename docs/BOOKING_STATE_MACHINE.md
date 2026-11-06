# Booking state machine

The explicit allowed-transition matrix lives in `domains/bookings/states.py`. Public Phase 2 transitions are limited to `DRAFT -> CONFIRMED_UNPAID -> CANCELLED`. Confirmation is available only for a live owned hold, fresh accepted quote, active serviceability, free configured capacity and an explicit pay-at-visit rule. `CONFIRMED_UNPAID -> CONFIRMED_UNPAID` is a reschedule event with a new slot and incremented version. Cancellation and rescheduling require the expected version and configured cutoff; no arbitrary status update endpoint exists.

Payment status is separate (`UNPAID` on these bookings). No public API can set it to paid. Later technician execution, refunds and prepaid states are intentionally absent rather than presented as working transitions. Each implemented transition creates a `BookingStatusEvent`, an audit row and an outbox row. The booking reference is generated only on successful confirmation.
