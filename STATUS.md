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

## Partial

- Phase 0 implementation is blocked in verification; it is not complete until the Docker-backed Supabase reset/migration/seed/RLS job actually passes in CI or on the Proxmox Linux VM.
- Only the Overview dashboard route and WooCommerce administrative boundary are implemented; the remaining approved routes and connector behavior are pending.

## Broken or unavailable

- Docker is unavailable on this workstation.
- Podman and WSL are also unavailable, so the pgTAP suite cannot execute locally.
- The globally configured `pnpm` shim points to a missing module; npm is the supported package manager.
- No Supabase or WooCommerce environment is connected yet.

## Database migration state

No database has been mutated. `20260811141308_foundation_schemas.sql` is repository-only until container verification succeeds.

## Git state

Branch `main`; Git is initialized with no commits. All bootstrap files and the user-owned source ZIP are untracked; nothing has been staged or committed.

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

## Next recommended task

Run the existing `database` CI job or `npm run db:verify` on the Proxmox Linux VM. Close `P0-BOOTSTRAP` only after it passes, then start `P1-DOMAIN-DECISIONS`.

## Blockers

Container verification requires Docker on CI or the Proxmox Linux VM. This is the third consecutive goal turn where Docker, Podman, WSL, a Git remote, Supabase MCP configuration, and Proxmox access are all unavailable. The master plan forbids starting Phase 1 before this gate passes.

To resume, provide either a connected Git remote with CI enabled or access to a non-production Proxmox Linux VM with Docker Engine and Compose. No production database credentials are needed for `npm run db:verify`.
