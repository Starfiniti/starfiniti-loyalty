# Test Strategy

Use unit and property tests for domain invariants, database integration tests for transactions/RLS/migrations, contract tests for signed commerce envelopes, plugin tests across supported PHP/WP/WC, browser tests for merchant/customer flows, and failure/load tests for retries, concurrency, and recovery. Mocks cannot be the only evidence for authoritative behavior.

Database migrations, seed replay, schema grants, RLS coverage, and privileged-function placement are exercised with `npm run db:verify`; see `DATABASE_TESTS.md`. Static validation alone cannot close a database task.
