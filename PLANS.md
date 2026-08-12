# Execution Plan

## Objective

Finish Starfiniti Loyalty as an open-source, self-hosted platform on Proxmox using Next.js, PostgreSQL/Supabase, and a production WooCommerce plugin. Shopify is deferred by product-owner direction.

## Current phase

Phase 7 — production WooCommerce connector and plugin.

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

## Active work

- `P7-WOOCOMMERCE-CONNECTOR` (in progress): complete order/refund normalization effects, reward command execution, storefront/customer surfaces, and reconciliation without making checkout depend on the hub.

## Next safe tasks

1. Connect canonical WooCommerce order/refund facts to programme evaluation and idempotent ledger effects.
2. Implement idempotent native reward/coupon command execution and status callbacks in the plugin.
3. Add reconciliation, queue recovery, Blocks/classic compatibility tests, and customer-safe cached loyalty reads.

## Dependencies and blockers

- Docker is not installed on this Windows workstation; GitHub Actions is the verified Linux/Docker database runner.
- Direct Proxmox SSH is unavailable: the public alias rejects the configured keys, the VPN alias times out, and the tested jump-host route cannot reach the private alias.
- Proxmox deployment ultimately needs a working SSH route plus host addresses, DNS, TLS issuer, off-host backup target, and production credentials. These inputs do not block Phase 6 implementation.

## Decisions awaiting approval

No Phase 1 value-semantics or licensing decision remains open. New material product, legal, production-access, or architecture tradeoffs will be raised when evidence requires them.

## Quality gate

`npm run check && npm run db:validate && npm run secrets:scan && npm run audit:prod && npm run licenses`

See `docs/architecture/ADR/`, `RISKS.md`, and `docs/plan/TASKS.yaml`.
