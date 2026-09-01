# ADR-0111: Evidence-bound recurring-failure register

- Status: Accepted
- Date: 2026-08-31
- Decision owners: Starfiniti product and engineering
- Scope: M16 incident recurrence, durable-control provenance, and production-activation claims
- Supersedes: the free-form recurring-failure reference shape in ADR-0068; its cadence, threshold, and completion gates remain unchanged

## Context

ADR-0068 correctly requires a durable control at the second occurrence of one stable failure fingerprint. Its initial monthly-artifact validator, however, accepted an integer occurrence count and a free-form control reference. That shape could not prove that two distinct incidents existed, that the referenced file still had the reviewed bytes, or that a candidate control had actually merged and become active.

The PostgreSQL off-site backup path exposed this weakness twice. On 2026-08-28 the whole-VM Borg controller held the shared repository long enough to create a 1 hour 50 minute 39 second completed-archive gap. On 2026-08-31 a separate raw migration held the same lock and created a 1 hour 34 minute 36 second gap. ADR-0071, a repository controller, validator, alert rules, and OPS-007 exist on the integration candidate, but production still has a repository-unbound shared-lock implementation and no active protected-value paging. Calling those controls merged or active would be false.

## Options considered

### Keep free-form references in future monthly reviews

This is simple but permits invented occurrence counts, path drift, stale control bytes, and prose-only merge or activation claims.

### Put each incident directly into the task graph

The task graph is useful for delivery status, but mutable task prose is not an append-oriented incident inventory and does not bind distinct occurrences or control bytes.

### Keep the inventory only in the incident system

An environment-owned incident system can hold sensitive operational detail, but repository verification could not reconstruct whether source-controlled regression controls still match the reviewed incident outcome.

### Add a minimized, evidence-bound repository register

The register retains only a stable fingerprint, risk/severity, UTC instants, repository evidence anchors and digests, exact decision/implementation/control digests, delivery state, and remaining gates. A validator rejects path escape, missing or duplicated occurrences, reused anchors, digest drift, missing controls, unsupported control types, and candidate merge or activation overclaims.

## Decision

1. Add `starfiniti.recurring-failure-registry.v1` at `docs/plan/evidence/M16/recurring-failures.yaml` and validate it in the root continuous-improvement gate.
2. Derive recurrence from distinct chronological occurrence records. Every occurrence binds one exact repository-relative regular file, SHA-256, unique section anchor, UTC observation instant, and an explicit no-production-mutation fact.
3. At the second occurrence require at least one allowed control: regression test, validator, monitor, runbook, or agent rule. Bind each control to exact source bytes and reject duplicate references.
4. Separate `candidate`, `merged`, and `active` delivery states. Candidate controls must have null merge, production, and observation evidence. Merged controls require distinct digest-bound merge evidence. Active controls additionally require distinct production and observation evidence.
5. Keep the current PostgreSQL shared-lock recurrence in `control_candidate`. Production defect presence, dedicated-repository activation, and paging activation remain explicit; the register cannot close the M16 monthly gate.
6. Keep incident-system identities, endpoints, credentials, routes, customer data, raw logs, repository IDs, and private custody details outside Git. The repository evidence is minimized and contains no new operational authority.

## Consequences

- A repeated protected-path failure becomes independently reconstructable before the next monthly close.
- Editing an incident evidence file, decision, implementation, alert, runbook, or validator requires an explicit digest update and review.
- Candidate controls cannot be presented as merged or production-active, and repository progress cannot raise the honest M16 operability score.
- The register adds maintenance work, but the self-test turns missing recurrence evidence and false delivery claims into deterministic failures.

## Rollback implications

The register and validator do not change production runtime behavior. If the schema proves unsuitable, preserve this register and ADR, introduce a superseding version and ADR, and update future monthly artifacts additively. Never delete or rewrite occurrence evidence to make a recurring failure disappear. Production rollback remains governed by ADR-0071 and OPS-007 while accepted commerce events, ledger value, checkout, refunds, reconciliation, and recovery evidence remain protected.
