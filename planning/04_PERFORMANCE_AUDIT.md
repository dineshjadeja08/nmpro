# Performance audit and measurement plan

No benchmark or Lighthouse run was performed. Findings below are source-level and must be measured with production-like data.

| Finding | Evidence and action |
|---|---|
| Slot-list N+1 | `B/apps/scheduling/views.py:60-67` iterates slots and invokes `get_available_capacity`; `B/apps/scheduling/services.py:39-51` issues a booking COUNT per slot. Aggregate reservations by slot in one query and cache short-lived availability; recheck under lock at hold creation. |
| Synchronous provider I/O | `B/apps/notifications/services.py:28-52` calls `deliver_notification`; `tasks.py:7-24` sends within request commit callback. Move to durable outbox/worker, instrument queue lag and provider timeouts. |
| Repeated dashboard counts | `B/apps/operations/views.py:266-276,712-720` issues many filtered counts. Use conditional aggregate and bounded time windows; add query-count tests and indexes based on EXPLAIN. |
| Frontend network chain | `F/src/features/bookings/components/booking-review-shell.tsx:63-80` depends on service, addresses, serviceability, slots; `booking-scheduling-shell.tsx:44-64` does similarly. A consolidated booking-context endpoint or parallel fetch plus prefetch can cut waterfalls. |
| Dynamic homepage | `F/src/app/page.tsx:9` forces dynamic rendering even though `F/src/features/catalogue/server.tsx:8,41` revalidates some catalogue data. Measure cache hit ratio and use static shell with controlled revalidation where freshness allows. |
| Public catalogue middleware | `F/src/proxy.ts:15-56` fetches backend catalogue/SEO data before response for matched pages. Measure edge latency/failure and avoid duplicate fetch in route render. |
| Images/bundle | Next Image and local media exist, but `F/src/features/bookings/components/booking-tracking.tsx:55` uses `unoptimized`; Framer Motion/Firebase/analytics are client dependencies in `F/package.json` and `F/src/app/layout.tsx`. Audit route bundles, lazy-load Firebase/Razorpay and noncritical tags, serve responsive AVIF/WebP. |
| Database design | Booking indexes include `(time_slot,booking_status)` (`B/apps/bookings/models.py:83-91`); lead/report indexes exist. Verify real plans and cardinality. Public lists with `pagination_class=None` (`B/apps/catalogue/views.py:77,245`, locations/FAQ) need size caps before expansion. |

## NammaPros release targets

- Mobile Lighthouse Performance >=90 on homepage, category, service and booking screens, measured in CI on fixed mid-tier mobile emulation; real-user metrics take precedence.
- p75 mobile LCP <=2.5 s, INP <=200 ms, CLS <=0.1, segmented by route, device and network over rolling 28 days where sample size is sufficient.
- Ordinary read API p95 <500 ms at an agreed representative load (initial test: 50 concurrent users, realistic catalogue/slot/booking mix, seeded 100k bookings; revise to forecast volume). Separate provider-dependent endpoints.
- Zero duplicate confirmed bookings on replay, and zero slot oversell in 100-way concurrent hold/confirm/cancel tests on PostgreSQL. Test expiry/reconciliation and network retries.
- No unresolved critical/high security findings at release.

Instrumentation: web-vitals RUM with consent, Lighthouse CI, OpenTelemetry traces across Next/API/worker, Postgres `pg_stat_statements`, query-count/EXPLAIN checks, load tests in staging. Baseline each route before optimization. Targets are acceptance criteria, not current results.
