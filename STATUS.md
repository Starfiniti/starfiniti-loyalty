# Status

## What works

- Phase 0's reproducible npm workspace, responsive standalone Next.js Overview, Supabase migration baseline, WooCommerce HPOS scaffold, repository operating system, and pinned CI are verified.
- The Docker-backed GitHub Actions database job replays migrations/seed, passes all 260 transactional pgTAP assertions, and runs real two-session ledger/programme concurrency plus property probes.
- Phase 1 Rosy Rewards semantics are owner-approved and encoded as versioned configuration rather than global merchant assumptions.
- Pure domain behavior covers integer award calculation, explicit historical tier snapshots, 30-day release, 12-month rolling expiry, earliest-expiry redemption ordering, rolling-spend tiers with grace, cumulative original-attribution refund reversal, and negative balances.
- Twenty-four domain tests and nineteen versioned contract tests pass.
- The platform carries a full AGPL-3.0 license and package metadata; the WooCommerce connector remains independently GPL-2.0-or-later.
- Phase 2 architecture is complete and deterministically validated: tenant/Auth trust, identity, double-entry ledger, signed inbox/outbox, reward reservation, privacy, backup/restore, deployment, and SLO models are reviewable.
- Phase 3 tenancy/RLS is complete: organizations, memberships, workspaces, programme groups, support grants, least-privilege roles, composite tenant keys, and live authorization policies execute successfully in disposable Supabase CI.
- Phase 4 commerce ingestion is complete: WooCommerce local outbox, Action Scheduler retry/dead-letter behavior, raw-body HMAC receiver, durable inbox, canonical normalization, effect fences, and transactional outbox are execution-verified.
- Phase 5 ledger is complete: immutable zero-sum transactions/entries, wallets/accounts, FIFO lots, compensating allocations, projections/rebuilds, value commands, export, and liability reporting are execution-verified.
- Phase 6 programme execution is complete: deterministic conditional earning/exclusions, immutable publication/scheduling, materialized tiers/rewards, live/simulation evidence, effective tier intervals, reward failure compensation, and advance expiry notifications are execution-verified.

## Partial

- Phases 0 through 6 are complete for the active WooCommerce scope. Phase 7 production WooCommerce connector work is in progress.
- Only the Overview dashboard route and WooCommerce ingestion boundary exist; programme APIs/workers, editor, customer views, connector reward execution, reconciliation, and production deployment remain pending.

## Broken or unavailable

- Docker, Podman, and WSL remain unavailable on this workstation; GitHub Actions is the verified database runner.
- Direct Proxmox SSH is not usable with the available aliases and keys. No persistent Supabase or WooCommerce environment has been mutated.
- The globally configured `pnpm` shim is broken; npm is the supported package manager.

## Database migration state

All five versioned migrations and the seed replayed twice successfully against disposable Supabase/Postgres 17 CI. Foundation, tenancy, commerce, ledger, and programme suites pass 260 total pgTAP assertions plus the concurrency/property probe. No persistent or production database has been changed.

## Git state

Public repository `Starfiniti/starfiniti-loyalty`; draft PR `#5` contains the Phase 6 programme-engine branch. GitHub recognizes the repository license as GNU AGPLv3.

## Last verification

- `npm run test --workspace=@starfiniti/domain` — passed with 24 tests.
- `npm run typecheck --workspace=@starfiniti/domain` — passed.
- `npm run check` — passed on exact-head CI: formatting, zero-warning lint, all workspace type checks, 43 unit tests, static validators, and standalone Next.js production build.
- `npm run db:validate` — passed for five migrations, Supabase config, and five transactional pgTAP files.
- `npm run secrets:scan` — passed with no findings.
- `npm run audit:prod` — passed with zero production vulnerabilities.
- `npm run licenses` — passed for five AGPL npm package declarations, the full AGPL text, and both WooCommerce GPL declarations.
- `npm run architecture:validate` — passed for eight Phase 2 models and three accepted ADRs; it now runs inside `npm run check`.
- PR exact-head run `31512548299` passed the baseline and Docker/Supabase database jobs.
- Public `main` run `31513294330` passed both jobs after merge, including migration replay, seed, pgTAP, and cleanup.
- PR exact-head run `31527785181` passed both jobs, including replay/reset/seed, all 87 pgTAP assertions, the dynamic ingestion build, and cleanup.
- PR exact-head run `31566530867` passed both jobs, including four migration replays, reset/seed, all 178 pgTAP assertions, a competing-reservation test, 20 deterministic operation sequences, and cleanup.
- PR exact-head run `31568749748` passed both jobs, including five migration replays, reset/seed, all 260 pgTAP assertions, the concurrency/property probe, and cleanup.

## Next recommended task

Implement the production WooCommerce command/execution/reconciliation pipeline while preserving checkout independence.

## Blockers

Phase 7 work is unblocked. Proxmox deployment requires working SSH authentication, DNS/TLS choices, an off-host backup target, and production credentials; none should be guessed or committed.
