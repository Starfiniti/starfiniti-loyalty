# ADR-0114: Billing replay, subscription, and usage safety

- Status: Accepted
- Date: 2026-08-31
- Module: M14-S03 and M14-S04
- Supersedes: ADR-0058 for session replay and subscription uniqueness; ADR-0059 for occurrence time, message qualification, and provider-attempt accounting

## Context

The repository review found four deterministic gaps in the disabled managed-billing candidate. Stripe may prune an idempotency result after at least 24 hours, so replaying an unresolved Checkout request indefinitely can create a new provider object. A database customer binding does not by itself prevent two live subscriptions. Usage claims were consuming the ten-attempt provider budget before any network request, and order usage could inherit ingestion time rather than the canonical event occurrence. Finally, a Klaviyo operation completed after HTTP acceptance is not evidence that a message was delivered. Exact Linux replay then exposed a fifth rolling-upgrade gap: V2 recovery could overwrite the only durable identity of an authorized V1 claim after earlier V1 policy holds.

The earlier immutable operation, source-fact, webhook-authority, self-hosted, and checkout-independence decisions remain sound. This decision narrows their retry and measurement semantics without rewriting accepted history.

## Options considered

### Keep stable idempotency keys forever

This is simple, but it assumes provider duplicate enforcement beyond Stripe's documented retention and can create a second customer or Checkout Session after an ambiguous old request.

### Create a new provider request after every local timeout

This restores interactivity quickly, but it abandons the durable operation fence and makes duplicates the normal recovery path.

### Bound exact retry, serialize subscription creation, and require explicit reconciliation

The database retains one operation and stable keys, authorizes exact provider retry for at most 23 hours, and then records `reconciliation_required`. Checkout reservation and immediate pre-request authorization serialize per organization and reject a current live subscription. An owner-only reconciliation command appends minimized immutable evidence before an operation can be resolved.

## Decision

1. Session V2 functions are the runtime authority. An exact customer or session request may be retried only before its stage-specific 23-hour deadline. At or after the deadline, unresolved authority is removed and the operation becomes `reconciliation_required`.
2. Reconciliation is a private owner-role operation. It records an immutable decision and bounded provider-resource presence without storing redirects, responses, contact, payment, or secret material. Exact retries converge and changed decisions fail closed.
3. Checkout reservation and immediate provider authorization use the same organization advisory lock. Both recheck the current normalized subscription. A second non-cancelled provider subscription identity for one organization is rejected by a database constraint trigger.
4. The Stripe account used for a canary must also enable the provider's one-subscription limit. The database fence is authoritative locally; the provider control is independent defense in depth.
5. Usage V2 separates `claimSequence` from `providerAttempt`. Lease expiry, missing local configuration, entitlement change, and other pre-network policy holds do not consume the ten-attempt provider budget. `begin_managed_billing_usage_provider_attempt_v1` increments that budget immediately before the network send.
6. A worker crash after provider-attempt authorization is conservative: the attempt remains ambiguous and requires normal reconciliation instead of an unsafe blind replay.
7. Order facts use the canonical commerce event's `occurred_at` for eligibility and UTC period. Existing source fences keep V1 and V2 capture idempotent with one logical fact.
8. Message usage counts only immutable SMTP `delivered` evidence. Klaviyo HTTP acceptance or completed event synchronization is not delivery evidence and is excluded until a provider-neutral delivered-event contract exists.
9. Forced-RLS reconciliation and policy-hold tables have explicit `loyalty_owner` policies while runtime, browser, and general worker access remains denied. Their rows are immutable and create no loyalty-ledger effect.
10. V1 contracts and historical rows remain readable for compatibility. Current dashboard and worker paths use V2 authority and summaries.
11. The additive counter backfill and V2 claim recovery reconstruct completed V1 evidence while preserving a processing V1 claim's legacy counter. An expired authorized V1 claim advances the V2 claim sequence to that durable identity and consumes exactly one provider attempt; an expired pre-authorization V1 claim becomes immutable policy-hold evidence and consumes none. V1 lease creation and V2 counter normalization run as separate PL/pgSQL statements so PostgreSQL command visibility cannot strand a newly claimed row. A processing V2 claim is already normalized and is never double-counted.

## Consequences

An owner may need an approved provider read to resolve an operation after 23 hours instead of immediately starting another Checkout. This is deliberate: ambiguity is visible and cannot silently become duplicate commercial state. Provider-attempt counts now describe actual sends rather than local scheduling churn. A rolling worker upgrade may promote one expired V1 send to ambiguous evidence, but it cannot reset or multiply that send. Managed messaging usage is conservative until delivery can be proved, so provider acceptance will not inflate invoices.

## Rollback implications

Disable new managed session creation and stop the billing worker. Preserve V1/V2 operations, attempts, reconciliations, source facts, holds, and provider results. Do not downgrade the schema or resume old unlimited replay. A forward fix may add V3 contracts while keeping V1/V2 readers and immutable evidence. Subscription, entitlement, checkout, loyalty value, refunds, redemption, reconciliation, account access, and export remain webhook/database-authoritative and independent of session or metering availability.

## References

- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe limit customers to one subscription](https://docs.stripe.com/payments/checkout/limit-subscriptions)
- [Stripe subscriptions](https://docs.stripe.com/payments/subscriptions)
