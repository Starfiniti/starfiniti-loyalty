# M07 Evidence — Campaigns

M07 is in progress. ADR-0021 and M07-S01 define the first authority boundary: strict allowlisted predicates over canonical loyalty facts, immutable audience versions and database-timed snapshots, exact TypeScript/PostgreSQL parity, private PII-free membership evidence, tenant-derived commands, and entitlement-safe rollback.

Exact-head Ubuntu run [`31773939480`](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/31773939480) passed at `8192dd7`: the complete repository gate, both production images, a clean 42-migration replay, all 36 pgTAP files with 1,770 assertions including 70 focused audience assertions, all four concurrency probes, 126 dashboard tests, 21 worker tests, 143 contract tests, 53 domain tests, 15 accepted ADRs, and all four minimum/current HPOS/legacy WooCommerce runtimes. The audience race created one immutable snapshot/member/audit and returned one `created` plus one `duplicate` result across two sessions.

M07-S01 is complete. The first run exposed an explicit UUID fixture cast and global reviewed-function allowlist omissions; the second exposed a PL/pgSQL record/alias collision. Adversarial review then added independent input-size, public-identity/hash, candidate-loop, and rollback-safe retry protections. Each failure was deterministic, forward-fixed, and retained in CI history; no blocker or should-fix finding remains. No production deployment or entitlement enablement is claimed. M07-S02 campaign contracts and scheduling are active.

Record contract/database parity, RLS, cross-tenant, idempotency, rolling-boundary, null-recency, two-session snapshot, timezone/DST, budget/quantity concurrency, control, cancellation, liability, UI, and canary evidence here.
