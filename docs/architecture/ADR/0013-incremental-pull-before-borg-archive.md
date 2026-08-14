# ADR-0013: Incrementally stage PostgreSQL recovery files before Borg archival

- Status: Accepted
- Date: 2026-08-14

## Context

The production PostgreSQL recovery job exposed the completed `base/` and `wal/` tree as one tar stream over a forced SSH command. The Proxmox host passed that stream to `borg create --content-from-command` every few minutes. Borg deduplicated the stream after receipt, but it could not use file metadata or its files cache to skip unchanged source bytes. VM 971 therefore transmitted roughly 22 GB per cycle and more than 3.6 TB in one day even though the Borg repository stored only the changed chunks. The traffic stayed on the host bridge, but it repeatedly read the complete recovery set from the database disk.

The security boundary remains important: the database VM must not hold the off-site Borg repository credential, and the pull identity must not gain shell or write access.

## Alternatives

1. **Run Borg on the database VM.** Deduplication would happen before transport, but the database VM would gain the repository credential and a compromised database host could mutate or delete remote recovery points.
2. **Mount the backup tree with SSHFS and run Borg on the mount.** This retains pull authority but adds a long-lived network filesystem and ambiguous failure/cache behavior to the recovery path.
3. **Incrementally pull immutable files into a host stage, then archive normal files.** A forced `rrsync -ro` command exposes only the recovery tree. Rsync transfers each new file atomically, and Borg's files cache skips unchanged staged files.

## Decision

Use option 3. The database-VM key is restricted to the reviewed `starfiniti-postgres-backup-rsync` wrapper, which requires an rsync server command and executes `rrsync -ro` against the fixed recovery root. The Proxmox job mirrors completed files into an owner-only systemd state directory with `.partial` files excluded, then creates the encrypted off-site archive from that normal directory with the Borg files cache enabled.

The host may delete a staged file only when the read-only source no longer retains it. Source retention remains governed by the oldest verified base backup and `pg_archivecleanup`; the host mirror and Borg retention never decide PostgreSQL's WAL deletion boundary.

## Security and integrity effects

- Borg credentials remain only on the Proxmox host.
- The forced identity cannot execute arbitrary commands or modify the database VM.
- Rsync's temporary-file/rename behavior prevents a failed transfer from publishing a truncated staged file.
- `.partial` base backups are never transferred or archived.
- Borg sees stable individual file paths and can skip unchanged bytes before any off-site upload.

## Operations

Keep the timer disabled while changing the forced command or staging layout. Seed the first stage from a verified prior archive where possible, run one measured manual cycle, run one warm-cache cycle, and require a successful timer cycle. Alert when guest bytes materially exceed the size of newly completed files or when one archive unexpectedly contains a single stdin object.

## Consequences

- The Proxmox root filesystem holds one additional current recovery-set copy; capacity monitoring must include the stage.
- The first unseeded pull transfers the current set once. Seeding from a valid prior archive avoids that database-VM read and transfer.
- Restore tooling must accept the new archive's staged directory prefix as well as legacy `loyalty-postgres-backups.tar` archives during their retention period.

## Migration and rollback

Disable the timer, preserve the last successful Borg archive and current database-VM recovery files, and restore the previous forced-command line and versioned service backups if the incremental path fails. Do not re-enable the tar-over-stdin timer: use it only as a manually supervised emergency export after measuring its full-set cost. Legacy archives remain readable until normal Borg retention removes them.
