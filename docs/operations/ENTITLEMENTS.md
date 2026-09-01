# Deployment modes and entitlement operations

## Safety contract

PostgreSQL is the only entitlement authority. Supabase Auth establishes the user identity, while live organization membership establishes tenant access. JWT plan, group, domain, or entitlement claims are ignored. The dashboard reads `loyalty.get_my_entitlements_v1`; server and worker code uses `loyalty_private.resolve_organization_entitlement`.

`self_hosted` is the migration default and performs no Stripe or remote-licence request. `managed` defaults new growth capabilities closed. Both modes always keep balance access, refunds, reconciliation, checkout independence, exports, and redemption of already-promised rewards enabled.

Provider Price IDs are commercial configuration, not authorization. Configure them with the private administration function; never commit production IDs or return them through the Data API.

## Operator workflow

Use the deployment administration database identity, never a dashboard/runtime/worker credential. Run changes in a transaction, use UTC effective times, and retain the returned public evidence ID in the change record.

1. Append `loyalty_private.set_deployment_mode(...)` when changing mode or catalogue.
2. For managed rollout, append `loyalty_private.set_capability_rollout(...)` at zero basis points.
3. Enable the approved tenant with `loyalty_private.set_organization_entitlement(..., 'enabled', ..., 'canary', ...)`.
4. Reconcile feature behavior and operational errors for that tenant.
5. Append 100, 500, 1,000, 2,500, 5,000, then 10,000 basis-point records only when the preceding cohort passes.
6. Use `loyalty_private.set_entitlement_provider_price(...)` for an externally supplied managed Price ID. This mapping never enables the feature.

Every record requires an actor reference, an 8–1,000 character reason, an effective start, and optionally an exclusive end. Tenant limits are non-negative PostgreSQL `bigint` values and are returned to JavaScript as text.

Customer-experience theme and English-copy mutations have an independent
table-level `storefront.experience` guard. A disabled decision makes the
merchant editor read-only while preserving existing presentation rows and all
customer/value reads. Operators must not remove this guard to work around a
managed rollout; append an attributed tenant entitlement or rollout decision
instead.

## Verification

Run `npm run entitlements:validate`, contract and dashboard tests, and `npm run db:verify`. The pgTAP suite proves RLS, exact limits, self-hosted defaults, managed fail-closed behavior, deterministic 0/100% rollout, explicit tenant canaries, storefront authoring denial and retained reads, forged-claim denial, revoked-member denial, cross-tenant isolation, private Price IDs, protected paths, and immutable history.

## Rollback

Append a tenant `disabled` decision or zero-percent rollout to stop new feature work. Never modify or delete prior evidence. Do not gate historical configuration, balances, refunds, reconciliation, exports, checkout, or already-promised rewards. If the rollout introduced a schema or execution defect, leave additive readers in place and forward-fix the implementation.
