# ADR-0060: Deterministic commercial policy and manual-contract precedence

- Status: Accepted
- Date: 2026-08-27
- Module: M14-S05

## Context

Stripe subscription and invoice webhooks are asynchronous and may be delayed, duplicated, or delivered out of order. Stripe also lets operators configure retry behavior and the terminal subscription response after retries are exhausted. Pausing payment collection can leave a subscription active, which means a provider status alone is not a complete Starfiniti commercial decision. Starfiniti must support approved enterprise contracts without turning provider data, Auth claims, browser input, or an email/domain match into tenant authority.

Two material approaches were compared:

1. Read Stripe on each merchant request and make provider status the entitlement authority. This appears current, but adds a synchronous provider dependency, makes out-of-order delivery affect authorization, cannot represent local contract terms safely, and risks blocking protected loyalty operations during a provider outage.
2. Retain normalized provider observations as immutable evidence, combine them with append-only local delinquency and contract decisions in PostgreSQL, and authorize only new growth/configuration at explicit command boundaries. This keeps evaluation reproducible and tenant-scoped while leaving loyalty value independent.

The second approach is selected. Stripe documents configurable Smart Retry periods and terminal actions, asynchronous subscription webhook handling, and the distinction between pausing payment collection and pausing a subscription:

- <https://docs.stripe.com/billing/revenue-recovery/smart-retries>
- <https://docs.stripe.com/billing/subscriptions/webhooks>
- <https://docs.stripe.com/billing/subscriptions/pause-payment>

## Decision

PostgreSQL is the commercial-policy authority.

- `BillingSummaryV1` remains readable with its exact minimized shape. `BillingSummaryV2` adds only `stateSource`, `restrictionReason`, and `contractEndsAt`.
- Delinquency policies are private append-only versions. A past-due grace deadline is derived from the policy both effective and already recorded at the immutable provider event occurrence time, never the webhook observation time or current policy. A later-observed backdated policy cannot alter an old event. An explicit grace deadline already stored with provider evidence takes precedence.
- No production delinquency policy is seeded in source control. Until an approved policy is configured, a provider `past_due` state retains the existing fail-closed `past_due` behavior.
- Manual contract decisions are private append-only organization evidence. A currently effective `allow_growth` decision has precedence over provider state and produces `contract_managed`. A later open-ended `defer_to_provider` decision ends local precedence. Expired contracts fall through to current provider evidence.
- Policy and manual-contract commands require bounded operator references, a distinct approver reference, a reason, effective time, and idempotency key. Exact retries return the original public selector; changed retries fail. Semantically identical commands with different keys converge at one effective instant, while conflicting same-instant decisions fail rather than depending on lock acquisition order.
- Public summaries never expose provider customer/subscription/event identifiers, policy authors, approvers, reasons, idempotency keys, fingerprints, or private history.
- Self-hosted evaluation returns before provider, delinquency, or contract evidence and does not require Stripe.
- Commercial restriction is not added to the general entitlement resolver. A separate authorization function combines an ordinary capability decision with commercial state only at reviewed merchant growth/configuration commands.
- Balance reads, ingestion, pending release, refunds/reversals, promised reward redemption, reconciliation, account access, exports, connector recovery, and checkout never depend on that growth authorization function.
- Recovery appends new evidence or lets a bounded effective interval end. Provider, contract, and loyalty history are never updated or deleted.

## Consequences

Commercial state is reproducible for an exact evaluation time and delayed webhooks cannot overwrite a currently effective manual contract. A contract can coexist with retained provider evidence, but only the selected source controls the effective state. Operators must explicitly configure delinquency policy and contract evidence; source-controlled prices, terms, or production approvals are prohibited.

The authoring boundary must be audited command by command. A global entitlement substitution is forbidden because the existing resolver is also used by workers and protected value paths.

## Rollback

Stop using the V2 merchant projection and continue reading the backward-compatible V1 projection. Append a `defer_to_provider` manual decision, append a replacement delinquency policy, or reopen growth through newer effective evidence. Retain every policy, contract, provider, attempt, entitlement, and loyalty record. Never remove restriction by mutating historical rows.
