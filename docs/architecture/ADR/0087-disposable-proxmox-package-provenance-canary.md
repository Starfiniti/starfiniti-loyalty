# ADR-0087: Disposable Proxmox package-provenance canary

- Status: Accepted
- Date: 2026-08-29
- Decision owners: Starfiniti engineering, security, and operations
- Scope: M15 host hardening and M16 dependency review

## Context

ADR-0086 binds an exact twelve-package Proxmox security-repair candidate but
deliberately leaves package-byte and independent repository-signature evidence
false. Trusting only the production host's cached APT result would make the same
endpoint both evidence producer and subject. Downloading only the named URLs and
checking their hashes would prove bytes but not the signed repository chain.
Running a fresh APT update alone would prove current repository authentication
but not that APT, the exact candidate URL, and the candidate plan identify the
same bytes.

Repository metadata is also expected to rotate. Four of the five `InRelease`
documents changed after the V1 host observation while the candidate remained
independently addressable. Requiring a mutable repository-level digest to remain
equal forever would make historical evidence unreproducible; ignoring the
rotation would conceal a material preflight fact.

Debian documents Secure APT's chain as a signature over Release metadata whose
checksums bind package indexes, whose records bind package files. Proxmox
documents the Trixie archive keyring checksum and release fingerprint and uses a
signed `InRelease` for the no-subscription repository. Proxmox also states that
the no-subscription repository is not its recommended production repository;
this canary does not resolve that owner decision.

## Options considered

### Reuse only the production host's APT observation

This is simple but not independent and requires production access. A
misconfigured or compromised endpoint could reproduce its own assertion.

### Verify only exact package URLs, sizes, and SHA-256 values

This proves the candidate bytes but not that a trusted repository published
them. HTTPS alone is not the Debian package-authentication model, and Proxmox's
documented no-subscription source uses signed metadata over HTTP.

### Verify only fresh signed repository metadata

This authenticates current indexes but does not prove that APT's selected file,
the plan's filename, and a separately fetched exact URL are identical.

### Prove the complete chain in a disposable digest-pinned container

This is selected. It combines independent signature verification, signed index
binding, APT selection, exact URL acquisition, package metadata, byte equality,
and deletion without installing a candidate package or contacting production.

## Decision

1. Bind the canary to the complete SHA-256 and canonical provenance of the
   immutable ADR-0086 V1 candidate and to a digest-pinned Debian 13 image.
2. Use only the five candidate repositories. Debian trust comes from the
   digest-pinned image's archive keyring. Fetch the official Proxmox Trixie
   archive keyring over HTTPS and require SHA-256
   `136673be77aba35dcce385b28737689ad64fd785a797e57897589aed08db6e45`
   plus release fingerprint
   `24B30F06ECC1836A4E5EFECBA7BCD1420BFE778E`.
3. Require APT to refresh all five repositories successfully. Independently run
   `gpgv` over each `InRelease`, extract the signed Release payload, and require
   the local uncompressed `Packages` bytes and size to equal the payload's
   SHA-256 entry.
4. For each of the twelve packages, require APT's exact-version URI, filename,
   size, and SHA-256 to equal the V1 plan. Download once through APT and once
   through that exact official URL, then require identical bytes, exact package
   fields, size, and SHA-256.
5. Do not install any candidate package. Process one pair at a time, remove all
   `.deb` bytes, emit only bounded metadata, and tear down the container.
6. Run the networked proof only on a GitHub-hosted disposable runner with no
   production credential, route input, SSH input, Docker socket mount, host
   networking, or published port. Repository-only validation remains
   network-free and local.
7. Report current and V1 repository metadata digests separately. A rotated
   signed index is not silently relabelled as the V1 observation and does not by
   itself invalidate a package whose full fresh signed chain still passes.
   Missing or changed package identity, bytes, or signed binding fails the
   canary. A changed production dependency solution or starting state still
   requires a new versioned candidate.
8. Treat a passing artifact only as package-byte and repository-signature
   evidence. It does not prove dependency simulation, installed starting state,
   compatibility, rollback escrow, recovery, repository policy, maintenance,
   reboot, execution, running-kernel state, post-change smoke, or reconciliation.

## Security and privacy effects

The plan accepts no hostname, address, credential, repository, package, command,
or output path from production. The controller accepts only the repository plan
and a bounded artifact path. The container receives only same-byte copies of the
two verifier files and generated manifest through a read-only mount plus one
exclusive output directory; it never mounts the source tree, Git metadata, or a
credential. It uses no host network or published port. Package selectors are
validator-derived rather than shell text supplied by an operator.

The minimized artifact contains public repository fingerprints and digests,
public package identities, exact public versions and hashes, the candidate and
commit binding, booleans, counts, and timestamps. It contains no package bytes,
APT logs, host identity, IP address, VM data, tenant data, customer data, or
credential.

## Operations and rollback

The canary mutates only its disposable container filesystem. Failure removes the
container and exclusive work directory; no production rollback exists because
production is unreachable and unchanged. A failed signature, signed-index,
package-selection, exact-URL, metadata, size, hash, byte-equality, cleanup, or
teardown check invalidates the artifact.

The production rollback plan remains ADR-0086 and
`docs/operations/PROXMOX_SECURITY_UPDATE.md`. This canary provides no package
escrow and deliberately deletes candidate bytes. Operators must still stage and
protect the exact approved forward and rollback inputs through the separately
approved maintenance process.

## Official sources

- Debian `apt-secure`: https://manpages.debian.org/trixie/apt/apt-secure.8.en.html
- Proxmox VE administration guide: https://pve.proxmox.com/pve-docs/pve-admin-guide.pdf
- Proxmox release key directory and published fingerprint:
  https://enterprise.proxmox.com/iso/
