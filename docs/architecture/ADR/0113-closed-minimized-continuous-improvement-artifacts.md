# ADR-0113: Closed minimized continuous-improvement artifacts

- Status: Accepted
- Date: 2026-08-31
- Decision owners: Starfiniti product, engineering, security, and operations
- Scope: M16 monthly, quarterly, reconciliation, and approval closeout artifacts
- Supersedes: the permissive object-member behavior of the V1 artifact validation introduced by ADR-0068; its cadence, scoring, approval, and append-only history remain unchanged

## Context

ADR-0068 correctly keeps raw telemetry, customer data, provider payloads, private topology, and credentials outside Git. Its first closeout validator checked required semantics and a short denylist, but it did not reject every unknown object member. A future artifact could therefore carry an extra identity field or private note without changing the expected business evidence. Camel-case variants, credentials embedded in prose, bidirectional control text, duplicate evidence rows, and unbounded collections also needed deterministic rejection.

The repository artifact is a minimized, independently reconstructable receipt. Full operational inputs can be necessary for an approved review, but they belong in the approved private evidence system. A digest and bounded non-identifying disposition are sufficient for the source-controlled closeout contract.

## Options considered

### Keep permissive artifacts and rely on reviewer discipline

This preserves easy schema extension but makes privacy and evidence shape depend on subjective review. Unknown members can silently become an unreviewed data channel.

### Commit complete inputs and encrypt selected fields

This would retain more context, but key custody, access revocation, secret scanning, privacy deletion, and long-term Git history become materially harder. Encrypted payloads are also not independently reviewable by the normal repository gate.

### Use closed minimized V1 schemas and external private inputs

Every object level has an exact key set. Text, arrays, roles, identifiers, metrics, and duplicates have deterministic bounds. Machine-detectable identity, credential, control-character, and bidirectional-text forms are rejected. Complete private inputs stay outside Git and the artifact retains only exact digests and minimized results.

## Decision

1. Treat all five `starfiniti.*.v1` M16 closeout schemas as closed V1 schemas. Unknown members at the monthly review, section, provider, installed component, rescore, failure, control, experiment, guardrail, quarterly exercise, reconciliation, score, approval, or approval-entry level fail validation.
2. Read each bounded regular artifact through a no-follow descriptor, require the repository path to retain the same device and inode through the read, accept strict UTF-8 only, and compare the declared SHA-256 with the exact raw bytes before parsing JSON.
3. Require bounded arrays, finite metrics, stable minimized identifiers, role slugs instead of human names, unique material-module, rescore, failure, control, experiment, exercise, score, and approval identities, and bounded control-free text.
4. Reject normalized identity and authority keys, machine-detectable email addresses, credential-shaped values, credentials embedded in URLs, C0/C1 controls, zero-width characters, and bidirectional overrides anywhere in a closeout artifact.
5. Keep raw telemetry, logs, incident-system records, provider responses, private infrastructure facts, tenant/customer/member/order/coupon identifiers, contact details, credentials, and human reviewer names in the approved environment-owned evidence system. Bind their reviewed result through SHA-256 and a role slug.
6. Document that automated pattern checks are defense in depth, not a claim that arbitrary prose can be proven free of every personal name. Exact schemas, minimized authoring, secret scanning, and independent human review all remain mandatory.
7. Do not infer production, tenant, value, merge, release, deployment, exercise, canary, billing, or GA authority from an artifact that passes this structural gate. The 32 elapsed or external M16 checks remain pending and the score remains 77/100.

## Consequences

- An accidental extra field now fails before closeout instead of becoming historical repository data.
- Valid recovery comparison fields such as `tenantBoundary` remain allowed because the exact schema, not a broad substring match, defines their meaning.
- Artifact producers must deliberately version a contract when they need new evidence rather than appending an undocumented V1 property.
- The repository retains less diagnostic detail; an approved reviewer follows the bound digest to the separately controlled private source when deeper reconstruction is required.

## Rollback implications

Do not loosen or rewrite accepted V1 artifacts. If the closed shape is insufficient, preserve historical V1 bytes, add a V2 schema and validator, record a superseding ADR, and update future artifact bindings additively. Removing this validator does not roll back production because it has no runtime or production authority; it only weakens a closeout gate and therefore cannot be used to approve M16.
