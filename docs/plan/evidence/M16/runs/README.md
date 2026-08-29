# M16 Run Artifacts

This directory contains approved, minimized continuous-improvement run artifacts.

Provider-source snapshots use `starfiniti.provider-source-snapshot.v1`. They contain public source URLs, timestamps, bounded byte counts, SHA-256 digests, normalized `Last-Modified` values, and hashed ETags only. They must keep content retention, review completion, impact classification, and installed-evidence completion false.

Recovery-dependency snapshots use
`starfiniti.recovery-dependency-snapshot.v1`. They contain only the two opaque
endpoint IDs, public OS/package/platform versions, exact executable hashes,
derived installed provenance, the official-source snapshot binding, and the
reviewed rsync candidate-plan binding. They must keep candidate completeness,
review, impact classification, approval, and production mutation false. A complete
installed capture is not remote attestation or compatibility approval.

Proxmox package-provenance canaries use
`starfiniti.proxmox-security-package-canary.v1`. They bind fresh independently
verified repository signatures and signed package indexes to the exact candidate
URLs, package fields, sizes, SHA-256 values, and two equal acquisitions while
retaining no package bytes. They are package provenance only: dependency
simulation, installed-state compatibility, rollback escrow, recovery,
repository policy, maintenance, reboot, production mutation, and post-change
reconciliation remain separate gates.

The first committed installed-state artifact is
`recovery-dependency-snapshot-c5678b6-2026-08-28T221524Z.json` (8,813 bytes,
SHA-256
`9960e01bea1a66856a2e0ed36493b28e183f5e316ce027fef3534ba5043448f7`).
It can be reverified against the immutable implementation commit with
`npm run continuous-improvement:installed:verify -- --in <absolute-path>`.

The first passing package-provenance artifact is
`proxmox-security-package-canary-957e1de-2026-08-29T003101Z.json` (9,606 bytes,
file SHA-256
`3eec19512a6b2535cf0c6359144c1807b78e01015f43c470ad53335c6eb1090e`,
internal report SHA-256
`0b703cc553f2304de75f28160e7482b09718794205efa7615fb39f2eab0f0382`).
It can be independently reverified with
`node scripts/validate-proxmox-security-package-canary.mjs --verify-report <absolute-path>`.

Never store provider bodies, credentials, raw ETags, hostnames, IP addresses,
usernames, SSH routes or keys, raw command output, personal data, tenant/customer
identifiers, mutable drafts, or unapproved operational telemetry here.
