# Manual Reward Fulfilment API

- Contract version: `1`
- Database migration: `20260813211000_manual_reward_fulfilment.sql`
- TypeScript schemas: `packages/contracts/src/reward-fulfilment.ts`

## State and value model

Exclusive-access and custom rewards create a private fulfilment case in the same transaction that reserves customer points and any limited reward capacity. The merchant state graph is `pending -> in_progress -> fulfilled | rejected`.

`fulfilled` is allowed only with a bounded, printable result reference. It records the reservation's `issued` and `captured` transitions and an immutable capture ledger transaction linked to the original reserve transaction. `rejected` is allowed only with a bounded reason and no result reference. It records `failed`, an immutable compensating cancel ledger transaction, and `released`. If delivery is uncertain, the operator must leave the case `in_progress`; points and capacity stay reserved.

## Authenticated merchant reads

`list_reward_fulfilment_cases(programme_id, state?, limit?)` accepts a public programme UUID, an optional allowlisted state, and a limit from 1 to 100. `get_reward_fulfilment_summary(programme_id)` returns pending, in-progress, overdue, fulfilled-30-day, and rejected-30-day counts.

Organization and programme-group scope are derived in PostgreSQL from the programme and live membership. Owner, admin, operator, analyst, and auditor may read. Responses contain public case, reservation, and customer IDs; a bounded customer display reference; reward code/name/cost; instructions; due date; state; result reference; and timestamps. Raw case/transition rows, tenant keys, wallet IDs, external identities, request hashes, ledger internals, and private evidence are never granted through the Data API.

## Authenticated merchant commands

`start_reward_fulfilment_command(case_id, idempotency_key, correlation_id)` is available to live owners, admins, and operators. It changes only `pending` to `in_progress` and appends an immutable transition plus minimized administration audit evidence.

`resolve_reward_fulfilment_command(case_id, resolution, result_reference, reason, idempotency_key, correlation_id)` is available to the same roles. `fulfilled` requires a result reference and no rejection requirement; `rejected` requires a reason and forbids a result reference. Each exact retry returns the original outcome. Reuse of an idempotency key with different meaning conflicts.

The browser never submits organization, customer, wallet, programme version, point cost, capacity, actor, ledger, or reservation authority. PostgreSQL derives and locks every authoritative row.

## Rollout and rollback

The `rewards.expanded` entitlement blocks new V2 publication and reservation but never blocks an accepted case from being inspected or resolved. Rollback disables new reservations and keeps existing cases, transitions, ledger evidence, and capacity allocations until each accepted outcome is definitively reconciled.
