# Iteration Log

## 2026-08-11 — Repository reconstruction

- Found no existing repository or implementation; preserved the user-provided design archive.
- Deferred Shopify per owner direction.
- Verified current Supabase self-hosting guidance and WooCommerce REST/compatibility requirements.
- Selected npm workspaces to match the available local toolchain.
- Implemented and visually verified the responsive Next.js Overview route against the approved 912 × 512 source.
- Fixed sidebar overflow, action/metric fidelity, mobile drawer state, and standalone static-asset packaging based on browser evidence.
- Verified the production bundle, four unit tests, PHP syntax, secret scan, migration naming/content validation, and production dependency audit.
- Left Phase 0 open because Docker-backed Supabase reset/migration/seed/RLS verification cannot run on this workstation.

## 2026-08-11 — Supabase database gate

- Rechecked the current Supabase changelog, CLI help, local workflow, pgTAP, and CI documentation.
- Added `db:start`, `db:reset`, `db:test`, `db:verify`, and destructive local cleanup commands discovered from CLI help.
- Added a transactional pgTAP security suite covering schema grants, RLS coverage, and privileged functions.
- Added a parallel Ubuntu/Docker database CI job using the lockfile-pinned CLI and full-SHA GitHub Actions.
- Added static validators for Supabase config/tests and CI safety contracts.
- Confirmed Docker, Podman, and WSL are unavailable locally. Kept Phase 0 in verification instead of claiming an unexecuted database pass.

## 2026-08-11 — GitHub publication and Phase 0 closure

- Created private repository `Starfiniti/starfiniti-loyalty` and pushed initial commit `3e822e8`.
- GitHub Actions run `31506030405` passed the baseline job and Linux/Docker database job.
- Replayed the foundation migration and seed, passed all eight pgTAP assertions, and removed the disposable test containers and volumes.
- Closed `P0-BOOTSTRAP` with execution evidence and started `P1-DOMAIN-DECISIONS`.
- Probed both Proxmox SSH aliases; the public host rejected the configured key and the VPN route timed out.

## 2026-08-11 — Rosy Rewards semantics and Phase 1 closure

- Received explicit owner approval for ADR-0004, a 30-day pending period, rolling eligible-spend tiers, Rose/Bloom/Icon at EUR 0/150/500 with 5/6/7 points, and AGPL-3.0-or-later.
- Resolved the master-plan/prototype tier conflict in the accepted ADR; EUR 1,000/8 points remains an unpublished future concept.
- Encoded Rosy Rewards as a validated, versioned fixture and kept programme behavior merchant-neutral.
- Added integer award, original-attribution refund, negative-balance, expiry-lot, and tier-review helpers. Award calculation requires the stored historical tier snapshot.
- Added 16 domain tests covering approved values, thresholds, month-end dates, cumulative partial refunds, downgrade grace persistence, negative balances, expiry ordering, and invalid inputs.
- Added the full AGPL license and package metadata while retaining the WooCommerce plugin's GPL license.
- Closed Phase 1 for the owner-directed WooCommerce scope and restored the Phase 2 architecture/threat-model gate before tenancy implementation.
- Merged PR `#1`, published the repository publicly under AGPL, and confirmed public `main` CI run `31513294330` passed both baseline and Docker/Supabase jobs.

## 2026-08-11 — Phase 2 architecture and threat-model gate

- Reviewed the current Supabase breaking-change changelog and self-hosting, RLS, Auth-key, JWT, and connection guidance.
- Incorporated Envoy's default gateway, `/auth/v1` external Auth URL, PostgreSQL 17 upgrade boundary, Studio ownership change, opt-in Data API exposure, and generated publishable/secret/asymmetric keys.
- Defined explicit browser, BFF, ingestion, worker, database-role, WordPress, and infrastructure trust boundaries.
- Designed live membership authorization, composite tenant keys, immutable double-entry ledger/projections, signed inbox/outbox, reward reservation, identity claim, privacy, backup/restore, and failure state models.
- Accepted ADR-0005, ADR-0006, and ADR-0007 with alternatives and rollback implications.
- Added `architecture:validate` to `npm run check`; full check, migration validation, secret scan, production audit, and license validation passed.
- Closed `P2-ARCHITECTURE` and started `P3-TENANCY-SCHEMA`.

## 2026-08-11 — Phase 3 tenancy and RLS gate

- Generated the tenancy migration through the pinned Supabase CLI workflow and exposed only the RLS-protected `loyalty` schema.
- Added organizations, memberships, workspaces, programme groups, explicit workspace sharing, expiring support grants, and composite tenant foreign keys.
- Added no-login ownership/runtime/worker roles, explicit grants, private fixed-search-path authorization helpers, and live membership policies.
- Added 41 pgTAP assertions covering tenant isolation, revoked and absent membership, scoped support, forbidden direct DML, ownership boundaries, and forged cross-tenant links.
- Used disposable GitHub Actions runs to correct Supabase migration-role ownership requirements and keep helper functions independent of the Auth schema.
- Exact-head run `31524730760` passed the baseline and database jobs: migrations replayed twice, reset and seed succeeded, all 49 pgTAP assertions passed, and containers were removed.
- Closed `P3-TENANCY-SCHEMA` and started `P4-WC-INBOX`.

## 2026-08-11 — Phase 4 signed WooCommerce ingestion gate

- Added strict delivery/canonical schemas and raw-byte signature helpers with bounded input, SHA-256, HMAC-SHA-256, constant-time comparison, timestamp policy, and connection/delivery binding.
- Added a WooCommerce local outbox using idempotent event keys and Action Scheduler retries. Checkout hooks perform no hub network call.
- Added the Next.js ingestion route with pre-parse connection/key lookup, secret-file material, signature verification, durable receipt, and retry-safe canonical normalization.
- Added commerce connection, inbox, canonical event, business effect, and transactional outbox tables with RLS, explicit runtime/worker grants, composite tenant foreign keys, and claim indexes.
- Added 38 commerce pgTAP assertions for privileges, replay, body conflicts, disabled connections, cross-tenant links, effect/command uniqueness, repeated normalization, and late/out-of-order history.
- Exact-head run `31527785181` passed the full baseline and Docker database gate with 87 total pgTAP assertions and cleanup.
- Closed `P4-WC-INBOX` and started `P5-LEDGER-FOUNDATION`.

## 2026-08-12 — Phase 5 immutable ledger gate

- Added programmes, immutable programme versions, customers/channel identities, wallets, six wallet accounts, and programme control accounts with composite tenant keys and RLS.
- Added an immutable header/entry posting design that inserts entries under a deferred foreign key and validates at least two non-zero entries summing exactly to zero before accepting the header.
- Added atomic idempotent award, release, reserve, capture, cancel, expiry, original-attribution refund reversal, and attributable manual-adjustment commands.
- Added earliest-expiry lots, immutable compensating allocations, wallet/lot projections, drift detectors, rebuild commands, tenant ledger export, and programme liability reporting.
- Added five ledger contract tests and 91 ledger pgTAP assertions covering privileges, tenancy, balance, immutability, retries, event effects, FIFO, resolution conflicts, negative balances, attribution, reports, and rebuilds.
- Added a two-session overspend test and a deterministic 20-round property sequence to the standard database gate.
- Exact-head run `31566530867` passed baseline and Docker/Supabase verification with four migration replays, reset/seed, 178 pgTAP assertions, the concurrency/property probe, and cleanup.
- Closed `P5-LEDGER-FOUNDATION` and started `P6-PROGRAMME-ENGINE`.

## 2026-08-12 — Phase 6 programme engine gate

- Added stable connector-neutral order rules for products, categories, collections, currency, market, channel, segments, dates, and explicit value-component exclusions.
- Kept live evaluation and simulation on one pure integer evaluator with immutable version attribution and human-readable per-line explanation evidence.
- Added approved draft/publication/scheduling commands, immutable materialized tiers/rewards, rolling/calendar/lifetime qualification helpers, and atomic effective tier intervals.
- Added reward reservations and audited transition history tied to unique same-wallet ledger transactions; connector failure restores points through an attributable cancel transaction.
- Added idempotent advance point-expiry notification fences and transactional outbox commands.
- Added 82 programme pgTAP assertions and versioned programme contracts, bringing the database suite to 260 assertions plus the ledger concurrency/property probe.
- Closed `P6-PROGRAMME-ENGINE` and started `P7-WOOCOMMERCE-CONNECTOR`.

## 2026-08-12 — Phase 7 WooCommerce pipeline implementation

- Added a bundled, separately credentialed worker with durable claim leases, retries, quarantine/dead-letter states, signed channel-ID customer resolution, and explicit connection-to-programme binding.
- Connected completed orders to immutable evaluation/award evidence and cumulative refund snapshots to original-attribution reversal with deterministic rounding and a full-refund cap.
- Added signed command polling/acknowledgement and idempotent native fixed, percentage, and free-shipping coupons without any checkout-time hub dependency.
- Added PII-free completed-order coupon capture, atomic reserved-to-spent settlement, expiry cancellation, and points release only after WooCommerce confirms an unused coupon was disabled.
- Added encrypted plugin signing material, validated settings, queue diagnostics, WP-CLI dead-letter retry and order reconciliation, customer reward surfaces, privacy export/erase, multisite policy, uninstall policy, and plugin ZIP packaging.
- Added a worker service and least-privilege database credential to the Proxmox compose contract; no persistent environment was mutated because the available SSH routes remain unusable.
- GitHub Actions run `31575751260` passed the final settlement database checkpoint with six migrations, 322 pgTAP assertions, concurrency/property probes, and cleanup. The expanded suite covers origin-pointer preservation, delayed issue acknowledgement, definitive issue failure, ambiguous cancellation, capture retry, and compensating release.
- Added a four-case Docker-backed matrix for WordPress 6.6.5/WooCommerce 9.0.2/PHP 8.1 and WordPress 7.0.2/WooCommerce 10.9.4/PHP 8.3 in HPOS and legacy modes.
- Exact-head run `31577312529` passed classic and Blocks-native coupon use with a configured unreachable hub and zero checkout HTTP calls, PII-free capture, partial/full refunds, reconciliation idempotency, activate/deactivate/reactivate, bounded dead-letter exhaustion, and operator retry.
- Closed `P7-WOOCOMMERCE-CONNECTOR`; the broader PHP, money, cache, and lifecycle release matrix remains tracked by R-008 rather than overstated.

## 2026-08-12 — Phase 9 merchant operations and source reconciliation

- Added tenant-scoped customer wallet/ledger reads, payload-free connector queue summaries/issues, guarded canonical-effect replay, and owner/admin immutable point adjustments with exact bigint preview.
- Exact-head runs `31581760825`, `31584171545`, and `31584351529` passed the clean baseline, disposable Supabase verification, and all minimum/current HPOS/legacy WooCommerce runtime variants for those slices.
- Added a reviewed owner/admin/operator source-order repair that atomically records actor/reason audit evidence and one private `woocommerce.order.reconcile` command.
- Extended the signed connector envelope and polling route. The plugin reuses its stable local reconciliation primitive to append order, refund, and coupon-capture facts without a central ledger mutation; missing orders dead-letter explicitly.
- Added 37 pgTAP assertions for privilege, tenant, role, revocation, input, live-connection, idempotency, claim-lease, acknowledgement, private-outbox, and immutable-audit boundaries, plus signed plugin runtime cases.
- Exact-head run `31585681985` passed that reconciliation slice with a clean Next.js build, ten migrations and 485 pgTAP assertions, and all four real WooCommerce runtime variants.

## 2026-08-12 — Phase 9 tenant-authorized Overview reporting

- Removed hard-coded Overview figures and the preview analytics disclaimer; no synthetic tenant value is rendered as truth.
- Added a stable, live-membership reporting wrapper scoped to one active organization/workspace/programme assignment and allowlisted 7/30/90-day UTC windows.
- Defined loyalty members/new members, eligible loyalty spend, repeat-member rate, captured-to-awarded point redemption, and pending/available/reserved point liability from immutable evaluation, ledger, and projection evidence.
- Kept raw canonical payloads, channel identities, evaluation inputs/explanations, ledger rows/metadata, actors, reasons, and signing material outside the browser response.
- Added exact text-form reporting contracts, `BigInt` formatting, aligned current/previous chart series, honest empty scope, and 33 pgTAP plus seven unit assertions for precision, boundaries, definitions, minimization, and tenant isolation.
- Exact-head run `31588394642` passed the clean baseline, eleven migrations, all 518 pgTAP assertions, concurrency/property probes, and all four real WooCommerce runtime variants.

## 2026-08-12 — Phase 9 exact customer read models

- Replaced multi-query JavaScript assembly with stable, live-membership database wrappers for the bounded customer list and 100-entry customer ledger detail.
- Cast every wallet balance and ledger point value to text before the Data API and format it with `BigInt`, removing IEEE-754 precision loss from customer screens.
- Moved channel-ID masking into PostgreSQL, made search literal and capped at 100 characters/50 results, and kept actor IDs, reasons, metadata, request hashes, and raw commerce evidence out of the response.
- Added 33 pgTAP assertions for privileges, search paths, indexed access, exact large integers, masking/minimization, fixed bounds, empty wallet scope, group mismatch, revocation, and cross-tenant isolation plus one dashboard precision test.
- Exact-head run `31589866616` passed the clean baseline, twelve migrations, all 551 pgTAP assertions, concurrency/property probes, and all four real WooCommerce runtime variants after one external Composer TLS retry.

## 2026-08-12 — Phase 9 initial programme onboarding

- Replaced the developer-dependent empty programme state with a guided owner/admin form for creating the first programme inside the selected active programme group.
- Added a narrow `create_programme_command` that derives actor and organization from live database state, locks the group, validates canonical name/slug inputs, preserves exact retry identity, and commits `programme.create` audit evidence atomically.
- Kept direct programme inserts unavailable to authenticated clients and left public organization/group provisioning disabled until abuse, billing, and lifecycle controls exist.
- Added 35 pgTAP assertions for exact privileges/search paths, canonical inputs, owner/admin authority, tenant/group derivation, retry/conflict behavior, role revocation, suspended groups, cross-tenant denial, RLS-filtered audit reads, and audit immutability.
- Exact-head run `31591151097` passed the clean baseline, thirteen migrations, all 586 pgTAP assertions, concurrency/property probes, and all four real WooCommerce runtime variants.

## 2026-08-12 — Phase 9 customer tier visibility

- Added a tenant-authorized one-row tier read model over the current membership interval and its immutable qualification decision.
- Exposed current and qualified tier labels, transition, exact text-form eligible-spend minor units, and effective/below-threshold/grace timestamps while omitting explanations, hashes, idempotency keys, actors, and unrelated history.
- Added responsive merchant customer-detail presentation with an honest unevaluated state and no invented tier default.
- Added 27 pgTAP assertions for exact privileges/search paths, bounds, grace semantics, large-integer preservation, minimization, live analyst access, and revoked/suspended/cross-tenant denial.
- Exact-head run `31592427051` passed the clean baseline, fourteen migrations, all 613 pgTAP assertions, concurrency/property probes, and all four real WooCommerce runtime variants.

## 2026-08-12 — Phase 9 keyboard bypass and responsive authentication

- Added a first-focus skip link and one focusable `main` target to all seven route surfaces so keyboard users can bypass repeated merchant navigation.
- Extended the shared visible-focus treatment to text areas while preserving the existing reduced-motion override and 44-pixel skip-link target.
- Added a deterministic accessibility validator to the complete repository check for route targets, skip-link wiring, text-area focus, and reduced-motion coverage.
- Rendered the authentication page at desktop and 390-pixel widths; the mobile capture exposed a CSS Grid intrinsic-size overflow, corrected with a bounded, shrinkable card width.
- Local accessibility validation, dashboard lint/typecheck, and all 27 dashboard tests pass. The in-app browser could not route to the workstation's localhost, so the successful local Edge DOM/capture evidence is recorded without claiming automated WCAG conformance.
- Exact-head run `31596460783` passed the baseline, fourteen migrations, all 613 pgTAP assertions, concurrency/property probes, and all four WooCommerce runtime variants.

## 2026-08-12 — Phase 9 sanitized support diagnostics

- Added a versioned JSON diagnostic download to the tenant operations view using the same live-membership/RLS-scoped connector read model already visible to the merchant.
- Aggregated the newest bounded issue sample by canonical kind, state, operation, error code, and retryability; the bundle labels both returned and maximum sample counts, and individual queue item IDs never enter it.
- Omitted display names, raw payloads, source/customer identifiers, actors, reasons, signing references, and secrets, and fail-closed redacted any noncanonical diagnostic string that could carry private text.
- Added direct unit evidence for deterministic scope, queue aggregation, issue grouping, impossible-counter normalization, and forbidden-value absence.
- Exact-head run `31597255280` passed the baseline, fourteen migrations, all 613 pgTAP assertions, concurrency/property probes, and all four WooCommerce runtime variants.

## 2026-08-12 — Phase 9 WooCommerce localization foundation

- Registered the self-distributed plugin's `/languages` directory at WordPress `init`, avoiding the too-early translation loading rejected by current WordPress behavior.
- Added an exact POT template for all 38 connector strings and a bundled Slovenian catalog using the performant `.l10n.php` format supported by every declared WordPress version.
- Added a deterministic validator for literal text-domain use, exact/no-stale POT coverage, customer-string coverage, nonempty translations, and placeholder parity; the validator is part of `npm run check` through `woocommerce:validate`.
- Verified the installable ZIP includes both language artifacts and added a real `sl_SI` locale switch plus localized customer-navigation assertion to every minimum/current HPOS/legacy runtime cell.
- Exact-head run `31598618092` passed the baseline, fourteen migrations, all 613 pgTAP assertions, concurrency/property probes, and the Slovenian navigation assertion in all four WooCommerce runtime variants.

## 2026-08-12 — Phase 9 controlled customer-experience themes

- Added one revisioned theme per linked tenant workspace/programme group with composite tenant foreign keys, member-read RLS, no direct browser DML, and an owner/admin-only idempotent command that appends immutable audit evidence.
- Defined a strict v1 token contract for a canonical brand color with 4.5:1 white-text contrast, three local font stacks, bounded radius and copy, tier/reward visibility, and widget side. Raw CSS, font URLs, scripts, and uploads are rejected rather than stored.
- Added a responsive `/experience` merchant editor with live member-wallet and guest previews, honest unsaved/revision state, role-aware controls, and setup guidance for unlinked scope.
- Added 41 adversarial pgTAP assertions, six new unit tests across contracts/dashboard, an eighth keyboard-bypass route guard, and a production-build route check.
- Exact-head run `31600742177` passed the baseline, fifteen migration replays, all 654 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 customer activity filters

- Added allowlisted URL filters for order earnings/refunds, reward reservation/capture/cancel, release/expiry, and manual adjustment activity on the customer detail timeline.
- Kept the existing newest-first, RLS-scoped, 100-entry minimized database response as the only data source; filtering neither queries nor exposes raw commerce, identity, metadata, reason, actor, or request evidence.
- Added visible filtered/total counts and distinct no-wallet-history versus no-matching-activity states, with keyboard-focusable filter links.
- Added three adversarial unit tests for unknown/array query fallback, complete transaction-kind categorization, and stable non-mutating filtering; the full unit total is 109.
- Exact-head run `31601351946` passed the baseline, fifteen migration replays, all 654 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 controlled bulk customer adjustments

- Added a responsive owner/admin route for selecting 2–50 active customers and reviewing exact database-derived before/after balances, aggregate effect, reason, expiry, programme version, and SHA-256 preview evidence.
- Added a bounded preview contract plus atomic execution command that derives tenant/actor authority, locks balance rows in deterministic order, rejects stale approval, and preserves exact retry behavior after the original batch changes balances.
- Added immutable RLS-scoped batch/item evidence, one zero-sum ledger transaction and credit lot/debit allocation per customer, and one minimized aggregate administration audit event.
- Added 39 pgTAP assertions for non-mutating preview, canonical arithmetic/order, exact retry, stale/conflicting input, role/revocation/cross-tenant denial, evidence immutability, and projection rebuilds.
- Exact-head run `31603764054` passed all six jobs: sixteen migration replays, all 693 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 WooCommerce storefront budgets

- Documented and enforced a zero-byte connector JavaScript, zero-byte connector CSS, and zero hub-request budget for customer account/cart rendering and checkout behavior.
- Retained native WooCommerce markup and coupon application, capped one account response at 20 active rewards, and set explicit source/markup ceilings so future expansion requires review.
- Extended all minimum/current HPOS/legacy runtime cells to render account/cart loyalty surfaces during forced hub outage and assert bounded semantic asset-free output with no HTTP request.
- Exact-head run `31604654919` passed all six jobs, including every storefront assertion in all four localized WooCommerce runtime variants and the unchanged 693-assertion database gate.

## 2026-08-12 — Phase 9 hosted customer translations

- Added separate RLS-scoped, revisioned customer-copy rows for the explicit English and Slovenian launch locales, keyed by the existing linked tenant workspace/programme scope.
- Added an owner/admin-only idempotent save command with canonical request hashing and immutable audit evidence containing scope, locale, and revision but no translated text.
- Refactored the experience editor into independent design-token and translation forms with a live locale selector; existing saved English theme copy remains the fallback until explicitly translated.
- Added strict contracts and 33 pgTAP assertions for supported locales, input/markup bounds, direct-DML denial, independent revisions, retries/conflicts, role/revocation/tenant/mixed-scope denial, RLS, and audit immutability.
- Exact-head run `31606226276` passed all six jobs: 114 unit tests, seventeen migration replays, all 726 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 hosted guest loyalty delivery

- Added a responsive public route for one active workspace and published programme with explicit English/Slovenian switching, merchant-controlled safe theme tokens, localized approved copy, exact tier rates, and bounded reward presentation.
- Added one stable anonymous PostgreSQL projection capped at 12 tiers and 20 rewards. The response omits organization identity, customers, ledgers, raw programme/reward configuration, actors, audits, connectors, signing data, and commerce evidence; underlying tables remain unavailable to `anon`.
- Added malformed-ID rejection before PostgreSQL, mixed/unknown/suspended/unpublished fail-closed cases, a merchant launch link, exact bigint formatting tests, and 26 pgTAP assertions proving the narrow schema/function grants, minimization, and zero read-side effects.
- Exact-head run `31608392260` passed all six jobs: 119 unit tests, eighteen migration replays, all 752 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.
