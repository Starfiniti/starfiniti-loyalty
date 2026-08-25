# Analytics contracts and metric dictionary

## Decision context

M10 helps merchants decide whether loyalty value is controlled, customers realize value, and programme actions improve repeat behavior. The reporting system must also support exact finance and operations reconciliation. It does not make cash, stored-value, accounting-policy, or causal claims that the source evidence cannot prove.

## Metric selection framework

The wider candidate set includes activation, participation, time to first earn, eligible orders, repeat purchase, AOV, LTV, issued/released/reserved/spent/expired/reversed points, reward availability and capture, tier movement, referral conversion, campaign influence, retention, breakage, expiry forecast, and experimental incremental revenue.

The recommended product outcomes for later M10 slices are:

1. **Activated-member rate:** new members with a first released earning within the declared activation window divided by all new members in the cohort. It measures realized programme activation; delayed release requires a mature-cohort guardrail.
2. **Repeat-purchaser rate:** members with at least two eligible orders divided by members with at least one eligible order in the exact period. It is actionable but descriptive, not causal.
3. **Reward realization rate:** captured reward points divided by points released into availability for mature cohorts. It measures customer value realization while expiry and insufficient reward supply remain guardrails.

Primary drivers are time to first earning, affordable-reward coverage, expiry exposure, referral qualification, and campaign treatment participation. Guardrails are exact outstanding point exposure, unexplained reconciliation difference, checkout independence, refund/reversal completeness, suppression/privacy failures, and provider/queue health.

Firm improvement targets are deferred until a non-zero approved store establishes a baseline. The release gates are deterministic now: zero unexplained financial difference, no cross-tenant result, no browser number coercion, no incremental claim without control evidence, and every report definition visible.

## Dictionary V1 boundary

Dictionary V1 publishes only implemented point-value metrics from M10-S01. Each definition includes:

- stable key and version;
- user-facing label and decision use;
- authoritative table/field sources;
- exact formula and output unit;
- programme/workspace/period grain;
- UTC half-open `[from, to)` boundary;
- currency policy (`not_applicable` for point units);
- inclusions, exclusions, caveats, owner, and causal class;
- reconciliation formula and compatible report version.

Historical flows come from immutable ledger transactions and entries. Current balances and lot balances are only cross-checks. Counts and point quantities cross the Data API as decimal strings and are formatted with `BigInt`.

## Liability terminology

- **Outstanding point exposure:** current pending plus available plus reserved points. It is an operational promotional-unit obligation and may be signed if a programme permits attributable negative available balance.
- **Expiry exposure:** remaining and unresolved-reserved points grouped into overdue, next-30-day, and day-31-through-90 windows from immutable lots and allocations.
- **Monetary liability/provision:** unavailable until an immutable valuation policy defines currency, precision, point ratio, effective scope, and breakage method. Reward face values and the Rosy Rewards acceptance ratio are not global substitutes.
- **Breakage:** must use a declared matured issuance cohort and outcome window. A simple expired divided by issued lifetime ratio is not published as breakage.

## Causal terminology

- `operational`: exact state or flow with no behavior claim.
- `descriptive`: observed association such as repeat rate or influenced revenue.
- `experimental`: estimate derived from immutable treatment/control assignment using a declared estimator, population, period, exclusions, and sample counts.
- `unavailable`: source or design evidence is insufficient. The API returns an explicit unavailable state rather than zero.

## Compatibility and privacy

`MerchantOverviewReportV1` remains available during shadow rollout. New reports are additive and versioned. Authenticated callers may supply only public organization/workspace/programme selectors and bounded filters; PostgreSQL derives membership and internal scope. Report outputs exclude customer/order identities, raw commerce payloads, ledger entries, actors, reasons, idempotency evidence, referral fingerprints, contact data, and coupon material.
