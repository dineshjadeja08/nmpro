# Booking security

Private API views require Django session authentication. DRF SessionAuthentication enforces CSRF on authenticated writes; OTP request/verify have explicit CSRF protection and `GET auth/csrf/` provides a token to the browser. Sessions use HttpOnly cookies, a 12-hour age and browser-close expiry; production enables Secure cookies, HTTPS redirect and HSTS. CORS accepts only configured origins and credentials. Confirm, cancel, reschedule, hold and address operations check ownership server-side. The browser never sends authoritative price, status or capacity.

The development OTP provider uses hashed, five-minute challenges, a one-minute resend cooldown, five requests per phone per hour, five verification attempts and scoped IP throttles. It returns the code only in nonproduction development responses. **Production OTP routes fail closed with HTTP 503** until a real delivery and verification provider is integrated; no code is logged or returned in production. The production cookie/origin topology also needs review before deployment.

Booking confirmation records an idempotency hash per customer/key, locks rows in the transaction and creates an audit event without address or phone metadata. Outbox processing creates an internal pending notification record but does not send SMS or email. No payment, provider secret or privileged staff endpoint is exposed.
