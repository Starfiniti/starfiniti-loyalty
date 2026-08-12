# Execution Plan

## Objective

Finish Starfiniti Loyalty as an open-source, self-hosted platform on Proxmox using Next.js, PostgreSQL/Supabase, and a production WooCommerce plugin. Shopify is deferred by product-owner direction.

## Current phase

Phase 9 — merchant administration and customer experience. Shopify Phase 8 remains deferred by product-owner direction.

## Evidence and completed work

- Phase 0 is complete: the npm workspace, responsive Next.js Overview, Supabase migration baseline, WooCommerce HPOS scaffold, Proxmox deployment contract, operating documents, and pinned CI exist.
- GitHub Actions run `31506030405` passed the baseline and Docker-backed database jobs, including migration replay, seed, eight pgTAP assertions, and cleanup.
- Phase 1 is complete for the active WooCommerce scope. The owner approved ADR-0004 on 2026-08-11.
- `rosyRewardsV1` encodes 100 points/EUR redemption, a 30-day pending period, 12-month rolling expiry, original-attribution refunds, and Rose/Bloom/Icon tiers at EUR 0/150/500 with 5/6/7 points per EUR.
- Domain helpers require the historical programme version and tier snapshot. Sixteen domain tests cover configuration, award rounding, tier boundaries/grace, cumulative refunds, negative balances, release, expiry, ordering, and invalid inputs.
- AGPL-3.0-or-later is approved for the hosted platform. The WooCommerce plugin remains GPL-2.0-or-later.
- The public GitHub repository is `Starfiniti/starfiniti-loyalty`; PR `#1` merged the verified Phase 0/1 work into `main`.
- Public `main` CI run `31513294330` passed the baseline and Docker/Supabase database jobs.
- Phase 2 is complete: eight reviewable architecture/security/operations models and ADR-0005 through ADR-0007 define database authorization, double-entry ledger, signed inbox/outbox, identity, privacy, recovery, and failure behavior.
- Current Supabase breaking changes were incorporated: Envoy default, `/auth/v1` external Auth URL, PostgreSQL 17 upgrade boundary, explicit Data API exposure, Studio ownership change, and new publishable/secret/asymmetric keys.
- `npm run architecture:validate` deterministically checks the Phase 2 gate and is part of `npm run check`.
- `P3-TENANCY-SCHEMA` is complete: six tenant-owned tables, no-login database roles, composite tenant foreign keys, explicit grants, live membership RLS, and scoped support access are implemented.
- Exact-head GitHub Actions run `31524730760` passed the baseline and Docker/Supabase jobs, including two migration replays, reset, seed, 49 pgTAP assertions, and cleanup.
- Phase 4 is complete: strict commerce contracts, raw-body HMAC verification, a Next.js ingestion route, a WooCommerce local outbox with Action Scheduler retries, restricted inbox/canonical/effect/outbox tables, and retry-safe normalization are implemented.
- Exact-head GitHub Actions run `31527785181` passed the full baseline and Docker/Supabase jobs with 87 pgTAP assertions, including duplicate, nonce-replay, cross-tenant, repeated-normalization, and out-of-order scenarios.
- Phase 5 is complete: immutable double-entry transactions/entries, wallet/control accounts, FIFO lots, compensating allocations, six balance projections, eight value commands, export/liability reporting, and rebuild tooling are implemented.
- Exact-head run `31566530867` passed the full gate with 178 pgTAP assertions plus a two-session overspend test and deterministic 20-round property sequence.
- Phase 6 is complete: immutable publication/scheduling, deterministic award/simulation parity, tier qualification/history, reward reservation compensation, and advance expiry notifications are implemented.
- Exact-head run `31569179555` passed the full baseline and Docker database gate with five migrations, 260 pgTAP assertions, ledger overspend, concurrent evaluation idempotency, and property probes.
- Phase 7 implementation includes the durable WooCommerce worker, completed-order awards, cumulative refund reversals, explicit programme binding, native coupon issue/cancel polling, coupon-use capture, confirmed-unused expiry compensation, customer/privacy surfaces, source reconciliation, queue operations, and an installable plugin ZIP.
- Exact-head run `31575751260` passed the six-migration baseline with 322 pgTAP assertions plus concurrency/property probes.
- Phase 7 is complete for the active WooCommerce scope. Exact-head run `31577312529` passed the baseline, database, and four real WordPress/WooCommerce runtime jobs across minimum/current versions, HPOS/legacy storage, classic/Blocks coupon paths, hub outage, partial/full refunds, reconciliation, activation lifecycle, and queue recovery.
- Phase 9 now includes the authenticated tenant shell and a structured programme editor with deterministic preview, database-canonical drafts, exact-hash publish/schedule commands, immutable audit evidence, and adversarial tenant/role/idempotency tests.
- Exact-head run `31580836101` passed the baseline, seven-migration database gate with 374 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The customer operations read slice now provides bounded reference search, masked channel identity, wallet-bucket truth, and immutable programme-attributed ledger history through explicit tenant filters plus RLS.
- The connector operations slice now provides private-payload-free queue summaries/issues and an audited, role-guarded replay command limited to canonical dead-letter effects. Coupon command dead letters are deliberately inspect-only after compensation.
- The customer adjustment slice now provides exact integer balance preview, strong removal warnings, explicit confirmation, expiry-bound credits, and owner/admin-only immutable ledger plus audit commands.
- The source-reconciliation slice now sends reviewed WooCommerce order requests through an audited private outbox and signed polling route; the plugin re-emits source facts idempotently and reports missing orders without a retry storm.
- Exact-head run `31584351529` passed the customer-adjustment baseline, nine-migration database state with 448 pgTAP assertions, and all four WooCommerce runtime variants.
- Exact-head run `31585681985` passed the signed source-reconciliation baseline, ten migrations with 485 pgTAP assertions, and all four WooCommerce runtime variants.
- The Overview-reporting slice removes demo values and supplies bounded tenant/workspace/programme aggregates from immutable evaluation and ledger evidence through exact integer contracts; private source data stays server-only.
- Exact-head run `31588394642` passed the live-reporting baseline, eleven migrations with 518 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The customer-read hardening slice moves list/detail assembly into live-membership database wrappers, masks channel IDs before they leave PostgreSQL, and preserves every wallet and ledger bigint as text through `BigInt` display formatting.
- Exact-head run `31589866616` passed the customer-read baseline, twelve migrations with 551 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants after one external Composer TLS retry.
- Initial-programme onboarding now lets an existing tenant owner/admin create the first programme inside an active authorized group through an idempotent audited command; public organization/group signup remains disabled.
- Exact-head run `31591151097` passed the onboarding baseline, thirteen migrations with 586 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The customer-tier slice adds a minimized, exact one-row current/qualified/grace read model and responsive merchant detail surface without exposing private decision evidence.
- Exact-head run `31592427051` passed the customer-tier baseline, fourteen migrations with 613 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The accessibility slice adds a first-focus keyboard bypass to a focusable main landmark on all eight route surfaces, consistent text-area focus treatment, reduced-motion validation, and a narrow-viewport-safe authentication card; the deterministic guard is part of `npm run check`.
- Exact-head run `31596460783` passed the accessibility baseline, fourteen migrations with 613 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The supportability slice adds a downloadable versioned diagnostic bundle from the tenant operations view. It contains public scope/connection IDs, queue counts, watermarks, and a labelled bounded sample of grouped canonical error codes only; direct minimization tests reject item identities and noncanonical strings.
- Exact-head run `31597255280` passed the support-diagnostics baseline, fourteen migrations with 613 pgTAP assertions plus concurrency/property probes, and all four WooCommerce runtime variants.
- The WooCommerce localization slice registers the packaged `/languages` path at `init`, maintains exact POT coverage for all 38 source strings, bundles Slovenian customer/admin translations in WordPress's performant PHP catalog format, and adds an actual locale-switch/customer-navigation assertion to the four-case runtime matrix.
- Exact-head run `31598618092` passed the localization baseline, fourteen migrations with 613 pgTAP assertions plus concurrency/property probes, and the Slovenian customer-navigation assertion in all four WooCommerce runtime variants.
- The customer-experience theme foundation persists one revisioned workspace/programme-group token set behind RLS and an audited owner/admin command. It accepts an accessible canonical brand color, three local font stacks, bounded radius/copy, section visibility, and widget side only; raw CSS, font URLs, scripts, and uploads are outside the boundary.
- Exact-head run `31600742177` passed the controlled-theme baseline, fifteen migrations with 654 pgTAP assertions plus concurrency/property probes, and all four localized WooCommerce runtime variants.
- The customer activity slice adds safe URL filters and honest filtered counts/empty states for orders/refunds, rewards, release/expiry, and adjustments without expanding the existing 100-entry minimized ledger response.
- The bulk customer-adjustment slice caps uniform owner/admin operations at 50 customers and requires a read-only exact balance fingerprint plus explicit approval before an atomic, idempotent batch of per-customer immutable ledger transactions and aggregate audit evidence.
- WooCommerce customer surfaces retain a zero-connector-JavaScript, zero-connector-CSS, zero-render-hub-request budget with bounded native server markup and runtime-matrix enforcement.
- Hosted customer copy now supports independently revisioned English and Slovenian launch locales through bounded RLS-scoped owner/admin management and a live locale preview; unsupported locales fail closed.
- Exact-head run `31606226276` passed the hosted-translation baseline, seventeen migrations with 726 pgTAP assertions plus concurrency/property probes, and all four localized WooCommerce runtime variants.
- Hosted guest delivery now has a mobile-first public route for one active workspace and published programme. Its anonymous database boundary returns only bounded theme/copy/tier/reward presentation data and no customer, raw configuration, audit, integration, or commerce evidence.
- Exact-head run `31608392260` passed the hosted guest-delivery baseline, eighteen migrations with 752 pgTAP assertions plus concurrency/property probes, and all four localized WooCommerce runtime variants.
- Authenticated customer delivery now starts from a five-minute, one-use WooCommerce HMAC capability, requires explicit confirmation under a verified Supabase Auth session, and creates one revocable Auth/customer link plus immutable hashed decision evidence without email matching.
- The hosted member account derives the customer only from that live link and returns exact balances, current tier, next expiry, bounded safe rewards/reservations, and redacted recent ledger activity; it accepts no tenant, customer, workspace, or programme authority from the browser.
- Exact-head run `31618909782` passed the secure member-delivery baseline, twenty migrations with 818 pgTAP assertions plus concurrency/property probes, 124 unit tests, and all four localized WooCommerce runtime variants.
- Authenticated customers can now review and confirm native WooCommerce rewards from their hosted account. One Auth-derived PostgreSQL command atomically snapshots the reward, reserves exact FIFO-funded points, records the immutable transition, and queues one customer-scoped private coupon command; the browser cannot supply tenant, customer, wallet, value, expiry, or connector authority.
- Programme authoring now requires usable fixed-discount, percentage-discount, or free-shipping coupon configuration and a bounded 1–365 day validity before a native reward can be published.
- Exact-head run `31622879767` passed the customer-redemption baseline, twenty-one migrations with 863 pgTAP assertions plus concurrency/property probes, 126 unit tests, and all four localized WooCommerce runtime variants.
- WooCommerce customer erasure now emits one opaque locally deduplicated event and atomically creates a private keyed tombstone, revokes hosted access, pseudonymizes the channel identity and restricted raw event, preserves immutable value history, and suppresses later re-import.
- Exact-head run `31625573608` passed the customer-erasure baseline, twenty-two migrations with 910 pgTAP assertions plus concurrency/property probes, 128 unit tests, and all four localized WooCommerce runtime variants.
- Hosted login, WooCommerce claim, member-account, and reward-redemption routes now preserve one explicit English or Slovenian locale through safe local navigation. WooCommerce appends its active locale outside the signed claim payload, so display preference cannot alter customer identity authority.
- Exact-head run `31627622779` passed the hosted-customer localization baseline, twenty-two migrations with 910 pgTAP assertions plus concurrency/property probes, 132 unit tests, and active-locale claim links in all four localized WooCommerce runtime variants.
- Hosted customers can now download their Auth email, active linked store identities, wallets, tiers, reservations, and complete wallet-side ledger as versioned JSON after entering their password again. The server issues one hashed five-minute capability bound to the verified Auth subject and Supabase session, returns the document directly with private download headers, and records immutable audit evidence without storing the export.
- Exact-head run `31629852692` passed the hosted customer-export baseline, twenty-three migrations with 953 pgTAP assertions plus concurrency/property probes, 141 unit tests, and all four localized WooCommerce runtime variants.
- Guided WooCommerce provisioning now lets a live tenant owner/admin create the first active connection for a published programme and copy one exact setup package into WordPress. The server consumes a unique deployment-managed signing-key reference; the browser Data API, audit trail, and plugin diagnostics never expose that reference.
- Exact-head run `31633310240` passed the guided-provisioning baseline, twenty-four migrations with 997 pgTAP assertions plus concurrency/property probes, 146 unit tests, and package import in all four localized WooCommerce runtime variants.
- The deployment-artifact slice now builds both digest-pinned dashboard and worker Dockerfiles on every pull request. An exact semantic-version tag reruns the baseline and disposable database gate before publishing commit-SHA/version GHCR images and a checksummed WooCommerce plugin release; no release tag has been created yet.
- Exact-head run `31634024586` passed all seven jobs, including real dashboard/worker Docker builds, the 24-migration/997-assertion database gate, and all four localized WooCommerce runtime variants.
- The deployment preflight now validates a real off-repository environment and signing pool without printing values. It fails on template placeholders, floating/non-SHA images, invalid or shared database credentials, noncanonical HTTPS origins, malformed pool entries, and group/other-readable key files on Linux.
- Exact-head run `31601351946` passed the filtered-customer baseline, fifteen migrations with 654 pgTAP assertions plus concurrency/property probes, and all four localized WooCommerce runtime variants.
- Exact-head run `31581760825` passed the customer-ledger baseline, database job, and all four WooCommerce runtime variants.

## Active work

- `P9-MERCHANT-HUB` (in progress): the Auth/RLS shell, guided initial-programme and WooCommerce-connector provisioning, audited programme editor, exact filtered customer wallet/ledger reads, safe connector queue operations, individual and exact-preview bulk value adjustments, signed source reconciliation, real Overview reporting, keyboard-bypass accessibility guard, sanitized support diagnostics, localized WooCommerce and hosted customer journeys, controlled experience themes/translations, guest-safe hosted loyalty, signed authenticated member delivery, controlled native-coupon redemption, direct audited customer export, and WooCommerce-originated customer erasure are implemented; remaining merchant usability and operational surfaces follow.

## Next safe tasks

1. Audit remaining Phase 9 acceptance gaps and implement the next highest-value merchant/customer surface.
2. Create the first approved semantic-version release after merge, then complete production deployment and recovery evidence when the final infrastructure inputs are available.

## Dependencies and blockers

- Docker is not installed on this Windows workstation; GitHub Actions is the verified Linux/Docker database runner.
- Direct Proxmox SSH is unavailable: the public alias rejects the configured keys, the VPN alias times out, and the tested jump-host route cannot reach the private alias.
- Proxmox deployment ultimately needs a working SSH route plus host addresses, DNS, TLS issuer, off-host backup target, and production credentials. These inputs do not block repository implementation or disposable CI verification.

## Decisions awaiting approval

No Phase 1 value-semantics or licensing decision remains open. New material product, legal, production-access, or architecture tradeoffs will be raised when evidence requires them.

## Quality gate

`npm run check && npm run db:validate && npm run secrets:scan && npm run audit:prod && npm run licenses`

See `docs/architecture/ADR/`, `RISKS.md`, and `docs/plan/TASKS.yaml`.
