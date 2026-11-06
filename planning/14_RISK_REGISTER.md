# Risk register

Scale: impact/likelihood H/M/L. Owners are proposed roles. Mitigation and exit evidence are required before production.

| Risk | I/L | Owner | Mitigation and closure evidence |
|---|---|---|---|
| Reuse/IP rights unclear | H/M | Product/legal | Confirm rights to algorithms/assets; only port approved code, no Purple Squad brand assets. Written decision. |
| Indefinite pending slots or oversell | H/H | Backend | Expiring holds, DB locks, replay/load tests; zero oversell in PostgreSQL concurrency suite. |
| Payment/booking divergence | H/H | Finance/backend | Signed webhook, provider capture reconciliation, immutable ledger, late-capture policy; daily zero unexplained variance. |
| Staff overprivilege | H/M | Security | Explicit deny-by-default grants, scoped ops/admin routes, access matrix and audit. |
| Browser token theft | H/M | Security/frontend | HttpOnly secure refresh session, CSP, tag governance, token rotation test. |
| Provider outages (Firebase/Razorpay/MSG91/Maps) | H/M | Ops | Timeouts, retries, user recovery, manual support, provider sandbox drills. |
| Synchronous notifications/no worker | M/H | Backend | Durable outbox/Celery, failure alert, retry metrics and replay test. |
| Missing payout/quote domain | H/H | Product/backend | Define policy and schema before pilot; balanced journal and customer approval tests. |
| KYC data exposure | H/M | Security | Private bucket, malware scan, signed access, retention/deletion audit. |
| 3–5-week schedule pressure | H/H | Product | Narrow pilot, 6–8-week functional MVP estimate, phase gates and scope controls. |
| Performance unknown | M/H | Frontend/backend | Baseline RUM/Lighthouse/load; meet p75/p95 gates from `04_PERFORMANCE_AUDIT.md`. |
| Deployment drift/rollback | H/M | DevOps | IaC, isolated envs, additive migrations, backup/restore and rollback drill. |
| Unknown live data quality | M/M | Data/ops | No default migration; synthetic fixtures and separate onboarding. |

Review weekly and after every pilot incident. Source-level findings remain open until tests and operational evidence close them.
