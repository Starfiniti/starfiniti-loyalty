# Status

## What works

- Phase 0's reproducible npm workspace, responsive standalone Next.js Overview, Supabase migration baseline, WooCommerce HPOS scaffold, repository operating system, and pinned CI are verified.
- The Docker-backed GitHub Actions database job replays migrations/seed and passes all 49 transactional pgTAP assertions.
- Phase 1 Rosy Rewards semantics are owner-approved and encoded as versioned configuration rather than global merchant assumptions.
- Pure domain behavior covers integer award calculation, explicit historical tier snapshots, 30-day release, 12-month rolling expiry, earliest-expiry redemption ordering, rolling-spend tiers with grace, cumulative original-attribution refund reversal, and negative balances.
- Sixteen domain tests and two contract tests pass.
- The platform carries a full AGPL-3.0 license and package metadata; the WooCommerce connector remains independently GPL-2.0-or-later.
- Phase 2 architecture is complete and deterministically validated: tenant/Auth trust, identity, double-entry ledger, signed inbox/outbox, reward reservation, privacy, backup/restore, deployment, and SLO models are reviewable.
- Phase 3 tenancy/RLS is complete: organizations, memberships, workspaces, programme groups, support grants, least-privilege roles, composite tenant keys, and live authorization policies execute successfully in disposable Supabase CI.

## Partial

- Phases 0 through 3 are complete for the active WooCommerce scope. Phase 4 signed commerce ingestion is in progress.
- Only the Overview dashboard route and WooCommerce administrative boundary exist; the API, workers, ledger, programme editor, customer views, and production connector flows are pending.

## Broken or unavailable

- Docker, Podman, and WSL remain unavailable on this workstation; GitHub Actions is the verified database runner.
- Direct Proxmox SSH is not usable with the available aliases and keys. No persistent Supabase or WooCommerce environment has been mutated.
- The globally configured `pnpm` shim is broken; npm is the supported package manager.

## Database migration state

Both versioned migrations and the seed replayed twice successfully against disposable Supabase CI. The tenancy suite passed 41 adversarial assertions in addition to eight foundation assertions. No persistent or production database has been changed.

## Git state

Public repository `Starfiniti/starfiniti-loyalty`; PR `#2` contains the Phase 2/3 branch and has green exact-head checks. GitHub recognizes the repository license as GNU AGPLv3.

## Last verification

- `npm run test --workspace=@starfiniti/domain` — passed with 16 tests.
- `npm run typecheck --workspace=@starfiniti/domain` — passed.
- `npm run check` — passed: formatting, zero-warning lint, all workspace type checks, 18 unit tests, CI contract validation, and standalone Next.js production build.
- `npm run db:validate` — passed for two migrations, Supabase config, and two transactional pgTAP files.
- `npm run secrets:scan` — passed for 153 tracked files with no findings.
- `npm run audit:prod` — passed with zero production vulnerabilities.
- `npm run licenses` — passed for five AGPL npm package declarations, the full AGPL text, and both WooCommerce GPL declarations.
- `npm run architecture:validate` — passed for eight Phase 2 models and three accepted ADRs; it now runs inside `npm run check`.
- PR exact-head run `31512548299` passed the baseline and Docker/Supabase database jobs.
- Public `main` run `31513294330` passed both jobs after merge, including migration replay, seed, pgTAP, and cleanup.
- PR exact-head run `31524730760` passed both jobs, including two migration replays, reset, seed, all 49 pgTAP assertions, and cleanup.

## Next recommended task

Implement the signed WooCommerce inbox, canonical event normalization, and layered idempotency boundary.

## Blockers

Phase 4 work is unblocked. Proxmox deployment requires working SSH authentication, DNS/TLS choices, an off-host backup target, and production credentials; none should be guessed or committed.
