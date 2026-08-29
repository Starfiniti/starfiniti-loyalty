# ADR-0088: Read-only Proxmox start-state preflight

- Status: Accepted
- Date: 2026-08-29
- Decision owners: Starfiniti engineering, security, and operations
- Scope: M15 host hardening and M16 dependency review

## Context

ADR-0086 fixes an immutable twelve-package security-repair candidate. ADR-0087
independently proves the signed repository chain and exact candidate package
bytes without reaching production. Two pre-install facts remain separate: the
production host must still equal the recorded starting state, and its current
APT solver must still select exactly eleven upgrades, one install, and no
removal or downgrade.

The original observation is historical. Reusing it would not detect an
intervening package, kernel, hold, tool, index, or repository change. Refreshing
APT package lists would produce stronger current repository evidence but writes
production state and broadens this read-only slice. The disposable canary cannot
prove the production host's installed state. A local simulation alone is also
too weak if it can acquire network data, if its toolchain has drifted, or if the
simulation changes package-manager state.

Debian documents `apt-get --simulate` as a no-action simulation that emits
`Inst`, `Remv`, and `Conf` records, warns that non-root simulation can be
distorted by configuration access, and supports exact `package=version`
selectors. `--no-remove` additionally aborts if the solution selects a removal.
The separately documented `--no-download` option does not strengthen this
simulation on the live host: combined with simulation it rejects candidate
archives that are not already cached, even though simulation itself performs no
acquisition. The production probe failed closed on that combination before any
action, while the same exact selection succeeded under simulation alone.

## Options considered

### Trust the 2026-08-28 installed-state observation

This preserves zero production access but cannot reverify the pre-install
starting state. A valid historical artifact is not a current maintenance
preflight.

### Refresh production APT metadata and rerun the solution

This can authenticate a fresh repository view but updates `/var/lib/apt/lists`
and may alter package-cache state. It belongs to a separately approved staging
or maintenance phase, not a read-only gate.

### Treat the disposable package canary as sufficient

The canary independently proves public package provenance and bytes. It has no
production route by design and therefore cannot prove installed versions,
running kernel, holds, host tools, or the current dependency solution.

### Run an exact root simulation inside an empty network namespace

This is selected. A bounded reviewed collector runs only through an existing
operator-controlled session. It uses exact versions, root-readable
configuration, `apt-get --simulate --no-remove`, and a new empty network
namespace. It hashes all relevant package, APT-list, archive, repository
configuration, selection, and dpkg state before and after, and emits only a
minimized fact envelope. Repository tooling validates that envelope but contains
no route or credential capability.

## Decision

1. Bind the preflight to the immutable ADR-0086 candidate, the exact passing
   ADR-0087 package report bytes and internal digest, and the exact collector
   bytes. A changed candidate, package artifact, collector, or plan requires a
   new versioned contract.
2. Keep endpoint authority outside the repository. The collector accepts no
   argument, hostname, address, username, key, repository selector, package
   selector, output path, or command. An operator sends its exact committed
   bytes over an already approved session and captures stdout outside Git before
   local validation, or pipes the bounded stdout directly to local validation so
   no raw fact file is retained. Python isolated safe-path mode is mandatory.
3. Require root only to avoid the documented non-root simulation distortion and
   to read authoritative package state. Require fixed canonical root-owned,
   non-group/other-writable `apt-get`, `apt-mark`, `dpkg`, `dpkg-query`,
   `unshare`, and `pveversion` executables with exact captured SHA-256 values.
4. Execute only the twelve validator-bound `package=version` selectors through
   `apt-get --simulate --no-remove install` inside `unshare --net`. The new
   namespace has no production interface. Reject any APT error, warning,
   acquisition line, missing summary, unexpected action, removal, version,
   architecture, configuration, ordering change, or nonzero exit.
5. Do not add `--no-download`: on this host it converts the valid no-action
   simulation into a false archive-cache failure. Network isolation plus APT's
   official simulation semantics is the download-prevention boundary.
6. Before and after simulation, require identical SHA-256 state for dpkg status,
   dpkg selections, dpkg updates, all APT lists, cached package archives, and
   repository configuration. Require the archive cache to contain zero package
   bytes and dpkg updates to be empty.
7. Require the exact twelve installed/absent starting records, all four retained
   recovery-boundary packages, no relevant holds, PVE `9.2.3`, running kernel
   `7.0.6-2-pve`, and the exact package providing that running kernel. Bind the
   two package-index digests that actually resolve the candidate to the
   independently authenticated ADR-0087 report.
8. Record that APT currently calls the running
   `proxmox-kernel-7.0.6-2-pve-signed` package autoremovable. This is not removal
   authorization. The prior running kernel must remain installed and bootable
   through the maintenance and rollback window; no `autoremove` is permitted.
9. A passing report advances only dependency-simulation and installed-starting-
   state gates. It does not prove workload compatibility, repository policy,
   rollback escrow, console access, recovery, maintenance approval, package
   staging or installation, reboot approval, running-candidate kernel, service
   smoke, or reconciliation.

## Security, privacy, and operations effects

The committed collector has no networking library and opens no endpoint. The
only child processes are fixed local read/query tools plus the exact isolated
simulation. It reads package-manager state without creating a remote file. The
validator rejects unknown fields, stale capture input, path or authority
smuggling, reordered or duplicate packages, candidate drift, holds, removals,
downgrades, old-kernel omission, state change, unbounded output, and false gate
promotion.

The minimized report contains public package identities and versions, tool and
index digests, aggregate local-state digests and byte counts, action records,
PVE/kernel versions, timestamps, and booleans. It contains no hostname, IP
address, username, SSH route, key path, repository path, raw APT output, VM
inventory, tenant data, customer data, secret, package byte, or production
credential.

Failure changes no package or repository state and needs no production rollback.
Stop and review any drift. Do not refresh lists, stage packages, install, edit a
repository, control a service, run `autoremove`, or reboot under this decision.
The next allowed transition remains the independently approved compatibility,
rollback, recovery, repository-policy, and maintenance sequence in the Proxmox
security-update runbook.

## Official sources

- Debian Trixie `apt-get`: https://manpages.debian.org/trixie/apt/apt-get.8.en.html
- Debian Trixie `dpkg-query`: https://manpages.debian.org/trixie/dpkg/dpkg-query.1.en.html
- Proxmox VE administration guide: https://pve.proxmox.com/pve-docs/pve-admin-guide.pdf
