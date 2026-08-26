# Quality Scorecard

Scores are evidence-based and cover implementation through the M02 deployment-entitlement production slice.

| Category                      |  Weight | Current | Evidence                                                                                                                                                                |
| ----------------------------- | ------: | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional/domain correctness |      20 |      20 | Rosy evaluation, immutable programme/ledger, order awards, cumulative refunds, and coupon issue/capture/cancel compensation execute deterministically                   |
| Security/tenant isolation     |      20 |      19 | Tenant RLS, raw-body HMAC, encrypted plugin key, private queues, narrow roles, replay fences, and cross-tenant tests execute in CI                                      |
| Ledger integrity/reliability  |      15 |      15 | Immutable zero-sum entries, origin-preserving reservations, layered idempotency, deterministic locks, compensation, races, and property probes pass                     |
| Test strength                 |      15 |      15 | 185 unit tests, accessibility/package gates, 1,095 CI-passed pgTAP assertions, race/property probes, browser QA, and four WooCommerce runtimes                          |
| Performance/storefront        |      10 |       7 | Checkout performs no hub call and the Hub-style merchant shell passes 390/1440-pixel responsive browser QA; no load measurements exist                                  |
| Observability/operability     |      10 |       9 | Tenant queue health/issues, minimized support bundle, safe replay/reconciliation, exact reporting, worker leases, watermarks, SLOs, and recovery procedures are defined |
| Documentation/maintainability |      10 |      10 | Accepted ADRs, executable examples, operating files, task graph, integration/API docs, package tooling, and evidence remain versioned                                   |
| **Total**                     | **100** |  **95** | M02 entitlement authority is production-proven; the real-store pilot, full recovery, and load evidence remain automatic release gates                                   |

Automatic fail remains active until complete application/Auth/signing-secret recovery and the real-store pilot exist. A higher total cannot override that missing critical gate.

## Whole-product readiness

Engineering quality and product completeness are deliberately separate. The machine-readable baseline is `docs/plan/evaluations/product-score.json`.

| Category              |  Weight | Current | Primary gap                                                                            |
| --------------------- | ------: | ------: | -------------------------------------------------------------------------------------- |
| Activation            |      10 |       3 | No real WooCommerce store or production-value customer                                 |
| Feature breadth       |      25 |       8 | Earning sources, advanced rewards/VIP, referrals, campaigns, communications, migration |
| Merchant usability    |      15 |      10 | Advanced builders, previews, approvals, and operations                                 |
| Customer value        |      15 |       5 | Discovery, progress, referrals, communications, and full store placements              |
| Reliability           |      15 |      13 | Real-store outage and full recovery proof                                              |
| Operations            |      10 |       8 | Capacity and clean-room application/Auth/secret recovery                               |
| Enterprise/commercial |      10 |       4 | Production SSO/SCIM/agency canary, metering, and managed billing                       |
| **Total**             | **100** |  **51** | Enterprise finish requires at least 90                                                 |

Every module also requires at least 90/100 and at least 80% of every relevant category. Unexplained value differences, cross-tenant access, duplicate effects, checkout dependency, missing recovery/canary evidence, or unresolved critical/high findings fail the gate regardless of score.
