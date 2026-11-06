# Razorpay integration

Set `RAZORPAY_ENABLED=true`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in the server environment. Development requires a `rzp_test_` key; production requires a `rzp_live_` key. Secrets are never returned to the browser. `PAYMENT_CHECKOUT_MINUTES` accepts 5–30, default 10.

Customer endpoints are `POST /api/v1/bookings/{id}/payment-order/` with `Idempotency-Key` and `POST /api/v1/bookings/{id}/payment-verify/`. The first returns a public key ID and provider order. Verification requires the Razorpay checkout signature and a trusted provider payment fetch showing `captured`, matching order, amount and INR. `GET /api/v1/bookings/{id}/` is the customer status refresh.

No real test mode checkout was run; credentials were unavailable. Provider contract references: [Razorpay Python integration](https://razorpay.com/docs/server-integration/python/test-app/) and [webhook verification](https://razorpay.com/docs/webhooks/validate-test/).
