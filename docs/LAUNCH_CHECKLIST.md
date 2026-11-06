# Launch checklist

| Item | Status | Evidence or blocker |
|---|---|---|
| Domain ownership, DNS and SSL for five proposed hosts | BLOCKED | Domains and records not confirmed; no DNS change made. |
| Vercel project roots, builds and preview policy | UNVERIFIED | Config files and local builds exist; projects not created. |
| Production secrets and least-privilege IAM | BLOCKED | Secret Manager versions and service accounts not supplied. |
| Cloud SQL connectivity, limits and migration review | UNVERIFIED | Settings and job prepared; no managed database connected. |
| Cloud SQL backup, PITR and restore drill | UNVERIFIED | Configuration script prepared; no backup or restore verified. |
| TLS Redis and scheduled work | UNVERIFIED | Job command and Scheduler script prepared; no cloud execution. |
| Private object storage and signed URL signing | UNVERIFIED | GCS backend and bucket script prepared; IAM and retention unverified. |
| OTP, login, session, CSRF and RBAC on real domains | UNVERIFIED | Config hardened; cross-origin/browser acceptance pending. |
| Booking availability and new zones | BLOCKED | Production flags default off until operational acceptance. |
| Payment collection and Razorpay webhook | BLOCKED | Flag off; independent provider/security acceptance required. |
| Refund and settlement workflows | UNVERIFIED | Code exists; manual financial acceptance pending. |
| Technician payouts | BLOCKED | Provider execution intentionally disabled. |
| Invoice issuance and tax treatment | BLOCKED | Approved legal seller/tax/numbering policy pending. |
| WhatsApp/SMS/email template approval | UNVERIFIED | Provider setup and approved templates not verified. |
| Technician KYC and admin/operations access | UNVERIFIED | Real staff and private-media acceptance pending. |
| Cloud Logging, Sentry and alert policies | UNVERIFIED | Structured logs prepared; integrations/alerts not activated. |
| Support contacts, privacy and legal pages | BLOCKED | Approved business and legal content not supplied. |
| Production deployment approval | BLOCKED | No deployment or launch approval requested or granted. |
