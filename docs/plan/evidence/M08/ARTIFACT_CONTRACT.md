# M08 Production Artifact Contract

This contract defines the minimized evidence required before `M08-NOTIFICATIONS`
can close. The executable authority is
`scripts/validate-notification-canary-evidence.mjs`; this document explains the
operator-facing shape.

Every artifact uses `starfiniti.notification-canary-artifact.v1`, names one
exact artifact ID, binds the candidate commit and mandatory checks, records a
canonical UTC observation time, reports `verified`, and is stored as a unique
regular JSON file of at most 256 KiB under
`docs/plan/evidence/M08/production/`. The manifest binds its exact SHA-256
digest. Evidence must not contain contact or row identity, reusable provider or
signing material, raw payloads or rendered content, provider response bodies,
coupon plaintext, or private ledger metadata.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_only_baseline`    | Exact public HTTP/DNS results, distinct running application/database VMs, read-only scope, and zero mutations. Values must match the manifest baseline.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `release_inventory`     | Release and commit distinct from current production; exact PR/commit identity; distinct dashboard, worker, migration, event-contract, template-catalogue, SMTP, Klaviyo, and webhook-adapter digests; all provider workers disabled; zero migration difference; exact assertions.                                                                                                                                                                                                                                                                                                        |
| `approval_record`       | Exact release, pilot-store, and canary approvals with individual UTC times and unique evidence digests; approved distinct pilot/control, notification, consent, provider-canary, message-ceiling, and observation policies; bounded external-submission, attempt, webhook-payload, and webhook-response limits; exact bindings to every other artifact.                                                                                                                                                                                                                                  |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, application-configuration, provider-reference, template, signing-reference, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact assertions.                                                                                                                                                                                                                                                                                                                        |
| `production_baseline`   | Exact capture time; distinct event, consent, suppression, template, provider-connection, endpoint, delivery, attempt, manual-review, queue, ledger, checkout, and native-coupon digests; complete coverage; all provider workers disabled; no pending accepted work; zero ledger/coupon difference or mutation.                                                                                                                                                                                                                                                                          |
| `canary_journal`        | One exact pilot and control organization; approved policies and numeric limits; exact released images/contracts/adapters; exact local SMTP, transactional/test, Klaviyo profile/event/consent, signed webhook/current-and-previous-key/destination, withdrawal, suppression, dedupe, timezone, retry/dead-letter, ambiguity review, template, health, nine event-family, provider-outage, value, checkout, privacy, and tenant-denial evidence; bounded positive counts; zero non-canary access, duplicate submission, stranding, bypass, exposure, checkout block, or value difference. |
| `reconciliation_report` | The same provider evidence digests and all provider/work counts as the journal; distinct canonical event, consent, suppression, template, connection, endpoint, delivery, attempt, manual-review, queue, provider-result, ledger, checkout, and native-coupon totals; complete bounded convergence; zero replay, privacy, tenancy, value, queue, ambiguity, or Critical/High difference.                                                                                                                                                                                                 |
| `rollback_report`       | Exact measured duration after canary end; all provider workers stopped; accepted work drained or held; prior images restored; immutable events, consent/suppression history, template versions, delivery attempts, manual review, health evidence, customer access, and checkout preserved; zero stranding, duplicate submission, ambiguity, ledger, coupon, consent, suppression, or customer-value difference.                                                                                                                                                                         |
| `observation_report`    | At least 24 hours covering the canary with hourly-or-better sampling and the approved observation-policy digest; approved SMTP, Klaviyo, webhook, health, checkout, load, and queue measurements; the same required provider/work counts as the journal; zero stranding, duplicate submission, consent/suppression bypass, ambiguous auto-retry, privacy, tenancy, checkout, provider, queue, ledger, coupon, value, ambiguity, or Critical/High failure.                                                                                                                                |

## Cross-artifact reconciliation and chronology

Approval and journal bind the same pilot/control, notification, consent,
provider-canary, message-ceiling, and observation policies plus the same numeric
limits. Release and journal bind the same images, migration inventory, event
contract, template catalogue, and all three adapters. Every SMTP, Klaviyo,
webhook, consent, suppression, dedupe, scheduling, retry, ambiguity, template,
health, event-family, outage, value, checkout, and privacy evidence digest must
match between journal and reconciliation. Every journal provider/work count must
match reconciliation; the observation subset must also match the journal.
Observation uses the same approved policy.

The read-only operator baseline, every prerequisite approval, release inventory,
verified recovery point, and production baseline must precede canary start.
Reconciliation must follow canary end, and rollback must start after it.
Observation must cover the canary for at least 24 hours. Final approval must bind
the same release and every other artifact, follow reconciliation, rollback, and
observation, and precede the manifest observation time.

All artifact paths and digests must be distinct. A valid digest over an empty,
renamed, incomplete, count-mismatched, nonzero-difference, temporally impossible,
short, or differently approved body fails closed. Pending artifacts must keep
both path and digest `null`.
