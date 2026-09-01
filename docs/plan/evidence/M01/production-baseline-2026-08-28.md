# M01 Production Baseline — 2026-08-28

Observed at `2026-08-27T23:30:35Z` through read-only public, GitHub, Proxmox, application-VM, database-VM, PostgreSQL, systemd, and Borg-result checks. No secret value, personal data, source order identifier, coupon code, or signing reference was read or retained. No container, service, database row, Auth state, backup, route, checkout path, or loyalty value was changed.

- Release `v0.1.11` resolves to commit `0ced4b666a55d836bd3d4927337fe057a71bb4ba`. VM 970 runs the matching dashboard and worker images; the dashboard is healthy and the worker is running without a configured Docker healthcheck.
- VM 971 runs all eleven pinned Supabase containers healthy, including PostgreSQL `17.6.1.136`, Auth, Realtime, REST, Storage, and Envoy.
- Public dashboard health and login returned 200, Authentik readiness returned 200, workforce custom-provider authorization redirected to Authentik, and an unsigned WooCommerce events request returned 401.
- PostgreSQL contains one organization, membership, workspace, programme, and programme version; zero commerce connections, customers, wallets, ledger transactions, reward reservations, delivery receipts, canonical commerce events, business effects, and outbox commands. Auth contains one user and two identities. Production has 28 applied migrations.
- The PostgreSQL base-backup service last exited successfully at `2026-08-27T22:34:12Z`. The incremental encrypted PostgreSQL Borg service last exited successfully at `2026-08-27T23:27:22Z`; the previously diagnosed full-tree transfer loop remains absent.
- The nightly encrypted Proxmox Borg service last exited successfully at `2026-08-27T01:28:25Z`. Its completed archive inventory includes both `pve-qemu-970-20260826T234133Z` and `pve-qemu-971-20260826T234133Z`.
- Archive creation is not restoration evidence. The earlier isolated PostgreSQL base/WAL exercise remains valid, but an independently isolated application, Supabase Auth, Authentik, configuration, and WooCommerce-signing-material recovery smoke is still missing.
- No approved real WooCommerce store exists in the pilot manifest. Connection provisioning, publication, customer linking, order/release/redemption/refund/expiry flows, outage recovery, stage alerts, and final reconciliation therefore remain pending.

Current blockers are explicit real-store approval, the controlled WooCommerce value/outage sequence, full-service clean-room recovery, alert coverage, reconciliation, and final approval. Successful archive creation does not close any of those gates.
