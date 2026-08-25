# M10 Evidence — Analytics

Status: in progress. M10-S01 is complete and M10-S02 commerce and programme performance is active while M09 waits only on its reviewed production canary gate.

## Reconstructed baseline

- `MerchantOverviewReportV1` exposes member count, eligible spend, repeat-member rate, captured-to-awarded redemption rate, outstanding points, and a UTC daily member series. It preserves exact integers as text and passed the existing tenant/grant/large-integer database gate.
- The current Overview labels outstanding points as “liability” but has no immutable monetary valuation policy. M10 will retain the exact point exposure and will not present currency liability or an accounting provision by inferring Rosy Rewards' 100-points-per-euro acceptance configuration globally.
- `loyalty_private.programme_liability_report` is worker-only and reads wallet balance projections. It is useful as an operational cross-check, not as historical flow authority.
- Immutable ledger transactions and entries contain award, release, reserve, capture, cancel, expire, refund-reversal, and manual-adjustment facts. Point lots and allocations retain earned-date expiry and unresolved reservation exposure.
- PostgreSQL remains the analytical source for M10. There is no measured capacity evidence that justifies a warehouse, cache, or mutable aggregate truth table.

## S01 decisions and evidence targets

- ADR-0040 selects an immutable-ledger-sourced, versioned on-demand report with projection cross-checks, UTC half-open V1 periods, exact decimal strings, and explicit causal labels.
- The first dictionary publishes only implemented metrics. Candidate business metrics are recorded in `docs/api/ANALYTICS.md` and enter a later dictionary version only with executable source/formula/reconciliation evidence.
- Exact point exposure and flows are operational loyalty obligations. Monetary liability remains unavailable until an explicit immutable valuation policy exists; a reward catalogue or merchant-specific acceptance ratio is not substituted.
- S01 completion requires contracts, additive PostgreSQL, pgTAP, server parsing, merchant-visible definitions, independent reconciliation, exact-head CI, and documented limitations.

## M10-S01 completion evidence

- Contracts publish 25 complete Dictionary V1 definitions and a strict `AnalyticsValueTruthReportV1`. Arithmetic checks reject mismatched periods, active buckets, manual net movement, and expiry horizons before browser rendering.
- `loyalty.get_analytics_value_truth_v1` accepts only public organization, workspace, and programme selectors; PostgreSQL derives membership and internal scope, applies the server-side `analytics` entitlement, and returns exact decimal text.
- The report reconstructs historical balances and flows from immutable ledger entries, reconstructs point-lot exposure at the requested instant, and raises deterministic `55000` errors when current wallet or lot projections disagree with immutable evidence.
- Merchant `/analytics` exposes real ready, setup-required, disabled, and fail-closed states; uses `BigInt` formatting; provides responsive light/dark layouts; and places the formula-backed definition beside every displayed value. The route remains absent from navigation until the M10-S05 command-center rollout.
- Existing Overview copy now says “Outstanding points” instead of implying an accounting-currency liability.
- Exact-head Linux CI [run 32880474317](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32880474317) passed at commit `3e644ab`: root `npm run check`, migration validation, secret/audit/license/package gates, clean database replay, all 2,473 pgTAP assertions including the 33 new analytics cases, both production images, and minimum/current WooCommerce with HPOS/legacy storage.
- Intentional limitation: monetary liability remains `unavailable:valuation_policy_not_configured`; no Rosy ratio, reward face value, or current mutable configuration is converted into money.
