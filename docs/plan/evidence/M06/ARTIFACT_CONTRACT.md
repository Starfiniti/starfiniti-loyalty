# M06 Production Artifact Contract

This contract defines the minimized evidence required before `M06-REFERRALS`
can close. The executable authority is
`scripts/validate-referral-canary-evidence.mjs`; this document explains the
operator-facing shape.

Every artifact uses `starfiniti.referral-canary-artifact.v1`, names one exact
artifact ID, binds the candidate commit and mandatory checks, records a
canonical UTC observation time, reports `verified`, and is stored as a unique
regular JSON file of at most 256 KiB under
`docs/plan/evidence/M06/production/`. The manifest binds its exact SHA-256
digest. Evidence must not contain customer, channel, network, payment, shipping,
or address identity; raw fingerprints; reusable signing material; coupon
plaintext; raw payloads or errors; or private ledger metadata.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_only_baseline`    | Exact public HTTP/DNS results, distinct running application/database VMs, read-only scope, and zero mutations. Values must match the manifest baseline.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `release_inventory`     | Release distinct from current production; exact PR/commit identity; distinct dashboard, worker, WooCommerce plugin, migration, referral, programme, and reward-contract digests; referral feature, worker, and experience disabled; zero migration difference; exact assertions.                                                                                                                                                                                                                                                                                                                                      |
| `approval_record`       | Exact release, pilot-store, and canary approvals with individual UTC times and unique evidence digests; approved pilot, rollout, value-ceiling, attribution, cooling, fraud-review, risk-retention, and observation policies; bounded customer, reward-effect, points, cooling, and retention ceilings; exact bindings to every other artifact.                                                                                                                                                                                                                                                                       |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, application-configuration, connector-signing-reference, plugin-rollback-package, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact assertions.                                                                                                                                                                                                                                                                                                                                                |
| `production_baseline`   | Exact capture time; distinct programme, policy, attribution, qualification, review, job, ledger, lot, reservation, native-command, fingerprint, connector, and checkout digests; complete coverage; all referral capabilities disabled; no pending accepted work; zero ledger, coupon, value, privacy, or mutation difference.                                                                                                                                                                                                                                                                                        |
| `canary_journal`        | One exact pilot organization; approved policy and numeric ceilings; exact released images/plugin/contracts; exact opaque-link, first-attribution/window, self-referral, identity/velocity risk, new-customer/cooling, pre/post-refund, give/get, review, recovery, customer/merchant, tenant, checkout, privacy, failure, and retry evidence; exact bounded scenario/work counts; zero identity leak, self-referral value, multiple attribution, browser authority, early/duplicate/partial value, refund gap, review bypass, retry escape, over-retention, exposure, checkout block, stranding, or value difference. |
| `reconciliation_report` | The same referral evidence digests and all scenario/work counts as the journal; distinct policy, attribution, qualification, review, job, ledger, lot, reservation, native-command, fingerprint, queue, refund, and checkout totals; complete bounded convergence; zero state, value, privacy, tenancy, ambiguity, or Critical/High difference.                                                                                                                                                                                                                                                                       |
| `rollback_report`       | Exact measured duration after canary end; referral feature/worker/experience stopped; accepted work drained or held; prior images/plugin restored; policies, attribution, qualification, reviews, jobs, ledger, risk-retention, compensation, customer access, and checkout preserved; zero stranding, duplicate effect, ambiguity, ledger, coupon, or customer-value difference.                                                                                                                                                                                                                                     |
| `observation_report`    | At least 24 hours covering the canary with hourly-or-better sampling and the approved observation-policy digest; bounded attribution, qualification, review, reward, customer-experience, checkout, load, and queue measurements; the same scenario/work counts as the journal; zero stranding, duplicate/early/partial value, refund gap, review/recovery/privacy/tenancy/checkout failure, state/queue/value difference, ambiguity, or Critical/High finding.                                                                                                                                                       |

## Cross-artifact reconciliation and chronology

Approval and journal bind the same pilot, rollout, value-ceiling, attribution,
cooling, fraud-review, retention, and observation policies plus identical
customer, reward-effect, points, cooling, and retention limits. Release and
journal bind the same images, WooCommerce plugin, migration inventory, and
referral/programme/reward contracts. Every referral behavior, value, review,
recovery, customer/merchant, tenant, checkout, privacy, failure, and retry
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
