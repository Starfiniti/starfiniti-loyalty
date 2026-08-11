# Idempotency

Every mutation accepts or derives a stable tenant-scoped idempotency key. The server computes a canonical request hash and stores both key and result in the same authoritative transaction.

- Same key + same canonical hash returns the original status/result reference.
- Same key + different canonical hash returns `409 idempotency_conflict` and never executes.
- Unique delivery, canonical-event, business-effect, domain-command, and connector-command keys protect separate retry boundaries.
- Keys are never global across tenants and are retained at least through the source reconciliation/chargeback window.
- Database uniqueness and atomic `INSERT ... ON CONFLICT`/command functions enforce the guarantee; no check-then-insert race is allowed.
- Unknown external-call outcomes retry with the same connector command ID.
- A deadlock/serialization retry reuses the same key and canonical input.

Canonicalization is versioned. It normalizes object-key ordering and approved numeric/time representations but does not erase semantically meaningful fields. Hashes are diagnostic/integrity values, not authentication secrets.
