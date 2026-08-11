# ADR-0004: Loyalty value semantics

- Status: Accepted
- Date: 2026-08-11
- Approved by: Product owner on 2026-08-11
- Scope: Phase 1 domain behavior; Rosy Rewards is the first acceptance configuration

## Context

Points movements affect customer value, merchant liability, refunds, and historical explanations. The prototype is not an authoritative policy source. The domain must require explicit programme configuration so no merchant-specific assumption becomes a global rule.

## Decision

1. **Legal/value model:** points are a promotional programme unit, not cash, cannot be redeemed for cash, and have only the configured display/redemption value. Stored-value credit is excluded from the initial release.
2. **Award timing:** create pending points from a paid WooCommerce order and release Rosy Rewards points after 30 calendar days. Release delay remains configurable per programme version.
3. **Refund attribution:** reverse points proportionally from the original order-line award using stored attribution, cumulative floor rounding, and a full-refund cap. Current rules never recalculate historical awards.
4. **Insufficient balance after refund:** permit an attributable negative balance and offset future earnings. Negative loyalty balance never blocks commerce checkout and remains merchant-visible in audit history.
5. **Expiry:** use rolling lot expiry 12 calendar months from `available_at`; redemption consumes earliest-expiring lots first.
6. **Rounding and eligible spend:** calculate from integer minor units after discounts, excluding shipping, tax, fees, gift-card/store-credit payments, and refunded amounts; floor once per order award. Retain original line attribution for refunds.
7. **Guest identity:** use channel-scoped immutable customer/order identifiers; never merge by email alone. A guest wallet may be claimed only after verified account linkage.
8. **Shared wallets:** disable sharing by default and enable it only through an explicit programme-group allowlist.
9. **Tier qualification:** use the same eligible-spend basis over a rolling 12-month window, upgrade when the threshold is crossed, recalculate attributable spend after refunds, and allow 30 days to requalify before downgrade.

## Approved Rosy Rewards v1

- Display/redemption value: 100 points = EUR 1
- Pending release delay: 30 calendar days
- Expiry duration: 12 calendar months from availability
- Live tiers: Rose from EUR 0 at 5 points, Bloom from EUR 150 at 6 points, and Icon from EUR 500 at 7 points per EUR 1
- EUR 1,000/8 points remains an unpublished future-tier concept
- Commerce channel: WooCommerce

## Source conflict requiring resolution

The master plan names thresholds of EUR 150, EUR 500, and EUR 1,000 with earning rates of 5, 6, and 7 points per EUR. That cannot unambiguously map an entry tier plus three thresholds to only three rates.

The approved prototype instead shows the live programme as Rose from EUR 0 at 5 points, Bloom from EUR 150 at 6 points, and Icon from EUR 500 at 7 points. It labels a fourth tier above EUR 1,000 at 8 points as a future concept that is not part of the live programme.

**Resolution:** the owner approved the three live prototype tiers for the first release and reserved EUR 1,000/8 points as a future, unpublished tier. The master-plan acceptance case is superseded by this ADR where the two conflict.

## Consequences

- Programme configuration must carry every balance-affecting policy and be versioned when published.
- Ledger entries retain rule version, original monetary basis, line attribution, award timing, expiry lot, and correlation identifiers.
- Refunds and reversals never depend on current rules.
- Policy changes apply prospectively; historical entries remain explainable.
- Award calculation requires an explicit historical tier snapshot; it never guesses whether a threshold-crossing order uses an old or new tier.

## Rollback

Rosy Rewards v1 is immutable once persisted. Changing a policy requires a new programme version and compensating ledger entries where correction is necessary; historical rows are never rewritten. Code rollback may stop new evaluation but must not delete or reinterpret existing effects.

## Implementation evidence

- `packages/domain/src/rosy-rewards.ts` is the versioned configuration fixture.
- `packages/domain/src/programme.ts` contains integer award, refund, expiry-lot, and tier-review behavior.
- Sixteen domain tests cover configuration, boundaries, failure paths, cumulative partial refunds, negative balances, month-end expiry, expiry-lot integrity, and downgrade grace.
