# ADR-0026: Cumulative compensation for purchase-campaign awards

- Status: Accepted
- Date: 2026-08-24
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M07, M10

## Context

A V2 purchase commits the programme award and every awarded purchase campaign as separate immutable ledger origins. The WooCommerce refund worker previously calculated and reversed only the programme origin. Bonus and multiplier campaign points therefore remained pending or available after an ordinary partial or full order refund.

Campaign effects and capacity counters are append-only gross issuance evidence. Mutating an effect to `reversed` or refilling committed capacity would erase what the campaign actually issued and could make a historical ceiling appear unused. Refunds also arrive cumulatively, may replay, and may be observed after points release or spend.

## Decision

Record purchase-campaign refunds through one private database command in the same worker transaction as the programme reversal and commerce-effect completion.

For each awarded campaign effect linked to the original programme evaluation, PostgreSQL derives a cumulative target from authoritative refund evaluation evidence:

- a full refund targets the exact original campaign points;
- a partial refund targets `floor(original campaign points × cumulative refunded eligible spend / original eligible spend)`; and
- the posted delta is the target less all prior append-only compensation for that effect.

The command serializes the wallet and campaign effects, records the existing tier-refund fact, rejects backward or out-of-range cumulative evidence, reverses each exact campaign ledger origin, and appends one immutable compensation row per effect and refund evaluation. Exact replay returns the existing outcome. A zero-delta cumulative step still records evidence but posts no ledger transaction.

The worker invokes this boundary after the programme-origin reversal and before tier requalification and `finish_commerce_effect`. Any failure rolls the entire value transaction back; the commerce effect is then retried through the normal bounded lease path. Entitlement disablement cannot block refund compensation.

Gross campaign effects and capacity remain unchanged. Merchant `reversedAwards` is derived from compensation sums reaching the original effect points, not from a mutable effect state. M10 may add versioned gross, reversed-point, and net-point metrics without changing this evidence.

## Alternatives considered

1. Reverse only the programme award. Rejected because separately attributable campaign value remains spendable after refunded commerce.
2. Update `campaign_effects.state` to `reversed`. Rejected because effects are immutable and one state cannot represent cumulative partial refunds.
3. Delete or decrement campaign capacity. Rejected because capacity is a gross approval ceiling and historical issuance must remain reconstructable.
4. Reverse every campaign bonus only on a full refund. Rejected because the existing programme policy is cumulative and proportional; silently applying a second policy would make equal purchase value reverse differently.
5. Append per-origin cumulative compensation evidence. Accepted because it preserves history, exact idempotency, lot attribution, and independent reconciliation.

## Security and integrity effects

- Only `loyalty_worker` may execute the command; browser, anonymous, runtime, and direct worker table access remain revoked.
- Organization, customer, wallet, campaign effects, original origins, cumulative evidence, and transaction authority are derived in PostgreSQL.
- The evidence table has RLS enabled and an immutable update/delete trigger, even though no direct role receives table access.
- Stable wallet/effect locking and existing ledger idempotency serialize concurrent partial/full refunds and prevent over-reversal.
- Refund compensation remains available when campaign rollout is disabled and never depends on WooCommerce checkout.

## Operations

Reconcile original campaign points against summed compensation points and linked `refund_reversal` transactions. Alert on backward evidence, a positive delta without a reversal transaction, a fully refunded order with net campaign points, or a commerce effect exhausted after campaign compensation failure.

The canary must cover partial then full refund, exact replay, released and spent lots, disabled entitlement, cross-tenant denial, and concurrent cumulative refunds before M07 closes.

## Migration and rollback

Deploy the additive evidence table, private command, worker call, and result projection with campaigns disabled. A forward fix may stop new campaign issuance while compensation stays enabled.

Rollback may revert the worker to the prior binary only before campaign purchase value is accepted. After compensation rows exist, retain the table and command. Never delete compensation evidence, rewrite campaign effects, or refill gross capacity; disable new issuance and reconcile forward instead.
