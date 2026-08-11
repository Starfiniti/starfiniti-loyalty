# Agent Guide

## Required reading

1. `docs/product/MASTER_PLAN.md`
2. `PLANS.md`
3. `STATUS.md`
4. `RISKS.md`
5. Relevant ADRs and integration/security docs

## Layout

- `apps/dashboard`: Next.js merchant and platform UI
- `packages/domain`: pure loyalty rules; no platform dependencies
- `packages/contracts`: versioned API/event schemas
- `packages/database`: database types and repository boundary
- `supabase`: local config, seed, and versioned migrations
- `plugins/woocommerce`: thin GPL WooCommerce connector
- `infrastructure`: self-hosted Supabase and Proxmox deployment assets
- `docs/design/prototype-source`: approved visual and interaction specification

Shopify is deliberately deferred. Do not add Shopify runtime dependencies or implementation tasks unless the product owner reactivates that scope.

## Commands

- Setup: `npm ci`
- Local dashboard: `npm run dev`
- Complete baseline: `npm run check`
- CI workflow validation: `npm run ci:validate`
- Format/lint/types/tests/build: corresponding root npm scripts
- Migration validation: `npm run db:validate`
- Docker-backed migration/seed/pgTAP verification: `npm run db:verify`
- Stop and remove local Supabase test data: `npm run db:stop`
- Secret scan: `npm run secrets:scan`
- Production dependency audit: `npm run audit:prod`
- License inventory: `npm run licenses`

Docker/Supabase integration tests require Docker on Linux or CI. Discover Supabase CLI commands with `supabase --help`; never guess flags.

## Non-negotiable invariants

- Every value change is an immutable, attributable ledger transaction; corrections compensate rather than rewrite history.
- Duplicate or delayed commerce events create exactly one business effect.
- Tenant-owned tables use PostgreSQL RLS and adversarial isolation tests.
- Never expose a Supabase secret/service-role key to the browser or WordPress.
- WooCommerce remains a resilient connector; checkout must work when the central platform is unavailable.
- Do not merge customers by email alone or log secrets/personal data.

## Review and definition of done

Work one coherent task at a time. Tests must cover failure, tenancy, idempotency, and ledger effects where relevant. Run the smallest trustworthy checks during development and `npm run check` before handoff. A task is complete only with evidence in `docs/plan/TASKS.yaml`, updated plans/status/risks/scorecard/changelog as applicable, and an adversarial diff review.

Behaviour changes require updates to contracts, migrations, integration/API docs, tests, and the living plan. Material architecture decisions require an ADR with rollback implications.
