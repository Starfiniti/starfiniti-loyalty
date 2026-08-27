# M09 Production Artifact Contract

This contract defines the minimized evidence required before
`M09-STOREFRONT-EXPERIENCE` can close. The executable authority is
`scripts/validate-storefront-canary-evidence.mjs`; this document explains the
operator-facing shape.

Every artifact uses `starfiniti.storefront-canary-artifact.v1`, names one exact
artifact ID, binds the candidate commit and mandatory checks, records a
canonical UTC observation time, reports `verified`, and is stored as a unique
regular JSON file of at most 256 KiB under
`docs/plan/evidence/M09/production/`. The manifest binds its exact SHA-256
digest. Evidence must not contain contact or row identity, raw storefront or
connector payloads, reusable download/signing material, coupon plaintext,
private selectors, or ledger metadata.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_only_baseline`    | Exact public HTTP/DNS results, distinct running application/database VMs, read-only scope, and zero mutations. Values must match the manifest baseline.                                                                                                                                                                                                                                                                                                                                                                               |
| `release_inventory`     | Approved release and commit both distinct from current production plus exact PR/commit identity; distinct dashboard, worker, WooCommerce plugin, migration, and experience-contract digests; hosted, classic, Blocks-data, and Blocks-panel features disabled; zero migration difference; exact assertions.                                                                                                                                                                                                                           |
| `approval_record`       | Exact release, pilot-store, and canary approvals with individual UTC times and unique evidence digests; approved distinct pilot/control scope, rollout, experience-contract, asset-budget, and observation policies; bounded numeric snapshot, selector, and compressed Blocks budgets; exact bindings to every other artifact.                                                                                                                                                                                                       |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, application-configuration, connector-signing-reference, plugin-rollback-package, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact assertions.                                                                                                                                                                                                                                                                |
| `production_baseline`   | Exact capture time; distinct minimized snapshot, ledger, lot, wallet, reservation, commerce-event, command/queue, native-coupon, WordPress-cache, presentation, and checkout digests; complete coverage; all storefront features disabled; no pending accepted work; zero ledger/coupon difference or mutation.                                                                                                                                                                                                                       |
| `canary_journal`        | One exact pilot and control scope; approved policies and numeric budgets; exact released images, plugin, migrations, and experience contract; one hosted public/member/editor exercise; English-only delivery; accepted plus five rejected snapshot cases; all five classic placements; staged Blocks data/panel; no-script, native-coupon, Hub-outage, worker-outage/recovery, privacy, accessibility, payload, and checkout evidence; zero non-canary access, value duplication, stranding, exposure, checkout block, or ambiguity. |
| `reconciliation_report` | The same hosted public/member, presentation, local-snapshot, coupon, outage, privacy, and accessibility evidence and exact surface, WooCommerce, outage, recovery, and accepted-work counts as the journal; distinct ledger, lot, wallet, reservation, commerce, command/queue, WordPress-cache, presentation, and native-coupon totals; complete bounded convergence; zero value, queue, checkout, accessibility, privacy, tenancy, language, ambiguity, or Critical/High difference.                                                |
| `rollback_report`       | Exact measured duration after canary end; hosted/classic/Blocks features disabled; accepted work drained or held; prior images and plugin restored; last valid snapshot, native coupon, customer value access, checkout, immutable history, and audit preserved; zero stranding, duplicate value, ambiguity, ledger, coupon, or customer-value difference.                                                                                                                                                                            |
| `observation_report`    | At least 24 hours covering the canary with hourly-or-better sampling and the approved observation-policy digest; approved hosted/editor/WooCommerce/checkout latency and load measurements; the same canary surface/outage/recovery/work counts; positive accessibility, stale, and offline exercises; zero stranding, duplicate value, privacy, tenancy, browser-authority, language, checkout, presentation, snapshot, ledger, queue, coupon, value, ambiguity, or Critical/High failure.                                           |

## Cross-artifact reconciliation and chronology

Approval and journal bind the same distinct pilot/control scope, rollout,
experience-contract, asset-budget, observation policy, and numeric limits.
Release and journal bind the same images, WooCommerce plugin, migration
inventory, and experience contract. Journal hosted public/member, presentation,
local-snapshot, native-coupon, Hub-outage, worker-outage, privacy, and
accessibility evidence must match reconciliation; surface, outage, recovery, and
accepted-work counts must match reconciliation and observation. Observation uses
the same approved policy.

The read-only operator baseline, every prerequisite approval, release inventory,
verified recovery point, and production baseline must precede canary start.
Reconciliation must follow canary end, and rollback must start after it.
Observation must cover the canary for at least 24 hours. Final approval must bind
the same release and every other artifact, follow reconciliation, rollback, and
observation, and precede the manifest observation time.

All artifact paths and digests must be distinct. A valid digest over an empty,
renamed, incomplete, count-mismatched, nonzero-difference, non-English,
temporally impossible, or differently approved body fails closed. Pending
artifacts must keep both path and digest `null`.
