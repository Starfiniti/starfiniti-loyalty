# ADR-0099: Make SAST extension-aware and bind provider credentials with a tenant KDF

- Status: Accepted
- Date: 2026-08-29
- Corrects: ADR-0098's attribution of the first two minimized CodeQL results
- Extends: ADR-0033, ADR-0063, ADR-0097, and ADR-0098

## Context

Security run `33254530449` analyzed exact candidate
`e71e62d19416288e0c8449ef184e3587e3d33990` and merge commit
`00e1726023023baa7b7eda535dbc3295907fb80c` with CodeQL 2.26.4. CI run
`33254530487`, DAST, and supply-chain jobs passed, but the CodeQL policy job
failed. Its minimized artifact `9715410381` has archive digest
`sha256:865c61105dab50027622c1fc7dcab7d8218ed2b61075e09180c54aad4cc9836d`
and contains three unclassified raw results:

- `js/file-system-race` in deployment preflight;
- `js/insecure-temporary-file` in the fault-injection input reader; and
- `js/insufficient-password-hash` in the Klaviyo API-key fingerprint.

Restricted analysis inspection retained no raw SARIF in the repository. It
showed that CodeQL 2.26.4 places the query definitions and their direct
`security-severity` properties under `run.tool.extensions[].rules`, while the
minimizer indexed only `run.tool.driver.rules`. GitHub surfaced the new
filesystem race as open alert 24, but the other two raw results matched older
dismissed alerts 15 and 16. The M15 policy intentionally evaluates every raw
result and does not treat a provider dismissal as release authority.

ADR-0098 incorrectly inferred that the two pre-existing results came from the
security-summary fixture writer and tenant-federation client-secret binding.
Its explicit `0600` fixtures and purpose-separated federation HMAC remain useful
hardening, but they did not remove those two raw results. Historical evidence is
not rewritten; this ADR corrects the attribution and supersedes that part of the
decision.

Official CodeQL guidance for CWE-367 recommends operating on file descriptors
instead of checking a path and later opening it. CodeQL recommends scrypt,
PBKDF2, bcrypt, or Argon2 for a retained credential verifier. Node.js provides
both `O_NOFOLLOW` descriptor flags and synchronous scrypt with explicit cost,
block-size, parallelism, memory, salt, and output-length parameters.

## Alternatives

1. **Accept the GitHub dismissals.** Rejected. The repository's stronger raw
   result policy would become dependent on mutable provider-side triage and
   would disagree with its retained artifact.
2. **Add CodeQL suppression comments.** Rejected. The current comments did not
   remove the raw findings, and blanket suppression would hide future semantic
   drift at the same location.
3. **Keep fast SHA-256 for the high-entropy Klaviyo key.** Rejected for this
   release gate. The existing reasoning was defensible for a provider key, but
   a database disclosure still retained a fast deterministic oracle and the
   raw High result remained.
4. **Add a second mounted pepper for Klaviyo.** Rejected for now. It would add a
   new managed-worker secret, provisioning path, backup input, and rotation
   protocol when a connection-bound KDF can strengthen the existing one-way
   binding without remote authority.
5. **Use a connection-bound scrypt fingerprint.** Selected. It preserves the
   database's exact 32-byte/64-hex shape, makes equal provider keys distinct
   across connections, adds bounded offline-guessing cost, and is computed once
   at worker startup rather than per notification.

## Decision

1. Build the CodeQL rule index from both the driver and every tool extension.
   Missing, malformed, or duplicate rule IDs fail closed. A result resolves its
   exact rule ID before security-score classification; extension metadata is
   covered by the self-test.
2. Continue treating every Critical, High, or unknown raw result as blocking,
   including results GitHub marks dismissed. Provider alert state is useful
   triage history, not repository release authority.
3. Open deployment federation inputs first with `O_RDONLY|O_NOFOLLOW`, validate
   and read only the returned descriptor, then confirm the path still names the
   same unlinked inode. Do not check a path and later open it.
4. Open fault-exercise inputs through the same explicit read-only/no-follow
   descriptor boundary and supply an owner-only `0600` creation mode as a
   fail-safe. Node ignores that third argument for a read-only open, while it
   prevents an insecure default if a later refactor ever adds a creation flag.
   Remove the ineffective CodeQL dismissal comment.
5. Replace the Klaviyo fast SHA-256 fingerprint with scrypt using:
   - context `starfiniti/klaviyo/credential-fingerprint/v2`;
   - the canonical lowercase connection UUID in the salt;
   - `N=32768`, `r=8`, `p=1`, and `maxmem=64 MiB`; and
   - a 32-byte output encoded as 64 lowercase hex characters.
6. Retain `credentialSha256` as a legacy database/runtime field name. It now
   carries the V2 scrypt result and is not a raw SHA-256 digest.
7. Provide `npm run klaviyo:fingerprint -- --connection-id <uuid> --key-file
<absolute-owner-file>` so an operator can provision the exact database value
   without printing or storing the provider key. The command opens one bounded
   owner-only regular file through a stable no-follow descriptor and prints
   only the fingerprint.

## Security and integrity effects

The summarizer can no longer lose a High score merely because CodeQL publishes
the query pack as an extension. A dismissed result cannot silently pass the
repository gate. The file readers no longer have a check-then-open namespace
window. The Klaviyo database binding is connection-specific and materially more
expensive to guess offline while remaining non-authoritative: tenant,
connection, entitlement, consent, suppression, lease, and operation authority
still come from PostgreSQL.

Scrypt runs only during Klaviyo worker configuration or the explicit operator
command. It is not on checkout, ledger, notification preparation, or per-message
delivery paths. Self-hosted and disabled managed deployments do not read a
Klaviyo key or invoke the KDF.

## Operations

Generate a connection fingerprint only from the exact release source with the
documented `npm run klaviyo:fingerprint` command. Keep the API key file outside
Git and the environment, owner-only, and mounted only into the disabled
Klaviyo worker. Compare the printed fingerprint to the disabled private
connection row through a separate administrator channel; never log the command
input, provider key, or database administration session.

## Migration and rollback

No production Klaviyo connection, credential, or delivery is active. Before a
future canary, derive the V2 fingerprint for the exact connection UUID and API
key, update the still-disabled private connection row, then start the matching
worker image. A fingerprint mismatch fails database authorization before
contact disclosure or provider work.

Rollback stops only the Klaviyo worker. Rolling back to a V1 image also requires
restoring the disabled connection row's prior SHA-256 fingerprint before that
worker can be re-enabled; never accept both algorithms concurrently. Notification
facts, preferences, suppressions, attempts, and loyalty value remain unchanged.
The deployment-preflight and fault-reader changes have no production mutation
or schema effect.

## Verification

```sh
node scripts/summarize-security-scan.mjs --self-test
node scripts/fingerprint-klaviyo-credential.mjs --self-test
npm run test --workspace=@starfiniti/worker -- src/klaviyo-delivery.test.ts
npm run faults:validate
npm run deployment:validate
npm run security:validate
npm run check
```

The next exact-head CodeQL artifact must resolve extension scores and contain
zero Critical, High, or unknown results. The GitHub code-scanning view must also
mark alert 24 fixed; alerts 15 and 16 may retain their historical dismissal
state, but their raw query results must disappear from the new analysis.

Candidate `ccf1d897839448cfe150061af5b649f3937e0097` and merge analysis
`01c3af5b7fc946b2cf7316ca8a64f661c9c37675` proved the parser and two of the
three remediations: minimized artifact `9715725207` classified the only
remaining raw result as High, `js/insecure-temporary-file`, at the read-only
fault input. CodeQL models an OS-temporary-directory open as a creation sink
when the call omits a secure mode, independent of the read-only flag. The
explicit `0600` fail-safe above is therefore part of this decision, and a later
exact-head zero-result artifact remains required.

Final candidate `fe8a6ff9881596a4800b093ac2433da1fe35d685` passed CI run
`33255970171` and Security run `33255970172`. CodeQL 2.26.4 analysis
`1691796393` at merge commit `7732495889feda477c9f3a757ebba5652b5c2d03`
contains zero raw results. Minimized artifact `9715823372`, archive digest
`sha256:939f29e3c82b3bb1d8954a92384ed5f944de103f489d06721978f1a9177b877e`,
records zero Critical, High, Medium, Low, and unknown findings. DAST,
supply-chain, recovery transport, database, containers, baseline, and all four
WooCommerce runtime jobs passed on the same candidate.

## References

- CodeQL file-system race query: https://codeql.github.com/codeql-query-help/javascript/js-file-system-race/
- CodeQL insufficient password hash query: https://codeql.github.com/codeql-query-help/javascript/js-insufficient-password-hash/
- Node.js `scryptSync`: https://nodejs.org/api/crypto.html#cryptoscryptsyncpassword-salt-keylen-options
- Node.js file-system flags: https://nodejs.org/api/fs.html#file-system-flags
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
