# Billing authority contract

## Scope

`BillingSummaryV1` is the minimized merchant-readable projection for deployment and commercial state. It is not a payment API, subscription mutation API, or entitlement authority. PostgreSQL derives the organization from a public selector plus the authenticated user's current live membership.

M14-S01 makes no Stripe request and exposes no checkout, portal, webhook, or metering command. Those operations remain disabled until their own versioned contracts and production gates exist.

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

Recording is append-only and exact-idempotent. A matching retry returns the original public evidence selector. The same request key or provider event with changed normalized content fails with SQLSTATE `23505`. The provider event itself remains a replay fence even when a caller changes the request idempotency key.

## Error and privacy behavior

Unauthorized or cross-tenant reads return no row. The dashboard maps missing, multiple, malformed, or expanded responses to `billing_summary_unavailable` and shows no inferred commercial state.

No billing operation changes loyalty ledger, customer, programme, connector, coupon, or checkout state. Private records retain only bounded provider references and normalized lifecycle evidence; Loyalty stores no card or payment-method data.
