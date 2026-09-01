# ADR-0029: Advance accepted campaign lifecycle from database time

- Status: Accepted
- Date: 2026-08-24
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M07, M10

## Context

Campaign versions declare `scheduled`, `active`, `paused`, `cancelled`, and
`completed` states, and the merchant calendar renders all of them. Approval
created `scheduled` versions, but the protected state machine had no legal
`scheduled → active` or accepted-state `→ completed` transition and no worker
called such a boundary. A campaign therefore remained scheduled forever,
never displayed its real lifecycle, and stayed inside the unique accepted-work
index so a successor version could not be approved even after the end instant.

Event-time execution already uses the immutable schedule and pause/cancel audit
history. It must continue to accept delayed canonical events that occurred
while a campaign was open, independently of the current display state.

## Decision

Add a bounded private lifecycle boundary driven only by PostgreSQL time:

- `scheduled → active` when the start is due and the end is still future;
- `scheduled → completed` when a delayed sweep first observes it after end;
- `active → completed` at end; and
- `paused → completed` at end so a paused historical version cannot block its
  successor forever.

Every transition locks due versions in stable order with `FOR UPDATE SKIP
LOCKED`, updates the protected status and `status_changed_at`, and appends one
immutable private lifecycle event. The public/worker wrapper accepts only a
batch limit and derives the transition instant with `clock_timestamp()`; only
a no-grant private helper accepts an explicit instant for deterministic
database tests.

The worker runs lifecycle advancement before scheduling and claiming campaign
trigger jobs. It receives only public version IDs, from/to states, and the
transition instant. The current state remains a merchant-operability
projection; historical eligibility continues to use immutable schedule and
audit evidence rather than current status.

## Alternatives considered

1. Derive the displayed state only in React. Rejected because the accepted
   unique index and operational queries still retain stale database state.
2. Let the browser activate/complete campaigns. Rejected because browser time,
   availability, and authorization are not scheduler authority.
3. Treat every accepted version as `scheduled` forever and infer openness only
   per event. Rejected because it blocks successor versions and makes merchant
   operations misleading.
4. Use a database cron extension directly. Deferred because the existing
   worker already owns bounded lifecycle sweeps and deployment does not require
   another scheduler surface.
5. Use one bounded database-time worker command with immutable events.
   Accepted as the smallest recoverable lifecycle.

## Security and integrity effects

- Browser, anonymous, application runtime, and worker roles have no direct
  table access or explicit-time helper access.
- The worker cannot select organization, campaign, status, or transition time;
  PostgreSQL derives and locks all authority.
- Definition, assignment, capacity, ledger, reward, and audit history remain
  immutable across lifecycle changes.
- Paused/cancelled audit history still prevents issue work at or after the
  recorded stop instant; completion never blocks delayed reversals, refunds,
  reconciliation, or customer value.
- The 100-row batch and `SKIP LOCKED` keep concurrent sweeps bounded without
  using skipped rows for value decisions.

## Operations

Run the lifecycle sweep every worker minute before campaign issue scheduling.
Monitor due scheduled/active/paused lag, transitions per sweep, batch
exhaustion, stale accepted versions, lifecycle-event/status reconciliation,
and successor approval failures.

The canary must cover on-time activation, missed-start completion, active and
paused completion, duplicate/concurrent sweeps, delayed in-window events,
post-pause events, successor approval, and rollback disablement.

## Migration and rollback

Deploy the additive event table, replacement protected transition function,
private bounded commands, and worker call while campaigns remain disabled.
Existing schedules have never been enabled in production, so no accepted row
requires backfill.

Rollback may stop new scheduling and lifecycle sweeps while preserving
accepted versions, lifecycle events, assignments, jobs, effects, value,
refunds, and reconciliation. Once a transition event exists, do not rewrite a
version back to an earlier state; forward-fix and reconcile instead.
