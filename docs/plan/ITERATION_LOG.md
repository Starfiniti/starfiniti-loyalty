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

## 2026-08-11 — GitHub publication and Phase 0 closure

- Created private repository `Starfiniti/starfiniti-loyalty` and pushed initial commit `3e822e8`.
- GitHub Actions run `31506030405` passed the baseline job and Linux/Docker database job.
- Replayed the foundation migration and seed, passed all eight pgTAP assertions, and removed the disposable test containers and volumes.
- Closed `P0-BOOTSTRAP` with execution evidence and started `P1-DOMAIN-DECISIONS`.
- Probed both Proxmox SSH aliases; the public host rejected the configured key and the VPN route timed out.

## 2026-08-11 — Rosy Rewards semantics and Phase 1 closure

- Received explicit owner approval for ADR-0004, a 30-day pending period, rolling eligible-spend tiers, Rose/Bloom/Icon at EUR 0/150/500 with 5/6/7 points, and AGPL-3.0-or-later.
- Resolved the master-plan/prototype tier conflict in the accepted ADR; EUR 1,000/8 points remains an unpublished future concept.
- Encoded Rosy Rewards as a validated, versioned fixture and kept programme behavior merchant-neutral.
- Added integer award, original-attribution refund, negative-balance, expiry-lot, and tier-review helpers. Award calculation requires the stored historical tier snapshot.
- Added 16 domain tests covering approved values, thresholds, month-end dates, cumulative partial refunds, downgrade grace persistence, negative balances, expiry ordering, and invalid inputs.
- Added the full AGPL license and package metadata while retaining the WooCommerce plugin's GPL license.
- Closed Phase 1 for the owner-directed WooCommerce scope and restored the Phase 2 architecture/threat-model gate before tenancy implementation.
- Merged PR `#1`, published the repository publicly under AGPL, and confirmed public `main` CI run `31513294330` passed both baseline and Docker/Supabase jobs.

## 2026-08-11 — Phase 2 architecture and threat-model gate

- Reviewed the current Supabase breaking-change changelog and self-hosting, RLS, Auth-key, JWT, and connection guidance.
- Incorporated Envoy's default gateway, `/auth/v1` external Auth URL, PostgreSQL 17 upgrade boundary, Studio ownership change, opt-in Data API exposure, and generated publishable/secret/asymmetric keys.
- Defined explicit browser, BFF, ingestion, worker, database-role, WordPress, and infrastructure trust boundaries.
- Designed live membership authorization, composite tenant keys, immutable double-entry ledger/projections, signed inbox/outbox, reward reservation, identity claim, privacy, backup/restore, and failure state models.
- Accepted ADR-0005, ADR-0006, and ADR-0007 with alternatives and rollback implications.
- Added `architecture:validate` to `npm run check`; full check, migration validation, secret scan, production audit, and license validation passed.
- Closed `P2-ARCHITECTURE` and started `P3-TENANCY-SCHEMA`.
