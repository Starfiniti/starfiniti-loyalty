# Enterprise integration review evidence

Date: 2026-08-27
Status: integration candidate verified; final evidence-record head CI pending
Scope: `origin/main...78bb5ed34f786a6cc1a13f1127ad59be8a7dc4aa`

## Review scope

The consolidated M04–M16 integration candidate contains 346 commits and changes 705 files. Five independent review axes covered unnecessary complexity, security, billing and metering, project idioms, and implementation cruft. Every blocker or should-fix candidate received a separate adversarial verification before implementation. No blocker survived review.

## Verified corrections

- Workforce SSO now refuses a missing or malformed PKCE flow ID and a missing exact flow verifier slot before constructing a Supabase client or attempting code exchange. Every server client and callback shares the explicit hostname-independent `sb-api-auth-token` storage namespace, preserving existing production cookies when the Supabase API hostname differs. A real SSR client configured with a non-`api` hostname proves it still emits the exact callback verifier slot; regression cases mock a successful legacy exchange and prove it is never called without that correlation.
- Managed Stripe customer, Checkout, and Portal orchestration now returns external redirect authority only when PostgreSQL's post-provider record reports the exact expected state. A concurrent actor, entitlement, or provider revocation leaves the immutable operation on hold and returns no redirect.
- The isolated usage-meter worker accepts only Stripe restricted keys (`rk_test_` or `rk_live_`); broad secret keys are rejected from both direct configuration and mounted files.
- Migration adapter byte and row limits now come from one immutable executable descriptor shared by the parsers and public support registry.
- Capacity, fault, and security closeout validators open completion artifacts without following the final symlink, require one stable regular file, and enforce explicit byte limits before allocating or parsing.
- Three historical Markdown whitespace defects and one stale recovery-gate count were corrected.

## Focused verification

- Dashboard Supabase server, workforce callback, proxy, and managed-session suites: 27 tests passed, including real non-`api` hostname storage-key emission.
- Billing usage worker suite: 7 tests passed against the restricted-key boundary.
- Migration adapter and registry suites: 16 tests passed.
- Dashboard, worker, and domain type checks passed.
- `npm run capacity:validate`, `npm run faults:validate`, and `npm run security:validate` passed their positive and adversarial fixtures.
- `npm run ci:validate` and `npm run db:validate` remain green for four CI jobs, three security jobs, 81 migrations, and 68 pgTAP files.
- Targeted Prettier and `git diff --check` pass.

The full local `npm run check`, independent database/secret/audit/licence gates, GitHub CI, Security workflow, external CodeQL, and mergeability checks passed for the integration candidate. The final evidence-record commit must repeat the exact-head remote checks before this evidence is finalized.

## Integration candidate evidence

- Draft integration PR: [#57](https://github.com/Starfiniti/starfiniti-loyalty/pull/57)
- Candidate head: `78bb5ed34f786a6cc1a13f1127ad59be8a7dc4aa`
- CI run `33082415376` passed baseline, both production containers, clean migration/seed/pgTAP replay, and all four minimum/current HPOS/legacy WooCommerce runtime cells.
- Security run `33082415262` passed CodeQL, isolated DAST, complete dependency audit, repository/image scanning, runtime enforcement, and SBOM generation.
- External CodeQL check `98553236301` passed.
- GitHub reported the candidate `CLEAN` and `MERGEABLE` with all eleven required checks green.

## Authority and remaining gates

These are repository-only corrections. Production remains on `v0.1.11` in global `self_hosted` mode. No Stripe key, provider request, deployment, WooCommerce checkout, tenant entitlement, customer, loyalty value, schedule, or public product claim changed. Real-store, disabled-deployment, canary, reconciliation, recovery, monitoring, penetration-test, elapsed M16 cadence, and approval gates remain open.
