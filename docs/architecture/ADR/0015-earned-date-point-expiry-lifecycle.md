# ADR-0015: Earned-date point expiry lifecycle

- Status: Accepted
- Date: 2026-08-14
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M05, M08, M09, M10

## Context

The ledger already stores each released award as an immutable lot with exact `available_at`, `expires_at`, programme-version, and origin-entry attribution. The earlier private expiry and notification primitives were never scheduled by the worker. The old expiry primitive also selected every due lot in a wallet while attributing the resulting transaction to one caller-supplied programme version. A wallet containing lots from multiple immutable versions could therefore be misattributed.

Competitor behavior is not uniform. Yotpo supports date-earned, last-activity, and never-expire policies and describes date-earned expiry as per-batch/FIFO with 30, 14, and 7 day reminders. LoyaltyLion supports date-earned, activity-based, and calendar approaches and retains the original earn date when points are restored. Smile primarily documents whole-balance inactivity expiry. The current Starfiniti ledger is already a precise fit for date-earned expiry and not for a mutable inactivity clock.

References reviewed on 2026-08-14:

- [Yotpo points expiration](https://support.yotpo.com/v1/docs/setting-up-points-expiration)
- [LoyaltyLion points expiration](https://help.loyaltylion.com/en/articles/2422076-points-expiration)
- [Smile points expiry](https://help.smile.io/en/articles/5348802-understand-points-expiry)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)

## Decision

Keep `pointsExpireAfterDays` for wire compatibility and add an optional strict `PointExpiryPolicyV2` to `ProgrammeDefinitionV2`. The policy method is `earned_date`; its duration must exactly match the existing field. A policy may define at most five unique, descending reminder lead days, each strictly before expiry. Existing published V2 definitions materialize the default 30, 14, and 7 day schedule when those leads fit their duration. Existing V1 lots continue to expire and retain the legacy 30-day reminder without inventing a historical V2 policy row.

Publication materializes one immutable, tenant-scoped policy per programme version. Lots remain the value authority. Refund and reservation compensation restores the original allocation to the original lot; it never creates a fresh deadline. If that lot is already due, the next lifecycle sweep expires it immediately.

Every award source derives `available_at` and `expires_at` from its immutable earned or accepted-value instant rather than from asynchronous worker execution time. Campaign trigger points therefore use the canonical trigger `occurred_at` for immediate availability and add the historical programme policy duration to that same instant. A delayed worker may create an already-due lot, which the next expiry sweep handles normally; delay never extends customer value.

The worker calls one bounded `run_point_expiry_lifecycle_v2` boundary every minute. A transaction-scoped advisory lock makes the maintenance pass single-flight. The sweep groups due lots by organization, wallet, and original programme version and calls the low-level ledger command separately for each group. The low-level command independently verifies the wallet/version relationship and filters every allocation by that exact version. Worker access to the low-level primitive is revoked.

Reminder scheduling writes one existing `(organization, lot, lead-day)` fence and one transactional-outbox event. At any instant it selects only the nearest still-relevant configured lead. A delayed worker therefore catches up with one useful reminder instead of sending several stale reminders together. Provider delivery remains outside the value transaction and will be completed by M08.

The authenticated merchant read model exposes only aggregate outstanding, overdue, reserved-past-expiry, 30-day, 90-day, affected-member, and next-expiry values. It includes unresolved reservations through their immutable lot allocations so liability does not disappear while customer value is held, but exposes no customer identity.

## Alternatives considered

1. Add inactivity-based expiry now. Rejected because it requires a separately versioned activity clock, reset policy, customer communication semantics, and whole-balance concurrency model that the current lot ledger does not provide.
2. Make points never expire by storing PostgreSQL infinity. Rejected because `point_lots.expires_at` and all current customer/reporting contracts assume a finite, testable deadline.
3. Run one wallet-wide expiry transaction. Rejected because wallets can contain lots from multiple immutable programme versions and historical attribution would be false.
4. Schedule one external job per lot/reminder. Rejected because it duplicates authority outside PostgreSQL and complicates replay and recovery.
5. Emit every missed reminder after an outage. Rejected because a member could receive several stale warnings together.

## Security and integrity effects

- Browser input cannot set organization, wallet, lot, balance, or transaction authority.
- Publication and the TypeScript contract validate policy structure independently.
- Expiry remains an immutable balanced ledger transaction with immutable lot allocations.
- Cross-version lots cannot share an expiry transaction.
- A global bounded maintenance lock and existing wallet lock order prevent duplicate concurrent effects.
- The merchant report is RLS-authorized, aggregate-only, and contains no customer or connector identifiers.

## Migration and rollback

Deploy the additive policy table, contract, read model, and lifecycle function before starting the updated worker. Existing V1/V2 readers remain compatible. Backfill policy rows only for already published/scheduled V2 definitions; V1 lots use their legacy operational fallback.

Rollback stops the worker lifecycle call and new policy authoring. It does not remove policies, lots, notifications, outbox rows, or ledger transactions. Previously expired value is historical and is never reversed automatically. A forward fix may resume from the immutable lot balances and notification fences without duplicate effects.
