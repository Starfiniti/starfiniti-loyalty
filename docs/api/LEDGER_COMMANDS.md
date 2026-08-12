# Ledger Command Boundary

- Contract version: `1`
- Database migration: `20260812045847_immutable_ledger_foundation.sql`
- TypeScript schemas: `packages/contracts/src/ledger.ts`

## Trust boundary

Ledger mutations are internal worker commands, not browser RPCs. `loyalty_worker` can execute the named commands but cannot insert, update, or delete ledger rows and cannot execute the generic posting primitive. Browser roles receive RLS-filtered read access only.

Every command carries an organization scope, tenant-scoped idempotency key, canonical SHA-256 request hash, immutable programme version, and effective timestamp. The caller derives organization and programme context from trusted connection/customer records rather than accepting them from an untrusted payload.

## Commands

| Command                | Required value/reference                             | Ledger effect                                              |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `award_points`         | customer, positive integer points, optional event    | programme issuance -> wallet pending                       |
| `release_points`       | original pending credit entry, expiry                | wallet pending -> available; creates one attributed lot    |
| `reserve_points`       | wallet, positive integer points                      | available -> reserved; allocates earliest-expiry lots      |
| `capture_reservation`  | reservation transaction                              | reserved -> spent                                          |
| `cancel_reservation`   | reservation transaction                              | reserved -> available; appends compensating allocations    |
| `expire_points`        | wallet, immutable programme version, as-of timestamp | available -> expired; consumes eligible lot remainders     |
| `reverse_award_points` | original award credit, amount, reason                | pending/available -> reversed with original attribution    |
| `adjust_points`        | wallet, signed amount, actor, reason, expiry         | adjustment control <-> available; negative is compensating |

Capture and cancel are mutually exclusive for a reservation. The same resolution idempotency key/hash returns the original result; a conflicting resolution fails without a second effect.

## Invariants and conflicts

- A transaction header is inserted only after all of its entries exist under a deferred foreign key.
- Header insertion rejects fewer than two entries or a non-zero sum.
- Transaction headers, entries, lots, and allocations reject update/delete; corrections append transactions.
- Same idempotency key and same hash returns `duplicate`; same key and a different hash fails.
- One canonical commerce event/kind/reference creates at most one ledger effect.
- Pending and reserved cannot become negative. Available can become negative only through explicit reversal/adjustment behavior.
- Reservation and lot locks use stable account/FIFO order. No command performs network I/O.

## Projections and operations

`wallet_balances` and `point_lot_balances` are caches, never authority. Difference and rebuild functions derive only from immutable entries/allocations. `export_ledger_entries` emits a tenant-scoped audit export, while `programme_liability_report` totals pending, available, reserved, and outstanding points by programme group.

The database gate includes 91 ledger pgTAP assertions and a two-session concurrency/property probe. The probe proves competing reservations cannot overspend and checks zero-sum/projection equality after deterministic mixed operations and idempotent retries.
