# ADR-0097: Bind prototype host messages and retain minimized SAST evidence

- Status: Accepted
- Date: 2026-08-29
- Extends: ADR-0064 and ADR-0082

## Context

The exact PR-ref CodeQL API exposed two open Medium
`js/missing-origin-check` results in the vendored design-prototype runtime even
though the CodeQL job and the repository policy check were green. Both handlers
accepted host/editor state from `message` events before authenticating the
sender. The files are documentation assets rather than deployed application
code, but they are executable browser prototypes and remain an attack surface
when opened or embedded.

A green CodeQL action conclusion proves that analysis and upload completed; it
does not by itself prove that the uploaded result set contains no findings. The
existing workflow also retained no minimized CodeQL result count or exact Trivy
database timestamp. Uploading raw SARIF or a raw repository secret report would
create a different risk because either may contain source snippets, paths, or a
matched secret.

GitHub's pinned CodeQL analyze action supports a private output directory for
SARIF results. Trivy's `version --format json` command exposes vulnerability
database and check-bundle metadata, including update and download instants.

## Alternatives

1. **Dismiss both results because GitHub classifies the files as
   documentation.** Rejected because the browser still executes the handlers
   and classification does not remove the missing trust check.
2. **Exclude the prototype directory from CodeQL.** Rejected because that
   hides executable JavaScript from the security-extended query suite and
   violates the no-broad-suppression gate.
3. **Rely on the GitHub job conclusion and inspect findings manually.**
   Rejected because the conclusion can remain green while Medium results are
   open, and the evidence cannot be reconstructed from a digest-bound local
   artifact.
4. **Authenticate the exact sender and origin, then minimize raw scanner
   outputs before retention.** Selected.

## Decision

Both prototype message handlers accept a message only when:

- `event.source` is the exact self window in standalone mode or the exact
  parent `WindowProxy` in embedded mode; and
- `event.origin` equals the standalone document origin or the parent origin
  fixed from `document.referrer` when the embedded document loaded.

An absent or malformed parent referrer makes host-control messages unavailable.
No arbitrary embedding origin, wildcard origin, message type, or payload can
substitute for the source-and-origin pair. A static regression in the M15
security validator requires the guard to execute before either handler reads
`event.data`. The explicit change to generated `support.js` is retained as a
vendored security patch and will fail validation if a future runtime refresh
overwrites it.

The Security workflow additionally:

1. writes CodeQL SARIF only below `dist/security-private`, summarizes exact
   tool/rule/severity/scope counts, fails on Critical, High, or unclassified
   results, and uploads only the minimized JSON;
2. writes the repository Trivy secret/misconfiguration report only below the
   private directory, converts a clean result into a count-only summary, then
   runs an independent fail-closed table scan;
3. records Trivy 0.74.0 vulnerability-database and check-bundle identities and
   rejects either when its authoritative instant is more than 24 hours old;
   and
4. retains the existing full-severity image reports, SBOMs, reciprocal-source
   reconciliation, and isolated DAST evidence.

The cross-platform summarizer uses bounded, stable, no-follow reads, emits no
source path, line, message, snippet, match, or payload, and has adversarial
self-tests for High CodeQL results, repository secrets, stale databases, and
scope/count drift.

## Security and integrity effects

Arbitrary sibling, opener, or embedding windows cannot change presentation,
preview, design-theme, rail, or editor acknowledgement state through these
handlers. Referrer suppression degrades prototype host control rather than
granting authority.

The retained artifacts now distinguish “analysis completed” from “result set
reviewed.” Raw CodeQL and repository-secret evidence stays on the ephemeral
runner. A clean summary cannot be produced from an unknown-severity result, a
secret match, a High/Critical result, a stale Trivy database, a linked input, or
bytes that change during the read.

This does not turn automated results into release, production-configuration,
penetration-test, finding-register, or security-owner evidence. Medium image
licence obligations remain visible and release-blocking under R-056.

## Operations

Every pull request, `main` push, weekly run, and manual Security run produces a
separate minimized CodeQL artifact and an expanded minimized supply-chain
artifact. Reviewers must reconcile their candidate and analysis commits,
workflow digest, artifact IDs/archive hashes, report hashes, scanner timestamps,
and counts before changing the M15 manifest.

If a summarizer fails, inspect the confidential raw runner output through the
restricted GitHub security interface. Never upload or commit raw SARIF or a raw
repository secret report to make diagnosis easier.

## Migration and rollback

The two prototype guards and workflow evidence are additive. No production
application, Supabase service, database, connector, checkout path, loyalty
value, package, VM, backup, or network route changes.

If a legitimate host integration lacks a referrer, add an explicit
cryptographically or configuration-bound origin contract in a later ADR; do
not restore wildcard acceptance. If the summarizer is incompatible with a new
SARIF or Trivy schema, preserve the failed raw evidence only in the restricted
runner context, pin the last reviewed tool versions, and forward-fix the parser.
Historical artifacts and findings remain immutable.

## Verification

```sh
node --check docs/design/prototype-source/deck-stage.js
node --check docs/design/prototype-source/support.js
node scripts/summarize-security-scan.mjs --self-test
npm run security:validate
npm run ci:validate
npm run check
```

Exact-head GitHub Security evidence is required before the repaired CodeQL and
scanner-freshness checks can move from pending to passed.
