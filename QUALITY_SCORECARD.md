# Quality Scorecard

The engineering score is evidence-based for the exact integration candidate and
does not claim deployment or product readiness. Whole-product scoring below keeps
deployed production separate from the unmerged candidate.

| Category                      |  Weight | Current | Evidence                                                                                                                                                                |
| ----------------------------- | ------: | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional/domain correctness |      20 |      20 | Rosy evaluation, immutable programme/ledger, order awards, cumulative refunds, and coupon issue/capture/cancel compensation execute deterministically                   |
| Security/tenant isolation     |      20 |      19 | Tenant RLS, raw-body HMAC, encrypted plugin key, private queues, narrow roles, replay fences, and cross-tenant tests execute in CI                                      |
| Ledger integrity/reliability  |      15 |      15 | Immutable zero-sum entries, origin-preserving reservations, layered idempotency, deterministic locks, compensation, races, and property probes pass                     |
| Test strength                 |      15 |      15 | 995 workspace tests, 3,773 CI-passed pgTAP assertions, 22 concurrency probes, browser QA, and four WooCommerce runtimes                                                 |
| Performance/storefront        |      10 |       7 | Checkout performs no hub call, responsive browser QA passes, and two fixed-arrival drivers validate; approved production-like load measurements remain absent           |
| Observability/operability     |      10 |       9 | Tenant queue health/issues, minimized support bundle, safe replay/reconciliation, exact reporting, worker leases, watermarks, SLOs, and recovery procedures are defined |
| Documentation/maintainability |      10 |      10 | Accepted ADRs, executable examples, operating files, task graph, integration/API docs, tag-derived package verification, and evidence remain versioned                  |
| **Total**                     | **100** |  **95** | Exact candidate implementation quality is strong; the real-store pilot, full recovery, live operations, and load evidence remain automatic release gates                |

Automatic fail remains active until complete application/Auth/signing-secret recovery and the real-store pilot exist. A higher total cannot override that missing critical gate.

## Whole-product readiness

Engineering quality and product completeness are deliberately separate. ADR-0080
and the machine-readable V2 score keep deployed production and the integration
candidate distinct. The digest-bound V1 production score remains preserved.

<!-- product-score:v2 production=54 candidate=83 target=90 eligible=false -->

| Category              | Weight | Production v0.1.11 | Integration candidate | Primary remaining gap                                                          |
| --------------------- | -----: | -----------------: | --------------------: | ------------------------------------------------------------------------------ |
| Activation            |     10 |                  3 |                     3 | No approved real-store value and outage sequence                               |
| Feature breadth       |     25 |                 10 |                    24 | M04-M14 are implemented but unmerged, disabled, and uncanaried                 |
| Merchant usability    |     15 |                 11 |                    14 | Approved production observation remains                                        |
| Customer value        |     15 |                  5 |                    13 | Real-store customer validation and delivery observation remain                 |
| Reliability           |     15 |                 13 |                    13 | Real-store outage and complete full-service recovery proof                     |
| Operations            |     10 |                  8 |                     8 | Live monitoring, capacity/fault exercises, recovery, and 30-day observation    |
| Enterprise/commercial |     10 |                  4 |                     8 | Enterprise IdP, provider, metering, and managed billing canaries               |
| **Total**             |    100 |             **54** |                **83** | Target is 90, every category must reach 80%, and automatic failures must clear |

The candidate score is the development-prioritization subject, not a production or
completion claim. Deployed production is the only completion subject. Both remain
ineligible because activation is below its mandatory category floor and the required
real-store/canary/recovery evidence is absent. The deployed production score remains
54 until a reviewed release and live evidence change it.

Every module also requires at least 90/100 and at least 80% of every relevant category. Unexplained value differences, cross-tenant access, duplicate effects, checkout dependency, missing recovery/canary evidence, or unresolved critical/high findings fail the gate regardless of score.

M15-S06 is provisionally 77/100 across correctness, security, ledger reliability, tests, performance, operability, and maintainability. Performance and operability are below their mandatory floors, and 45 live/module/approval checks remain pending. The 95/100 engineering score, 54/100 deployed-production score, and 83/100 integration-candidate score cannot override the real-store, module closeout, capacity, recovery, monitoring, independent security, 30-day canary, reconciliation, claims, or owner-approval gates.

M16 is provisionally 77/100 with correctness 17/20, security 12/15, ledger reliability 12/15, tests 15/15, performance 5/10, operability 2/10, and maintainability 14/15. Its 39-check gate has seven repository controls passing and 32 elapsed-cadence, source, exercise, reconciliation, review, and approval checks pending. The evidence-ranked backlog contains fourteen exact blockers after separately ranking the approved capacity and fault exercises. Performance and operability are below their mandatory floors; source-controlled fixtures prove only that honest closeout is representable, never that two monthly reviews or a quarterly bundle occurred.

The 2026-08-30 ADR-0106 dependency patch review does not raise any score. It
binds three exact compatible federation/notification patches and thirty-two
fail-closed corruption cases while retaining the application-level SAML and
SMTP controls. Its complete local gate passes 997 workspace tests and both
production builds, but it adds no elapsed monthly review, live canary,
deployment, or reconciliation evidence. M16 therefore remains 77/100, the
integration candidate remains 83/100, and deployed production remains 54/100.

The 2026-08-28 merge-readiness review does not raise any module score. It removes impossible V2-V5 public application fallbacks, binds V6 display currency to the immutable published programme, repairs reward-editor row identity, and consolidates the shared M04-M14 manifest/artifact primitives. Focused tests and all eleven module validators pass, but M09 remains 88/100 until approved production canary, rollback, observation, and exact reconciliation evidence exists.

The 2026-08-29 authentication regression correction was rescored against exact integrated candidate `1e55a82`. Production-rendered desktop, mobile, and compact keyboard evidence improves the M09 usability proof, but it adds no live activation, deployment, recovery, rollback, observation, or reconciliation evidence. M09 therefore remains 88/100, the integration candidate remains 83/100, and deployed production remains 54/100.
