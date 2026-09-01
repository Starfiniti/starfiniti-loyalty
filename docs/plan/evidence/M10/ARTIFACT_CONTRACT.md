# M10 Production Artifact Contract

This contract defines the minimized evidence required before `M10-ANALYTICS`
can close. The executable authority is
`scripts/validate-analytics-canary-evidence.mjs`; this document explains the
operator-facing shape.

Every artifact uses `starfiniti.analytics-canary-artifact.v1`, names one exact
artifact ID, binds the candidate commit and mandatory checks, records a
canonical UTC observation time, reports `verified`, and is stored as a unique
regular JSON file of at most 256 KiB under
`docs/plan/evidence/M10/production/`. The manifest binds its exact SHA-256
digest. Evidence must not contain contact or row identity, raw report payloads,
reusable download/signing material, coupons, private selectors, or ledger
metadata.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read_only_baseline`    | Exact public HTTP/DNS results, distinct running application/database VMs, read-only scope, and zero mutations. Values must match the manifest baseline.                                                                                                                                                                                                                                                                                                                                                                  |
| `release_inventory`     | Approved release distinct from current production plus exact PR/commit identity; distinct dashboard, worker, migration, analytics-contract, and Dictionary V4 digests; navigation, entitlement, and reporting worker disabled; zero migration difference; exact assertions.                                                                                                                                                                                                                                              |
| `approval_record`       | Exact release, pilot-store, and canary approvals with individual UTC times and unique evidence digests; approved distinct pilot/control scope, analytics policy, export-ceiling policy and numeric byte limit, and observation policy; exact bindings to every other artifact.                                                                                                                                                                                                                                           |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, application-configuration, reporting-reference, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact assertions.                                                                                                                                                                                                                                                                                    |
| `production_baseline`   | Exact capture time; distinct minimized ledger, lot, wallet projection, commerce, programme, cohort, report/export, schedule/job, payload/capability, queue, checkout/privacy, and full-snapshot digests; complete coverage; no active analytics capability/worker or accepted work; zero ledger difference/mutation.                                                                                                                                                                                                     |
| `canary_journal`        | Bounded distinct pilot/control scope and approved policy/ceiling/window digests and numeric export limit; one exact shared snapshot and Dictionary V4 digest, 103 Dictionary V4 metrics, all four reports, one bounded aggregate export/download, one exact schedule occurrence, one reporting-worker restart, handled timeout, two accepted work items, and complete source coverage; zero non-canary enablement, duplicate, replay success, exposure, protected-path failure, checkout block, stranding, or ambiguity. |
| `reconciliation_report` | The same snapshot, Dictionary V4, report bundle, export source/response, schedule occurrence, and exact export/download/schedule counts as the journal; distinct value-truth, commerce, programme-outcome, and cohort total digests; exact Dictionary V4 coverage; explicit unavailable monetary liability, mixed-currency conversion, prediction, and statistical-significance states, descriptive influenced revenue, and evidence-gated incrementality; zero value, privacy, checkout, or Critical/High difference.   |
| `rollback_report`       | Exact measured duration after canary end; analytics disabled and reporting stopped; accepted work drained or held; prior images restored; access, checkout, immutable history, payload expiry, and audit history preserved; zero stranded work, replay success, ambiguity, ledger, or loyalty-value difference.                                                                                                                                                                                                          |
| `observation_report`    | At least 24 hours covering the canary with hourly-or-better sampling and the approved observation-policy digest; approved latency/load measurements; the same export/download/schedule/restart/timeout scope as the journal; explicit stale/unavailable states; zero stranding, replay, privacy/access/checkout failure, snapshot/report/ledger/queue/value difference, or Critical/High finding.                                                                                                                        |

## Cross-artifact reconciliation and chronology

Approval and journal bind the same distinct pilot/control scope, analytics
policy, export-ceiling policy and numeric byte limit, and observation policy.
Release, journal, and reconciliation bind the same Dictionary V4 digest. Journal
snapshot, report, export, download, and exact schedule-occurrence evidence must
match reconciliation; its observation-policy digest and effect counts must match
observation.
The read-only operator baseline and every prerequisite approval plus release
inventory, verified recovery point, and production baseline must precede canary start. Reconciliation must follow
canary end, and rollback must start after it. Observation must cover the canary
for at least 24 hours. Final approval must bind the same release and every other
artifact, follow reconciliation, rollback, and observation, and precede the
manifest observation time.

All artifact paths and digests must be distinct. A valid digest over an empty,
renamed, incomplete, count-mismatched, nonzero-difference, causally overstated,
temporally impossible, or differently approved body fails closed. Pending
artifacts must keep both path and digest `null`.
