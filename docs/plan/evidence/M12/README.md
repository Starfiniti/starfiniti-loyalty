# M12 Evidence — Migration framework

Status: M12-S01 repository implementation is active on `codex/m12-migration`; clean Linux replay and exact-head CI evidence are not recorded yet. No production migration is enabled and no loyalty value has been imported.

## M12-S01 canonical format and value-free dry run

- Decision: ADR-0047 selects a vendor-neutral canonical document, explicit non-email identity authority, deterministic domain validation, and a minimized content-addressed PostgreSQL receipt. A receipt is necessary but never sufficient for later value application.
- Official source evidence: WPLoyalty publishes `email`, `points`, and optional `referral_code` CSV fields; WooRewards publishes an `email`/integer-string `points` JSON array; YITH confirms CSV import/export but publishes no stable columns and therefore remains redacted-fixture gated.
- Contract: strict V1 source, identity, balances, exact lots, expiry policy, tiers, referrals, history, explicit resolutions, value-free result, and receipt command/result schemas. Inputs accept public programme selectors and no tenant, actor, wallet, ledger, or browser-supplied customer authority.
- Domain: deterministic canonical hashing, exact `BigInt` totals, order-independent resolution evidence, source-identity and target-customer duplicate detection, fingerprint mismatch rejection, unresolved/ambiguous failure, and PII-free output.
- Database: additive immutable tenant-RLS receipt evidence with exact role/grant boundaries, live owner/admin Auth authority, published-programme and migration-entitlement checks, database-derived approval hash, content-addressed and idempotency-key replay, minimized audit, and no raw rows or identities.
- Value isolation: the S01 function does not create or update customers, identities, wallets, balances, ledger transactions, entries, lots, tiers, referrals, coupons, commerce events, connector commands, or provider work.
- Local evidence currently passing: seven focused contract tests, six focused domain tests, both affected typechecks, formatting, and static validation of 68 migrations/55 pgTAP files. The focused database file plans 50 grant/RLS/role/tenancy/entitlement/idempotency/immutability/privacy/minimization/no-ledger assertions, and a twelfth two-session probe covers concurrent content deduplication.

## Pending S01 closeout

- Clean 68-migration replay and all 55 pgTAP files on Linux CI.
- Adversarial diff review, exact-head root baseline, both production images, concurrency suite, and WooCommerce matrix.
- Update this evidence with exact run/commit and only then mark M12-S01 complete.

## Later slices

- M12-S02: explicit identity mapping, exact revalidation, opening-balance ledger application, source-row idempotency, lots/expiry, and compensating correction batches.
- M12-S03: generic CSV, WPLoyalty, and WooRewards adapters with official-format fixtures and bounded error export.
- M12-S04: YITH plus any changed vendor format only after representative redacted fixtures; no heuristic production parsing.
- M12-S05: merchant dry-run/mapping/approval/reconciliation workflow and before/after reports.
- M12-S06: disabled deployment, canary, rerun, reconciliation, rollback, observation, and score gate.
