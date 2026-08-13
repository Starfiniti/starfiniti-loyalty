# ADR-0013: Capability-negotiated native reward fulfilment

- Status: Accepted
- Date: 2026-08-13
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M04, M09, M11

## Context

M04 adds restrictions, free-product rewards, and atomic quantity/budget limits to the existing WooCommerce coupon pipeline. The rollout must preserve native checkout independence, keep accepted value recoverable, and prevent an older connector from claiming a command it cannot execute faithfully.

WooCommerce core supports the required fixed, percentage, free-shipping, and product-restricted coupon primitives. A paid extension can add richer free-gift presentation, but would add a non-open-source runtime dependency. Calling the loyalty hub during cart or checkout could centralize fulfilment, but would violate the established zero synchronous hub dependency.

## Decision

Use WooCommerce core `WC_Coupon` primitives and represent a free product as a 100% product-restricted, item-limited coupon. Store all capacity authority in PostgreSQL. Allocate global quantity and points budget atomically when the reward reservation is accepted, consume the allocation only after coupon capture, and release it only after a definitive unused/rejected outcome.

The plugin advertises the versioned capability `coupon.issue.v2` on every poll. PostgreSQL returns V2 coupon commands only to a poller that advertises that exact capability. The retained three-argument claim function is a compatibility wrapper that can claim V1 commands only. Unknown capabilities fail closed, and the command API validates the versioned envelope before returning it.

The V2 authoring contract supports tier availability now. Segment availability must remain empty until M07 provides an authoritative, snapshot-backed audience evaluator. A merchant cannot author a segment selector that execution would ignore.

Exclusive-access and custom perks use an audited manual state machine instead of pretending to be WooCommerce coupons. PostgreSQL creates a private fulfilment case atomically with the customer reservation. An owner, admin, or operator explicitly moves `pending` to `in_progress`, then records either a bounded external result reference for confirmed fulfilment or a bounded reason for definitive rejection. Fulfilment captures the reserved points exactly once; rejection compensates them exactly once. Uncertain outcomes are deliberately not a terminal resolution.

## Alternatives considered

1. Require a paid WooCommerce free-gift extension. Rejected because it would make an open-source platform feature depend on a proprietary extension and broaden the compatibility matrix.
2. Resolve reward eligibility and free gifts synchronously from the hub during checkout. Rejected because hub or network failure would become a checkout dependency.
3. Use core coupons with local execution, database capacity authority, and capability negotiation. Accepted because it preserves native checkout behavior, open-source deployability, and safe mixed-version rollout.
4. Treat manual benefits as immediately fulfilled when requested. Rejected because the platform would capture customer value before a merchant proved delivery.
5. Let operators release an uncertain manual benefit. Rejected because ambiguity could create both a delivered benefit and restored points. Only a definitive rejection may compensate value.

## Security and integrity effects

- Free-product rewards use core coupon semantics rather than automatically inserting products into a cart.
- Product and category selectors are numeric WooCommerce object IDs and are bounded before they cross the connector boundary.
- Accepted reservations remain visible and recoverable while connector outcomes are ambiguous; they are never speculatively released.
- Connector upgrades can be rolled out before the tenant feature flag without sending unsupported commands to older plugins.
- Reward segments stay unavailable until M07 rather than becoming an unverified placeholder.
- Manual-case source rows and transitions remain private; merchant reads return only the programme-scoped customer reference, reward snapshot, instructions, due date, status, and bounded result reference needed to operate the queue.
- Analysts and auditors can inspect queue state but cannot start or resolve cases. Mutation stays with owner, admin, and operator roles and appends minimized administration audit evidence.

## Operations

The merchant Rewards route shows pending, in-progress, overdue, fulfilled-30-day, and rejected-30-day counts. Manual cases sort unresolved work first by due time. Operators must record an opaque store reference after delivery and must leave uncertain work in progress. The raw case and transition tables are not exposed through the Data API.

Connector diagnostics continue to distinguish retryable, terminal, and manual-review native coupon commands. WooCommerce remains the source of truth for native coupon existence and usage; the hub remains authoritative for reservations, capacity, and ledger effects.

## Migration and rollback

Deploy the additive database migration and compatible command API first, then upgrade the plugin. Keep `rewards.expanded` disabled by default. Enable one pilot tenant only after the supported runtime matrix passes.

Rollback stops new V2 reservations by disabling the tenant flag. Existing reservations, allocations, commands, ledger transactions, and audit evidence remain; operators finish or manually reconcile accepted work before removing execution capacity. The V1 command wrapper and evaluation path remain compatible throughout.
