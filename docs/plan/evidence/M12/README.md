# M12 Evidence — Migration framework

Status: M12-S01 is exact-head green and complete on `codex/m12-migration`. M12-S02 opening-balance application is active and has no production enablement or imported production value.

## M12-S01 canonical format and value-free dry run

- Decision: ADR-0047 selects a vendor-neutral canonical document, explicit non-email identity authority, deterministic domain validation, and a minimized content-addressed PostgreSQL receipt. A receipt is necessary but never sufficient for later value application.
- Official source evidence: WPLoyalty publishes `email`, `points`, and optional `referral_code` CSV fields; WooRewards publishes an `email`/integer-string `points` JSON array; YITH confirms CSV import/export but publishes no stable columns and therefore remains redacted-fixture gated.
- Contract: strict V1 source, identity, balances, exact lots, expiry policy, tiers, referrals, history, explicit resolutions, value-free result, and receipt command/result schemas. Inputs accept public programme selectors and no tenant, actor, wallet, ledger, or browser-supplied customer authority.
- Domain: deterministic canonical hashing, exact `BigInt` totals, order-independent resolution evidence, source-identity and target-customer duplicate detection, fingerprint mismatch rejection, unresolved/ambiguous failure, and PII-free output.
- Database: additive immutable tenant-RLS receipt evidence with exact role/grant boundaries, live owner/admin Auth authority, published-programme and migration-entitlement checks, database-derived approval hash, content-addressed and idempotency-key replay, minimized audit, and no raw rows or identities.
- Value isolation: the S01 function does not create or update customers, identities, wallets, balances, ledger transactions, entries, lots, tiers, referrals, coupons, commerce events, connector commands, or provider work.
- Exact-head evidence: [CI run 32937499899](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32937499899) at `d8d223a633604ef0021ee9392ccc4f19036b8dde` passed all seven jobs: root `npm run check`, secret/audit/licence/package gates, both production images, clean replay of all 68 migrations, all 55 pgTAP files/2,955 assertions, all 12 concurrency probes, and minimum/current WooCommerce in HPOS/legacy modes.
- The first run correctly failed because two independent exposed-function inventories had not reviewed the new command. The exact signature/name were added without relaxing either query; the full rerun then passed.

## M12-S02 opening-balance application — active

- Contracts now distinguish complete application and compensating-correction commands and reject unresolved identities or missing WooCommerce store authority.
- The domain emits stable exact canonical document/resolution JSON for PostgreSQL hash revalidation after input reordering.
- The additive database implementation under verification derives tenant/actor/programme/customer/wallet authority, fences source rows, posts explicit immutable opening-balance transactions and FIFO lots, schedules exact pending-lot releases before expiry, and appends correction batches instead of rewriting value.
- S02 remains incomplete until clean migration replay, its full pgTAP/adversarial matrix, two-session concurrency, projection/liability reconciliation, and exact-head CI pass.

## Later slices

- M12-S03: generic CSV, WPLoyalty, and WooRewards adapters with official-format fixtures and bounded error export.
- M12-S04: YITH plus any changed vendor format only after representative redacted fixtures; no heuristic production parsing.
- M12-S05: merchant dry-run/mapping/approval/reconciliation workflow and before/after reports.
- M12-S06: disabled deployment, canary, rerun, reconciliation, rollback, observation, and score gate.
