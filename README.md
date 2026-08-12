# Starfiniti Loyalty

Open-source, self-hosted loyalty infrastructure for WooCommerce, built with Next.js and Supabase/PostgreSQL for deployment on Proxmox. Shopify is intentionally deferred.

## Current status

Phases 0 through 7 are complete for the active WooCommerce scope: the tenant/RLS platform, immutable double-entry ledger, versioned programme engine, signed asynchronous connector, recovery tooling, and supported WordPress/WooCommerce runtime matrix are execution-verified. Phase 9's authenticated merchant hub includes programme, customer, reporting, connector-operation, guided WooCommerce setup, hosted customer, accessibility, localization, and sanitized support surfaces. Real Proxmox deployment still requires the final production access and infrastructure inputs; see `STATUS.md` and `docs/plan/TASKS.yaml` for exact evidence.

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

## Release artifacts

Pull requests build both pinned Linux container images without publishing them. Pushing an exact `vMAJOR.MINOR.PATCH` tag runs the full baseline and disposable database gate, then publishes dashboard and worker images to GitHub Container Registry under both the version and commit-SHA tags. It also creates a GitHub release containing `starfiniti-loyalty.zip` and `SHA256SUMS`.

Production Compose must use the commit-SHA image tags (or resolved digests), not a floating tag. A release tag is created only after the target commit is approved and all required checks are green.

## Safety

- Never place a Supabase secret/service-role key in `NEXT_PUBLIC_*` variables, browser code, WordPress, logs, or committed files.
- Local Supabase uses development credentials and must not be exposed to public traffic.
- Do not run linked database reset commands against production.
- Every tenant table exposed through the Data API must have RLS and adversarial tests.
- Every points movement is represented by an immutable, attributable, zero-sum ledger transaction.

Read `AGENTS.md`, `docs/product/MASTER_PLAN.md`, `PLANS.md`, and `STATUS.md` before changing behavior.

## License

The hosted platform, dashboard, and shared TypeScript packages are licensed under [GNU AGPL-3.0-or-later](LICENSE). The WooCommerce connector is distributed separately under GPL-2.0-or-later, as declared in its plugin header and Composer metadata.
