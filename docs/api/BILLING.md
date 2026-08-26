# Billing authority contract

## Scope

`BillingSummaryV1` is the minimized merchant-readable projection for deployment and commercial state. It is not a payment API, subscription mutation API, or entitlement authority. PostgreSQL derives the organization from a public selector plus the authenticated user's current live membership.

M14-S02 adds one disabled managed-only webhook intake boundary. It makes no outbound Stripe request and exposes no checkout, portal, price, invoice, or metering command. Those operations remain disabled until their own versioned contracts and production gates exist.

## Read contract

The dashboard calls `loyalty.get_my_billing_summary_v1(organization_public_id, evaluated_at)` through an authenticated Supabase server session. The RPC returns either no row or exactly one strict `BillingSummaryV1` object.

The response contains:

- schema and organization public identifiers;
- `self_hosted` or `managed` deployment mode;
- one of nine bounded commercial states;
- provider-link and subscription-presence booleans, never provider identifiers;
- whether new growth configuration is available;
- bounded lifecycle timestamps; and
- six literal-true protected access fields.

Unknown fields fail contract parsing. Provider customer, subscription, event, Price, invoice, payment, contact, card, and webhook-body data are never returned.

## State behavior

`self_hosted` returns before private provider evidence is read. It reports billing unavailable, unrestricted local configuration, no provider linkage, and no external billing dependency.

Managed mode starts as `unconfigured`. Immutable normalized provider revisions can produce `trialing`, `active`, `past_due`, `grace`, `suspended`, or `cancelled`. `contract_managed` is reserved for the reviewed manual-contract slice. Current state follows provider event creation time with a stable provider-event identifier tie-break; delivery order never decides authority.

Only new managed growth may be restricted. Balance reads, refunds, reconciliation, checkout independence, exports, and promised reward redemption are always available.

## Private recording boundary

`loyalty_private.record_managed_billing_account_v1` and `loyalty_private.record_managed_billing_state_v1` are security-definer functions with an empty search path. M14-S01 grants them to no browser, runtime, or general worker role.

Recording is append-only and exact-idempotent. A matching retry returns the original public evidence selector. The same request key, provider customer linkage, or provider event with changed normalized content fails with SQLSTATE `23505`. Provider customer and event identities remain replay fences even when a caller changes the request idempotency key.

## Stripe webhook intake V1

`POST /api/v1/billing/stripe/webhooks` accepts an exact raw Stripe JSON body no larger than 256 KiB. The runtime verifies the `Stripe-Signature` HMAC-SHA256 over the unmodified bytes, accepts one to eight `v1` signatures for rotation, and applies a five-minute clock tolerance. The database deployment/entitlement gate executes before body or secret access, so self-hosted and disabled deployments return without provider processing.

The supported event allowlist is:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`

The strict `StripeBillingWebhookEventV1` internal contract contains only schema version, provider event/object/customer/subscription identifiers, live mode, event type, subscription status, event/period/trial/signature instants, and a body digest. Subscription events require matching object/subscription identity and a reviewed status. Invoice events are observations and cannot assert subscription status, current period, or trial state. Unknown fields are discarded before the contract reaches PostgreSQL.

The public success response is strict `ManagedBillingWebhookReceiptV1`:

```json
{
  "receiptId": "10000000-0000-4000-8000-000000000001",
  "outcome": "accepted"
}
```

An exact retry returns the same receipt with `duplicate`. The response never includes a Stripe identifier. A signed unsupported event receives `204` only after signature verification. Safe error codes do not echo the request, signature, customer, subscription, invoice, database, or secret detail.

`loyalty_private.accept_managed_billing_webhook_v1` derives the organization from the current private provider-customer binding and rechecks `managed.billing`; it accepts no tenant, actor, plan, workspace, or entitlement selector. One event ID with identical minimized content returns one receipt, while changed content fails with SQLSTATE `23505`.

`loyalty_private.claim_managed_billing_webhooks_v1` and `process_managed_billing_webhook_v1` are available only to the isolated worker role. Claims are bounded and leased; processing rechecks entitlement, appends immutable attempt evidence, records subscription state through the existing S01 event-time boundary, and records invoice events without a state effect. The worker has no Stripe credential or provider client.

## Error and privacy behavior

Unauthorized or cross-tenant reads return no row. The dashboard maps missing, multiple, malformed, or expanded responses to `billing_summary_unavailable` and shows no inferred commercial state.

No billing operation changes loyalty ledger, customer, programme, connector, coupon, or checkout state. Private records retain only bounded provider references, digests, lease outcomes, and normalized lifecycle evidence; Loyalty stores no raw webhook body, signature header, contact, metadata, invoice body, card, or payment-method data.
