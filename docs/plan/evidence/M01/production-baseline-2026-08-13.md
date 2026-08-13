# M01 Production Baseline — 2026-08-13

Observed through read-only public, Proxmox, application-VM, and database-VM checks. No secret value, personal data, source order identifier, coupon code, or signing reference was read or retained.

- Proxmox VM 970 `loyalty-prod-app`: running; dashboard and worker use exact commit `4713c65e4ca47c0a97264854afea46f6a8730a3a`; dashboard is healthy.
- Proxmox VM 971 `loyalty-prod-supabase`: running; all eleven pinned containers are healthy.
- Public dashboard health/login returned 200 with verified TLS; an unsigned WooCommerce events POST returned 401.
- Database state: one organization, membership, workspace, programme, and draft programme version; zero connections, customers, wallets, ledger transactions, reservations, deliveries, canonical events, business effects, and outbox commands.
- PostgreSQL reports archive mode on, one-minute timeout, a current archived WAL position, and no failed WAL archive.
- Physical base backup succeeded. Encrypted off-host PostgreSQL Borg creation continued successfully on its three-minute timer. The isolated encrypted base/WAL recovery already promoted in 9 seconds with all 26 migrations.
- The application signing pool is mounted read-only and owned by container UID/GID 1001 with mode 0400; environment files are root-owned mode 0600. Values were not inspected.
- The nightly whole-VM Borg service/timer is configured but had never completed when observed. It cannot yet support an application/Auth/signing-secret recovery claim.
- No Starfiniti-owned WordPress installation exists under the accessible corporate hosting account. Other reachable customer/store SSH aliases were not treated as authorization and were not inspected or modified.

Current blockers: an explicitly approved real WooCommerce store and the first completed/restored application/Supabase whole-VM archive. All other pilot steps are enumerated in the runbook and machine-readable gate.
