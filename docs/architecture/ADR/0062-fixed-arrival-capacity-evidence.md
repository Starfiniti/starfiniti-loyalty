# ADR-0062: Fixed-arrival capacity evidence with domain-aware adapters

- Status: Accepted
- Date: 2026-08-27
- Module: M15-S01

## Context

The product has latency goals and extensive deterministic correctness tests, but it does not yet have a supported capacity claim. A meaningful claim must bind the exact application and database resources, data shape, workload mix, code revision, driver health, thresholds, and post-run value reconciliation. It must also preserve signed connector and service-account boundaries and must not turn production into an unapproved load target.

Three approaches were compared:

1. Run ad hoc browser or `curl` loops. This is easy to start but uses closed-loop traffic, hides overload through coordinated omission, does not reproduce canonical signatures, and produces weak evidence.
2. Use database-only [`pgbench`](https://www.postgresql.org/docs/current/pgbench.html) scripts. PostgreSQL supports custom scripts, scheduled rates, latency limits, and retry reporting, but a database-only test bypasses Next.js, signature verification, bounded request parsing, connection pools, and public contracts.
3. Keep a small fixed-arrival Node runner in the repository with domain-aware HTTP adapters, then require database and connector reconciliation outside the runner before a claim can pass. The driver records schedule lag and saturation separately, signs current contracts, reads credentials only from owner-controlled files, and emits aggregate evidence without bodies, URLs, selectors, or secrets.

The third approach is selected for the initial single-site envelope. `pgbench` remains appropriate for a separately identified database bottleneck. Before publication, the passing boundary must also be cross-checked with a mature independent fixed-arrival driver so a defect in the repository-owned scheduler cannot become a capacity claim. A permanent replacement requires cross-tool comparison and a superseding ADR.

## Decision

- The workload uses explicit fixed-arrival phases. A scheduled request that cannot start within the concurrency cap is dropped and fails the phase; work is never queued without bound.
- Readiness, customer account reads, signed WooCommerce order intake, and service customer intake run concurrently. Each scenario has an exact rate, timeout, response bound, allowed status set, and latency/error/schedule-lag threshold.
- Mutating scenarios may run only against a target classified as disposable staging. The runner requires a clean worktree and a short-lived approval file bound to the exact driver commit plus the SHA-256 digests of the canonical target origin and workload configuration. Public targets require the same approval even for read-only work.
- Target origin, service tokens, WooCommerce connection selectors/signing key, and customer session cookie are read from separate regular files. They never appear in command arguments, reports, or console output.
- Reports contain only the schema, exact candidate commit, workload and origin digests, target class, UTC bounds, aggregate request/error/drop counts, status-code totals, latency and schedule-lag percentiles, threshold decisions, and driver utilization supplied by the operator. Raw URLs, IDs, bodies, headers, cookies, tokens, signatures, customer data, and provider data are prohibited.
- A passing HTTP report is necessary but insufficient. The evidence gate also requires exact environment inventory, monitoring, driver headroom, accepted/canonical/effect/ledger and WooCommerce reconciliation, event-to-ledger latency, recovery after the burst, a second run within the declared variance, and an independent-driver cross-check.
- The published envelope is the highest workload whose sustained, burst, and recovery phases pass. A failed higher run may identify the next limit but cannot be reported as supported capacity.

## Consequences

The repository can exercise real request boundaries without adding a load-tool runtime dependency to the product images. The initial driver has a declared single-process limit; driver CPU, event-loop delay, and dropped schedules must remain within the evidence thresholds. The capacity gate stays incomplete until a production-like disposable environment and monitoring/reconciliation evidence are approved.

## Rollback

Stop the driver, revoke its short-lived service and WooCommerce credentials, remove generated test data through the environment's approved teardown, and retain the immutable aggregate report. Removing the runner does not require an application or database rollback because it adds no runtime dependency or migration. Never delete ledger history to clean up a test; use a disposable tenant/environment or compensating product behavior.
