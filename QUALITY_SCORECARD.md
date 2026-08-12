# Quality Scorecard

Scores are evidence-based and cover implementation through the Phase 9 initial-programme onboarding and customer-tier visibility slices.

| Category                      |  Weight | Current | Evidence                                                                                                                                                              |
| ----------------------------- | ------: | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional/domain correctness |      20 |      20 | Rosy evaluation, immutable programme/ledger, order awards, cumulative refunds, and coupon issue/capture/cancel compensation execute deterministically                 |
| Security/tenant isolation     |      20 |      19 | Tenant RLS, raw-body HMAC, encrypted plugin key, private queues, narrow roles, replay fences, and cross-tenant tests execute in CI                                    |
| Ledger integrity/reliability  |      15 |      15 | Immutable zero-sum entries, origin-preserving reservations, layered idempotency, deterministic locks, compensation, races, and property probes pass                   |
| Test strength                 |      15 |      15 | 95 unit tests, PHP/static/package gates, 613 CI-passed pgTAP assertions, race/property probes, browser QA, and four WooCommerce runtimes                              |
| Performance/storefront        |      10 |       7 | Checkout performs no hub call and responsive Overview/auth/editor workflows pass browser QA; no critical-path load measurements exist                                 |
| Observability/operability     |      10 |       9 | Tenant queue health/issues, safe effect replay, signed reconciliation, exact Overview reporting, worker leases, watermarks, SLOs, and recovery procedures are defined |
| Documentation/maintainability |      10 |      10 | Accepted ADRs, executable examples, operating files, task graph, integration/API docs, package tooling, and evidence remain versioned                                 |
| **Total**                     | **100** |  **95** | Phase 9 administration and live reporting exist; broader surface completion, load/restore drills, and deployment remain release gates                                 |

Automatic fail remains active until backup/restore verification exists. A higher total cannot override that missing critical gate.
