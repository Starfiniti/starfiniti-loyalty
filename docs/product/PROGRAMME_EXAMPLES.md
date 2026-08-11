# Programme Examples

## Rosy Rewards acceptance case

Configuration target (not hardcoded domain behavior):

- Currency: points; display conversion 100 points = EUR 1
- Expiry: 12 months, exact policy awaiting Phase 1 decision
- Spend tiers: EUR 150, EUR 500, EUR 1,000
- Earn rates: 5, 6, 7 points per EUR 1 according to tier
- Channel: WooCommerce

Source conflict: the approved prototype implements live tiers at EUR 0/150/500 with rates 5/6/7 and labels EUR 1,000 at 8 points as an unpublished future concept. The master plan lists EUR 150/500/1,000 with only rates 5/6/7. ADR-0004 recommends the prototype's three live tiers and requires owner approval before executable fixtures are added.

Executable examples will be added in `P1-DOMAIN-DECISIONS` after refund, award-timing, rounding, and negative-balance policies are approved.
