# Quality Scorecard

Scores are evidence-based and cover implementation through the completed Phase 7 WooCommerce slice.

| Category                      |  Weight | Current | Evidence                                                                                                                                              |
| ----------------------------- | ------: | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional/domain correctness |      20 |      20 | Rosy evaluation, immutable programme/ledger, order awards, cumulative refunds, and coupon issue/capture/cancel compensation execute deterministically |
| Security/tenant isolation     |      20 |      19 | Tenant RLS, raw-body HMAC, encrypted plugin key, private queues, narrow roles, replay fences, and cross-tenant tests execute in CI                    |
| Ledger integrity/reliability  |      15 |      15 | Immutable zero-sum entries, origin-preserving reservations, layered idempotency, deterministic locks, compensation, races, and property probes pass   |
| Test strength                 |      15 |      15 | 58 unit tests, PHP/static/package gates, 322 pgTAP assertions, race/property probes, and a four-case real WooCommerce runtime matrix pass             |
| Performance/storefront        |      10 |       6 | Checkout performs no hub call and the responsive Overview passes browser QA; no critical-path load measurements exist                                 |
| Observability/operability     |      10 |       8 | Queue health, dead-letter retry, source reconciliation, worker leases, connection watermark, SLOs, and deployment/restore procedures are defined      |
| Documentation/maintainability |      10 |      10 | Accepted ADRs, executable examples, operating files, task graph, integration/API docs, package tooling, and evidence remain versioned                 |
| **Total**                     | **100** |  **93** | Phase 7 is verified; exhaustive release compatibility, load/restore drills, and production deployment remain release gates                            |

Automatic fail remains active until backup/restore verification exists. A higher total cannot override that missing critical gate.
