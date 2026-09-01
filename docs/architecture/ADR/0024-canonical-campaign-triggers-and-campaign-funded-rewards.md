# ADR-0024: Canonical campaign triggers and campaign-funded rewards

- Status: Accepted
- Date: 2026-08-23
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M04, M05, M06, M07, M10

## Context

Milestone, win-back, tier, referral, and limited-quantity campaigns do not share the purchase executor introduced in M07-S03. Their source facts arrive through independently versioned tier, referral, programme, and audience lifecycles. Issuing directly from an insert trigger would make commerce processing wait for reward fulfilment and would provide no bounded retry or recovery boundary. Letting a worker scan raw tables and choose tenant, programme version, member, trigger, or reward would move value authority outside PostgreSQL.

Two additional gaps must be closed before execution. A campaign was previously bound only to a programme group even though non-purchase ledger transactions require one exact programme version. A programme-reward campaign also must not reserve the member's existing points: the campaign, not the customer, funds that promised benefit.

## Decision

Bind every stable campaign to the exact programme selected by the authenticated draft command. Canonical source facts then determine the immutable programme version for milestone, win-back, tier, and referral work; a limited-quantity grant uses the programme version that owns its referenced immutable reward. Purchase context also requires the exact immutable programme version. Milestone and win-back history joins through programme versions so another programme in the same wallet group cannot qualify this campaign. A stable campaign code cannot silently move to another programme.

Append private trigger jobs from database-owned canonical facts:

- tier qualification facts produce milestone crossings and win-back return/refund evidence;
- independently verified tier decisions produce entry, retention, re-entry, and refund-caused downgrade evidence;
- completed referral issuance and compensation facts produce party-specific issue and reversal evidence; and
- a bounded scheduler materializes limited-quantity jobs from immutable treatment/control assignments while the approved schedule is open.

Jobs retain the source identity, exact programme version, event time, treatment/control assignment, minimized canonical evidence, and an optional original job for compensation. They use deterministic ordering, `FOR UPDATE SKIP LOCKED`, 15–300 second leases, at most ten attempts, and a terminal manual-review state. Expired-lease recovery is bounded by the same requested batch limit and writes attempt evidence only for rows won and transitioned by that worker transaction. PostgreSQL's `SKIP LOCKED` guidance explicitly identifies queue-like multi-consumer work as its intended use; it is not used for business-value reads.

One private execution function rechecks the lease, source binding, assignment, schedule at the original event instant, campaign definition, and exact retry before value moves. Treatment issues reserve M07 campaign capacity first. Point rewards append an attributable award and immediate release using the source programme version and immutable expiry policy; lot availability is the canonical trigger instant and expiry is calculated from that same earned instant, never worker execution time. The function then commits capacity in the same transaction. Refund-caused compensation links the original pending entry and appends one full reversal without reopening campaign capacity. Control and exhausted outcomes append zero-value evidence.

Programme rewards are restricted at the campaign boundary to reviewed V2 WooCommerce-native rewards. A campaign-funded reservation uses the catalogue cost only as an internal reservation unit: one `reserve` ledger transaction moves that unit from the programme adjustment control account to the member's reserved account, never from the member's available balance. Capture moves it to spent; definitive cancellation returns it to the adjustment control account. The reservation, native reward capacity, WooCommerce outbox command, campaign allocation, and trigger execution commit atomically. If connector creation is ambiguous, no points or campaign capacity are released automatically. Captured native benefits are not clawed back after a source refund; that non-reversible outcome remains explicit evidence.

Approval of a programme-reward campaign requires at least one active or rotating WooCommerce connection for the campaign's exact programme before assignments are created. Execution still derives the one registered customer connection from live database authority. Deterministic input, arithmetic, missing-row, duplicate-row, and contract failures enter `manual_review` after the first rolled-back attempt; transient database failures keep the bounded retry path and stop after ten claims. Raw database messages never become job diagnostics. This classification applies only before a campaign execution commits. Once a native command is accepted, its separate connector state machine retains ambiguous value and continues reconciliation without speculative release.

Pause and cancellation stop later canonical triggers. Disabling the database entitlement stops new purchase context and trigger issue jobs but does not suppress accepted work or reversals. These controls do not delete accepted jobs, assignments, executions, ledger transactions, reservations, connector commands, or exact retries. Pending limited-quantity jobs that have not entered a lease may be cancelled because no trigger value has been accepted yet. Historical committed campaign capacity is not reopened by refunds, preventing repeated threshold crossings from exceeding the approved campaign budget.

## Alternatives considered

1. Scan canonical tables in the worker and have TypeScript choose eligible campaigns. Rejected because the worker could choose tenant, member, programme version, schedule, or value and because mutable scans drift across retries.
2. Issue synchronously from tier/referral/fact triggers. Rejected because connector outages would block canonical commerce processing and because failures would have no bounded lease or manual-review state.
3. Create a parallel coupon model for campaigns. Rejected because it would duplicate M04 inventory, WooCommerce, cancellation, and ambiguous-outcome recovery semantics.
4. Award the member enough spendable points and immediately redeem them. Rejected because FIFO redemption could consume older customer lots, inflate earned-points analytics, and expose campaign funding as member value.
5. Use an auditable campaign-funded reservation inside the existing reward state machine. Accepted because customer available points never move, native fulfilment remains exactly once, and cancellation can compensate the funding account without inventing a second connector protocol.

## Security and integrity effects

- Trigger jobs, attempts, executions, and source joins remain in `loyalty_private`, have RLS enabled, and have no browser, anonymous, application-runtime, or connector table grants.
- The worker can only enqueue due limited work, claim leases, execute one claimed job, and record a bounded retry. It cannot insert jobs, select private assignments, mutate counters, choose value, or call internal helpers directly.
- Every `SECURITY DEFINER` function uses an empty search path and schema-qualified objects; public execution is revoked before the worker receives narrow grants.
- Programme reward references must belong to the campaign's programme and use a validated V2 WooCommerce fulfilment contract.
- Exact source, job, allocation, ledger, reservation, and outbox identities prevent replay from creating a second effect.
- Campaign-funded cancellation cannot credit the member's available balance. Ambiguous native outcomes retain reserved value for inspection.

## Operations

Monitor due-job lag, lease expiry, attempts, manual review, capacity exhaustion, control/treatment reconciliation, source-to-execution reconciliation, campaign-funded reserved balances, ambiguous WooCommerce commands, and refund compensation latency. Alert on any reservation or allocation whose owning job is completed without the expected downstream reference.

Official references reviewed for this decision:

- [PostgreSQL `SELECT` locking and `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html)
- [PostgreSQL explicit and advisory locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [WooCommerce CRUD data stores](https://developer.woocommerce.com/docs/best-practices/data-management/data-stores)

## Migration and rollback

Deploy additively while managed `campaigns` remains disabled. Replay from an empty database and test source crossing, exact retry, lease expiry/exhaustion, control, capacity races, programme binding, member-balance neutrality, native issue/capture/cancel, refund compensation, and private grants before a canary.

Before any trigger execution exists, the new worker calls may be disabled and the additive schema removed through a reviewed forward migration. After value exists, rollback is forward-fix only. It may stop new scheduling and claims, but must preserve jobs, attempts, executions, allocations, counters, ledger entries, reward reservations, native commands, refunds, reconciliation, and customer access. A rollback must never release a campaign-funded reservation while native outcome is unknown.
