# ADR-0116: Promote merged `main` as the release-candidate evidence subject

- Status: Accepted
- Date: 2026-09-01
- Decision owners: Starfiniti product and engineering
- Scope: M15 release gating, M16 recurring controls, owner handoff, and whole-product scoring

## Context

PR #57 consolidated the M04–M16 repository implementation and merged exact reviewed
head `149724a3a2fad89d1a7990e0c3114be2754ecab6` into `main` as merge commit
`c85d93d0e6e0273543078050e697f04309f11d93`. Post-merge CI and Security both
passed on that merge commit. The Release workflow remains manually disabled,
production remains `v0.1.11`, and no release or deployment occurred.

The living score, owner queue, recurring-failure registry, plans, and status still
described the candidate as an unmerged branch. Leaving that state unchanged would
ask the owner to approve a completed merge and would understate that three durable
R-004 controls are now present on the protected integration line. Replacing the
production subject with `main`, however, would falsely present undeployed code as
live customer evidence.

## Options considered

### Keep the branch-head candidate until release

This preserves the old evidence bytes but makes the current handoff stale and keeps
an already completed merge in the external-action queue.

### Treat merged `main` as deployed production

Rejected. Merge and deployment are separate authority boundaries. Production still
runs `v0.1.11`, and none of the real-store, recovery, provider, observation, or
reconciliation gates changed.

### Promote exact merged `main` only as the candidate subject

Selected. Bind the reviewed PR head, merge commit, post-merge CI and Security runs,
disabled Release workflow, and unchanged production release in one minimized
artifact. Advance merged repository controls while keeping their production and
observation evidence null.

## Decision

1. The whole-product `candidate` remains an integration candidate and development
   prioritization subject, but its branch becomes `main` and its exact source commit
   becomes `c85d93d0e6e0273543078050e697f04309f11d93`.
2. Production remains the only completion subject at `v0.1.11` and 54/100. The
   candidate remains 83/100; the merge adds no activation, canary, recovery,
   provider, observation, or customer-value evidence.
3. `docs/plan/evidence/M16/main-integration-2026-09-01.yaml` is the minimized merge
   receipt. Repository validators must reject candidate-branch drift, merge-evidence
   omission, a resurrected merge gate, or any release, deployment, or value claim.
4. The R-004 backup validator, archive-RPO monitor contract, and recovery runbook
   advance from `candidate` to `merged`. The production defect remains present;
   dedicated repository activation, paging, continuity, retention, and restore
   proof remain required.
5. IMP-012 no longer requests merge approval. Exact release approval, independent
   release-policy closure, deployment approval, observation, and protected-value
   reconciliation remain separate gates.
6. Both score subjects keep `unresolved_critical_high` active. Green repository
   checks do not clear the Critical production recovery, host/runtime security,
   release-policy, or independent penetration-test gates.

## Security and integrity effects

- Merged code receives no production, tenant, database, provider, billing, or
  loyalty-value authority.
- The vulnerable production Next.js version remains a Critical open risk until a
  patched release is deployed and reconciled.
- The Release workflow remains disabled; no tag or artifact is created by this
  decision.
- Historical branch, CI, score, and release evidence remains append-only.

## Rollback implications

This is evidence and validation only. If the merge commit is withdrawn from `main`,
append a superseding evidence record and restore the candidate subject to the exact
surviving reviewed commit; do not rewrite this receipt. Production rollback is not
applicable because this decision changes no production runtime. A future release
must use ADR-0115's independently authorized sealed workflow and must not deploy
Next.js 16.3.0 as a rollback artifact.
