# ADR-0033: Bind managed Klaviyo delivery to one tenant and credential fingerprint

- Status: Accepted
- Date: 2026-08-24
- Scope: M08-S03 managed Klaviyo profile, event, and consent synchronization

## Context

ADR-0031 makes Starfiniti's immutable notification events and purpose-separated preferences authoritative. Klaviyo is useful for managed marketing automation, but its profile, event, suppression, and subscription APIs have different retry and authority semantics. In particular, Create Event deduplicates only by profile, metric, and `unique_id`; profile upsert is safe to repeat; unsubscribe is a convergent restriction; and subscribe can remove provider suppressions or send double-opt-in mail. A network failure after a subscribe request therefore cannot be treated like a generic retry.

Klaviyo private keys are account-scoped. A worker configured with the wrong tenant selector could otherwise export one tenant's contact to another tenant's provider account. The database must bind a non-secret key fingerprint, organization, and provider connection before returning any contact.

Official material reviewed on 2026-08-24:

- https://developers.klaviyo.com/en/docs/api_versioning_and_deprecation_policy
- https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
- https://developers.klaviyo.com/en/reference/create_or_update_profile
- https://developers.klaviyo.com/en/reference/create_event
- https://developers.klaviyo.com/en/reference/events_api_overview
- https://developers.klaviyo.com/en/docs/collect_email_and_sms_consent_via_api
- https://developers.klaviyo.com/en/reference/bulk_subscribe_profiles
- https://developers.klaviyo.com/en/reference/bulk_unsubscribe_profiles
- https://raw.githubusercontent.com/klaviyo/openapi/main/openapi/stable/apis/bulk_subscribe_profiles.json

The selected stable API revision is `2026-07-15`. Klaviyo documents `202` as accepted for asynchronous processing rather than proof of downstream completion, `429` with `Retry-After`, and bounded backoff for transient service errors. Bulk subscribe explicitly removes `UNSUBSCRIBE`, `SPAM_REPORT`, and `USER_SUPPRESSED` suppressions.

## Decision

1. Klaviyo runs as a separate optional worker mode. It is never initialized by the value worker or the self-hosted SMTP worker, and no provider result can gate commerce ingestion, ledger changes, refunds, reconciliation, customer access, or WooCommerce checkout.
2. The adapter pins revision `2026-07-15`. Production uses only `https://a.klaviyo.com/api`; an HTTP loopback base is permitted only under an explicit test-mode guard. The private API key is read from an absolute mounted file and never stored in PostgreSQL, environment values, browser code, WordPress, logs, or attempt evidence.
3. A private connection row binds one managed organization to the SHA-256 fingerprint of one private key, the pinned revision, and an optional reviewed list ID. Every claim and authorization presents the connection UUID and key fingerprint. PostgreSQL verifies both before resolving contact, preventing an accidental organization/key mismatch from exporting data.
4. Notification events and the current marketing preference event project idempotently to private operations. Claims contain only public operation identity, kind, and lease expiry. Authorization rechecks the exact connection, managed deployment mode, current `notifications` entitlement, active customer/link, verified Auth email, and the event's current purpose preference immediately before any provider call.
5. Profile upsert sends only verified email and the opaque Starfiniti customer UUID. The returned Klaviyo profile ID is stored as a tenant-scoped projection; email is not. A conflicting provider ID stops for review rather than silently remapping a customer.
6. Event sync sends only the strict provider-neutral event allowlist, the original occurrence time, metric name, and immutable notification event UUID as `unique_id`. Exact retries are safe under Klaviyo's documented profile/metric/unique-ID deduplication tuple. `202` records provider acceptance, not delivery or flow completion.
7. Only `loyalty_marketing` preference changes create consent operations. An operation is authorized only when it is still the preference projection's latest event. Older work terminates as superseded. Local `suppressed` never calls subscribe or unsubscribe.
8. Before subscribing, the worker reads the profile's current email-marketing subscription fields. Any global/list suppression, `UNSUBSCRIBED` consent, or `can_receive_email_marketing=false` is recorded through the existing provider-suppression command and blocks subscribe. Bulk subscribe is used only for a fresh, exact local customer opt-in; it never sets `historical_import` or `consented_at`. An ambiguous outcome after subscribe authorization stops in manual review and is never automatically retried.
9. Local unsubscribe uses Klaviyo's global email-marketing unsubscribe without a list relationship. This is intentionally restrictive and convergent, so an ambiguous network result may safely retry. A later customer opt-in still passes the provider-suppression preflight and cannot automatically clear a provider-origin suppression.
10. Explicit `429` honors bounded integer `Retry-After`; `500`, `502`, `503`, `504`, DNS/connection failures, and timeouts use bounded database backoff. Deterministic request/auth/contract failures dead-letter. Leases expiring after a possibly submitted subscribe enter manual review; event and unsubscribe operations may retry because their remote effects are deduplicated or convergent.
11. Provider bodies are read with a byte cap. Raw response bodies, provider error details, contacts, event bodies, and secrets are never persisted. Attempt evidence stores only bounded phase, status class/code, error code, timing, and worker reference.

## Alternatives

1. **One multi-tenant worker and one shared key.** Rejected because Klaviyo keys are account-scoped and a selector/configuration mistake becomes a cross-tenant disclosure.
2. **Store the private key in PostgreSQL.** Rejected because delivery data and database backup access should not imply provider-account access.
3. **Use Klaviyo as consent authority.** Rejected because application access and customer decisions must remain independently reconstructable, while provider suppression is still allowed to tighten delivery.
4. **Blindly subscribe whenever Starfiniti says subscribed.** Rejected because the endpoint removes serious provider suppressions and can send duplicate opt-in messages.
5. **Retry every ambiguous consent operation.** Rejected for subscribe because a request may already have removed suppression or sent a confirmation message. Accepted for unsubscribe because repeating a restriction converges on the same state.
6. **Send email directly through Klaviyo from value transactions.** Rejected because remote latency and outages cannot share an atomic boundary with loyalty value.

## Security and integrity effects

The worker role has no table access. Narrow security-definer commands derive organization, customer, event, preference, contact, and provider mapping authority from an exact owned lease. The migration-admin Auth bridge remains callable only by the NOLOGIN loyalty function owner. Credential fingerprints are one-way binding evidence, not authentication secrets. Tables use RLS with no public policies, immutable source/attempt evidence, and explicit revocations.

Klaviyo receives the minimum verified contact needed for a profile plus opaque public identifiers and strict event properties. It never receives ledger metadata, coupon plaintext, tenant selectors supplied by a browser, or raw internal database IDs. Provider acceptance never changes loyalty value.

## Operations

The `klaviyo` Compose profile remains disabled until a managed pilot organization, reviewed least-scope key, key fingerprint binding, optional list, and local/test sink pass. Required key scopes are `profiles:read`, `profiles:write`, `events:write`, `subscriptions:write`, and `lists:write` only when a list relationship is configured. Monitor pending/retryable age, rate-limit delays, profile conflicts, provider suppression imports, dead letters, manual reviews, and any post-authorization lease expiry.

The canary must reconcile every local event/preference, operation, attempt, provider profile, event `unique_id`, and consent job. It must cover withdrawal between claim and authorization, provider unsubscribe/suppression, exact retry, `429`, `503`, timeout, worker death before/after action authorization, disabled entitlement, wrong connection/key fingerprint, and simultaneous value-worker/checkout health.

## Migration and rollback

Deploy additive private tables, triggers, functions, contracts, and worker code with no active connection row and no running `klaviyo` profile. Connection activation and credential mounting are separate operator actions at the final gate.

Rollback stops the Klaviyo worker or disables the connection/`notifications` entitlement. New provider-neutral facts continue to append; queued work is held before contact disclosure. Provider profile IDs, immutable attempts, and terminal evidence remain for audit. No rollback calls subscribe, unsubscribe, deletes profiles, or rewrites local consent. Forward fixes can resume safe pre-action work; ambiguous subscribe outcomes require reconciliation first.
