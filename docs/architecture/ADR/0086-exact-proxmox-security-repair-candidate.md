# ADR-0086: Exact Proxmox security-repair candidate

- Status: Accepted
- Date: 2026-08-29
- Decision owners: Starfiniti engineering, security, and operations
- Scope: M15 host hardening and M16 provider/dependency review

## Context

The bounded M16 installed-state review found that the production Proxmox host is
below the fixed package floors in five Proxmox security advisories published
between 2026-08-10 and 2026-08-17. The observed host runs kernel
`7.0.6-2-pve`, `pve-manager` `9.2.3`, `qemu-server` `9.1.16`, and
`pve-container` `6.1.10`. The advisories require later kernel,
`pve-manager`, `qemu-server`, and `pve-container` versions.

A read-only APT simulation against the host's configured signed Debian trixie
and Proxmox repositories resolves an exact dependency-complete set of eleven
upgrades and one new signed kernel package, with no removals. The set is
165,341,024 package bytes. Its critical candidates are kernel `7.0.14-14`,
`pve-manager` `9.2.11`, `qemu-server` `9.2.7`, and `pve-container` `6.1.13`.
The existing rsync, BorgBackup, and OpenSSH boundary packages remain selected
and are recorded separately so the security repair cannot silently replace the
recovery transport plan.

This is package-index evidence, not an installation approval. The package bytes
have not been independently downloaded and hashed, repository signatures have
not been independently reverified by the repository tooling, compatibility and
recovery have not been proved, no maintenance or reboot has been approved, and
production has not changed.

The host currently uses Proxmox's `pve-no-subscription` repository. Proxmox
documents that repository as suitable for testing and non-production use and
recommends the enterprise repository for production. Changing repository class
requires a subscription and owner decision; this ADR does not silently make or
block that commercial decision.

## Options considered

### Accept the exposure and rely on network isolation

Network controls reduce reachability but do not repair a vulnerable host,
management service, container toolchain, or virtual-machine control path. This
does not satisfy the Critical finding.

### Install only the four packages named by the advisories

This appears smaller but ignores the dependency solution selected by APT. It can
produce an unsupported mixture of manager, storage, QEMU, HA, widget, and kernel
components and makes rollback evidence ambiguous.

### Apply every currently available distribution upgrade

This is simple operationally but expands the change beyond the security repair,
mixes unrelated behavior into the maintenance window, and makes causal rollback
and post-change reconciliation harder.

### Bind the exact dependency-complete APT repair set and gate deployment

This is selected. A versioned plan fixes repository metadata digests, all twelve
package identities, versions, filenames, sizes, and SHA-256 values, retained
recovery-boundary packages, advisory sources and floors, and explicit false
deployment gates. A deterministic validator rejects any byte or decision drift.

## Decision

1. Record the immutable V1 candidate in
   `infrastructure/governance/proxmox-security-update-plan.yaml`. Its canonical
   candidate provenance is
   `39f30c67a374b041944a598ce2334fed3fcb8e5f64264b3db08847d5ee23ff9f`.
2. Treat the five-advisory gap as an open Critical production risk. Candidate
   metadata being complete does not lower the risk or constitute acceptance.
3. Permit only the exact eleven-upgrade, one-install, zero-removal candidate for
   this maintenance decision. Any newer repository result, different dependency
   solution, removal, or package digest requires a new versioned plan and review.
4. Before installation, independently refresh and verify signed repository
   metadata, download every exact package without installing it, verify all
   twelve byte sizes and SHA-256 values, rerun the exact dependency simulation,
   and prove the installed versions still equal the plan's starting state.
5. Require operations and security approval for a bounded maintenance window,
   owner resolution of the enterprise-versus-no-subscription repository choice,
   package/configuration rollback escrow, a bootable retained kernel, current
   database/WAL and VM recovery evidence, and an independent recovery reviewer.
6. Installation and reboot are separate approvals. A package transaction may
   not imply permission to reboot, and a reboot approval may not authorize a
   drifted package transaction.
7. After reboot, prove the running kernel and package state, host management,
   guest start/health, Supabase services, public authentication and dashboard
   smoke, WooCommerce checkout independence, backup/WAL flow, monitoring, and
   reconciliation. Do not claim the advisories closed from an installed-but-not-
   running kernel.
8. Keep production mutation false in repository evidence until a distinct,
   minimized, approved post-change record proves the exact executed transaction
   and smoke/recovery results. Do not store hostnames, addresses, credentials,
   package-manager logs, tenant data, or customer data in Git.

## Security and integrity effects

The plan binds the candidate rather than automating privileged access. The
repository validator has no SSH, package-download, installation, bootloader, or
reboot authority. The exact provenance constant means editing a valid-looking
version, advisory floor, package hash, repository digest, or false gate and then
recomputing the document field still fails unless the versioned validator is
also deliberately reviewed.

The advisory mapping proves only that the fixed candidate versions meet the
listed Proxmox floors. It does not prove the absence of other vulnerabilities,
package compatibility, workload safety, or successful recovery. The
`pve-no-subscription` limitation remains visible and cannot be converted to a
production recommendation by the validator.

## Operations and rollback

Follow `docs/operations/PROXMOX_SECURITY_UPDATE.md`. The primary kernel rollback
is to boot the retained prior kernel after a failed new-kernel boot; it is not an
automatic downgrade of the twelve-package transaction. User-space package
downgrade can itself be unsafe and requires exact escrow, dependency simulation,
configuration comparison, and an explicit incident decision. Prefer a supported
forward fix when the host is reachable and state is intact.

If management or workload health cannot be proved, stop rollout, keep the host
isolated from further change, preserve evidence outside Git, restore service by
the approved kernel/package/configuration or clean-host recovery path, and
reconcile VM, database, WAL, backup, authentication, checkout, and loyalty value
before reopening traffic. Supersede this ADR and the V1 plan for a changed
candidate; never rewrite the historical decision.

## Official sources

- Proxmox security advisories:
  https://forum.proxmox.com/threads/proxmox-virtual-environment-security-advisories.149331/page-4
- Proxmox VE administration guide, package repositories:
  https://pve.proxmox.com/pve-docs/pve-admin-guide.pdf
