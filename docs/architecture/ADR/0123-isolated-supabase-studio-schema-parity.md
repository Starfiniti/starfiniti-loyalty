# ADR-0123: Isolated Supabase Studio schema-parity recreation

- Status: Accepted and executed
- Date: 2026-09-01
- Decision owners: Starfiniti product and engineering
- Scope: M01-S01 production Studio runtime parity on VM 971

## Context

ADR-0081 locked production to the reviewed `self-hosted/v0.8.0` source,
asymmetric-JWKS Compose variant, eleven exact Linux/amd64 images, fifteen
mounted assets, Envoy/Auth/Data API/PostgreSQL behavior, and cumulative tenant
RLS. The owner-controlled environment had already changed
`PGRST_DB_SCHEMAS` from `public,graphql_public` to
`public,graphql_public,loyalty`, and PostgREST used that exact value, but the
two-week-old Studio container retained the earlier environment. The source and
database were compatible while Studio's schema browser was stale.

The official Supabase breaking-change catalogue and self-hosted update guidance
were reviewed again on 2026-09-01. The current notices include Envoy as the
default gateway, `/auth/v1` in `API_EXTERNAL_URL`, PostgreSQL 17, postgres-meta
ownership, locked Realtime schema behavior, and explicit Data API exposure.
None requires a release upgrade to apply an already-reviewed environment value
to one stateless Studio container. A future Supabase upgrade remains a separate
rehearsed change.

## Decision

Recreate only the existing `studio` Compose service from the active reviewed
production bytes and owner-only environment. Require a dry run that names only
`supabase-studio`; use `--no-deps`, `--no-build`, `--pull never`,
`--force-recreate`, and a bounded healthy wait. Keep the exact local Studio
image ID, database, Auth, Data API, Envoy, remaining containers, application,
backup configuration, checkout, and loyalty value unchanged.

Before execution, require:

- exact active Compose SHA-256 equal to the ADR-0081 production variant;
- the current environment selecting the exact three-schema allowlist;
- all eleven reviewed containers healthy;
- an enabled and active PostgreSQL archive timer with a successful latest run;
- a root-owned mode `0600` pre-schema environment artifact whose SHA-256
  exactly equals the current environment after normalizing only the schema line
  for bounded rollback; and
- passing public dashboard and login smoke checks.

After execution, require Studio to be healthy on the same exact image with zero
restarts, the exact three-schema environment, and an internal profile response
of HTTP 200 while the same profile remains HTTP 404 through the public gateway.
Prove the other ten services
remain healthy, a post-change PostgreSQL archive succeeds, dashboard/login stay
available, anonymous Auth and Data API requests remain denied, and production
commerce connections, customers, wallets, ledger transactions, and reward
reservations remain unchanged at zero.

Preserve the 2026-08-28 baseline byte-for-byte. Record the recreation as a V2
successor that hash-binds the historical evidence, exact scope, before/after
Compose configuration hashes, rollback artifact, chronology, health, backup,
anonymous-denial, and protected-state facts. This closes only
`studio_runtime_schema_parity`; upgrade rehearsal and clean-room recovery stay
pending.

## Alternatives considered

### Restart Studio without recreation

Rejected. A restart preserves the container's creation-time environment and
would leave the stale schema list in place.

### Recreate the complete Supabase stack

Rejected. The other ten services already matched the reviewed configuration.
Recreating them would widen database, Auth, storage, Realtime, gateway, and
availability risk without adding customer value or compatibility evidence.

### Upgrade to a later self-hosted Supabase release

Rejected for this correction. Current official breaking changes require a new
source lock, full Compose comparison, database/platform rehearsal, and
clean-room restore. Mixing that work with one stale Studio environment would
destroy the narrow rollback boundary.

## Security and data-integrity effects

- No credential value, raw container environment, database row, customer
  identity, or private route enters repository evidence.
- Studio remains a management surface and gains no database authority from the
  additional schema visibility; database grants and RLS remain authoritative.
- Anonymous Auth and Data API access remain denied.
- No immutable ledger transaction, wallet, reward reservation, programme,
  customer, connection, or checkout path is changed.
- The historical pending result remains immutable; current status is a
  separately validated successor rather than an edited claim.

## Operations

The recreation completed at `2026-09-01T17:39:54Z`. Studio became healthy on
the same reviewed image, the live schema list matched the three-schema
contract, its internal profile returned HTTP 200 while the public route remained
HTTP 404, the other ten services remained healthy, and a PostgreSQL archive
completed successfully four seconds later. Public dashboard/login checks
passed, anonymous Auth/Data API access remained denied, and protected aggregate
counts remained zero.

Validate the repository contract with:

```text
npm run supabase:preflight -- --self-test
npm run deployment:validate
npm run pilot:validate
```

## Migration and rollback

There is no database migration. If the recreated Studio had failed, the exact
root-owned mode `0600` pre-schema environment artifact could recreate only
Studio on the same local image while operators investigated; database, Auth,
PostgREST, and application containers would remain running. Do not use that
artifact to roll back PostgREST or disable the `loyalty` schema. Future
corrections forward-fix Studio while preserving the reviewed Data API and RLS
boundary.
