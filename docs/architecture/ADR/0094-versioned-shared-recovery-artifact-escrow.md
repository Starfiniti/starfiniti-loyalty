# ADR-0094: Extend recovery artifact escrow through a versioned shared bundle

- Status: Accepted
- Date: 2026-08-29
- Extends: ADR-0073 and ADR-0093

## Context

ADR-0093 defines a closed, no-network verifier for a thirty-entry BorgBackup and OpenSSH private recovery bundle. Exact implementation head `504555c3750a25e89ce8308c5e7cf72797104300` and its evidence are accepted historical proof. The verifier does not yet cover the exact rsync 3.5 candidate, its required `libacl1` dependency, the three pre-change rollback packages, or the repository controls needed to reconstruct the restricted sender and receiver boundary.

ADR-0072 requires rsync 3.5.0 or newer at both recovery endpoints and the repaired `rrsync --confine-root` integration. ADR-0073 binds exact Debian and rsync-project Launchpad packages and proves them in disposable OS-matched containers, but explicitly leaves offline custody, independent digest review, host-consumer compatibility, the real forced-command path, rollout, and isolated restore pending. The current upstream rsync security and release documentation, Debian package authority, and rsync-project Launchpad source remain the applicable primary references. Their public availability is not recovery custody.

The handoff contract must preserve the accepted V1 proof, avoid two divergent private custody formats, and prevent an operator from verifying only package bytes while using mismatched forced-command, systemd, validation, or rollback controls.

## Alternatives

1. **Modify V1 in place.** This would make the accepted thirty-entry policy digest and exact-head evidence no longer reconstructable. Historical proof would silently acquire requirements that did not exist when it passed.
2. **Create a separate rsync-only verifier and bundle.** This preserves V1, but duplicates a security-sensitive parser and filesystem verifier and creates two manifests, two reports, two custody reviews, and an easy path to partial recovery readiness.
3. **Create an additive shared V2 policy while retaining V1 byte-for-byte.** V2 reuses the same bounded verifier and manifest/report workflow, carries forward the exact thirty V1 entries, and adds a closed rsync provider catalogue. The verifier checks the immutable V1 policy and evidence digests before accepting V2.

## Decision

Use option 3.

`recovery-artifact-escrow-v1.yaml` and its accepted evidence remain unchanged historical inputs. `recovery-artifact-escrow-v2.yaml` becomes the current inventory/verification contract. V2 contains the complete V1 catalogue plus one `rsync-transport` provider with:

- the exact Debian host rsync candidate and `libacl1` dependency;
- the exact Ubuntu guest rsync candidate;
- the exact host rsync, host `libacl1`, and guest rsync rollback packages;
- the exact minimized rollback-aware compatibility canary report;
- the canonical canary plan, build, validator, runner, and README;
- the guest forced exporter, host controller, compatible rollback scripts, systemd services and timers, and sudoers rule;
- the backup-asset validator, operations runbook, governing ADRs, and exact canary evidence.
- the V1/V2 escrow decisions and evidence plus the exact shared verifier source.

Fixed package bytes are digest-bound to the canonical rsync plan. Repository entries must equal the clean exact Git commit used to create the private manifest. The verifier rejects missing, extra, linked, mutable, over-bound, case-colliding, path-escaping, digest-different, plan-different, repository-different, or mid-run head-different inputs. V2 manifest and report schemas are distinct from V1. The minimized report contains only aggregate provider facts and explicit false authority/completion fields.

The V2 policy authorizes no download, package copy, artifact execution, production access, production mutation, or production rollout. Inventory verification does not establish distribution-signature review, dependency approval, `libacl1` consumer compatibility, offline redundant custody, independent review, the real forced-command path, or isolated recovery. Those remain external operations gates.

## Security and reliability effects

- Accepted V1 evidence remains independently reconstructable and cannot be silently rewritten by V2 work.
- One current verifier and custody format cover all privileged recovery binaries and the controls that invoke them.
- Exact package hashes cannot be separated from the plan, runtime scripts, unit definitions, rollback controls, and evidence that make them meaningful.
- A passing repository self-test remains preparation evidence only; it cannot assert private custody or production authority.
- The larger catalogue increases review surface, but keeps one bounded parser and one closed manifest/report contract instead of duplicating security-critical verification logic.

## Migration and rollback

Existing V1 private bundles, if later produced, remain verifiable only against their exact V1 policy and accepted commit. New operations handoffs use V2. No production host, VM, package, timer, repository, credential, or archive changes during this migration.

If V2 verification proves unusable, stop creating V2 manifests, retain every V1/V2 policy, manifest, report, and candidate byte, and forward-fix with a V3 policy. Do not edit V1, weaken the rsync 3.5 gate, omit rollback packages, or present a V1-only bundle as complete recovery custody after V2 adoption.
