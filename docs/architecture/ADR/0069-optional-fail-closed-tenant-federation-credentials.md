# ADR-0069: Optional fail-closed tenant-federation credentials

- Status: Accepted
- Date: 2026-08-28
- Decision owners: Starfiniti product and engineering
- Scope: M13 deployment and credential activation boundary

## Context

Starfiniti workforce users already enter through Authentik as the configured Supabase custom OIDC provider. Per-organization OIDC/SAML federation is a separate M13 administration capability that calls Authentik and Supabase administration APIs only after live database authorization and validation.

The integrated deployment contract nevertheless required the federation configuration, Authentik administration token, and Supabase service-role key for every dashboard deployment. Production v0.1.11 correctly has none of those files because tenant federation is disabled. Making them unconditional would block deployment of unrelated modules, place unused high-privilege material in the general dashboard container, and let an external identity fixture delay safe self-hosted functionality.

## Decision

1. Keep workforce SSO configuration and behavior unchanged.
2. Treat the three tenant-federation host paths as one optional all-or-none set. With all three empty, Compose uses read-only `/dev/null` binds at the fixed container paths and the deployment preflight succeeds without reading federation material. Long bind syntax disables host-path creation, so a missing configured file cannot silently become a directory. Docker Compose file-backed secrets are bind mounts under the hood; using the explicit optional bind also avoids asking Compose to interpret a character device as secret contents.
3. If any path is configured, require all three distinct absolute regular files. The existing strict JSON, HTTPS-origin, UUID-selector, secret-shape, owner UID, and permission checks still apply.
4. Do not add an environment-supplied authorization flag. PostgreSQL membership, capability, source, endpoint, and action state remain authoritative. Missing or non-regular files fail when orchestration dependencies are constructed, before an Authentik or Supabase administration client can act.
5. Keep the credentials out of environment variables, images, browser code, logs, evidence, the default worker, and provider workers.

## Consequences

- Self-hosted and disabled-first deployments can ship every unrelated additive module without tenant-federation credentials.
- Enabling tenant federation remains an explicit deployment event with owner-managed files, preflight, database authorization, egress controls, canary evidence, and rollback.
- The dashboard image retains dormant federation orchestration code, but it has no usable provider credential until all protected files are mounted.
- A partially configured deployment fails preflight instead of silently disabling or mixing authorities.

## Alternatives

1. Require federation credentials in every deployment. Rejected because it blocks unrelated value and merchant functionality and expands ambient privilege.
2. Put tokens directly in the environment. Rejected because Compose inspection, process metadata, and support output would expose reusable administration material.
3. Add a browser or Auth-claim feature flag. Rejected because neither is deployment or tenant authority.
4. Split federation orchestration into a new privileged service now. Deferred until measured operational demand justifies another deployable and authenticated command boundary; the current action-time file read already avoids credential use during normal requests.

## Rollout and rollback

Deploy the additive Compose/preflight change with all three tenant-federation paths empty and verify dashboard health plus workforce SSO. Enabling M13 later requires populating all three files, running preflight, applying the approved egress policy, recreating only the dashboard, and completing the tenant-federation canary. Roll back federation by disabling database sources/endpoints, revoking provider credentials, emptying all three paths together, and recreating the dashboard. Do not remove local owner access or immutable identity evidence.
