# M07 Production Artifact Contract

This contract defines the minimized evidence required before `M07-CAMPAIGNS`
can close. The executable authority is
`scripts/validate-campaign-canary-evidence.mjs`; this document explains the
operator-facing shape.

Every artifact uses `starfiniti.campaign-canary-artifact.v1`, names one exact
artifact ID, binds the candidate commit and mandatory checks, records a
canonical UTC observation time, reports `verified`, and is stored as a unique
regular JSON file of at most 256 KiB under
`docs/plan/evidence/M07/production/`. The manifest binds its exact SHA-256
digest. Evidence must not contain customer or row identity, assignments, salts,
source references, reusable signing material, coupon plaintext, raw payloads or
errors, or private ledger metadata.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read_only_baseline`    | Exact public HTTP/DNS results, distinct running application/database VMs, read-only scope, and zero mutations. Values must match the manifest baseline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `release_inventory`     | Release and commit distinct from current production; exact PR/commit identity; distinct dashboard, worker, WooCommerce plugin, migration, campaign, programme, and reward-contract digests; campaign, worker, and native-reward features disabled; zero migration difference; exact assertions.                                                                                                                                                                                                                                                                                                                          |
| `approval_record`       | Exact release, pilot-store, and canary approvals with individual UTC times and unique evidence digests; approved distinct pilot/control, rollout, value-ceiling, control-assignment, schedule, and observation policies; bounded numeric audience, points, quantity, liability, and per-member limits; exact bindings to every other artifact.                                                                                                                                                                                                                                                                           |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, application-configuration, connector-signing-reference, plugin-rollback-package, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact assertions.                                                                                                                                                                                                                                                                                                                                                   |
| `production_baseline`   | Exact capture time; distinct programme, audience, snapshot, campaign, assignment, capacity, job, ledger, lot, reservation, native-command, result, connector, and checkout digests; complete coverage; all campaign features disabled; no pending accepted work; zero ledger/coupon/value difference or mutation.                                                                                                                                                                                                                                                                                                        |
| `canary_journal`        | One exact pilot and control organization; approved policies and numeric ceilings; exact released images/plugin/contracts; exact audience, liability, approval/control, DST/lifecycle, seven campaign behavior, limited/native reward, capacity/member cap, control, refund, source-change, failure/retry, selector, tenant, checkout, and privacy evidence; bounded positive exercise/work counts; zero arbitrary SQL, mixed snapshot, schedule drift, oversubscription, stacking, duplicate effect, refund gap, liability/expiry/selector drift, retry storm, exposure, checkout block, stranding, or value difference. |
| `reconciliation_report` | The same campaign evidence digests and all exercise/work counts as the journal; distinct audience, snapshot, campaign, assignment, capacity, control, ledger, lot, reservation, native-command, queue, result, refund, and checkout totals; complete bounded convergence; zero audience, capacity, control, value, refund, native, queue, result, checkout, privacy, tenancy, ambiguity, or Critical/High difference.                                                                                                                                                                                                    |
| `rollback_report`       | Exact measured duration after canary end; campaign/worker/native-reward features stopped; accepted work drained or held; prior images/plugin restored; audiences, snapshots, campaigns, assignments, capacity, ledger, native states, reversals, results, customer access, and checkout preserved; zero stranding, duplicate effect, capacity, ambiguity, ledger, coupon, or customer-value difference.                                                                                                                                                                                                                  |
| `observation_report`    | At least 24 hours covering the canary with hourly-or-better sampling and the approved observation-policy digest; approved audience, schedule, execution, native-reward, result, checkout, load, and queue measurements; the same campaign/work counts as the journal; zero stranding, duplicate effect, oversubscription, refund gap, retry storm, selector drift, privacy, tenancy, checkout, audience, capacity, queue, ledger, coupon, value, ambiguity, or Critical/High failure.                                                                                                                                    |

## Cross-artifact reconciliation and chronology

Approval and journal bind the same pilot/control, rollout, value-ceiling,
control-assignment, schedule, and observation policies plus identical audience,
points, quantity, liability, and per-member limits. Release and journal bind the
same images, WooCommerce plugin, migration inventory, and campaign/programme/
reward contracts. Every audience, liability, control, schedule, lifecycle,
behavior, capacity, refund, retry, selector, tenant, checkout, and privacy
evidence digest must match between journal and reconciliation. Every journal
exercise/work count must match both reconciliation and observation. Observation
uses the same approved policy.

The read-only operator baseline, every prerequisite approval, release inventory,
verified recovery point, and production baseline must strictly precede canary
start. Reconciliation and rollback must strictly follow canary end. Observation
must cover the canary for at least 24 hours. Final approval must bind the same
release and every other artifact, follow reconciliation, rollback, and
observation, and strictly precede the manifest observation time.

All artifact paths and digests must be distinct. A valid digest over an empty,
renamed, incomplete, count-mismatched, nonzero-difference, temporally impossible,
short, relabelled, or differently approved body fails closed. Pending artifacts
must keep both path and digest `null`.
