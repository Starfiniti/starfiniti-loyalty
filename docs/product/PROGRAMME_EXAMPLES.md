# Programme Examples

## Rosy Rewards acceptance case

Approved versioned configuration in `packages/domain/src/rosy-rewards.ts`:

- Currency: points; display conversion 100 points = EUR 1
- Pending release: 30 calendar days after the award instant
- Expiry: 12 calendar months from `available_at`, earliest-expiring lots redeemed first
- Live tiers: Rose EUR 0/5 points, Bloom EUR 150/6 points, Icon EUR 500/7 points per EUR 1
- Tier qualification: eligible spend in a rolling 12 months with 30-day downgrade grace
- Channel: WooCommerce

ADR-0004 resolves the source conflict in favor of the prototype's three live tiers. EUR 1,000/8 points remains an unpublished future-tier concept.

## Executable examples

- A Rose-tier EUR 123.45 eligible order earns 617 pending points: integer calculation `floor(12,345 × 5 ÷ 100)`.
- An award pending at 2026-08-11 10:15 UTC becomes available at 2026-09-10 10:15 UTC and expires at 2027-09-10 10:15 UTC.
- EUR 149.99 rolling eligible spend qualifies for Rose; EUR 150.00 qualifies for Bloom; EUR 500.00 qualifies for Icon.
- An Icon member below threshold retains Icon during the 30-day grace period, then moves to the tier justified by rolling eligible spend.
- Cumulative partial-refund rounding converges exactly: a 617-point award reversed across approved cumulative refund steps returns 249, then 250, then 118 points.
- If an attributable reversal exceeds the available balance, the loyalty balance becomes negative and future earnings offset it; commerce checkout remains independent.

The tests require an explicit tier snapshot for each order award so threshold-crossing event order is never guessed.
