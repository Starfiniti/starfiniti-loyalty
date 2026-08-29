# ADR-0098: Key federation credential fingerprints and secure scan fixtures

- Status: Accepted
- Date: 2026-08-29
- Supersedes: ADR-0069's three-file tenant-federation activation set
- Extends: ADR-0053 and ADR-0097

## Context

The first retained CodeQL summary for ADR-0097 failed closed but classified two
findings as unknown because CodeQL SARIF 2.1.0 encodes query security scores in
`properties.tags` entries such as `security-severity/8.1`, not only in the
optional direct `security-severity` property. Restricted inspection identified
the rules without retaining their paths: `js/insecure-temporary-file` has
security severity 7.0 and `js/insufficient-password-hash` has security severity
8.1.

The temporary-file result reached self-test fixtures written below an operating
system temporary directory without an explicit file mode. The password-hash
result exposed a deeper design defect: a merchant-supplied upstream OIDC client
secret was reduced to plain SHA-256 before the digest entered a versioned
command. The raw secret remained request-local, but a database, trace, or command
evidence disclosure would permit offline guesses when a provider issued a weak
secret. Raising the minimum length cannot prove entropy.

The command and database fields are named `clientSecretSha256` and
`brokerSecretSha256` and intentionally accept exact 64-character lowercase hex.
They are not password verifiers or authentication authority; they bind a
write-only value to one idempotent orchestration request. Changing their shape
would require an unnecessary V2 command and migration while tenant federation
is still disabled in production.

Current Node.js documentation provides HMAC-SHA256 with a secret key generated
from cryptographic entropy. OWASP distinguishes a slow salted password verifier
from a separately stored secret pepper and documents HMAC as the keyed boundary.
CodeQL recommends a slow KDF for retained password verifiers and requires
temporary files to be inaccessible and exclusively created.

## Alternatives

1. **Suppress CodeQL and require 32-character provider secrets.** Rejected
   because character count is not entropy, the digest still enables offline
   guessing, and a suppression would erase a deterministic High finding.
2. **Use scrypt, PBKDF2, or Argon2 with a per-command salt.** Rejected for this
   transient equality-binding use. A slow password verifier is appropriate when
   the application must authenticate an unknown future password; here both the
   raw value and expected binding are already present in one bounded server
   request. A salt would also require a contract and schema change or an unsafe
   fixed salt.
3. **Encrypt the upstream secret in the command.** Rejected because the command,
   database, audit, and browser need no recoverable secret. Encryption would add
   decryption authority and breach impact.
4. **Use a domain-separated HMAC-SHA256 binding under a dedicated deployment
   key.** Selected. It preserves the 64-hex V1 shape while database-only evidence
   cannot be used to test guesses without the separately mounted key.

## Decision

1. Parse CodeQL security scores from both the direct property and exact
   `security-severity/<number>` tags on results or rules. A malformed, absent
   value after declaration, or conflicting score is `unknown` and remains
   release-blocking. The ordinary SARIF level is used only when no security
   score was declared.
2. Create every security summarizer self-test fixture with an explicit POSIX
   `0600` mode. Atomic output already uses an exclusive random path, `0600`, and
   rename publication.
3. Generate one canonical base64-encoded 256-bit tenant-federation fingerprint
   key outside Git. Mount it read-only only into the dashboard. Environment,
   browser, worker, database, audit, logs, and retained scan evidence receive no
   key bytes.
4. Replace plain upstream and broker secret digests with HMAC-SHA256 over an
   exact versioned context, a NUL separator, an allowlisted purpose
   (`upstream-client-secret` or `broker-client-secret`), a second separator, and
   the raw secret. Separate purposes prevent one credential class from
   substituting for the other.
5. Preserve the V1 `*Sha256` field names and 64-lowercase-hex contracts as legacy
   wire names. They now carry HMAC-SHA256 fingerprints, not unkeyed digests and
   never password verifiers. The caller's Auth session is verified before any
   fingerprint key is read; timing-safe equality remains mandatory before
   tenant database preparation or external IdP administration.
6. Supersede the optional tenant-federation deployment set with four distinct,
   absolute, owner-only files: configuration, Authentik API token, Supabase
   service-role key, and fingerprint key. Zero files keeps the feature disabled;
   any partial, duplicate, linked, nonregular, permissive, wrong-owner,
   malformed, or noncanonical key set fails a no-follow stable-file preflight.

## Security and integrity effects

A database or minimized command-evidence compromise no longer gives an attacker
an offline oracle for weak upstream client secrets. Compromising the dashboard
and its mounted key remains sufficient to compute fingerprints, so the key is
defense in depth rather than new organization authority. Live PostgreSQL
membership, entitlement, source state, revision, and RLS remain authoritative;
neither the key nor its fingerprint grants a tenant or role.

Rotating the fingerprint key changes deterministic request bindings. It must be
treated as a deployment event after pending federation actions are reconciled.
Historical revisions and external provider credentials remain valid because
the fingerprint is not used for login or provider authentication.

The SARIF parser cannot downgrade a declared High score through a warning level
or conflicting metadata. Retained blocked summaries still contain counts,
rules, severity, and coarse scope only, never a path, line, message, snippet, or
raw match.

## Consequences

- Disabled self-hosted deployments remain usable with all four optional paths
  empty and make no Authentik or Supabase administration call.
- Enabling tenant federation requires one additional owner-controlled 32-byte
  key file and dashboard recreation.
- Existing V1 contracts, additive database migrations, RLS, idempotency keys,
  immutable revisions, and external provider topology remain compatible.
- This repair does not prove the enterprise IdP canary, production activation,
  penetration test, finding reconciliation, or security-owner approval.

## Operations

Generate the key with a restrictive umask, store only the canonical base64
value, then set dashboard ownership and mode `0400`. Do not copy it into the
environment file or database. Back it up only through the same encrypted secret
escrow as the Authentik and Supabase administration credentials.

Before an approved rotation, disable or reconcile every pending federation
action, replace the file atomically, recreate only the dashboard, rerun
deployment preflight, and exercise create/rotate/retry failure cases in the
enterprise IdP test tenant. A mismatched old/new key fails before database or
provider mutation.

## Migration and rollback

Production has no tenant-federation administration files or active tenant IdP,
so repository adoption changes no live identity, session, membership, database,
container, checkout, connector, or loyalty value. Rollback keeps federation
disabled, restores the prior dashboard image and complete prior file set, and
preserves immutable evidence. Never reintroduce plain SHA-256 or waive the High
finding to restore a green scan.

## Verification

```sh
node scripts/summarize-security-scan.mjs --self-test
npm run test --workspace=@starfiniti/dashboard -- \
  app/organization/access/federation-actions.test.ts \
  lib/server/federation-management-config.test.ts \
  lib/server/tenant-federation.test.ts
npm run deployment:validate
npm run security:validate
npm run architecture:validate
npm run check
```

Exact-head CodeQL must classify both historical rules as High and then report
zero Critical, High, or unknown results after this correction.

## References

- Node.js Crypto `createHmac`: https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
- CodeQL insufficient password hash: https://codeql.github.com/codeql-query-help/javascript/js-insufficient-password-hash/
- CodeQL insecure temporary file: https://codeql.github.com/codeql-query-help/javascript/js-insecure-temporary-file/
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
