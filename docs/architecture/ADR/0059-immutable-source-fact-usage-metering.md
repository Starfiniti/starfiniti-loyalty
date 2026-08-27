# ADR-0059: Immutable source-fact usage metering

- Status: Accepted
- Date: 2026-08-27
- Module: M14-S04

## Context

Managed plans may eventually charge for orders, active members, delivered messages, and accepted service-API commands. The loyalty database already contains the authoritative commerce, ledger, notification, and API receipts, while Stripe meter-event duplicate enforcement is intentionally bounded and its aggregates are asynchronous. Billing retries must not become a dependency of checkout, loyalty effects, refunds, or customer access.

Two material approaches were compared:

1. Send mutable daily or monthly totals. This lowers provider traffic, but a delayed retry can overwrite a newer total, corrections depend on ordering, and an invoice cannot be reconstructed to individual source evidence.
2. Derive one immutable local usage fact for each qualifying source identity, add corrections as compensating facts, and dispatch each fact under one permanent local identifier. This uses more provider events but retains attribution, survives retries beyond the provider duplicate window, and supports exact local reconciliation.

Stripe supports integer meter-event values, caller-supplied identifiers, timestamps within a bounded window, and asynchronous aggregation. Meter definitions become immutable after creation apart from their display name, so event names and aggregation settings are external configuration rather than source-controlled prices or product authority.

## Decision

Use immutable source-fact metering with PostgreSQL as the authority.

- Four versioned metric keys are defined without prices: `orders`, `active_members`, `messages`, and `api_requests`.
- One order fact is created for the first accepted canonical event for a distinct tenant, commerce connection, and order object.
- One active-member fact is created for each distinct tenant customer and UTC month containing an immutable loyalty ledger transaction for that customer.
- One message fact is created for each accepted SMTP delivery or completed Klaviyo event operation. Suppressed, failed, test, profile, consent, and generic webhook operations are excluded.
- One API fact is created for each immutable service-customer command receipt or accepted service-API activity event. Duplicate command retries do not create another fact.
- Source identifiers are reduced to private UUID evidence and SHA-256 identities. Raw commerce object IDs, API keys, idempotency keys, customer contact data, payloads, and provider response bodies are not copied.
- A correction appends a non-zero compensating fact linked to the original. Existing facts and successful dispatch evidence are never edited.
- Usage periods are exact UTC calendar months. Quantities use PostgreSQL `bigint` and public contracts use decimal strings.
- Dispatch configuration is append-only and externally supplied. No Stripe event name, meter ID, Price ID, or price is seeded by the application.
- A database lease claims only a public dispatch selector. A second authorization step rechecks managed deployment mode, effective `managed.billing` entitlement, provider configuration, meter version, billing account, live mode, and lease before returning the minimized provider payload.
- The billing worker reads a regular-file restricted Stripe key only after that authorization returns one row. It uses a fixed Stripe origin, a pinned API version, POST-only requests, bounded responses, timeouts, and no redirects.
- Provider timeouts become ambiguous and require reconciliation; they are not blindly retried outside the provider's bounded duplicate window. Duplicate-identifier responses are recorded as accepted.
- Local capture, dispatch, failure, and reconciliation remain isolated from every loyalty-value and checkout path.

The first rollout is shadow mode: facts and summaries are produced while no meter configuration or worker credential exists. Sandbox meter names, aggregation formulas, price bindings, and invoice comparisons remain explicit canary inputs.

## Consequences

The local fact count is larger than a daily-total design, but every billed unit is independently attributable and retry-safe. Active member means a member with an immutable loyalty ledger effect in the UTC month; it does not mean every stored customer record. A historical correction outside Stripe's accepted timestamp/adjustment window can be locally exact while requiring a reviewed provider-side correction or future compensating event.

The usage read model exposes only totals and queue health to live tenant members. Provider customer IDs, event names, meter configuration, source identities, and attempt evidence stay private.

## Rollback

Disable the current meter-configuration version or stop the isolated billing worker. New source facts may continue in shadow mode, but no provider request is made. Retain all immutable facts, corrections, attempts, and successful identifiers for reconciliation, then forward-fix configuration or append compensating facts. Never delete or rewrite usage or loyalty history.
