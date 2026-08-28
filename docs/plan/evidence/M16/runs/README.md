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

The first committed installed-state artifact is
`recovery-dependency-snapshot-c5678b6-2026-08-28T221524Z.json` (8,813 bytes,
SHA-256
`9960e01bea1a66856a2e0ed36493b28e183f5e316ce027fef3534ba5043448f7`).
It can be reverified against the immutable implementation commit with
`npm run continuous-improvement:installed:verify -- --in <absolute-path>`.

Never store provider bodies, credentials, raw ETags, hostnames, IP addresses,
usernames, SSH routes or keys, raw command output, personal data, tenant/customer
identifiers, mutable drafts, or unapproved operational telemetry here.
