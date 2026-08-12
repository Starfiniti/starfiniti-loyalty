# Test Strategy

Use unit and property tests for domain invariants, database integration tests for transactions/RLS/migrations, contract tests for signed commerce envelopes, plugin tests across supported PHP/WP/WC, browser tests for merchant/customer flows, and failure/load tests for retries, concurrency, and recovery. Mocks cannot be the only evidence for authoritative behavior.

Database migrations, seed replay, schema grants, RLS coverage, and privileged-function placement are exercised with `npm run db:verify`; see `DATABASE_TESTS.md`. Static validation alone cannot close a database task.

`npm run accessibility:validate` statically enforces the shared first-focus skip link, one focusable main target on all 13 route surfaces, text-area focus visibility, and reduced-motion coverage. It complements, rather than replaces, keyboard and responsive browser inspection of primary workflows. The authenticated redemption route is also checked at a 390-pixel viewport for safe login continuation, private/no-store and no-referrer handling, and a bounded confirmation layout.

Support-diagnostic tests serialize adversarial inputs and assert forbidden customer, payload, store-name, item-identity, and signing values are absent. Noncanonical error/operation strings are redacted rather than trusted as safe codes.

`woocommerce:validate` also enforces literal text-domain use, exact POT source coverage, no stale catalog entries, required customer translations, and placeholder parity. The container matrix switches to the bundled Slovenian locale and proves a translated customer My Account label on all four supported runtime combinations.

Experience-theme tests require contract/database agreement on contrast, token allowlists, copy bounds, linked tenant scope, RLS, role revocation, idempotent revisions, and immutable audit evidence. The dashboard preview must remain keyboard reachable and responsive without loading remote fonts or executing merchant CSS.

Customer activity-filter tests require a closed query-value allowlist, total transaction-kind categorization, stable newest-first ordering, and no mutation or expansion of the bounded database result.

The Phase 5 gate adds immutable-ledger pgTAP coverage plus a real two-session overspend race and a deterministic mixed-operation property sequence. Any future value command must join these gates and prove zero sum, attribution, idempotency, tenant isolation, deterministic locks, and wallet/lot projection equality.

The controlled customer redemption gate adds 45 pgTAP assertions for exact grants, Auth-derived active-link authority, tenant isolation, native-reward configuration bounds, atomic reservation/ledger/transition/private-outbox effects, exact retry/conflict behavior, insufficient-balance and lifecycle rollback, coupon minimization, actor attribution, and revocation. The complete database suite remains the authority for those transactional claims; the browser check covers only navigation and presentation boundaries.

The WooCommerce customer-erasure gate adds 47 pgTAP assertions for private grants/RLS/search path, keyed fingerprint material, event/lease/tenant binding, known and pre-import subjects, repeat application, immutable tombstones, hosted-link revocation, customer/channel pseudonymization, raw/canonical scrubbing, import suppression, and zero wallet/ledger effects. Every minimum/current HPOS/legacy runtime also proves the connector registers the deletion hook and writes one opaque deduplicated PII-minimized outbox event.
