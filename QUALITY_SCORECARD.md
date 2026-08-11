# Quality Scorecard

Scores are evidence-based and cover implementation through the completed Phase 3 tenancy/RLS slice.

| Category                      |  Weight | Current | Evidence                                                                                                                                                |
| ----------------------------- | ------: | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional/domain correctness |      20 |      14 | Approved, versioned Rosy configuration and pure award/refund/expiry/tier behavior have 16 tests; no ledger persistence yet                              |
| Security/tenant isolation     |      20 |      18 | Six tenant tables use explicit grants, live membership RLS, composite tenant keys, no-login ownership, scoped support access, and adversarial CI tests  |
| Ledger integrity/reliability  |      15 |       8 | Double-entry accounts, zero-sum transactions, immutable lots/allocations, projections, lock order, and compensation model are accepted; not implemented |
| Test strength                 |      15 |      15 | Format/lint/types/build, 18 unit tests, static gates, double migration replay/reset/seed, and 49 pgTAP assertions pass on exact-head Linux/Docker CI    |
| Performance/storefront        |      10 |       5 | Responsive Overview passes desktop/mobile browser QA; no critical-path load measurements exist                                                          |
| Observability/operability     |      10 |       7 | SLI definitions, queue/ledger signals, pinned Supabase deployment, restore drill, and incident first actions are defined; no real deployment evidence   |
| Documentation/maintainability |      10 |      10 | Accepted ADR, executable examples, operating files, task graph, pinned workflows, preserved sources, and QA evidence exist                              |
| **Total**                     | **100** |  **77** | Phase 3 tenancy is execution-verified; ledger, connector recovery, load, restore, and production operations remain substantial implementation gates     |

Automatic fail remains active until ledger integrity and backup/restore verification exist. A higher total cannot override those missing critical gates.
