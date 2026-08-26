# ADR-0057: Verify exact Stripe bytes before isolated lifecycle normalization

- Status: Accepted
- Date: 2026-08-27

## Context

M14-S01 established a database-authoritative commercial-state mirror but deliberately granted no runtime a way to record provider evidence. Stripe webhooks are duplicated, delayed, retried with fresh signature timestamps, and not guaranteed to arrive in order. Stripe requires signature verification against the unmodified request body and documents a five-minute default tolerance. A public receiver therefore cannot parse, transform, persist, or log the body before authenticity is established, and an acknowledged event cannot depend on synchronous lifecycle work.

The deployment boundary is equally important. Self-hosted AGPL installations must not need a Stripe secret or external entitlement call. Managed rollout is tenant-scoped and database-authoritative; a browser header, provider customer ID, or signed Stripe payload cannot choose an organization or enable billing.

## Alternatives

1. **Verify and apply subscription state in the HTTP request.** This minimizes tables but couples acknowledgement to locks and lifecycle processing. Worker or database contention would cause avoidable Stripe retries, and there would be no independent recovery lease.
2. **Persist the raw Stripe event, then verify or parse it later.** This preserves provider detail but stores untrusted contact, metadata, invoice, and payment-shaped data and creates a long-lived sensitive payload.
3. **Verify exact bounded bytes in memory, store a strict minimized immutable receipt, then normalize through an isolated database-owned lease.** Receipt identity and content digest fence replay; a separate worker rechecks entitlement immediately before any commercial-state effect.
4. **Use the full Stripe Node client only for webhook HMAC.** The official helper is valid, but constructing a provider client requires unrelated API configuration and adds a broad provider surface to a route that needs only Stripe's documented HMAC-SHA256 algorithm. A narrow verifier is easier to keep behind the self-hosted early return and is covered by official-format rotation, tamper, skew, and raw-byte fixtures.

## Decision

Use option 3 with the narrow verifier from option 4's comparison.

1. `get_managed_billing_webhook_gate_v1` is the first request operation. In `self_hosted`, or when no managed billing account is explicitly entitled, the route returns before reading the request body or signing-secret file.
2. The Node runtime reads at most 256 KiB. It accepts JSON media type, one ten-digit signature timestamp, and one to eight lowercase hexadecimal `v1` signatures. It verifies HMAC-SHA256 over `{timestamp}.{exact raw bytes}` with constant-time comparison and a five-minute tolerance.
3. Raw bytes and the `Stripe-Signature` header exist only in bounded request memory. PostgreSQL receives a SHA-256 body digest and a freshly constructed allowlisted projection. Raw body, signature header, contact, address, metadata, invoice body, payment method, card, and provider response are neither stored nor logged.
4. Supported subscription events retain customer/subscription identifiers privately plus bounded status and event-time evidence. Supported invoice events are observations only; they cannot assert subscription status, period, trial, entitlement, or tenant authority.
5. PostgreSQL derives the organization from the current private Stripe customer binding, then rechecks `managed.billing` against the binding's stable public subject. Exact `(provider, live mode, event ID)` retries return one receipt. Any content drift under the same event ID fails with SQLSTATE `23505`.
6. One immutable receipt creates one private mutable job. The isolated `billing` worker owns no Stripe secret or network client. Database functions lease up to 25 jobs for 15–300 seconds, reclaim expired leases, cap attempts at ten, and append immutable attempt outcomes.
7. Entitlement is checked at intake, claim, and immediately before normalization. Revocation after claim produces `held` evidence and no commercial-state effect. Subscription state is appended through the S01 event-time recorder; invoice observations never call it.
8. Provider event creation time, not delivery or processing order, determines the merchant-visible state. The intake and worker create no ledger, wallet, customer, programme, reward, coupon, connector, or checkout effect.
9. The endpoint and worker remain disabled in production. The dashboard secret mount defaults to `/dev/null`, the `billing` Compose profile is opt-in, and no Stripe API key, Price ID, customer, subscription, or network request is introduced by this slice.

## Security and privacy effects

The public response contains only a Starfiniti receipt UUID and `accepted` or `duplicate`; it never returns a Stripe identifier. Browser roles have no webhook command. The runtime can gate and accept but cannot claim, while the worker can claim and process but cannot accept internet input or directly read/update the private tables. All privileged functions have empty search paths and the private tables enable RLS with no application table grants.

Authenticity does not confer tenant authority: the signed customer reference must resolve to one current private account and enabled database entitlement. Changed replay, unknown account, invalid lifecycle shape, stale signature, oversized body, disabled mode, expired lease, and direct table mutation all fail closed. Transient database failure returns a retryable HTTP status or lets the private lease expire; it cannot alter loyalty value.

## Operations and rollback

Managed operators mount one owner-controlled webhook endpoint secret into the dashboard and explicitly start the isolated `billing` profile only after a sandbox endpoint and canary entitlement are approved. Secret rotation can temporarily expose multiple `v1` signatures in one Stripe header; changing the mounted file requires recreating the dashboard container. Stripe API keys do not belong in this slice.

Rollback closes the database entitlement or removes the optional worker profile. Existing receipts, jobs, attempts, and normalized revisions remain reconstructable. An ambiguous accepted receipt is reconciled from its event ID through a separately reviewed provider-fetch workflow; historical evidence is never edited. Self-hosted deployments require no action.

## References

- [Stripe webhook signature and raw-body guidance](https://docs.stripe.com/webhooks)
- [Stripe event object](https://docs.stripe.com/api/events/object)
- [Stripe event types](https://docs.stripe.com/api/events/types)
- [Stripe subscription object and statuses](https://docs.stripe.com/api/subscriptions/object)
