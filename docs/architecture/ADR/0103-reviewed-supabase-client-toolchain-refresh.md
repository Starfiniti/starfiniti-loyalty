# ADR-0103: Refresh the Supabase client and repository toolchain with an explicit Data API grant boundary

- Status: Accepted
- Date: 2026-08-29
- Owners: Engineering
- Affected modules: M15, M16

## Context

The repository pinned Supabase CLI 2.113.0, `@supabase/supabase-js` 2.112.3, and `@supabase/ssr` 0.12.4. The official releases available at review time are CLI 2.116.0, supabase-js 2.112.4, and SSR 0.12.5. PostgreSQL client `postgres` 3.4.9 is already current and is unchanged.

The client patches fix zero-timeout Auth lock handling, refresh rejection behavior, PostgREST code generation, Realtime custom logging, and ignored SSR Auth-storage configuration warnings. The CLI patch improves local lifecycle behavior and fixes stale connections and stdin overflow. Its material security boundary is that `auto_expose_new_tables` defaults to `true`. Supabase's official Data API security guidance documents explicit grants, RLS, and the risk that existing projects can automatically grant new public objects. RLS remains mandatory, but it is not a reason to accept unintended API grants.

This review changes repository dependencies and local/CI configuration only. It does not upgrade or recreate the live self-hosted Supabase stack, run a production migration, alter database grants, or change loyalty contracts or values.

## Considered approaches

### Keep the existing package set

Rejected. This leaves known client and CLI fixes unapplied, causes repository verification to drift from the reviewed current patch line, and does not make the automatic-grant default explicit.

### Upgrade without an explicit API grant boundary

Rejected. Accepting CLI 2.116.0's default would make future table grants depend on an upstream default. A migration can still require a deliberate grant, but a newly created object must not become API-reachable merely because the local tool changed.

### Use an exact patch refresh and disable automatic exposure

Accepted. The repository pins CLI 2.116.0, supabase-js 2.112.4, and SSR 0.12.5 with exact npm lockfile provenance. `supabase/config.toml` sets `auto_expose_new_tables = false`, keeps only `public`, `graphql_public`, and `loyalty` in the Data API schema list, and continues excluding `loyalty_private`. Explicit grants plus PostgreSQL RLS remain the authority boundary.

## Decision

1. Pin the three reviewed patch versions exactly and retain every CLI platform package and Supabase JS subpackage at its matching release.
2. Require repository Node `>=24.0.0`, which exceeds the Supabase JS package minimum of Node 22.
3. Require `auto_expose_new_tables = false` in both the Supabase configuration and database validation gate.
4. Validate official source identities, package provenance, transitive alignment, API schemas, task evidence, and false production authority with a network-free corruption test.
5. Treat an intentional future API grant as an additive migration with explicit grants, RLS, and adversarial tenancy tests. Do not use automatic exposure as a delivery shortcut.
6. Keep the production self-hosted stack at its separately reviewed version until an approved isolated upgrade rehearsal and deployment gate exists.

## Compatibility and Rollback consequences

The selected packages retain the existing browser/server client APIs used by the dashboard. There is no event, API, ledger, WooCommerce, programme, database migration, or customer-value contract change. Clean-install application and database verification must still pass before handoff, and Docker-backed replay remains exact-head CI evidence.

Rollback is atomic for the repository package set: revert CLI, supabase-js, SSR, their lockfile graph, and the candidate application artifact together if a regression is found. Keep `auto_expose_new_tables = false` during and after rollback; never restore implicit grants. Production stack rollback is outside this decision because production is not upgraded by this slice.

## Verification

Run `npm run continuous-improvement:supabase-runtime:validate`, `npm run db:validate`, the focused Auth/session tests, and the complete `npm run check` gate. Exact implementation `1b9a4d4767eb504b65b5e06d5d8e8ec444dd46c3` passed CI `33265165945`, Security `33265166008`, and external CodeQL check `99134053293` with all twelve required checks green. The immutable 5,932-byte evidence file `docs/plan/evidence/M16/runs/supabase-runtime-1b9a4d4-2026-08-29T172357Z.json` has SHA-256 `3826e55e239bb4a2f9a3ee6d3d3f3e7541c5de0572d0d53dcd552b3cccd21aa7` and binds 995 tests, all 87 migrations, 3,790 pgTAP assertions, 22 concurrency probes, both images/SBOMs/scans, DAST, internal and external CodeQL, and all four WooCommerce runtime jobs. Merge, release, deployment, live stack upgrade, production mutation, and reconciliation remain separate approvals.
