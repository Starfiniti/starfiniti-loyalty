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

## Dictionary V2 commerce boundary

Dictionary V2 is additive: it carries all V1 definitions and adds member activation, participation, eligible-order, eligible-spend, repeat-purchase, AOV, observed-LTV, guest, and linkage-coverage definitions.

- The report period is the exact UTC half-open interval `[from, to)`, ending at `asOf`.
- V2 purchase/refund facts use `effective_at` for original-order attribution and `recorded_at < asOf` for knowledge-time reproducibility.
- Legacy V1 purchases use canonical `occurred_at`; cumulative refund evaluations are converted into append-only deltas and attributed to that original instant. Versions marked V2 are excluded from this fallback.
- Guest customers are normal channel-linked members. Missing legacy customer links do not erase commerce totals; the report counts affected purchase facts, excludes them from member-grained metrics, and reports their refund-compensated spend separately.
- Activation cohorts are shifted back 30 days so every included new wallet had a full observation window. Activation requires its first released earning by the cohort deadline; manual credits do not qualify.
- Participation is a linked wallet with a positive net purchase, referral, or verified-action count in the period, or a captured reward in the period.
- AOV is net refund-compensated eligible spend divided by net eligible orders. Observed LTV is linked lifetime eligible spend divided by linked lifetime purchasers. Both are descriptive minor-unit values with integer truncation toward zero and return zero for an empty denominator.
- Monetary fields are available only for one exact historical currency code and precision. Mixed currency or missing configuration returns an explicit unavailable currency scope and `null` monetary fields; counts remain available.

Observed LTV is not gross merchandise value, predictive lifetime value, margin, or incrementality. Eligible spend follows the versioned loyalty exclusions that produced the immutable evaluation.

## Dictionary V3 programme-outcome boundary

Dictionary V3 is additive: it carries every V1/V2 definition and adds reward realization, VIP movement, referral-funnel/value, and campaign-outcome definitions. The programme-outcome report is independently fetched and validated, so an unavailable outcome source cannot hide point truth or commerce performance.

- Reward requests use immutable reservation creation. Capture counts and captured points use the ledger-backed `captured` transition; unresolved work is reconstructed from the latest transition known at `asOf`.
- The 24-hour reward-realization rate uses a shifted cohort `[periodFrom - 24 hours, periodTo - 24 hours)`. Every included request therefore has the same complete observation window. Issued but ambiguous connector work remains unresolved rather than being counted as realized.
- VIP movement uses immutable tier decisions, the decision's `effective_at` for occurrence, and `created_at < asOf` for knowledge time. Current tier membership is not used to rewrite historical movement.
- Referral flow uses first-attribution `captured_at` and the latest immutable transition known at `asOf`. Pending includes captured, cooling, and review states. Issuance and compensation values remain linked to the original period attribution and are reported gross, reversed, and net.
- Campaign treatment/control/capacity/suppression results combine immutable purchase effects and trigger executions. A purchase execution batch contributes at most one influenced order and its eligible spend is reduced by the latest cumulative refund evidence known at `asOf`.
- Campaign points are gross issuance less immutable purchase and trigger reversals. Reward reservations and current latest-attempt manual-review jobs are exposed as operational counts.
- Influenced spend is descriptive direct attribution. Incremental revenue is explicitly `unavailable` until a versioned treatment/control estimator declares population, observation window, exclusions, and sample evidence.
- Campaign monetary fields require one exact currency code and minor-unit precision across contributing historical programme versions. Mixed or invalid evidence returns an unavailable scope and `null` spend while count and point metrics remain usable.

All point/count quantities remain decimal strings across the Data API and are checked with `BigInt`. The report contains no customer, wallet, order, referral, assignment, coupon, or connector identifiers.

## Dictionary V4 cohort and experiment boundary

Dictionary V4 adds mature membership activation, earning retention, and evidence-gated campaign experiment definitions without changing V1–V3 readers.

`loyalty.get_analytics_cohort_retention_v1` accepts public organization, workspace, and programme-group selectors, a 7/30/90-day range, and an IANA timezone. PostgreSQL re-derives live membership and entitlement scope. The dashboard currently requests UTC; the contract retains exact timezone evidence so a future organization setting can change presentation without changing authority or historical facts.

The report has two periods:

- `reportPeriod` is the exact UTC `[asOf - rangeDays, asOf)` campaign-selection period.
- `cohortPeriod` is a requested-IANA-local calendar range shifted back 60 days. Its UTC instants can span 23- or 25-hour DST days while its row count remains exactly `rangeDays`.

Membership activation includes wallets created in the mature cohort. A member activates only when a point lot backed by an immutable `release` transaction becomes available between wallet creation and 30 elapsed days later. Pending awards and manual credits do not qualify.

Earning retention groups members by their first release-backed earning. A member is retained when another distinct release becomes available after 30 and no later than 60 elapsed days. The rate is descriptive behavior, not causal lift.

Campaign V1 experiments use:

- population: every immutable treatment/control assignment, including zero outcomes;
- outcome: refund-compensated loyalty-eligible spend in the exact immutable campaign window;
- estimator: intention-to-treat difference in means, scaled to the treatment population;
- exact arithmetic: numerator `treatment spend × control N - control spend × treatment N`, denominator `control N`;
- disclosure: treatment/control counts, currency and precision, both spend totals, exact rational components, rounded minor-unit point estimate, and `pointEstimateOnly: true`.

An estimate is `available` only for a completed purchase campaign with reconciled assignments, at least 30 members per arm, valid purchase/refund evidence, and one exact currency/precision. Otherwise it is `unavailable` with one reason:

- `incomplete_window`
- `unsupported_outcome`
- `assignment_reconciliation_failed`
- `insufficient_sample`
- `currency_unavailable`
- `purchase_evidence_unavailable`

Unavailable campaigns return `null` for every monetary and rational field. Eligible spend is not gross revenue, accounting revenue, margin, or statistical significance. The output contains public campaign selectors but no customer, wallet, order, effect, or assignment identity.

## Liability terminology

- **Outstanding point exposure:** current pending plus available plus reserved points. It is an operational promotional-unit obligation and may be signed if a programme permits attributable negative available balance.
- **Expiry exposure:** remaining and unresolved-reserved points grouped into overdue, next-30-day, and day-31-through-90 windows from immutable lots and allocations.
- **Monetary liability/provision:** unavailable until an immutable valuation policy defines currency, precision, point ratio, effective scope, and breakage method. Reward face values and the Rosy Rewards acceptance ratio are not global substitutes.
- **Breakage:** must use a declared matured issuance cohort and outcome window. A simple expired divided by issued lifetime ratio is not published as breakage.

## Controlled exports and scheduled reports

M10-S04 adds `starfiniti.analytics-report-export.v1`, a bounded aggregate JSON document. It contains Dictionary V4 plus the exact value-truth, commerce-performance, programme-outcome, and cohort-retention reports generated for one public organization/workspace/programme-group scope. The request range is restricted to 7, 30, or 90 days. Requested-as-of, generated-at, expiry, IANA timezone, source SHA-256, and final response SHA-256 remain explicit evidence.

Authenticated owner, admin, analyst, and auditor roles may request a manual export. Only owners and admins may create, pause, or resume daily, weekly, or monthly schedules. PostgreSQL derives the live actor, tenant, active scope, entitlement, and internal IDs; the browser supplies only public selectors and command identity. Scheduled generation creates a report in the merchant history—it does not send an email attachment or grant a provider access path.

Report source payloads are stored in private PostgreSQL tables for at most 24 hours. They contain the four aggregate report projections and no customer, wallet, order, assignment, payment, device, network, fraud, contact, coupon, or connector identity. Neither authenticated browser sessions nor the reporting worker has table access to the payload.

A ready export requires a trusted dashboard-runtime call to mint a random five-minute capability bound to the current verified Auth subject and Supabase session. Only its SHA-256 digest is persisted. The capability travels in an `HttpOnly`, `SameSite=Strict`, exact-path cookie, never in the URL or browser state. Consumption locks and marks it used atomically, rechecks membership and scope, validates the complete strict contract, records final response digest/byte evidence, destroys the private payload, and returns a private/no-store JSON attachment with the same digest in `X-Starfiniti-Content-SHA256`. Replay, another session, expiry, revocation, or contract failure returns no content.

The reporting worker is a separate process mode. It materializes due local-calendar instants with a unique schedule/instant fence, claims bounded jobs with `FOR UPDATE SKIP LOCKED`, reclaims expired leases, retries only deterministic safe classes up to five attempts, and records allowlisted failure codes without payloads. It has no loyalty-value mutation role; stopping it leaves ledger, refunds, reconciliation, notifications, connectors, and WooCommerce checkout operational.

## Causal terminology

- `operational`: exact state or flow with no behavior claim.
- `descriptive`: observed association such as repeat rate or influenced revenue.
- `experimental`: estimate derived from immutable treatment/control assignment using a declared estimator, population, period, exclusions, and sample counts.
- `unavailable`: source or design evidence is insufficient. The API returns an explicit unavailable state rather than zero.

## Compatibility and privacy

`MerchantOverviewReportV1` remains available during shadow rollout. New reports are additive and versioned. Authenticated callers may supply only public organization/workspace/programme selectors and bounded filters; PostgreSQL derives membership and internal scope. Report outputs exclude customer/order identities, raw commerce payloads, ledger entries, actors, reasons, idempotency evidence, referral fingerprints, contact data, and coupon material.
