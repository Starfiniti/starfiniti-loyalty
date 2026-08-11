# Quality Scorecard

Scores are evidence-based and cover implementation through the completed Phase 1 WooCommerce product-model slice.

| Category                      |  Weight | Current | Evidence                                                                                                                                                 |
| ----------------------------- | ------: | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional/domain correctness |      20 |      14 | Approved, versioned Rosy configuration and pure award/refund/expiry/tier behavior have 16 tests; no ledger persistence yet                               |
| Security/tenant isolation     |      20 |      12 | Secret/exposure guards and eight RLS/grant/function pgTAP assertions pass; complete tenant schema is Phase 3                                             |
| Ledger integrity/reliability  |      15 |       6 | Historical snapshots, original attribution, cumulative reversals, expiry ordering, and negative-balance policy are executable; ledger is not implemented |
| Test strength                 |      15 |      14 | Format/lint/types/build, 18 unit tests, CI validation, migration replay, seed, and eight pgTAP assertions pass                                           |
| Performance/storefront        |      10 |       5 | Responsive Overview passes desktop/mobile browser QA; no critical-path load measurements exist                                                           |
| Observability/operability     |      10 |       6 | Standalone health/assets, Proxmox contract, backup targets, status, and runbook framework exist                                                          |
| Documentation/maintainability |      10 |      10 | Accepted ADR, executable examples, operating files, task graph, pinned workflows, preserved sources, and QA evidence exist                               |
| **Total**                     | **100** |  **67** | Phase 1 is verified; architecture, tenancy, ledger, connector recovery, and production operations remain substantial gates                               |

Automatic fail remains active until tenant isolation, ledger integrity, and backup/restore verification exist. A higher total cannot override those missing critical gates.
