# Starfiniti Loyalty PHP SDK

Dependency-free PHP 8.1+ client contract for the version 1 Service API and Standard Webhooks receiver profile. Composer PSR-4 autoloading is supported. `CurlTransport` is included; applications can inject their own `Transport` implementation, including a PSR-18 adapter.

- Store `sflt_v1_…` and `whsec_…` only in server-side secret storage.
- Use a stable idempotency key for each customer or activity fact.
- Pass the exact raw request body to `WebhookVerifier` before JSON parsing.
- Implement `WebhookReplayStore::claim()` as one atomic insert of `webhook-id`.
- Return `2xx` only after durable acceptance.

The included transport verifies TLS, refuses redirects, bounds time and response size, and does not log requests, credentials, webhook payloads, or signatures.
