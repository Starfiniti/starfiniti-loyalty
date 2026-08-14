# M07 Evidence — Campaigns

M07 is in progress. ADR-0021 and M07-S01 define the first authority boundary: strict allowlisted predicates over canonical loyalty facts, immutable audience versions and database-timed snapshots, exact TypeScript/PostgreSQL parity, private PII-free membership evidence, tenant-derived commands, and entitlement-safe rollback.

Local source evidence passes the focused contract/domain tests, both package typechecks, static database and architecture validators, lint, workspace tests/typechecks, CI validators, production build, WooCommerce validation, secret scan, production audit, and licence inventory. The aggregate `npm run check` wrapper stops at the known Windows CRLF baseline during repository-wide format checking; targeted formatting for changed non-SQL files passes. Local Docker/Podman is unavailable, so no 42-migration/36-pgTAP runtime replay or execution of `verify-audience-snapshot-concurrency.mjs` is claimed here. Exact-head Ubuntu CI is the required S01 completion evidence.

Record contract/database parity, RLS, cross-tenant, idempotency, rolling-boundary, null-recency, two-session snapshot, timezone/DST, budget/quantity concurrency, control, cancellation, liability, UI, and canary evidence here.
