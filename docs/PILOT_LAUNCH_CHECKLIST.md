# Controlled pilot launch checklist

Keep `PUBLIC_BOOKING_ENABLED=false` until launch approval and acceptance checks finish. Refer to the [Provider Integrations and Staging Guide](PROVIDER_INTEGRATIONS_STAGING_GUIDE.md) for step-by-step verification of Firebase authentication, Razorpay advance payments, Cloudinary uploads, and pilot gating. Select the pilot area and technician roster; do not use example domains or placeholder secrets as deployment values.

| Owner role | Before opening booking |
| --- | --- |
| Release engineer | Provision staging and pilot infrastructure; apply reviewed migrations; verify API health, database, Redis, private storage, backup restore, alerts, logs, request IDs, HTTPS, CORS, and CSRF. |
| Operations manager | Select one service area and record its zone UUID; select active AC and washing-machine service slugs only where service coverage and trained technicians exist; set `PILOT_ENABLED=true`, `PILOT_ZONE_IDS`, `PILOT_SERVICE_SLUGS`, and `PILOT_DAILY_BOOKING_LIMIT` after reviewing capacity. |
| Technician verifier | Check identity documents through the restricted review flow; approve a small roster, verified skills, zones, availability, and contact process. Recheck suspension access. |
| Dispatch operator | Validate manual offer, acceptance, reassignment, overlap prevention, and assignment notifications in staging. Keep `AUTOMATIC_DISPATCH_ENABLED=false`. |
| Customer support lead | Staff the booking window; rehearse booking failure, cancellation, rescheduling at a full pilot cap, quotation approval, refund escalation, and incident communications. |
| Finance lead | Reconcile captured payments, refunds, ledger entries, commissions, settlement reviews, and duplicate-capture exceptions with provider test evidence. Keep `RAZORPAY_ENABLED=false` until the test-mode workflow and independent approval are complete. Do not release payouts. |
| Security lead | Verify role boundaries, object ownership, technician address/KYC access, OTP throttling, session/CSRF/CORS behavior, and secret handling on deployed domains. |
| Product owner | Approve location, services, daily limit, support coverage, launch window, rollback owner, and go/no-go record. Obtain invoice policy before final invoice issuance. |

At launch, enable public booking only after the release owner signs off the [blocker list](RELEASE_BLOCKERS.md), perform a staff-supervised first booking, monitor capacity and failures, and close the public gate if booking integrity or customer support degrades. Keep live payments, WhatsApp, new zones, automatic dispatch, and payouts off until each has separate evidence and approval.
