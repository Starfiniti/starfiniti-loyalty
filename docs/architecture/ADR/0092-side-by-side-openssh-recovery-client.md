# ADR-0092: Side-by-side OpenSSH recovery client

- Status: Accepted
- Date: 2026-08-29
- Decision owners: Starfiniti engineering, security, recovery, and operations
- Scope: M16 recovery dependency review and the privileged host-to-guest backup transport

## Context

The ADR-0085 installed-state artifact records Debian 13
`openssh-client=1:10.0p1-7+deb13u4` on the Proxmox host and Ubuntu 24.04
`openssh-server=1:9.6p1-3ubuntu13.18` on the database guest. The host initiates
the privileged recovery pull. A compromised guest or remote recovery endpoint
therefore occupies the server side of a connection made by a root-controlled
host client.

OpenSSH 10.4 fixes a client use-after-free when a malicious server changes its
host key during key re-exchange. Debian marks the installed Trixie client
affected, with a no-DSA/minor disposition, and publishes the fix only in newer
suites. Ubuntu's installed guest package already incorporates its July security
update for the 10.4-era issues.

OpenSSH 10.5 adds three more fixes. The agent issue requires forwarded-agent
state, the client issue requires a remote forwarding to be added through a
multiplex socket while another remote-forward open is pending, and the server
issue concerns the `restrict` authorized-key keyword and tunnel forwarding.
The reviewed backup command uses an explicit key, no agent forwarding, no
multiplexing, no remote forwarding, and no tunnel. These are still relevant
hardening inputs, but the direct reason for a host client candidate is the
malicious-server client boundary fixed in 10.4.

The distribution package authority remains preferred for system SSH daemons.
The problem is narrower: Debian Trixie has no fixed client package for every
reviewed issue and Debian unstable was still at 10.4 when this decision was
recorded.

## Alternatives

### Wait for Debian and Ubuntu backports

This preserves ordinary package maintenance and remains the preferred eventual
steady state. It leaves the privileged host client on an affected package for
an unknown interval and does not create compatibility evidence in advance.

### Install Debian forky or unstable OpenSSH on Trixie

This crosses suites, broadens native-library and package-script risk, and still
does not reach OpenSSH 10.5. It is rejected.

### Replace both distribution SSH clients and servers from upstream

This would unnecessarily assume responsibility for PAM, systemd integration,
privilege separation, sandboxing, host keys, server configuration, upgrades,
and emergency access. It is rejected.

### Build only the signed upstream portable client beside the distribution

This is selected. The one required executable can live below a versioned
`/opt/starfiniti` root while `/usr/bin/ssh`, both distribution `sshd` services,
host keys, known-hosts files, and recovery data remain unchanged. Selection and
rollback are explicit per consumer.

## Decision

1. Add `starfiniti.openssh-client-security-plan.v1` binding the installed host
   client, exact guest package set and server executable, official 10.5p1
   archive and release-note checksum, detached signature, official release-key
   bytes and full fingerprint, safe source-tree manifest, build flags,
   compatibility behavior, ceilings, and false production authority.
2. Permit a single `bootstrap` Linux run only to discover the stripped candidate
   executable digest. Bootstrap cannot pass the exact compatibility evidence
   row. The digest must then be placed in a `candidate` plan and the complete
   exact plan rerun.
3. Import only the official release key matching fingerprint
   `7168 B983 815A 5EEF 59A4 ADFD 2A3F 414E 7360 60BA`; require one matching
   `VALIDSIG` result. Reject absolute, parent-traversing, duplicate, linked, or
   special archive members and bind the 930-entry, 892-file, 10,059,047-byte
   source tree before extraction and before compilation.
4. Build only target `ssh`, strip it deterministically, and install it root-owned
   and non-writable at
   `/opt/starfiniti/openssh/10.5p1/bin/ssh`. Do not build, install, select, or
   configure candidate `sshd`, `ssh-agent`, `scp`, or `sftp` components.
5. Preserve Debian `openssh-client=1:10.0p1-7+deb13u4` and verify its archive
   through signed repository metadata plus exact-URL byte equality. It remains
   the package-managed rollback client.
6. Prove the current and candidate clients against the exact Ubuntu Noble
   `1:9.6p1-3ubuntu13.18` server line. Use a Docker-internal network with no
   published ports, disposable test-only keys, strict pinned host-key checking,
   public-key authentication, a restricted forced command, disabled forwarding,
   disabled agent/X11/proxy/multiplex/interactive/password behavior, bounded
   resources and output, and exact container/network/volume/image teardown.
7. A passing synthetic canary does not authorize installation or selection.
   Production activation requires artifact escrow, every consumer and config
   enumerated, exact real-provider rsync and Borg behavior, monitoring, an
   isolated full-service restore, rollback, independent review, and separate
   approval.

## Security and operations effects

The selected candidate reduces package-global change and keeps emergency access
and both SSH daemons under their vendors. `-F /dev/null` plus explicit options
prevents an ambient client configuration from silently enabling forwarding,
proxies, multiplexing, weaker authentication, or host-key behavior for the
reviewed recovery command. Production keys and endpoints never enter the
repository or canary.

The build stage needs network access only for exact OpenBSD and Debian/Ubuntu
artifacts. Runtime communication is limited to one internal Docker network. A
later operator rollout must bind the candidate binary itself rather than
rebuilding from a moving build dependency set.

## Migration and rollback

This ADR adds only repository validation and disposable proof. It does not
change a package, daemon, host key, known-host entry, backup timer, repository,
archive, checkout path, or loyalty value.

During a separately approved rollout, install the escrowed binary beside the
distribution client and change one enumerated recovery consumer at a time to the
exact path and digest. Rollback pauses the affected timer, restores the exact
`/usr/bin/ssh` command and reviewed options, proves host-key and forced-command
behavior, exercises the next transfer and archive cycle, and preserves all WAL,
base backups, stages, repositories, and archives.

## Official sources

- OpenSSH 10.5 release notes: https://www.openssh.org/releasenotes.html#10.5
- OpenSSH Portable release and signing key: https://www.openbsd.org/openssh/portable.html
- OpenSSH Portable installation: https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/INSTALL
- Debian OpenSSH tracker: https://security-tracker.debian.org/tracker/source-package/openssh
- Ubuntu USN-8533-1: https://ubuntu.com/security/notices/USN-8533-1

## Evidence result

The threat model, architecture, exact source and package inputs, client-only
build boundary, compatibility contract, rollback boundary, and adversarial
repository validator exist. Bootstrap Security run `33240398639` passed and
discovered candidate executable SHA-256
`be9dd9ee2550e3fca2a6fa15edb5ab9303e42ac783ac766928fa5380971bf081`.
The plan now binds that digest as `candidate`; bootstrap is not accepted as
final compatibility evidence, so a fresh exact-plan Linux run remains required.
Production is unchanged and M16 remains in progress.
