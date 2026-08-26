# ADR-0056: Mirror managed billing without making Stripe loyalty authority

- Status: Accepted
- Date: 2026-08-26

## Context

M02 already makes PostgreSQL the deployment and entitlement authority. M14 must add Stripe Billing for Starfiniti-managed installations without adding payment enforcement, remote licence checks, or Stripe calls to self-hosted AGPL installations. Billing delay, duplication, disorder, outage, or delinquency must never hide accepted value, prevent refunds or reconciliation, interrupt WooCommerce checkout, block exports, or break promised reward redemption.

Stripe's current webhook guidance says delivery can be duplicated and out of order, requires the unmodified raw request body for signature verification, recommends asynchronous processing, and recommends retaining processed event IDs. Subscription behavior is asynchronous and includes separate subscription and invoice events. Checkout and Customer Portal sessions are server-created, short-lived provider capabilities. Meter events accept caller-supplied identifiers but Stripe documents only a rolling duplicate-enforcement window, so Starfiniti must retain permanent local source-fact idempotency. Test clocks exercise subscription transitions but have documented limits and cannot replace local deterministic lifecycle tests.

## Alternatives

1. **Read Stripe directly for every capability decision.** This is commercially convenient but lets provider latency, outage, account configuration, and event disorder become product authorization. It also creates a remote dependency that is unacceptable for self-hosted installations.
2. **Store an append-only normalized billing mirror in PostgreSQL and derive effective commercial restrictions locally.** Webhooks and operator actions contribute versioned evidence, while entitlements and protected loyalty paths remain database-authoritative.
3. **Copy the latest Stripe object into one mutable tenant row.** This is simple to query, but loses order/replay evidence, makes corrections unauditable, and lets a late older event silently overwrite newer state.

## Decision

Use option 2.

1. Provider construction is reachable only after the database deployment mode resolves to `managed`. The `self_hosted` branch returns a local non-commercial state before constructing any Stripe client or requesting any remote entitlement.
2. Provider customer and subscription references live only in `loyalty_private`. No card, payment-method, invoice-body, webhook-body, customer email, address, or payment instrument data is stored by Loyalty.
3. Current merchant state is derived from immutable normalized revisions ordered by the provider event creation instant, not delivery order. A stable provider-event identifier resolves equal-instant ties without trusting arrival order. A late older event remains evidence but cannot regress current state.
4. `past_due` is an observed provider state. An effective approved grace deadline yields local `grace`; after that deadline the local state becomes `suspended`. Only new managed growth and configuration may be restricted. Historical access and the six protected value paths remain available in every state.
5. The initial slice does not call Stripe. It establishes strict contracts, private references, immutable state evidence, live-member read projection, exact private retry behavior, provider-event replay fencing independent from caller idempotency keys, and a structural self-hosted provider bypass. Raw signature verification, the durable webhook inbox, checkout/portal sessions, metering, manual contracts, and production canaries follow in separate slices.
6. Production Price IDs remain externally supplied private configuration. Prices and Price IDs never appear in source-controlled catalogue definitions and their presence never grants capability access.

## Security and privacy effects

Browser and Auth claims provide no billing, plan, customer, subscription, organization, or entitlement authority. Authenticated users receive one minimized state projection only after a live PostgreSQL membership check. It contains booleans and bounded timestamps, not provider identifiers. Direct table access and private recording functions are denied to browser, runtime, worker, and anonymous roles until a later isolated worker boundary grants only the exact operation it needs.

The schema has no field capable of storing card or payment-method data. Logs and public error responses use bounded canonical codes and never include raw webhook bodies or provider credentials.

## Operations and rollback

Deploy every billing feature disabled. Self-hosted remains the upgrade default and needs no billing environment variables. Managed rollout begins with an externally approved sandbox catalogue and one tenant canary. Rollback disables new checkout, upgrade, and provider ingestion, appends a reviewed local state or manual-contract correction, and retains the provider inbox, normalized revisions, usage facts, invoice reconciliation, and tenant-visible history. Rollback never disables protected value paths or edits historical evidence.

## References

- [Stripe webhook delivery, ordering, replay, and signature guidance](https://docs.stripe.com/webhooks)
- [Stripe subscription webhook lifecycle](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe usage recording and meter-event idempotency](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api)
- [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions)
- [Stripe Customer Portal Sessions](https://docs.stripe.com/api/customer_portal/sessions)
- [Stripe Billing test clocks](https://docs.stripe.com/billing/testing/test-clocks)
