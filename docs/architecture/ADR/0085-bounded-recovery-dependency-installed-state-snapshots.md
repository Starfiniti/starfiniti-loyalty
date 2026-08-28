# ADR-0085: Bounded recovery-dependency installed-state snapshots

- Status: Accepted
- Date: 2026-08-28
- Decision owners: Starfiniti engineering and security
- Scope: M16 installed recovery platform and transport evidence preparation

## Context

ADR-0068 requires monthly review of the installed rsync, BorgBackup, OpenSSH,
operating-system, and Proxmox state on every declared side of the privileged
backup boundary. ADR-0084 proves which official source bytes were observed, but
intentionally cannot prove what is installed. The current state can be read over
the approved operator route, yet copying terminal output into a review would
retain endpoint names, network coordinates, arbitrary command output, or a
mutable narrative and would not fail when one package, executable, or endpoint
was omitted.

The evidence needed before human review is narrow: opaque endpoint IDs, public
release and package versions, exact executable SHA-256 values, a bounded capture
instant, the official-source snapshot digest, and the already reviewed rsync
candidate plan. It must not carry credentials, routes, hostnames, addresses,
tenant or customer data, command output, or authority to install or approve a
dependency.

The Supabase database guest is part of this boundary. The official Supabase
changelog currently calls out the self-hosted Envoy default, `/auth/v1` external
URL, Studio ownership, and PostgreSQL 17 changes. Those compatibility decisions
remain governed by ADR-0081; an installed-state snapshot does not reclassify or
approve them.

## Options considered

### Paste read-only terminal output into the monthly review

This is quick but over-retains environment details, is difficult to validate,
and can silently omit the guest side of the transport boundary.

### Put SSH and production discovery into repository automation

This is reproducible but would give a repository command standing authority to
discover or contact production. Route selection, credentials, and operator
approval are environment-owned and must remain outside source control.

### Accept arbitrary monitoring or package-manager exports

This avoids SSH coupling but widens the input schema, permits identifying or
unbounded payloads, and makes comparison across months unreliable.

### Validate two minimized endpoint fact envelopes and derive one snapshot

This is selected. An operator obtains facts through the separately approved
read-only route and passes base64-encoded, exact-schema JSON in memory. The
repository tool validates the closed endpoint/component sets, timestamps,
versions, hashes, false authority assertions, current source artifact, candidate
plan, clean commit, and output boundary before writing a new immutable artifact.

## Decision

1. Add a separate versioned policy for exactly `proxmox-host` and
   `database-guest`. It requires Debian/Ubuntu identity, the closed package,
   executable, and platform sets, and no production mutation.
2. Accept endpoint facts only as bounded base64 JSON passed in memory. Additional
   fields, malformed UTF-8, unsafe strings, identifying network/host fields,
   missing components, zero hashes, stale/future timestamps, or a mutation claim
   fail before output.
3. Derive the six recovery-provider projections from the endpoint facts. Each
   installed provenance digest hashes only the exact normalized facts used for
   that provider and endpoint. The artifact retains the normalized facts because
   versions and executable digests are the evidence; it never retains raw command
   output.
4. Bind the artifact to a clean exact Git commit, the installed-state policy,
   the verified thirteen-source snapshot, and the exact rsync candidate plan.
   The rsync candidate reference is derived from the two digest-pinned package
   entries. BorgBackup, OpenSSH, Debian, Ubuntu, and Proxmox candidate review stay
   explicitly unresolved. Verification reads the policy, source snapshot,
   candidate plan, and byte-preservation rules from the artifact's exact candidate
   commit rather than mutable working-tree files. The V1 policy path is immutable;
   a later contract uses a new schema and file while retaining V1 verification.
   Rsync candidate provenance is the SHA-256 of the complete plan bytes, including
   authorities, URLs, signing boundaries, dependencies, rollback inputs, and
   confinement expectations; the displayed endpoint versions do not replace it.
5. Create an absent absolute JSON path through an exclusive no-follow descriptor,
   request mode `0600`, fsync, and preserve committed bytes with a path-scoped
   Git `-text` attribute. Never overwrite prior evidence.
6. State `installedCaptureComplete=true` only for the exact six-provider installed
   catalogue. Keep candidate evidence, review, impact classification, approval,
   and production mutation false. The artifact cannot pass `provider_review`,
   `dependency_pins`, a monthly review, an upgrade, or a rollout gate.
7. Keep self-tests network-free and reject plan/source/candidate drift, missing or
   duplicate endpoints/components, stale/future observations, bad digests,
   identifying fields, false authority, unsafe paths, output reuse, and loss of
   byte preservation.

## Security and integrity effects

The tool has no SSH client and no production route. It cannot select an endpoint,
read a credential, or execute a command. Exact schemas and short string bounds
prevent a fact envelope from becoming a general evidence exfiltration channel.
Opaque endpoint IDs and public software versions are retained; hostnames, IP
addresses, usernames, keys, routes, raw package-manager output, and application
data are not.

SHA-256 binds the supplied normalized observation but does not independently
attest the remote host. Operator route approval and independent review therefore
remain required. A successful snapshot proves complete installed-state capture
for the declared catalogue, not support status, security impact, upgrade safety,
or production compatibility.

## Operations and rollback

Validate the contract before capture. Obtain both fact envelopes through the
approved read-only route, keep them in memory, capture from a clean exact commit,
and independently verify the output. The runbook contains the command boundary.

If the contract proves too narrow or harmful, stop capture and return to manual
installed-state review. Preserve prior snapshots, supersede this ADR and policy,
and never rewrite historical evidence. Stopping the helper cannot make missing
installed state healthy or authorize an upgrade.
