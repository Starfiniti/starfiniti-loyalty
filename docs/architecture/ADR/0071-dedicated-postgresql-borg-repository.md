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
- [Borg separate compaction](https://borgbackup.readthedocs.io/en/stable/usage/notes.html#separate-compaction)

## Alternatives

1. **Keep one repository with ADR-0070's bounded failure.** Failures become truthful, but the recovery gap remains routine during the nightly job.
2. **Release and yield the shared external lock between VM archives.** This reduces aggregate starvation, but a single 18–22 minute VM archive still breaches the target and Borg must remain exclusive during that archive.
3. **Use a dedicated PostgreSQL Borg repository, cache/security directory, and local lock.** Whole-VM and database-native archives can proceed independently while Borg still serializes writes inside each repository.
4. **Replace Borg or move PostgreSQL copies to a second provider immediately.** This can improve failure-domain independence, but introduces a new client, retention model, restore path, and credential boundary before the current clean-room gate is complete.

## Decision

Use option 3.

STARFINITI_POSTGRES_BORG_REPO is a required externally configured repository selector and must differ from the whole-VM BORG_REPO. Because two strings can alias one repository, the root-owned configuration also binds the canonical 64-hex STARFINITI_WHOLE_VM_BORG_REPOSITORY_ID and STARFINITI_POSTGRES_BORG_REPOSITORY_ID values obtained during reviewed provisioning; both format and inequality are mandatory. After acquiring the dedicated local lock, each archive or maintenance run obtains the actual remote ID through bounded Borg JSON info and requires it to equal the approved PostgreSQL ID before any create, prune, or compact. Borg's isolated security state adds its normal identity verification. The scripts fail before a repository write if any invariant is absent. They use /run/lock/starfiniti-loyalty-postgres-borg.lock, isolated cache/security directories, and Borg's own bounded remote lock wait. They never acquire /run/lock/starfiniti-pve-borg.lock.

The archive script completes the restricted incremental rsync before acquiring the dedicated repository lock. Staging therefore remains fresh during a bounded retention operation; only borg create is serialized. Contention waits at most 120 seconds and exits 75 without claiming an archive.

Daily maintenance first requires a fresh successful archive, then runs a bounded partial repository-structure check, keeps every loyalty-postgres-* archive within the latest 48 hours before 35 daily and 12 monthly archives, and runs borg compact. The local maintenance-lock wait is at most 10 seconds and every remote operation is independently interrupted after at most 15 seconds; the systemd unit adds a 90-second whole-service ceiling and a 10-second termination ceiling. Borg's transactional commit behavior makes an interrupted prune or compact fail without committing a partial mutation. A timeout is a visible maintenance failure, not permission to continue or claim retention success. --keep-within 48h is intentional: the former --keep-hourly 48 policy could thin a successful three-minute archive stream to one copy per hour and invalidate the off-host recovery objective after pruning. A bounded partial check is a precondition for automated destructive retention; a complete repository/index check, full data verification, and an isolated restore remain separate mandatory evidence.

The new repository is never initialized automatically. An approved operator must create it with reviewed encryption and remote access, escrow/export its recovery material, run a dry-run retention review, and prove create/list/dry-run-extract/restore behavior. Existing PostgreSQL archives in the shared repository remain retained until the dedicated repository has passed its first verified archive, maintenance, timer, and isolated restore evidence.

## Security and reliability effects

- The database VM still has only a forced read-only rsync identity and receives no Borg credential.
- The Proxmox root-owned environment may retain the same Borg transport/passcommand, but repository identity, local lock, cache, security state, retention, and restore evidence are distinct.
- Whole-VM duration can no longer suppress PostgreSQL archive creation.
- Repository reuse, missing configuration, unbounded lock waits or maintenance commands, silent contention, full-tree stdin streaming, hourly thinning of recent archives, and maintenance without compaction fail deterministic validation.
- A dedicated repository removes one contention domain; it does not prove provider independence, archive freshness monitoring, restore correctness, or the M15 clean-room gate.

## Rollout and verification

Production rollout requires an approved immutable release and recovery window:

1. Create the dedicated encrypted repository and separately escrow its key/recovery material without printing it.
2. Record both canonical repository IDs in the owner-only configuration and prove both IDs and selectors differ.
3. Disable the legacy PostgreSQL prune timer, install the reviewed archive and maintenance scripts plus their isolated/conflicting systemd units, then run systemd-analyze verify.
4. Keep the timers disabled while a manual archive, exact list, dry-run extract, and retention dry run pass.
5. Hold the whole-VM lock and prove a manual PostgreSQL archive still succeeds; hold the dedicated lock and prove the archive and maintenance commands exit 75 without invoking Borg.
6. Enable the archive timer, require a timer-created archive inside five minutes, then trigger the bounded maintenance unit. Prove its required fresh archive precedes the maintenance lock, no archive-age interval breaches the target, the latest archive and every archive inside the 48-hour window remain, and a timeout fails visibly without a partial retention commit.
7. Perform an isolated restore from the dedicated repository and reconcile base/WAL continuity before retiring any shared-repository PostgreSQL history.

Repository tests use mock rsync/Borg commands to prove successful dedicated routing, missing configuration, selector reuse and canonical-ID reuse refusal, staging-before-lock order, contention status, bounded check/prune/compact order, legacy-timer conflict, and no whole-VM lock acquisition. No production repository, script, timer, lock, archive, credential, or value changed when this ADR was accepted.

## Rollback

Disable both dedicated-repository timers and preserve their repository, the previous shared-repository archives, and the complete local base/WAL chain. Restore the prior application package only for a supervised recovery action while archive freshness is explicitly failing. Never reintroduce silent success, bypass Borg locking, delete the dedicated repository, or prune the old PostgreSQL archive series until a replacement path has passed create and isolated restore evidence.
