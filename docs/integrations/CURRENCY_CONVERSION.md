# Currency conversion integration

Status: repository implementation; production conversion remains disabled until an exchange-rate provider is approved and the M11-S06 Starfiniti canary reconciles.

## Authority boundary

The published `ProgrammeDefinitionV2` currency is the loyalty programme base. A WooCommerce order remains denominated in its persisted source currency and precision. Neither WooCommerce, a browser, a multi-currency plugin, an Auth claim, nor a worker processing timestamp may supply or override an exchange rate.

Foreign-currency value processing requires all of the following:

1. one current immutable policy revision for the exact published programme version and source currency;
2. one immutable provider snapshot whose half-open validity interval contains the canonical commerce occurrence time;
3. a snapshot observation no newer than the commerce occurrence time and no older than the policy limit;
4. exact agreement on provider, source/base currency, and both minor-unit precisions; and
5. one independently verified conversion batch bound to the canonical event before any award commits.

Missing, disabled, stale, overlapping, wrong-direction, or precision-mismatched evidence returns no context or fails closed. WooCommerce checkout never calls this path and remains operational.

## Provider adapter contract

An approved server-side adapter runs with the isolated worker database role. It must:

- fetch rate material over a verified server-side transport and keep credentials outside the database, browser, logs, and WordPress;
- assign a stable provider key and provider rate reference;
- canonicalize the provider decimal into positive integer `rateNumerator / rateDenominator` without floating-point arithmetic;
- declare that ratio as base major units per one source major unit;
- retain provider observation time and a non-empty validity interval of at most seven days;
- hash the canonical source payload with SHA-256 and store only the digest in conversion evidence; and
- call `loyalty_private.record_currency_rate_snapshot_v1` idempotently.

Production Price IDs, billing state, or external entitlement services are unrelated to this boundary. Self-hosted installations may supply their own reviewed adapter and provider key without contacting Starfiniti.

Provider ingestion is not implemented for an unapproved source. The Operations form stores the provider identifier and immutable policy revision only; it neither tests credentials nor fabricates a rate.

## Exact arithmetic

For a non-negative source amount in minor units:

```text
exact numerator   = source × rateNumerator × 10^baseDigits
exact denominator = rateDenominator × 10^sourceDigits
base minor amount = nearest integer(exact numerator / exact denominator)
rounding mode     = half away from zero
rounding delta    = base amount × denominator − numerator
```

Gross, paid, refunded, shipping, tax, and fee amounts are converted independently. A line discount is re-derived as converted gross minus converted paid. Every amount row retains the source/base amount, exact fraction, and rounding delta, and PostgreSQL recomputes the result before accepting it.

JavaScript `number` and PostgreSQL floating-point types are not part of the conversion contract. Contracts serialize monetary and rational integers as canonical decimal strings; the domain engine uses `bigint`; PostgreSQL uses bounded exact `numeric` for intermediate products and `bigint` for accepted minor-unit amounts.

## Award, retry, and refund behavior

- Same-currency V1 and V2 facts follow their existing path and must not attach conversion evidence.
- A foreign V2 fact is evaluated in the immutable programme base while retaining source currency, source precision, and a public evidence selector.
- Source-currency earning-rule conditions match the original order currency, not the converted base code.
- One canonical event can own only one conversion batch. An exact concurrent retry returns the same evidence identity; a changed atomic batch or projection fails with an idempotency conflict.
- Recording independently reselects the effective policy and counts valid occurrence-time snapshots. A worker cannot bypass stale, future, disabled, superseded, or ambiguous evidence by passing a public selector directly.
- The award commit independently requires evidence matching the exact organization, programme group/version, canonical event, source/base currency, and precision.
- A partial or full refund extracts the original award evidence selector and reuses that policy and snapshot even after normal rate expiry. PostgreSQL requires that origin to belong to the same connection, source order, and programme version. It never resolves a new rate.
- Conversion records are value-neutral. Ledger value remains governed by the existing immutable award/refund transaction boundaries.

## Merchant policy operations

Owners and admins can review current source policies in Operations and append a revision with:

- published programme-version public ID;
- source currency and minor-unit precision;
- approved provider key;
- maximum rate age from 60 seconds through seven days;
- enabled or disabled state; and
- the expected current revision plus idempotency/correlation evidence.

PostgreSQL derives organization, actor, role, programme group, base currency, and entitlement authority. Other live organization roles receive the minimized read only. Raw tables have RLS and no browser or runtime table privileges.

Disabling a policy blocks new foreign conversions. It never hides balances, blocks same-currency processing, changes historical evaluations, rewrites refunds, contacts WooCommerce, or removes evidence.

## Verification and reconciliation

Repository verification includes:

- domain properties for 0, 3, and 6 decimal precisions, exact ties, large integers, monotonicity, and overflow;
- worker tests for field-by-field conversion and missing-evidence failure;
- pgTAP checks for RLS, grants, tenant/role/revocation boundaries, policy and snapshot selection, stale/ambiguous evidence, independent arithmetic, exact retry, changed retry, refund reuse, immutability, and zero ledger effects; and
- a two-session probe proving one created and one duplicate conversion identity under a concurrent exact retry.

For each production canary order, reconcile:

```text
canonical source order
  → selected policy revision
  → selected occurrence-time snapshot
  → atomic source/base amount rows
  → immutable programme evaluation and explanation
  → tier/campaign facts
  → ledger transaction and balance projection
  → base-currency commerce analytics
```

Mixed-source analytics may use the programme base only when every accepted foreign evaluation has matching conversion evidence. A programme/version set with inconsistent base currencies remains explicitly unavailable. Point liability is not accounting-currency liability and remains unavailable until its separate valuation policy is implemented.

## Rollback

Stop provider ingestion and append disabled policy revisions. Preserve all snapshots, policies, conversion amounts, evaluations, audit rows, and ledger effects. Continue same-currency work and historical foreign refunds that reuse retained evidence. Correct provider or configuration mistakes with a forward policy/snapshot revision and, if value changed, the normal compensating ledger workflow.

Architecture rationale and rejected alternatives are recorded in [ADR-0044](../architecture/ADR/0044-immutable-provider-rate-snapshots-and-exact-currency-conversion.md).
