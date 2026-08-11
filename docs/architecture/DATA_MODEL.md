# Data Model

The first migration establishes extensions and private/exposed schema conventions only. Domain tables will be added after Phase 1 semantics and Phase 2 review.

Rules:

- Tenant rows carry trusted organization/workspace relationships.
- Every table exposed through the Data API has RLS enabled and explicit grants.
- Privileged `security definer` functions live outside exposed schemas.
- Views exposed to clients use `security_invoker = true` on PostgreSQL 15+.
- Ledger rows are append-only; balances are rebuildable projections.
