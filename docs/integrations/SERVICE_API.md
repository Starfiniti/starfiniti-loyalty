# Service API v1

## Supported clients

Use `@starfiniti/loyalty-sdk` for server-side TypeScript/Node.js or `starfiniti/loyalty-sdk` for PHP 8.1+. Both implement the exact customer and activity V1 routes, validate commands and bounded responses, send the opaque credential only as `Authorization: Bearer`, refuse redirects in the included transport, and expose retryable problem state without logging credentials or bodies.

The packages are maintained from `packages/sdk-typescript` and `packages/sdk-php`. Their executable contract gate is `npm run clients:validate`; the PHP and TypeScript webhook verifiers share `packages/webhook-test-vectors/v1.json`.

## Purpose and availability

The Service API lets a merchant backend synchronize opaque customer references and submit authoritative non-purchase activity facts. It is not a browser API and it cannot directly award points, choose a tenant, or select a wallet. PostgreSQL derives the organization, workspace, published ProgrammeDefinitionV2, connector, scope, entitlement, customer, and quota from the live credential. Accepted activities continue asynchronously through the canonical event, immutable evaluation, effect-receipt, and ledger path.

This capability is tenant-controlled by `ecosystem.api`. Disabling it stops new API growth but does not hide balances, alter accepted history, interrupt refunds/reconciliation, or affect WooCommerce checkout. The signed Merchant Activity API remains supported for existing purpose-bound integrations.

## Credentials

An organization owner/admin creates a service account under **Operations → Service accounts**, selects `customers:write` and/or `activities:write`, and sets a 10–6,000 request-per-minute quota. Credential issuance returns one token once:

```text
sflt_v1_<public-credential-selector>_<256-bit-base64url-secret>
```

Store the token in a server-side secret manager. Send it only over HTTPS as `Authorization: Bearer <token>`. Never put it in JavaScript shipped to a browser, a URL, analytics, logs, screenshots, support records, or source control. Starfiniti stores only a SHA-256 digest and a six-character hint; a lost token must be replaced through rotation.

Rotation accepts a 0–86,400 second overlap. Existing active credentials become retiring until that exact deadline. Revocation is immediate and should be tested before deleting the old secret from the sender.

## Synchronize a customer

`POST /api/v1/service/customers`

Maximum body size: 32,768 bytes. The strict JSON body is:

```json
{
  "version": "1",
  "externalCustomerId": "merchant-opaque-reference",
  "idempotencyKey": "customer:merchant-opaque-reference:v1",
  "correlationId": "75000000-0000-4000-8000-000000000001"
}
```

The external reference is control-character-free UTF-8, 1–200 characters. It is HMACed with a private random per-service-account pepper and is never stored as plaintext or matched to email/profile data. The response is `201` for a new customer or `200` for an existing/exact duplicate:

```json
{
  "version": "1",
  "customerId": "75000000-0000-4000-8000-000000000010",
  "outcome": "created",
  "correlationId": "75000000-0000-4000-8000-000000000001"
}
```

Retry the exact same body and idempotency key after a timeout. Reusing a key with different content fails with `409`.

## Submit an activity

Synchronize the customer first, then call `POST /api/v1/service/activities`. Maximum body size: 65,536 bytes.

```json
{
  "version": "1",
  "externalCustomerId": "merchant-opaque-reference",
  "eventId": "review:order-1842:line-1",
  "occurredAt": "2026-08-26T08:15:00Z",
  "source": "verified_product_review",
  "activityCode": "verified_product_review",
  "productId": "sku-1842",
  "categoryIds": ["category-12"],
  "idempotencyKey": "activity:review:order-1842:line-1",
  "correlationId": "75000000-0000-4000-8000-000000000002"
}
```

Allowed sources are `account_created`, `birthday`, `verified_product_review`, `referral`, and `custom_activity`. Built-in sources require the matching canonical `activityCode`. Only a verified product review may include product/category selectors and it requires a product selector. Browser self-reporting, review text, email, name, address, referral identity, points, rules, tiers, and unknown fields are rejected.

An accepted request returns `202`; it means the canonical event was durably accepted or recognized as a duplicate, not that value has already been awarded:

```json
{
  "version": "1",
  "receiptId": "75000000-0000-4000-8000-000000000020",
  "outcome": "accepted",
  "canonicalEventId": "75000000-0000-4000-8000-000000000021",
  "canonicalOutcome": "created",
  "correlationId": "75000000-0000-4000-8000-000000000002"
}
```

Retry an uncertain request with the exact same event, idempotency key, and body. Changed reuse fails closed; an exact replay creates no second customer, canonical event, evaluation, or ledger effect.

## Quota and errors

Successful responses include draft-compatible `RateLimit-Policy` and `RateLimit` headers. A `429` response includes `Retry-After`; use exponential backoff with jitter and the larger advertised delay. Header syntax may evolve as the IETF draft evolves, while the configured database quota remains authoritative.

Responses expose only a stable error code:

| Status | Code                               | Meaning                                                               |
| ------ | ---------------------------------- | --------------------------------------------------------------------- |
| 400    | `invalid_json`, `body_read_failed` | The bounded body could not be parsed.                                 |
| 401    | `invalid_credential`               | Token is malformed, unknown, expired, or revoked.                     |
| 403    | `insufficient_scope`               | Scope, account, connection, programme, or entitlement is unavailable. |
| 404    | `customer_not_found`               | Synchronize this account-scoped customer first.                       |
| 409    | `idempotency_conflict`             | A reused identity has different content.                              |
| 413    | `body_too_large`                   | The streaming body limit was exceeded.                                |
| 422    | `invalid_command`                  | Strict contract or temporal validation failed.                        |
| 429    | `rate_limited`                     | The credential's fixed-minute quota is exhausted.                     |
| 503    | `service_unavailable`              | A safe internal dependency failed; retry without changing the body.   |

Error responses do not reveal tenant, account existence, digest, database detail, customer mapping, raw identity, or loyalty state. Provider/API outage never needs a checkout retry because WooCommerce checkout has no synchronous Service API dependency.

## Deletion and compromise

For compromise, revoke the affected credential immediately, issue a replacement, update the sender, and verify the old token receives `401`. Do not delete accepted events or customer mappings; reconciliation and corrections operate through immutable evidence and compensating ledger effects. Organization export/offboarding and privacy erasure are governed by the M13 administrative workflow.

See ADR-0045 for the security, identity, quota, compatibility, and rollback decision.
