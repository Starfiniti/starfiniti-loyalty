# ADR-0004: Loyalty value semantics

- Status: Proposed — product-owner approval required
- Date: 2026-08-11
- Scope: Phase 1 domain behavior; Rosy Rewards is the first acceptance configuration

## Context

Points movements affect customer value, merchant liability, refunds, and historical explanations. The prototype is not an authoritative policy source. The domain must require explicit programme configuration so no merchant-specific assumption becomes a global rule.

## Proposed decision bundle

1. **Legal/value model:** points are a promotional programme unit, not cash, cannot be redeemed for cash, and have only the configured display/redemption value. Alternative: stored-value credit, which introduces materially different accounting and regulatory obligations. **Recommendation:** promotional points for the initial release.
2. **Award timing:** create pending points from a paid WooCommerce order, then release them after a configurable return window. Alternative: make points immediately available and recover them after refunds, which increases negative-balance and fraud risk. **Recommendation:** pending awards with a per-programme release delay; Rosy Rewards still needs the number of days.
3. **Refund attribution:** reverse points proportionally from the original order-line award using stored attribution and cumulative-refund caps. Alternative: recalculate from current rules, which would rewrite historical meaning. **Recommendation:** original-version attribution.
4. **Insufficient balance after refund:** permit an attributable negative balance and offset future earnings. Alternative: cap reversal at zero, which leaves merchant liability unrecovered. **Recommendation:** negative balances with no customer checkout blocking and with merchant-visible audit history.
5. **Expiry:** rolling lot expiry measured from `available_at`, redeemed first-expiring-first. Alternative: inactivity-based balance expiry, which is simpler to communicate but changes all lots when activity occurs. **Recommendation:** rolling 12 calendar months for Rosy Rewards.
6. **Rounding and eligible spend:** calculate from integer minor units after discounts, excluding shipping, tax, fees, gift-card/store-credit payments, and refunded amounts; floor once per order award. Alternative: round per line, which can create basket-composition variance. **Recommendation:** order-level floor with original line attribution retained for refunds.
7. **Guest identity:** use channel-scoped immutable customer/order identifiers; never merge by email alone. A guest wallet may be claimed only after verified account linkage. Alternative: email-based merging, rejected because it can join unrelated people. **Recommendation:** verified claim workflow.
8. **Shared wallets:** disabled by default and enabled only through an explicit programme-group policy listing participating organizations. Alternative: organization-wide implicit sharing, rejected because it weakens tenant isolation. **Recommendation:** explicit allowlist.
9. **Tier qualification:** use eligible spend over a rolling 12-month window, upgrade when the threshold is crossed, recalculate attributable spend after refunds, and allow 30 days to requalify before downgrade. Alternative: lifetime spend, which avoids downgrades but creates permanently increasing benefit liability. **Recommendation:** rolling 12 months with a 30-day downgrade grace period, matching the approved prototype behavior.

## Rosy Rewards values already specified

- Display/redemption value: 100 points = EUR 1
- Expiry duration: 12 months, subject to the rolling-lot approval above
- Spend tier thresholds: EUR 150, EUR 500, and EUR 1,000
- Earn rates: 5, 6, and 7 points per EUR 1 by tier
- Commerce channel: WooCommerce

## Source conflict requiring resolution

The master plan names thresholds of EUR 150, EUR 500, and EUR 1,000 with earning rates of 5, 6, and 7 points per EUR. That cannot unambiguously map an entry tier plus three thresholds to only three rates.

The approved prototype instead shows the live programme as Rose from EUR 0 at 5 points, Bloom from EUR 150 at 6 points, and Icon from EUR 500 at 7 points. It labels a fourth tier above EUR 1,000 at 8 points as a future concept that is not part of the live programme.

**Recommendation:** use the three live prototype tiers for the first release and reserve EUR 1,000/8 points as a future, unpublished tier. This intentionally requires owner approval because it narrows the master-plan acceptance wording.

## Consequences

- Programme configuration must carry every balance-affecting policy and be versioned when published.
- Ledger entries retain rule version, original monetary basis, line attribution, award timing, expiry lot, and correlation identifiers.
- Refunds and reversals never depend on current rules.
- Policy changes apply prospectively; historical entries remain explainable.

## Rollback

No runtime or stored-data change is made while this ADR is proposed. After implementation, changing a policy requires a new programme version and compensating ledger entries where correction is necessary; historical rows are never rewritten.

## Approval requested

Approve the recommended bundle or specify changes. Three values remain explicit owner choices:

1. Rosy Rewards pending-points release delay in calendar days. **Recommendation:** 30 days, configurable per programme.
2. Tier qualification spend basis. **Recommendation:** the same eligible-spend basis as points earning.
3. Tier mapping. **Recommendation:** Rose EUR 0/5 points, Bloom EUR 150/6 points, Icon EUR 500/7 points; keep EUR 1,000/8 points unpublished for a future tier.
