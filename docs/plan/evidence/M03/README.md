# M03 Evidence — Earning Rules

Status: in progress.

## Slice 1 — contract, engine, and publication boundary

- `ProgrammeDefinitionV2` is strict and coexists with the unchanged V1 reader/evaluator.
- Six earning sources, allowlisted conditions, explicit purchase exclusions, per-event/member-period caps, deterministic base/multiplier/bonus precedence, and conflict inspection are versioned.
- The pure V2 evaluator uses exact bigint arithmetic and one implementation for live and simulation calls. Tests prove line/rule reordering is value-neutral, only one multiplier wins, activities require authoritative verification, and values beyond JavaScript's safe-integer range remain exact.
- Migration `20260813200000_programme_v2_earning_rules.sql` checks the database-authoritative `programme.v2` entitlement, independently validates direct-RPC input, and materializes immutable tenant-scoped rules on publish/schedule. V1 remains accepted when V2 is disabled.
- `programme_v2_earning_rules_test.sql` covers grants, RLS, cross-tenant denial, canary gating, direct-RPC bypass attempts, strict validation, publication, normalized evidence, and immutability.
- ADR-0011 records the alternatives, concurrent-cap boundary, authority model, UTC window decision, and forward-fix rollback.

## Slice 2 — live WooCommerce value path

- PostgreSQL serializes member usage by organization/programme group/customer, excludes the current idempotency key on exact retry, and atomically appends evaluation, integer per-rule usage, and ledger evidence. It independently rejects stale cap reads, forged rules, event/programme mismatch, irreconcilable totals, and bigint overflow.
- Contribution allocation now uses deterministic largest-remainder rounding so immutable contribution points exactly sum to the final award even when multiple rules share fractional value.
- The worker reads immutable V2 configuration, carries authoritative member usage into the shared evaluator, and calls only the atomic V2 database command. V1 remains on its unchanged evaluator and command path.
- V2 cumulative refund planning uses exact bigint arithmetic and the original immutable programme. Current Woo facts include cumulative line, shipping, tax, and fee refund evidence; older senders default new component fields to zero.
- Targeted contract, domain, worker, PHP syntax, architecture, and WooCommerce validators pass locally. Database replay/pgTAP is awaiting the next exact-head Linux runner after correcting two transaction-local test-fixture defects found by the first run.

Pending before module closure: signed activity API and connector facts, merchant builder/simulator/publish review, browser/accessibility evidence, exact-head database/concurrency matrix, canary, and 90/100 score.
