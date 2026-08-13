# Entitlements API v1

## Authority

Entitlements are authorization facts, not browser preferences. PostgreSQL derives effective access from the current deployment version, catalogue version, tenant override, rollout evidence, and live organization membership. Auth/JWT metadata, provider Price IDs, and client-supplied plan names are not authority.

## Merchant read model

`loyalty.get_my_entitlements_v1(target_organization_public_id uuid, target_at timestamptz default now())` accepts a public organization selector, then independently requires the current Auth subject to have a live membership. Unknown, cross-tenant, and revoked access returns no rows.

Each bounded row contains:

- schema version `1`;
- organization public ID;
- `self_hosted` or `managed` mode;
- catalogue version and allowlisted capability key;
- effective boolean decision and protected-value-path flag;
- optional exact non-negative limit as decimal text;
- rollout basis points from 0 through 10,000;
- decision source;
- inclusive effective start and optional exclusive end.

No provider/customer/subscription ID, price, actor, reason, rollout seed, billing evidence, internal tenant ID, or other tenant data is returned.

## Server and worker decision

Trusted runtime roles call `loyalty_private.resolve_organization_entitlement` with an already-resolved internal organization and a stable subject. It returns the same effective decision. The function performs no network request. Only the read decision is granted; runtime and worker roles cannot configure modes, catalogue entries, tenant overrides, rollouts, or provider mappings.

## Compatibility

Capability keys and response schema are versioned. Catalogue changes are additive versions. Readers must fail closed for absent or invalid capabilities and preserve decimal limits as strings. A disabled capability stops only new feature-specific work; historical readers, value compensation, and protected paths remain available.
