# ADR-0047: Content-addressed canonical migration and explicit identity resolution

- Status: Accepted
- Date: 2026-08-26
- Scope: M12 migration format, dry-run authority, privacy, adapter boundary, and later value application

## Context

Loyalty migrations arrive as balance snapshots with inconsistent identity and expiry evidence. Directly reading a vendor's WordPress tables would couple Starfiniti to private implementation details, require production database access, and make a rerun difficult to reproduce. Reusing the existing bulk-adjustment command would retain immutable ledger value, but its one-amount/50-customer shape does not preserve source-row, identity-resolution, lot, tier, referral, or import-batch evidence.

Official vendor documentation reviewed on 2026-08-26 confirms that the interchange formats are not uniform:

- [WPLoyalty documents](https://docs.wployalty.net/customers-levels-and-vip/importing-customers-and-points) CSV columns for lowercase `email`, `points`, and optional `referral_code`.
- [WooRewards documents](https://plugins.longwatchstudio.com/kb/data-management/) a JSON array with `email` and integer-string `points`, plus replace/add import modes.
- [YITH's current product documentation](https://yithemes.com/themes/plugins/yith-woocommerce-points-and-rewards/) confirms CSV import/export but does not publish a stable column-level contract.

Email-only exports are evidence for a source identity, not proof that an existing Starfiniti customer is the same person. The existing product invariant forbids merging customers by email alone. PostgreSQL must remain the final authority for tenant, programme, customer, wallet, and loyalty value.

## Alternatives

1. **Read vendor plugin tables directly.** This may capture richer history, but it requires privileged store access, binds migrations to undocumented schema versions, expands PII access, and makes clean-room replay dependent on mutable source state.
2. **Apply each exported balance through the existing bulk-adjustment command.** This uses the correct ledger primitive, but loses one-to-one source-row attribution, cannot represent different balances/expiries, and cannot bind owner approval to the complete import.
3. **Translate every supported source into one strict versioned document, resolve identities explicitly, fingerprint a value-free dry run, and apply it later through a dedicated opening-balance batch.** This adds an adapter layer but gives every source the same validation, approval, privacy, idempotency, reconciliation, and compensation semantics.

## Decision

1. `CanonicalMigrationDocumentV1` is the only input to migration validation. It carries source provenance, public programme selectors, an explicit expiry policy, bounded identity evidence, available/pending balances, optional exact lots, tier/referral state, and bounded source history. It accepts no organization, actor, internal customer, wallet, or ledger authority.
2. Imports are chunked to at most 500 canonical rows. Each row and source history/lot record has an opaque source identifier. Integer strings remain exact and within PostgreSQL `bigint`; floating-point points are rejected.
3. `preserve_exact` requires source lots to reconcile independently to available and pending balances. `apply_default` forbids mixing unverifiable lot evidence and binds one reviewed future expiry to the whole document.
4. Source identities may be WooCommerce customer IDs, Starfiniti public customer IDs, opaque source IDs, or canonical lowercase email. Email is transient adapter evidence only. It never becomes automatic match authority and never enters a dry-run receipt, audit event, log, or browser result.
5. Every row receives one explicit resolution: verified WooCommerce identity, reviewed existing customer, reviewed new customer, unresolved, or ambiguous. There is deliberately no `email_match` resolution basis. Duplicate source identities and multiple source rows targeting one existing customer invalidate the dry run.
6. The pure domain engine canonicalizes the document and resolution set, calculates exact totals, emits only allowlisted issue codes plus opaque row references, and derives a deterministic engine digest. Reordered resolution input produces the same digest.
7. PostgreSQL records only source/document/resolution/engine hashes, status, exact counts/totals, aggregate issue counts, actor, correlation, and its own database-derived approval hash. Raw exports, emails, identities, source rows, history, and lot payloads are not retained in the receipt or audit.
8. Receipt creation derives the Auth actor, tenant, active programme group, published programme version, role, and `migration` entitlement. It is immutable, tenant-RLS protected, content-addressed, idempotent, and value-free. A valid receipt is necessary but not sufficient to create value.
9. M12-S02 must re-present and independently revalidate the exact canonical document and row resolutions against the stored hashes inside a bounded application workflow. It then creates only traceable opening-balance ledger transactions and point lots. The browser cannot turn receipt totals into points.
10. A rerun of an applied source row creates no second effect. Corrections and rollback are dedicated compensating batches linked to the original import; no receipt, source row, ledger transaction, entry, or lot is edited.
11. Generic CSV, WPLoyalty, and WooRewards adapters may ship from their published formats plus checked-in fixtures. YITH remains fixture-gated until a representative redacted export establishes its exact columns. Guessing a vendor format is prohibited.

## Consequences

- The dry-run foundation can ship without a real vendor export and without risk of changing value.
- Email-only sources require merchant review or a separately verified WooCommerce/customer mapping; activation is slower but cannot silently merge people.
- Database receipts are intentionally insufficient to apply balances. M12-S02 repeats exact source and mapping verification at the value boundary.
- Large stores use multiple content-addressed chunks that later belong to one import batch; global totals and duplicate detection remain batch-level requirements.
- Unsupported or changed vendor formats fail into bounded validation errors rather than being interpreted heuristically.

## Rollout and rollback

Deploy the additive receipt table and function with `migration` disabled for managed tenants. Exercise invalid and valid value-free documents for Starfiniti, confirm RLS/audit minimization and zero ledger effects, then enable later identity/application slices separately. Rollback hides/stops new dry-run commands while retaining immutable receipts and audits. Because S01 writes no customers, wallets, ledger entries, lots, tiers, referrals, coupons, or connector commands, no value rollback is required.
