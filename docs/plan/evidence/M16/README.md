# M16 Evidence — Continuous Improvement

The active fail-closed manifest is `continuous-improvement.yaml`. It records repository controls now and leaves elapsed monthly reviews, the quarterly exercise bundle, the thirteen-source provider/platform/recovery-dependency review, regression controls, scoring, independent review, and owner approval pending.

ADR-0080 closes the current score-subject ambiguity without claiming an elapsed
review. `docs/plan/evaluations/product-score.json` V2 preserves the exact V1
production history, reports deployed `v0.1.11` at 54/100, and reports the exact
integration candidate at 83/100. The candidate remains ineligible because activation
is below its category floor and required live evidence is absent. The deterministic
validator is part of `npm run check`; two future elapsed monthly reviews must still
rescore their affected modules and retain prior/current evidence.

Approved closeout artifacts use the five schemas in
`infrastructure/governance/continuous-improvement.yaml`; minimized preparation
and provenance artifacts use their own ADR-governed schemas. All belong in
`runs/`. Do not commit raw telemetry, personal data, tenant identifiers,
customer data, credentials, receiver destinations, provider payloads, package
bytes, or mutable review drafts.

ADR-0084 adds a separate minimized `starfiniti.provider-source-snapshot.v1`
pre-review artifact. `npm run continuous-improvement:sources:validate` proves the
network-free corruption cases, while `continuous-improvement:sources:capture`
requires a clean exact commit and hashes bounded streamed bytes from all thirteen
official sources without retaining their content. The artifact explicitly leaves
review, impact classification, installed endpoint evidence, and approval false; it
cannot make any of the 32 pending M16 closeout checks pass by itself.

The first verified real artifact is
[`runs/provider-source-snapshot-257e99c-2026-08-28T212100Z.json`](runs/provider-source-snapshot-257e99c-2026-08-28T212100Z.json).
It binds clean implementation commit
`257e99ce931d93832ee5723df159f54dba6dd8a7`, governance-plan SHA-256
`a81bd908039352845ea2bc62675f64ff04ca3e988275d9f4374e98519bfb89ea`,
and all thirteen HTTP 200 source digests observed from
`2026-08-28T21:20:36Z` through `2026-08-28T21:20:42Z`. The 6,534-byte artifact
has SHA-256
`5786186426b065493f5c01b5d76742322e2e8ed3fe92b8f80c30d787caa516be`.
Independent verification passed, and `contentRetained`, `reviewComplete`,
`impactClassified`, and `installedEvidenceComplete` remain `false`.
The path-scoped repository `-text` attribute preserves those exact bytes across
Windows and POSIX checkouts.

ADR-0085 adds a separate installed-state preparation boundary for the six recovery
providers. The repository helper has no SSH or production-discovery authority. It
accepts only two bounded exact-schema fact envelopes obtained through the approved
read-only operator route, derives provider-specific installed provenance, binds the
official-source artifact and exact rsync candidate plan, and keeps five other
candidate reviews plus every impact, approval, upgrade, and monthly-close assertion
false. `npm run continuous-improvement:installed:validate` exercises the positive
contract and thirty-six adversarial cases without network or SSH access.

The first verified real installed-state artifact is
[`runs/recovery-dependency-snapshot-c5678b6-2026-08-28T221524Z.json`](runs/recovery-dependency-snapshot-c5678b6-2026-08-28T221524Z.json).
It binds clean implementation commit
`c5678b652024bb2a625f07d150e8ffd0b5d9e0cb`, both opaque endpoints, all six
recovery providers, the official-source artifact above, and the complete rsync
candidate plan. The 8,813-byte artifact has SHA-256
`9960e01bea1a66856a2e0ed36493b28e183f5e316ce027fef3534ba5043448f7`.
Independent historical verification passed, as did CI `33215968172`, Security
`33215968421`, and external CodeQL for the exact implementation commit.
`installedCaptureComplete` is `true` only for the closed installed catalogue;
`candidateEvidenceComplete`,
`reviewComplete`, `impactClassified`, `approvalComplete`, and `productionMutation`
remain `false`. BorgBackup, OpenSSH, Debian, Ubuntu, and Proxmox candidate review
remains unresolved.

ADR-0086 records the first security-impact classification produced from these
inputs. The minimized review
[`proxmox-security-review-2026-08-29.md`](proxmox-security-review-2026-08-29.md)
shows that the observed host is below fixed floors in five official Proxmox
advisories and binds an exact twelve-package, zero-removal candidate. The
candidate's listed versions meet every advisory floor.

ADR-0087 supplies the independent disposable provenance proof. The exact
[`runs/proxmox-security-package-canary-957e1de-2026-08-29T003101Z.json`](runs/proxmox-security-package-canary-957e1de-2026-08-29T003101Z.json)
artifact is 9,606 bytes with file SHA-256
`3eec19512a6b2535cf0c6359144c1807b78e01015f43c470ad53335c6eb1090e`.
It independently verifies five fresh signed repositories, ten accepted
signatures, and all twelve exact packages totalling 165,341,024 bytes while
proving unchanged dpkg status, zero installation, zero retained package bytes,
no production credential or route, no production mutation, and teardown.
Package-byte, repository-signature, and fresh signed-metadata gates pass;
ADR-0088 then binds the route-free read-only production preflight. Exact
[`runs/proxmox-security-preflight-5659404-2026-08-29T013145Z.json`](runs/proxmox-security-preflight-5659404-2026-08-29T013145Z.json)
is 13,152 bytes with file SHA-256
`b18037b19263020fabce46c2b6b13ec69b640775d2747dae474521191cba8a85`
and internal report SHA-256
`898d10bde0e5dd1103dfd8838f19febff3e781ac95ecf305d4767eadf20a110a`.
It proves all twelve exact actions, eleven upgrades, one install, zero removals
or downgrades, twelve configurations, all four retained recovery packages, no
relevant holds, the exact running prior kernel/provider package, and identical
package/APT/repository/dpkg state before and after. Refresh, download, install,
service control, reboot, route, credential, and mutation are false. Dependency
simulation and installed starting state therefore pass; compatibility, rollback
escrow, recovery readiness, repository policy, maintenance, reboot, execution,
post-change reconciliation, and independent approval remain open. None of these
artifacts completes a monthly provider review or production repair gate.
