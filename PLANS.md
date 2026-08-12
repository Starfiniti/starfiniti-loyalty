# Execution Plan

## Objective

Finish Starfiniti Loyalty as an open-source, self-hosted platform on Proxmox using Next.js, PostgreSQL/Supabase, and a production WooCommerce plugin. Shopify is deferred by product-owner direction.

## Current phase

Phase 9 — merchant administration and customer experience. Shopify Phase 8 remains deferred by product-owner direction.

## Evidence and completed work

- Phase 0 is complete: the npm workspace, responsive Next.js Overview, Supabase migration baseline, WooCommerce HPOS scaffold, Proxmox deployment contract, operating documents, and pinned CI exist.
- GitHub Actions run `31506030405` passed the baseline and Docker-backed database jobs, including migration replay, seed, eight pgTAP assertions, and cleanup.
- Phase 1 is complete for the active WooCommerce scope. The owner approved ADR-0004 on 2026-08-11.
- `rosyRewardsV1` encodes 100 points/EUR redemption, a 30-day pending period, 12-month rolling expiry, original-attribution refunds, and Rose/Bloom/Icon tiers at EUR 0/150/500 with 5/6/7 points per EUR.
- Domain helpers require the historical programme version and tier snapshot. Sixteen domain tests cover configuration, award rounding, tier boundaries/grace, cumulative refunds, negative balances, release, expiry, ordering, and invalid inputs.
- AGPL-3.0-or-later is approved for the hosted platform. The WooCommerce plugin remains GPL-2.0-or-later.
- The public GitHub repository is `Starfiniti/starfiniti-loyalty`; PR `#1` merged the verified Phase 0/1 work into `main`.
- Public `main` CI run `31513294330` passed the baseline and Docker/Supabase database jobs.
- Phase 2 is complete: eight reviewable architecture/security/operations models and ADR-0005 through ADR-0007 define database authorization, double-entry ledger, signed inbox/outbox, identity, privacy, recovery, and failure behavior.
- Current Supabase breaking changes were incorporated: Envoy default, `/auth/v1` external Auth URL, PostgreSQL 17 upgrade boundary, explicit Data API exposure, Studio ownership change, and new publishable/secret/asymmetric keys.
- `npm run architecture:validate` deterministically checks the Phase 2 gate and is part of `npm run check`.
- `P3-TENANCY-SCHEMA` is complete: six tenant-owned tables, no-login database roles, composite tenant foreign keys, explicit grants, live membership RLS, and scoped support access are implemented.
- Exact-head GitHub Actions run `31524730760` passed the baseline and Docker/Supabase jobs, including two migration replays, reset, seed, 49 pgTAP assertions, and cleanup.
- Phase 4 is complete: strict commerce contracts, raw-body HMAC verification, a Next.js ingestion route, a WooCommerce local outbox with Action Scheduler retries, restricted inbox/canonical/effect/outbox tables, and retry-safe normalization are implemented.
- Exact-head GitHub Actions run `31527785181` passed the full baseline and Docker/Supabase jobs with 87 pgTAP assertions, including duplicate, nonce-replay, cross-tenant, repeated-normalization, and out-of-order scenarios.
- Phase 5 is complete: immutable double-entry transactions/entries, wallet/control accounts, FIFO lots, compensating allocations, six balance projections, eight value commands, export/liability reporting, and rebuild tooling are implemented.
- Exact-head run `31566530867` passed the full gate with 178 pgTAP assertions plus a two-session overspend test and deterministic 20-round property sequence.
- Phase 6 is complete: immutable publication/scheduling, deterministic award/simulation parity, tier qualification/history, reward reservation compensation, and advance expiry notifications are implemented.
- Exact-head run `31569179555` passed the full baseline and Docker database gate with five migrations, 260 pgTAP assertions, ledger overspend, concurrent evaluation idempotency, and property probes.
- Phase 7 implementation includes the durable WooCommerce worker, completed-order awards, cumulative refund reversals, explicit programme binding, native coupon issue/cancel polling, coupon-use capture, confirmed-unused expiry compensation, customer/privacy surfaces, source reconciliation, queue operations, and an installable plugin ZIP.
- Exact-head run `31575751260` passed the six-migration baseline with 322 pgTAP assertions plus concurrency/property probes.
- Phase 7 is complete for the active WooCommerce scope. Exact-head run `31577312529` passed the baseline, database, and four real WordPress/WooCommerce runtime jobs across minimum/current versions, HPOS/legacy storage, classic/Blocks coupon paths, hub outage, partial/full refunds, reconciliation, activation lifecycle, and queue recovery.
- Phase 9 now includes the authenticated tenant shell and a structured programme editor with deterministic preview, database-canonical drafts, exact-hash publish/schedule commands, immutable audit evidence, and adversarial tenant/role/idempotency tests.
- Exact-head run `31580836101` passed the baseline, seven-migration database gate with 374 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The customer operations read slice now provides bounded reference search, masked channel identity, wallet-bucket truth, and immutable programme-attributed ledger history through explicit tenant filters plus RLS.
- The connector operations slice now provides private-payload-free queue summaries/issues and an audited, role-guarded replay command limited to canonical dead-letter effects. Coupon command dead letters are deliberately inspect-only after compensation.
- The customer adjustment slice now provides exact integer balance preview, strong removal warnings, explicit confirmation, expiry-bound credits, and owner/admin-only immutable ledger plus audit commands.
- The source-reconciliation slice now sends reviewed WooCommerce order requests through an audited private outbox and signed polling route; the plugin re-emits source facts idempotently and reports missing orders without a retry storm.
- Exact-head run `31584351529` passed the customer-adjustment baseline, nine-migration database state with 448 pgTAP assertions, and all four WooCommerce runtime variants.
- Exact-head run `31585681985` passed the signed source-reconciliation baseline, ten migrations with 485 pgTAP assertions, and all four WooCommerce runtime variants.
- The Overview-reporting slice removes demo values and supplies bounded tenant/workspace/programme aggregates from immutable evaluation and ledger evidence through exact integer contracts; private source data stays server-only.
- Exact-head run `31588394642` passed the live-reporting baseline, eleven migrations with 518 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The customer-read hardening slice moves list/detail assembly into live-membership database wrappers, masks channel IDs before they leave PostgreSQL, and preserves every wallet and ledger bigint as text through `BigInt` display formatting.
- Exact-head run `31589866616` passed the customer-read baseline, twelve migrations with 551 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants after one external Composer TLS retry.
- Initial-programme onboarding now lets an existing tenant owner/admin create the first programme inside an active authorized group through an idempotent audited command; public organization/group signup remains disabled.
- Exact-head run `31591151097` passed the onboarding baseline, thirteen migrations with 586 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The customer-tier slice adds a minimized, exact one-row current/qualified/grace read model and responsive merchant detail surface without exposing private decision evidence.
- Exact-head run `31592427051` passed the customer-tier baseline, fourteen migrations with 613 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The accessibility slice adds a first-focus keyboard bypass to a focusable main landmark on all seven route surfaces, consistent text-area focus treatment, reduced-motion validation, and a narrow-viewport-safe authentication card; the deterministic guard is part of `npm run check`.
- Exact-head run `31596460783` passed the accessibility baseline, fourteen migrations with 613 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The supportability slice adds a downloadable versioned diagnostic bundle from the tenant operations view. It contains public scope/connection IDs, queue counts, watermarks, and a labelled bounded sample of grouped canonical error codes only; direct minimization tests reject item identities and noncanonical strings.
- Exact-head run `31597255280` passed the support-diagnostics baseline, fourteen migrations with 613 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The WooCommerce localization slice registers the packaged `/languages` path at `init`, maintains exact POT coverage for all 38 source strings, bundles Slovenian customer/admin translations in WordPress's performant PHP catalog format, and adds an actual locale-switch/customer-navigation assertion to the four-case runtime matrix.
- Exact-head run `31581760825` passed the customer-ledger baseline, database job, and all four WooCommerce runtime variants.

## Active work

- `P9-MERCHANT-HUB` (in progress): the Auth/RLS shell, guided initial-programme creation, audited programme editor, exact customer wallet/ledger reads, safe connector queue operations, value-changing customer adjustments, signed source reconciliation, real Overview reporting, keyboard-bypass accessibility guard, sanitized support diagnostics, and localized WooCommerce customer strings are implemented; remaining merchant/customer surfaces follow.

## Next safe tasks

1. Audit remaining Phase 9 acceptance gaps and implement the next highest-value merchant/customer surface.
2. Complete production deployment and recovery evidence when the final infrastructure inputs are available.

## Dependencies and blockers

- Docker is not installed on this Windows workstation; GitHub Actions is the verified Linux/Docker database runner.
- Direct Proxmox SSH is unavailable: the public alias rejects the configured keys, the VPN alias times out, and the tested jump-host route cannot reach the private alias.
- Proxmox deployment ultimately needs a working SSH route plus host addresses, DNS, TLS issuer, off-host backup target, and production credentials. These inputs do not block repository implementation or disposable CI verification.

## Decisions awaiting approval

No Phase 1 value-semantics or licensing decision remains open. New material product, legal, production-access, or architecture tradeoffs will be raised when evidence requires them.

## Quality gate

`npm run check && npm run db:validate && npm run secrets:scan && npm run audit:prod && npm run licenses`

See `docs/architecture/ADR/`, `RISKS.md`, and `docs/plan/TASKS.yaml`.
