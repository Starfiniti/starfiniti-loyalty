# PostgreSQL backup-export repair — 2026-08-13

## Incident and safety decision

At 19:40 UTC the frequent encrypted off-host PostgreSQL backup failed closed. The forced exporter recursively archived the live backup root, and PostgreSQL changed the `wal/` directory while `tar` was walking it. The exporter returned status 1 and Borg returned status 2. No migration or value-producing production change proceeded while the recovery control was unhealthy.

The database, WAL archiver, and last valid off-host archive remained available. This was a loss-of-current-backup-coverage defect, not observed database corruption or loss.

## Repair

- Added `infrastructure/environments/proxmox/scripts/starfiniti-postgres-backup-export`. It snapshots only completed regular files below `base/` and `wal/`, uses NUL-delimited deterministic names, excludes `.partial` bases, and prevents `tar` from recursively rewalking a changing directory.
- Added `infrastructure/environments/proxmox/scripts/starfiniti-postgres-basebackup`. It stages and validates compressed physical backups, publishes them atomically, retains three days of bases, derives the oldest required WAL segment from the oldest retained backup's `backup_label`, and delegates safe cleanup to `pg_archivecleanup`.
- Added `scripts/validate-backup-assets.mjs` to the deployment validation gate so fail-closed execution, incomplete-base exclusion, non-recursive export, recovery-metadata verification, and retained-base WAL cleanup remain reviewable.
- Installed both scripts as root-owned production commands after shell syntax checks, retaining the previous commands for rollback.

## Production verification

- A full exporter run streamed 11,286,179,840 bytes successfully.
- A concurrent `pg_switch_wal()` during another full export did not interrupt the stream; the exporter returned zero.
- A fresh physical base `base-20260813T194243Z.tar.gz` passed compression and recovery-metadata validation before atomic publication.
- Manual encrypted archives `loyalty-postgres-20260813T194126Z` and `loyalty-postgres-20260813T194250Z` completed with Borg status zero.
- The next unassisted timer-triggered archive, `loyalty-postgres-20260813T194657Z`, completed in 51 seconds with status zero while the timer remained enabled.

The installed exporter SHA-256 is `269e84ed89396cce12e6d61dd4c3302fc0de975888f1e82b00dc2b5950ec2bb5`. The installed base-backup command SHA-256 is `e056240969281e05e773fcf8580f49c7aed5fdb90d401d92fc617d045dd40a61`.

## Remaining limitations

Database-native PITR and frequent encrypted off-host copy are healthy. The full application/Auth/signing-secret clean-room restore and the first explicitly approved real-store pilot remain open M01 gates. Local WAL capacity must remain monitored; cleanup is intentionally based on the oldest retained recoverable base, never file age alone.
