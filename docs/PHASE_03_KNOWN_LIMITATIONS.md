# Phase 3 known limitations

## Blocked by external inputs

- Razorpay test account credentials, configured test webhook, and approved payment/refund operating policy.
- MSG91 auth key, approved OTP template and configured OTP length.
- Approved WhatsApp templates, business provider configuration, opt-in text and delivery callbacks; email/SMS provider choices and credentials.
- Legal seller details, tax policy, invoice sequence, service completion trigger and credit note policy.
- PostgreSQL, Redis and Celery environment for financial concurrency and background processing tests.

## Not implemented

- Live WhatsApp/SMS/email verification and delivery tracking, and finance workflows beyond the basic `/finance` review page.
- Final invoice issuance, legal invoice validation and credit notes. The sample renderer output was visually checked.
- Settlement grade provider reconciliation with paginated payment/refund lists and rate limit controls.
- Full payment/refund concurrency tests on PostgreSQL and live provider test mode verification.
- OpenAPI strict validation fails because APIViews lack explicit request/response schema definitions and two operation IDs collide. The generated schema cannot be treated as complete.

Do not enable production payments or claim Phase 3 complete from the local mocked test results. This phase must meet the pasted brief's definition of done before Phase 4.
