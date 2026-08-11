# Idempotency

Unique source-event keys prevent duplicate ingestion; operation-level idempotency keys prevent duplicate ledger effects. Reusing a key with a different canonical payload is a conflict, not a replay. Keys and result references are tenant-scoped and retained long enough for reconciliation.
