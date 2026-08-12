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

## Secrets

Populate secret-managed environment files on the target hosts; never commit them. Required classes include database password, publishable/secret API keys, JWT signing material, dashboard credentials, SMTP, runtime/worker database credentials, Woo signing-key root material, encryption/backup keys, and observability credentials.

Secret files are owner-readable only, excluded from backups unless encrypted escrow is intended, redacted from Compose inspection/support output, and rotated independently. Browser configuration contains only the public URL and publishable key.

## Merchant authentication

- Configure self-hosted Auth `SITE_URL` as the public dashboard origin and allow only the exact dashboard callback origins required by the environment.
- Keep self-service signup disabled until an approved onboarding flow exists. Provision the first Auth user and live `organization_memberships` row through the audited administration path.
- `API_EXTERNAL_URL` ends in `/auth/v1`; `SUPABASE_PUBLIC_URL` is the browser/client base URL. Both must resolve through TLS before password reset or OAuth links are enabled.
- The dashboard receives only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A Supabase secret/service-role key is not an application runtime dependency.
- Reverse proxies and CDNs must preserve `Set-Cookie`, `Cache-Control`, `Expires`, `Pragma`, and `Vary` headers and must never cache authenticated HTML or Auth callback responses.

## Release process

1. Build immutable application/plugin artifacts and generate dependency/container/plugin evidence.
2. Back up and confirm WAL archive health before database migrations.
3. Apply forward-compatible migrations with the old application still safe.
4. Deploy one application/worker version with health checks and migrations disabled at runtime.
5. Run Auth, RLS, webhook, idempotency, ledger, and Woo outage smoke tests.
6. Shift traffic; monitor error, queue, database, and latency SLOs.
7. Retain prior images/configuration for rollback. Contract/destructive schema cleanup occurs only in a later release.

Supabase upgrades are separate change windows: restore rehearsal, release-note/breaking-change review, staged Compose diff, data backup, upgrade, routing/Auth/database tests, and documented rollback/forward-fix.

## Health and readiness

- Liveness proves a process event loop is responsive.
- Readiness proves required configuration, database transaction, migration compatibility, and queue access without mutating customer value.
- Public health responses expose no versions, topology, credentials, or tenant data.
- Workers stop claiming new work before shutdown and finish/expire leases safely.

## Rollback

Application rollback uses the prior image when migrations remain backward compatible. Database history is never rolled back by restoring an old VM over new production writes. Failed migrations use forward fixes or documented compensating migrations. A destructive disaster restore follows `BACKUP_RESTORE.md` and explicit incident authority.

See `infrastructure/environments/proxmox/README.md` for the deployable contract. Actual deployment waits only for working SSH/host, DNS/TLS, backup, and secret inputs.
