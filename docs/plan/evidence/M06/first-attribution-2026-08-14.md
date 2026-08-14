# M06-S01 first-attribution evidence — 2026-08-14

## Hypothesis and target

An opaque, first-eligible referral attribution can preserve checkout independence and useful fraud controls without accepting browser authority or exporting raw identity/network/payment/address data from WooCommerce.

The slice target is one immutable attribution for replay or competing advocate codes, deterministic self-referral blocking, reversible handling of ambiguous evidence, bounded fingerprint retention, tenant isolation, and zero ledger value before qualification.

## Implemented slice

- `ReferralPolicyV1` versions attribution window, qualifying status, cooling, minimum spend, monthly cap, points-only give-get rewards, and bounded risk settings inside compatible `ProgrammeDefinitionV2`.
- An Auth-derived command creates one random advocate UUID per customer/programme group and returns only a canonical HTTPS WooCommerce URL with `stf_ref`.
- The connector captures locally, uses the existing signing key for purpose-separated HMAC fingerprints, ignores forwarded IP headers, and adds only the opaque code, instant, and digests to signed order facts.
- PostgreSQL independently validates publication, derives every tenant/customer/connection/programme selector, serializes the friend decision, preserves first attribution, blocks self-referral, and appends captured/pending-review/blocked transitions.
- Private fingerprint evidence expires after 1–720 hours and has a bounded worker purge. Public history retains only allowlisted reason codes.
- Processing-order attribution and its canonical business-effect fence commit atomically. Non-referral/V1 processing orders remain value-ineligible.

## Adversarial coverage

The 55 focused pgTAP assertions cover RLS, exact grants, entitlement separation, malformed policy rollback, Auth-derived link scope, exact retry, cross-account denial, opaque URL minimization, first-wins behavior, exact replay, competing advocate, reused-evidence review, self-referral, outside-window evidence, immutability, purge, rollout disablement, history preservation, and zero ledger effects.

Contract/domain/worker tests cover invalid shapes, 1/90-day boundaries, monthly caps, device/network velocity, reused payment/shipping evidence, manual-review disabled behavior, processing/completed status parsing, and atomic worker fencing. Woo runtime smoke seeds opaque order metadata and asserts the emitted signed fact contains fingerprints but no raw email, network address, or name.

## Verification

- `npm test` — 305 tests passed: dashboard 110, worker 17, contracts 129, domain 49.
- `npm run typecheck` — every workspace passed.
- `npm run lint` — passed with zero warnings.
- `npm run db:validate` — 37 migrations and 33 pgTAP files passed static validation.
- `npm run woocommerce:validate` — source, 43-message English POT, zero-JS/CSS storefront, zero render-time hub request, and PHP budget passed.
- PHP syntax validation — all connector and runtime-smoke files passed.
- `npm run architecture:validate` — passed locally after ADR-0016 was added.
- Draft PR #31 exact CI run `31762510623` is pending; no clean-replay or runtime-matrix claim is made before it completes.

## Open limitations

This slice records attribution only. It intentionally does not qualify an order, issue either reward, reverse value, expose merchant review operations, or render customer/merchant referral experiences. Those boundaries are M06-S02 through S05. Production remains disabled until all slices, recovery evidence, reconciliation, and score pass.
