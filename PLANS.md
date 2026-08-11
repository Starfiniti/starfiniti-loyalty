# Execution Plan

## Objective

Finish Starfiniti Loyalty as an open-source, self-hosted platform on Proxmox using Next.js, PostgreSQL/Supabase, and a production WooCommerce plugin. Shopify is deferred, not removed from the long-term product model.

## Current phase

Phase 0 — repository bootstrap and reproducible engineering baseline.

## Evidence and completed work

- Repository discovery found only the approved design ZIP; there was no Git repository or application code.
- The master plan and complete design prototype are preserved in `docs/`.
- Current Supabase self-hosting and WooCommerce primary documentation was reviewed on 2026-08-11.
- npm workspaces were selected because npm 11 is available while the local pnpm shim is broken.
- A faithful responsive Overview route, standalone packaging, four unit tests, Supabase migration baseline, WooCommerce HPOS scaffold, and Proxmox deployment contract are implemented and verified.
- `design-qa.md` passed at 912 × 512 and responsive navigation passed at 390 × 844.

## Active work

- `P0-BOOTSTRAP` (blocked): execute the implemented Docker-backed Supabase CI/reset/seed/pgTAP gate on a real runner. The same missing-runtime condition has now been confirmed on three consecutive goal turns.

## Next safe tasks

1. Run the Linux/Docker Supabase integration job and complete Phase 0 only if it passes.
2. Resolve Phase 1 product decisions for points value, refund timing, expiry, identity, and negative balances.
3. Encode Rosy Rewards as executable domain fixtures.

## Dependencies and blockers

- Docker is not installed on this Windows workstation; container checks must run in CI or on the Proxmox Linux VM.
- Podman and WSL are also unavailable. Static validation passes, but it is not execution evidence for migration or pgTAP SQL.
- Git has no configured remote, `.mcp.json` is absent, and no Proxmox host or authenticated Supabase environment is available to this workspace.
- The repository-wide open-source license needs owner approval; the WooCommerce plugin can independently use GPL-2.0-or-later.
- Proxmox host addresses, DNS, TLS issuer, backup target, and production credentials are intentionally absent.

## Unblock requirements

Provide one non-production Linux execution target with Docker Engine and Compose: either a connected Git remote with CI enabled or SSH/access details for a Proxmox VM. The target must be authorized to run `npm run db:verify`; production credentials are not required. Phase 1 begins only after that command passes.

## Decisions awaiting approval

- Repository license: recommended AGPL-3.0-or-later for the hosted platform; alternatives are Apache-2.0 or a split-license model.
- Product semantics listed in Phase 1; none may be guessed in balance-affecting code.

## Quality gate

`npm run check && npm run db:validate && npm run secrets:scan && npm run audit:prod`

See `docs/architecture/ADR/` and `RISKS.md`.
