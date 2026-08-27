# ADR-0034: Sign generic webhooks with endpoint-bound HMAC and pinned public destinations

- Status: Accepted
- Date: 2026-08-24
- Scope: M08-S04 generic outbound notification webhooks

## Context

Merchants need a provider-neutral escape hatch for strict Starfiniti notification events. Delivery must be useful across common PHP, JavaScript, and integration platforms without allowing a tenant-controlled URL to become an SSRF primitive or making an external receiver part of loyalty value processing.

Official material reviewed on 2026-08-24:

- https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
- https://www.rfc-editor.org/rfc/rfc9421.html
- https://www.rfc-editor.org/rfc/rfc9530.html
- https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

Standard Webhooks defines a compact HMAC-SHA256 profile over the exact bytes `webhook-id.webhook-timestamp.body`, stable event identity across retries, timestamp replay checks, multiple signatures during rotation, 2xx success, no redirect following, `410` endpoint retirement, `429` throttling, and bounded retry guidance. RFC 9421 plus RFC 9530 provide a more general standards-track HTTP-component and content-digest framework, but require a larger verifier profile and structured-field implementation than the locked HMAC requirement needs. OWASP requires dynamic webhook targets to reject non-public resolutions, validate protocols, and disable redirects; hostname validation alone does not prevent DNS rebinding.

## Decision

1. Generic delivery is a separate optional `webhook` worker mode. It never runs in the value, SMTP, or Klaviyo worker and cannot gate commerce ingestion, checkout, ledger, refunds, reconciliation, balances, or customer access.
2. Version 1 follows the Standard Webhooks symmetric profile: a unique per-endpoint 24–64 byte secret serialized as `whsec_` plus base64, HMAC-SHA256 over the exact transmitted `delivery-id.timestamp.minified-json`, and `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers. Delivery identity is stable across retries; timestamp is regenerated per attempt.
3. PostgreSQL stores only current and optional previous secret SHA-256 fingerprints. One isolated worker is configured for one endpoint UUID and the matching mounted absolute secret file(s). Every claim and dispatch authorization rechecks endpoint, tenant, fingerprints, active state, subscription, entitlement, consent, lease, and exact destination before returning an event.
4. Rotation sets a current fingerprint and a time-bounded previous fingerprint. During overlap, the worker emits both `v1` signatures in the same header. After the database overlap expires, claims using the previous key fail closed and the previous secret must be removed from the worker mount.
5. Production destinations require HTTPS, default port 443, no credentials, query, or fragment, and an exact configured allowed origin. Immediately before each call the worker resolves every A/AAAA result, rejects the destination if any answer is loopback, private, link-local, multicast, documentation, benchmark, unspecified, or otherwise non-public, and pins the request socket to one validated address while retaining the original TLS hostname. Redirects are never followed. Explicit test mode permits only loopback HTTP with an exact loopback origin.
6. Each active endpoint has an allowlisted set of the nine versioned event types. PostgreSQL creates at most one private delivery per endpoint/event. Authorization projects only `NotificationEventV1`: opaque public resource IDs, event metadata, and the strict payload. It never returns email, phone, coupon plaintext, ledger metadata, provider bodies, source references, or database IDs. The exact UTF-8 body must remain at or below 20 KiB.
7. Customer events recheck the current purpose preference immediately before disclosure. Transactional delivery defaults to subscribed only when no preference exists; marketing defaults to unsubscribed. Merchant-operational events require no customer contact. Disabling the notification entitlement holds new action without deleting queued or historical evidence.
8. A database fixed-window limiter serializes claims per endpoint and caps configured throughput from 1 to 600 attempts per minute. The worker also bounds batch size, request timeout, and response bytes.
9. Any 2xx response completes delivery. `410` dead-letters the delivery and disables future endpoint work. `408`, `425`, `429`, `500`–`599`, DNS/connection failure, timeout, and ambiguous connection loss retry because the stable webhook ID is the receiver idempotency key. Other 3xx/4xx outcomes dead-letter. `Retry-After` is honored up to one day. Ten attempts is the hard ceiling and transitions to manual review.
10. Attempt evidence is append-only and contains only phase, status/error class, response code, bounded retry delay, timings, and worker reference. Raw response bodies, request bodies, destinations, contacts, secrets, and signature values are not persisted or logged.

## Alternatives

1. **RFC 9421 HTTP Message Signatures with `Content-Digest`.** Standards-track and flexible, but rejected for V1 because it creates a materially larger cross-language verifier surface than the required HMAC webhook profile. It remains a compatible future version, not an undocumented change to V1.
2. **Ed25519 Standard Webhooks signatures.** Safer key distribution for untrusted consumers, but deferred because the approved interface explicitly requires HMAC and ubiquitous merchant tooling already supports HMAC-SHA256.
3. **A custom `X-Starfiniti-Signature` scheme.** Rejected because it would duplicate a reviewed interoperable profile and make rotation/replay handling less predictable.
4. **Store signing secrets in PostgreSQL.** Rejected because database or backup access must not imply receiver impersonation.
5. **Validate the hostname once and use ordinary fetch.** Rejected because DNS rebinding can change the connected address after validation, and fetch may follow redirects unless every call is configured correctly.
6. **Retry with a new delivery ID.** Rejected because ambiguous attempts would defeat receiver idempotency and can duplicate downstream effects.

## Security and integrity effects

The worker role has no direct table access. Narrow security-definer commands derive all authority from one endpoint-bound lease and matching non-secret fingerprints. RLS is enabled with no public policies. DNS validation and socket pinning protect the internal network even when an authorized tenant supplies the destination. HMAC authenticates exact bytes but does not encrypt them, so production is HTTPS-only.

Webhook delivery observes immutable notification facts and current consent; it cannot create or change loyalty value. A receiver must reject stale timestamps, compare HMAC values in constant time, and persist `webhook-id` as an idempotency key.

## Operations

The Compose profile remains disabled. Provision one endpoint with a reviewed HTTPS origin, allowlisted event types, rate limit, unique generated secret, and fingerprint; securely give the `whsec_` value to the receiver and mount it read-only into only that endpoint worker. Monitor pending/retryable age, rate-limit delays, DNS-policy failures, `410`, dead letters, manual reviews, and post-authorization lease expiry.

The local sink gate must verify exact body/signature bytes, timestamp tolerance, stable ID replay, two-key rotation, no redirects, `Retry-After`, timeout, DNS/public-address enforcement, consent withdrawal, endpoint/key mismatch, entitlement rollback, bounded payload/response handling, and simultaneous checkout/value-worker health.

## Migration and rollback

Deploy additive private endpoint, delivery, attempt, and limiter state with no endpoint row and no running `webhook` profile. Activation and secret distribution are separate operator actions.

Rollback stops the endpoint worker or disables the endpoint/entitlement. Provider-neutral events continue to append, accepted deliveries remain immutable, and queued work is held without disclosing payload. Rotation never deletes evidence. A forward fix can resume work with the same delivery IDs; manual-review outcomes require receiver reconciliation before replay.
