# Proxmox deployment contract

Run Starfiniti Loyalty in Linux VMs, not privileged containers.

1. Create a Supabase VM with at least 4 vCPU, 8 GB RAM, and 80 GB SSD before production-like tests.
2. Install Docker Engine and Compose. Fetch the official pinned Supabase `self-hosted/v0.8.0` Docker assets, record `.supabase-version`, generate fresh secrets, and retain Envoy as the default gateway.
3. Put Postgres data on durable storage and configure encrypted off-host PITR/backups. A Proxmox snapshot is supplementary only.
4. Use a separate application VM or isolated Compose project for `compose.app.yml`.
5. Terminate TLS at an explicitly managed reverse proxy, expose only 80/443, and restrict Studio to VPN/admin networks.
6. Copy `.env.example` to a secret-managed location outside Git and replace every placeholder.
7. Validate health, RLS, auth redirects, WooCommerce signatures, backup restore, and application rollback in staging before production approval.

Current breaking changes reviewed 2026-08-11: Envoy is the self-hosted default gateway; `API_EXTERNAL_URL` includes `/auth/v1` in current stacks. Do not apply old Kong-specific examples without an ADR.
