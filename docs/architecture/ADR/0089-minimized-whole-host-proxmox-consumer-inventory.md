# ADR-0089: Minimized whole-host Proxmox consumer inventory

- Status: Accepted
- Date: 2026-08-29
- Decision owners: Starfiniti engineering, security, and operations
- Scope: M15 host hardening and M16 dependency review

## Context

ADR-0088 proves the current package starting state and dependency solution but
does not identify everything that consumes the Proxmox kernel, QEMU, LXC,
storage, network, HA, or management-service surface. The security update cannot
be called compatible merely because the two loyalty VMs are present and running.
Every guest and host facility on the single production node shares the update
and reboot boundary.

The compatibility rehearsal therefore needs a complete but privacy-minimized
consumer matrix. Raw `qm config`, `pct config`, unrelated VM IDs, storage
identifiers, interface names, guest names, addresses, MACs, paths, and customer
or tenant data must not enter Git. The exact critical-workload selector constants
remain confined to reviewed collector source and are never emitted. The inventory
step must remain distinct from the future isolated rehearsal: observing a profile
does not prove that profile works under the candidate kernel and packages.

## Alternatives

### Inventory only the loyalty application and database VMs

This is smaller, but it can miss a different QEMU machine type, disk controller,
guest agent, LXC feature, storage backend, or host service used by another guest.
A whole-host update would then rely on an incomplete compatibility claim.

### Retain raw host and guest configuration

This would preserve maximum debugging detail, but it would unnecessarily expose
identifiers, topology, paths, addresses, and potentially sensitive free-form
configuration. It also makes later review depend on operational data that should
remain outside the repository.

### Hash every raw configuration as one opaque record

This minimizes disclosure but is not actionable. Reviewers could not determine
which distinct behavior classes require rehearsal, and harmless identity changes
would invalidate the whole matrix.

### Project anonymous behavior profiles for the whole host

This is selected. A bounded route-free collector projects only allowlisted
compatibility characteristics, groups equal projections under deterministic
SHA-256 profile IDs, and retains counts and lifecycle states. The two critical
loyalty workloads use fixed semantic aliases only. Repository validation
recomputes every profile and the whole projection, reconciles all counts, and
keeps compatibility and mutation gates false.

## Decision

1. Inventory every current QEMU VM and LXC container, not only the two loyalty
   workloads. Emit no numeric VM ID or guest name. Represent the loyalty
   workloads only as `application` and `database` aliases bound to their
   anonymous profile.
2. Project allowlisted compatibility characteristics: configuration-key shape,
   QEMU machine/BIOS/CPU/controller/device counts, LXC architecture/privilege/
   nesting/mount/network/device counts, lifecycle status, storage type/content/
   availability, required service state, aggregate interface kind/state, HA
   resource count, kernel/KVM/IOMMU/boot facts, and exact local tool digests.
3. Exclude raw configuration values, storage IDs, interface names, hostnames,
   addresses, MACs, routes, credentials, paths, VM IDs, raw command output,
   tenant data, and customer data from the fact and report schemas.
4. Bind the collector to canonical root-owned non-group/other-writable
   `python3`, `pvesh`, `qm`, `pct`, `pvesm`, `systemctl`, and `pveversion`
   executables. Run it as root under `python3 -I` with no arguments, endpoint,
   credential, output path, network client, package manager, configuration
   writer, service/guest controller, storage writer, or reboot command.
5. Use only local read interfaces: Proxmox API reads, `qm config`, `pct config`,
   `pvesm status`, `systemctl show`, and bounded `/proc` and `/sys` reads. Run the
   safe projection twice and accept it only when both canonical forms are exact.
6. Require a fresh bounded fact envelope and pipe it directly to the local
   validator. Do not retain raw facts. The accepted report contains only the
   minimized anonymous projection and aggregate summary.
7. Bind the inventory to the exact ADR-0086 candidate, ADR-0088 plan/report,
   collector bytes, expected tool bytes, and expected projection digest. Drift
   fails closed and requires reconstruction; it is not silently normalized.
8. Translate the accepted inventory into six still-pending rehearsals: candidate
   host boot, every distinct QEMU profile, every distinct LXC profile, both
   storage profiles, all required management services, and isolated clones of
   the application/database workloads with full loyalty recovery smoke.
9. A passing inventory advances only `consumerInventoryCaptured`. It does not
   prove compatibility, rollback escrow, recovery readiness, repository policy,
   maintenance approval, installation, reboot, production mutation, service
   smoke, observation, or protected-value reconciliation.

## Security and integrity effects

The collector has no remote-session implementation: an operator supplies its
exact reviewed bytes over an already approved session. Failure changes no host,
guest, storage, service, or package state and needs no production rollback. The
validator uses bounded no-follow reads, rejects unknown fields and sensitive
keys, recomputes per-profile and whole-projection digests, requires stable reads,
and writes only a minimized report from a clean implementation commit.

An accepted snapshot proves completeness only at its observation time. New,
removed, reconfigured, paused, or migrated guests and changed storage, services,
network shape, tool bytes, kernel, or host platform invalidate the snapshot.
Repeat this gate immediately before the compatibility rehearsal and again before
maintenance; do not weaken the expected matrix to make drift pass.

## Operations

Run `npm run proxmox-security:compatibility-inventory:validate` before capture.
From a clean exact commit, transmit and independently hash the exact collector,
execute it as root under isolated Python through the already approved session,
and pipe its bounded stdout directly to
`npm run proxmox-security:compatibility-inventory:capture -- --facts -`. Reverify
the minimized report with the validator's `--verify-report` mode.

Stop on collector-byte, tool, platform, guest/profile, storage, service, network,
HA, stable-read, freshness, or projection-digest drift. Keep the raw stream out of
the repository. A valid inventory becomes the minimum future rehearsal matrix;
it does not authorize any rehearsal or production action.

## Migration and rollback

This adds a report-only gate and no production schema, package, service, guest,
storage, network, or configuration change. Failure requires no production
rollback. Delete any unaccepted local raw fact stream, preserve accepted reports
immutably, and forward-fix the versioned plan or collector when legitimate host
drift requires a new expected projection. Never rewrite the prior observation or
remove a rehearsal row merely to obtain a pass.

## Official sources

- Proxmox VE administration guide: https://pve.proxmox.com/pve-docs/pve-admin-guide.pdf
- Proxmox `qm`: https://pve.proxmox.com/pve-docs/qm.1.html
- Proxmox `pct`: https://pve.proxmox.com/pve-docs/pct.1.html
- Proxmox `pvesh`: https://pve.proxmox.com/pve-docs/pvesh.1.html
- Proxmox `pvesm`: https://pve.proxmox.com/pve-docs/pvesm.1.html
- systemd `systemctl`: https://www.freedesktop.org/software/systemd/man/latest/systemctl.html

## Evidence result

The versioned plan expects 22 anonymous guests: 18 QEMU VMs and four LXC
containers, with 20 running and two stopped. They form 19 distinct profiles,
including 15 QEMU and four LXC profiles. Both critical loyalty workloads are
running and share one anonymous QEMU profile. The host also exposes two storage
profiles, nine required active management services, one default IPv4 route,
77 aggregate network interfaces, and zero configured HA resources.

Exact implementation `e7825b6230fba027c8477ece08c1c1b5cf364aaa`
produced the first accepted minimized report at `2026-08-29T02:33:45Z`:
`proxmox-compatibility-inventory-e7825b6-2026-08-29T023345Z.json`. The 9,236-byte
file has SHA-256
`f6af50f506044e7578dcd02f800c1c71680e322460bf81cf4faa705b0ff5e25f`
and internal report SHA-256
`495d7960a59359794fdb5024171c2e2de66cf69fc7b6701447ae285b46ee376f`.
Independent verification passes, no forbidden identifier field or raw fact file
was retained, and `consumerInventoryCaptured` is true in the report only. Every
rehearsal plus compatibility, recovery, approval, installation, reboot, mutation,
and post-change gate remains false.
