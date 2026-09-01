# ADR-0091: Signed BorgBackup security candidate

- Status: Accepted
- Date: 2026-08-29
- Decision owners: Starfiniti engineering, security, recovery, and operations
- Scope: M16 recovery dependency review and R-004

## Context

The ADR-0085 installed-state evidence records Debian 13 BorgBackup `1.4.0-5`
on the production Proxmox host. Debian's security tracker marks that Trixie
package affected by `CVE-2026-62268` and records `no-dsa` with a minor-issue
disposition. BorgBackup 1.4.5 contains the upstream fix. Debian Trixie still
publishes `1.4.0-5`, while Debian unstable publishes a newer package.

This is not evidence of current archive corruption or a critical-severity
incident. It is nevertheless part of the recovery trust boundary: Borg reads,
writes, prunes, compacts, and extracts encrypted off-host archives. The upgrade
must therefore prove candidate provenance, mixed client/server compatibility,
maintenance behavior, extraction by the retained client, and a rollback path
without using production as the first test environment.

Official Borg upgrade guidance says 1.2.5-or-newer repositories do not require a
special upgrade for Borg 1.4. The production package is already 1.4.0, but this
compatibility statement does not replace executable, remote-provider, archive,
maintenance, or restore evidence.

## Alternatives

### Wait for a Debian stable security update or backport

This retains one package authority and ordinary unattended maintenance, but no
fixed Trixie package or committed availability date currently exists. Waiting
leaves the recovery executable on the affected version for an unbounded period.

### Install Debian unstable's fixed package on Trixie

This provides a distribution package but mixes suites and can change Python and
native dependencies beyond Borg. The broader dependency and rollback surface is
unnecessary for one recovery executable.

### Maintain a private Trixie backport

This can preserve Debian packaging conventions, but creates a private build,
signing, publication, patch, and retirement lifecycle before a proven need for
local packaging exists.

### Use Borg's upstream-signed single-directory release

This is selected. Borg publishes a locally built glibc 2.31 x86-64 archive, a
detached OpenPGP signature, and a README that publishes the full signing
fingerprint. A versioned directory can coexist with Debian's current executable,
so consumer selection and rollback are explicit rather than package-global.

## Decision

1. Add `starfiniti.borgbackup-security-plan.v1`. It binds Debian 13 by image
   digest; installed `borgbackup=1.4.0-5`; the exact Debian archive URL,
   package SHA-256, and installed executable SHA-256; the official Borg 1.4.5
   archive, signature, README, full primary fingerprint, executable, and
   extracted-tree manifest; all compatibility operations; resource ceilings;
   and false production authority.
2. Resolve the rollback package twice inside a disposable build: once through
   signed Trixie metadata and once through its exact HTTPS archive URL. Require
   byte equality, SHA-256, package name, version, architecture, installed
   version, executable version, and executable SHA-256.
3. Verify the candidate archive, detached signature, and README hashes before
   extraction. Import only the key matching full primary fingerprint
   `6D5B EF9A DD20 7580 5747 B70F 9F88 FB52 FAF7 B393`; require the README's
   spaced fingerprint and a `VALIDSIG` result whose primary fingerprint is the
   same value.
4. Reject absolute, parent-traversing, backslash-bearing, duplicate, linked, or
   special archive members. Stream-hash all 95 regular files and require the
   exact 106-entry, 79,942,815-byte manifest before extraction and again from
   the extracted tree. Install only under
   `/opt/starfiniti/borg/1.4.5/borg-dir`, root-owned and non-writable.
5. Run the compatibility canary as UID/GID 65532 in a read-only, capability-free,
   no-new-privileges container with no network, no published ports, bounded
   CPU, memory, PIDs, and no-execute tmpfs workspaces. The canary has no
   endpoint, credential, SSH implementation, production route, or production
   data.
6. Exercise current and candidate clients against current and candidate local
   Borg remote servers. Cover init, create, JSON info/list, repository check,
   prune dry-run, compact, and extraction in both upgrade and rollback
   directions. The current 1.4.0 client must extract a candidate-created
   archive. Exact container and image teardown is required before minimized
   evidence can be written.
7. Keep the Debian package and its repositories installed and keep every
   archive, stage, local WAL file, and base backup. A passing canary is candidate
   provenance and synthetic compatibility evidence only; it does not authorize
   installing, selecting, or invoking the candidate in production.
8. Production activation requires operations escrow of the archive, signature,
   README, signing key, manifest, rollback package, and instructions; independent
   checksum/fingerprint review; exact real remote-provider compatibility;
   every Borg consumer and timer enumerated; manual archive/list/check/dry-run
   maintenance/extract checks; a timer cycle; monitoring observation; an isolated
   full-service restore; a rollback exercise; and separate approvals.

## Security and integrity effects

The archive SHA-256 prevents silent byte drift, while the detached signature and
full fingerprint supply an independent release-authenticity chain. The safe tar
inspection occurs before extraction even though the archive is exact. Versioned
installation avoids overwriting `/usr/bin/borg`; the installed Debian package
remains the rollback executable.

The CI build has network access only to the exact Debian, GitHub release, and
Ubuntu keyserver inputs. Runtime is networkless. Raw `.deb`, archive, signature,
README, and key files are deleted from the built filesystem; the CI runner may
still retain ordinary Docker build cache until its ephemeral host is destroyed,
so evidence claims only exact container and image removal, not global cache
erasure.

The repository deliberately has no production endpoint or consumer-switching
controller. The whole-VM backup implementation is environment-owned and must be
included in the operator inventory. A candidate cannot be approved if even one
consumer's executable path/digest, remote path, repository, retention behavior,
or rollback behavior is absent.

## Operations

Run `npm run borgbackup-security:validate` on every change. Linux CI runs:

```sh
npm run borgbackup-security:run -- \
  --out dist/borgbackup-security/ci.json
```

Follow `docs/operations/BORGBACKUP_SECURITY_UPDATE.md` for escrow, real-provider
preflight, activation, observation, restore, and rollback. Failed evidence is
never edited into a pass; change the plan or implementation and produce a new
exact-head run.

## Migration and rollback

This decision adds repository validation and a disposable compatibility test
only. It does not change the production package, executable, timer, repository,
archive, retention policy, network, database, checkout path, or loyalty value.

For a later approved rollout, install the candidate beside `/usr/bin/borg` and
switch each reviewed consumer to the exact versioned executable only after its
manual check. Rollback pauses affected timers, restores every consumer to
`/usr/bin/borg`, verifies the exact installed 1.4.0 executable, releases no
ambiguous lock, and proves list/check/extract plus the next timer cycle. Do not
downgrade repository contents, delete candidate-created archives, edit history,
or roll back local WAL/base-backup production.

## Official sources

- BorgBackup 1.4.5 release: https://github.com/borgbackup/borg/releases/tag/1.4.5
- BorgBackup 1.4 installation and upgrade guidance: https://borgbackup.readthedocs.io/en/1.4.5/installation.html
- BorgBackup 1.4.5 changes: https://borgbackup.readthedocs.io/en/1.4.5/changes.html#version-1-4-5-2026-07-19
- BorgBackup release signing guidance: https://github.com/borgbackup/borg/releases/download/1.4.5/00_README.txt
- Debian Trixie package: https://packages.debian.org/trixie/borgbackup
- Debian CVE tracker: https://security-tracker.debian.org/tracker/CVE-2026-62268

## Evidence result

The plan, source impact, signature boundary, rollback-package boundary,
networkless compatibility controller, and adversarial repository validation are
implemented. Exact implementation `fe727d53422a90f939218e510c9a028c4ba915ff`
passed the four-pair, eight-operation Linux canary in Security run `33235799207`,
job `99056449824`; the retained report and GitHub artifact archive are bound by
distinct SHA-256 digests. Operations escrow, real remote-provider compatibility,
production rollout, isolated restore, rollback exercise, and independent
approvals do not yet exist. M16 remains `in_progress`, its score does not advance,
and R-004 remains open.
