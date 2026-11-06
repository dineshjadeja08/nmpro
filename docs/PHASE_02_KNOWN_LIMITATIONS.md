# Phase 2 known limitations and release blockers

- PostgreSQL and Redis were not available on this Windows host. Row-lock correctness and simultaneous final-slot/reschedule behavior require real PostgreSQL tests before release. SQLite migration/tests are not substitutes.
- No real OTP provider is connected. Production sign-in fails closed, so production booking is unavailable. Integrate provider delivery, review cookie/origin topology and run CSRF/session browser tests.
- No approved operating city/zone, package price, tax amount, cancellation policy or capacity was invented. The Phase 1 demo catalog has service names but no active bookable packages or slots. Operations configuration is required before a real appointment can be made.
- Online-prepaid booking is blocked; payment orders, capture verification, refunds and invoices are Phase 3 prerequisites. Internal notification outbox rows are durable, but external SMS/email dispatch is not configured.
- OpenAPI auto schema generation currently reports missing APIView serializer inference; generated TypeScript client types are absent. The manually typed client and tests cover implemented routes, but API schema/type generation is a remaining Phase 2 task.
- Technician-level availability, skill assignment, completed-service states, customer support contact, rescheduling across zones with repricing, discounts, automated tax calculation and production performance/accessibility measurements are not implemented. No such capability is claimed in the UI.
