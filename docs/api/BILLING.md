# Billing authority contract

## Scope

`BillingSummaryV1` and `BillingSummaryV2` are minimized merchant-readable projections for deployment and commercial state. They are not payment APIs, subscription mutation APIs, or entitlement authority. PostgreSQL derives the organization from a public selector plus the authenticated user's current live membership.

M14-S03 adds disabled managed-only Checkout and Customer Portal session creation. M14-S04 adds managed-only immutable source-fact usage metering and a minimized tenant summary. Neither slice makes a provider request in self-hosted mode, exposes Stripe customer, meter, or Price identifiers to the browser, or treats a provider redirect, aggregate, or invoice as application authority.

## Read contract

The dashboard calls `loyalty.get_my_billing_summary_v2(organization_public_id, evaluated_at)` through an authenticated Supabase server session. The RPC returns either no row or exactly one strict `BillingSummaryV2` object. `get_my_billing_summary_v1` remains available with its exact 15-key response for old clients and rollback.

The response contains:

- schema and organization public identifiers;
- `self_hosted` or `managed` deployment mode;
- one of nine bounded commercial states;
- provider-link and subscription-presence booleans, never provider identifiers;
- whether new growth configuration is available;
- bounded lifecycle timestamps; and
- six literal-true protected access fields.

V2 adds exactly three fields: `stateSource` (`self_hosted`, `unconfigured`, `provider`, or `manual_contract`), a bounded `restrictionReason`, and an optional current `contractEndsAt`. It does not add private approval or provider evidence.

Unknown fields fail contract parsing. Provider customer, subscription, event, Price, invoice, payment, contact, card, and webhook-body data are never returned.

## State behavior

`self_hosted` returns before private provider evidence is read. It reports billing unavailable, unrestricted local configuration, no provider linkage, and no external billing dependency.

Managed mode starts as `unconfigured`. Immutable normalized provider revisions can produce `trialing`, `active`, `past_due`, `grace`, `suspended`, or `cancelled`. A current approved local contract produces `contract_managed`. Current provider state follows provider event creation time with a stable provider-event identifier tie-break; delivery order never decides authority.

The private commercial resolver applies precedence in this order: self-hosted deployment, latest effective manual contract decision, then current provider evidence. A `defer_to_provider` decision or expired contract falls through to provider evidence without deleting history. Past-due grace uses either the deadline already bound to the provider revision or the delinquency policy both effective and recorded at provider occurrence. A later-observed backdated policy cannot alter an old event. No delinquency policy or contract is seeded.

Only new managed growth may be restricted. Balance reads, refunds, reconciliation, checkout independence, exports, and promised reward redemption are always available.

`loyalty_private.authorize_managed_growth_configuration_v1` is a separate internal decision for reviewed merchant authoring commands. It combines the ordinary capability entitlement with commercial state. It is deliberately not substituted for the general entitlement resolver, so ingestion, releases, refunds, redemption, reconciliation, export, customer access, connector recovery, and checkout have no commercial-denial dependency.

## Growth/configuration enforcement

`loyalty_private.managed_growth_configuration_boundaries` is the private immutable command inventory. Each entry names one tenant-owned mutation root, its ordinary capability, guarded operations, known command functions, and any exact risk-reducing states. Twenty-three roots cover programme and experience authoring, VIP overrides, audiences/campaigns, notification configuration/tests, scheduled analytics, ecosystem sharing/currency/service credentials, federation/SCIM creation, and migration preparation/application.

`enforce_managed_growth_boundary_v1` runs before a registered mutation. It derives the organization from the row, requires an authenticated browser subject, and evaluates server-runtime merchant operations too. It accepts no browser-supplied organization, commercial state, entitlement, provider status, or approval. Unknown or malformed boundaries fail closed. Dedicated workers and migration administration retain narrow subjectless paths; operational relations are not in the inventory.

`evaluate_managed_growth_boundary_v1` makes risk-reducing state changes available before the commercial decision. Pause, cancel, disable, retire, revoke, isolated sharing, disabled currency policy, and already-started federation recovery/completion therefore remain possible while new growth is restricted. Existing SCIM updates/provisioning remain outside the guard so account recovery and immediate deprovisioning continue.

An exact command retry that resolves existing immutable evidence before another write keeps its historical result. A new or changed command reaches the guarded root. Restricted denial is atomic and creates no partial configuration, audit, billing usage, or ledger effect.

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

## Managed session contracts V1

`ManagedBillingPlanOptionV1` exposes only a public plan selector, merchant copy, ISO currency, integer minor-unit amount, interval, and trial days. Provider Product and Price identifiers remain in append-only private PostgreSQL versions and are configured externally; the repository seeds no price.

`ManagedBillingSessionRequestV1` accepts only schema version, organization public ID, `checkout` or `portal`, a public plan selector for Checkout, and an operation UUID. It rejects customer, Price, return URL, provider mode, payment, contact, claim, or entitlement input.

The server reserves the operation in `loyalty_private.reserve_managed_billing_session_v1` before loading an API key or constructing a provider client. PostgreSQL checks the current deployment mode, active organization, live owner membership, `managed.billing` entitlement, provider mode, and effective plan/account evidence. An exact retry returns the same fence; changed content under the same operation ID fails with SQLSTATE `23505`.

Immediately before each customer or session request, `authorize_managed_billing_session_attempt_v1` rechecks membership, entitlement, and provider mode. The narrow client can POST only to Stripe's fixed API origin, pins reviewed API version `2026-02-25.clover`, uses a stable database-derived idempotency key, pins success/cancel/return navigation to `DASHBOARD_PUBLIC_ORIGIN`, limits responses to 32 KiB, and accepts redirects only from Stripe Checkout or Billing Portal origins. Customer creation sends only the opaque operation ID and no email.

`record_managed_billing_session_attempt_v1` appends minimized succeeded, rejected, ambiguous, or held evidence. It stores no redirect URL, provider response, contact, card, payment method, body, or secret. Customer success binds one private account; Checkout or Portal success stores only its provider resource fence. Subscription state and entitlements change only after separately verified webhook processing.

## Managed usage contracts V1

`ManagedBillingUsageSummaryV1` contains one exact UTC month, measurement time, `shadow` or `configured` dispatch mode, and exactly four reviewed meters: orders ingested, ledger-active members, delivered messages, and accepted Service API commands. `configured` requires managed deployment, the tenant's effective `managed.billing` entitlement, a current account, all four effective meters, and an enabled provider configuration for the same mode; otherwise the projection stays `shadow`. Quantities and queue counts are decimal strings so JavaScript never narrows PostgreSQL integers. The public projection contains no provider customer, event name, source identity, contact, Price, payload, or response evidence.

PostgreSQL derives one immutable private fact for each reviewed source identity. A duplicate source creates no second fact. A correction is a non-zero compensating fact linked to the original, retains a provider timestamp inside the original UTC period, and cannot make cumulative usage for one source negative. It is dispatched only when the original provider event is accepted and reuses that event's provider customer and meter version; a shadow-only or unresolved original cannot create a standalone negative provider event. Facts, corrections, provider attempts, and dispatch identity are immutable and create no loyalty ledger effect.

`record_managed_billing_usage_meter_v1` stores externally supplied append-only event-name configuration only in managed mode. It contains no price. `capture_managed_billing_usage_facts_v1` returns before scanning product sources in self-hosted mode and resolves tenant billing eligibility at each immutable source occurrence time, so later activation cannot backfill earlier activity. It recognizes:

- the first canonical event for one tenant, commerce connection, and order object;
- one customer with an immutable loyalty ledger transaction per UTC month;
- one delivered SMTP message or completed Klaviyo event operation; and
- one accepted customer command receipt or signed Service API activity event.

The isolated billing worker claims only a public dispatch selector and lease. `authorize_managed_billing_usage_dispatch_v1` then rechecks deployment mode, `managed.billing`, current account, provider mode, current meter version, provider timestamp window, worker, and lease before returning one minimized provider payload. Only after that row exists does the worker read its separate regular-file restricted key and construct the fixed-origin Stripe client.

Each fact has one permanent `m14u_…` identifier used as both the Stripe meter-event identifier and HTTP idempotency key. Exact duplicate responses are accepted. Temporary HTTP failures receive bounded retries; policy holds cool for five minutes; a timeout or interrupted response is retained as ambiguous for reconciliation instead of being replayed after Stripe's bounded duplicate-enforcement window. Signed negative quantities are used only for append-only compensation, which Stripe documents for correcting usage.

The provider is an asynchronous sink. Provider acceptance never changes tenant authority, subscription state, entitlement, loyalty value, refunds, redemption, reconciliation, export, or checkout behavior.

## Error and privacy behavior

Unauthorized or cross-tenant reads return no row. The dashboard maps missing, multiple, malformed, or expanded V2 responses to `billing_summary_unavailable` and shows no inferred commercial state.

No billing operation changes loyalty ledger, customer, programme, connector, coupon, or checkout state. Private records retain only bounded provider references, digests, lease outcomes, and normalized lifecycle evidence; Loyalty stores no raw webhook body, signature header, contact, metadata, invoice body, card, or payment-method data.
