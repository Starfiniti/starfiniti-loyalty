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

## Phase 2 — Production preflight (read-only unless separately approved)

The operator must independently record and compare, outside Git:

1. Exact installed package versions and running kernel against the V1 start
   state.
2. Exact enabled repository identities and successful signature verification.
3. A fresh package dependency simulation with exactly eleven upgrades, one new
   package, and zero removals.
4. Active VM/container inventory and the host consumers of rsync, BorgBackup,
   OpenSSH, QEMU, storage, HA, and container tooling.
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
