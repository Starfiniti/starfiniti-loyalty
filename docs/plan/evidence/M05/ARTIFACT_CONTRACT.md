# M05 Production Artifact Contract

This contract defines the minimized evidence required before
`M05-VIP-AND-EXPIRY` can close. The executable authority is
`scripts/validate-vip-canary-evidence.mjs`; this document explains the
operator-facing shape.

Every artifact uses `starfiniti.vip-canary-artifact.v1`, names one exact
artifact ID, binds the candidate commit and mandatory checks, records a
canonical UTC observation time, reports `verified`, and is stored as a unique
regular JSON file of at most 256 KiB under
`docs/plan/evidence/M05/production/`. The manifest binds its exact SHA-256
digest. Evidence must not contain customer, tenant, wallet, reservation, case,
connection, Auth, or commerce identity; reusable signing material; coupon
plaintext; raw payloads or errors; private qualification facts; or ledger
metadata.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read_only_baseline`    | Exact public HTTP/DNS results, distinct running application/database VMs, read-only scope, and zero mutations. Values must match the manifest baseline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `release_inventory`     | Release distinct from current production; exact PR/commit identity; distinct dashboard, worker, WooCommerce plugin, migration, VIP, programme, reward, and notification-contract digests; advanced VIP feature, worker, and experience disabled; zero migration difference; exact assertions.                                                                                                                                                                                                                                                                                                                                                                                        |
| `approval_record`       | Exact release, pilot-store, and canary approvals with individual UTC times and unique evidence digests; approved pilot, rollout, qualification, lifecycle, benefit, override, expiry, reminder, and observation policies; bounded member, benefit, adjusted-points, expiry-points, grace, and override limits; exact bindings to every other artifact.                                                                                                                                                                                                                                                                                                                               |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, application-configuration, connector-signing-reference, plugin-rollback-package, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact assertions.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `production_baseline`   | Exact capture time; distinct programme, tier-policy, fact, decision, override, benefit, expiry-policy/lot, reminder, ledger, notification, connector, and checkout digests; complete coverage; all advanced VIP capabilities disabled; no pending accepted work; zero value, notification, privacy, or mutation difference.                                                                                                                                                                                                                                                                                                                                                          |
| `canary_journal`        | One exact pilot organization; approved policies and numeric ceilings; exact released images/plugin/contracts; exact 36-case V1/V2 shadow parity, lifetime/rolling/calendar qualification, AND/OR thresholds, upgrade/grace/downgrade, refund/backdating, override/expiry, multiplier/reward/free-shipping/early-access/custom-perk, expiry preview/reminder/sweep/restoration, progress/performance, tenant, checkout, privacy, failure, and retry evidence; exact bounded scenario/work counts; zero rewrite, parity, timezone, ordering, refund, duplicate, authority, benefit-rate, attribution, notice, tenancy, checkout, stranding, notification, ledger, or value difference. |
| `reconciliation_report` | The same VIP evidence digests and all scenario/work counts as the journal; distinct policy, fact, decision, override, benefit, expiry, reminder, ledger, notification, queue, and checkout totals; complete bounded convergence; zero history, multiplier, liability, value, privacy, tenancy, ambiguity, or Critical/High difference.                                                                                                                                                                                                                                                                                                                                               |
| `rollback_report`       | Exact measured duration after canary end; advanced VIP feature/worker/experience stopped; accepted work drained or held; prior images/plugin restored; policies, facts, history, overrides, benefits, expiry lots/policies, reminders, ledger, customer access, and checkout preserved; zero stranding, duplicate decision, liability, notification, ambiguity, ledger, or customer-value difference.                                                                                                                                                                                                                                                                                |
| `observation_report`    | At least 24 hours covering the canary with hourly-or-better sampling and the approved observation-policy digest; bounded qualification, lifecycle, benefit, expiry, progress, checkout, load, and queue measurements; the same scenario/work counts as the journal; zero parity, benefit, expiry-attribution, notice, history, multiplier, liability, notification, privacy, tenancy, checkout, queue, ledger, value, ambiguity, or Critical/High failure.                                                                                                                                                                                                                           |

## Cross-artifact reconciliation and chronology

Approval and journal bind the same pilot, rollout, qualification, lifecycle,
benefit, override, expiry, reminder, and observation policies plus identical
member, benefit, points, grace, and override limits. Release and journal bind
the same images, WooCommerce plugin, migration inventory, and VIP/programme/
reward/notification contracts. Every shadow, qualification, lifecycle, benefit,
expiry, progression, tenant, checkout, privacy, failure, and retry evidence
digest must match between journal and reconciliation. Every journal
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
