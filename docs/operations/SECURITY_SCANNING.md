# Security scanning and release evidence

## Purpose

M15-S03 separates repository controls from the external evidence required for a GA security claim. `npm run security:validate` proves that the workflow, release, DAST plan, task state, and fail-closed manifest have not drifted. GitHub Actions supplies the actual CodeQL, container, SBOM, and disposable DAST runs.

## Automated boundary

The `Security` workflow runs on pull requests, `main`, Tuesdays at 03:17 UTC, and manual dispatch:

- CodeQL analyzes JavaScript/TypeScript with `security-extended` queries, then
  converts private SARIF into a count-only exact-candidate artifact and fails
  on Critical, High, or unclassified results. Rule definitions are resolved
  from both the CodeQL driver and query-pack extensions; missing or ambiguous
  metadata fails closed. Every raw result is counted even when GitHub's alert
  view retains an earlier dismissal.
- The complete npm dependency tree fails on every High or Critical advisory, including development-only tooling.
- Trivy scans repository secrets/misconfiguration and both deployable images
  for Unknown/High/Critical vulnerability, secret, misconfiguration, and
  policy-classified licence findings. Its exact database/check-bundle identity
  and update/download instants must remain inside the 24-hour evidence bound.
- Syft produces CycloneDX JSON SBOMs for both images.
- The reciprocal-source validator rejects an SBOM component, version, licence expression, Alpine origin, packaging commit, architecture, or image placement outside the exact source plan.
- ZAP 2.17.0 runs a bounded active scan against `starfiniti-dast-target` on the internal `starfiniti-dast` Docker network.

The DAST network has no published port and no external route. The target is built from the candidate commit, labelled disposable, contains no live credentials or customer data, and is removed in an `always()` cleanup step. Never change its origin to a public, staging, or production host in a pull request.

The repository misconfiguration scan is intentionally strict at every severity. Both deployable Dockerfiles therefore carry image-level health checks: dashboard readiness uses `/api/healthz`, while the multi-mode worker verifies its unprivileged PID 1 process without coupling container health to a database or provider outage. Do not suppress `DS-0026` or add a blanket Trivy ignore.

`infrastructure/testing/security/trivy.yaml` is the explicit AGPL-compatible licence policy. AGPL/GPL/LGPL findings remain visible as Medium reciprocal obligations; reviewed MIT-0 and SIL Open Font License identifiers are permissive Low findings; incompatible non-commercial, Commons Clause, Business Source, SSPL, Elastic, and other restricted terms fail. Unknown licences also fail. The policy contains no ignored licence IDs.

Full-severity dashboard and worker JSON review reports exclude the secret
scanner and are uploaded with both SBOMs. Repository secret detection first
writes raw JSON below `dist/security-private`; the bounded summarizer emits only
zero/nonzero category and severity totals, and the upload list cannot include
that private directory. An independent table scan remains fail closed. CodeQL
uses the same boundary: raw SARIF remains private and only rule, severity,
occurrence, and coarse source-scope counts are retained. Runtime stages remove
npm, npx, Corepack, and Yarn after the build and pin the reviewed Alpine OpenSSL
security revision. The worker bundle leaves only `nodemailer`, `postgres`, and
`zod` external, copies only those exact package directories, and imports all
three from the built image before the scan. This prevents a root-workspace prune
from silently shipping dashboard or build dependencies while keeping the SBOM
aware of every external worker package.

## Release boundary

For a signed `vMAJOR.MINOR.PATCH` tag, the release workflow:

1. reruns application, database, connector, secret, audit, and licence gates;
2. derives one numeric connector version from the validated tag, overlays it into exactly one plugin header, runtime constant, POT identity, and stable tag without changing tracked source, then independently reopens the bounded ZIP and proves the exact version and closed non-test source inventory;
3. builds immutable dashboard and worker images locally;
4. generates both exact image CycloneDX SBOMs;
5. builds the exact corresponding-source archive, external manifest, and third-party notices from the release commit and source plan;
6. independently streams, bounds, hashes, and reconciles every archive entry and both external envelopes to the two SBOMs before registry authentication, without filesystem extraction;
7. checksums the connector, both SBOMs, source archive, source manifest, and notices;
8. authenticates, pushes the images, and records exact registry digests;
9. attests all seven release files and both image digests; and
10. publishes all seven files.

ADR-0105 governs connector version identity. Development source deliberately remains `0.1.0-dev`/`trunk`; a release ZIP containing either marker, multiple version authorities, a non-numeric tag value, a source/test inventory difference, encryption, unsafe path, or size/count overflow fails before publication. A previous attested release is historical evidence and is never rewritten to repair its metadata.

ADR-0083 governs the source bundle. It includes the exact Starfiniti source tree, exact Alpine packaging directories and commits, every checksum-bound local or downloaded APKBUILD input, and pinned SPDX licence texts. Downloads are credential-free HTTPS, byte-bounded, and SHA-512 verified. The builder treats APKBUILD and upstream source as data and never executes either. Its verifier opens release envelopes and staged inputs without following the final symlink, hashes the exact descriptor bytes after descriptor/path identity checks, rejects metadata drift after the read, streams the gzip/tar envelope, rejects unsafe paths and symlinks before use, and compares each file, mode, byte count, and digest to the external and archived manifests without extracting to disk. An unexpected reciprocal SBOM component fails before image publication.

Verify a release with the repository-scoped GitHub CLI:

```bash
gh release download vX.Y.Z --repo Starfiniti/starfiniti-loyalty --dir release-evidence
sha256sum --check release-evidence/SHA256SUMS
gh attestation verify release-evidence/starfiniti-loyalty.zip --repo Starfiniti/starfiniti-loyalty
gh attestation verify release-evidence/loyalty-dashboard.cdx.json --repo Starfiniti/starfiniti-loyalty
gh attestation verify release-evidence/loyalty-worker.cdx.json --repo Starfiniti/starfiniti-loyalty
gh attestation verify release-evidence/starfiniti-loyalty-source.tar.gz --repo Starfiniti/starfiniti-loyalty
gh attestation verify release-evidence/starfiniti-loyalty-source-manifest.json --repo Starfiniti/starfiniti-loyalty
gh attestation verify release-evidence/starfiniti-loyalty-third-party-notices.md --repo Starfiniti/starfiniti-loyalty
gh attestation verify release-evidence/SHA256SUMS --repo Starfiniti/starfiniti-loyalty
gh attestation verify oci://ghcr.io/starfiniti/loyalty-dashboard:vX.Y.Z --repo Starfiniti/starfiniti-loyalty
gh attestation verify oci://ghcr.io/starfiniti/loyalty-worker:vX.Y.Z --repo Starfiniti/starfiniti-loyalty
```

Run these commands in a new empty directory. Treat the downloaded files and scanner reports as untrusted input; do not execute them.

## Finding disposition

ADR-0097 repairs two PR-ref Medium CodeQL results in the executable design
prototype. Both vendored handlers now verify the exact parent/self source and
load-time origin before reading message data; documentation classification is
not a waiver. A green CodeQL job is analysis evidence, not a zero-finding claim,
unless the minimized SARIF summary reconciles the result count.

ADR-0099 records why provider alert state cannot replace raw-result policy.
Exact candidate `e71e62d` had only one open GitHub alert but its minimized SARIF
still contained three blocking results, including two older dismissed alerts.
The parser now covers CodeQL extension rules, and all three locations are
remediated rather than waived.

CodeQL also requires an explicit secure creation mode when an `openSync` path
can derive from the operating-system temporary directory. Read-only/no-follow
flags remain mandatory, and the fault reader additionally supplies `0600` as a
defensive third argument. Node ignores it for the read-only open; it becomes
protective if a future refactor adds a creation flag.

Final candidate `fe8a6ff` passed CI `33255970171` and Security `33255970172`.
Raw CodeQL analysis `1691796393` contains zero results, and minimized artifact
`9715823372` independently records zero findings in every severity. The same
candidate passed the exact repository/image/SBOM/DAST, database, container,
WooCommerce, dependency, and recovery-transport gates.

- Critical or High: automatic failure. Fix, replace, remove, or document why the result is objectively non-applicable and obtain an independent reviewer decision. A reviewer cannot override an exploitable finding.
- Medium: triage before the module closes; create a linked risk and remediation date when accepted temporarily.
- Low/Informational: review for systemic patterns and convert recurring findings into tests or configuration controls.
- False positive: retain scanner/rule/version, exact artifact digest, technical reproduction, reviewer, expiry, and regression check. Blanket or path-wide suppression is prohibited.

The current digest-bound Medium register is `docs/plan/evidence/M15/runs/security-medium-triage-4ac7414.yaml`. It binds exact candidate `4ac7414`, Security run `33501867336`, the exact DAST, dashboard/worker scan, and CycloneDX archive/report digests, and reconciles 29 raw image-licence occurrences to 15 exact package/version/licence dispositions with zero false positives. One disposition is the available Starfiniti product source; 14 third-party dispositions across 12 packages stay release-blocking because `libgcc` and `libstdc++` each carry two licence findings. ADR-0083 removes sharp/libvips and supplies a release-bound source plan and fail-closed generator for the product plus the 12 remaining Alpine reciprocal components. Repository generation and a clean development bundle are not tagged-release compliance evidence. R-056 keeps dashboard and worker image distribution blocked until one real release's image digests, SBOMs, source archive, external manifest, notices, checksums, and attestations verify together and the release-security owner approves completeness. The register expires no later than its earliest source artifact and must be regenerated after image, package, scanner, or source-evidence drift.

The dashboard enforces ADR-0082 at the deployable-container boundary. Each document response receives a fresh nonce-bound script policy from Next.js Proxy; all responses deny framing and MIME sniffing, and API responses receive a non-executable sandbox policy. The isolated Security job checks the real response before ZAP. A reverse proxy may add stricter controls, but it cannot substitute for or weaken the application policy.

R-032 was development-only but still High. The candidate upgrades `@wordpress/env` from 11.8.0 to 11.14.0, removes vulnerable `extract-zip`, installs patched `adm-zip` 0.6.0, and produces a zero-vulnerability complete npm audit. R-032 closes only after the exact candidate also passes all four Linux WooCommerce runtime cells.

## External completion evidence

Every minimized YAML completion artifact must be a stable regular file below the M15 runs directory and no larger than 256 KiB. The validator opens without following the final symlink before digest, schema, and sensitive-content checks.

Before changing `docs/plan/evidence/M15/security.yaml` to `complete`, obtain and sanitize:

- fresh exact-head security workflow results and SBOM digests;
- a tagged release verification naming and hashing all seven files, proving both source-envelope checks, reconciling all 13 planned reciprocal components, and verifying both image attestations;
- a production configuration/passive scan performed under an approved window;
- an independent penetration-test report and remediation retest;
- a complete finding register with zero unresolved Critical/High items; and
- exact corresponding-source and third-party-notice evidence for every reciprocal component in the distributed images; and
- named security-owner approval.

Evidence must exclude secrets, cookies, request/response bodies, production origins, raw customer data, exploit payloads, and reusable infrastructure details. Preserve full confidential reports outside the repository; commit only the signed summary, content digest, severity/count reconciliation, reviewer, and approval reference.
