# ADR-0006: Immutable double-entry points ledger with rebuildable projections

- Status: Accepted
- Date: 2026-08-11
- Scope: Wallet authority, points states, expiry allocation, and corrections

## Context

Balances must survive retries, concurrent redemptions, refunds, expiry, reconciliation, and programme changes while remaining historically explainable. A mutable balance column or single-sided transaction log cannot independently prove conservation or reconstruct state.

## Decision

Use an immutable, organization-scoped double-entry points ledger.

- Every value operation creates one transaction and at least two signed entries whose point quantities sum to zero before commit.
- Accounts represent wallet buckets and programme control/contra accounts.
- Transactions store the immutable programme version, actor/source, correlation, tenant-scoped idempotency key, and canonical request hash.
- Ledger headers/entries cannot be updated or deleted by application roles. Corrections create compensating transactions.
- `wallet_balances` and lot remaining quantities are transactional projections that can be rebuilt from entries and allocations.
- Expiry and redemption use immutable lots/allocations ordered by earliest expiry.
- Concurrent wallet/lot operations lock in deterministic order and perform no network I/O inside the transaction.
- The approved negative-balance refund policy is expressed by compensating entries, never by rewriting prior awards.

## Alternatives

1. **Mutable wallet balance plus audit log.** Efficient reads, but audit records can drift from balance and partial failure cannot prove conservation.
2. **Single-sided immutable deltas.** Rebuildable, but issuance, state transfers, and liability cannot be balanced against a control account.
3. **Event sourcing without relational ledger constraints.** Flexible, but moves critical invariants into replay code and makes transactional redemption harder.

## Security and integrity effects

Database constraints/private commands prevent unexplained creation, duplicate effects, and direct edits. Tenant/account composite keys prevent cross-organization entries. Property/concurrency tests must prove balance conservation, idempotency, rebuild equality, and no double spend.

## Operations

Projection consistency checks run continuously and alert on any mismatch. Repair tooling produces compensating transactions or rebuilds projections; it never modifies ledger history. Ledger growth is measured before partitioning is introduced.

## Migration and rollback

The initial ledger begins empty. Future schema changes use expand/migrate/contract while preserving old readers. Published transactions are not rolled back destructively; a code rollback stops new commands and compensates incorrect effects using an audited migration/runbook.
