# ADR-0119: Generalized recurring-failure registry

- Status: Accepted
- Date: 2026-09-01
- Decision owners: Starfiniti product and engineering
- Scope: M16 recurrence evidence across production and repository control-plane failures
- Supersedes: ADR-0111's recovery-specific V1 registry shape; its accepted V1 bytes remain immutable evidence

## Context

ADR-0111 correctly made the second occurrence of the PostgreSQL off-site backup failure reconstructable. Its V1 register, however, encoded recovery-specific production fields such as dedicated-repository and paging activation into every failure. The GitHub Actions policy incident then produced three distinct fail-closed occurrences: one workflow startup failure and two supply-chain setup failures. Forcing that repository control-plane incident into backup-specific fields would create false semantics, while silently leaving it out would violate M16's recurring-failure rule.

The incident also exposed an important boundary. A reviewed direct workflow inventory is not an exhaustive inventory of composite-action dependencies. GitHub's policy matcher rejected public sub-actions and the pinned Trivy setup source referenced cache restore and save actions that were not visible in the repository workflows. The corrected thirteen-pattern policy is live, but future composite-action revisions can introduce different dependencies and must trigger a new review rather than inherit an unsupported completeness claim.

## Options considered

### Extend V1 with optional recovery and repository fields

This would preserve one file but make its meaning conditional, allow sparse or contradictory states, and rewrite accepted V1 evidence.

### Record only the final successful Security run

This would erase the recurrence chronology and lose the exact evidence that caused the control improvement.

### Treat the external selected-actions setting as exhaustive dependency discovery

This would overclaim what the evidence proves. The setting allows only the currently reviewed direct and observed transitive patterns; it does not recursively discover all future composite dependencies.

### Introduce a superseding generalized V2 register

V2 preserves V1 by exact digest, retains common occurrence and control provenance, and replaces recovery-only state with a bounded current-state and authority envelope. Mandatory fingerprint-specific validators still enforce exact semantics for protected failures.

## Decision

1. Preserve `starfiniti.recurring-failure-registry.v1` unchanged and bind it by SHA-256 from a new `starfiniti.recurring-failure-registry.v2` file.
2. Keep the common failure identity, chronological occurrence, decision, implementation, durable-control, delivery-state, evidence-digest, and remaining-gate requirements.
3. Replace recovery-specific production fields with a closed current-state envelope: defect presence, external-control activation, observation completion, exact verification time and evidence, retained negative evidence, exhaustive-discovery claim, and false release/deployment/production/protected-value authority.
4. Rename control production evidence to activation evidence. Candidate controls have no delivery proofs; merged controls require merge evidence; active controls require separate merge and activation evidence; closure additionally requires distinct observation evidence.
5. Add `security.github-actions.transitive-policy-inventory` under R-065 with the startup failure and both setup failures as three distinct occurrences. Bind ADR-0118, the corrected release preflight, workflow validator, release-policy validator, and recurring-failure validator as candidate controls while PR #58 and the stacked change remain unmerged.
6. Require the exact thirteen-pattern selected-actions policy, full-SHA pinning, and false implicit GitHub-owned and verified-creator trust. Retain attempt three as successful correction evidence without relabelling attempts one and two or the startup failure.
7. Explicitly require `exhaustiveDiscoveryClaimed: false`. A changed pinned action SHA or newly rejected dependency must fail closed, be inspected from exact source, and update policy and evidence through a new reviewed decision.

## Consequences

- Production and repository control-plane recurrences can share one strict registry without pretending they have the same activation surface.
- The accepted V1 recovery record remains independently reconstructable and cannot be rewritten during migration.
- The R-065 recurrence now produces deterministic regression failures if any negative occurrence, exact policy invariant, successful correction proof, control byte, or authority boundary is erased.
- The corrected repository setting is accurately recorded as active while its source-controlled validators remain candidate-only until independently reviewed and merged.
- Composite-action dependency coverage remains intentionally conservative: current evidence is exact, future completeness is never assumed.

## Rollback implications

The registry and validator do not enable workflows, create releases, deploy software, or change loyalty value. Reverting V2 must retain both V1 and V2 evidence plus this ADR; a later schema must supersede them additively. Reverting the live thirteen-pattern selected-actions policy to the earlier direct-only set will fail the current Security workflow before jobs complete. Broad GitHub-owned or verified-creator trust is not an acceptable rollback because it expands executable authority beyond the reviewed set.
