# Migration source adapters

Status: M12-S03 repository implementation. The adapters are not exposed in production and cannot apply loyalty value.

## Authority boundary

Source adapters only translate bounded bytes into `CanonicalMigrationDocumentV1`. They do not receive an organization, actor, customer resolution, wallet, ledger account, points override, database client, or connector client. The existing dry-run command derives live Auth and tenant authority; the opening-balance command independently re-presents and revalidates the exact approved canonical document and explicit identity resolutions.

Raw source bytes and rejected values are ephemeral. An adapter result may contain the valid canonical document for the next review step or minimized issues, never both. Logs may contain adapter ID/version, byte count, source digest when available, status, and issue counts. They must not contain email, customer identifiers, CSV/JSON cells, canonical rows, or arbitrary parser exceptions.

## Common limits

- Adapter version: `1`
- Input: `Uint8Array`, maximum 5 MiB
- Encoding: strict UTF-8; one optional UTF-8 BOM
- Line endings: LF or CRLF; bare CR is rejected
- Canonical customers per document: 1–500
- Generic physical rows: at most 25,000, allowing up to 50 exact lots for each canonical customer
- Returned issues: first 100 plus exact total/truncated counts
- Points: non-negative base-10 integer strings within PostgreSQL `bigint`
- Formula defense: any non-empty cell beginning with `=`, `+`, `-`, or `@` is rejected

Oversized input is rejected before hashing or decoding. Accepted input receives an exact byte SHA-256. Canonical documents receive a separate SHA-256 over the shared key-sorted canonical JSON. Rerunning identical bytes with identical context produces the same result.

## `generic_csv_v1`

The first record must match this exact order:

```text
source_row_id,identity_kind,identity_value,available_points,pending_points,source_lot_id,lot_bucket,lot_points,available_at,expires_at,source_tier_code,tier_qualified_at,source_referral_id,referral_state
```

`identity_kind` is one of `woocommerce_customer_id`, `customer_public_id`, `source_customer_id`, or `email`. Values are not trimmed or coerced.

One physical record represents one customer without lot evidence or one exact lot. Multiple records may share `source_row_id` only to add lots; identity, bucket totals, tier, and referral fields must be byte-for-byte equivalent across those records, and `source_lot_id` must remain unique. `preserve_exact` requires available and pending lots to reconcile independently. `apply_default` requires empty lot fields and zero pending points. Source history is not accepted by Generic CSV V1.

Optional tier fields describe one source tier code and nullable qualification instant. Optional referral fields require an opaque source referral ID and one of `active`, `blocked`, or `closed`. Timestamps require an explicit `Z` or numeric offset.

## `wployalty_csv_v1`

Only the two currently published WPLoyalty headers are supported, in documented order:

```text
email,points
```

```text
email,points,referral_code
```

Email must already be canonical lowercase and remains transient source identity evidence. `referral_code`, when non-empty, becomes an opaque active source-referral ID. Because the export contains no lot/expiry evidence, this adapter requires a reviewed `apply_default` expiry policy. Email never creates an automatic existing-customer match.

## `woorewards_json_v1`

WooRewards input must be one JSON array containing 1–500 objects. Every object has exactly one string `email` and one string `points`, with no other, duplicate, numeric, null, array, or nested property:

```json
[
  { "email": "member-1@example.test", "points": "190" },
  { "email": "member-2@example.test", "points": "224" }
]
```

Property order and JSON string escaping do not change their meaning. Duplicate decoded properties still fail closed. WooRewards destination-side replace/add and multiplier controls are deliberately ignored: the exported total is treated as a reviewed opening-balance snapshot and no adapter may add it to existing Starfiniti value.

Like WPLoyalty, WooRewards provides no lot/expiry evidence, so this adapter also requires a reviewed `apply_default` expiry policy, including for zero-balance exports.

## Unsupported and changed formats

YITH is unavailable until a representative redacted current export establishes exact columns and semantics under M12-S04. Unknown headers/properties, reordered WPLoyalty headers, JSON numbers, extra source columns, and later vendor changes return `unsupported_header` or `unsupported_property`; there is no heuristic fallback.

A supported format change requires a new adapter ID/version, official or approved redacted fixtures, compatibility and privacy tests, migration notes, and an explicit rollout/rollback decision. Existing adapter behavior and historical canonical/ledger evidence are never changed in place.

## Support registry and selection

`MigrationAdapterRegistryV1` is the machine-readable source of adapter availability. It covers Generic CSV, WPLoyalty, YITH Points and Rewards, and WooRewards exactly once. Supported entries publish the exact adapter ID/version, reviewed evidence, LF-normalized reference-fixture SHA-256, expiry requirement, and parser limits. YITH publishes `fixture_required` and no parser authority.

Selection accepts only `sourceSystem`, `requestedAdapterId`, and `requestedAdapterVersion`. It happens before upload bytes enter a parser and rejects any tenant, actor, customer, wallet, points, or source-byte side channel. Exact selections return the recognized ID/version. Refusals return one of:

- `source_fixture_required`
- `adapter_id_mismatch`
- `adapter_version_mismatch`

Refusals never echo the requested selector or a source value. Reference-fixture hashes detect changes to reviewed repository examples; they are not merchant-export allowlists. Structurally valid exports with different rows and byte hashes remain valid and receive their own exact source digest.

Callers execute parsing through `adaptMigrationSourceV1`. It resolves the registry request first and dispatches only the exact selected adapter. A refusal returns `adapterResult: null` without hashing, decoding, or validating the untrusted payload/context. The raw vendor parser functions are deliberately absent from the domain package's public root export.

Changing a supported format requires a new immutable adapter ID/version, reference fixture, contract and privacy tests, migration note, and rollout/rollback review. To enable YITH, provide a representative redacted current export containing reserved or irreversibly anonymized identities; the review must establish exact column order, balance meaning, integer rules, expiry evidence, encoding, limits, and any referral/tier semantics before code is added.

## Minimized issue export

The safe error CSV contains only:

```text
adapter_id,adapter_version,issue_count,truncated_issue_count,row_number,code,field
```

All values come from fixed enums or bounded integers. No source column value is echoed, so spreadsheet formulas, email addresses, and unrelated personal data cannot enter the export. `row_number` is one-based in the source shape; file/header failures use row 1.

## Verification

Checked-in synthetic fixtures use reserved `example.test` identities. Contract/domain tests cover exact valid formats, deterministic reruns, source/canonical hashes, grouped lot ordering, expiry reconciliation, header/property drift, duplicate keys/identities/lots, row conflicts, missing/numeric/nested JSON values, UTF-8/BOM/line endings, points overflow, formula injection, 5 MiB and 500-row bounds, 100-issue truncation, safe CSV export, and rejection of caller tenant/actor/value fields.

## Merchant workflow

The `/migrations` route exposes a three-step English workflow to owners and admins when the tenant migration entitlement is enabled:

1. Choose a pinned source format, export reference and timestamp, expiry policy, optional WooCommerce identity store, and one file up to 5 MiB. Inspection parses request-local bytes and returns source rows only to the authenticated review; it writes nothing.
2. Explicitly choose `create_new`, an existing customer public ID, or `unresolved` for every opaque source row. The server re-parses the file, derives identity fingerprints and resolution bases, runs the canonical engine, and stores a minimized dry-run receipt. It never matches by email.
3. Review exact matched/new/unresolved counts, point totals, and approval digest. Application requires explicit confirmation and re-presents the same file and mappings. The server and PostgreSQL independently recompute and verify the receipt before any opening-balance ledger entry is appended.

The file must be selected again after a refresh. This is intentional: uploads, canonical rows, source identities, and mappings are not stored in the database, local storage, cookies, URLs, or analytics. Server Action transport allows 6 MiB only for multipart overhead; the adapter still rejects more than 5 MiB.

The route retains read-only receipt and batch history after feature disable. Reconciliation exposes exact item, lot, transaction, credit-entry, pending-release, and correction counts/totals without source identities. A correction appends compensating transactions and never edits imported history.
