# Backup and Restore

## Objectives

- Authoritative PostgreSQL RPO: 5 minutes or better.
- Declared full-service RTO: 60 minutes or better for the initial single-site scenario.
- No production readiness claim until a clean-room restore meets both with recorded evidence.

VM snapshots are useful recovery aids but are not authoritative database backups.

## Backup set

1. PostgreSQL physical base backup plus continuous WAL archive for PITR.
2. Daily logical schema/global-object export for portability and inspection.
3. Supabase/application pinned-version manifests and non-secret configuration.
4. Encrypted secret escrow with separate access controls and rotation records.
   The escrow must include the complete WooCommerce signing-key pool with stable references; PostgreSQL stores only those references, so restoring the database without the matching pool prevents signature verification and connector recovery.
5. Storage-object backend backup/versioning when Storage becomes authoritative for user artifacts.
6. WooCommerce plugin configuration/outbox recovery documentation; WordPress remains the commerce source for source facts.

## Storage and security

- Backups are client-side encrypted before leaving the VM and copied to an off-host provider/failure domain.
- Encryption keys are separate from backup objects and production runtime credentials.
- Retention uses immutable/object-lock controls where available. For the three-minute PostgreSQL archive stream, retain every archive within 48 hours before 35 daily and 12 monthly tiers; an hourly-only recent policy does not preserve the declared off-host recovery point.
- Backup identities are write-only where practical; restore identities are separate and audited.
- Completion, completed-attempt status, dedicated-repository identity/isolation, WAL lag, object age, maximum retained recovery interval, size anomaly, verification checksum, and retention deletion are monitored. Missing telemetry is failure, not a healthy zero.
- Backup contents are Restricted/Confidential and never attached to CI or support tickets.

## Restore drill

1. Open an incident/drill record with target recovery time and point.
2. Provision an isolated Linux VM/network with no production egress or user traffic.
3. Restore pinned Supabase/Postgres configuration and required secret escrow.
4. Restore the latest valid base backup and replay WAL to the target point.
5. Run database integrity, migration history, RLS/grant, ledger balance/projection, queue, Auth, and object-reference checks.
   Confirm every active `commerce_connections.signing_material_ref` resolves to exactly one escrow-restored key without printing key material, and no pool reference backs more than one connection.
6. Deploy the matching application image and run smoke/reconciliation tests.
7. Replay privacy deletions/pseudonymizations newer than any restored copy before exposure.
8. Record actual RPO/RTO, data gaps, checksums, versions, failures, and corrective actions.
9. Destroy or reclassify the isolated restored environment through an audited procedure.

## Verification queries/gates

- PostgreSQL accepts connections and required extensions/schemas match expected versions.
- Migration list exactly matches the release manifest.
- No candidate/exposed tenant table lacks RLS or expected grants.
- Every ledger transaction balances to zero; stored projections equal rebuilt projections.
- Inbox/outbox uniqueness constraints and pending/dead-letter counts are consistent.
- Auth login, authorized tenant read, forbidden cross-tenant read, webhook receipt, and one idempotent value command pass.

## M15 full-service clean-room controller

The production database-only drill remains valid evidence for PostgreSQL extraction and WAL replay, but it is not full-service recovery evidence. M15-S04 uses `infrastructure/testing/recovery/plan.yaml` and `scripts/run-clean-room-recovery.mjs` to begin timing before disposable provisioning and stop full-service RTO only after database, Supabase Auth, Authentik, application, configuration, signing, privacy, connector, value, and independent reconciliation checks pass.

Before a real run:

1. Stage the exact reviewed driver and all recovery inputs on an isolated Linux host. Backups and escrow stay read-only and outside Git.
2. Create an owner-only minimized inventory with its observation instant, exact image/input digests, source-manifest aggregate counts for committed facts, ledger, queues, Supabase Auth, Authentik, provider configuration, signing references, and post-target privacy actions, the disposable marker/project, zero ingress/egress/production routes, simulated failure instant, fresh last-committed marker instant, and latest recoverable instant.
3. Create an owner-only control file binding the clean candidate commit, canonical document digest, inventory document digest, raw driver digest, exact target, short approval reference/window, and a maximum run no longer than two hours. The remaining approval window must be at least that full maximum run when the controller starts.
4. Run `npm run recovery:validate`, independently review the driver, and verify the target has no route to production.
5. Execute from the clean candidate checkout:

```bash
npm run recovery:run -- \
  --control-file /restricted/recovery-control.yaml \
  --inventory-file /restricted/recovery-inventory.yaml \
  --driver /restricted/recovery-driver.mjs \
  --out /restricted/recovery-primary.json
```

6. Repeat with a separately approved equivalent source set and a distinct observed inventory. Independently reconcile both inventory digests, both raw report digests, and every database, ledger, queue, Supabase Auth, Authentik, configuration, signing, privacy, connector, WooCommerce, and unexplained-loss count.
7. Commit only the sanitized summaries/digests accepted by `docs/plan/evidence/M15/recovery.yaml`. Raw logs, receipts, paths, origins, backup data, secrets, and test identities stay in the restricted evidence store.

The controller always invokes `destroy_clean_room`. A retained volume, network, route, credential copy, identity, or runnable service fails the run. Do not manually change a failed report to passed; correct the driver or recovery source under a new exact approval and repeat the full drill.

## Failure handling

- A failed or stale backup is a paging alert, not a warning-only dashboard item.
- If WAL continuity breaks, start a new verified base backup and record the expanded RPO exposure.
- If restore evidence fails, production changes that increase authoritative data volume stop until corrected.
- Suspected backup-key compromise triggers key rotation, new base backup, object access review, and incident response.

## Owner inputs deferred to deployment

The off-host provider/bucket, encryption-key custodian, retention/legal policy, and Proxmox storage layout require real infrastructure access. Templates and tests can be completed without those values; fabricated production destinations are forbidden.

## Production evidence — 2026-08-13

The first `v0.1.0` deployment uses the following live recovery layers:

- PostgreSQL `archive_mode=on`, `archive_timeout=60s`, and an owner-only WAL archive outside `PGDATA`.
- A daily physical `pg_basebackup` timer with compressed-backup validation and three-day local staging retention.
- An encrypted off-host Borg archive of the current base/WAL set on a three-minute inactive cadence. Access uses a forced-command, forwarding-disabled pull key; the database VM does not hold the Borg repository credential. The forced command exposes only a read-only `rrsync` view of completed base/WAL files. The Proxmox host incrementally mirrors those files into an owner-only stage and archives the normal file tree with Borg's files cache enabled; `.partial` bases are excluded.
- Borg retention timers keep 48 hourly, 35 daily, and 12 monthly PostgreSQL recovery points.
- A separate nightly encrypted Borg VM archive is configured to include the application and Supabase VMs and is supplementary to database-native PITR. As of 2026-08-13 18:20 Europe/Ljubljana, the timer had not completed its first run after the loyalty VMs were created; application/Auth/signing recovery therefore remains unproved and the archive must not be claimed as available until a completed job and isolated restore are recorded.

The initial base backup was recovered from the off-host archive and passed `pg_verifybackup` with the exact pinned `supabase/postgres:17.6.1.136` tooling. A later isolated, networkless drill extracted the encrypted Borg archive, verified its transfer checksum, started the same pinned PostgreSQL image, replayed archived WAL, promoted cleanly, and became ready in 9 seconds with all twenty-six migrations. Temporary restore copies and containers were removed after evidence was stored at `/opt/starfiniti/deployment-evidence/offhost-restore-drill-20260813T100256Z.txt`. Reattaching encrypted application/Auth secret escrow and running full RLS/ledger/application smoke remain required before closing R-004 completely.

At 19:40 UTC the live off-host job exposed a concurrency defect in its original recursive `tar` command: PostgreSQL changed the `wal/` directory while the exporter was walking it, causing `tar` and Borg to fail closed. Production migration work stopped. The reviewed snapshot-safe exporter and retained-base WAL cleanup were installed, a fresh verified physical base was created, and a forced WAL switch during a full export completed successfully. Two manual encrypted archives and the next timer-triggered archive (`loyalty-postgres-20260813T194657Z`) completed with exit code zero. Repository evidence and remaining recovery limitations are recorded in `docs/plan/evidence/M01/backup-export-repair-2026-08-13.md`.

On 2026-08-14 the snapshot-safe tar exporter exposed a separate transfer-amplification defect: `borg create --content-from-command` received the entire recovery set as one stdin object and therefore retransmitted roughly 22 GB from the database VM before deduplicating every cycle. More than 3.6 TB stayed on the internal Proxmox bridge in one day. The timer was contained without stopping PostgreSQL or local WAL/base backups. Production now uses the restricted incremental rsync stage defined by ADR-0013. A measured cold-delta run transferred 269,360,503 bytes, the immediate warm run transferred 16,871,892 bytes and completed in three seconds, and the first timer-triggered archive succeeded. Evidence is recorded in `docs/plan/evidence/M01/backup-transfer-amplification-2026-08-14.md`.

On 2026-08-28 a read-only follow-up proved the multi-terabyte VM counter was cumulative and the transfer-amplification loop was no longer active. It also exposed a distinct recovery gap: the nightly whole-VM job held the shared Borg repository lock across its complete guest sequence, with individual archives lasting up to 22 minutes 20 seconds. Every PostgreSQL timer attempt during that interval silently returned success without an archive. ADR-0070 first made contention bounded and visible. ADR-0071 then selected a dedicated PostgreSQL Borg repository, lock, cache/security state, and retention controller because per-guest lock yielding would still miss the five-minute target.

The ADR-0071/ADR-0072/ADR-0073 candidate is repository-tested but not deployed. Its automated maintenance requires a fresh archive before taking the dedicated lock, bounds every Borg operation, proves the post-prune canonical 48-hour timeline has no interval above 300 seconds, and fails before compaction on malformed or unsafe retention evidence. Both privileged jobs open their configuration once and source only the validated descriptor after proving an absolute canonical regular non-symlink file inside a service-owned non-group/other-writable directory with only service/root-owned and non-writable or sticky-protected higher ancestors, owned by the effective service user with exact mode `0400` or `0600`; permissive, executable, linked, differently owned, non-regular, or unsafe-directory-chain shell input fails before any external action. The archive job also requires a canonical trusted non-writable rsync 3.5-or-newer executable before stage or evidence changes, captures one C-locale pure-digit statistics pair, and atomically publishes the canonical received-byte and changed-to-wire amplification gauges. Missing, duplicate, malformed, or over-18-digit totals fail before repository access; a cycle strictly above both four-times amplification and one GiB retains aggregate alert evidence but does not invoke Borg. The database-VM forced exporter independently requires fixed root-owned safe-parent rsync and `rrsync`, the same minimum version, the upstream `--confine-root` integration, and a cleared inherited environment before `rrsync -ro` can list the fixed backup root. Read-only inspection found the Debian host on rsync 3.4.1 and the Ubuntu guest on 3.2.7, so the candidate intentionally refuses the current transport. ADR-0073 binds an exact Debian archive host package and exact rsync-project Launchpad Ubuntu package through digest-pinned disposable images, signed repository metadata, package checksums, protocol/confinement checks, an internal-only synthetic transfer, and zero-residue teardown. The plan also binds the exact pre-change host rsync, host `libacl1`, and guest rsync rollback artifacts. The exact-head Linux canary resolved each through signed base-distribution metadata and its exact HTTPS archive URL, proved byte equality, checksum and package metadata, installed none, published only minimized facts, removed the bytes before candidate acquisition, and completed the bounded transport and teardown. This passing canary is neither installation nor operations-escrow authority. Production continues using the shared repository and old transport and has no active monitoring plane until operations copies the three verified bytes to approved offline escrow, independently rechecks their hashes, approves and proves the dual-endpoint rollout, creates and escrows the dedicated repository, proves the exact repository distinction, configures and validates node-exporter/Prometheus routing, validates a retention dry run, installs both reviewed units, completes manual/timer/timeout/alert evidence, and restores the dedicated archive in isolation. Local WAL/base production continues independently if the off-site transport refuses. Existing shared-repository PostgreSQL archives must remain available throughout that transition.

ADR-0094 makes the byte handoff for that gate executable without changing
production. Operations stages the closed V2 catalogue from
`infrastructure/governance/recovery-artifact-escrow-v2.yaml` outside the
repository, copies that exact policy as `escrow-policy.yaml`, and runs:

```sh
npm run recovery-artifact-escrow:inventory -- --bundle /absolute/private/escrow
npm run recovery-artifact-escrow:verify -- \
  --bundle /absolute/private/escrow \
  --out /absolute/new/minimized-report.json
```

The verifier has no network, artifact-copy, execution, installation, production,
or mutation path. It requires the exact candidate host rsync and `libacl1`, guest
rsync, all three rollback packages, and the reviewed forced-command, controller,
unit, sudoers, validation, canary, decision, evidence, and runbook files. A pass
proves only a stable closed byte inventory. Package-authority review, the
`libacl1` host-consumer decision, redundant offline custody, real forced-command
and timer evidence, independent review, and isolated recovery remain pending.

The same read-only installed-state review found Debian Trixie `borgbackup=1.4.0-5`, which Debian marks affected by `CVE-2026-62268` with a no-DSA/minor disposition. ADR-0091 selects the official upstream-signed BorgBackup 1.4.5 single-directory release as a side-by-side candidate rather than mixing Debian unstable into the production host. Its closed plan verifies the exact current package through signed Trixie metadata and an independent byte-equal archive URL, then binds the candidate archive, signature, README-published full fingerprint, executable, and safe extracted-tree manifest. A networkless unprivileged compatibility canary exercises current/candidate clients and remote servers plus rollback extraction. The candidate is not deployed: exact-head CI, offline escrow, every real remote and consumer, manual/timer/maintenance checks, monitoring, rollback, isolated full-service restore, and independent approval remain required under `docs/operations/BORGBACKUP_SECURITY_UPDATE.md`.

ADR-0092 similarly selects only a side-by-side OpenSSH 10.5p1 recovery client;
both distribution daemons and `/usr/bin/ssh` remain untouched. ADR-0093 now
defines one closed private 30-entry Borg/OpenSSH escrow inventory and a
networkless in-place verifier. It rejects missing, extra, linked, mutable,
over-bound, digest-different, or wrong-commit bytes and emits no private path or
raw content. This makes the eventual byte handoff checkable, but no private
bundle, offline custody, fingerprint/dependency review, second-person approval,
real-provider proof, or full-service restore exists yet. The new repository
contract therefore does not change R-004 or authorize either candidate.
