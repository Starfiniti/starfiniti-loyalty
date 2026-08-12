# Test Strategy

Use unit and property tests for domain invariants, database integration tests for transactions/RLS/migrations, contract tests for signed commerce envelopes, plugin tests across supported PHP/WP/WC, browser tests for merchant/customer flows, and failure/load tests for retries, concurrency, and recovery. Mocks cannot be the only evidence for authoritative behavior.

Database migrations, seed replay, schema grants, RLS coverage, and privileged-function placement are exercised with `npm run db:verify`; see `DATABASE_TESTS.md`. Static validation alone cannot close a database task.

The Phase 5 gate adds immutable-ledger pgTAP coverage plus a real two-session overspend race and a deterministic mixed-operation property sequence. Any future value command must join these gates and prove zero sum, attribution, idempotency, tenant isolation, deterministic locks, and wallet/lot projection equality.
