# Deployment

## Topology

Use dedicated Linux VMs on Proxmox, separated at minimum into:

- **Supabase VM:** pinned official self-hosted Compose set, PostgreSQL volumes, Supavisor, Auth, PostgREST, Envoy, optional Storage/Realtime/Studio.
- **Application VM:** Next.js/BFF, ingestion, workers, and reverse proxy/application edge where network policy permits.
- **Off-host backup target:** separate provider/failure domain; never only the Proxmox cluster.

For a small initial environment, application containers may share a VM but remain separate from the database Compose project and volumes. Production starts at 8 GB+/4 cores/80 GB+ SSD for the full Supabase stack, then follows measured capacity.

## Network policy

| Path                                | Exposure                                                       |
| ----------------------------------- | -------------------------------------------------------------- |
| Public HTTPS 443                    | Caddy/Nginx only                                               |
| Supabase Envoy HTTP 8000            | Private network/reverse proxy only                             |
| Next.js/ingestion internal ports    | Reverse proxy only                                             |
| Supavisor transaction/session ports | Application/admin networks only                                |
| PostgreSQL 5432                     | Supabase/application administration network only; never public |
| Studio/Envoy admin/metrics          | VPN/admin network only                                         |
| Proxmox management/SSH              | Management network/VPN allowlist only                          |

Forwarded client IP headers are accepted only from the trusted proxy. Host firewall and Proxmox firewall both fail closed.

## Current Supabase contract (reviewed 2026-08-11)

- Pin an official self-hosted release as a tested set; do not follow mutable `master` or mix arbitrary image versions.
- Envoy is the default gateway from the week of 2026-08-09. It listens on plain HTTP by default; terminate TLS with Caddy/Nginx rather than relying on Kong `:8443`.
- `API_EXTERNAL_URL` includes `/auth/v1`. Configure it separately from `SUPABASE_PUBLIC_URL` and `SITE_URL`.
- PostgreSQL 17 is the current self-hosted default. PostgreSQL 15 volumes do not auto-upgrade; use the upstream upgrade procedure or restore into a staged PG17 environment.
- Studio/postgres-meta ownership changed to `postgres` in 2026; upgrades from older stacks require the upstream ownership reassignment procedure.
- Analytics/Vector are opt-in. They are not a correctness dependency.
- Prefer generated publishable/secret API keys and asymmetric signing keys. Retain legacy keys only during an explicit migration/rotation window.
- New table Data API access is opt-in; Starfiniti also keeps explicit schema/grant/RLS validation.
- Set `PGRST_DB_SCHEMAS=public,graphql_public,loyalty` in the self-hosted environment. Omitting `loyalty` makes authenticated dashboard queries fail with HTTP 406; adding it does not bypass the schema's explicit grants or tenant RLS policies.

## Secrets

Populate secret-managed environment files on the target hosts; never commit them. Required classes include database password, publishable/secret API keys, JWT signing material, dashboard credentials, SMTP, runtime/worker database credentials, Woo signing-key root material, encryption/backup keys, and observability credentials.

Secret files are owner-readable only, excluded from backups unless encrypted escrow is intended, redacted from Compose inspection/support output, and rotated independently. Browser configuration contains only the public URL and publishable key.

Generate the WooCommerce signing-key pool on the application host with `npm run woocommerce:keys -- --output <secret-path> --count <n>` and mount it read-only at the configured dashboard secret path. The hardened dashboard image runs as UID/GID `1001`, so the host file must be owned by `1001:1001` with mode `0400`; root retains administrative access while every other non-root identity remains denied. Use `--append` to preserve assigned references while adding capacity; the generator rejects replacement of existing values and performs an atomic file swap. Restore owner `1001:1001` and mode `0400`, then recreate the dashboard container after append so the bind mount observes the replacement inode. Back up the pool only through encrypted secret escrow: database rows contain references, not recoverable signing keys.

Before applying Compose, run `npm run deploy:preflight -- --env /absolute/path/to/starfiniti.env` from the matching release source. The command never prints environment or key values. It requires exact environment/Compose parity, populated values, commit-SHA image tags or digests, distinct image repositories, canonical HTTPS origins, one explicit non-wildcard dashboard IPv4 binding, a Supabase public-host mapping to an explicit internal TLS-proxy IPv4 address, separate nonadministrative PostgreSQL logins, and a valid absolute signing-pool file. The dashboard container uses that mapping to avoid public-NAT hairpin failures without changing the public Supabase URL, TLS hostname, or browser cookie namespace. On Linux the preflight also rejects any group/other permission bit or an owner other than dashboard UID `1001`. Passing this offline preflight does not prove DNS, TLS, connectivity, database role membership, package visibility, or backup recovery; those remain live deployment checks.

## Merchant authentication

- Configure self-hosted Auth `SITE_URL` as the public dashboard origin and allow only the exact dashboard callback origins required by the environment.
- Register Authentik through Supabase Auth as custom OIDC provider `custom:starfiniti-sso` with issuer `https://auth.starfiniti.com/application/o/loyalty/`, PKCE, and scopes `openid profile email`. Authentik's strict callback is `https://api.loyalty.starfiniti.com/auth/v1/callback`; the dashboard PKCE callback is `https://loyalty.starfiniti.com/auth/callback`. Do not use legacy root-level SAML/OAuth callback paths.
- Keep self-service signup disabled until an approved onboarding flow exists. Create the first Auth user through the approved Supabase administration path without a tenant or membership. Only after a real owner SSO flow proves the linked `custom:starfiniti-sso` identity, current Auth session, and exact Supabase UUID may operators use `npm run tenant:bootstrap` from the matching release source to atomically create its owner membership and initial tenant scope. Follow `INITIAL_TENANT_BOOTSTRAP.md`; do not improvise direct membership inserts.
- `API_EXTERNAL_URL` ends in `/auth/v1`; `SUPABASE_PUBLIC_URL` is the browser/client base URL. Both must resolve through TLS before password reset or OAuth links are enabled.
- The dashboard receives only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A Supabase secret/service-role key is not an application runtime dependency.
- Configure `DASHBOARD_PUBLIC_ORIGIN` as the exact canonical lowercase HTTPS origin with no path. Guided connector setup derives its signed-event endpoint from this server-only value.
- Reverse proxies and CDNs must preserve `Set-Cookie`, `Cache-Control`, `Expires`, `Pragma`, and `Vary` headers and must never cache authenticated HTML or Auth callback responses.

## Release process

1. After all required checks pass on an approved commit, push one exact `vMAJOR.MINOR.PATCH` tag. The release workflow reruns the baseline and disposable database gate, publishes dashboard/worker GHCR images under the commit SHA and version, and attaches the WooCommerce ZIP plus `SHA256SUMS` to the GitHub release. Deploy the commit-SHA image tags or resolved digests, never a floating version tag.
2. Back up and confirm WAL archive health before database migrations.
3. Apply forward-compatible migrations with the old application still safe.
4. Deploy one application/worker version with health checks and migrations disabled at runtime.
5. Run Auth, RLS, webhook, idempotency, ledger, and Woo outage smoke tests.
6. Shift traffic; monitor error, queue, database, and latency SLOs.
7. Retain prior images/configuration for rollback. Contract/destructive schema cleanup occurs only in a later release.

Supabase upgrades are separate change windows: restore rehearsal, release-note/breaking-change review, staged Compose diff, data backup, upgrade, routing/Auth/database tests, and documented rollback/forward-fix.

After an in-place `db` container recreation, wait for PostgreSQL health and recreate `supavisor` before resuming application traffic. Supavisor can otherwise retain a stale Docker DNS result for the replaced database container and return `:nxdomain` until it restarts.

The pinned PostgreSQL 17.6 self-hosted image can terminate a session on `GRANT <role> TO current_user`, matching [Supabase CLI issue 5912](https://github.com/supabase/cli/issues/5912). Do not repeatedly retry a crashing production migration. For a fresh deployment that reproduces the issue, use a reviewed deployment copy that substitutes the known explicit migration administrator (`postgres` in this stack), record source/deployed hashes and the upstream issue, and retain the release source unchanged. Rehearse the same path before any upgrade or non-empty deployment.

## Health and readiness

- Liveness proves a process event loop is responsive.
- Readiness proves required configuration, database transaction, migration compatibility, and queue access without mutating customer value.
- Public health responses expose no versions, topology, credentials, or tenant data.
- Dashboard readiness at `/api/healthz` checks one database query for the exact runtime ingestion/provisioning privileges plus the locally mounted signing-pool schema. It returns only `ok` or `unavailable` with no-store headers and creates no business effect.
- Workers stop claiming new work before shutdown and finish/expire leases safely.

## Rollback

Application rollback uses the prior image when migrations remain backward compatible. Database history is never rolled back by restoring an old VM over new production writes. Failed migrations use forward fixes or documented compensating migrations. A destructive disaster restore follows `BACKUP_RESTORE.md` and explicit incident authority.

See `infrastructure/environments/proxmox/README.md` for the deployable contract. Actual deployment waits only for working SSH/host, DNS/TLS, backup, and secret inputs.
