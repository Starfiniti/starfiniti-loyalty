# Status

## What works

- Approved prototype and master plan are preserved under `docs/`.
- Root npm workspace, repository instructions, plan/task ledger, and CI contract exist.
- The responsive Next.js Overview route builds as a standalone production server and matches the approved 912 × 512 reference; `design-qa.md` passed.
- Date range, publish confirmation, and mobile navigation interactions work with no browser console warnings/errors.
- Domain integer value types and canonical commerce-envelope contracts have four passing unit tests.
- The WooCommerce scaffold declares HPOS compatibility and passes PHP 8.3 syntax checks.
- Supabase CLI 2.113.0 generated the first versioned schema migration.
- A Docker-backed GitHub Actions job now replays migrations/seed and runs pgTAP using the lockfile-pinned CLI.
- Static verification covers the Postgres 17 configuration, migration naming/secrets, Data API schema boundary, pgTAP transaction structure, workflow triggers, permissions, cleanup, and pinned action SHAs.
- GitHub Actions run `31506030405` passed the baseline and database jobs, including migration replay, seed, all eight pgTAP assertions, and destructive test-container cleanup.

## Partial

- Phase 0 is complete. Phase 1 value semantics are proposed in ADR-0004 and await explicit owner approval before balance-affecting implementation.
- Only the Overview dashboard route and WooCommerce administrative boundary are implemented; the remaining approved routes and connector behavior are pending.

## Broken or unavailable

- Docker, Podman, and WSL remain unavailable on this workstation; GitHub Actions provides the verified database runner.
- Direct Proxmox SSH is not usable with the current aliases: public-key authentication fails on `proxmox`, while `proxmox-vpn` times out.
- The globally configured `pnpm` shim points to a missing module; npm is the supported package manager.
- No Supabase or WooCommerce environment is connected yet.

## Database migration state

The foundation migration and seed were executed successfully against the disposable Supabase CI database. No persistent or production database has been mutated.

## Git state

Private repository `Starfiniti/starfiniti-loyalty`; initial commit `3e822e8` is on `main`. Phase-closing documentation is on `agent/close-phase-0` pending review.

## Last verification

- `npm ci --cache .npm-cache --no-audit --no-fund` — passed from an empty `node_modules`.
- `npm run check` — passed (format, lint, TypeScript, 4 tests, standalone production build).
- `npm run ci:validate` — passed; 2 CI jobs and all external actions pinned by commit SHA.
- `npm run db:validate` — passed; Postgres 17 config, 1 migration, and 1 transactional pgTAP file.
- `npm run db:verify` — intentionally failed at the container-runtime preflight; no Docker, Podman, or WSL is installed. Database SQL was not executed.
- `npm run secrets:scan` — passed; 139 files scanned at the final run.
- `npm run audit:prod` — passed; 0 production vulnerabilities.
- `npm run licenses` — passed; repository root remains intentionally `UNLICENSED` until owner approval.
- PHP syntax checks — passed for both plugin PHP files.
- Production HTML/CSS/JS asset checks — HTTP 200.
- GitHub Actions run `31506030405` — passed; baseline completed in 1m08s and database completed in 2m36s.

## Next recommended task

Approve or amend ADR-0004, then encode the selected policies and Rosy Rewards executable examples in `packages/domain`.

## Blockers

Balance-affecting Phase 1 decisions and the repository license require explicit product-owner approval. Proxmox deployment additionally needs working SSH authentication, DNS/TLS choices, and a backup target; none block policy-neutral domain design.
