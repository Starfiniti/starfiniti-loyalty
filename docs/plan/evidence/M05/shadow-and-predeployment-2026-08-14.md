# M05-S06 shadow and predeployment evidence

Date: 2026-08-14
Status: shadow implementation, browser verification, and exact-head database/runtime CI complete; production deployment remains open

## Weakness found by the self-improving loop

The first advanced-policy migration preserved the visible Rose/Bloom/Icon rates of 5/6/7 points per euro but assigned every migrated tier a 1.0× executable benefit. Because the V2 worker multiplies one programme base rate by the tier benefit, publishing that draft could have shown Bloom/Icon at 6/7 while awarding the Rose rate of 5.

No production value moved: advanced VIP remains undeployed and unpublished. The discrepancy was found while constructing the required V1/V2 shadow comparison, before the Starfiniti canary.

## Forward fix

- `migrateLegacySpendTiersToPolicyV2` now derives exact 10,000/12,000/14,000 basis-point benefits from the retained 5/6/7 rates and fails closed when a legacy rate set is incomplete, inexact, below 1×, or above 10×.
- `ProgrammeDefinitionV2` requires every displayed tier rate to equal `base rate × tier multiplier` exactly.
- Additive migration `20260814060000_tier_rate_parity.sql` independently enforces the same equality with PostgreSQL `numeric` arithmetic before draft storage and again at the immutable publication transition.
- The VIP editor exposes the effective integer points rate, derives the executable multiplier atomically, keeps the base rate owned by Earning rules, and gives a new tier the preceding exact rate rather than an unrelated 1× default.

## Shadow and adversarial evidence

- A deterministic domain shadow compares V1 and V2 awards for Rose, Bloom, and Icon across twelve order values each: zero, fractional-euro floor boundaries, one-euro boundaries, both tier thresholds, and a large non-round amount. All 36 comparisons are exact.
- Contract tests accept the 5/6/7 to 1.0×/1.2×/1.4× mapping and reject a displayed/executable mismatch.
- pgTAP rejects direct authenticated draft creation with a mismatched multiplier, proves the parity helper is private, and reconciles materialized Rose/Bloom/Icon rates to the base-rate product.
- Local lint, all 289 unit tests, all workspace typechecks, a clean production dashboard build, 36-migration/32-pgTAP static validation, and diff checks pass.
- Exact-head GitHub run `31760806620` passed all seven jobs: baseline, a clean 36-migration replay, all 32 pgTAP files with 1,494 assertions, both concurrency probes, both production images, and all four minimum/current HPOS/legacy WooCommerce runtime cells.

## Production-build browser verification

A temporary route rendered the actual production `MerchantShell` and `VipTiersEditor`, then was removed. Desktop 1440×1000 and mobile 390×844 checks proved:

- initial effective rates render as 5/6/7 with 1.2× and 1.4× evidence;
- changing Bloom to 8 updates the serialized immutable draft and executable benefit to 1.6×/16,000 basis points together;
- mobile navigation opens and closes, both widths have no horizontal overflow, and the component emits no warning, error, or page error;
- authenticated sibling-route prefetches were deliberately aborted in the isolated no-Supabase fixture and were not counted as component diagnostics.

Screenshots were visually inspected from:

- `C:\Users\dejan\AppData\Local\Temp\starfiniti-m05-rate-parity-desktop.png`
- `C:\Users\dejan\AppData\Local\Temp\starfiniti-m05-rate-parity-mobile.png`

## Remaining production gate

Do not enable `vip.advanced` yet. Production requires the normal reviewed merge/release boundary, additive migrations deployed with `vip.advanced` disabled, a fresh recovery point, Starfiniti-only entitlement canary, zero-drift tier/award reconciliation, and module score at least 90.
