# M03 Evidence — Earning Rules

Status: complete at 93/100.

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
- Targeted contract, domain, worker, PHP syntax, architecture, and WooCommerce validators pass locally. Exact-head database replay remains authoritative because Docker is unavailable on the workstation.

## Slice 3 — competitive merchant builder and simulator

- The Earning Rules route now edits `ProgrammeDefinitionV2` directly through an independently versioned V2 merchant draft command while V1 draft behavior remains compatible.
- Seven reviewed templates cover the six sources and distinct purchase multiplier/bonus behavior. Each rule exposes source-safe effects, priority, allowlisted selectors, half-open UTC dates, explicit purchase exclusions, per-event caps, and lifetime/calendar/rolling member caps.
- Equal-priority overlapping multipliers use the shared domain conflict inspector. The live preview calls `simulateEarningV2` from the same package and configuration used by the worker, including exact minor-unit conversion without floating-point arithmetic.
- A V1 baseline copies existing tiers and rewards into the new draft, preserves the published version, and warns when tier-specific V1 rates would become one programme-wide V2 base rate.
- A temporary real Next.js/Playwright harness exercised the Hub shell at 1440×1000 and 390×844. Adding a birthday template changed one rule to two, the shared evaluator returned exactly 250 points, both widths had zero horizontal overflow, and the browser reported no console error. The temporary public fixture and automation script were removed after the run.
- Dashboard/contract typechecks, 221 workspace tests, zero-warning lint, and the standalone production build pass locally.

## Exact-head verification

- GitHub Actions run `31735847075` passed baseline, both immutable container builds, all four minimum/current HPOS/legacy WooCommerce cells, clean migration replay, 29 pgTAP files / 1,200 assertions, and the ledger/programme concurrency-property probe at commit `2100a09`.
- Local adversarial review fixed four deterministic weaknesses before the final gate: worker tests no longer require broad table reads, streamed ingestion uses the exact lease-close signature, draft retries retain their idempotency identity until success, and disabled tenants cannot render V2 authoring or new source provisioning while historical source health remains inspectable.
- Contract, database, runtime, editor, and ADR surfaces agree that signed backends may submit an already-qualified referral fact, while M06 exclusively owns first-party referral attribution, cooling, fraud review, and reversible qualification.

## Production closure

- PR #26 merged the earning-rules implementation; PR #27 merged the recovery prerequisite after the live exporter race was repaired and independently passed exact-head CI.
- Release `v0.1.11` run `31738294379` passed the full repository, database, package, licence, audit, image, and release gate at commit `0ced4b666a55d836bd3d4927337fe057a71bb4ba`.
- Production received additive migration `20260813200000_programme_v2_earning_rules.sql` in one transaction after a fresh verified physical base and encrypted off-host archive. The migration ledger, RLS, zero accepted-value baseline, WAL archiver, and explicit Starfiniti `programme.v2` tenant canary passed.
- Both application containers run the exact release SHA. Public health and login return 200 and unsigned WooCommerce delivery returns 401.
- An authenticated production owner session rendered the real V2 builder and exact `EUR 150.00 → 750 points` simulation at 1744 and 390 pixel widths with no horizontal overflow or browser warning/error.
- The V1 draft remains unchanged and unpublished: automatic V2 migration warns that its one base rate would change existing tier-specific behavior. M05 owns the exact Rose/Bloom/Icon equivalent migration, so the production canary proves gated authoring/simulation without silently changing loyalty value.

The complete deployment evidence is in `production-rollout-2026-08-13.md`; the evidence-based module score is in `docs/plan/evaluations/M03.json`.
