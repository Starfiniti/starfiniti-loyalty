# Security scanning and release evidence

## Purpose

M15-S03 separates repository controls from the external evidence required for a GA security claim. `npm run security:validate` proves that the workflow, release, DAST plan, task state, and fail-closed manifest have not drifted. GitHub Actions supplies the actual CodeQL, container, SBOM, and disposable DAST runs.

## Automated boundary

The `Security` workflow runs on pull requests, `main`, Tuesdays at 03:17 UTC, and manual dispatch:

- CodeQL analyzes JavaScript/TypeScript with `security-extended` queries.
- The complete npm dependency tree fails on every High or Critical advisory, including development-only tooling.
- Trivy scans repository secrets/misconfiguration and both deployable images for Unknown/High/Critical vulnerability, secret, misconfiguration, and policy-classified licence findings.
- Syft produces CycloneDX JSON SBOMs for both images.
- ZAP 2.17.0 runs a bounded active scan against `starfiniti-dast-target` on the internal `starfiniti-dast` Docker network.

The DAST network has no published port and no external route. The target is built from the candidate commit, labelled disposable, contains no live credentials or customer data, and is removed in an `always()` cleanup step. Never change its origin to a public, staging, or production host in a pull request.

The repository misconfiguration scan is intentionally strict at every severity. Both deployable Dockerfiles therefore carry image-level health checks: dashboard readiness uses `/api/healthz`, while the multi-mode worker verifies its unprivileged PID 1 process without coupling container health to a database or provider outage. Do not suppress `DS-0026` or add a blanket Trivy ignore.

`infrastructure/testing/security/trivy.yaml` is the explicit AGPL-compatible licence policy. AGPL/GPL/LGPL findings remain visible as Medium reciprocal obligations; reviewed MIT-0 and SIL Open Font License identifiers are permissive Low findings; incompatible non-commercial, Commons Clause, Business Source, SSPL, Elastic, and other restricted terms fail. Unknown licences also fail. The policy contains no ignored licence IDs.

Full-severity dashboard and worker JSON review reports exclude the secret scanner and are uploaded with both SBOMs. Secret detection remains enabled in the fail-closed table scan only, preventing a raw secret match from being copied into downloadable evidence. Runtime stages remove npm, npx, Corepack, and Yarn after the build and pin the reviewed Alpine OpenSSL security revision. The worker bundle leaves only `nodemailer`, `postgres`, and `zod` external, copies only those exact package directories, and imports all three from the built image before the scan. This prevents a root-workspace prune from silently shipping dashboard or build dependencies while keeping the SBOM aware of every external worker package.

## Release boundary

For a signed `vMAJOR.MINOR.PATCH` tag, the release workflow:

1. reruns application, database, connector, secret, audit, and licence gates;
2. builds and pushes immutable dashboard and worker images;
3. records exact registry digests;
4. generates dashboard and worker CycloneDX SBOMs;
5. checksums the WooCommerce package and both SBOMs;
6. attests the four release files and both image digests; and
7. publishes the package, SBOMs, and checksum file.

Verify a release with the repository-scoped GitHub CLI:

```bash
gh release download vX.Y.Z --repo Starfiniti/starfiniti-loyalty --dir release-evidence
sha256sum --check release-evidence/SHA256SUMS
gh attestation verify release-evidence/starfiniti-loyalty.zip --repo Starfiniti/starfiniti-loyalty
gh attestation verify release-evidence/loyalty-dashboard.cdx.json --repo Starfiniti/starfiniti-loyalty
gh attestation verify oci://ghcr.io/starfiniti/loyalty-dashboard:vX.Y.Z --repo Starfiniti/starfiniti-loyalty
gh attestation verify oci://ghcr.io/starfiniti/loyalty-worker:vX.Y.Z --repo Starfiniti/starfiniti-loyalty
```

Run these commands in a new empty directory. Treat the downloaded files and scanner reports as untrusted input; do not execute them.

## Finding disposition

- Critical or High: automatic failure. Fix, replace, remove, or document why the result is objectively non-applicable and obtain an independent reviewer decision. A reviewer cannot override an exploitable finding.
- Medium: triage before the module closes; create a linked risk and remediation date when accepted temporarily.
- Low/Informational: review for systemic patterns and convert recurring findings into tests or configuration controls.
- False positive: retain scanner/rule/version, exact artifact digest, technical reproduction, reviewer, expiry, and regression check. Blanket or path-wide suppression is prohibited.

The dashboard enforces ADR-0082 at the deployable-container boundary. Each document response receives a fresh nonce-bound script policy from Next.js Proxy; all responses deny framing and MIME sniffing, and API responses receive a non-executable sandbox policy. The isolated Security job checks the real response before ZAP. A reverse proxy may add stricter controls, but it cannot substitute for or weaken the application policy.

R-032 was development-only but still High. The candidate upgrades `@wordpress/env` from 11.8.0 to 11.14.0, removes vulnerable `extract-zip`, installs patched `adm-zip` 0.6.0, and produces a zero-vulnerability complete npm audit. R-032 closes only after the exact candidate also passes all four Linux WooCommerce runtime cells.

## External completion evidence

Every minimized YAML completion artifact must be a stable regular file below the M15 runs directory and no larger than 256 KiB. The validator opens without following the final symlink before digest, schema, and sensitive-content checks.

Before changing `docs/plan/evidence/M15/security.yaml` to `complete`, obtain and sanitize:

- fresh exact-head security workflow results and SBOM digests;
- a tagged release verification with file and image attestations;
- a production configuration/passive scan performed under an approved window;
- an independent penetration-test report and remediation retest;
- a complete finding register with zero unresolved Critical/High items; and
- named security-owner approval.

Evidence must exclude secrets, cookies, request/response bodies, production origins, raw customer data, exploit payloads, and reusable infrastructure details. Preserve full confidential reports outside the repository; commit only the signed summary, content digest, severity/count reconciliation, reviewer, and approval reference.
