# Proxmox security candidate review — 2026-08-29

## Result

The observed production Proxmox host does not meet fixed package floors in five
official Proxmox security advisories. This is classified as an open Critical
production risk (R-059), not a completed monthly provider review and not an
accepted risk.

No production package, repository, configuration, boot entry, service, VM,
network path, checkout path, customer record, or loyalty value changed during
this review.

## Bound inputs

- Installed-state artifact:
  `docs/plan/evidence/M16/runs/recovery-dependency-snapshot-c5678b6-2026-08-28T221524Z.json`,
  SHA-256
  `9960e01bea1a66856a2e0ed36493b28e183f5e316ce027fef3534ba5043448f7`.
- Official-source artifact:
  `docs/plan/evidence/M16/runs/provider-source-snapshot-257e99c-2026-08-28T212100Z.json`,
  SHA-256
  `5786186426b065493f5c01b5d76742322e2e8ed3fe92b8f80c30d787caa516be`.
- Exact candidate plan:
  `infrastructure/governance/proxmox-security-update-plan.yaml`, SHA-256
  `ec010eb667d6166ee5adc0ee0cd2d6ecdf5b2a114e345b018b51c704d64df075`.
- Canonical candidate provenance:
  `39f30c67a374b041944a598ce2334fed3fcb8e5f64264b3db08847d5ee23ff9f`.
- Independently verified disposable package artifact:
  `docs/plan/evidence/M16/runs/proxmox-security-package-canary-957e1de-2026-08-29T003101Z.json`,
  9,606 bytes, file SHA-256
  `3eec19512a6b2535cf0c6359144c1807b78e01015f43c470ad53335c6eb1090e`,
  internal report SHA-256
  `0b703cc553f2304de75f28160e7482b09718794205efa7615fb39f2eab0f0382`.
- Candidate observation ended at `2026-08-28T22:34:37Z`.

The APT facts came through the approved read-only operator route. The repository
contains no host route, credential, package installer, bootloader command, reboot
command, or raw package-manager output.

## Advisory comparison

| Advisory         | Observed affected package                        | Official fixed floor                            | Exact candidate   |
| ---------------- | ------------------------------------------------ | ----------------------------------------------- | ----------------- |
| PSA-2026-00037-1 | kernel `7.0.6-2-pve`                             | `proxmox-kernel-7.0` `7.0.14-10`                | `7.0.14-14`       |
| PSA-2026-00038-1 | kernel `7.0.6-2-pve`                             | `proxmox-kernel-7.0` `7.0.14-11`                | `7.0.14-14`       |
| PSA-2026-00039-1 | `qemu-server` `9.1.16`                           | `qemu-server` `9.2.3`                           | `9.2.7`           |
| PSA-2026-00040-1 | `qemu-server` `9.1.16`; `pve-container` `6.1.10` | `qemu-server` `9.2.2`; `pve-container` `6.1.13` | `9.2.7`; `6.1.13` |
| PSA-2026-00042-1 | `pve-manager` `9.2.3`                            | `pve-manager` `9.2.8`                           | `9.2.11`          |

Official advisory posts are bound individually in the candidate plan. The source
index is:
https://forum.proxmox.com/threads/proxmox-virtual-environment-security-advisories.149331/page-4

## Strategy comparison and decision

- Network isolation alone leaves the host vulnerability unresolved.
- Installing only four named packages ignores the exact APT dependency solution.
- A full distribution upgrade mixes unrelated change into a security window.
- ADR-0086 therefore selects the exact dependency-complete candidate: eleven
  upgrades, one signed-kernel install, zero removals, and 165,341,024 package
  bytes.

The candidate retains the observed rsync, BorgBackup, OpenSSH client, and OpenSSH
server package selections. It does not replace or approve the separate rsync 3.5
recovery-transport candidate.

## Repository policy limitation

The candidate was resolved from the host's configured
`proxmox-trixie-no-subscription` metadata. Proxmox's administration guide says
the enterprise repository is recommended for production and characterizes the
no-subscription repository for testing/non-production use:
https://pve.proxmox.com/pve-docs/pve-admin-guide.pdf

The owner must choose the repository policy. Switching to enterprise metadata
will require a newly resolved and versioned candidate; this V1 plan must not be
edited to disguise that difference.

## Gate state

| Gate                                | State                           | Reason                                                                                                             |
| ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Candidate metadata                  | Passed                          | Five repository observations, twelve exact package records, four retained packages, and five advisories are bound. |
| Listed advisory floors              | Candidate passes; current fails | Exact candidate versions meet every listed floor; the running host does not.                                       |
| Candidate package bytes             | Passed                          | A disposable runner verified both acquisitions, exact fields, size, and SHA-256 for all twelve packages.           |
| Repository signature reverification | Passed                          | Five fresh `InRelease` files, ten accepted signatures, and all signed-index bindings passed independently.         |
| Compatibility                       | Pending                         | No isolated host/guest rehearsal or consumer matrix is complete.                                                   |
| Rollback escrow                     | Pending                         | Exact package/configuration inputs and retained-kernel recovery are not independently escrowed.                    |
| Recovery readiness                  | Pending                         | Current clean-room host, database/WAL, VM, Auth, application, and connector recovery proof is incomplete.          |
| Maintenance approval                | Pending                         | Operations, security, and owner approval are absent.                                                               |
| Reboot approval                     | Pending                         | Reboot is a distinct unissued decision.                                                                            |
| Production mutation                 | False                           | This review was read-only.                                                                                         |
| Post-change smoke/reconciliation    | Pending                         | No update has run.                                                                                                 |
| Independent review                  | Pending                         | No independent reviewer has approved evidence or closure.                                                          |

## Verification

`npm run proxmox-security:update:validate` validates the exact V1 plan plus
thirty-one adversarial drift and false-authority cases. The validator is part of
the root `npm run check` gate.

This document advances candidate metadata and risk classification only. It does
not make `provider_review`, `dependency_pins`, M15 security, M16, R-059, or
IMP-011 complete.

## Repository verification record

Implementation head `34d45ea0859caafddc7f7b57416fc460bc3bb4c6`
correctly failed CI run `33218479200` because its changed backlog bytes still had
the prior manifest digest. That failure is preserved. Correction head
`387138271abbf3fcfd23ff1a9ede84ba2c3217d3` committed the exact backlog and
candidate bindings, then passed all seven jobs in CI run `33218625530`, all four
jobs in Security run `33218625547`, and external CodeQL check `99008025406`.
All twelve PR checks were green and PR #57 was mergeable/clean at review time.

## Disposable package-provenance attempt

Candidate head `af3ffa2059fb25801ed9fa6dcf0c70d46f376fc2` passed all seven
jobs in CI run `33221204896` and the internal supply-chain, DAST, and CodeQL jobs
in Security run `33221204951`. Recovery-transport job `99015408787` failed
closed before candidate acquisition because the Debian slim bootstrap lacked
the aggregate `.gpg` file assumed by the verifier. No report artifact was
produced and no production route, credential, or mutation was present.

External CodeQL check `99015611427` separately rejected a High report-path
check/write race. Both findings are accepted as real. The correction explicitly
installs Debian's signed archive-keyring package, requires the resulting
root-owned non-writable regular keyring, and creates the final report through
one exclusive no-follow descriptor with same-inode verification. These
corrections do not advance either pending gate until a fresh exact-head run and
independent artifact verification pass.

Correction head `d8dc1e5a0299e49186785bfcad2bf1c898e489ae` then reached the
installed Debian archive-keyring check but recovery-transport job `99017536132`
in Security run `33221910125` correctly rejected the `.gpg` compatibility
symlink. CI run `33221910132` and the other eleven PR checks, including external
CodeQL check `99017790505`, passed and independently confirm the report-path
race is absent. Independent inspection of the exact pulled OCI layer under SHA-256
`6310eb16bf4251731feab01e8f633bf5e2d75a657ccad97f420b1f83cce457be`
confirmed that the link targets the package-owned regular root-owned
`/usr/share/keyrings/debian-archive-keyring.pgp` file. The next contract names
that exact regular file, verifies package ownership, and continues to reject
links. No candidate package or report artifact was produced and no production
route, credential, or mutation was present.

Regular-keyring correction `b325e4418ad7b0339b6681b9a0cb9a7bfad92230`
authenticated the Debian repositories and reached the Proxmox `InRelease`, but
recovery-transport job `99018583622` in Security run `33222253574` failed closed
because Secure APT's unprivileged verifier could not read the freshly downloaded
Proxmox keyring under the restrictive `0600` umask. No candidate package bytes
or report artifact were produced, and no production route, credential, or
mutation was present.

Permission correction `df2532a15bacfa85f65423dd2cc8f41f06b9b060` then
required `0444` for both trust files, but recovery-transport job `99019649368`
in Security run `33222605085` failed closed on Debian's exact package-owned
`0644` regular file. The next contract uses root-owned `0644` for both inputs:
only root can write and Secure APT's unprivileged verifier can read. No candidate
package bytes or report artifact were produced, and no production route,
credential, or mutation was present.

Exact-mode correction `c4a9d5fd7a499277c158c63399d69e22a1f81347`
refreshed and authenticated all five repositories, including Proxmox, but
recovery-transport job `99020151505` in Security run `33222771394` failed before
independent signature checks because the no-recommends bootstrap omitted the
separate `gpgv` package. The correction explicitly installs signed `gpgv` and
verifies `/usr/bin/gpgv`; it does not substitute APT's result for the independent
signature proof. No candidate package bytes or report artifact were produced,
and no production route, credential, or mutation was present.

Parser correction `66b0d32` then authenticated and independently reverified all
five repositories but rejected Apt's URI output for `pve-qemu-kvm`. Head
`02a90d8` failed closed on a false MD5 assumption, and bounded diagnostic head
`98c3127` established that Apt 3 prints its selected strongest hash. None of
those attempts acquired or retained candidate packages or emitted an artifact.

Head `0e6f066` completed all twelve package proofs but failed only when an
atomic rename crossed the container output mount (`EXDEV`), so no partial report
was accepted. Head `45e9a12a4bb75ece2a3e370dda35739cf253b1a7`
staged beside the final output and passed CI run `33223681162`, all four jobs in
Security run `33223681183`, and external CodeQL check `99023166148`;
recovery-transport job `99022913369` ran under synthetic PR merge SHA
`957e1ded55992331bfae703de5decf2e9913f4bb`. Artifact `9706126317`
expires on 2026-09-28; its exact committed report independently validates five
repositories, ten signatures, twelve packages, 165,341,024 package bytes,
unchanged dpkg status, no installation, no retained package bytes, no production
credential or route, no production mutation, and successful teardown.

The passing artifact advances only package bytes, repository signature
reverification, and fresh signed-index binding. The remaining pending gates in
the table are unchanged, and production is still vulnerable until an approved,
recovery-ready maintenance and reboot sequence passes post-change smoke and
reconciliation.
