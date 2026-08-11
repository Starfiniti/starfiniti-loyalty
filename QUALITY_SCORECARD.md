# Quality Scorecard

Scores are evidence-based and apply only to the current Phase 0 bootstrap slice.

| Category                      |  Weight | Current | Evidence                                                                                                                       |
| ----------------------------- | ------: | ------: | ------------------------------------------------------------------------------------------------------------------------------ |
| Functional/domain correctness |      20 |       8 | Integer value primitives and versioned commerce-envelope contracts have four passing tests; loyalty semantics remain Phase 1   |
| Security/tenant isolation     |      20 |      10 | Secret scan and static exposure checks pass; transactional pgTAP guards exist but await Docker execution                       |
| Ledger integrity/reliability  |      15 |       4 | Immutable-ledger invariants and transaction boundaries are documented; ledger is not implemented                               |
| Test strength                 |      15 |      11 | Format/lint/types/build, four unit tests, CI contract validation, and pgTAP harness pass statically; execution remains pending |
| Performance/storefront        |      10 |       5 | Responsive Overview passes desktop/mobile browser QA; no load measurement yet                                                  |
| Observability/operability     |      10 |       6 | Standalone health/assets, Proxmox contract, backup targets, status and runbook framework exist                                 |
| Documentation/maintainability |      10 |      10 | Operating files, task graph, ADRs, pinned workflows, database test guide, preserved sources, and QA report exist               |
| **Total**                     | **100** |  **54** | Honest early-product score; Phase 0 awaits executed database evidence                                                          |

Automatic fail remains active until tenant isolation, ledger, backup/restore, and Docker-backed migration verification exist. The Overview visual slice independently passed `design-qa.md`.
