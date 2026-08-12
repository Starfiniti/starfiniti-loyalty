# Quality Scorecard

Scores are evidence-based and cover implementation through the completed Phase 6 programme-engine slice.

| Category                      |  Weight | Current | Evidence                                                                                                                                                 |
| ----------------------------- | ------: | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional/domain correctness |      20 |      19 | Rosy configuration, deterministic award/simulation, immutable publication, tier history, rewards, expiry, commerce intake, and ledger operations execute |
| Security/tenant isolation     |      20 |      19 | Tenant RLS plus raw-body HMAC, private payload storage, secret-file lookup, narrow runtime commands, replay fences, and cross-tenant tests execute in CI |
| Ledger integrity/reliability  |      15 |      15 | Immutable zero-sum entries, idempotency/event fences, deterministic locks, FIFO lots, negative reversals, rebuilds, and concurrent overspend tests pass  |
| Test strength                 |      15 |      15 | Format/lint/types/build, 43 unit tests, static gates, double migration replay/reset/seed, 260 pgTAP assertions, and race/property probes pass in CI      |
| Performance/storefront        |      10 |       5 | Responsive Overview passes desktop/mobile browser QA; no critical-path load measurements exist                                                           |
| Observability/operability     |      10 |       7 | SLI definitions, queue/ledger signals, pinned Supabase deployment, restore drill, and incident first actions are defined; no real deployment evidence    |
| Documentation/maintainability |      10 |      10 | Accepted ADR, executable examples, operating files, task graph, pinned workflows, preserved sources, and QA evidence exist                               |
| **Total**                     | **100** |  **90** | Phase 6 programme execution is verified; full connector recovery, load, restore, and production operations remain                                        |

Automatic fail remains active until backup/restore verification exists. A higher total cannot override that missing critical gate.
