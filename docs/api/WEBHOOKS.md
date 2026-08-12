# Webhooks

WooCommerce deliveries use a versioned JSON envelope over HTTPS, but the signature is verified against the exact raw body before JSON parsing.

## Required headers

- `X-Starfiniti-Delivery-Id`: immutable UUID generated once in the plugin outbox.
- `X-Starfiniti-Connection-Id`: public connection UUID.
- `X-Starfiniti-Timestamp`: Unix seconds used by replay policy.
- `X-Starfiniti-Nonce`: high-entropy per-delivery nonce.
- `X-Starfiniti-Key-Version`: signing-key version.
- `X-Starfiniti-Signature`: versioned HMAC-SHA-256 value.
- `Content-Type: application/json` and a supported contract version in the body.

The canonical signature input is newline-delimited after validating every identifier as a newline-free token. In order, it binds the signature version, request target, connection ID, delivery ID, timestamp, nonce, and raw-body SHA-256. The PHP connector and TypeScript receiver use this same frozen format.

## Receiver behavior

1. Enforce TLS, method, content type, bounded headers/body, and read timeout.
2. Resolve an active connection without exposing whether arbitrary IDs exist.
3. Check timestamp/key-version policy and verify HMAC in constant time.
4. Insert the verified delivery once and return `202` with a stable receipt. A valid duplicate receives the prior receipt.
5. Return retryable `5xx` only when acceptance was not durably recorded. Invalid signatures/schema/size receive non-retryable `4xx` reason codes without echoing secrets/body.
6. Normalize and apply effects asynchronously.

Acknowledgement never means points were applied; it means the delivery is durably accepted. Processing status is available through authenticated diagnostics.

## WooCommerce payloads

The strict v1 worker boundary accepts these value-bearing payloads:

- `commerce.order.status_changed`: a PII-free HPOS order snapshot. Only `completed` creates an award; other statuses are recorded as skipped.
- `commerce.order.refunded`: a refund ID plus the cumulative order/refund snapshot. Reversal uses the original immutable award evidence, cumulative rounding, and a full-refund cap.
- `commerce.coupon.captured`: `{ kind, reservationId, orderId }`. No email, coupon plaintext, or customer profile is accepted.

Malformed value facts are quarantined without logging their bodies. Retryable dependency failures use durable leases and bounded backoff; repeated failures become dead letters.

## Signed command polling

The same signature format protects `POST /api/v1/integrations/woocommerce/commands`. A connector sends either a `poll` request or an `acknowledge` request. Polling claims leased `woocommerce.coupon.issue` and `woocommerce.coupon.cancel` commands; acknowledgement records only a bounded outcome, opaque native reference, error code, and retry delay.

Issuance becomes `issued` only after a successful native WooCommerce acknowledgement. Cancellation releases points only after WooCommerce confirms the unused coupon was disabled. Command IDs, reservation IDs, outbox uniqueness, and ledger idempotency provide independent duplicate fences.

See `docs/architecture/EVENT_MODEL.md` and ADR-0007 for retries, ordering, outbox, dead letters, and reconciliation.
