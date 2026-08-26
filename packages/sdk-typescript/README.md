# Starfiniti Loyalty TypeScript SDK

Supported server-side client for the version 1 Service API and Standard Webhooks receiver contract. It requires Node.js 20 or later.

- Keep `sflt_v1_…` and `whsec_…` credentials on the server.
- Use an idempotency key for every customer/activity command.
- Verify the exact raw webhook bytes before JSON parsing.
- Persist the stable `webhook-id` through `verifyAndClaimWebhookV1`; a successful claim must be atomic in your storage.
- Return `2xx` only after durable acceptance.

The client bounds response bodies, rejects redirects, maps API problems to `StarfinitiApiError`, and never logs a request, token, webhook body, or signature.
