# ADR-0044: Immutable provider-rate snapshots and exact currency conversion

- Status: Accepted
- Date: 2026-08-26
- Scope: M11-S03 multi-currency earning and reconciliation evidence

## Context

WooCommerce preserves the currency of each order, while a loyalty programme has one immutable base currency and minor-unit precision. The current V2 worker correctly rejects an order whose currency or precision differs from the published programme. Enabling foreign-currency orders without historical rate evidence would make points, refunds, tiers, campaigns, and analytics depend on a mutable or unverifiable conversion.

[WooCommerce's current order API](https://woocommerce.github.io/code-reference/classes/WC-Order.html#method_get_currency) exposes the persisted order currency independently from the store base currency. [PostgreSQL 18 numeric guidance](https://www.postgresql.org/docs/current/datatype-numeric.html) recommends exact `numeric` values for monetary calculations and documents that `numeric` ties round away from zero. [Stripe's current currency guide](https://docs.stripe.com/currencies) demonstrates why minor-unit precision is contextual rather than safely inferred from a three-letter code. The [ECB reference-rate feed](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) is an example of a timestamped provider snapshot, but the ECB explicitly publishes euro-based reference rates and is not selected here as Starfiniti's production provider.

## Alternatives

1. **Trust a WooCommerce multi-currency extension's base amount or current store rate.** This is easy to integrate but makes an optional store extension the value authority, does not provide one supported provenance model, and can change during delayed delivery or refund processing.
2. **Fetch the latest provider rate when a worker processes each event.** This centralizes conversion but makes retry timing change the award, uses future knowledge for delayed orders, and converts refunds at a different rate from the original award.
3. **Select one immutable provider snapshot valid at the order instant, convert with exact rational arithmetic, and bind every atomic amount to that snapshot and policy revision.** This preserves replay, historical explanation, and refund attribution while keeping the provider adapter replaceable.

## Decision

1. The published programme currency remains the base currency. Existing same-currency V1/V2 behavior is unchanged.
2. Foreign-currency evaluation requires an enabled, immutable conversion-policy revision for the exact programme version and source currency plus one immutable provider snapshot valid at the commerce occurrence instant. No browser, order payload, WooCommerce extension, email/profile attribute, or latest-at-processing lookup supplies rate authority.
3. A provider adapter records decimal rates as a positive exact rational numerator and denominator with provider key/reference, observed time, validity interval, source/base codes, both minor-unit precisions, and a payload digest. Floating-point values are prohibited.
4. The rate means base major units per one source major unit. For each non-negative source minor amount, the exact base-minor fraction is `source × rate numerator × 10^baseDigits / (rate denominator × 10^sourceDigits)`.
5. Version 1 rounds each atomic WooCommerce amount once to the nearest base minor unit, with ties away from zero. Gross, paid, refunded, shipping, tax, and fee amounts are converted independently; discount is re-derived as converted gross minus converted paid so line invariants remain intact.
6. The worker records one immutable conversion batch per canonical commerce event before committing value. Child rows retain the exact amount key, source amount, base amount, unrounded numerator, denominator, and rounding remainder. PostgreSQL independently reselects the occurrence-time policy/snapshot, rejects ambiguity, recomputes every base amount, and binds the canonical atomic-batch hash before accepting the evidence.
7. Evaluation facts use base-currency amounts while retaining source currency, source precision, and the public conversion-evidence selector. Currency conditions match the original order currency. The immutable evaluation input and explanation bind the same evidence.
8. A cumulative or full refund reuses the original award's policy and rate snapshot. It never resolves a later rate. PostgreSQL retains and validates the immutable origin conversion against the same connection, source order, and programme version before accepting the refund batch. Existing cumulative proportional point reversal remains authoritative after the refunded monetary facts are converted with the original snapshot.
9. Rate/policy tables and conversion rows are private, immutable, RLS-enabled, and unavailable to browser roles. Worker functions have exact grants; merchant reads expose only bounded status and public evidence, never credentials or raw provider payloads.
10. A provider-neutral adapter boundary is implemented, but no production provider is enabled until the owner approves one and M11-S06 reconciles the Starfiniti canary. Missing, stale, overlapping, wrong-direction, precision-mismatched, or unapproved rate evidence fails closed without affecting WooCommerce checkout.
11. Mixed-source analytics may consume converted base facts only after the repository reconciliation tests pass and the feature is explicitly enabled for a canary. Monetary loyalty liability remains unavailable until its separate immutable valuation policy exists.

## Consequences

- Delayed delivery, retries, and refunds reproduce the original monetary basis.
- Rate ingestion is provider-specific, but award/refund behavior and stored evidence remain provider-neutral.
- Rounding small line amounts independently can differ from converting one order total. The retained per-amount remainder makes that difference explicit and exactly reconcilable rather than hidden.
- Historical conversion storage grows with the number of monetary components. Bounded arrays, normalized child rows, and period/source indexes keep the evidence queryable.
- The initial deployment remains single-currency until an approved provider creates policy and rate evidence; repository capability does not imply live conversion.

## Operations and rollback

Deploy private tables and worker functions disabled first. Record test-provider snapshots only in isolated verification, prove exact conversion and retry/refund reuse, then enable an approved provider for the Starfiniti tenant. Reconcile each canary order from source amounts through the snapshot, conversion children, evaluation, tier fact, ledger effect, and analytics base amount.

Rollback disables new policy resolution and foreign-currency effects. Same-currency processing, refunds of already awarded value, ledger reads, exports, and checkout remain available. Existing snapshots, policies, conversion rows, evaluations, and ledger effects remain immutable; corrections use forward policy revisions and compensating ledger entries, never history edits.
