# Quality Scorecard

Scores are evidence-based and cover implementation through the completed Phase 0 bootstrap slice.

| Category                      |  Weight | Current | Evidence                                                                                                                        |
| ----------------------------- | ------: | ------: | ------------------------------------------------------------------------------------------------------------------------------- |
| Functional/domain correctness |      20 |       8 | Integer value primitives and versioned commerce-envelope contracts have four passing tests; loyalty semantics remain Phase 1    |
| Security/tenant isolation     |      20 |      12 | Secret scan and static exposure checks pass; transactional schema, grant, RLS, and privileged-function pgTAP guards pass on CI  |
| Ledger integrity/reliability  |      15 |       4 | Immutable-ledger invariants and transaction boundaries are documented; ledger is not implemented                                |
| Test strength                 |      15 |      13 | Format/lint/types/build, four unit tests, CI contract validation, migration replay, seed, and eight pgTAP assertions pass       |
| Performance/storefront        |      10 |       5 | Responsive Overview passes desktop/mobile browser QA; no load measurement yet                                                   |
| Observability/operability     |      10 |       6 | Standalone health/assets, Proxmox contract, backup targets, status and runbook framework exist                                  |
| Documentation/maintainability |      10 |      10 | Operating files, task graph, ADRs, pinned workflows, database test guide, preserved sources, and QA report exist                |
| **Total**                     | **100** |  **58** | Phase 0 is verified; the score remains intentionally low until value semantics, tenancy, ledger, and operations are implemented |

Automatic fail remains active until full tenant isolation, ledger, and backup/restore verification exist. Docker-backed migration verification now passes. The Overview visual slice independently passed `design-qa.md`.
