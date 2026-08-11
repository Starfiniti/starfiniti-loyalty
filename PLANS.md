# Execution Plan

## Objective

Finish Starfiniti Loyalty as an open-source, self-hosted platform on Proxmox using Next.js, PostgreSQL/Supabase, and a production WooCommerce plugin. Shopify is deferred, not removed from the long-term product model.

## Current phase

Phase 1 — loyalty value semantics and executable programme examples.

## Evidence and completed work

- Repository discovery found only the approved design ZIP; there was no Git repository or application code.
- The master plan and complete design prototype are preserved in `docs/`.
- Current Supabase self-hosting and WooCommerce primary documentation was reviewed on 2026-08-11.
- npm workspaces were selected because npm 11 is available while the local pnpm shim is broken.
- A faithful responsive Overview route, standalone packaging, four unit tests, Supabase migration baseline, WooCommerce HPOS scaffold, and Proxmox deployment contract are implemented and verified.
- `design-qa.md` passed at 912 × 512 and responsive navigation passed at 390 × 844.
- The private GitHub repository was created at `Starfiniti/starfiniti-loyalty`.
- GitHub Actions run `31506030405` passed both the baseline job and the Linux/Docker database job, including migration replay, seed, pgTAP, and cleanup.

## Active work

- `P1-DOMAIN-DECISIONS` (in progress): approve loyalty value semantics and encode Rosy Rewards as executable, policy-driven fixtures.

## Next safe tasks

1. Approve or amend ADR-0004 recommendations for points value, award timing, refunds, expiry, rounding, guest identity, and negative balances.
2. Encode the approved policies as required domain configuration and executable Rosy Rewards fixtures.
3. Begin the tenancy schema only after Phase 1 tests and examples pass.

## Dependencies and blockers

- Docker is not installed on this Windows workstation; GitHub Actions is the verified Linux/Docker database runner.
- Direct Proxmox SSH currently fails: the public alias rejects the configured key and the VPN alias times out.
- The repository-wide open-source license needs owner approval; the WooCommerce plugin can independently use GPL-2.0-or-later.
- Proxmox host addresses, DNS, TLS issuer, backup target, and production credentials are intentionally absent.

## Decisions awaiting approval

- Repository license: recommended AGPL-3.0-or-later for the hosted platform; alternatives are Apache-2.0 or a split-license model.
- Product semantics in proposed ADR-0004; recommendations require explicit owner approval before balance-affecting code is implemented.

## Quality gate

`npm run check && npm run db:validate && npm run secrets:scan && npm run audit:prod`

See `docs/architecture/ADR/` and `RISKS.md`.
