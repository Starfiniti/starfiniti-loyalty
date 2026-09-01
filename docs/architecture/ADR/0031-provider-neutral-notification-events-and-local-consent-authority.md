# ADR-0031: Provider-neutral notification events and local consent authority

- Status: Accepted
- Date: 2026-08-24
- Scope: M08 notification events, consent, suppression, delivery isolation, and provider boundaries

## Context

Loyalty value already produces durable programme, ledger, reward, tier, referral, campaign, connector, and billing facts. Providers need a minimized projection of those facts, but an SMTP server, Klaviyo account, or merchant webhook must never become the source of loyalty value, customer identity, or consent. Contact data, coupon material, raw commerce payloads, and ledger metadata also must not be copied into a generic event stream.

Current Supabase guidance recommends invoker functions by default and requires an empty `search_path`, explicit qualification, and narrow grants when a security-definer boundary is necessary. PostgreSQL documents `SKIP LOCKED` as appropriate for queue-like multi-consumer work, not general-purpose reads. Klaviyo's current Events API accepts a caller-supplied `unique_id` for retry-safe deduplication, returns `202` before downstream processing is guaranteed, and publishes endpoint-specific rate limits. Its current error guidance requires respecting `Retry-After` for `429`, retrying `429`/`503` with exponential backoff and jitter, and bounding payloads. Its subscription APIs can change consent or remove suppressions, so they cannot be treated as passive profile writes.

Documentation reviewed on 2026-08-24:

- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://www.postgresql.org/docs/current/sql-select.html
- https://developers.klaviyo.com/en/reference/create_event
- https://developers.klaviyo.com/en/reference/events_api_overview
- https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
- https://developers.klaviyo.com/en/reference/bulk_subscribe_profiles
- https://developers.klaviyo.com/en/reference/bulk_unsubscribe_profiles

## Decision

1. PostgreSQL owns an immutable, provider-neutral notification event log. Event types and payloads are versioned and allowlisted; arbitrary merchant properties are rejected. Events contain public resource references and exact nonnegative values only. They contain no email, phone, name, address, coupon plaintext, raw provider response, secret, or ledger metadata.
2. Customer purposes are separate: `loyalty_transactional` defaults enabled until the customer withdraws or a trusted suppression applies, while `loyalty_marketing` defaults disabled until explicit consent. `merchant_operational` is not a customer-marketing purpose.
3. Consent and suppression decisions are append-only. A small current projection is updated only through protected commands. Authenticated customer commands derive the customer and organization from an active Auth link; they never accept tenant, customer, channel, or provider authority.
4. Provider suppression is stronger than customer preference. A customer session may withdraw or grant ordinary consent but cannot clear a trusted suppression. Clearing a suppression leaves the purpose unsubscribed rather than silently restoring consent.
5. Delivery queues and adapters are downstream projections. Later slices must recheck current consent/suppression at a database-serialized dispatch authorization immediately before an external call. An authorization accepted before a later withdrawal is historical in-flight work; no authorization may be accepted after the withdrawal linearization point.
6. SMTP, Klaviyo, and signed webhooks receive adapter-specific minimized payloads generated late. Contact resolution is separate from immutable event evidence. Klaviyo calls will pin an explicit API revision, use the event public UUID as `unique_id`, treat `202` as provider acceptance rather than completed delivery, and honor provider retry guidance.
7. Provider outage, entitlement disablement, or adapter rollback can stop new delivery authorization without blocking event creation, checkout, ledger effects, refunds, reconciliation, balances, or customer access.

## Alternatives

1. **Reuse the WooCommerce command outbox as the canonical notification record.** This couples provider retries and contact payloads to a connector queue whose state machine and access model were designed for native WooCommerce commands. It also makes one provider's outcome look like the business event. Rejected.
2. **Make Klaviyo subscription/profile state authoritative.** This makes self-hosted operation depend on a managed provider and lets delayed or out-of-order provider state override local customer decisions. Rejected.
3. **Store rendered messages and contact addresses in the immutable event.** This simplifies adapters but expands breach and erasure scope and freezes unnecessary PII into long-lived evidence. Rejected.
4. **Call providers inside ledger or domain transactions.** This couples provider latency/outage to value processing and cannot atomically roll back a remote call. Rejected.

## Security and integrity effects

The event contract prevents arbitrary payloads from becoming a PII or secret side channel. Direct table access remains revoked and RLS stays enabled as defense in depth. Customer commands resolve active links from Auth and fail closed across tenants. Provider responses are reduced to bounded reason codes and references in delivery evidence; raw response bodies and secrets are never logged or stored in event payloads.

## Operations

Measure event age, consent-to-withdrawal latency, pending/retryable/dead-letter counts, provider acceptance latency, suppression counts, and duplicate prevention. Provider-specific queues use bounded leases and attempt ceilings. `429` honors `Retry-After`; transient retries use exponential backoff with jitter. Deterministic contract/authentication failures stop without a retry storm.

## Migration and rollback

Add event and consent structures before enabling any adapter. Existing point-expiry fences may dual-write a provider-neutral event while the old connector outbox row remains untouched for compatibility. Rollback disables event producers or dispatch authorization; it does not delete events, decisions, accepted delivery evidence, or loyalty value. Forward fixes may replay provider projections from immutable event IDs without bypassing current consent.
