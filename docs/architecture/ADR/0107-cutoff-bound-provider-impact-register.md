# ADR-0107: Cutoff-bound provider impact register

- Status: Accepted
- Date: 2026-08-30
- Decision owner: Starfiniti engineering; independent security review remains pending
- Scope: M16 official-source impact classification across all thirteen provider, platform, and recovery entries

## Context

ADR-0068 requires every monthly review to cover Supabase, PostgreSQL,
WooCommerce, Stripe, Authentik, Klaviyo, Node.js, rsync, BorgBackup, OpenSSH,
Debian, Ubuntu, and Proxmox through one cutoff. ADR-0084 captured the exact
official-source byte digests without retaining provider content, and ADR-0085
captured the two recovery endpoints and six installed recovery-provider
projections without retaining routes or command output. Both artifacts
intentionally say that impact classification is incomplete.

Subsequent work classified several entries independently: Supabase client and
self-hosted compatibility, Node.js, WooCommerce, Proxmox, rsync, BorgBackup,
and OpenSSH. Stripe and Klaviyo are pinned in code, while PostgreSQL remains
part of the exact Supabase platform image and Authentik's public broker does not
expose a trustworthy installed version. A reviewer could reconstruct these
facts from many ADRs, source files, and evidence records, but no single closed
record proved that every catalogue entry received a disposition through the
same source cutoff.

Classification is not acceptance. A source can be classified as Critical,
unknown, current, or deferred without approving its candidate, deployment, or
production mutation. Unknown remains blocking: notably, Authentik's exact
deployed version still requires minimized operator evidence, and PostgreSQL
must not be upgraded independently of the reviewed Supabase platform bundle.

Official current facts checked for this decision include PostgreSQL 17.11 as
the current supported major-17 minor, Stripe `2026-08-26.dahlia`, Authentik's
2026.8 line, and Klaviyo `2026-07-15` GA. The authoritative review boundary is
still the immutable source snapshot completed at `2026-08-28T21:20:42Z`;
later official research confirms interpretation but does not silently move that
cutoff.

## Options considered

### Wait for the first elapsed monthly review

This avoids another artifact, but leaves a known reconstructability gap until
the month closes. It also makes it easy to mistake already reviewed candidates
for the unreviewed providers or to lose an explicit unknown state.

### Keep independent provider narratives only

Existing ADRs remain useful and detailed, but their scopes and schemas differ.
There is no deterministic proof of exact thirteen-entry coverage, one cutoff,
severity inventory, ownership, or a deliberately incomplete monthly gate.

### Add a generic mutable spreadsheet or ticket list

This is easy to update, but it is not bound to source and installed snapshot
bytes, cannot be gated by the repository, and could silently turn a candidate
into accepted production authority.

### Add one versioned, fail-closed impact register

This is selected. The register composes immutable inputs and existing detailed
reviews, fixes all thirteen classifications, assigns the engineering owner
role, records dispositions and rollback boundaries, and keeps every merge,
release, provider-upgrade, deployment, production, reconciliation,
independent-review, and owner-approval assertion false.

## Decision

1. Add `starfiniti.provider-impact-review.v1` under
   `infrastructure/governance/provider-impact-review.yaml`. Bind the exact
   6,534-byte source snapshot and 8,813-byte installed-state snapshot by path
   and SHA-256. Preserve their historical false review, impact, approval, and
   production assertions.
2. Require the thirteen entries in canonical catalogue order. Every entry
   records the release or dated source boundary, observed state, candidate
   state, impact classification, severity, security relevance, affected
   modules, risk links, owner role, disposition, rationale, rollback, evidence,
   and remaining gates.
3. Lock the complete provider decision set through a canonical SHA-256 in the
   validator. A future semantic change requires a new register version and a
   superseding ADR rather than a one-sided text edit.
4. Cross-check repository facts rather than trusting the register narrative:
   the exact Supabase tag and PostgreSQL image, Supabase client/toolchain
   versions, WooCommerce matrix, Stripe and Klaviyo API pins, Node LTS review,
   installed endpoint facts, all three recovery candidates, and the Proxmox
   advisory/candidate boundary.
5. Require every referenced evidence and risk to exist, bind the command into
   the root check and M16 task, and reject false authority or false monthly
   completion through corruption tests.
6. Record the current severity inventory as two Critical, five High, three
   Medium, and three Low entries. Critical and High entries retain their
   existing risk, recovery, approval, and rollout gates; the register does not
   accept those risks or start their due-date clocks again.
7. Do not create duplicate backlog rows for the same production gates. The
   provider findings remain routed through existing IMP-001 through IMP-003,
   IMP-006 through IMP-012, their linked risks, and the provider-specific
   evidence records; the future elapsed monthly review must recompute their
   freshness and ranking.
8. Keep `sourceReviewCoverage` and `impactClassification` complete only within
   this engineering register. Candidate selection remains partial, deployment
   readiness remains incomplete, and the monthly review remains incomplete.
   Two elapsed consecutive monthly records, schedules, independent review,
   approvals, exercises, and reconciliations are still mandatory for M16.

## Provider decisions

| Provider    | Classification                                     | Disposition                                                                                                                                    |
| ----------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase    | Compatible pinned baseline                         | Retain exact `self-hosted/v0.8.0`; rehearse the next platform tag.                                                                             |
| PostgreSQL  | Supported major with upstream minor lag            | Do not decouple the database image from an official compatible Supabase bundle.                                                                |
| WooCommerce | Current security compatibility matrix              | Retain exact 11.0.1 matrix evidence and rehearse a real pilot store.                                                                           |
| Stripe      | Managed Billing API review required                | Retain Clover until a complete Dahlia contract, replay, and test-clock canary passes.                                                          |
| Authentik   | Installed version unknown                          | Capture minimized version/configuration evidence, then test the current patch line across OIDC, SAML, SCIM, deprovisioning, and recovery.      |
| Klaviyo     | Exact current revision, not production enabled     | Retain `2026-07-15`; run consent, suppression, outage, and reconciliation canaries with approved credentials.                                  |
| Node.js     | Current maintenance LTS                            | Retain the exact 24.20.0 image index and use the normal release gate.                                                                          |
| rsync       | Critical recovery transport upgrade required       | Use only the signed-source side-by-side 3.5.0 candidate after escrow, real forced-command, monitoring, archive, and restore proof.             |
| BorgBackup  | High recovery client upgrade required              | Use only signed side-by-side 1.4.5 after real repository and restore proof.                                                                    |
| OpenSSH     | High privileged recovery client upgrade required   | Replace only the recovery client after every consumer and restore path is proven; preserve both daemons.                                       |
| Debian      | High host security and recovery candidates pending | Preserve native rollback packages and rehearse the exact host set before maintenance.                                                          |
| Ubuntu      | High guest recovery transport candidate pending    | Preserve the server and local WAL/base chain; activate only the rsync selector after recovery proof.                                           |
| Proxmox     | Critical host security upgrade required            | Execute the exact candidate only after repository policy, physical rehearsal, recovery, separate install/reboot approvals, and reconciliation. |

## Compatibility and rollback consequences

The register changes no runtime contract, schema, image, provider API date,
package, selector, timer, service, repository, database, checkout path, or
loyalty value. It deliberately leaves Stripe on Clover, Klaviyo on its current
GA revision, Supabase on the exact reviewed self-hosted tag, and every recovery
or Proxmox candidate disabled.

Provider-specific rollback is not one generic package revert. Supabase and
PostgreSQL preserve an exact platform/image and data/WAL boundary;
WooCommerce preserves old disposable matrix identities; billing preserves
versioned fixtures and object references; identity preserves database,
configuration, signing, and break-glass access; recovery tools preserve native
packages, daemons, selectors, repositories, archives, keys, and local WAL/base
data; Proxmox preserves the prior kernel and exact packages/configuration in
independent escrow.

## Verification

`npm run continuous-improvement:provider-impact:validate` checks the closed
shape, canonical provider decision digest, exact snapshot bytes and false
historical assertions, source catalogue, installed endpoints, repository pins,
candidate facts, evidence paths, risk links, task/ADR integration, entirely
false authority, and adversarial corruptions. It performs no network request,
SSH access, provider call, installation, deployment, or production mutation.

This repository gate can prove that one engineering classification is complete
and reconstructable. It cannot prove semantic correctness of an external
release body after the cutoff, an installed Authentik version, candidate
compatibility, elapsed cadence, owner acceptance, production behavior, or
reconciliation.

## Migration and rollback

No production migration exists. Merge the register, validator, ADR, and living
plan bindings as one repository change. If an entry is wrong, fail the gate,
append the correction through `starfiniti.provider-impact-review.v2`, and
supersede this ADR; do not rewrite an accepted V1 decision or either immutable
input snapshot. Removing the register returns M16 provider impact to unknown and
cannot be used to mark a monthly review, provider upgrade, or production gate
complete.
