# ADR-0048: Strict ephemeral migration source adapters

- Status: Accepted
- Date: 2026-08-26
- Scope: M12-S03 generic CSV, WPLoyalty CSV, WooRewards JSON, error evidence, and format-change behavior

## Context

ADR-0047 makes `CanonicalMigrationDocumentV1` the only migration input and prohibits email matching, raw-export persistence, and vendor-specific value paths. M12-S03 must translate published source formats into that document without turning source parsing into a second authority boundary.

Official documentation rechecked on 2026-08-26 publishes two usable interchange shapes:

- [WPLoyalty](https://docs.wployalty.net/customers-levels-and-vip/importing-customers-and-points) requires lowercase `email` and `points` CSV columns and permits optional `referral_code`.
- [WooRewards](https://plugins.longwatchstudio.com/kb/data-management/) publishes a JSON array whose objects contain string `email` and integer-string `points`; its replace/add import mode is destination behavior and is not source balance evidence.

YITH confirms CSV import/export but still publishes no stable column contract. Supporting it by guessing would silently reinterpret merchant value when its export changes.

Source files may contain malformed encodings, duplicate headers or JSON properties, spreadsheet formulas, very large records, unrelated personal data, or ambiguous numeric types. Echoing rejected values into logs or downloadable errors would retain identities beyond the transient conversion boundary.

## Alternatives

1. **Accept flexible column mapping and coerce common values.** This is convenient, but a typo, reordered vendor field, decimal, or changed format can silently change loyalty value. It also makes reruns dependent on mutable mapping state.
2. **Store raw uploads and parse them asynchronously.** This simplifies retries and operator support, but creates a new sensitive-data store, retention/deletion burden, and source of accidental logging before the merchant has an approved canonical migration.
3. **Use exact versioned shapes in pure bounded translators, return only a canonical document or minimized row-addressable issues, and retain neither input nor raw rejected values.** This is less permissive but preserves reproducibility, privacy, and the existing S01/S02 authority boundaries.

## Decision

1. Adapters are pure functions over bounded `Uint8Array` input and validated public migration context. They have no database, filesystem, network, connector, provider, customer-resolution, or loyalty-value capability.
2. Every adapter declares an immutable ID and version. S03 supports `generic_csv_v1`, `wployalty_csv_v1`, and `woorewards_json_v1`. YITH remains unavailable until M12-S04 receives a representative redacted current export.
3. Input is limited to 5 MiB and strict UTF-8, with only an optional UTF-8 BOM. NULs, invalid byte sequences, bare carriage returns, and control characters fail closed.
4. WPLoyalty accepts exactly `email,points` or `email,points,referral_code` in documented order. WooRewards accepts an array of at most 500 objects with exactly one string `email` and one string `points`; duplicate properties, extra properties, JSON numbers, and nested values are rejected.
5. Generic CSV V1 uses the exact ordered header `source_row_id,identity_kind,identity_value,available_points,pending_points,source_lot_id,lot_bucket,lot_points,available_at,expires_at,source_tier_code,tier_qualified_at,source_referral_id,referral_state`. Repeated physical rows may add exact lots only when all customer-level fields are identical.
6. Empty optional values have one meaning; values are never trimmed or coerced. Points are canonical base-10 integer strings within PostgreSQL `bigint`. Timestamps, identifiers, emails, lot totals, expiry policy, and all cross-field rules are revalidated by `CanonicalMigrationDocumentV1`.
7. Non-empty cells beginning with `=`, `+`, `-`, or `@` are rejected before any error export. Error evidence contains only adapter ID/version, fixed issue code, fixed field name, one-based source row, total issue count, and a truncation count. It never echoes cells, emails, source JSON, or arbitrary exception text.
8. At most 100 issue rows are returned. A safe CSV error export serializes only the allowlisted issue fields and therefore cannot contain spreadsheet formulas or unrelated source columns.
9. Accepted input receives an exact SHA-256 over its bytes. Oversized input is rejected before hashing and carries a null source digest. The canonical SHA-256 uses the shared key-sorted serializer. Identical accepted bytes and context must produce the same document and digest. Adapters never create identity resolutions, dry-run receipts, customers, wallets, or ledger value.
10. WPLoyalty and WooRewards email identities remain transient evidence requiring the existing explicit review/create process. Referral codes become opaque active source referral state; no customer/channel identity is inferred from them.

## Security and integrity effects

- Exact headers and properties make vendor changes visible instead of silently changing points.
- Byte, row, field, issue, and integer bounds prevent source files from becoming an unbounded memory or error-amplification path.
- Duplicate email identities can be rejected without exposing the email because comparison uses a transient canonical identity representation. Evidence digests are never used as equality authority.
- Minimized errors are safe for merchant review and export but intentionally cannot diagnose a rejected identity by displaying its raw value; a future secure upload workflow may show source-local context without persistence.
- The canonical contract and S01/S02 PostgreSQL boundaries still independently reject invalid data, stale approvals, forged mappings, duplicate rows, and value replay.

## Operations

- Synthetic fixtures mirror the published formats and contain only reserved example identities. Each adapter has deterministic valid snapshots plus malformed header/property, encoding, formula, overflow, duplicate, and privacy tests.
- The merchant workflow must discard raw bytes and canonical rows after its bounded session or approved application request. Logs may record adapter ID, version, input byte count, source digest, status, and issue counts only.
- A format mismatch is an operator-visible unsupported-shape result, not a retryable infrastructure failure.

## Migration and rollback

S03 adds contracts and pure domain code only; it creates no schema or production value. Rollout exposes adapters disabled behind the later M12 workflow and enables one reviewed source/version at a time. Rollback removes or disables the affected adapter ID while keeping canonical documents, dry-run receipts, applied batches, ledger entries, and correction history readable. A changed vendor format receives a new adapter version and fixtures; the old parser is never loosened in place.
