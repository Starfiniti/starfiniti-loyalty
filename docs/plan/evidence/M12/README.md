# M12 Evidence — Migration framework

Status: M12-S01 and M12-S02 are exact-head green and complete on `codex/m12-migration`. M12-S03 strict stable-source adapters are active. There is no production enablement or imported production value.

## M12-S01 canonical format and value-free dry run

- Decision: ADR-0047 selects a vendor-neutral canonical document, explicit non-email identity authority, deterministic domain validation, and a minimized content-addressed PostgreSQL receipt. A receipt is necessary but never sufficient for later value application.
- Official source evidence: WPLoyalty publishes `email`, `points`, and optional `referral_code` CSV fields; WooRewards publishes an `email`/integer-string `points` JSON array; YITH confirms CSV import/export but publishes no stable columns and therefore remains redacted-fixture gated.
- Contract: strict V1 source, identity, balances, exact lots, expiry policy, tiers, referrals, history, explicit resolutions, value-free result, and receipt command/result schemas. Inputs accept public programme selectors and no tenant, actor, wallet, ledger, or browser-supplied customer authority.
- Domain: deterministic canonical hashing, exact `BigInt` totals, order-independent resolution evidence, source-identity and target-customer duplicate detection, fingerprint mismatch rejection, unresolved/ambiguous failure, and PII-free output.
- Database: additive immutable tenant-RLS receipt evidence with exact role/grant boundaries, live owner/admin Auth authority, published-programme and migration-entitlement checks, database-derived approval hash, content-addressed and idempotency-key replay, minimized audit, and no raw rows or identities.
- Value isolation: the S01 function does not create or update customers, identities, wallets, balances, ledger transactions, entries, lots, tiers, referrals, coupons, commerce events, connector commands, or provider work.
- Exact-head evidence: [CI run 32937499899](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32937499899) at `d8d223a633604ef0021ee9392ccc4f19036b8dde` passed all seven jobs: root `npm run check`, secret/audit/licence/package gates, both production images, clean replay of all 68 migrations, all 55 pgTAP files/2,955 assertions, all 12 concurrency probes, and minimum/current WooCommerce in HPOS/legacy modes.
- The first run correctly failed because two independent exposed-function inventories had not reviewed the new command. The exact signature/name were added without relaxing either query; the full rerun then passed.

## M12-S02 opening-balance application — complete

- Contracts distinguish complete application and compensating-correction commands and reject unresolved identities or missing WooCommerce store authority. Stable exact canonical document/resolution JSON survives input reordering for PostgreSQL hash revalidation.
- The additive database boundary derives tenant, actor, programme, customer, wallet, and value authority; it never accepts caller points or internal selectors. Every source row is unique per exact source export and is locked in deterministic order before customer or ledger mutation.
- Every imported point traces to one immutable batch, opaque source row, identity decision, programme version, opening transaction, zero-sum entries, and exact available or pending lot. Pending lots remain pending before their source timestamp, release once at that exact instant, create the original-expiry FIFO lot, and retry without another effect.
- Corrections append linked batches and balanced compensating transactions. The tests prove available and released-pending corrections, immutable import evidence, exact wallet-projection rebuild, source-row/lot totals, minimized audit, role revocation, and cross-tenant denial.
- The thirteenth two-session probe races two independently valid receipts for the same source row: one atomic opening balance commits, the loser returns the minimized duplicate-source error before any customer/wallet/ledger side effect, and the winner retries as the same batch.
- Exact-head evidence: [CI run 32940585673](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32940585673) at `dc8ea3cefd0f1feee8b68e32d3bb7904d3c9f2ac` passed all seven jobs: root checks, secret/audit/licence/package gates, both production images, clean replay of all 69 migrations, all 56 pgTAP files/3,011 assertions, all 13 concurrency probes, and minimum/current WooCommerce in HPOS/legacy modes.
- The first lifecycle test run stopped because the CI database owner correctly cannot impersonate the no-login worker role. Behavior continues under the privileged test owner while the separate ACL assertion proves only `loyalty_worker` receives production execute authority; the exact-head rerun passed without relaxing grants.

## Later slices

- M12-S03 (active): generic CSV, WPLoyalty, and WooRewards adapters with official-format fixtures and bounded error export.
- M12-S04: YITH plus any changed vendor format only after representative redacted fixtures; no heuristic production parsing.
- M12-S05: merchant dry-run/mapping/approval/reconciliation workflow and before/after reports.
- M12-S06: disabled deployment, canary, rerun, reconciliation, rollback, observation, and score gate.
