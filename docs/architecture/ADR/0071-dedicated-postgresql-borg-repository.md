# ADR-0071: Isolate PostgreSQL recovery archives in a dedicated Borg repository

- Status: Accepted
- Date: 2026-08-28
- Supersedes: ADR-0070 for repository ownership; its bounded visible-failure rule is retained

## Context

ADR-0070 stopped repository-lock contention from appearing as a successful PostgreSQL archive, but deliberately did not remove the contention. Read-only production timing on 2026-08-28 proved that the nightly whole-VM controller held /run/lock/starfiniti-pve-borg.lock continuously for 1 hour 45 minutes 13 seconds while serially streaming many guest archives into one Borg repository. Individual guest writes lasted as long as 22 minutes 20 seconds. The first PostgreSQL retry after external-lock release still hit Borg's remote lock; the next success left a 1 hour 50 minute 39 second off-host archive gap. A three-minute PostgreSQL timer cannot meet a five-minute authoritative RPO while it shares that repository.

Borg protects each repository with exclusive locking during writes. Bypassing that lock risks repository damage. Releasing the external lock between guests would create opportunities for PostgreSQL work, but any single large guest could still exceed the recovery objective. The existing incremental rsync stage is not the source of contention and does not need a Borg lock.

Current Borg 1.4 documentation confirms that repository operations are lock-protected, warns against bypassing locks while another writer exists, and requires a separate compact after prune to reclaim space:

- [Borg general options and locking](https://borgbackup.readthedocs.io/en/stable/usage/general.html)
- [Borg prune](https://borgbackup.readthedocs.io/en/stable/usage/prune.html)
- [Borg filtered archive listing](https://borgbackup.readthedocs.io/en/stable/usage/list.html)
- [Borg separate compaction](https://borgbackup.readthedocs.io/en/stable/usage/notes.html#separate-compaction)
- [Prometheus node_exporter textfile collector](https://github.com/prometheus/node_exporter#textfile-collector)
- [systemd service credentials](https://systemd.io/CREDENTIALS/)
- [GNU Bash redirections and descriptor variables](https://www.gnu.org/software/bash/manual/html_node/Redirections.html)
- [GNU Coreutils file-mode structure](https://www.gnu.org/software/coreutils/manual/html_node/Mode-Structure.html)
- [rsync transfer statistics and numeric output](https://rsync.samba.org/ftp/rsync/rsync.1)

## Alternatives

1. **Keep one repository with ADR-0070's bounded failure.** Failures become truthful, but the recovery gap remains routine during the nightly job.
2. **Release and yield the shared external lock between VM archives.** This reduces aggregate starvation, but a single 18–22 minute VM archive still breaches the target and Borg must remain exclusive during that archive.
3. **Use a dedicated PostgreSQL Borg repository, cache/security directory, and local lock.** Whole-VM and database-native archives can proceed independently while Borg still serializes writes inside each repository.
4. **Replace Borg or move PostgreSQL copies to a second provider immediately.** This can improve failure-domain independence, but introduces a new client, retention model, restore path, and credential boundary before the current clean-room gate is complete.

The privileged shell configuration creates a separate choice. Leaving documented owner-only permissions unenforced permits a readable symlink, non-regular file, or group-writable shell fragment to be evaluated by the service. Converting immediately to `LoadCredentialEncrypted=` would provide a read-only per-unit credential directory and is the preferred future secret-delivery direction, but it also changes provisioning, escrow, rotation, manual-run, and compatibility procedures during the recovery repair. Opening the existing file once, validating that opened object, and sourcing only its descriptor enforces the current boundary without duplicating or migrating secret material.

## Decision

Use option 3.

STARFINITI_POSTGRES_BORG_REPO is a required externally configured repository selector and must differ from the whole-VM BORG_REPO. Because two strings can alias one repository, the root-owned configuration also binds the canonical 64-hex STARFINITI_WHOLE_VM_BORG_REPOSITORY_ID and STARFINITI_POSTGRES_BORG_REPOSITORY_ID values obtained during reviewed provisioning; both format and inequality are mandatory. After acquiring the dedicated local lock, each archive or maintenance run obtains the actual remote ID through bounded Borg JSON info and requires it to equal the approved PostgreSQL ID before any create, prune, or compact. Borg's isolated security state adds its normal identity verification. The scripts fail before a repository write if any invariant is absent. They use /run/lock/starfiniti-loyalty-postgres-borg.lock, isolated cache/security directories, and Borg's own bounded remote lock wait. They never acquire /run/lock/starfiniti-pve-borg.lock.

The archive script completes the restricted incremental rsync before acquiring the dedicated repository lock. Staging therefore remains fresh during a bounded retention operation; only borg create is serialized. Contention waits at most 120 seconds and exits 75 without claiming an archive.

Daily maintenance first requires a fresh successful archive, then runs a bounded partial repository-structure check, keeps every loyalty-postgres-* archive within the latest 48 hours before 35 daily and 12 monthly archives, lists the post-prune canonical archive names, and runs borg compact only when the measured maximum recent interval is at most 300 seconds. Names must match the exact UTC timestamp grammar; the inventory is capped at 2,000 entries and rejects duplicate, future, missing, or unmeasurable intervals. The local maintenance-lock wait is at most 10 seconds and every remote operation is independently interrupted after at most 15 seconds; the additional list proof raises the systemd whole-service ceiling to 105 seconds while retaining a 10-second termination ceiling. Borg's transactional commit behavior makes an interrupted prune or compact fail without committing a partial mutation. A timeout is a visible maintenance failure, not permission to continue or claim retention success. --keep-within 48h is intentional: the former --keep-hourly 48 policy could thin a successful three-minute archive stream to one copy per hour and invalidate the off-host recovery objective after pruning. A bounded partial check is a precondition for automated destructive retention; a complete repository/index check, full data verification, and an isolated restore remain separate mandatory evidence.

The archive and maintenance jobs publish nine aggregate machine-bound gauges through node_exporter's textfile collector using temporary files and same-directory rename. Archive completion time and completed-attempt status, per-cycle transferred bytes and amplification ratio, canonical repository-isolation status, maintenance completion/status, retained recent count, and maximum retained interval contain only the bounded environment and service labels. Owner-only numeric state preserves the last successful values across a failed attempt; failure updates the completed-attempt gauge without rewriting the last-success timestamp, so stale and failed states remain distinguishable. Missing series are alert failures. Repository IDs, selectors, paths, archive names, backup contents, credentials, and value/customer data never enter metrics. Publishing telemetry does not authorize or synchronously gate checkout, ledger, refund, redemption, archive creation, or restore; an archive that succeeds but cannot publish evidence remains present while the service reports failure for operator attention.

Both privileged jobs require an absolute canonical non-symlink configuration path whose immediate directory is owned by the effective service user and not writable by group or others. Every higher ancestor must be owned by the service user or root and must also be non-writable by group/others or provide sticky-directory protection. They then open the file once, inspect the opened descriptor as a regular file owned by the same service user, require exact mode `0400` or `0600`, and source only `/dev/fd/<opened descriptor>`. The safe directory chain prevents an untrusted pre-open replacement or blocking FIFO; the descriptor prevents byte replacement after opened-object validation. Direct path sourcing, executable configuration, and group/other access fail before rsync, Borg, metrics, retention, or repository access. File-type checks use shell predicates and numeric metadata rather than localized `stat` descriptions. Migrating the configuration and passcommand to encrypted systemd credentials remains a compatible future hardening step, not a prerequisite for this additive repair.

Each completed rsync stage runs with the C locale and `--no-human-readable`, captures exactly one pure-digit `Total transferred file size` and `Total bytes received` pair, and publishes the canonical changed-to-wire amplification ratio plus received-byte total atomically. Missing, duplicated, malformed, or over-18-digit evidence fails before repository access. Crossing both reviewed boundaries—strictly more than four times immutable changed-file bytes and strictly more than one GiB received—also fails before Borg creation while preserving the staged recovery files and aggregate alert evidence. Equality at either boundary remains non-triggering. This controller-local stop complements, rather than replaces, the protected Prometheus alert and archive-age evidence.

The new repository is never initialized automatically. An approved operator must create it with reviewed encryption and remote access, escrow/export its recovery material, run a dry-run retention review, and prove create/list/dry-run-extract/restore behavior. Existing PostgreSQL archives in the shared repository remain retained until the dedicated repository has passed its first verified archive, maintenance, timer, and isolated restore evidence.

## Security and reliability effects

- The database VM still has only a forced read-only rsync identity and receives no Borg credential.
- The Proxmox root-owned environment may retain the same Borg transport/passcommand, but repository identity, local lock, cache, security state, retention, and restore evidence are distinct.
- Whole-VM duration can no longer suppress PostgreSQL archive creation.
- Repository reuse, missing configuration, unbounded lock waits or maintenance commands, silent contention, full-tree stdin streaming, hourly thinning of recent archives, unsafe archive-name inventories, intervals above 300 seconds, non-atomic metrics, and maintenance without compaction fail deterministic validation.
- A dedicated repository and repository-level metrics remove one contention/visibility domain; they do not prove provider independence, production monitoring activation, restore correctness, or the M15 clean-room gate.

## Rollout and verification

Production rollout requires an approved immutable release and recovery window:

1. Create the dedicated encrypted repository and separately escrow its key/recovery material without printing it.
2. Record both canonical repository IDs in the owner-only configuration and prove both IDs and selectors differ.
3. Require the configuration to be an absolute canonical regular non-symlink file inside a service-owned non-group/other-writable directory whose higher ancestors are service/root-owned and non-writable or sticky-protected, owned by the unit's effective user with exact mode `0400` or `0600`; reject the rollout if either job accepts a permissive, linked, wrong-owner, non-regular, unsafe-parent, or unsafe-ancestor fixture.
4. Run exact boundary fixtures for valid, missing, duplicated, one-GiB, four-times, and dual-threshold rsync statistics; an amplified cycle must retain aggregate metrics but invoke neither repository identity lookup nor Borg create.
5. Disable the legacy PostgreSQL prune timer, install the reviewed archive and maintenance scripts plus their isolated/conflicting systemd units, configure node-exporter's textfile collector for the reviewed directory, then run systemd-analyze verify.
6. Keep the timers disabled while a manual archive, exact list, dry-run extract, and retention dry run pass.
7. Hold the whole-VM lock and prove a manual PostgreSQL archive still succeeds; hold the dedicated lock and prove the archive and maintenance commands exit 75 without invoking Borg.
8. Enable the archive timer, require a timer-created archive inside five minutes, then trigger the bounded maintenance unit. Prove its required fresh archive precedes the maintenance lock, all nine aggregate series are independently scraped, missing/zero/over-bound fixtures fire the exact protected alerts, no archive-age interval breaches the target, the latest archive and every archive inside the 48-hour window remain, and a timeout fails visibly without a partial retention commit.
9. Perform an isolated restore from the dedicated repository and reconcile base/WAL continuity before retiring any shared-repository PostgreSQL history.

Repository tests use mock rsync/Borg commands to prove successful dedicated routing, missing configuration, selector reuse and canonical-ID reuse refusal, staging-before-lock order, contention status, bounded check/prune/list/compact order, atomic minimized metrics, a visible over-bound retained interval, legacy-timer conflict, and no whole-VM lock acquisition. No production repository, script, timer, lock, archive, credential, monitoring service, or value changed when this ADR was accepted.

## Rollback

Disable both dedicated-repository timers and preserve their repository, the previous shared-repository archives, and the complete local base/WAL chain. Restore the prior application package only for a supervised recovery action while archive freshness is explicitly failing. Never reintroduce silent success, bypass Borg locking, delete the dedicated repository, or prune the old PostgreSQL archive series until a replacement path has passed create and isolated restore evidence.
