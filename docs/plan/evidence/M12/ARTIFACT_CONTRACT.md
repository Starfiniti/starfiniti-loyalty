# M12 Production Artifact Contract

This contract defines the minimized evidence required before `M12-MIGRATION`
can close. The executable authority is
`scripts/validate-migration-canary-evidence.mjs`; this document explains the
operator-facing shape.

Every artifact uses `starfiniti.migration-canary-artifact.v1`, names one exact
artifact ID, binds the candidate commit and mandatory checks, records an exact
UTC observation time, reports `verified`, and is stored as a unique regular JSON
file of at most 256 KiB under `docs/plan/evidence/M12/production/`. The manifest
binds its exact SHA-256 digest. Evidence must remain minimized and must not
contain identities, source rows, raw exports, provider/customer selectors,
credentials, coupons, personal data, or ledger metadata.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read_only_baseline`    | Exact public HTTP/DNS results, distinct running application/database VMs, read-only scope, and zero mutations. Values must match the manifest baseline.                                                                                                                                                                                                                                                                                                |
| `release_inventory`     | Approved release and PR/commit identity; distinct dashboard, worker, migration-inventory, adapter-registry, and migration-contract digests; disabled worker/deployment state; zero registered-migration difference; exact per-check zero-difference assertions.                                                                                                                                                                                        |
| `approval_record`       | Exact release, source, mapping, and canary approvals with individual UTC times and unique source digests, plus exact digest bindings to every other production artifact.                                                                                                                                                                                                                                                                               |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, application-configuration, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact per-check zero-difference assertions.                                                                                                                                                                                                             |
| `production_baseline`   | Exact capture time; distinct minimized customer, wallet, balance, lot, expiry, liability, and full-snapshot digests; complete source coverage; zero migration receipts, batches, pending jobs, ledger difference, or mutation before canary enablement; exact per-check zero-difference assertions.                                                                                                                                                    |
| `canary_journal`        | Bounded start/end with at least one complete interval per started UTC hour; exactly one pilot and one control organization; zero non-canary enablement; approved batch limit at most 1,000 records; positive bounded application; zero dry-run mutation, duplicate effect, fingerprint difference, unresolved mapping, or outage ambiguity; exactly one compensating correction; complete source coverage; exact per-check zero-difference assertions. |
| `reconciliation_report` | Complete source coverage and bounded convergence; the same positive input, resolved, applied, and traceable record count; zero customer, available/pending points, lot, expiry, liability, ledger, pending-release, correction, ambiguity, or Critical/High difference; exact per-check zero-difference assertions.                                                                                                                                    |
| `rollback_report`       | Exact measured duration after canary end; new migration work disabled; exact canary compensation and prior images restored; customer access, checkout, and immutable history preserved; zero ambiguity/ledger difference; source digest; exact per-check zero-difference assertions.                                                                                                                                                                   |
| `observation_report`    | A measured period of at least 24 hours covering the canary; complete source coverage; zero duplicate effect, customer-access error, checkout block, privacy incident, available/pending-points, lot, expiry, liability, ledger difference, or Critical/High finding; source digest; exact per-check zero-difference assertions.                                                                                                                        |

## Cross-artifact reconciliation and chronology

The approval record and canary journal must bind the same approved export,
mapping, and value-total digests. The reconciliation record count must equal the
canary journal's applied count and stay within the approved limit. Every
prerequisite approval plus the release inventory, verified recovery point, and
production baseline must precede canary start. Reconciliation must follow canary
end, and rollback must start after it. The observation period must begin no
later than canary start and end no earlier than canary end. Final approval must
bind the same release, follow reconciliation, rollback, and observation, and
precede the manifest observation time.

All artifact paths and digests must be distinct. A valid digest over an empty,
renamed, incomplete, count-mismatched, nonzero-difference, temporally
impossible, or differently approved evidence body fails closed. Pending
artifacts must keep both path and digest `null`.
