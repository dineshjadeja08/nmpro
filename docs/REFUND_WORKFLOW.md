# Refund workflow

`FINANCE_ADMIN` requests a refund for a captured payment with amount, reason and idempotency key. Allocated `REQUESTED`, `APPROVED`, `PROCESSING` and `SUCCEEDED` refunds cannot exceed captured paise. A different user with `REFUND_APPROVER` or `FINANCE_ADMIN` must approve. The provider call occurs after approval commits. If its outcome is uncertain, the refund remains `APPROVED` and requires manual review; a second provider call is not made automatically.

Provider acceptance sets `PROCESSING`, not success. Reconciliation fetches the provider refund and sets `SUCCEEDED` only when it reports `processed`, or `FAILED` when it reports `failed`. Successful partial and full totals update customer visible booking payment status. There is no automatic cancellation refund or invented eligibility policy.

Finance endpoints: `GET /finance/payments/`, `GET|POST /finance/refunds/`, `POST /finance/refunds/{id}/approve/`, `POST /finance/refunds/{id}/reconcile/`, all under `/api/v1`. [Razorpay refund API](https://razorpay.com/docs/api/refunds/create-normal/).
