# ADR-0070: Bound and expose PostgreSQL backup lock contention

- Status: Accepted
- Date: 2026-08-28

## Context

The incremental PostgreSQL archive and the nightly whole-VM archive serialize access to the same encrypted Borg repository through `/run/lock/starfiniti-pve-borg.lock`. A read-only production inspection on 2026-08-28 found the whole-VM job holding that lock while it processed a long VM sequence. The PostgreSQL timer retried every three minutes, but its non-blocking `flock` branch returned exit code zero. Systemd therefore recorded each skipped attempt as successful even though no new PostgreSQL archive existed.

The earlier full-tree transfer amplification remained fixed and VM 971 traffic was quiet. This is a different failure mode: a growing off-site recovery gap could masquerade as a healthy service result. A timer invocation or zero exit code is not archive evidence.

## Alternatives

1. Keep non-blocking contention as success and rely only on archive-age monitoring. This preserves quiet logs but makes local service state false and is unsafe while the monitoring source is not deployed.
2. Wait indefinitely for the repository lock. This may eventually create the archive, but can leave the oneshot service permanently activating behind a stuck or abandoned owner and makes bounded incident detection impossible.
3. Wait for a bounded interval, then return a distinct nonzero temporary-failure status. The timer continues retrying after deactivation, short contention can clear without a false failure, and prolonged contention becomes visible to systemd and archive-age monitoring.
4. Give PostgreSQL a separate Borg repository or change the whole-VM controller to release the lock between VM archives. Either can remove the long contention window, but both require separate repository ownership, retention, restore, and production-canary decisions outside this repository slice.

## Decision

Use option 3. The PostgreSQL Borg script waits at most 120 seconds for an exclusive repository lock. Timeout returns status 75 and states explicitly that no incremental archive was created. It must never convert contention into exit code zero. `OnUnitInactiveSec=3m` continues bounded retries after either success or failure, and the existing thirty-minute service ceiling still bounds the full pull/archive operation.

Only a completed `borg create`, an exact archive identity, and the archive/freshness evidence may establish backup success. Service invocation, lock contention, stage presence, or a prior archive cannot do so.

## Security and reliability effects

- No repository credential, guest path, archive content, or customer evidence enters the new log message.
- The database VM retains its restricted read-only pull identity and never receives Borg repository authority.
- Prolonged lock contention is locally observable even before the planned monitoring plane is deployed.
- The change exposes rather than solves a long whole-VM lock window. Independent archive-age/WAL alerts and an approved controller/repository redesign remain required if measured contention can breach the recovery objective.

## Rollout and verification

Deploy only from an approved immutable release outside the whole-VM backup window. Before enabling the timer, hold the exact lock under a controlled operator session, prove the service waits and exits 75 without invoking rsync or Borg, release the lock, then require one manual and one timer-triggered archive with exit code zero, exact archive identity, bounded transfer bytes, WAL continuity, and unchanged checkout/database health.

No production script, timer, service, archive, lock, or database state changed when this decision was recorded.

## Rollback

Disable the timer, preserve the last verified archive and the complete local base/WAL chain, and restore the prior reviewed script only for an explicitly supervised recovery action. Do not restore the silent-success contention branch. If the bounded wait itself is defective, forward-fix its duration or lock handling while archive-age evidence remains non-passing.
