# Proxmox security update

This runbook governs the exact candidate in ADR-0086. It is deliberately split
into read-only review, package-byte staging, installation, reboot, and recovery
decisions. Repository validation authorizes none of those production actions.

## Current decision

- Five published Proxmox advisories are not closed by the observed running host.
- The candidate is exactly twelve packages: eleven upgrades, one signed kernel
  install, no removals, and 165,341,024 package bytes.
- `npm run proxmox-security:update:validate` proves the repository contract only.
- The independently verified disposable artifact from exact implementation head
  `45e9a12` passes package-byte, fresh signed-metadata, and repository-signature
  provenance for all twelve packages with zero installation or retained package
  bytes. Compatibility, fresh production dependency simulation, installed-state
  preflight, rollback escrow, recovery readiness, repository policy, maintenance
  approval, reboot approval, and production mutation remain false or pending.
- ADR-0088's exact 13,152-byte production preflight report has file SHA-256
  `b18037b19263020fabce46c2b6b13ec69b640775d2747dae474521191cba8a85`
  and internal report SHA-256
  `898d10bde0e5dd1103dfd8838f19febff3e781ac95ecf305d4767eadf20a110a`.
  It passes current installed-starting-state and dependency-simulation gates with
  eleven upgrades, one install, zero removals/downgrades, twelve configurations,
  all four recovery packages retained, and all bounded package/APT/repository
  state identical before and after. It authorizes no later phase.
- ADR-0089 defines a distinct route-free whole-host consumer inventory. Its
  exact 9,236-byte accepted report contains 22 anonymous guests across 19 exact
  behavior profiles, two storage profiles, nine required management services,
  aggregate network shape, and zero HA resources. Consumer inventory now passes;
  observing this matrix does not prove compatibility.
- The configured `pve-no-subscription` repository is not Proxmox's recommended
  production repository. The owner must explicitly decide whether to procure and
  use the enterprise repository or accept a newly regenerated candidate from the
  configured repository for this bounded repair.

## Authority and evidence boundary

Only an authorized host operator may run package-manager, bootloader, service,
or reboot commands. Do not copy hostnames, addresses, usernames, keys, raw APT
output, VM configuration, tenant data, customer data, or application secrets into
the repository. Record only the minimized package/version/digest, timestamps,
approvals, check outcomes, and unexplained differences required by the evidence
schema.

Stop if the host's installed starting versions, repository identities,
dependency solution, package bytes, removal count, or retained recovery packages
differ from the V1 plan. Signed repository documents may rotate and must be
recorded separately from the V1 observation; rotation is acceptable only when
the disposable canary still proves the complete fresh signed chain for every
exact package and the production preflight still resolves the exact V1 action
set. Any other drift requires a new plan and review; do not edit V1 in place.

## Phase 1 — Repository-only validation

From a clean candidate checkout:

```sh
npm run proxmox-security:update:validate
npm run proxmox-security:packages:validate
npm run proxmox-security:preflight:validate
npm run proxmox-security:compatibility-inventory:validate
npm run proxmox-security:compatibility-rehearsal:validate
npm run recovery-transport:validate
npm run recovery:validate
```

Expected result: five advisories, twelve repair packages, four retained recovery
packages, a candidate-bound disposable canary contract, all adversarial cases
passing, and production mutation false. Local validation performs no network
request or package download.

The networked canary runs only on its GitHub-hosted disposable Security job. It
independently authenticates every fresh `InRelease`, binds each uncompressed
package index to the signed Release payload, proves all twelve APT-selected and
exact-URL package copies are identical to the V1 fields, installs none of them,
deletes their bytes, and emits minimized JSON. A pass advances only package-byte
and signature evidence; it is not a production preflight or approval.

The first passing report is
`docs/plan/evidence/M16/runs/proxmox-security-package-canary-957e1de-2026-08-29T003101Z.json`.
Its file SHA-256 is
`3eec19512a6b2535cf0c6359144c1807b78e01015f43c470ad53335c6eb1090e`.
Reverify it independently with
`node scripts/validate-proxmox-security-package-canary.mjs --verify-report <absolute-path>`.

ADR-0088 adds a route-free repository contract for the two next read-only
production gates. The repository tool never opens SSH or accepts endpoint or
credential input. An authorized operator transmits the exact committed
`infrastructure/testing/proxmox-security-preflight/collect-facts.py` bytes over
an existing approved session, captures its bounded JSON stdout outside Git, and
runs:

```sh
npm run proxmox-security:preflight:capture -- --facts <absolute-facts-path>
```

Use `--facts -` to validate bounded collector stdout directly from the approved
operator pipeline without retaining a raw local fact file. The remote Python
interpreter must use isolated safe-path mode (`python3 -I`); the collector
refuses any other interpreter mode. Independently compare the transmitted
collector bytes with the SHA-256 bound in its plan before execution.

The first passing report is
`docs/plan/evidence/M16/runs/proxmox-security-preflight-5659404-2026-08-29T013145Z.json`.
Reverify it with
`node scripts/validate-proxmox-security-preflight.mjs --verify-report <absolute-path>`.

The collector requires root for authoritative package configuration, creates an
empty network namespace, and runs only `apt-get --simulate --no-remove` with the
twelve exact validator-bound versions. It does not use `--no-download`: Apt
rejects uncached archives when that option is combined with simulation, while
simulation itself performs no acquisition and the empty namespace makes network
access impossible. It requires byte-identical dpkg status/selections/updates,
APT lists/archives, and repository configuration before and after. It also
records that the running prior kernel package is currently autoremovable; this
is an explicit instruction to retain it, never permission to run `autoremove`.

ADR-0089 adds the next route-free read-only inventory contract. It covers every
QEMU VM and LXC container sharing the production host plus storage, services,
network shape, HA, kernel, KVM, IOMMU, boot, and local tool provenance. It emits
anonymous behavior profiles and the two semantic critical-workload aliases only;
raw VM IDs, names, configuration values, storage IDs, interface names, addresses,
MACs, paths, routes, credentials, and command output are prohibited.

An authorized operator transmits the exact committed
`infrastructure/testing/proxmox-compatibility-inventory/collect-facts.py` bytes
over the already approved session, independently compares its SHA-256 with the
plan, and executes it as root under `python3 -I`. Pipe the bounded stdout directly
to the clean committed checkout:

```sh
npm run proxmox-security:compatibility-inventory:capture -- --facts -
```

Do not create or commit a raw fact file. The collector executes only fixed local
read operations and requires two identical projections. A passing report advances
only `consumerInventoryCaptured`; every rehearsal and authority gate remains
false. Reverify an accepted report with
`node scripts/validate-proxmox-compatibility-inventory.mjs --verify-report <absolute-path>`.

The first passing minimized report is
`docs/plan/evidence/M16/runs/proxmox-compatibility-inventory-e7825b6-2026-08-29T023345Z.json`.
Its file SHA-256 is
`f6af50f506044e7578dcd02f800c1c71680e322460bf81cf4faa705b0ff5e25f`;
its internal report SHA-256 is
`495d7960a59359794fdb5024171c2e2de66cf69fc7b6701447ae285b46ee376f`.
It advances only consumer-inventory capture. It is not a compatibility pass.

ADR-0090 adds the execution boundary for the six pending rehearsal rows. The
versioned plan binds every one of the fifteen QEMU and four LXC profile hashes,
both storage profiles, all nine management services, both critical workload
aliases, released Starfiniti `v0.1.11`, the exact reviewed Supabase
`self-hosted/v0.8.0` compatibility/Compose/`linux/amd64` image set, the exact
candidate, and all prior evidence. Repository validation runs
the complete controller against adversarial fixtures; it neither supplies a
driver nor creates a target.

A real run uses an isolated equivalent physical Proxmox host. Nested-only
results cannot close boot, KVM, IOMMU, or physical-network compatibility.
Candidate packages and approved read-only critical-workload recovery inputs are
staged before public ingress, external egress, production routes, and production
credentials are prohibited. Synthetic guests cover unrelated behavior profiles;
only application and database clones receive the restricted recovery inputs.

The owner-controlled target inventory, control, and driver stay outside Git and
must be regular caller-owned mode-`0600` files. The output parent is a
caller-owned mode-`0700` directory outside the repository. From a separate clean
capture checkout, repeat the ADR-0088 preflight and keep its newly emitted
minimized mode-`0600` report outside the rehearsal checkout. Immediately before
execution, also repeat the route-free production inventory and pipe its bounded
facts directly to the controller. Both observations must be no more than five
minutes old; the inventory must retain the same projection and the approval must
bind the fresh preflight file digest. The result retains only digests/timestamps
and no raw inventory facts. A changed projection requires a new plan. From the
clean exact rehearsal commit, run:

```sh
<fresh exact route-free collector stdout> | \
npm run proxmox-security:compatibility-rehearsal:run -- \
  --control-file /restricted/rehearsal-control.yaml \
  --inventory-file /restricted/rehearsal-inventory.yaml \
  --fresh-facts - \
  --fresh-preflight-report /restricted/fresh-preflight.json \
  --driver /restricted/rehearsal-driver.mjs \
  --out /restricted/rehearsal-report.json
```

The controller invokes teardown after success or caught failure, and the target
must have a separately enforced auto-destroy lease equal to the approval expiry
before the first stage. A passing execution advances only
`rehearsalExecuted`; it deliberately leaves independent review, compatibility,
rollback, recovery, repository policy, maintenance, installation, reboot, and
production mutation false. Independently bind the restricted stage evidence to
the minimized report before accepting compatibility. No real driver, target,
approval, or report exists in the repository today.

## Phase 2 — Production preflight (read-only unless separately approved)

The operator must independently record and compare, outside Git:

1. Reverify the ADR-0088 minimized report: exact installed package versions,
   running kernel/provider package, retained recovery packages, relevant holds,
   candidate-resolving signed-index digests, and byte-identical state before and
   after the isolated simulation.
2. Exact enabled repository identities and successful signature verification.
3. A fresh package dependency simulation with exactly eleven upgrades, one new
   package, zero removals, zero downgrades, and twelve configurations.
4. Reverify the fresh ADR-0089 whole-host consumer report, then execute the six
   isolated rehearsal rows for all 15 QEMU profiles, all four LXC profiles, both
   storage profiles, all nine required management services, candidate-host boot,
   and application/database clones. An inventory report alone fails this item.
5. Current host configuration backup and package-status inventory.
6. A bootable retained prior kernel and verified console access independent of
   the host network.
7. Current off-host database base backup and WAL continuity, VM recovery
   material, connector/signing/configuration escrow, and the latest isolated
   restore result.
8. Monitoring and incident routes that remain reachable during host and guest
   interruption.

Any missing recovery input fails the maintenance gate. A successful application
backup alone does not prove host recovery, and a whole-VM snapshot alone does not
prove PostgreSQL point-in-time recovery.

## Phase 3 — Exact package-byte staging

This phase writes package files and therefore requires explicit staging approval
and a protected, bounded destination. The operator downloads without installing,
then verifies every filename, exact byte size, and SHA-256 against
`infrastructure/governance/proxmox-security-update-plan.yaml`. Reverify the signed
repository metadata and package-to-index binding. Escrow both the candidate and
the exact approved rollback inputs outside the host.

Rerun the dependency simulation using the staged exact package set. It must still
produce the same twelve actions and no removal, downgrade, unexpected package,
service disablement, or repository substitution. Do not stage from a mutable
package URL after the metadata has changed; create a new versioned plan instead.

## Phase 4 — Maintenance approval

The approval record must identify, outside Git where necessary:

- operations executor and independent observer;
- security reviewer;
- start, abort, rollback, and escalation times;
- console and recovery access proof;
- exact candidate provenance and staged-package manifest;
- enterprise/no-subscription repository decision;
- guest interruption and customer communication decision;
- separate permission for package installation;
- separate permission and timing for reboot;
- success checks and maximum allowed unexplained difference.

Do not begin while backup amplification or recovery transport produces an
unexplained concurrent write/load condition. Quiesce only through approved
service procedures; loyalty checkout independence must remain intact.

## Phase 5 — Installation and reboot

Use APT's noninteractive exact-version transaction only after the Phase 4 install
approval. Capture the resolved action list before confirmation and abort on any
drift. Do not autoremove the prior kernel or recovery packages. Do not reboot
until the package transaction, boot entries, configuration changes, service
state, and console path have been reviewed and the distinct reboot approval is
active.

After reboot, verify the running kernel is the candidate kernel; an installed
kernel is not sufficient. Verify exact package versions and no unexpected
removal, downgrade, held-package change, failed unit, boot error, or repository
change.

## Phase 6 — Service and value smoke

Keep the maintenance state until all relevant checks pass:

- Proxmox UI/API and authenticated console access;
- VM 971 running and every required Supabase service healthy;
- database connectivity, migration/read compatibility, WAL archiving, and backup
  schedules without a repeated transfer-amplification pattern;
- Authentik-to-Supabase login and `https://loyalty.starfiniti.com` dashboard smoke;
- signed WooCommerce connector health and native checkout while the hub/worker is
  unavailable;
- one bounded non-value connector event plus idempotency/retry observation;
- monitoring, alert delivery, clock, storage, network, and scheduled jobs;
- zero unexplained ledger, balance, coupon, event, WAL, or backup difference.

Observe through the approved canary interval. Record a minimized post-change
artifact only after independent review; never mark a gate true from terminal
output alone.

## Abort and rollback

Abort before installation on any candidate or recovery drift. Abort before
reboot on a failed package transaction, changed boot plan, configuration conflict,
failed required service, missing console, or unavailable recovery owner.

If the new kernel does not boot or destabilizes the host, use console access to
boot the retained prior kernel. This restores the kernel choice but does not
automatically revert user-space packages. Do not improvise a bulk downgrade.
For a user-space regression, isolate further change and choose one explicitly
approved path:

1. supported forward fix from newly reviewed signed metadata;
2. exact dependency-checked rollback from the protected escrow;
3. configuration restore when package state is sound and configuration drift is
   the proven cause; or
4. clean-host/guest recovery using the approved recovery plan.

After any abort or rollback, repeat service, recovery, checkout, and protected-
value reconciliation. Preserve incident evidence outside Git, add a compensating
or superseding record, and keep R-059 open until the running host and independent
review prove closure.
