# Iteration Log

## 2026-08-11 — Repository reconstruction

- Found no existing repository or implementation; preserved the user-provided design archive.
- Deferred Shopify per owner direction.
- Verified current Supabase self-hosting guidance and WooCommerce REST/compatibility requirements.
- Selected npm workspaces to match the available local toolchain.
- Implemented and visually verified the responsive Next.js Overview route against the approved 912 × 512 source.
- Fixed sidebar overflow, action/metric fidelity, mobile drawer state, and standalone static-asset packaging based on browser evidence.
- Verified the production bundle, four unit tests, PHP syntax, secret scan, migration naming/content validation, and production dependency audit.
- Left Phase 0 open because Docker-backed Supabase reset/migration/seed/RLS verification cannot run on this workstation.

## 2026-08-11 — Supabase database gate

- Rechecked the current Supabase changelog, CLI help, local workflow, pgTAP, and CI documentation.
- Added `db:start`, `db:reset`, `db:test`, `db:verify`, and destructive local cleanup commands discovered from CLI help.
- Added a transactional pgTAP security suite covering schema grants, RLS coverage, and privileged functions.
- Added a parallel Ubuntu/Docker database CI job using the lockfile-pinned CLI and full-SHA GitHub Actions.
- Added static validators for Supabase config/tests and CI safety contracts.
- Confirmed Docker, Podman, and WSL are unavailable locally. Kept Phase 0 in verification instead of claiming an unexecuted database pass.
