# Payment reconciliation

Celery checks up to 100 recent orders per run in a bounded configurable lookback (default 72 hours, maximum 168). `last_reconciled_at` rotates the batch so later orders are not starved. It flags provider amount/currency mismatch, provider paid orders with no internal capture, and unresolved `CREATING` orders older than 30 minutes. It never turns an ambiguous provider order into a confirmed booking. Captured payments received after their booking lease create `CAPTURE_AFTER_PAYMENT_WINDOW` exceptions.

Processing refunds are polled in batches of 100. Signed events that exhaust five processing attempts create `WEBHOOK_PROCESSING_EXHAUSTED` exceptions. Finance grants control `GET /api/v1/finance/exceptions/` and `/finance/events/`.

This is not a settlement grade reconciliation: provider pagination, payment list comparison, external rate limits, and export comparison remain unimplemented. Monitor exceptions and review each before refunding or adjusting state.
