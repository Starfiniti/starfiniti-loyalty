# ADR-0095: Build rsync 3.5 side by side against native endpoint libraries

- Status: Accepted
- Date: 2026-08-29
- Extends: ADR-0072 and ADR-0073
- Decision owners: Starfiniti engineering, security, recovery, and operations

## Context

ADR-0073 proves exact Debian unstable and rsync-project Launchpad packages in
disposable OS-matched containers. The Debian host package declares
`libacl1 >= 2.4.0`, so installing it on the Debian 13 Proxmox host would also
replace the distribution `libacl1 2.3.2` with the next-release library. The
package and transport proof is valid, but it deliberately leaves every other
host consumer of the global ACL library unproved.

Debian now publishes `libacl1 2.4.0-1` in the next testing release rather than
Trixie. The rsync project separately publishes a signed 3.5.0 source archive,
documents native Debian and Ubuntu builds with ACL support, supports a custom
installation prefix, and includes the Python `rrsync` wrapper. The current
distribution rsync, rrsync, libacl, package database, SSH daemons, and recovery
data can therefore remain untouched while a versioned candidate is built for
each endpoint's native userspace.

## Alternatives

1. **Wait for both distributions to publish native 3.5 packages.** This
   preserves distribution ownership but leaves the privileged recovery path
   below the mandatory security floor for an unbounded period.
2. **Deploy the already proved cross-suite/PPA packages.** This is the shortest
   package path, but the Proxmox host requires a global cross-suite ACL library
   change and rollback changes two host packages rather than one selector.
3. **Build the signed upstream source once and copy one binary to both
   endpoints.** This avoids package replacement but does not prove the binary
   against both native libc and library sets.
4. **Build the same signed source separately in digest-pinned Debian 13 and
   Ubuntu 24.04 environments, install each under a fixed side-by-side prefix,
   and prove the pair together.** This is selected.

## Decision

Create `starfiniti.rsync-source-security-plan.v1`. It binds the exact upstream
archive, detached signature, full Andrew Tridgell release-key fingerprint,
key-export bytes, safe source-tree manifest, build flags, native endpoint
images, current distribution rollback packages, side-by-side paths, required
capabilities, and internal transport behavior.

Both endpoint builds use the same signed source but compile against their own
distribution libraries and their native `dpkg-buildflags` with every available
hardening feature enabled. The build rejects a candidate without PIE, a
non-executable stack, GNU RELRO, and immediate symbol binding. The candidate root is
`/opt/starfiniti/rsync/3.5.0`; only root-owned, non-writable `rsync` and
`rrsync` artifacts are copied into the runtime image. Debian 13 keeps its
Trixie `libacl1`; Ubuntu 24.04 keeps its Noble `libacl1`. Neither runtime
installs the Debian unstable rsync or ACL package nor the Launchpad rsync
package.

The disposable canary must prove:

- the signature and complete safe source-tree identity before extraction;
- exact endpoint OS, architecture, current package bytes, current executable
  paths, candidate paths, versions, protocol, features, and runtime libraries;
- the current distribution files and native ACL package remain installed and
  byte-stable after the side-by-side copy;
- current-host-to-candidate-guest and candidate-host-to-candidate-guest pulls
  over one internal, no-port network produce the same bounded synthetic files;
- the candidate `rrsync` wrapper contains the 3.5 confinement integration and
  rejects an unrelated forced command;
- immutable minimized output and exact container, image, and network teardown.

The accepted ADR-0073 package plan, report, and V2 escrow evidence remain
historical inputs. They are not rewritten or relabelled as failed. ADR-0095
selects a safer production candidate because it removes the unresolved global
host-library mutation. A later V3 escrow contract must carry the two exact
native candidate binaries, the shared wrapper, signed source inputs, build
contracts, report, activation controls, and unchanged distribution rollback
packages before production activation.

## Security and reliability effects

- The Proxmox package database and global ACL ABI are no longer part of the
  rsync security upgrade.
- Rollback is a fail-closed executable-selector reversal to the untouched
  distribution paths; it does not require an emergency library downgrade.
- Separate endpoint hashes make native build differences explicit rather than
  claiming one artifact is portable across two distributions.
- The upstream source and build lifecycle becomes Starfiniti's responsibility.
  Exact source, key, build, dependency, executable, wrapper, canary, escrow,
  advisory, and rebuild evidence are therefore mandatory.
- A disposable canary still cannot prove the real SSH forced command, systemd
  timer, archive, retention, restore, or production host integrity.

## Migration and rollback

This decision adds repository and disposable-CI evidence only. It authorizes no
production download, compiler, package, binary, selector, service, timer, SSH,
archive, or VM change.

During a separately approved rollout, stage the exact endpoint artifact under
the versioned prefix, verify it in place, change only the reviewed recovery
selectors on both endpoints, and run the negative forced-command, dry-run,
manual archive, timer archive, reconciliation, and isolated-restore gates.
Local WAL and base generation continue throughout.

If any gate fails, stop the off-site archive timer, preserve local WAL, bases,
stages, archives, and evidence, return the selectors to the untouched
distribution paths as an explicitly noncompliant temporary recovery state, and
forward-fix. Never remove the 3.5/confinement gate to make a timer appear
healthy.

## Official references

- Rsync 3.5.0 release and signature: https://rsync.samba.org/
- Rsync release signing-key guidance: https://rsync.samba.org/download.html
- Rsync build guidance: https://download.samba.org/pub/rsync/INSTALL.html
- Rsync security advisories: https://download.samba.org/pub/unpacked/rsync/rsync-web/security.html
- Rsync restricted wrapper: https://download.samba.org/pub/rsync/rrsync.1
- Debian ACL package source: https://sources.debian.org/src/acl/
