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

## Rosy Rewards values already specified

- Display/redemption value: 100 points = EUR 1
- Expiry duration: 12 months, subject to the rolling-lot approval above
- Spend tier thresholds: EUR 150, EUR 500, and EUR 1,000
- Earn rates: 5, 6, and 7 points per EUR 1 by tier
- Commerce channel: WooCommerce

## Consequences

- Programme configuration must carry every balance-affecting policy and be versioned when published.
- Ledger entries retain rule version, original monetary basis, line attribution, award timing, expiry lot, and correlation identifiers.
- Refunds and reversals never depend on current rules.
- Policy changes apply prospectively; historical entries remain explainable.

## Rollback

No runtime or stored-data change is made while this ADR is proposed. After implementation, changing a policy requires a new programme version and compensating ledger entries where correction is necessary; historical rows are never rewritten.

## Approval requested

Approve the recommended bundle or specify changes, especially the Rosy Rewards release delay in days and whether tier qualification uses gross paid spend or the same eligible-spend basis as points earning.
