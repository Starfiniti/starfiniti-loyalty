# ADR-0049: Versioned migration adapter registry and fail-closed selection

- Status: Accepted
- Date: 2026-08-26
- Scope: M12-S04 source support discovery, adapter/version selection, reference-fixture drift, and YITH availability

## Context

ADR-0048 fixes three exact source adapters, but callers still need one authoritative way to discover whether a source is supported and select the exact parser version. Inferring support from an exported function name, media type, uploaded header, or vendor marketing claim would let a new or unknown format reach parsing before a reviewed semantic boundary exists.

Reference fixtures are useful drift evidence, but real merchant exports contain different rows and therefore different byte hashes. Treating a synthetic fixture hash as an upload allowlist would reject every legitimate export; ignoring fixture provenance would make unnoticed edits to the reviewed shape possible.

YITH advertises import/export but does not publish a stable column-level export contract. No representative redacted current export has been approved, so there is no evidence for field names, balance semantics, expiry behavior, or a safe adapter version.

## Alternatives

1. **Select a parser from extension, content type, or sniffed headers.** This is convenient, but it touches untrusted source bytes before support is established and makes unknown versions look recoverable through guesses.
2. **Use one mutable adapter per vendor.** This minimizes catalogue work, but later vendor changes silently alter historical behavior and make old imports difficult to reproduce.
3. **Publish one versioned metadata-only registry and require an exact source/adapter/version match before bytes reach a parser.** Keep reviewed reference-fixture hashes as repository drift evidence, while strict structural parsers—not fixture-byte hashes—validate merchant exports.

## Decision

1. `MigrationAdapterRegistryV1` contains exactly one entry for every canonical migration source system. Source systems and supported adapter IDs are unique.
2. Supported entries declare an immutable adapter ID/version, format, evidence kind/reference/check date, LF-normalized UTF-8 reference-fixture SHA-256, expiry-policy requirement, and byte/physical-row/canonical-row limits.
3. A `fixture_required` entry carries no adapter ID/version, fixture digest, expiry authority, or parser limits. It cannot be selected.
4. `resolveMigrationAdapterV1` accepts only a known source system plus a syntactically bounded requested adapter ID/version. It accepts no upload bytes, tenant, actor, customer, wallet, ledger, points, filesystem, network, or connector capability.
5. Exact matches return `selected`. YITH returns `source_fixture_required`; unknown well-formed IDs return `adapter_id_mismatch`; changed positive integer versions return `adapter_version_mismatch`. Refusals expose no caller selector or source value.
6. The registry is version `1`. A changed format receives a new immutable adapter ID/version, reference fixture, contract/domain tests, migration note, rollout decision, and rollback decision. Existing parsers are never loosened in place.
7. Reference-fixture hashes protect the reviewed repository examples from silent drift. They are not merchant-file allowlists: any different export that satisfies the exact structural adapter remains valid and receives its own exact source-byte digest.
8. YITH remains `fixture_required` until an approved representative redacted export establishes exact columns and semantics. That future input creates a new reviewed adapter; it does not change the current unavailable entry in place without a registry-version decision.
9. `adaptMigrationSourceV1` is the domain package's public execution choke point. It resolves first, invokes only the exact selected parser, and returns a typed selection plus adapter result. A refusal returns no adapter result and does not hash, decode, or validate source context. Raw parser functions remain module-internal and are not exported from the package root.

## Security and operational effects

- Support selection occurs before source bytes enter parsing, so an unavailable vendor cannot trigger hashing, decoding, heuristic parsing, context validation, or raw-value errors.
- The request contract rejects source bytes and caller authority fields; the minimized result contains only fixed source/status/adapter/refusal metadata.
- Reference fixtures contain reserved example identities only. Their published SHA-256 is computed after LF normalization solely to avoid checkout line-ending differences.
- Evidence references are informational provenance, never runtime dependencies. Provider or documentation outages cannot change selection.

## Rollout and rollback

S04 is repository-only and exposes no production upload route. Rollout enables the registry in the later merchant workflow before any adapter invocation. Rollback disables registry selection or removes the new workflow while retaining canonical documents, dry-run receipts, applied batches, corrections, and historical adapter IDs. A supported adapter may be changed to an unavailable status in a new registry version without invalidating prior evidence.
