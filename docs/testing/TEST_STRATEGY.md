# Test Strategy

Use unit and property tests for domain invariants, database integration tests for transactions/RLS/migrations, contract tests for signed commerce envelopes, plugin tests across supported PHP/WP/WC, browser tests for merchant/customer flows, and failure/load tests for retries, concurrency, and recovery. Mocks cannot be the only evidence for authoritative behavior.

Database migrations, seed replay, schema grants, RLS coverage, and privileged-function placement are exercised with `npm run db:verify`; see `DATABASE_TESTS.md`. Static validation alone cannot close a database task.

`npm run accessibility:validate` statically enforces the shared first-focus skip link, one focusable main target on every route surface, text-area focus visibility, and reduced-motion coverage. It complements, rather than replaces, keyboard and responsive browser inspection of primary workflows.

Support-diagnostic tests serialize adversarial inputs and assert forbidden customer, payload, store-name, item-identity, and signing values are absent. Noncanonical error/operation strings are redacted rather than trusted as safe codes.

`woocommerce:validate` also enforces literal text-domain use, exact POT source coverage, no stale catalog entries, required customer translations, and placeholder parity. The container matrix switches to the bundled Slovenian locale and proves a translated customer My Account label on all four supported runtime combinations.

Experience-theme tests require contract/database agreement on contrast, token allowlists, copy bounds, linked tenant scope, RLS, role revocation, idempotent revisions, and immutable audit evidence. The dashboard preview must remain keyboard reachable and responsive without loading remote fonts or executing merchant CSS.

Customer activity-filter tests require a closed query-value allowlist, total transaction-kind categorization, stable newest-first ordering, and no mutation or expansion of the bounded database result.

The Phase 5 gate adds immutable-ledger pgTAP coverage plus a real two-session overspend race and a deterministic mixed-operation property sequence. Any future value command must join these gates and prove zero sum, attribution, idempotency, tenant isolation, deterministic locks, and wallet/lot projection equality.
