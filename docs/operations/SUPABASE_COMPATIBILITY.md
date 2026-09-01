# Self-hosted Supabase compatibility

Starfiniti supports the exact self-hosted Supabase release and Compose variants in `infrastructure/environments/proxmox/supabase-compatibility.json`. A version label alone is not proof: the preflight verifies source provenance, exact Compose bytes, structure, environment boundaries, and repository compatibility before an operator changes a container.

## Required files

- The upstream `.supabase-version` created with the deployment bundle.
- A separate non-secret provenance file containing `<release-ref> <tag-object-sha>`.
- The exact `docker-compose.yml` being deployed.
- The bundle root containing the mounted Envoy, database-init, pooler, snippet, and Edge Function assets from the same release.
- The owner-only Supabase `.env`. The validator reads it locally and never prints values.

The current approved variants are the byte-exact upstream `self-hosted/v0.8.0` Compose file and the production asymmetric-JWKS variant. The latter differs only by enabling the existing `GOTRUE_JWT_KEYS`, `API_JWT_JWKS`, `JWT_JWKS`, and `SUPABASE_JWKS` mappings. Any other edit requires review and a new contract digest.

## Preflight

```sh
npm run supabase:preflight -- \
  --compose /absolute/path/to/docker-compose.yml \
  --env /absolute/path/to/.env \
  --version-file /absolute/path/to/.supabase-version \
  --provenance-file /absolute/path/to/starfiniti-supabase-provenance \
  --bundle-root /absolute/path/to/supabase-docker \
  --platform linux/amd64
```

The command fails when:

- the release ref, tag object, or Compose bytes drift;
- any of the 15 mounted static assets drifts, disappears, becomes a symlink, or gains an unreviewed file in a sealed directory;
- any required locally pulled image is absent or its platform-specific image ID differs from the reviewed digest;
- Envoy or an exact image is missing, or Kong/Analytics/Vector appears by default;
- postgres-meta does not use `postgres` or the database is not the reviewed PostgreSQL 17 image;
- `API_EXTERNAL_URL` is not an exact HTTPS `/auth/v1` URL;
- public/site URLs are not canonical HTTPS origins;
- the PostgREST schema list is not exactly `public,graphql_public,loyalty`;
- the JWKS-enabled variant has missing, malformed, or empty key sets; or
- repository migrations pin extension versions, use `logs.all`, modify the Supabase-owned `realtime` schema, create Starfiniti tables in `public`, or omit RLS for a loyalty table.

Storage and PostgreSQL data directories are deliberately mutable and are not source assets. Every other local bind in the approved Compose file must resolve to an exact locked file or sealed directory; adding a local bind requires a new reviewed contract.

Passing is an offline compatibility result. It does not prove DNS, TLS, image availability, container health, database migration compatibility, Auth redirects, tenant isolation, backups, or recovery.

## Runtime evidence

The preflight inspects only local image IDs, never container environments. After it passes, record only these minimized facts for every required service:

- Compose service and configured image reference;
- resolved `sha256` image digest;
- container health at the observation time; and
- the compatibility-contract, Compose, version, and provenance digests.

The current lock supports `linux/amd64`. A different platform requires a reviewed digest set rather than a bypass. Never export `docker inspect` wholesale: it contains secret environment values. Do not store `.env`, JWT keys, database passwords, SMTP credentials, service keys, or raw container configuration in repository evidence.

## Upgrade and rollback

Treat every Supabase release as a separate database-platform change. Review the current official breaking-change changelog, create a new lock and ADR, rehearse the exact upgrade and restore, and prove Envoy/Auth/PostgREST/Studio/PostgreSQL behavior before production. PostgreSQL 15 data directories do not become PostgreSQL 17 data directories through a container-tag change.

If preflight fails, do not weaken the contract or recreate a healthy production service. Retain the previous approved source, configuration, resolved image digests, and fresh recovery point. Roll back container configuration only after confirming migration compatibility; forward-fix database history.
