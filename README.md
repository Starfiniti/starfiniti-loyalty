# Starfiniti Loyalty

Open-source, self-hosted loyalty infrastructure for WooCommerce, built with Next.js and Supabase/PostgreSQL for deployment on Proxmox. Shopify is intentionally deferred.

## Current status

Phases 0 through 5 are implemented: the verified dashboard foundation, approved Rosy Rewards domain fixture, tenant/RLS model, signed WooCommerce ingestion/outbox, and immutable double-entry ledger all exist. Programme execution, the full merchant/customer product, production connector recovery, and real Proxmox deployment remain; see `STATUS.md` and `docs/plan/TASKS.yaml` for evidence.

## Prerequisites

- Node.js 24+
- npm 11+
- PHP 8.1+ for WooCommerce plugin checks
- Docker Engine/Desktop or Podman for local Supabase database verification

## Setup and verification

```sh
npm ci
cp .env.example .env.local
npm run check
npm run db:validate
npm run db:verify
```

`npm run db:verify` starts Supabase PostgreSQL, replays all migrations and `seed.sql`, executes pgTAP suites, and runs the two-session ledger concurrency/property probe. It leaves the local instance running for inspection. Clean it up with:

```sh
npm run db:stop
```

Start the dashboard with `npm run dev` and open `http://127.0.0.1:3000`.

## Safety

- Never place a Supabase secret/service-role key in `NEXT_PUBLIC_*` variables, browser code, WordPress, logs, or committed files.
- Local Supabase uses development credentials and must not be exposed to public traffic.
- Do not run linked database reset commands against production.
- Every tenant table exposed through the Data API must have RLS and adversarial tests.
- Every points movement is represented by an immutable, attributable, zero-sum ledger transaction.

Read `AGENTS.md`, `docs/product/MASTER_PLAN.md`, `PLANS.md`, and `STATUS.md` before changing behavior.

## License

The hosted platform, dashboard, and shared TypeScript packages are licensed under [GNU AGPL-3.0-or-later](LICENSE). The WooCommerce connector is distributed separately under GPL-2.0-or-later, as declared in its plugin header and Composer metadata.
