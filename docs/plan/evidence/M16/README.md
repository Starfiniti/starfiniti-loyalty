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

ADR-0100 completes one bounded Node.js review input without relabelling the
source snapshot as a monthly review. The repository previously pinned official
Node 24.19.0 image index
`d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`.
The official Node 24 line is LTS, 24.20.0 was released on 2026-08-26, and the
official `24-alpine` Registry index was rebuilt on 2026-08-27. The candidate now
pins index `e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf`
in both stages of both application Dockerfiles. The governance record binds the
exact linux/amd64 manifest and configuration, impact owner/disposition, previous
rollback index, and false production/deployment authority. Run
`npm run continuous-improvement:node-runtime:validate`. Exact implementation
`d2c347a271259a9a93958d02ded2fed732676b59` passed CI run `33257511194`,
Security run `33257511192`, and external CodeQL with all twelve checks green.
The 6,104-byte
[`runs/node-runtime-d2c347a-2026-08-29T142927Z.json`](runs/node-runtime-d2c347a-2026-08-29T142927Z.json)
binds the image identities, 336 total SBOM components, zero Trivy image and
repository findings, zero CodeQL findings, zero actionable ZAP alerts, 995 tests,
87 migrations, 3,790 pgTAP assertions, 22 concurrency probes, and four
WooCommerce runtime jobs under SHA-256
`222cd276acfd37430db88c993f01301ccc14f0d97b1da5fb907edf4770e0c692`.
Approved release deployment, rollback observation, and production reconciliation
remain pending.

ADR-0101 records the separate current WordPress/WooCommerce compatibility review.
Compared retaining the stale current cells, mutable latest artifacts, and exact
stable pins, it selects versioned WordPress 7.1 and WooCommerce 11.0.1 URLs with
separately checked artifact bytes on PHP 8.4 for the disposable current matrix. WordPress 6.6.5, WooCommerce 9.0.2,
and PHP 8.1 remain the unchanged minimum. The governance record binds official
release sources, downloaded artifact sizes and SHA-256 values, prior rollback
versions, HPOS and legacy workflow cells, pre-start SHA-256 checks, in-runtime
version assertions, plugin headers, task evidence, and false production access,
mutation, and store-upgrade authority. Run
`npm run continuous-improvement:woocommerce-runtime:validate`; fresh exact-head
Linux compatibility jobs and every production pilot/upgrade gate remain pending.

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

ADR-0089 defines the next independent preparation artifact. The reviewed plan
binds the exact candidate and ADR-0088 report to a stable route-free projection
of the whole production host: 22 anonymous guests form 19 distinct behavior
profiles, alongside two storage profiles, nine required management services,
aggregate network shape, host boot/KVM/IOMMU facts, exact local tool digests, and
zero HA resources. The two loyalty workloads appear only as `application` and
`database`; VM IDs, names, raw configuration, storage IDs, interface names,
addresses, MACs, paths, routes, credentials, and raw output are excluded.
`npm run proxmox-security:compatibility-inventory:validate` covers 56 adversarial
cases plus exclusive non-overwriting publication. Exact implementation
`e7825b6230fba027c8477ece08c1c1b5cf364aaa` produced
[`runs/proxmox-compatibility-inventory-e7825b6-2026-08-29T023345Z.json`](runs/proxmox-compatibility-inventory-e7825b6-2026-08-29T023345Z.json),
a 9,236-byte report with file SHA-256
`f6af50f506044e7578dcd02f800c1c71680e322460bf81cf4faa705b0ff5e25f`
and internal report SHA-256
`495d7960a59359794fdb5024171c2e2de66cf69fc7b6701447ae285b46ee376f`.
Independent verification passes and no raw facts were retained. Only consumer
inventory capture advances; every actual compatibility rehearsal, rollback,
recovery, approval, installation, reboot, mutation, and post-change gate remains
false.

ADR-0090 defines the executable boundary for those still-pending rehearsal rows.
`npm run proxmox-security:compatibility-rehearsal:validate` checks the exact
candidate/package/preflight/inventory bindings, fifteen QEMU profiles, four LXC
profiles, two storage profiles, nine services, two critical workloads at exact
Starfiniti `v0.1.11` and reviewed Supabase `self-hosted/v0.8.0`
compatibility/Compose/image identities, thirteen
canonical stages, a fresh minimized approval-bound dependency simulation and
same-projection inventory read, controller teardown, immutable private output,
an approval-expiry-bound out-of-process auto-destroy lease, and thirty-nine
adversarial false-pass cases. A real run requires an
isolated equivalent physical host plus owner-only inventory, approval, and
reviewed driver inputs outside Git. The repository contains none of those inputs
and no execution report. `rehearsalExecuted`, compatibility, independent review,
rollback, recovery, repository policy, installation, reboot, production
mutation, and post-change proof therefore remain false; the product score does
not advance.

ADR-0091 separately resolves BorgBackup's candidate-selection question without
rewriting the immutable ADR-0085 installed-state artifact. The exact
[`borgbackup-security.yaml`](borgbackup-security.yaml) evidence binds Debian
Trixie `borgbackup=1.4.0-5` and `/usr/bin/borg` as the rollback anchor plus the
upstream-signed BorgBackup 1.4.5 glibc 2.31 x86-64 single-directory candidate.
The plan requires exact archive, signature, README, package, executable, and
tree hashes; the README-published full primary fingerprint; a matching imported
key and VALIDSIG primary fingerprint; safe pre-extraction archive inspection;
and the same 106-entry, 95-file, 79,942,815-byte tree after extraction. The
canonical relative-path manifest is
`09fb420dce78c94814520628cf68ecdd77ab75d4fd9c794f8916874f2a767827`.

`npm run borgbackup-security:validate` covers plan, evidence, build, runner,
fake-SSH, archive, workflow, and false-pass mutations. Exact implementation
`fe727d53422a90f939218e510c9a028c4ba915ff` passed Security run `33235799207`,
job `99056449824`. The retained 1,550-byte
[`runs/borgbackup-security-fe727d5-2026-08-29T051944Z.json`](runs/borgbackup-security-fe727d5-2026-08-29T051944Z.json)
report has SHA-256
`f5336456b20afa1f188893019a63cd323562eea83dc1aacda3d698bb7bca113c`;
GitHub artifact `9709902659` has archive SHA-256
`d63b12169bbf03f292d7024d3a60fedf7444a9f6e0fc78d71d1348acd283cf67`.
It proves all four current/candidate client/server pairs and eight required
operation families under no network, read-only root, UID/GID 65532, no
capabilities, no-new-privileges, bounded resources, and exact container/image
teardown. `compatibility_canary` therefore passes. Operations escrow,
real-provider compatibility, production rollout, rollback, monitoring, isolated
restore, and independent review remain pending. This preparation proof does not
advance an M16 closeout check or product-score point, and production is unchanged.

ADR-0092 now resolves the OpenSSH architecture question without replacing a
daemon or distribution executable. The exact
[`openssh-client-security.yaml`](openssh-client-security.yaml) candidate plan
binds Debian Trixie `openssh-client=1:10.0p1-7+deb13u4`, Ubuntu Noble
`openssh-server=1:9.6p1-3ubuntu13.18`, the official OpenSSH Portable 10.5p1
archive, release-note checksum, detached signature, release key and full
fingerprint, and a safe 930-entry, 892-file, 10,059,047-byte source manifest.
Only target `ssh` is built into a versioned side-by-side root; both distribution
daemons, `/usr/bin/ssh`, host keys, known-host data, and production consumers
remain untouched.

`npm run openssh-client-security:validate` covers signed source, safe
extraction, client-only build, exact rollback and server packages, strict
client options, restricted forced command, internal no-port network, resource
ceilings, exclusive evidence publication, exact teardown, and adversarial
false-pass mutations. Bootstrap Security run `33240398639` discovered stripped
candidate executable SHA-256
`be9dd9ee2550e3fca2a6fa15edb5ab9303e42ac783ac766928fa5380971bf081`.
Digest-locked candidate `275c9e8` passed Security run `33241151463`, job
`99070606112`; the retained 741-byte report and GitHub artifact archive have
distinct SHA-256 bindings and the validator reopens the committed report through
a bounded no-follow descriptor. Synthetic compatibility now passes. Escrow, exact
real-provider rsync and Borg behavior, every consumer, rollout,
monitoring, rollback, isolated restore, and independent review remain pending;
production and the M16 score are unchanged.

ADR-0093 closes the repository tooling gap between those passing synthetic
canaries and a future operations-controlled offline handoff. The exact
[`recovery-artifact-escrow.yaml`](recovery-artifact-escrow.yaml) evidence and
`npm run recovery-artifact-escrow:validate` bind a closed 30-entry Borg/OpenSSH
catalogue: signed candidate and rollback bytes, candidate executables, signing
material, dependency inventories, plans, build/verifier inputs, runbooks, ADRs,
evidence, and retained canary reports. Inventory and verification use bounded
stable no-follow descriptors, reject links and unexpected members, compare
repository inputs to a clean exact commit, and emit only aggregate minimized
facts outside the private bundle.

No real private inventory or minimized report exists yet. The verifier has no
network, artifact-copy, execution, installation, production-route, credential,
mutation, or deletion path. A passing future byte inventory will still leave
signing-fingerprint, dependency, offline-copy/custody, recovery-usability,
second-person, production, and `operationsEscrowComplete` gates false. The
BorgBackup and OpenSSH operations-escrow rows, R-004, M16 score, and production
state therefore remain unchanged.

ADR-0094 preserves that accepted V1 policy and evidence by exact SHA-256 and
records the then-current shared V2 handoff. The
[`recovery-artifact-escrow-v2.yaml`](recovery-artifact-escrow-v2.yaml) evidence
binds sixty-four effective entries: the exact V1 thirty plus thirty-four rsync
and governance inputs covering candidate, dependency, rollback, exact canary
report, forced-command, controller, compatible rollback, systemd, sudoers,
validator, verifier, canary, runbook, decisions, and current or historical policy
and evidence. V2 uses distinct manifest/report schemas and the same bounded
stable byte verifier; a V1 policy or evidence change fails before V2 loads.

No real V2 private inventory exists. Package-authority and signing review,
dependency and Proxmox-host consumer compatibility, redundant offline custody,
independent review, the real forced-command/manual/timer path, isolated restore,
rollout, and `operationsEscrowComplete` all remain pending. A local directory or
CI artifact is not approved custody. IMP-010, R-004, the M16 score, and production
therefore remain unchanged.

ADR-0095 records why that cross-suite package set is no longer the preferred
production shape: the Debian host candidate would replace the global Trixie
`libacl1` with a next-release library. The separate
[`rsync-source-security.yaml`](rsync-source-security.yaml) evidence instead
binds exact signed upstream rsync 3.5.0 source, a closed safe-tree manifest,
separate Debian 13 and Ubuntu 24.04 native builds, fixed side-by-side paths,
unchanged distribution rollback files, an internal no-port two-pair canary, and
exact teardown. Bootstrap Security run `33247037670`, recovery job
`99086186056`, passed and its exact retained report binds the separate
Debian/Ubuntu executable hashes and shared wrapper hash. Locked plan SHA-256
`46adc671b15fddead44c014edb334dc815ef14ee4d17bcdc3f18dd2ffb9c120f`
made every discovered endpoint hash a mandatory build input. Security run
`33248120835`, recovery job `99089014687`, then rebuilt that exact locked plan,
reproduced all three hashes, passed both bounded transfer pairs and confinement
rejection, and completed teardown. Artifact `9713549190` has archive SHA-256
`79862829d75524c29b63a389b90e7eff379048219ee32f82bb66f1ae5ed70452`;
the exact retained report has file SHA-256
`54c55fdb56170308eca7becc5120254e540f8f58de0b7d03448688097149a2de`.
Candidate plan SHA-256
`cb6fee76b837c5274172182d7a58de71d2ccf13901722f856833b2ce6e7e0912`
binds the distinct bootstrap and digest-lock canaries without rewriting either.
ADR-0096 now defines that V3 operations contract. The exact
[`recovery-artifact-escrow-v3.yaml`](recovery-artifact-escrow-v3.yaml) evidence
preserves V1 and V2 by immutable SHA-256, marks the V2 `rsync-transport`
provider historical-only, and selects only the native source-built replacement.
The effective closed inventory is seventy-four entries: the accepted thirty V1
BorgBackup/OpenSSH inputs plus forty-four native-rsync executable, wrapper,
signed-source, rollback, endpoint-dependency, report, build, runtime, governance,
and evidence inputs. Both private dependency inventories are mandatory and bind
to distinct endpoint executable hashes. The shared verifier rejects substitute
members, a wrong endpoint binding, historical candidate activation, or a global
library upgrade and keeps source-signature, native-build, consumer/selector,
custody, review, restore, and production completion false.

Exact implementation `21262cf08e265c61d3e76e1971ce7604916469cc`
passed all seven CI jobs in run `33250002574`, all four Security jobs in run
`33250002462` including recovery-transport job `99093945140`, and independent
CodeQL check `99094120148`; all twelve PR checks were green and PR #57 was clean
and mergeable. Every real private inventory, redundant offline custody,
independent source/package/build/dependency review, real
forced-command/manual/timer archive, selector switch, and isolated restore remain
pending. No production access, mutation, or authority is claimed, and IMP-010,
R-004, M16 at 77/100, deployed readiness at 54/100, and production remain
unchanged.
