# Proxmox deployment contract

Run Starfiniti Loyalty in Linux VMs, not privileged containers.

1. Create a Supabase VM with at least 4 vCPU, 8 GB RAM, and 80 GB SSD before production-like tests.
2. Install Docker Engine and Compose. Fetch the official pinned Supabase `self-hosted/v0.8.0` Docker assets, record `.supabase-version`, generate fresh secrets, and retain Envoy as the default gateway.
3. Put Postgres data on durable storage and configure encrypted off-host PITR/backups. A Proxmox snapshot is supplementary only.
4. Use a separate application VM or isolated Compose project for `compose.app.yml`.
5. Terminate TLS at an explicitly managed reverse proxy, expose only 80/443, and restrict Studio to VPN/admin networks.
6. Copy `.env.example` to a secret-managed location outside Git and replace every placeholder.
7. Create the root-readable-only WooCommerce signing-material JSON outside Git. Keys are database `signing_material_ref` values and values are base64-encoded random keys of at least 32 bytes; set `WOOCOMMERCE_SIGNING_MATERIAL_PATH` to that file.
8. Use a dedicated `DATABASE_URL` login that can assume only `loyalty_runtime`; never use a browser, WordPress, or Supabase service credential for ingestion.
9. Use a different `LOYALTY_WORKER_DATABASE_URL` login that can assume only `loyalty_worker`. Run the immutable worker image beside the dashboard; never reuse its credential in the browser-facing service.
10. Validate health, RLS, auth redirects, WooCommerce signatures, effect lease recovery, backup restore, and application rollback in staging before production approval.

Current breaking changes reviewed 2026-08-11: Envoy is the self-hosted default gateway; `API_EXTERNAL_URL` includes `/auth/v1` in current stacks. Do not apply old Kong-specific examples without an ADR.
