# M13 Production Artifact Contract

This contract defines the minimized evidence required before
`M13-ENTERPRISE-IDENTITY` can close. The executable authority is
`scripts/validate-enterprise-identity-canary-evidence.mjs`; this document
explains the operator-facing shape.

Every artifact uses `starfiniti.enterprise-identity-canary-artifact.v1`, names
one exact artifact ID, binds the candidate commit and mandatory checks, records
an exact UTC observation time, reports `verified`, and is stored as a unique
regular JSON file of at most 256 KiB under
`docs/plan/evidence/M13/production/`. The manifest binds its exact SHA-256
digest. Evidence must remain minimized and must not contain identities,
provider subjects, membership or relationship selectors, credentials, raw
payloads, personal data, or reusable authority.

## Required detail contracts

| Artifact                | Required semantic evidence                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_only_baseline`    | Exact Loyalty, Supabase, Authentik, and DNS results; distinct running application/database VMs; read-only scope; and zero mutations. Values must match the manifest baseline.                                                                                                                                                    |
| `release_inventory`     | Approved release and PR/commit identity; distinct dashboard, worker, migration, identity-configuration, and administration-mount inventory digests; disabled pre-canary state; zero identity sources, SCIM endpoints, active support grants, and migration difference; exact per-check zero-difference assertions.               |
| `approval_record`       | Exact three prerequisite approvals with individual UTC times and unique source digests, final release, and exact digest bindings to every other production artifact.                                                                                                                                                             |
| `recovery_point`        | Creation/verification times; distinct base-backup, WAL, Supabase Auth, Authentik, application-configuration, and restore-evidence digests; successful restore evidence; measured RPO at most 60 seconds; zero mutations; exact per-check zero-difference assertions.                                                             |
| `production_baseline`   | Exact capture time and snapshot digest; complete source coverage; zero identity sources, SCIM endpoints, agency relationships, active support grants, non-recovery membership difference, ledger difference, and mutation; exact per-check zero-difference assertions.                                                           |
| `canary_journal`        | Bounded start/end with at least one complete interval per started UTC hour; exactly one pilot and one control organization; zero non-canary enablement, private-egress difference, and DNS-rebinding escape; exactly three isolated administration mounts; complete source coverage; exact per-check zero-difference assertions. |
| `reconciliation_report` | Complete source coverage and bounded convergence; zero ambiguity, Critical/High findings, cross-tenant difference, stale-session access, or ledger difference; exact per-check zero-difference assertions.                                                                                                                       |
| `rollback_report`       | Exact measured duration; federation disabled; SCIM and support revoked; local owner, checkout, and immutable history preserved; zero ambiguity/ledger difference; source digest; exact per-check zero-difference assertions.                                                                                                     |
| `observation_report`    | A measured period of at least 24 hours covering the canary; complete source coverage; zero cross-tenant or stale-session access, internal-egress escape, checkout blocks, ledger difference, or Critical/High findings; source digest; exact per-check zero-difference assertions.                                               |

## Chronology and closure

Every prerequisite approval plus the release inventory, verified recovery
point, and production baseline must precede canary start. Reconciliation and
rollback evidence must follow canary end. The observation period must begin no
later than canary start and end no earlier than canary end. The final approval
record must follow reconciliation, rollback, and observation, bind the same
release as the inventory, and the manifest observation time must follow that
approval.

All artifact paths and digests must be distinct. A valid digest over an empty,
renamed, incomplete, nonzero-difference, temporally impossible, or differently
approved evidence body fails closed. Pending artifacts must keep both path and
digest `null`.
