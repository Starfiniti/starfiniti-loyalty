# ADR-0072: Require the rsync 3.5 backup-transport security baseline

- Status: Accepted
- Date: 2026-08-28
- Extends: ADR-0013 and ADR-0071
- Extended by: ADR-0073

## Context

ADR-0013 uses a forced read-only `rrsync` sender on the database VM and a root-run rsync receiver on the Proxmox host. This removed the full-stream amplification incident and keeps the Borg credential off the database VM, but it makes both rsync processes part of the recovery trust boundary.

Upstream rsync 3.5.0 was released on 2026-08-13 after a focused security audit. It fixes 33 security issues and adds regression tests. The fixes include the directly applicable CVE-2026-53783 restricted-`rrsync` directory escape, peer-triggerable memory-safety failures, path-confinement failures, and command/argument injection. The repaired wrapper inode-pins the restricted root and passes the new `--confine-root` option to rsync. Upstream explicitly documents that earlier `rrsync` validated a path and later reused the name, leaving a time-of-check/time-of-use window and dangerous options in a restricted subdirectory.

Read-only production inspection on 2026-08-28 found:

- Proxmox/Debian 13.5 runs rsync `3.4.1+ds1-5+deb13u3`; Debian's configured stable candidate `deb13u4` fixes CVE-2026-45232 but Debian still marks the 3.5.0 audit findings open for stable.
- The Ubuntu 24.04.4 database VM runs rsync `3.2.7-1ubuntu1.5`; Ubuntu still reports the August findings as needing evaluation.
- Both `/usr/bin/rsync` and `/usr/bin/rrsync` are root-owned regular mode-`0755` files, but neither endpoint implements the complete 3.5.0 security baseline.

The current restricted key is available only to Proxmox root, the exported tree and host stage are owner-only, and the database VM and Proxmox host are trusted components. Those controls reduce immediate exploitability but do not remove the boundary: a compromised database VM can act as a malicious rsync peer toward the privileged host receiver, while a stolen restricted pull key reaches the pre-3.5 `rrsync` parser. Enterprise recovery cannot treat topology assumptions as a substitute for the published protocol and path-handling fixes.

Authoritative references:

- [rsync 3.5.0 release notes](https://download.samba.org/pub/rsync/NEWS#3.5.0)
- [rsync 3.5 security guidance](https://download.samba.org/pub/unpacked/rsync/rsync-web/security.html)
- [rsync 3.5 `--confine-root` documentation](https://download.samba.org/pub/rsync/rsync.1)
- [Debian stable rsync package](https://packages.debian.org/stable/rsync)
- [Debian rsync security tracker](https://security-tracker.debian.org/tracker/source-package/rsync)
- [Ubuntu CVE-2026-53790 status](https://ubuntu.com/security/CVE-2026-53790)

## Alternatives

1. **Install only the available Debian `deb13u4` point update.** This closes the proxy-response write but not the open 3.5.0 audit findings or the restricted-wrapper escape. It is necessary package hygiene, not a sufficient transport gate.
2. **Wait for Debian and Ubuntu to backport every fix.** This preserves vendor packaging but leaves the production recovery boundary knowingly below the reviewed baseline for an unbounded period. A future complete backport can supersede this ADR with exact vendor evidence.
3. **Keep the old binaries and rely on owner-only directories and a trusted peer.** This narrows some local races but does not address malicious protocol input, `rrsync` confinement, or a compromised guest-to-host trust transition.
4. **Require rsync 3.5.0 or newer at both endpoints and verify the repaired restricted wrapper before transport.** This fails deployment and runtime safely until an approved package or independently verified build exists. It changes no archive format and retains the existing incremental protocol.
5. **Replace rsync with SFTP, a custom manifest protocol, or another backup product.** This could remove the affected implementation but creates a new incremental-transfer, atomicity, retry, integrity, and restore boundary that lacks current production evidence.

## Decision

Use option 4.

The undeployed ADR-0071 archive controller validates its configured rsync executable before creating or changing the stage. The executable path must be absolute and canonical, name a regular executable owned by root or the effective service user, and sit under a directory chain owned by root or that user with no unprotected group/other write access. With `LC_ALL=C`, its first version line must parse as rsync 3.5.0 or newer. Missing, malformed, older, linked, differently owned, writable, or unsafe-parent executables fail before rsync, metrics, repository identity, locking, or Borg.

The database-VM forced exporter performs the same version comparison against the fixed `/usr/bin/rsync`, requires root ownership and no group/other write bit for both `/usr/bin/rsync` and `/usr/bin/rrsync`, verifies their complete parent chains, and requires the installed restricted wrapper to contain the upstream `--confine-root` integration. It clears the inherited environment except for a fixed system path, C locale, and the one opaque `SSH_ORIGINAL_COMMAND` before executing `rrsync -ro` against the fixed recovery root. A baseline failure occurs inside the fixed privileged wrapper before rrsync runs or any backup filename is listed.

The production gate intentionally does not download, build, install, or upgrade rsync. ADR-0073 separately binds current exact vendor-signed Debian and rsync-project Launchpad packages through a disposable OS-matched canary without authorizing installation. Production package acquisition, rollback escrow, real compatibility testing, and installation remain operator-controlled supply-chain actions. A package version string below 3.5.0 does not pass merely because a subset of fixes was backported. A future distribution package that backports the complete audit set may be accepted only through a superseding ADR that binds exact package versions, patches, regression evidence, and vendor support.

The host and guest may run different package builds as long as both report at least 3.5.0 and the guest wrapper proves the confinement integration. Rsync protocol negotiation remains authoritative for wire compatibility. The existing immutable-file, `.partial` exclusion, `--ignore-existing`, compression, transfer-amplification, staging, and Borg controls remain unchanged.

## Security and reliability effects

- A pre-3.5 sender or receiver cannot silently remain in the approved recovery path.
- The specifically affected restricted wrapper must include its confinement handoff instead of relying on its filename or package presence.
- Environment cleanup removes `RSYNC_PROXY`, `RSYNC_CONNECT_PROG`, password, and other inherited rsync authority from the forced exporter.
- Refusing an unsafe transport makes off-site archive freshness fail visibly while local PostgreSQL WAL archiving and physical base creation continue independently.
- A passing version/capability gate does not prove package provenance, OS patch cadence, host integrity, archive correctness, or restore success.

## Operations

Before installing the candidate controller, an approved maintenance window must install a vendor-supported or independently verified rsync 3.5.0-or-newer build on both endpoints. Record package/source version, origin, signature/checksum, installed executable digests, `rsync --version`, the guest `rrsync` confinement check, and the exact rollback packages without storing binary or credential material in Git.

Run the restricted-command negative tests, one read-only dry run, one measured manual archive, one timer archive, the transfer-boundary fixtures, and an isolated restore. Reject rollout if either endpoint falls below the baseline, the guest wrapper lacks confinement, the stage differs from the source facts, or any old binary remains reachable through the systemd/forced-command path. Package-advisory review becomes part of M16's provider/dependency cadence.

## Migration and rollback

Keep the current timer and binaries unchanged until the approved dual-endpoint package and compatibility evidence passes. During the maintenance window, stop only the off-site archive timer, preserve local WAL/base production, install and verify both endpoints, then resume after the manual canary. If compatibility fails, restore the prior packages only as a temporary explicitly failing recovery state, keep local WAL/base generation active, preserve every stage and archive, and forward-fix the transport. Never bypass or remove the version/confinement gate to make the timer appear healthy.
