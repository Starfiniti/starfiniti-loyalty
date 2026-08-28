# ADR-0081: Fail-closed self-hosted Supabase compatibility

- Status: Accepted
- Date: 2026-08-28
- Upstream review: official Supabase changelog, breaking-change notices, and `supabase/supabase` tag `self-hosted/v0.8.0`

## Context

The deployment documentation named the intended current Supabase behavior, but the executable preflight covered only Starfiniti application containers. An operator could therefore deploy a modified or later self-hosted bundle while retaining a plausible `.supabase-version`, or miss an applicable gateway, Auth URL, PostgreSQL-major, postgres-meta ownership, optional-service, extension, Realtime, or Data API change.

Production VM 971 currently records `self-hosted/v0.8.0`. Its Compose file is the official tagged file with exactly four reviewed comment removals that pass asymmetric JWKS variables to Auth, PostgREST, Realtime, and Storage. The official tag is annotated but unsigned, so the compatibility lock records the tag object, resolved commit, official file digest, exact approved local variant digest, and every configured image reference. Runtime image digests remain deployment evidence because they are platform-specific and can change independently of a mutable registry tag.

The same audit found three tenant-bearing private coordination tables without RLS. Direct application grants were already revoked and access flowed through owner-controlled `SECURITY DEFINER` functions, but grant minimization does not satisfy the product invariant that every tenant table enables RLS.

## Decision

Maintain `infrastructure/environments/proxmox/supabase-compatibility.json` as the versioned compatibility lock. A deployment preflight must verify the exact release provenance files, one approved Compose byte digest, every mounted static Envoy/database-init/pooler/snippet/Edge Function asset, the complete service/image set, Envoy with no default Kong/Analytics/Vector service, PostgreSQL 17, postgres-meta user `postgres`, the `/auth/v1` external Auth URL, the exact PostgREST schema allowlist, and non-empty asymmetric key sets when the JWKS-enabled variant is selected. Sealed source directories reject extra files and every local bind must resolve to a locked static path or one explicitly mutable storage/database-data directory.

The repository side of the same gate scans every migration. It rejects extension version pins, Management API `logs.all` dependencies, mutation of the Supabase-owned `realtime` schema, Starfiniti tables in `public`, and any `loyalty` or `loyalty_private` table lacking an explicit cumulative `ENABLE ROW LEVEL SECURITY` statement. Migration `20260828190000` closes the three existing RLS omissions without adding direct-role policies; reviewed owner functions retain intentional owner bypass.

Resolved container image digests are locked per supported platform and compared locally without inspecting secret-bearing container environments. The initial contract supports the production `linux/amd64` platform; another architecture requires its own reviewed digest set. Any different Compose byte, asset, release, service, image reference or digest, gateway, environment boundary, or deliberate RLS exception requires a new reviewed contract and ADR rather than a bypass.

## Alternatives

1. Keep current assumptions in prose. This is easy to operate but cannot detect drift and cannot fail CI or a deployment.
2. Vendor the full upstream Docker directory. This gives local bytes but duplicates a large upstream bundle, obscures reviewed local differences, and still needs provenance and runtime checks.
3. Pin a small machine-readable source contract, validate structure and environment locally, and bind minimized runtime evidence. This preserves upstream ownership while making every accepted difference explicit and is selected.

## Security and integrity effects

The validator reads secret-bearing environment files only locally, never prints values, and emits only names, counts, variants, hashes, and pass/fail facts. Exact Compose, mounted-asset, and local platform-image hashes prevent an unreviewed service, mount, route, initialization script, image, or gateway change from hiding behind the same release label. Repository scanning converts future RLS, extension, Realtime, public-schema, and removed-log-API drift into deterministic failures. Enabling RLS without direct policies adds defense in depth if a private-table grant is introduced later.

The lock does not make an unsigned upstream tag trusted by itself. The resolved commit, official asset digest, reviewed variant digest, registry digest inventory, release process, scanning, backups, and restore evidence remain separate controls.

## Operations

Run `npm run supabase:preflight -- --compose <absolute-compose> --env <absolute-env> --version-file <absolute-upstream-version> --provenance-file <absolute-provenance> --bundle-root <absolute-bundle-root> --platform linux/amd64` after pulling and before first deployment or any Supabase recreation/upgrade. The provenance file contains only the exact release ref and tag-object SHA; it contains no credential. The command compares each local image ID with the reviewed platform digest before traffic.

An upgrade is a separate change window: review current official breaking changes, create a new lock/ADR, fetch the resolved commit, compare the whole Compose change, rehearse PostgreSQL-major and ownership steps, validate Auth/Envoy/Data API behavior, restore in a disposable environment, and retain the prior source/configuration and recovery point.

## Migration and rollback

The RLS migration is additive and does not change reviewed owner-function behavior. If it exposes an unreviewed direct-table dependency, stop that caller and add a least-privilege function; do not disable RLS to restore access. Application rollback keeps the migration in place.

For a Supabase bundle failure, stop before replacing healthy containers, preserve the failed preflight output without secret values, restore the previously approved Compose/configuration and exact local image digests, recreate only the affected service set, and re-run Auth, Envoy, PostgREST, RLS, backup, and readiness checks. Database history is forward-fixed; a VM restore never overwrites newer production writes.
