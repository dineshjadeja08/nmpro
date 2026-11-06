# Webhook security

`POST /api/v1/payments/razorpay/webhook/` is unauthenticated but requires `X-Razorpay-Signature` over the original raw body. The endpoint rejects missing or invalid signatures and payloads over 256 KB before parsing. `X-Razorpay-Event-Id` is unique; a repeated ID with a different body digest is rejected. The durable event record contains selected IDs, event type and SHA-256 digest, not the full payload.

`payment.captured` triggers a provider fetch and amount/order/currency check. Other signed events create a review exception rather than changing financial state. Failed processing leaves the event `RECEIVED`; a scheduled task retries up to five times, then marks `FAILED_REVIEW`. The HTTP response is 202 for a durable but unprocessed event.

Configure Razorpay's webhook URL and secret together. Monitor `FAILED_REVIEW` and reconciliation exceptions. Signature and duplicate paths have mocked test coverage; no live signed webhook was received.
