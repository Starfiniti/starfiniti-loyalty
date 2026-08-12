# Status

## What works

- Phase 0's reproducible npm workspace, responsive standalone Next.js Overview, Supabase migration baseline, WooCommerce HPOS scaffold, repository operating system, and pinned CI are verified.
- The Docker-backed GitHub Actions database job replays migrations/seed and runs 322 transactional pgTAP assertions plus real two-session ledger/programme concurrency and property probes.
- Phase 1 Rosy Rewards semantics are owner-approved and encoded as versioned configuration rather than global merchant assumptions.
- Pure domain behavior covers integer award calculation, explicit historical tier snapshots, 30-day release, 12-month rolling expiry, earliest-expiry redemption ordering, rolling-spend tiers with grace, cumulative original-attribution refund reversal, and negative balances.
- Twenty-four domain, twenty-six versioned contract, and eight worker tests pass.
- The platform carries a full AGPL-3.0 license and package metadata; the WooCommerce connector remains independently GPL-2.0-or-later.
- Phase 2 architecture is complete and deterministically validated: tenant/Auth trust, identity, double-entry ledger, signed inbox/outbox, reward reservation, privacy, backup/restore, deployment, and SLO models are reviewable.
- Phase 3 tenancy/RLS is complete: organizations, memberships, workspaces, programme groups, support grants, least-privilege roles, composite tenant keys, and live authorization policies execute successfully in disposable Supabase CI.
- Phase 4 commerce ingestion is complete: WooCommerce local outbox, Action Scheduler retry/dead-letter behavior, raw-body HMAC receiver, durable inbox, canonical normalization, effect fences, and transactional outbox are execution-verified.
- Phase 5 ledger is complete: immutable zero-sum transactions/entries, wallets/accounts, FIFO lots, compensating allocations, projections/rebuilds, value commands, export, and liability reporting are execution-verified.
- Phase 6 programme execution is complete: deterministic conditional earning/exclusions, immutable publication/scheduling, materialized tiers/rewards, live/simulation evidence, effective tier intervals, reward failure compensation, and advance expiry notifications are execution-verified.
- Phase 7 implements a separately credentialed WooCommerce effect worker, completed-order awards, cumulative original-attribution refund reversal, channel-ID customer resolution, native issue/cancel commands, PII-free coupon capture, expiry compensation, connection health watermarks, source reconciliation, and an installable GPL plugin artifact.
- The plugin encrypts its signing key at rest, declares HPOS support, keeps checkout independent of the hub, exposes queue/dead-letter diagnostics, and provides customer loyalty, privacy export/erase, and WP-CLI recovery surfaces.
- The supported WooCommerce smoke matrix passes on WordPress 6.6.5/WooCommerce 9.0.2/PHP 8.1 and WordPress 7.0.2/WooCommerce 10.9.4/PHP 8.3, each with HPOS and legacy storage. It executes classic and Blocks coupon paths under hub outage, order completion/capture, partial/full refunds, reconciliation, activation lifecycle, and dead-letter recovery.
- The Next.js merchant shell now verifies Supabase Auth claims, refreshes sessions through the Next.js 16 request proxy, derives live organization/workspace/programme scope through the authenticated Data API and RLS, handles unassigned users safely, and provides sign-in/sign-out/PKCE callback paths without exposing a secret key.
- The merchant programme surface provides structured tier/reward editing, deterministic earning preview, contract validation, new immutable draft versions, exact-fingerprint publish/schedule confirmation, role-aware controls, version history, and tenant-visible administration audit evidence.
- Customer operations provide bounded display-reference search, masked channel identity, authoritative pending/available/reserved/spent/expired/reversed buckets, and the latest immutable ledger entries with programme-version and correlation attribution.
- Connector operations provide tenant-authorized health/queue counts, bounded failure metadata without private payloads, and audited owner/admin/operator replay of dead-letter canonical effects. Outbound coupon dead letters remain inspect-only because points compensation may already exist.
- Customer owners/admins can preview and confirm signed whole-point adjustments against an exact text-form balance. Credits require expiry, removals show a strong negative-balance warning, and every result is one reason-bound immutable double-entry transaction plus administration audit evidence.
- Connector owners/admins/operators can review and queue one WooCommerce order reconciliation through an audited private outbox and signed polling route. The plugin re-emits stable source facts idempotently, never edits points directly, and terminates missing orders explicitly.

## Partial

- Phases 0 through 7 are complete for the active WooCommerce scope. Shopify Phase 8 is deferred by product-owner direction.
- Phase 9 is in progress. The authenticated shell, programme editor, customer wallet/ledger reads, safe hub connector operations, reason-bound value adjustments, and live source-reconciliation requests exist; real Overview reporting queries and production deployment remain future slices.

## Broken or unavailable

- Docker, Podman, and WSL remain unavailable on this workstation; GitHub Actions is the verified database runner.
- Direct Proxmox SSH is not usable with the available aliases and keys. No persistent Supabase or WooCommerce environment has been mutated.
- The globally configured `pnpm` shim is broken; npm is the supported package manager.

## Database migration state

Nine versioned migrations and the seed replay successfully against disposable Supabase/Postgres 17 CI. The tenth source-reconciliation migration validates locally and the expanded suite declares 485 pgTAP assertions plus concurrency/property probes. No persistent or production database has been changed.

## Git state

Public repository `Starfiniti/starfiniti-loyalty`; PR `#6` merged the Phase 7 WooCommerce pipeline. Draft PR `#7` contains active Phase 9 work on `codex/phase-9-merchant-hub`. GitHub recognizes the repository license as GNU AGPLv3.

## Last verification

- `npm run test --workspace=@starfiniti/domain` — passed with 24 tests.
- `npm run typecheck --workspace=@starfiniti/domain` — passed.
- `npm run check` — passed locally and in the latest Phase 7 baseline job: formatting, zero-warning lint, all workspace type checks, 58 unit tests, static validators, standalone Next.js production build, and plugin packaging.
- `npm run db:validate` — passed for six migrations, Supabase config, and six transactional pgTAP files.
- `npm run secrets:scan` — passed with no findings.
- `npm run audit:prod` — passed with zero production vulnerabilities.
- `npm run licenses` — passed for six AGPL npm package declarations, the full AGPL text, and both WooCommerce GPL declarations.
- `npm run architecture:validate` — passed for eight Phase 2 models and three accepted ADRs; it now runs inside `npm run check`.
- PR exact-head run `31512548299` passed the baseline and Docker/Supabase database jobs.
- Public `main` run `31513294330` passed both jobs after merge, including migration replay, seed, pgTAP, and cleanup.
- PR exact-head run `31527785181` passed both jobs, including replay/reset/seed, all 87 pgTAP assertions, the dynamic ingestion build, and cleanup.
- PR exact-head run `31566530867` passed both jobs, including four migration replays, reset/seed, all 178 pgTAP assertions, a competing-reservation test, 20 deterministic operation sequences, and cleanup.
- PR exact-head run `31569179555` passed both jobs, including five migration replays, reset/seed, all 260 pgTAP assertions, ledger overspend, concurrent evaluation idempotency, the property probe, and cleanup.
- PR exact-head run `31575751260` passed the full baseline and Docker/Supabase jobs with six migrations, 322 pgTAP assertions, concurrency/property probes, and cleanup.
- PR exact-head run `31577312529` passed all six jobs: baseline, Docker/Supabase, and minimum/current WooCommerce runtimes in HPOS and legacy modes.
- PR exact-head run `31580836101` passed all six jobs with seven migration replays, 374 pgTAP assertions, concurrency/property probes, and the complete minimum/current HPOS/legacy WooCommerce matrix.
- PR exact-head run `31581760825` passed all six jobs for the customer-ledger slice, including the clean Next.js build, seven-migration database verification, and complete WooCommerce matrix.
- PR exact-head run `31584171545` passed all six jobs for connector operations, including 412 pgTAP assertions and the complete WooCommerce matrix.
- PR exact-head run `31584351529` passed all six jobs for customer adjustments, including nine migration replays, 448 pgTAP assertions, and the complete WooCommerce matrix.

## Next recommended task

Replace illustrative Overview analytics with tenant-authorized reporting queries.

## Blockers

Phase 7 work is unblocked. Proxmox deployment requires working SSH authentication, DNS/TLS choices, an off-host backup target, and production credentials; none should be guessed or committed.
