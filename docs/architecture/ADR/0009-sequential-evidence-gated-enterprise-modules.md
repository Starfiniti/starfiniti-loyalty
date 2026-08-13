# ADR-0009: Deliver enterprise breadth as sequential evidence-gated modules

- Status: Accepted
- Date: 2026-08-13

## Context

The released product has unusually strong ledger, isolation, idempotency, and WooCommerce outage foundations but only partial loyalty-suite breadth. A single broad “finish the product” phase would mix value semantics, commercial controls, identity federation, customer delivery, and external-provider dependencies, making failures and rollback ambiguous.

## Alternatives

1. **Broad parallel feature build.** Faster apparent screen coverage, but contract and migration dependencies collide, incomplete UI can imply unsupported value behavior, and evidence cannot be attributed to one rollout.
2. **Sequential vertical modules with tenant canaries.** Deliver contracts, data, execution, UI, operations, and evidence together; allow only dependency-safe work to bypass an externally blocked production gate.
3. **Adopt a third-party loyalty core.** Adds breadth sooner but weakens ledger authority, self-hosted control, WooCommerce outage guarantees, and migration ownership.

## Decision

Use option 2. `docs/plan/ENTERPRISE_ROADMAP.md` and stable M00–M16 records in `docs/plan/TASKS.yaml` are authoritative for unfinished work. Each module must reach its measured gate before its dependent module starts. M02 may proceed while M01 awaits real-store access because its additive deployment/entitlement boundary does not depend on pilot value.

Feature flags and entitlements are database-authoritative. Incomplete production behavior is disabled by default and enabled first for the Starfiniti pilot. A commercial or rollout state may restrict new managed configuration, but it may never hide or destroy history, interrupt checkout, or block balances, releases, refunds, reconciliation, promised redemption, or exports.

## Security and integrity effects

The sequence keeps tenant, value, identity, and provider authority reviewable in the same slice. Scores cannot override deterministic cross-tenant, duplicate-value, data-loss, checkout-dependency, recovery, or critical/high security failures.

## Operations

Each module deploys disabled, is canaried for the Starfiniti tenant, is observed and reconciled, and records an explicit rollback trigger. External credentials delay the relevant production gate but not dependency-safe implementation.

## Consequences

- Merchant-visible breadth arrives in smaller complete slices instead of a shallow all-at-once interface.
- Contracts and migrations remain reviewable, additive, and rollback-aware.
- External credentials delay canaries but not the next safe repository slice.
- Documentation and evidence work is part of completion, increasing slice cost while reducing unverifiable claims.

## Migration and rollback

Disable the module for affected tenants, stop new writes through the server-authoritative flag, keep versioned readers and historical evaluation active, drain or inspect existing work, and forward-fix additive schema. Never delete ledger or audit evidence. Supersede this ADR only with measured evidence that another delivery topology preserves the same authority and rollback properties.
