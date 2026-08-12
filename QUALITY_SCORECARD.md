# Quality Scorecard

Scores are evidence-based and cover implementation through the completed Phase 4 commerce-ingestion slice.

| Category                      |  Weight | Current | Evidence                                                                                                                                                 |
| ----------------------------- | ------: | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional/domain correctness |      20 |      15 | Approved Rosy behavior plus signed WooCommerce intake and canonical normalization are implemented; ledger persistence is next                            |
| Security/tenant isolation     |      20 |      19 | Tenant RLS plus raw-body HMAC, private payload storage, secret-file lookup, narrow runtime commands, replay fences, and cross-tenant tests execute in CI |
| Ledger integrity/reliability  |      15 |      10 | Durable inbox/outbox and layered idempotency are implemented; double-entry accounts, lots, projections, and value commands remain Phase 5                |
| Test strength                 |      15 |      15 | Format/lint/types/build, 26 unit tests, static gates, double migration replay/reset/seed, and 87 pgTAP assertions pass on exact-head Linux/Docker CI     |
| Performance/storefront        |      10 |       5 | Responsive Overview passes desktop/mobile browser QA; no critical-path load measurements exist                                                           |
| Observability/operability     |      10 |       7 | SLI definitions, queue/ledger signals, pinned Supabase deployment, restore drill, and incident first actions are defined; no real deployment evidence    |
| Documentation/maintainability |      10 |      10 | Accepted ADR, executable examples, operating files, task graph, pinned workflows, preserved sources, and QA evidence exist                               |
| **Total**                     | **100** |  **81** | Phase 4 ingestion is execution-verified; ledger, full connector recovery, load, restore, and production operations remain substantial gates              |

Automatic fail remains active until ledger integrity and backup/restore verification exist. A higher total cannot override those missing critical gates.
