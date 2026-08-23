# ADR-0027: Derive hard campaign liability from fixed-discount face value

- Status: Accepted
- Date: 2026-08-24
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M04, M07, M10

## Context

Campaign definitions carry a maximum monetary liability and a liability amount per effect. The original contract let a merchant submit both numbers while referencing a programme reward only by public ID. Capacity enforcement charged the submitted per-effect amount without reconciling it to the immutable reward. A five-euro coupon could therefore declare one cent per effect and exceed the displayed hard ceiling by orders of magnitude.

Fixed discounts have an exact face value in programme currency. Uncapped percentage discounts, free shipping, and free products do not have one safe monetary value that the current platform can derive before fulfilment. Treating merchant estimates for those rewards as hard liability would remain misleading.

Programme versions may also be scheduled before publication. Issuing a reward from such a version before activation would expose unpublished value.

## Decision

Only a V2 WooCommerce fixed-discount reward from the exact currently published programme may be referenced by a campaign that claims a hard monetary ceiling.

The merchant catalogue exposes only those rewards for campaign selection. It derives face value, currency, and minor-unit precision from the published immutable programme/reward configuration. Merchants choose the total liability ceiling; they cannot edit the per-effect face value or currency identity.

PostgreSQL independently enforces the same boundary when a campaign draft is inserted and again when a draft is approved:

- the reward belongs to the campaign's exact programme, not merely its programme group;
- the programme version is published at validation time;
- the reward is V2, fixed discount, and WooCommerce-coupon fulfilled;
- `liabilityMinorPerEffect` equals immutable `amountMinor`;
- liability currency and precision equal the programme and reward; and
- the maximum ceiling funds at least one face-value effect.

After approval, accepted campaign work keeps its immutable reward even if the programme version is later superseded. Rollout disablement may block new approval/issue work but cannot block accepted fulfilment, refund, cancellation, or reconciliation.

Percentage discounts, free shipping, and free products remain valid programme rewards. They are excluded only from hard-liability campaign grants until a versioned, independently measurable worst-case valuation policy exists.

## Alternatives considered

1. Trust the merchant-entered estimate. Rejected because the product labels the bound as hard and capacity cannot enforce unverified value.
2. Multiply coupon face value in the browser only. Rejected because direct RPC callers can bypass browser code.
3. Treat free shipping/product or uncapped percentage rewards as zero or a configured estimate. Rejected because neither is a guaranteed maximum.
4. Allow scheduled rewards when campaign start follows `scheduled_for`. Deferred because execution would also need atomic programme activation ordering and accepted-work semantics across schedule changes.
5. Derive exact fixed-discount face value in UI and PostgreSQL. Accepted as the smallest honest monetary campaign slice.

## Security and integrity effects

- Browser input selects only a public reward resource and total ceiling; it cannot set authoritative per-effect value, currency, precision, tenant, or programme.
- The trigger follows organization, group, campaign, exact programme, version, and reward relationships in PostgreSQL.
- Same-group cross-programme rewards, unpublished rewards, unsupported kinds, malformed configurations, and understated values fail closed.
- Capacity counters continue using immutable accepted definition fields after those fields have been independently bound to reward authority.

## Operations

Monitor campaign draft/approval rejections by safe error code, committed liability against fixed-discount face value, accepted rewards whose programme version later changes lifecycle, and maximum-liability exhaustion. Merchant preview must show the immutable per-effect face value and the total funded ceiling separately.

Canary evidence must include an understated direct RPC attempt, same-group cross-programme reward, unpublished reward, unsupported native kind, exact fixed discount, capacity exhaustion, and result reconciliation.

## Migration and rollback

Deploy the additive validator/trigger and filtered merchant catalogue while campaigns remain disabled. Existing accepted campaign history is not rewritten. Because production has accepted no campaign value, any invalid draft can be recreated against a published fixed discount.

Rollback may hide fixed-discount campaign authoring and disable new issue work. Do not restore merchant-declared per-effect value after campaign value has been accepted. Preserve definitions, counters, rewards, ledger effects, reservations, refunds, and reconciliation, and forward-fix any valuation defect.
