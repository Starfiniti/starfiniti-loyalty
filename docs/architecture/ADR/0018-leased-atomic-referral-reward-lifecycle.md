# ADR-0018: Leased atomic referral reward lifecycle

- Status: Accepted
- Date: 2026-08-14
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M05, M06, M10

## Context

An eligible referral becomes payable only after its historical qualification and event-time cooling deadline. At that boundary, the advocate and friend rewards are one business promise even though they credit two wallets. Worker death, retry, a refund arriving at the deadline, rollout disablement, and a customer spending already-issued points must not create half an issuance, duplicate value, speculative compensation, or a terminal referral state unsupported by the ledger.

The immutable ledger functions already provide idempotent award, release, FIFO lot, and reversal behavior. PostgreSQL owns referral state, historical programme policy, wallet authority, expiry policy, and canonical refund evidence. The worker is therefore a scheduler, not a value calculator or state authority.

PostgreSQL documents `FOR UPDATE SKIP LOCKED` as appropriate for queue-like consumers, provided candidate order is deterministic. A bounded lease is still required so worker death does not permanently hide accepted work.

## Decision

An eligible `cooling` transition creates one private referral reward job due at the immutable cooling deadline. A deterministic `(next_attempt_at, id)` claim uses `FOR UPDATE SKIP LOCKED`, a 60-second lease, a batch cap of 25, and at most ten attempts. Expired leases become retryable; the tenth exhausted attempt becomes nonclaimable `manual_review` with an allowlisted error code and immutable attempt evidence.

The worker invokes one database function under the active lease. PostgreSQL acquires the same attribution-scoped advisory lock used by qualification/refund, re-reads the latest state, and derives the original policy, qualification fact, advocate/friend customers, canonical event, exact reward points, and historical expiry policy. One transaction then:

1. records separate immutable `referral_reward` evaluations for advocate and friend;
2. posts each award to pending and immediately releases each award to an expiring FIFO lot;
3. records an advocate referral fact and a friend points fact for tier metrics;
4. binds both ledger pairs and facts in one immutable issuance row;
5. appends `cooling -> qualified`; and
6. completes the lease.

Any failure rolls back every step. An unknown acknowledgement retry returns the existing issuance. Disabling the `referrals` entitlement stops new policy/link/attribution entry but never blocks a previously accepted job.

A canonical source-order refund acquires the same attribution lock. Before issuance it cancels accepted work and appends `rejected` without value. After issuance, one transaction reverses both original awards, appends both compensating tier facts, records one immutable compensation, and only then appends `qualified -> reversed`. A referral reversal may make a wallet negative if the customer already spent the awarded lot; that is an explicit attributable liability correction, not silent value creation or history deletion.

## Alternatives considered

1. Run a single unleased cooling sweep that issues every due referral. Rejected because one poison row can repeatedly abort or delay unrelated work, worker death has no explicit recovery evidence, and bounded retries/manual review are unavailable.
2. Let the worker call two independent award commands and then update referral state. Rejected because a process or network failure between calls creates half issuance and forces ambiguous compensation.
3. Insert two outbox messages for later independent wallet awards. Rejected for this points-only slice because it creates unnecessary split-brain state between one referral promise and two independently terminal messages; it also delays qualification reconciliation.
4. Use a leased claim while PostgreSQL atomically issues/compensates both sides. Accepted because queue throughput remains bounded while all value, state, tenancy, idempotency, and refund authority stays in one database transaction.

## Security and integrity effects

- Job, attempt, issuance, and compensation tables are private, RLS-enabled, and unavailable to browser/runtime roles.
- Only `loyalty_worker` may claim, finish, issue, or invoke canonical refund compensation; it cannot supply tenant, customer, programme, wallet, points, expiry, attribution, or state authority.
- Unique referral, evaluation, ledger-idempotency, source-effect, lot, transition, and compensation fences make replay exactly once.
- Qualification/refund use one advisory-lock order, so a deadline race ends either rejected with no issuance or qualified then fully reversed.
- Errors stored in queue evidence are bounded codes; payload, identity, secret, database message, and provider details are excluded.
- Historical evaluation and tier facts remain immutable even when rewards are reversed.

## Operations

Monitor due-job age, active lease age, retry count, manual-review count, completed latency, issuance/transition mismatches, compensation/transition mismatches, wallet balance reconciliation, and referral lots with negative downstream balance effects. A completed job must have exactly one two-sided issuance and a qualified/reversed state. A reversed referral must have exactly one two-sided compensation.

## Migration and rollback

Deploy the additive private queue/evidence tables, evaluation/fact kinds, worker functions, and scheduler while `referrals` is disabled. Existing eligible cooling rows are backfilled into jobs without changing value. Enable only after a clean migration replay and adversarial database suite.

Rollback disables new policy/link/attribution entry and stops new claims if necessary, but must not delete jobs or schema. Accepted pending/retryable/processing/manual-review jobs remain inspectable and resume through a forward-fixed worker. Completed issuances, compensations, ledger entries, lots, tier facts, and transitions are retained permanently. Schema removal is allowed only after every accepted job is reconciled and terminal.
