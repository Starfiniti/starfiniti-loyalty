# ADR-0023: Atomic campaign capacity and attributed value

- Status: Accepted
- Date: 2026-08-23
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M03, M05, M07, M10

## Context

Approved campaigns commit a bounded amount of loyalty value to immutable audience assignments. Purchase bonuses and multipliers can overlap one commerce event, while milestone, win-back, tier, referral, and limited-reward campaigns need capacity before their later trigger and fulfilment workflows run. Reading a counter in the worker and writing value in a second transaction would permit concurrent overspend, retry drift, or value without campaign attribution.

The existing programme award boundary already validates the published programme, current tier benefit, earning caps, immutable evaluation, and ledger append. Campaign execution must preserve that boundary rather than replace it, and must keep an exact retry stable after counters are consumed or a campaign is paused. PostgreSQL transaction-level advisory locks are released with the transaction, and current PostgreSQL guidance recommends a consistent lock order to avoid deadlocks. Current Supabase guidance requires narrowly granted `SECURITY DEFINER` functions, an empty `search_path`, fully qualified objects, RLS, and explicit function privileges.

## Decision

Use database-authoritative campaign counters keyed by organization and immutable campaign version. Acquire locks in one stable order: execution operation, member, then campaign version ordered by internal version identity. The worker obtains its purchase campaign context inside the same transaction that later commits value. Context contains only public campaign identity, immutable behavior, treatment/control assignment, and exact remaining effect/member/points capacity.

Evaluate purchase campaign behavior in the pure domain package. Fixed bonuses stack. Eligible multipliers compete with the selected programme multiplier by descending priority and stable namespace identity; only one multiplier wins. PostgreSQL independently reconstructs the expected decisions and points from the immutable definition, assignment, baseline contribution evidence, and locked capacity.

`commit_purchase_campaign_execution_v1` first resolves an accepted retry, then validates context and evaluation, moves all awarded capacity to a reserved state, calls the existing programme V2 award boundary, appends one separate campaign-attributed award transaction per awarded campaign, stores immutable effect-to-ledger links, and converts reserved counters to committed counters. Any failure rolls back counters, programme value, campaign value, and evidence together.

Store the original context in the private execution batch. An exact retry receives that context even after capacity consumption, schedule completion, pause, or cancellation, and returns the original batch without appending value again. A changed hash or resource identity fails closed.

For milestone, win-back, tier, referral, and limited-reward behavior, expose a narrower reservation primitive. It derives points or approved per-effect liability from the immutable campaign, requires a treatment assignment and open event-time schedule, and atomically enforces global, per-member, points, and liability ceilings. Completion may only move `reserved` to `committed` or `released`; S04 must combine reservation, canonical trigger proof, value fulfilment, and completion in one transaction.

Campaign points do not recursively change the programme earning-rule or tier-qualification fact for the same event. They remain distinct ledger awards with campaign attribution, allowing M10 to report programme and influenced campaign value separately.

## Alternatives considered

1. Let the worker decrement counters before or after calling the existing award RPC. Rejected because a crash between calls can strand capacity or append uncapped value.
2. Fold campaign points into the programme evaluation and one ledger transaction. Rejected because it obscures programme-versus-campaign attribution, complicates refunds, and weakens immutable rule evidence.
3. Run every execution at PostgreSQL `SERIALIZABLE` isolation without explicit identities. Rejected because retries would still need stable operation and member semantics, and predictable keyed locks give a smaller contention surface.
4. Use row counters only. Considered, but a counter row does not exist before first use and purchase execution locks several versions. Transaction advisory locks plus private counter rows provide deterministic creation and ordered multi-campaign locking.
5. Reserve each campaign in separate transactions. Rejected because a multi-campaign order could partially commit capacity or value.
6. Reserve all campaigns, programme value, and campaign value in one database transaction with immutable replay evidence. Accepted because budget, quantity, idempotency, and ledger attribution share one atomic outcome.

## Security and integrity effects

- Private counters, contexts, assignments, execution batches, effects, and allocations have RLS enabled and no direct browser, runtime, connector, or worker table grants.
- The worker receives only the context, reservation, completion, and commit functions it needs. Internal arithmetic and protection functions remain uncallable.
- `SECURITY DEFINER` functions use an empty search path and schema-qualified objects.
- Campaign definitions, assignments, programme evaluations, execution batches, decisions, and ledger effects remain immutable. Mutable rows are limited to counters and one-way allocation state.
- Entitlement disablement does not hide or invalidate accepted work, exact retries, ledger history, refunds, reconciliation, or checkout.
- Campaign execution remains asynchronous; WooCommerce checkout never waits for campaign evaluation or the hub.

## Operations

Monitor execution conflicts, serialization retries, capacity-exhausted outcomes, reserved age, counter/effect reconciliation, points and liability headroom, programme-versus-campaign award totals, and execution latency. Alert when an allocation remains reserved beyond its owning trigger/fulfilment lease. M07-S04 must add reversal and cancellation behavior before scheduled execution is enabled.

Official references reviewed for this decision:

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [PostgreSQL explicit and advisory locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

## Migration and rollback

Deploy the additive schema and functions while managed `campaigns` remains disabled. Replay from an empty database, run pgTAP, execute the two-session global-capacity probe, and verify contract/domain/worker parity before any canary.

Rollback may stop new context, reservation, or execution calls. It must preserve accepted execution batches, campaign effects, allocations, counters, ledger transactions, refunds, and reconciliation. Before any campaign effect exists the functions and tables can be removed through a reviewed forward migration. After value exists, rollback is forward-fix only. Pausing or cancelling future work must never delete accepted effects or release value whose downstream outcome is ambiguous.
