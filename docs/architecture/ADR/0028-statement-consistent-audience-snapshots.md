# ADR-0028: Evaluate each audience snapshot in one statement snapshot

- Status: Accepted
- Date: 2026-08-24
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M07, M10

## Context

An audience snapshot freezes the member set used by a campaign. The original
command counted candidates, opened a candidate cursor, and evaluated each
member through separate SQL statements under PostgreSQL `READ COMMITTED`.
Every statement could therefore observe a later committed wallet balance,
tier, or qualification fact. One persisted audience could mix states that
never existed together, even though every evaluation carried the same
`snapshotAt` timestamp.

A timestamp predicate is not an MVCC snapshot. In particular, the current
wallet-balance projection has no historical `recorded_at` boundary from which
an earlier balance can be reconstructed. PostgreSQL documents that two
successive commands in a `READ COMMITTED` transaction may see different data,
while `STABLE` functions use the snapshot established for their calling query.

## Decision

Build one audience snapshot through one bounded SQL cursor statement:

- materialize one database-time anchor;
- materialize at most 100,001 active wallet/customer candidates in stable
  wallet order and reject the command when the limit exceeds 100,000;
- evaluate every condition for every candidate inside that same statement;
- mark the read-only metric and member evaluators `STABLE`, so their nested
  reads use the calling statement snapshot; and
- persist the already-decided immutable membership evidence only after the
  bounded decision relation has been materialized.

The authenticated command retains its existing audience-row serialization,
Auth-derived organization role, exact idempotency key/hash, entitlement gate,
and minimized aggregate result. The coherent builder remains private and has
no execute grant for browser, runtime, or worker roles.

This decision guarantees internal coherence for one snapshot. It does not
claim that a snapshot represents a merchant-defined business cutoff earlier
than the statement snapshot; `snapshotAt` remains the database-generated
evaluation anchor.

## Alternatives considered

1. Keep separate statements and filter every source by `snapshotAt`. Rejected
   because current balance projections are not temporal and concurrent commits
   can still cross statements.
2. Run the whole command at `REPEATABLE READ`. Rejected because changing the
   caller transaction isolation inside the RPC is brittle, and a transaction
   may already have executed statements before entering the command.
3. Use `SERIALIZABLE` for every audience command. Rejected because it expands
   contention and retry semantics beyond the invariant actually required.
4. Copy all source rows into a staging table before evaluating. Rejected as
   redundant storage and write amplification when one bounded statement
   already provides a coherent MVCC view.
5. Use one materialized statement relation with `STABLE` nested evaluators.
   Accepted as the narrowest database-authoritative fix.

## Security and integrity effects

- Tenant, programme group, audience version, actor, candidate identities, and
  source facts remain derived inside PostgreSQL.
- The private builder cannot be called through Supabase Data API roles.
- The existing 100,000-candidate ceiling is enforced against the exact
  materialized set rather than an earlier count that can drift.
- A concurrent balance, tier, fact, customer, or wallet commit is observed
  wholly before or wholly after one snapshot statement, never member by member.
- Membership evidence remains private, RLS-protected, and immutable.

## Operations

Monitor snapshot duration, candidate count, included count, 100,000-candidate
rejections, statement cancellation, and count reconciliation failures. Alert
on a snapshot left in `building`; the command transaction normally rolls the
header back on any failure.

The exact-head gate must replay migrations and pgTAP, verify private
privileges and function volatility, run the two-session idempotency probe, and
exercise a concurrent source change in the disabled canary before campaign
activation.

## Migration and rollback

Deploy the replacement command and private builder while campaigns remain
disabled. No historical snapshot is rewritten. Existing completed snapshots
remain valid immutable evidence of the implementation that created them.

Rollback may disable new snapshot creation and campaign approval. Do not
replace the coherent command with the earlier multi-statement implementation
after a campaign consumes a new snapshot. Preserve accepted snapshots,
assignments, effects, ledger value, and reconciliation, then forward-fix.
