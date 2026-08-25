# ADR-0040: Ledger-sourced versioned analytics and explicit liability valuation

- Status: Accepted
- Date: 2026-08-25
- Scope: M10 analytics, reporting, liability, and reconciliation

## Context

The existing merchant Overview returns useful exact aggregates, but it is not a complete metric system. Its outstanding-points value comes from mutable balance projections, its historical range is fixed to UTC, and the UI calls the value “liability” even though no immutable programme-wide monetary valuation policy exists. Rosy Rewards' approved acceptance example says 100 points equal EUR 1, but that merchant-specific policy cannot become a global accounting assumption.

M10 must serve operational, product, and financial decisions without reinterpreting immutable value, mixing currencies or time boundaries, leaking private facts, or claiming incrementality from correlation. PostgreSQL already contains immutable ledger, lot, commerce, reward, tier, referral, campaign, and control-assignment evidence. No measured volume currently justifies a separate analytical store.

## Alternatives

1. **Use wallet and campaign projections as analytical truth.** This is fast for current state, but projections cannot independently prove historical flows and could conceal drift from immutable entries.
2. **Build a warehouse or mutable aggregate tables immediately.** This may improve high-volume reads, but it creates another reconciliation, tenancy, recovery, and freshness boundary before measured load requires one.
3. **Query immutable facts on demand and cross-check current projections.** This keeps one authoritative source, preserves exact history, and makes drift visible. Purpose-built indexes and bounded periods control initial cost.

For monetary liability, inferring one global points-to-currency ratio or deriving a ratio from available rewards was rejected. Programmes can have heterogeneous reward economics, non-cash perks, percentage discounts, or changed future policies. Monetary reporting requires an explicit immutable valuation policy with currency, precision, point numerator/denominator, effective programme version or period, and disclosed breakage method.

## Decision

1. Publish a versioned metric dictionary. Every metric has a stable key, label, decision use, source fields, formula, grain, time boundary, currency policy, exclusions, owner, caveats, and causal classification.
2. Source historical point flows from immutable `ledger_transactions` and `ledger_entries`. Use point lots and allocations for expiry exposure. Current wallet/lot projections are reconciliation targets, never historical authority.
3. M10 report V1 uses one PostgreSQL statement snapshot, exact decimal text across the API, and an explicit UTC half-open period `[from, to)`. Later timezone support must create a new compatible report/dictionary version or carry exact IANA and boundary evidence.
4. Keep point buckets distinct: pending, available, reserved, spent, expired, and reversed. Preserve signed available balances and report manual adjustment separately from award issuance and refund reversal.
5. Label outstanding pending plus available plus reserved points as **outstanding point exposure**, not currency or cash. Monetary liability/provision is unavailable until an immutable valuation policy exists. The UI must explain the distinction.
6. Distinguish influenced revenue from experimentally estimated incremental revenue. Incremental output is unavailable unless immutable treatment/control assignment, population, estimator, window, exclusions, and sample evidence are present.
7. Keep PostgreSQL as the source until measured query plans, latency, concurrency, or retention volume cross a documented capacity threshold. A future analytical store consumes immutable source facts and must reconcile before replacing any read.
8. Public Data API access remains through narrow Auth-derived or public-selector read wrappers with live membership rechecks, empty search paths, exact grants, bounded output, and no raw identities, orders, entries, reasons, or internal keys.

## Consequences

- The first slice can provide trustworthy point flow, current exposure, and expiry forecasts without pretending to provide an accounting provision.
- Dashboard definitions become executable product contracts rather than prose detached from code.
- Historical reports may cost more than projection reads; bounded periods and measured composite/partial indexes are required.
- Multi-currency monetary liability waits for M11 conversion evidence plus an explicit valuation policy; this is an honest limitation rather than a guessed total.
- Existing `MerchantOverviewReportV1` remains compatible while M10 introduces additive report contracts and shadow comparison.

## Security and integrity effects

- Authenticated report functions re-derive live membership and internal organization/workspace/programme scope. Public selectors never become authority.
- Browser roles receive no raw ledger, lot, customer, commerce, referral-risk, campaign-assignment, contact, coupon, or private analytics table grants.
- Security-definer wrappers use an empty search path, explicit owner, exact signature grants, bounded filters, minimized output, and adversarial cross-tenant/revocation tests.
- Immutable entry totals and lot allocations are the historical source. Projection differences are explicit deterministic failures; dashboards never hide or auto-repair drift.
- Exact decimal text prevents JavaScript safe-integer loss. Monetary values use integer minor units or PostgreSQL `numeric`; floating-point arithmetic is prohibited.

## Operations

- Record `EXPLAIN (ANALYZE, BUFFERS)` evidence on representative seeded volumes before broad rollout and add only indexes matching measured equality/range predicates.
- Bound interactive periods and series sizes. Exports and scheduled reports use separate bounded jobs rather than holding dashboard requests open.
- Observe report latency, statement timeouts, database load, reconciliation differences, export failures, and stale or unavailable states independently of loyalty value processing.
- Do not add a warehouse, cache, or partitioning scheme until measured volume and query plans justify its recovery and reconciliation cost.

## Migration and rollback

Deploy additive functions and indexes first, keep analytics navigation disabled until shadow reconciliation passes, and canary only the Starfiniti tenant. Rollback stops consuming the new report and returns to Overview V1. Additive definitions and immutable evidence remain; no rollback rewrites ledger, lots, projections, programme versions, or historical reports.
