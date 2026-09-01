# M04 Production Artifact Contract

This contract defines the minimized evidence required before
`M04-REWARDS-AND-FULFILMENT` can close. The executable authority is
`scripts/validate-rewards-canary-evidence.mjs`; this document explains the
operator-facing shape.

Every artifact uses `starfiniti.rewards-canary-artifact.v1`, names one exact
artifact ID, binds the candidate commit and mandatory checks, records a
canonical UTC observation time, reports `verified`, and is stored as a unique
regular JSON file of at most 256 KiB under
`docs/plan/evidence/M04/production/`. The manifest binds its exact SHA-256
digest. Evidence must not contain customer, tenant, wallet, reservation, case,
connection, Auth, or commerce identity; reusable signing material; coupon
plaintext; raw payloads or errors; or ledger metadata.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read_only_baseline`    | Exact public HTTP/DNS results, distinct running application/database VMs, read-only scope, and zero mutations. Values must match the manifest baseline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `release_inventory`     | Release distinct from current production; exact PR/commit identity; distinct dashboard, worker, WooCommerce plugin, migration, reward, programme, redemption, command, and manual-fulfilment contract digests; expanded rewards, worker, and manual fulfilment disabled; zero migration difference; exact assertions.                                                                                                                                                                                                                                                                                                                                              |
| `approval_record`       | Exact release and prerequisite approvals with individual UTC times and unique evidence digests; approved pilot, rollout, value-ceiling, availability, stacking, native/manual fulfilment, ambiguity, and observation policies; bounded customer, effect, points, quantity, liability, manual-case, and reservation limits; exact bindings to every other artifact.                                                                                                                                                                                                                                                                                                 |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, application-configuration, connector-signing-reference, plugin-rollback-package, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact assertions.                                                                                                                                                                                                                                                                                                                                                                                             |
| `production_baseline`   | Exact capture time; distinct programme, reward, wallet, ledger, lot, reservation, capacity, native-command, coupon, manual-case, queue, connector, and checkout digests; complete coverage; all expanded-reward capabilities disabled; no pending accepted work; zero value, queue, privacy, or mutation difference.                                                                                                                                                                                                                                                                                                                                               |
| `canary_journal`        | One exact pilot organization; approved policies and ceilings; exact released images/plugin/contracts; exact native capability, merchant/customer workflow, historical compatibility, fixed/percentage/free-shipping/free-product, restriction/capacity/member-limit, cancellation/expiry, manual fulfilment/compensation, ambiguity recovery, outage, tenancy, privacy, deterministic-failure, and retry evidence; exact bounded counts; zero unsupported-value, duplicate, oversubscription, authority, tenancy, checkout, stranding, ledger, balance, lot, reservation, capacity, command, coupon, case, queue, privacy, ambiguity, or Critical/High difference. |
| `reconciliation_report` | The same reward evidence digests and scenario/work counts as the journal; distinct reward, wallet, ledger, lot, reservation, capacity, command, coupon, manual-case, queue, and checkout totals; complete bounded convergence; every required difference exactly zero.                                                                                                                                                                                                                                                                                                                                                                                             |
| `rollback_report`       | Exact measured duration after canary end; expanded rewards/manual fulfilment stopped; accepted work drained or held; prior images/plugin restored; reward definitions, reservations, capacity, native states, manual cases, ledger, customer access, and checkout preserved; every required difference exactly zero.                                                                                                                                                                                                                                                                                                                                               |
| `observation_report`    | At least 24 hours covering the canary with hourly-or-better sampling and the approved observation-policy digest; bounded reservation, native-command, manual-case, reconciliation, customer-reward, checkout, load, and queue measurements; the same scenario/work counts as the journal; every required difference exactly zero.                                                                                                                                                                                                                                                                                                                                  |

## Cross-artifact reconciliation and chronology

Approval and journal bind the same pilot, rollout, reward-value, availability,
stacking, fulfilment, ambiguity, and observation policies plus identical
numeric ceilings. Release and journal bind the same images, WooCommerce plugin,
migration inventory, and reward/programme/redemption/command/manual contracts.
Every reward behavior, recovery, outage, tenancy, privacy, failure, and retry
evidence digest must match between journal and reconciliation. Every journal
scenario/work count must match both reconciliation and observation. Observation
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
