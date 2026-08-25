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
9. Commerce performance uses an additive normalized read stream. V2 purchases and refund compensations come from immutable `tier_qualification_facts`; legacy V1 purchases and cumulative refunds are reconstructed from immutable evaluations, their canonical event occurrence time, and historical programme configuration. V2 evaluations are never read again as fallback facts, preventing double counting.
10. Reports distinguish event occurrence from knowledge time. A fact belongs to the period containing its original commerce occurrence, and is visible only when its immutable evidence was recorded before report `asOf`. A later refund therefore compensates the original order period in a newly generated report without rewriting the original purchase or a prior report.
11. Member-grained performance requires a canonical customer link. Guest orders remain first-class linked customers and are included. A legacy event whose customer link is unavailable after privacy processing remains in order and spend totals, is excluded from member denominators, and appears in explicit linkage-coverage counters.
12. Activation uses a mature 30-day cohort and the first immutable `release` transaction, not a pending award or manual credit. Observed LTV is a descriptive, non-predictive average of linked, refund-compensated lifetime eligible spend over linked customers with a positive net eligible-order lifetime.
13. Currency amounts are returned only when every contributing historical programme version has one identical ISO currency and minor-unit precision. Mixed or missing currency scope leaves monetary fields explicitly unavailable while count metrics remain valid; currency conversion waits for M11 evidence.
14. Reward realization uses immutable reservation transitions rather than mutable current state. Interactive performance publishes request and capture flows in the selected period plus a shifted cohort whose requests each received a complete 24-hour observation window. Only a ledger-backed `captured` transition realizes value; requested, reserved, issued, failed, expired, cancelled, released, and ambiguous work do not.
15. VIP movement comes from immutable tier decisions at `effective_at`, visible only when `created_at < asOf`. Current tier memberships remain a customer read projection and cannot reconstruct historical entry, re-entry, grace, downgrade, or manual movement.
16. Referral funnels reconstruct the latest transition at report `asOf` for attributions captured in the selected period. Issuance and compensation remain separate immutable facts; net advocate/friend points subtract only a matching compensation and never expose identity or fraud evidence.
17. Campaign outcomes combine immutable purchase effects and trigger executions. A purchase with multiple awarded effects contributes once to influenced orders and eligible spend. Latest cumulative purchase refund evidence compensates that original occurrence; trigger and purchase point reversals remain explicit. Direct attribution is descriptive, and incremental revenue returns an unavailable state until M10-S03 defines and implements a valid estimator contract.
18. Cohort retention uses fixed elapsed observation windows rather than calendar-month return buckets. Membership activation is a release-backed earning within 30 elapsed days of immutable wallet creation. Earning retention is another distinct release after 30 and no later than 60 elapsed days from the first release. Cohort entry dates are local IANA calendar dates, but each member's outcome window is exact elapsed time. The interactive cohort is shifted back 60 days so every denominator is mature.
19. Calendar-month retention was rejected because month length, partial months, and report timing give members unequal opportunities. A rolling-current-member denominator was also rejected because it silently drops closed or privacy-processed historical members and allows future state to rewrite cohort history.
20. Campaign incrementality uses an intention-to-treat difference-in-means estimator over all immutable treatment and control assignments, including members with zero observed outcome. The outcome is refund-compensated loyalty-eligible spend in the immutable campaign `[starts_at, ends_at)` window. For the treatment population, the exact rational estimate is `(treatment spend × control N - control spend × treatment N) / control N`; the API carries numerator and denominator and labels the rounded minor-unit result a point estimate only.
21. A campaign estimate is unavailable unless the campaign is a purchase behavior, its full window is complete, assignment counts reconcile to the approved version, both arms have at least 30 members, purchase evidence is valid, and all observed outcomes use one exact currency and precision. This minimum is an operational guardrail, not a power calculation or significance threshold. Trigger campaigns, incomplete windows, mixed currency, missing purchase evidence, and assignment drift return explicit reason codes and null monetary values.
22. The estimator reports incremental **eligible spend**, not gross merchandise value, margin, accounting revenue, or statistically significant lift. More advanced regression, covariate adjustment, sequential testing, and power planning require new versioned estimators and cannot reinterpret the V1 result.

## Consequences

- The first slice can provide trustworthy point flow, current exposure, and expiry forecasts without pretending to provide an accounting provision.
- Dashboard definitions become executable product contracts rather than prose detached from code.
- Historical reports may cost more than projection reads; bounded periods and measured composite/partial indexes are required.
- Multi-currency monetary liability waits for M11 conversion evidence plus an explicit valuation policy; this is an honest limitation rather than a guessed total.
- Existing `MerchantOverviewReportV1` remains compatible while M10 introduces additive report contracts and shadow comparison.
- Legacy V1 evaluation reconstruction is more complex than V2 fact reads, but preserves production history without backfilling or mutating immutable rows. The report exposes its V1/V2 and linkage coverage so migration gaps are observable.
- Fixed-window cohorts arrive later than naive rolling rates, but every member receives the same observation opportunity and DST changes cannot alter elapsed qualification.
- Small or operationally incomplete campaigns intentionally show an unavailable causal result. This is safer than reporting unstable lift as fact and gives merchants a concrete evidence gate to resolve.

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

The cohort/experiment slice rolls back independently by stopping the `get_analytics_cohort_retention_v1` read and returning the dashboard module to its explicit unavailable state. Dictionary V4 remains additive; V1–V3 readers and reports are unchanged. No assignment, campaign effect, wallet, release, or refund evidence is removed or rewritten.
