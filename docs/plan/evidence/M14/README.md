# M14 Evidence — Managed Billing

Status: M14-S01 is repository-complete on `codex/m14-billing-foundation`; M14-S02 is active. Production and the global `self_hosted` deployment mode are unchanged; no Stripe package, credential, request, customer, subscription, Price ID, or production billing state is introduced by S01.

## M14-S01 billing authority and self-hosted independence

- ADR-0056 selects an append-only normalized PostgreSQL billing mirror over live Stripe authorization or one mutable provider row.
- Official Stripe webhook, subscription, Checkout, Portal, usage, and test-clock behavior was reviewed on 2026-08-26. The design assumes duplicates, disorder, asynchronous lifecycle and usage, bounded provider idempotency, and raw-body signature requirements before later provider work begins.
- The slice gate requires strict versioned merchant state, private provider references, immutable event-time ordering, live-membership tenant isolation, exact private retries, no payment/card storage, six always-available protected paths, and a structural return before provider construction in `self_hosted` mode.

### Initial repository evidence

- Initial implementation head: `ae08f07e726b9332148829e25f61dbd1f86a7a39`; stacked draft PR: [#46](https://github.com/Starfiniti/starfiniti-loyalty/pull/46).
- Local lint, all workspace typechecks/tests, client contracts, workflow, entitlement, architecture, accessibility, migration and pgTAP static validation pass. The focused suites include 11 contract cases, four presentation cases, four server/provider cases, 61 planned pgTAP assertions, and one two-session billing replay probe. The final adversarial pass added caller-key-independent provider-customer replay fencing and races it alongside provider-event identity.
- Real-component Chromium review passed at 1440×1000 and 390×844 in light and dark themes: one focusable main landmark, correct current navigation, no horizontal overflow, no browser errors, visible mobile destination, initial close-button focus, and menu-button focus restoration after Escape. Review found the dark warning badge was too muted; its corrected foreground computes to 8.25:1 against the mixed dark surface.
- Windows repository-wide Prettier remains affected by the pre-existing CRLF checkout baseline, so clean Linux CI is the formatting/build and database-replay authority. No unrelated files were reformatted.
- Exact-head Linux run [`33020484560`](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33020484560) at `68479f1347e212b046ae99c5750fd27a0d05f6e8` passed all seven jobs: the complete repository check, both production images, a clean 76-migration replay, all 63 pgTAP files with 3,410 assertions including all 61 focused billing cases, all 17 concurrency probes, and the minimum/current × HPOS/legacy WooCommerce matrix. The managed-billing probe proved exact provider-account and provider-event races converge under different caller keys, changed provider-event races fail one caller closed, one account/two normalized revisions remain, and zero ledger value changes.

S01 has no production rollout: production remains unchanged and no Stripe runtime exists. M14-S02 will add a disabled managed-only signature/inbox boundary with local fixtures; Stripe sandbox and production canaries remain pending their later gates.
