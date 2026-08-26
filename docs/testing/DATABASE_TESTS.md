# Supabase Database Verification

- Documentation reviewed: 2026-08-11
- CLI version: 2.113.0, pinned in `package.json` and `package-lock.json`
- PostgreSQL major: 17
- Primary references:
  - https://supabase.com/docs/guides/local-development/testing/overview
  - https://supabase.com/docs/guides/deployment/ci/testing
  - https://supabase.com/docs/guides/local-development/cli-workflows

## Complete local gate

```sh
npm run db:verify
```

This requires Docker or Podman. It starts only the Supabase PostgreSQL service, applies migrations and seed, performs a destructive local reset to replay the chain from scratch, runs every SQL file in `supabase/tests` through pgTAP, and executes the two-session ledger plus reward-capacity concurrency/property probes. It never links to or mutates a remote project.

Clean up local containers and their test volumes with:

```sh
npm run db:stop
```

## Current security baseline

`foundation_security_test.sql` proves that:

- application and private schemas exist;
- `PUBLIC`, `anon`, and `authenticated` cannot use the application schema before policies exist;
- `PUBLIC` cannot use the private schema;
- every application table in an exposed or candidate schema has RLS enabled;
- no application-owned security-definer function is placed in an exposed schema.

The last two checks are durable guards: they fail automatically when future migrations add an unsafe table or privileged function.

`immutable_ledger_test.sql` adds 91 assertions for tenant keys, RLS/grants, immutable zero-sum entries, idempotency conflicts, canonical-event effects, release/expiry/original attribution, FIFO allocation, mutually exclusive reservation resolution, negative refund balances, manual adjustments, export/liability reports, and wallet/lot projection rebuilds.

`merchant_overview_reporting_test.sql` adds 33 assertions for exact aggregate definitions, equal UTC periods, workspace/programme scope, large-integer preservation, private-source minimization, live role/revocation checks, and empty-tenant isolation. `customer_read_models_test.sql` adds 33 assertions for exact wallet/ledger values, database-side identifier masking, literal bounded search, indexed access, response minimization, group scope, revocation, and cross-tenant isolation. `initial_programme_onboarding_test.sql` adds 35 assertions for exact grants/search paths, owner/admin-only creation, server-derived tenant and actor, canonical bounds, retry/conflict behavior, duplicate slugs, suspended groups, revoked/cross-tenant denial, RLS-filtered audit visibility, and immutable audit evidence.

`customer_tier_read_model_test.sql` adds 27 assertions for exact privileges/search paths, one-row bounds, current versus qualified tier and grace semantics, exact eligible-spend values beyond JavaScript's safe range, honest unevaluated state, response minimization, live analyst access, and revoked/suspended/cross-tenant denial.

`initial_tenant_bootstrap_test.sql` adds 30 assertions for the deployment-only function boundary, absent browser/runtime/worker privileges, atomic tenant scope and owner creation, exact idempotent retry, changed-request and existing-slug denial, existing Auth identity, canonical inputs, minimized immutable audit evidence, and separation from authenticated programme launch.

`enterprise_access_catalogue_test.sql` adds 29 assertions for the immutable seven-profile catalogue, six exact membership roles, grant-only support, private tables/helpers, one-selector minimized projection, active-versus-suspended effectiveness, aggregate-count reconciliation, marketer least privilege, stale-JWT revocation, cross-tenant denial, and forged email/domain/group/role/organization-claim rejection.

`expanded_reward_fulfilment_test.sql` adds 90 assertions for V2 reward publication, entitlement denial, WooCommerce capability negotiation, atomic points/quantity/budget reservation, per-customer limits, native capture, manual-case role separation, exactly-once fulfilment capture, definitive-rejection compensation, uncertainty preservation, private source tables, immutable transitions, and tenant isolation.

`scripts/verify-ledger-concurrency.mjs` opens two independent PostgreSQL sessions. One holds an 80-point reservation on a 100-point wallet while the other competes for the same 80 points. Exactly one commits. It then runs 20 deterministic adjust/reserve/capture/cancel sequences with retry probes and verifies every transaction remains balanced and every projection remains exact.

`scripts/verify-reward-capacity-concurrency.mjs` opens two independent PostgreSQL sessions against one published V2 reward with one remaining global unit. Exactly one reservation commits, the losing transaction has no ledger/reservation/outbox residue, an exact retry remains idempotent, and the allocation counters reconcile to the accepted reservation.

## CI

The `database` job in `.github/workflows/ci.yml` runs the same `npm run db:verify` command on an Ubuntu Docker runner and always removes containers/volumes afterward. GitHub Actions and the Supabase CLI are pinned; no project credentials are required.

## Local limitation

The current Windows workstation has no Docker, Podman, or WSL. Static config/test validation passes through `npm run db:validate`; exact execution evidence comes from the disposable GitHub Actions Linux/Docker runner.
