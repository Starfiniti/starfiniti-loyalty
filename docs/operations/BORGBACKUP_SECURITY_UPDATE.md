# BorgBackup security update runbook

This runbook governs the ADR-0091 BorgBackup 1.4.5 candidate. Repository tests
prepare evidence; they do not authorize production changes.

## Current and candidate boundaries

- Current rollback client: Debian Trixie `borgbackup=1.4.0-5` at
  `/usr/bin/borg`.
- Candidate: upstream-signed BorgBackup `1.4.5` at
  `/opt/starfiniti/borg/1.4.5/borg-dir/borg.exe`.
- Production must retain the Debian package, configured repositories, archive
  history, stages, local WAL archive, physical base backups, and existing
  recovery evidence.
- Never use Debian unstable, overwrite `/usr/bin/borg`, change repository
  formats, delete archives, or combine the Borg change with a Proxmox, rsync,
  Supabase, retention, or application upgrade.

## Repository verification

```sh
npm run borgbackup-security:validate
npm run borgbackup-security:run -- \
  --out dist/borgbackup-security/manual.json
```

Accept the disposable report only when the plan digest is exact, all four
current/candidate client/server compatibility pairs and eight operation families pass, runtime
network mode is `none`, production mutation is false, and both exact container
and image teardown fields are true. CI build cache is outside those teardown
claims.

## Required private inputs

Operations stores these outside Git in approved offline recovery escrow and has
a second reviewer recheck each value:

1. Borg 1.4.5 archive, detached signature, exact README, and exported signing
   key.
2. Archive, signature, README, executable, and extracted-tree SHA-256 values,
   plus the full primary signing fingerprint.
3. Exact Debian `borgbackup_1.4.0-5_amd64.deb`, SHA-256, signed-metadata proof,
   and installed `/usr/bin/borg` executable digest.
4. A complete inventory of archive, maintenance, whole-VM, PostgreSQL, manual,
   monitoring, and recovery consumers with current executable paths, remote
   paths, repositories, cache/security directories, locks, timers, and owners.
5. Approved maintenance window, recovery/rollback owners, evidence destination,
   monitoring route, and an independently accessible host recovery path.

No credential, repository key, infrastructure identifier, route, archive
listing, or customer/tenant data belongs in repository evidence.

Stage the required Borg and OpenSSH recovery artifacts together in the closed
private layout from
`infrastructure/governance/recovery-artifact-escrow-v1.yaml`. From a clean exact
commit, copy the policy into the private root as `escrow-policy.yaml`, then run:

```sh
npm run recovery-artifact-escrow:inventory -- --bundle /absolute/private/escrow
npm run recovery-artifact-escrow:verify -- \
  --bundle /absolute/private/escrow \
  --out /absolute/new/minimized-report.json
```

The verifier downloads, copies, executes, installs, or deletes no artifact. It
rejects an incomplete or open-ended directory and proves only the staged byte
inventory. The private manifest stays out of Git. A second person must still
verify the Borg signing fingerprint and signature, candidate dependency
inventory, offline redundant custody, and recovery usability. Until that
separate review is accepted, `operations_escrow` remains pending.

## Preflight

1. Confirm local WAL and physical base backups are healthy independently of
   Borg. Confirm the last protected off-host archive, whole-VM archive, and
   alert path.
2. Prove no Borg process or timer is active. Record locks and stop only the
   reviewed Borg-producing timers; do not stop PostgreSQL, WooCommerce, the
   dashboard, worker, local WAL archiving, or local base backups.
3. Verify the installed package, `/usr/bin/borg` version and digest, remote Borg
   versions, repositories, archives, encryption access, cache/security paths,
   retention policy, and free-space boundary.
4. Independently verify the candidate archive checksum, signature, primary
   fingerprint, safe tree manifest, root ownership, non-writable modes, exact
   candidate executable digest, and version in an isolated staging path.
5. Run read-only `info`, JSON `list`, repository-only `check`, and dry-run prune
   against every real remote provider using the exact candidate executable and
   the same restricted environment as its consumer. Ambiguous or unsupported
   remote behavior fails the rollout.
6. Confirm the rollback package and instructions are available without relying
   on the host being repaired or its normal network path.

## Activation and observation

Use an operations-controlled, reviewed deployment mechanism. Install the
candidate only at the versioned path. For each consumer separately:

1. Bind its configured executable to the exact versioned path and digest.
2. Run one bounded manual archive and prove canonical archive identity,
   expected source scope, size/transfer bounds, repository check, JSON list,
   dry-run maintenance, monitoring, and zero unexpected lock/contention result.
3. Restore a bounded representative payload and compare exact bytes.
4. Enable its timer, observe one successful scheduled cycle and the next
   protected-age/attempt/transfer metrics, then continue to the next consumer.

After every consumer passes, run the dedicated maintenance dry run before any
approved prune/compact, reconcile the protected 48-hour timeline, and complete
an isolated full-service application/Auth/database/connector/configuration
restore from candidate-handled evidence. Keep the maintenance window open until
the independent reviewer accepts the minimized result.

## Rollback

Rollback on signature/digest/path drift, failed or ambiguous archive outcome,
remote incompatibility, lock leak, repository check failure, retention
difference, missing alert/metric, restore difference, or any unexpected change.

1. Pause only the affected Borg timers and capture bounded private diagnostic
   evidence.
2. Restore every changed consumer to exact `/usr/bin/borg`; verify version
   `1.4.0`, the recorded executable digest, configuration, remote path,
   repository, lock, cache/security directory, and timer definition.
3. Do not delete or rewrite candidate-created archives. Prove the rollback
   client can list, check, and extract them; if compatibility is ambiguous,
   preserve all evidence and escalate recovery rather than pruning or compacting.
4. Run one bounded manual cycle, then one timer cycle, and confirm protected-age,
   attempt, transfer, contention, and failure alerts.
5. Re-enable only reviewed timers. Keep local WAL and base backups active
   throughout. Supersede the failed rollout evidence; never edit it.

## Closeout

Record exact artifact/report digests, candidate commit and CI run, private
escrow review, every real consumer and remote result, chronology, resource
limits, manual and timer archives, maintenance result, metrics/alerts,
rollback exercise, isolated restore, unexplained differences, and operations,
security, recovery, and independent approvals. Until all are accepted,
`production_rollout`, `isolated_restore`, and `independent_review` remain
pending and M16 cannot close.
