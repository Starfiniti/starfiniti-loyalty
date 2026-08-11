# Execution Plan

## Objective

Finish Starfiniti Loyalty as an open-source, self-hosted platform on Proxmox using Next.js, PostgreSQL/Supabase, and a production WooCommerce plugin. Shopify is deferred by product-owner direction.

## Current phase

Phase 2 — architecture, data model, and threat-model gate.

## Evidence and completed work

- Phase 0 is complete: the npm workspace, responsive Next.js Overview, Supabase migration baseline, WooCommerce HPOS scaffold, Proxmox deployment contract, operating documents, and pinned CI exist.
- GitHub Actions run `31506030405` passed the baseline and Docker-backed database jobs, including migration replay, seed, eight pgTAP assertions, and cleanup.
- Phase 1 is complete for the active WooCommerce scope. The owner approved ADR-0004 on 2026-08-11.
- `rosyRewardsV1` encodes 100 points/EUR redemption, a 30-day pending period, 12-month rolling expiry, original-attribution refunds, and Rose/Bloom/Icon tiers at EUR 0/150/500 with 5/6/7 points per EUR.
- Domain helpers require the historical programme version and tier snapshot. Sixteen domain tests cover configuration, award rounding, tier boundaries/grace, cumulative refunds, negative balances, release, expiry, ordering, and invalid inputs.
- AGPL-3.0-or-later is approved for the hosted platform. The WooCommerce plugin remains GPL-2.0-or-later.
- The private GitHub repository and draft PR are at `Starfiniti/starfiniti-loyalty` and PR `#1`.

## Active work

- `P2-ARCHITECTURE` (in progress): make modular boundaries, tenancy, identity, immutable-ledger, event, reward-reservation, threat, and recovery models reviewable before schema implementation.

## Next safe tasks

1. Complete the Phase 2 system, data, event, identity, threat, privacy, and operations models with explicit trust boundaries and rollback implications.
2. Close every critical architecture/threat issue or record the exact owner decision required.
3. Begin the tenancy schema and adversarial RLS tests only after the Phase 2 gate passes.

## Dependencies and blockers

- Docker is not installed on this Windows workstation; GitHub Actions is the verified Linux/Docker database runner.
- Direct Proxmox SSH is unavailable: the public alias rejects the configured keys, the VPN alias times out, and the tested jump-host route cannot reach the private alias.
- Proxmox deployment ultimately needs a working SSH route plus host addresses, DNS, TLS issuer, off-host backup target, and production credentials. These inputs do not block Phase 2 design.

## Decisions awaiting approval

No Phase 1 value-semantics or licensing decision remains open. New material product, legal, production-access, or architecture tradeoffs will be raised when evidence requires them.

## Quality gate

`npm run check && npm run db:validate && npm run secrets:scan && npm run audit:prod && npm run licenses`

See `docs/architecture/ADR/`, `RISKS.md`, and `docs/plan/TASKS.yaml`.
