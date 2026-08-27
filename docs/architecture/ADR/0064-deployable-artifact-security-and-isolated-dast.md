# ADR-0064: Deployable-artifact security and isolated DAST

- Status: Accepted
- Date: 2026-08-27
- Decision owners: Starfiniti product and engineering
- Scope: M15-S03 supply-chain, release provenance, and dynamic application security

## Context

The baseline already performs application tests, pgTAP, a production-only npm audit, a repository secret scan, licence inventory, pinned container builds, and a WooCommerce runtime matrix. It did not independently analyze source with CodeQL, scan the exact deployable dashboard and worker images, publish SBOMs, attest releases, or exercise a dynamic scanner. At reconstruction, development-only `@wordpress/env` 11.8.0 retained the high-severity R-032 `extract-zip` advisory. Treating that development fixture as a deployable-image vulnerability would conflate test-tool and runtime risk; ignoring it would be equally misleading. During implementation, official 11.14.0 became available and replaced `extract-zip` with patched `adm-zip` 0.6.0, allowing the complete dependency audit to become a deterministic CI gate.

Primary guidance reviewed on 2026-08-27:

- GitHub CodeQL workflow configuration and `security-events: write`: <https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/configuring-code-scanning-at-scale>
- GitHub artifact and container provenance attestations: <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations>
- Trivy repository, image, secret, misconfiguration, licence, and SBOM scanning: <https://trivy.dev/latest/docs/target/repository/> and <https://trivy.dev/latest/docs/scanner/license/>
- Anchore Syft formats and CycloneDX generation: <https://github.com/anchore/syft>
- ZAP Automation Framework sequencing, bounded active scanning, passive-scan wait, reporting, and exit status: <https://www.zaproxy.org/docs/desktop/addons/automation-framework/>, <https://www.zaproxy.org/docs/desktop/addons/automation-framework/job-ascan/>, and <https://www.zaproxy.org/docs/desktop/addons/automation-framework/job-exitstatus/>

Reviewed tool inputs are CodeQL Action 4.37.9, Trivy Action 0.36.0 with Trivy 0.74.0, Anchore SBOM Action 0.24.0 with Syft 1.51.0, ZAP 2.17.0, Upload Artifact 7.0.1, and Attest Build Provenance 4.2.2. Actions and the ZAP image are pinned by immutable commit or digest.

## Decision

1. Add a separate `Security` workflow for pull requests, `main`, a weekly schedule, and manual runs. Keeping it separate preserves the existing seven-job baseline as a stable compatibility signal while allowing security jobs to evolve independently.
2. Run CodeQL `security-extended` analysis for JavaScript/TypeScript with only the required `contents: read` and job-local `security-events: write` permissions.
3. Run the complete npm development/production audit, scan repository files for secrets and misconfiguration, and scan both exact production images for vulnerabilities, secrets, misconfiguration, and prohibited/restricted licences. Every High or Critical result fails whether or not a fix exists.
4. Generate CycloneDX JSON SBOMs from both production images. Tagged releases ship the WooCommerce package, both SBOMs, and checksums; GitHub build-provenance attestations bind every release file and both pushed image digests.
5. Run ZAP only against a newly built disposable dashboard container on an internal Docker network. The target has no published port and the network has no external route. The plan limits crawl depth/count, scan duration, per-rule duration, delay, context paths, and failure threshold. High alerts fail; Medium/Low/Informational alerts remain in the retained review report.
6. Upgrade the exact WordPress test runtime to `@wordpress/env` 11.14.0. Its patched `adm-zip` 0.6.0 path removes R-032 only after the complete audit and all four Linux WooCommerce runtime cells pass on the exact candidate.
7. Do not use CI DAST as penetration-test evidence. An independent penetration test, review of every non-High finding/false-positive decision, current vulnerability databases, and a production configuration scan remain deterministic completion requirements.
8. Store only minimized evidence references and sanitized reports. Do not commit request/response bodies, credentials, cookies, customer identifiers, production origins, raw infrastructure inventory, or exploit material.

## Alternatives considered

### One repository-wide dependency scan including development fixtures

This initially made every build fail on the known WordPress test-runtime advisory and could have encouraged a blanket waiver. Rejected. Once WordPress published a patched compatible version, the candidate upgraded and added the complete dependency audit as a permanent gate; production-image scans remain a separate release-boundary result.

### Hosted DAST against production

This covers deployed routing, but an active scanner can mutate data, trigger providers, and create operational load. Rejected for automated CI. Production receives separately approved passive/configuration review and an independent penetration test.

### Passive-only disposable DAST

This is lower risk but does not test active input handling. Rejected as insufficient because a no-egress, no-published-port disposable target permits a bounded active scan without production authority.

### Vendor-only SBOMs without release attestations

This records contents but not who built which exact release. Rejected. SBOMs and provenance solve different verification questions and are both required.

## Security and data-integrity effects

- All workflow actions use immutable commits; scanner engines and the ZAP image use reviewed versions/digests.
- Default workflow permissions remain read-only. Code scanning and release attestation permissions are scoped to the jobs/workflows that need them.
- No dynamic scan receives a credential, production origin, service-role key, connector secret, payment state, or customer data.
- Security scanning cannot mutate the loyalty ledger because its target is an isolated disposable unauthenticated surface.
- A failed scan never weakens ledger, refund, reconciliation, checkout, or customer-value availability.

## Operational effects

- Pull requests gain three bounded jobs: CodeQL, supply-chain, and disposable DAST.
- Weekly execution refreshes vulnerability evidence even without source changes.
- Security reports and SBOMs are short-lived CI artifacts; release SBOMs and attestations are durable release assets/metadata.
- R-032 remains pending until exact-candidate Linux runtime evidence confirms the patched dependency transition. No deterministic finding may be changed to passing through subjective acceptance.

## Migration and rollback

This change is additive and has no schema or production runtime migration. Rollback removes the separate workflow and release attestation/SBOM steps, but does not erase published attestations or historical scan evidence. If a scanner release is defective, pin a reviewed predecessor through a new commit, record the reason and database age, and rerun the exact head; never disable the entire gate or add a broad ignore file as an emergency bypass.
