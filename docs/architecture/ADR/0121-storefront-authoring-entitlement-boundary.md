# ADR-0121: Enforce storefront authoring entitlement at persistence

- Status: Accepted
- Date: 2026-09-01
- Scope: M02 and M09 customer-experience authoring

## Context

The `storefront.experience` entitlement already controlled enhanced customer
projections and WooCommerce snapshots. Theme and English-copy commands still
wrote `experience_themes` and `experience_translations` without resolving that
capability. Role, tenant, input, idempotency, and audit checks remained intact,
but a managed organization whose capability was disabled could create another
presentation revision.

The later managed-billing growth trigger cannot replace this product decision.
It intentionally evaluates commercial restriction separately, permits safe
recovery, and does not reinterpret shared product tables. The dashboard also
rendered the editor as writable and translated every `42501` failure into a
role error, which obscured the actual rollout state.

## Options considered

1. Check only in the Next.js page and server actions. This improves the normal
   experience but remains bypassable by old clients or direct RPC calls.
2. Rewrite all four V1/V2 theme and copy commands. This can enforce the rule,
   but duplicates the same decision across compatibility interfaces and makes
   future writers easy to miss.
3. Add one table-level trigger to both authoring roots, with PostgreSQL deriving
   the organization and resolving `storefront.experience` before mutation.

## Decision

Use option 3. A private empty-search-path `SECURITY DEFINER` trigger validates
its exact relation and operation, derives a stable rollout subject from the
stored organization/workspace/programme-group identifiers, and calls the
existing database-authoritative entitlement resolver. It runs for inserts and
updates on both experience authoring tables and raises `42501` when the
capability is disabled.

The trigger retains a narrow trusted-role bypass for migrations and direct
database administration. Authenticated browser, dashboard runtime, and worker
commands do not bypass the decision, including when they enter through older
`SECURITY DEFINER` command functions. No browser field, Auth claim, Stripe
state, or provider response grants the capability.

The merchant page resolves the same snapshot, renders existing configuration
read-only when the capability is disabled or unavailable, and explains that
balances, history, redemption, and WooCommerce checkout are unaffected. A
stale submission receives a capability-specific error. Analytics is also added
to the persistent merchant navigation because its real route and reporting
surface were otherwise absent from the sidebar.

## Security and compatibility effects

- V1 and V2 command signatures, readers, rows, revisions, and audit evidence
  remain compatible.
- Self-hosted installations retain their locally controlled default-enabled
  behavior and make no Stripe or remote-licence call.
- Managed tenants fail closed for new theme/copy writes until an explicit
  tenant decision or deterministic rollout enables the capability.
- Disabling authoring does not delete or hide theme/copy history and cannot
  alter loyalty balances, ledger effects, coupons, refunds, reconciliation,
  exports, redemption, or checkout.
- pgTAP covers disabled V1/V2 writes, unchanged revision state, explicit canary
  enablement, later disablement, and readable retained configuration.

## Rollout and rollback

Deploy the additive migration before the dashboard. Keep the production tenant
disabled until the existing M09 canary gate has an approved release, recovery
point, real WooCommerce pilot, and observation window. Verify the effective
tenant snapshot before testing a theme or copy revision.

Rollback returns the page to read-only and removes only the two new mutation
triggers if they cause a verified compatibility defect. Retain the private
function, additive migration history, existing configuration, audit evidence,
customer projections, native coupons, and every loyalty-value path. Prefer a
forward fix after migration application.
