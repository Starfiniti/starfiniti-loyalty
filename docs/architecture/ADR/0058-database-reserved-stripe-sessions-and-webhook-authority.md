# ADR-0058: Reserve Stripe sessions in PostgreSQL and grant access only from webhooks

- Status: Accepted
- Date: 2026-08-27

## Context

M14-S02 can authenticate and durably normalize Stripe lifecycle events, but merchants cannot yet begin a subscription or administer an existing provider account. Checkout and Customer Portal return URLs are bearer-like, short-lived provider capabilities. A browser redirect proves neither payment nor subscription state, Stripe retains API idempotency results for a bounded period, and a provider request can succeed while the application loses its response. Self-hosted deployments must still return before API-key access or any Stripe request.

Only an organization owner may initiate a commercial session. The browser can name a public organization, public plan, and fresh operation UUID, but cannot supply a Stripe customer, Price, API origin, return URL, entitlement, or tenant authority. Production prices and Price IDs remain effective-dated private configuration outside source control.

## Alternatives

1. **Create sessions directly from browser-supplied Price and customer IDs.** This is simple, but makes the browser a commercial authority and permits cross-tenant or unapproved-price requests.
2. **Authorize and call Stripe entirely inside a server action.** This hides credentials, but a database/provider split can duplicate customers or sessions and leaves no durable reconciliation state.
3. **Queue every session through an asynchronous worker.** This gives durable retries but adds polling and delay to an interactive redirect whose provider response is normally immediate.
4. **Reserve an owner-scoped operation in PostgreSQL, call a narrow fixed-origin provider client synchronously with a stable provider idempotency key, then append the minimized outcome.** Ambiguous outcomes retain their fence for recovery, and no redirect or landing page changes access.

## Decision

Use option 4.

1. PostgreSQL stores an immutable effective-dated plan catalogue. Provider Price IDs, amount/currency/interval evidence, and live mode are private; the browser sees only strict public plan selectors and reviewed display fields. No price or Price ID is seeded from source.
2. A private runtime function accepts the verified Auth user UUID plus public organization, public plan when required, action, and operation UUID. It checks current `managed` deployment before provider configuration, then live owner membership, active organization, stable-subject `managed.billing` entitlement, effective plan/account state, and exact idempotency.
3. One private operation row owns stable provider idempotency keys for customer creation and Checkout or Portal creation. Exact retries return the same reservation; changed retries fail. Deterministic provider rejection, ambiguous transport/provider outcome, and success append bounded attempts without raw response, contact, card, payment method, invoice body, session URL, or API key.
4. Checkout creates or reuses one database-bound Stripe customer, uses exactly one effective recurring Price, quantity one, a server-owned canonical success/cancel URL, and a non-authoritative request reference. Portal requires the current private customer binding and a server-owned return URL.
5. The provider client is constructed only after PostgreSQL authorization. Production egress is fixed to `https://api.stripe.com`, requests pin reviewed version `2026-02-25.clover`, and test overrides require explicit test mode plus a loopback HTTP origin. The API key is read only from an absolute regular file, never from browser configuration, `.env`, logs, evidence, or a worker.
6. The public result is only an external HTTPS redirect after strict host and response-shape validation. Provider customer, Price, session, subscription, payment, and response details are never returned as application JSON or stored in public tables.
7. Checkout success and Portal return pages are informational. Commercial state and entitlements change only after the authenticated webhook inbox records and normalizes provider lifecycle evidence. A successful redirect never unlocks growth.
8. A provider timeout or ambiguous response does not create a second local operation. Retrying the same operation uses the same Stripe idempotency key; after the provider's bounded replay window, an unresolved operation requires reconciliation or a new reviewed operation. Session failure never affects loyalty value or WooCommerce checkout.
9. The entire boundary deploys disabled. Self-hosted mode reads no API key, constructs no client, and makes no provider request. Sandbox credentials and approved test Price IDs are canary inputs, not repository prerequisites.

## Security and privacy effects

Authentication alone is insufficient: PostgreSQL independently verifies owner membership and tenant entitlement for every reservation and completion. API credentials exist only in bounded server memory. Stored evidence contains opaque provider resource references only where reconciliation requires them and contains no session URL or payment/contact data. Direct table access remains denied and all privileged functions use an empty search path.

The canonical return origin is server configuration, so forwarded host headers and form input cannot create an open redirect. Provider responses are size/time bounded and accepted only from the fixed Stripe API origin. Redirect host validation prevents a compromised or malformed provider response from sending the owner elsewhere.

## Operations and rollback

Operators configure sandbox/live plans through a private reviewed command, mount the corresponding API key file, and enable only an approved tenant entitlement. Observe reservation/attempt outcome counts without logging provider IDs or URLs. Reconcile ambiguous operations before their provider replay window expires.

Rollback disables new session reservation or removes the API-key mount. Existing webhook intake, normalized commercial state, account access, exports, loyalty value, refunds, reconciliation, promised rewards, and WooCommerce checkout remain available. Historical operations and attempts remain immutable.

## References

- [Stripe Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe Customer Portal Session creation](https://docs.stripe.com/api/customer_portal/sessions/create)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe API versioning](https://docs.stripe.com/api/versioning)
- [Stripe Checkout redirect and webhook authority](https://docs.stripe.com/payments/checkout/custom-success-page)
- [Stripe Price object](https://docs.stripe.com/api/prices/retrieve)
- [Stripe Billing simulations and test clocks](https://docs.stripe.com/billing/testing/test-clocks)
