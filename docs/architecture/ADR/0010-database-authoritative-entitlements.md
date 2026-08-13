# ADR-0010: Keep deployment and entitlement authority in PostgreSQL

- Status: Accepted
- Date: 2026-08-13

## Context

Managed tenants need commercial entitlements, limits, pilot canaries, and gradual rollout. Self-hosted AGPL installations must remain locally controllable without Stripe, a licence server, or another Starfiniti service. Entitlement failure must never remove accepted loyalty value or interrupt WooCommerce checkout.

## Alternatives

1. **Environment-only feature flags.** Simple and independent, but not tenant-scoped, effective-dated, or auditable; application replicas can disagree during rollout.
2. **PostgreSQL catalogue plus append-only deployment, rollout, and tenant evidence.** One authority is shared by the Data API and workers, can be tested with RLS, and has deterministic rollback history.
3. **Stripe or a remote licence service as live authority.** Commercially convenient, but provider latency or outage would enter product authorization and violate the self-hosted and value-preservation guarantees.

## Decision

Use option 2. Catalogue version 1 declares stable capability keys, exact optional limits, and separate self-hosted and managed defaults. Deployment mode, global percentage rollout, tenant override, canary, and private provider-price mappings are append-only effective-dated evidence. PostgreSQL computes the effective decision; browser input and Auth claims never grant a capability.

Self-hosted mode defaults locally implementable capabilities on and keeps `managed.billing` off. Managed mode defaults growth capabilities off until an explicit tenant override or deterministic rollout enables them. Provider price IDs are configured outside source and stored only in the private schema; their presence does not grant access.

Balance reads, refunds, reconciliation, checkout independence, exports, and promised reward redemption are protected value paths. Database administration functions reject attempts to disable or partially roll out those paths. Future feature commands must check the server-side decision before creating new feature-specific work, not use it to suppress historical reads or compensation.

## Security and integrity effects

Tenant reads require live database membership and expose only an effective, versioned snapshot. Direct writes are denied to browser, runtime, and worker roles. Workers can execute only the read decision. A forged plan, organization, or entitlement claim grants nothing. Exact limits cross the Data API as decimal text to avoid JavaScript precision loss.

## Operations

Deploy migrations before application code. The initial deployment record is `self_hosted`, so upgrading an existing open-source installation creates no remote dependency or commercial restriction. Operators use private database functions through the deployment administration connection, always recording actor, reason, and effective time. A managed launch starts at zero percent, enables a named tenant canary, observes its evidence, and then appends percentage expansions.

## Migration and rollback

Rollback appends a zero-percent rollout or a tenant `disabled` record for new growth behavior. Do not delete or update catalogue, deployment, rollout, provider, or tenant evidence. Keep protected paths and historical readers enabled, allow already-promised value to settle, and forward-fix additive schema. Returning a deployment to `self_hosted` is another attributed version, not a rewrite. Supersede this ADR if a new authority can prove equivalent local independence, tenant isolation, auditability, and value preservation.
