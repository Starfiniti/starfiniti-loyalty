# M11 Production Artifact Contract

This contract defines the minimized evidence required before `M11-ECOSYSTEM`
can close. The executable authority is
`scripts/validate-ecosystem-canary-evidence.mjs`; this document explains the
operator-facing shape.

Every artifact uses `starfiniti.ecosystem-canary-artifact.v1`, names one exact
artifact ID, binds the candidate commit and mandatory checks, records a
canonical UTC observation time, reports `verified`, and is stored as a unique
regular JSON file of at most 256 KiB under
`docs/plan/evidence/M11/production/`. The manifest binds its exact SHA-256
digest. Evidence must not contain identities, reusable API/provider/webhook
material, raw payloads, private selectors, coupons, personal data, or ledger
metadata.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_only_baseline`    | Exact public HTTP/DNS results, distinct running application/database VMs, read-only scope, and zero mutations. Values must match the manifest baseline.                                                                                                                                                                                                                                                                                                                |
| `release_inventory`     | Approved release distinct from current production plus exact PR/commit identity; distinct dashboard, worker, migration, client, and ecosystem-contract digests; every ecosystem route/worker disabled; zero migration difference; exact per-check zero-difference assertions.                                                                                                                                                                                          |
| `approval_record`       | Exact release, pilot-store, canary, and rate-provider approvals with individual UTC times and unique evidence digests; approved distinct pilot/control scope, rate policy, and value ceiling; exact digest bindings to every other artifact.                                                                                                                                                                                                                           |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, application-configuration, integration-reference, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact assertions.                                                                                                                                                                                                                                |
| `production_baseline`   | Exact capture time; distinct minimized topology, identity, wallet, currency, event/ledger, quota, credential-lifecycle, endpoint/delivery, checkout/privacy, and full-snapshot digests; complete coverage; zero active ecosystem capability/worker, ledger difference, or mutation.                                                                                                                                                                                    |
| `canary_journal`        | Bounded distinct pilot/control scope; the approved scope/rate/value-ceiling digests; an observed-value-total digest within that ceiling; exact isolated/shared topology, connector denial, identity link/unlink, foreign order/refund, occurrence-snapshot reuse, API issuance/replay/rotation/revocation/quota, webhook lifecycle/delivery/replay, and four independent outage exercises; zero non-canary enablement, checkout block, duplicate effect, or ambiguity. |
| `reconciliation_report` | Complete bounded convergence; the same observed-value-total digest and every positive topology, identity, provider, order/refund, credential, API-effect, and webhook lifecycle count as the journal; value remains within the approved ceiling; zero topology, connector, identity, wallet, currency, snapshot, event, ledger, quota, credential, endpoint, delivery, analytics, checkout, customer-value, privacy, ambiguity, or Critical/High difference.           |
| `rollback_report`       | Exact measured duration after canary end; all capabilities disabled; credentials revoked and webhook workers stopped; prior images/topology/identity state restored; customer access, checkout, and immutable history preserved; zero ambiguity, ledger, or customer-value difference.                                                                                                                                                                                 |
| `observation_report`    | At least 24 hours covering the canary; hourly-or-better sampling; approved latency/capacity result with bounded measurements; the same quota/outage scope as the journal; zero duplicate effect, access/checkout/privacy failure, topology/identity/currency/ledger/delivery/customer-value difference, or Critical/High finding.                                                                                                                                      |

## Cross-artifact reconciliation and chronology

Approval and journal must bind the same distinct pilot/control scope, rate
policy, and value ceiling. Journal topology, identity, provider, order/refund,
observed-value, credential, API effect, and webhook lifecycle evidence must
match reconciliation; quota and outage counts must match observation.
Every prerequisite approval plus release inventory, verified recovery point,
and production baseline must precede canary start. Reconciliation must follow
canary end, and rollback must start after it. Observation must cover the canary
for at least 24 hours. Final approval must bind the same release and every other
artifact, follow reconciliation, rollback, and observation, and precede the
manifest observation time.

All artifact paths and digests must be distinct. A valid digest over an empty,
renamed, incomplete, count-mismatched, nonzero-difference, temporally
impossible, or differently approved body fails closed. Pending artifacts must
keep both path and digest `null`.
