# M14 Evidence — Managed Billing

Status: M14-S01 is active on `codex/m14-billing-foundation`. Production and the global `self_hosted` deployment mode are unchanged; no Stripe package, credential, request, customer, subscription, Price ID, or production billing state is introduced by this slice.

## M14-S01 billing authority and self-hosted independence

- ADR-0056 selects an append-only normalized PostgreSQL billing mirror over live Stripe authorization or one mutable provider row.
- Official Stripe webhook, subscription, Checkout, Portal, usage, and test-clock behavior was reviewed on 2026-08-26. The design assumes duplicates, disorder, asynchronous lifecycle and usage, bounded provider idempotency, and raw-body signature requirements before later provider work begins.
- The slice gate requires strict versioned merchant state, private provider references, immutable event-time ordering, live-membership tenant isolation, exact private retries, no payment/card storage, six always-available protected paths, and a structural return before provider construction in `self_hosted` mode.

### Initial repository evidence

- Initial implementation head: `ae08f07e726b9332148829e25f61dbd1f86a7a39`; stacked draft PR: [#46](https://github.com/Starfiniti/starfiniti-loyalty/pull/46).
- Local lint, all workspace typechecks/tests, client contracts, workflow, entitlement, architecture, accessibility, migration and pgTAP static validation pass. The focused suites include 11 contract cases, four presentation cases, four server/provider cases, 59 planned pgTAP assertions, and one two-session billing replay probe.
- Windows repository-wide Prettier remains affected by the pre-existing CRLF checkout baseline, so clean Linux CI is the formatting/build and database-replay authority. No unrelated files were reformatted.

Clean replay/pgTAP/concurrency, production image, WooCommerce matrix, browser, adversarial exact-head, and production-canary evidence remains pending.
