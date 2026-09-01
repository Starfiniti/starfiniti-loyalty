# ADR-0096: Supersede the rsync package escrow with native source-built artifacts

- Status: Accepted
- Date: 2026-08-29
- Extends: ADR-0093 and ADR-0094
- Supersedes for future activation: the `rsync-transport` provider in V2

## Context

ADR-0094 preserved the accepted thirty-entry BorgBackup/OpenSSH bundle and added
the then-selected cross-suite rsync packages. ADR-0095 later showed that the
Debian host candidate would require replacing the Proxmox host's global
`libacl1`. The accepted V2 policy and evidence remain valid historical proof,
but its rsync package bytes are no longer the selected production shape.

The digest-locked ADR-0095 candidate instead builds the same signed rsync 3.5.0
source separately on Debian 13 and Ubuntu 24.04. It produces two distinct native
executables and one byte-identical restricted wrapper under a versioned `/opt`
root while preserving both distribution packages, executables, and native ACL
libraries. A new escrow version must carry those exact bytes without silently
turning the obsolete package set back into an eligible candidate.

## Alternatives

1. **Rewrite V2.** Rejected because accepted V2 policy and evidence hashes would
   stop reconstructing the decision that existed when they passed.
2. **Inherit every V2 entry and add native binaries.** Rejected because the
   current bundle would contain two apparently active rsync candidates and make
   accidental cross-suite activation easier.
3. **Extend V2 as immutable history, inherit only the V1 BorgBackup/OpenSSH
   providers, and replace the V2 rsync provider with one closed native-source
   provider.** Selected.

## Decision

Create `starfiniti.recovery-artifact-escrow-plan.v3`. It hash-binds the exact V2
policy and evidence, validates V2 against immutable V1, and marks
`rsync-transport` historical-only. The V3 effective catalogue is the thirty V1
BorgBackup/OpenSSH entries plus forty-four `rsync-native-source` entries.

The native provider requires:

- separate Debian 13 and Ubuntu 24.04 rsync executables and the shared `rrsync`
  wrapper at their digest-locked hashes;
- the official rsync 3.5.0 source archive, detached signature, release-key bytes,
  and full signing fingerprint;
- the exact unchanged Debian and Ubuntu distribution rsync rollback packages;
- separate private runtime-dependency inventories bound to each native
  executable hash;
- the retained digest-lock canary report and current candidate evidence;
- the source verifier, endpoint-native build, runner, validator, fixtures,
  decisions, runbooks, and runtime controls used by the forced-command,
  controller, services, timers, sudoers boundary, validation, and rollback.

V3 does not inherit the thirty-four V2 rsync entries as effective bundle
members. It includes the V1/V2 policies, evidence, and decisions as repository
inputs so historical proof remains reconstructable. The validator rejects any
V3 policy that permits historical candidate activation or a global library
upgrade.

The shared verifier remains no-network, no-copy, no-execution, and
production-route-free. V3 manifests and minimized reports add explicit false
claims for source-signature review, native-build review, and selector
compatibility. Inventory verification alone cannot satisfy package authority,
dependency, custody, second-review, restore, rollout, or operations-escrow
gates.

## Security and reliability effects

Only one rsync candidate is active in the V3 closed set. Exact native executable
hashes cannot be detached from signed source, endpoint build instructions,
rollback packages, compatibility evidence, or the real runtime controls.
Keeping one shared wrapper avoids treating two identical copies as independent
authorities while the candidate evidence still proves both endpoint hashes.

V3 does not prove that the staged bytes exist in approved offline custody, that
the signature and build were independently reviewed, that runtime dependencies
match the real endpoints, or that selector, forced-command, manual/timer archive,
and isolated restore paths work. Those remain fail-closed operational gates.

## Migration and rollback

Existing V1 and V2 bundles remain verifiable with their exact historical policy,
manifest, report, and commit. New handoffs use V3. Do not delete or relabel V2,
and do not use its historical rsync package set for production activation.

This decision changes repository policy and validation only. It does not access
or modify VM 971, SSH, packages, libraries, selectors, timers, archives,
checkout, or loyalty value. If V3 is unusable, retain all versions and
forward-fix with V4; never weaken the rsync 3.5 or recovery gates.

## Verification

```sh
npm run recovery-artifact-escrow:validate
npm run recovery-artifact-escrow:inventory -- --bundle /absolute/private/v3
npm run recovery-artifact-escrow:verify -- \
  --bundle /absolute/private/v3 \
  --out /absolute/new/minimized-v3-report.json
```

The private directory and manifest stay outside Git and CI. A separate operator
must independently verify signatures, builds, dependencies, rollback packages,
custody, and recovery usability before any production selector change.
