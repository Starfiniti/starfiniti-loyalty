# ADR-0073: Bind exact vendor rsync packages through a disposable transport canary

- Status: Accepted
- Date: 2026-08-28
- Extends: ADR-0072

## Context

ADR-0072 correctly makes rsync 3.5.0 and the repaired `rrsync` confinement integration mandatory on both sides of the privileged recovery transport. It deliberately left package acquisition unresolved. Production therefore still uses Debian rsync `3.4.1+ds1-5+deb13u3` on the Proxmox host and Ubuntu rsync `3.2.7-1ubuntu1.5` on the database guest, while the undeployed recovery controller refuses both.

Current official sources now provide exact architecture-compatible packages:

- Debian unstable publishes `rsync_3.5.0+ds1-2_amd64.deb` through the Debian archive. The package is acquired from signed Debian repository metadata using the base image's Debian archive keyring and is independently bound to SHA-256 `5f0ecada9a0b4729f18aca43260bb8bcb16f95750c562409f84555b9de59a094`. Debian 13's `libacl1` 2.3.2 does not satisfy this package's declared `>= 2.4.0` dependency, so the plan also binds the sole Debian unstable dependency `libacl1_2.4.0-1_amd64.deb` to SHA-256 `e9da0e00387e31c1709b70497f1eda91389c962c3940e6d233d4c57f5ea6f635`; it depends only on a libc baseline already met by Debian 13.
- The rsync project documents its stable Launchpad PPA as an installation route. Its Ubuntu Noble build publishes `rsync_3.5.0-1ppa~noble1_amd64.deb`. The repository key is accepted only when its complete fingerprint is `72BBF83452B11E5B5A8F99123CC6C2BBC7F3DB85`, and the package is independently bound to SHA-256 `3ae102d79c9a82d1f1aee94bde3afa3142a7ef6f367484f130d6fba05c3c1648`.

Authoritative references:

- [rsync 3.5.0 release](https://download.samba.org/pub/rsync/NEWS#3.5.0)
- [rsync security guidance](https://download.samba.org/pub/unpacked/rsync/rsync-web/security.html)
- [rsync installation guidance](https://download.samba.org/pub/rsync/INSTALL.html)
- [Debian unstable rsync package](https://packages.debian.org/unstable/rsync)
- [rsync project Launchpad PPA](https://launchpad.net/~rsyncproject/+archive/ubuntu/rsync)

## Alternatives

1. **Wait for both stable distributions to backport the complete audit set.** This gives the simplest long-term lifecycle but leaves a critical recovery boundary knowingly below the accepted baseline for an unbounded period.
2. **Compile upstream source once and install the same artifact everywhere.** This reduces version variance but creates a private compiler, dependency, patch, signing, and upgrade lifecycle for privileged binaries.
3. **Install only one current package and retain the old peer.** This leaves one side of the protocol and restricted-command boundary exposed and cannot satisfy ADR-0072.
4. **Use exact vendor-signed packages appropriate to each endpoint, prove them together in disposable OS-matched containers, and leave production gated.** This uses established package authorities while proving negotiated protocol, package integrity, executable ownership, wrapper confinement, transfer correctness, isolation, and teardown before any maintenance proposal.

## Decision

Use option 4.

`infrastructure/testing/recovery-transport/plan.yaml` is the only executable canary plan. It binds two digest-pinned base images, exact OS identity and architecture, repository authority and suite, package URL, exact version, checksum, dependency set, and signing boundary. The Debian candidate repository is pinned below the stable base for every package except the exact rsync and `libacl1` versions. The Launchpad repository is similarly pinned below Ubuntu Noble except for the exact rsync version and has an empty extra-dependency set. This prevents the disposable proof from silently becoming a distribution upgrade.

The build verifies signed APT metadata, the complete PPA key fingerprint, downloaded package checksum, package name/version/architecture, installed version, canonical root-owned mode-`0755` executables, rsync 3.5.0, protocol 32, the upstream `--confine-root` and pinned-descriptor wrapper integration, and a restricted-command negative case. Verification precedes package installation or execution.

Security CI builds both exact endpoint images, connects them only to a new Docker `--internal` network, sends two synthetic files through an rsync daemon, checks content and strict file/byte bounds, records executable and wrapper digests, and removes the exact containers, network, and disposable image tags. It publishes only a minimized JSON report. The runner accepts no alternative plan, public port, host network, SSH route, production origin, package binary, credential, or recovery material.

This is compatibility and provenance evidence, not deployment approval. Production remains unchanged until operations independently assesses the Debian `libacl1` upgrade against host consumers, escrows and verifies exact rollback packages for rsync and `libacl1`, approves a maintenance window, installs both endpoints, proves the real forced-command path, runs manual and timer archives, and completes an isolated recovery.

## Security and reliability effects

- Package authority, content, metadata, installed binaries, runtime protocol, and restricted-wrapper behavior become one reconstructable evidence chain.
- A repository, key, package, architecture, version, checksum, wrapper, transfer, isolation, or teardown mismatch fails the canary.
- Different host and guest package revisions remain acceptable only because both implement rsync 3.5.0/protocol 32 and pass the shared behavioral proof.
- No passing container result proves the production host, guest, SSH forced command, Borg stage, timer, archive, or restore.
- The exact package versions require monthly M16 advisory review and replacement through an updated plan and superseding ADR when their support or security posture changes.

## Migration and rollback

The candidate introduces no production migration. Before rollout, operations must obtain and checksum exact rollback packages for host `3.4.1+ds1-5+deb13u3` and guest `3.2.7-1ubuntu1.5`, then record the host stable candidate as a separate package-hygiene choice. Stop only the off-site archive timer during the approved dual-endpoint change; local PostgreSQL WAL and base generation continue.

If the real forced-command, manual archive, timer archive, or isolated restore fails, stop the off-site timer, preserve every local WAL/base, stage, archive, and sanitized report, and forward-fix the candidate. Restoring the old packages is allowed only as a temporary explicitly noncompliant state; ADR-0072's version/confinement gate must never be bypassed to make a timer appear healthy.
