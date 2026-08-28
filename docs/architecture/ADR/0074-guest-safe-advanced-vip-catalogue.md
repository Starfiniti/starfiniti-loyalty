# ADR-0074: Project advanced VIP truth into a guest-safe catalogue

- Status: Accepted
- Date: 2026-08-28
- Extends: ADR-0039
- Application fallback superseded by: ADR-0079

## Context

The English hosted guest page consumed the additive V2 presentation projection, but V2 retained only the legacy tier shape: name, minimum eligible spend, and points per major currency unit. A published advanced V2 tier policy may instead qualify by spend, earned points, order count, referrals, or verified activities under lifetime, rolling, or calendar windows and `all`/`any` expressions. Rendering every such tier as a spend threshold was therefore materially misleading. The empty state also said that VIP milestones were “coming soon,” even when the honest state was simply that the published programme had no VIP tiers.

The public boundary must remain anonymous, English-only, tenant-derived, bounded, and free of customer state or value authority. It must also survive migration-first rolling deployment without making a malformed new projection look like a valid old response.

Authoritative references reviewed on 2026-08-28:

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase breaking-change changelog](https://supabase.com/changelog?types=breaking-change)
- [PostgreSQL function security](https://www.postgresql.org/docs/17/sql-createfunction.html)

## Alternatives

1. **Change the V2 response in place.** This is compact but breaks strict V2 readers and removes a safe migration-first rollback path.
2. **Return the stored tier-policy document and interpret it in the browser.** This duplicates domain interpretation, exposes private selectors and benefit codes, increases the anonymous payload, and makes browser code responsible for deciding what is safe to display.
3. **Add a database-derived V3 public catalogue and retain V2/V1 compatibility.** PostgreSQL derives the exact published tenant scope and projects only the bounded customer-facing facts needed by the guest page. The application uses older projections only when the newer function is genuinely absent.

## Decision

Use option 3.

`loyalty.get_public_loyalty_experience_v3(uuid, uuid)` is an additive, stable, empty-search-path read function following the existing minimized public-RPC boundary. It accepts only public workspace and programme selectors. The function first obtains the safe English V2 document, then independently re-resolves one active workspace, linked programme group, active programme, and immutable published version before reading tier policy rows. It never accepts an organization, customer, channel, wallet, locale, tier, reward, actor, or value selector.

The V3 catalogue exposes:

- qualification period and downgrade grace;
- ordered public tier code and safe name;
- `all`/`any` entry operator plus exact metric and positive threshold;
- exact points-per-major-unit rate; and
- booleans for early access and exclusive reward availability.

It does not expose customer progress, internal IDs, retention/re-entry internals, activity-code selectors, reward codes, reward configuration, raw programme JSON, audit evidence, or ledger data. A verified-action threshold is therefore described as a count of “qualifying activities”; the private selector set remains outside the anonymous contract. A future customer-facing activity-label catalogue may add friendly action names through another versioned projection.

For legacy published tiers with no advanced policy, V3 synthesizes the equivalent lifetime/spend catalogue. The first ordered tier is the base level and later tiers retain their exact legacy spend thresholds. Strict contracts cap the catalogue at fifteen levels and twenty thresholds per expression, require PostgreSQL-bigint-safe positive values, require one base level, require entry criteria for later levels, reject unknown fields, and require the legacy tier list and catalogue order/name/rate to agree.

The server reads V3 first. It normalizes V2 or V1 only when PostgREST/PostgreSQL reports the V3 function as absent. Provider errors, duplicate rows, malformed V3, mismatched catalogues, unsafe values, and non-English legacy responses fail closed instead of silently downgrading. The guest page renders a responsive editorial progression rail with the qualification window, milestone expression, earning rate, and public benefit flags. A programme with no tiers now states that VIP tiers are not part of the published programme.

## Security, privacy, and reliability effects

- Anonymous callers retain execute-only access to one bounded function and no direct access to raw programme, policy, threshold, reward, customer, or ledger tables.
- The database derives tenant scope twice across the retained V2 boundary and exact published-version joins; mixed-tenant selectors, suspended workspaces, inactive programmes, and unpublished versions return no row.
- Raw private selectors cannot expand through browser input, JSON passthrough, or unsafe database names. Exact integers stay text-form and are never coerced through JavaScript `number`.
- The read is stable and creates no customer, audit, commerce, reservation, coupon, or ledger effect.
- V1 and V2 functions and contracts remain unchanged for old clients.

## Migration and rollback

Deploy the additive migration before the dashboard image. During that interval old applications continue using V2. After the application deploy, a node that reaches a database without V3 uses the strict V2/V1 normalization path only for the recognized missing-function codes.

Rollback the application reader and guest component to V2 while leaving the additive V3 function inert. Do not drop the function during a mixed-version rollout and do not edit published policies or historical programme versions. No rollback changes customer value, tier decisions, ledger history, reservations, native coupons, or WooCommerce checkout behavior.
