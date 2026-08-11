# Execution Plan

## Objective

Finish Starfiniti Loyalty as an open-source, self-hosted platform on Proxmox using Next.js, PostgreSQL/Supabase, and a production WooCommerce plugin. Shopify is deferred by product-owner direction.

## Current phase

Phase 3 — secure platform foundation and tenancy.

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

## Active work

- `P3-TENANCY-SCHEMA` (in progress): implement organizations, workspaces, memberships, roles, least-privilege grants, live membership helpers, and adversarial RLS tests.

## Next safe tasks

1. Create the Phase 3 migration using the pinned Supabase CLI workflow.
2. Implement tenant keys, membership authorization, explicit grants, RLS, and safe helper functions.
3. Prove cross-tenant, forged-ID, absent-membership, and revoked-membership paths fail closed in pgTAP/CI.

## Dependencies and blockers

- Docker is not installed on this Windows workstation; GitHub Actions is the verified Linux/Docker database runner.
- Direct Proxmox SSH is unavailable: the public alias rejects the configured keys, the VPN alias times out, and the tested jump-host route cannot reach the private alias.
- Proxmox deployment ultimately needs a working SSH route plus host addresses, DNS, TLS issuer, off-host backup target, and production credentials. These inputs do not block Phase 3 implementation.

## Decisions awaiting approval

No Phase 1 value-semantics or licensing decision remains open. New material product, legal, production-access, or architecture tradeoffs will be raised when evidence requires them.

## Quality gate

`npm run check && npm run db:validate && npm run secrets:scan && npm run audit:prod && npm run licenses`

See `docs/architecture/ADR/`, `RISKS.md`, and `docs/plan/TASKS.yaml`.
