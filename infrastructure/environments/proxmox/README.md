# Proxmox deployment contract

Run Starfiniti Loyalty in Linux VMs, not privileged containers.

1. Create a Supabase VM with at least 4 vCPU, 8 GB RAM, and 80 GB SSD before production-like tests.
2. Install Docker Engine and Compose. Fetch the official pinned Supabase `self-hosted/v0.8.0` Docker assets, record `.supabase-version`, generate fresh secrets, and retain Envoy as the default gateway.
3. Put Postgres data on durable storage and configure encrypted off-host PITR/backups. A Proxmox snapshot is supplementary only.
4. Use a separate application VM or isolated Compose project for `compose.app.yml`.
5. Terminate TLS at an explicitly managed reverse proxy, expose only 80/443, and restrict Studio to VPN/admin networks.
6. Copy `.env.example` to a secret-managed location outside Git and replace every placeholder.
7. Generate the root-readable-only WooCommerce signing-key pool outside Git with `npm run woocommerce:keys -- --count 20 --output /etc/starfiniti-loyalty/woocommerce-signing-material.json`, verify mode `0600`, and set `WOOCOMMERCE_SIGNING_MATERIAL_PATH` to that file. Each pool reference is consumed by at most one connection. Replenish atomically while retaining existing entries with the same command plus `--append`, then recreate the dashboard container so its read-only secret mount sees the new inode. Never print or merge key material through shell text processing.
8. Use a dedicated `DATABASE_URL` login that can assume only `loyalty_runtime`; never use a browser, WordPress, or Supabase service credential for ingestion.
9. Use a different `LOYALTY_WORKER_DATABASE_URL` login that can assume only `loyalty_worker`. Run the immutable worker image beside the dashboard; never reuse its credential in the browser-facing service.
10. Set `DASHBOARD_PUBLIC_ORIGIN` to the canonical HTTPS dashboard origin with no path. Validate health, RLS, auth redirects, guided WooCommerce setup-code import, signatures, effect lease recovery, backup restore, and application rollback in staging before production approval.
11. In the pinned Supabase environment, set `SITE_URL` to the dashboard HTTPS origin, add only required dashboard callback origins to `ADDITIONAL_REDIRECT_URLS`, retain disabled public signup, and provision the first Auth user plus organization membership through an audited admin session.

Current breaking changes reviewed 2026-08-11: Envoy is the self-hosted default gateway; `API_EXTERNAL_URL` includes `/auth/v1` in current stacks. Do not apply old Kong-specific examples without an ADR.
