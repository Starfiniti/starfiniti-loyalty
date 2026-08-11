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

The canonical signature input is versioned and length-delimited so fields cannot be concatenation-ambiguous. It binds the HTTP method/path, connection, delivery ID, timestamp, nonce, and raw-body SHA-256. Exact format is frozen with cross-language PHP/TypeScript contract fixtures before connector traffic is enabled.

## Receiver behavior

1. Enforce TLS, method, content type, bounded headers/body, and read timeout.
2. Resolve an active connection without exposing whether arbitrary IDs exist.
3. Check timestamp/key-version policy and verify HMAC in constant time.
4. Insert the verified delivery once and return `202` with a stable receipt. A valid duplicate receives the prior receipt.
5. Return retryable `5xx` only when acceptance was not durably recorded. Invalid signatures/schema/size receive non-retryable `4xx` reason codes without echoing secrets/body.
6. Normalize and apply effects asynchronously.

Acknowledgement never means points were applied; it means the delivery is durably accepted. Processing status is available through authenticated diagnostics.

See `docs/architecture/EVENT_MODEL.md` and ADR-0007 for retries, ordering, outbox, dead letters, and reconciliation.
