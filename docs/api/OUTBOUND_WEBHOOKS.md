# Outbound notification webhooks

Starfiniti can deliver the strict `NotificationEventV1` envelope to a reviewed merchant endpoint without exposing contact data or coupling the receiver to loyalty value processing. Version 1 follows the symmetric Standard Webhooks profile.

## Request

The worker sends one HTTPS `POST` with `content-type: application/json; charset=utf-8` and these headers:

- `webhook-id`: stable Starfiniti delivery UUID; persist it as the receiver idempotency key.
- `webhook-timestamp`: Unix seconds for this attempt; reject values outside the receiver's reviewed tolerance.
- `webhook-signature`: one or two space-separated `v1,<base64>` HMAC-SHA256 signatures. Two signatures appear only during a bounded secret rotation overlap.

The signature input is the exact UTF-8 byte sequence:

```text
webhook-id.webhook-timestamp.raw-request-body
```

Decode the `whsec_` suffix from base64, calculate HMAC-SHA256 over the unparsed raw body, and compare each supplied signature in constant time. Do not parse and reserialize JSON before verification.

The body is exactly one `NotificationEventV1`. It contains only English event metadata, opaque public resource IDs, and the event-type-specific allowlisted payload. It never contains email, phone, coupon plaintext, ledger metadata, internal database IDs, signing material, source references, or a provider response. The maximum body is 20 KiB.

## Receiver behavior

Return any `2xx` only after the receiver has durably accepted the stable `webhook-id`. Retries keep the same ID and body but use a new attempt timestamp/signature. A receiver must therefore treat the ID as exactly-once application identity even when network ambiguity causes more than one POST.

- `2xx`: accepted; Starfiniti completes the delivery.
- `410`: endpoint permanently gone; Starfiniti disables it.
- `429`: temporary rate limit; include `Retry-After` in seconds or HTTP-date form.
- `408`, `425`, `500`–`599`, connection loss, DNS failure, or timeout: bounded retry with the same ID.
- Other `3xx`/`4xx`: terminal failure. Redirects are never followed.

After ten authorized attempts, work stops for manual review. A manual replay must first reconcile whether the receiver already accepted the stable ID.

## Supported receiver libraries

The repository ships two tested V1 receiver contracts:

- `@starfiniti/loyalty-sdk` for server-side TypeScript/Node.js.
- `starfiniti/loyalty-sdk` for PHP 8.1+ with Composer PSR-4 autoloading.

Both consume the exact raw body, require the three Standard Webhooks headers, enforce a configurable 1–900 second tolerance (300 seconds by default), compare HMAC bytes in constant time, validate the minimized event envelope only after the signature, and return the stable ID. Their `verifyAndClaim` helpers require an application-supplied atomic replay store. The shared vector is `packages/webhook-test-vectors/v1.json`.

Never acknowledge from an in-memory duplicate check. The replay store must atomically claim `webhook-id` and retain it through at least the accepted timestamp window; business handling may retain it longer.

## Event subscriptions and consent

Each endpoint has an explicit allowlist drawn from the nine `NotificationEventV1` event types. PostgreSQL creates at most one delivery for each endpoint/event and rechecks the subscription and `notifications` entitlement before every attempt.

Customer events also recheck the current purpose preference. Transactional events default to subscribed only when no preference fact exists; marketing defaults to unsubscribed. Merchant-operational events contain no customer subject. A claim never contains event or destination data; those are returned only by a last-moment authorized dispatch.

## Destination policy

Production accepts only the exact configured HTTPS origin on port 443, without credentials, query, or fragment. The worker resolves A/AAAA records for every attempt, rejects the entire destination when any answer is non-public, pins the socket to one validated address, retains the original TLS hostname, and never follows redirects. Loopback HTTP exists only in explicit local test mode.

Endpoint and attempt tables are private, RLS-enabled, and inaccessible to browser/runtime/worker table roles. PostgreSQL stores only secret fingerprints. Raw requests, response bodies, destinations, signatures, contacts, and secrets are excluded from attempt evidence and logs.
