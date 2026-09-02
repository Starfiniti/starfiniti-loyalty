# ADR-0124: Temporary solo-maintainer merge policy

- Status: Accepted
- Date: 2026-09-02
- Supersedes: only the independent pull-request approval requirement in ADR-0115 while this exception is active
- Related: ADR-0115, ADR-0117, ADR-0118, R-064, R-066

## Context

`main` requires pull requests, twelve exact app-bound checks, strict current-base
evaluation, signed commits, one approval, stale-review dismissal, approval by a
person other than the last pusher, resolved conversations, administrator
enforcement, and no force push or deletion. The public repository has one
administrator and no second eligible reviewer. The approval requirement
therefore blocks every change even after deterministic and adversarial checks
pass.

The owner explicitly selected solo operation for now. Recording a self-review
as independent would be false, while deleting pull-request protection or
weakening deterministic checks would create unnecessary authority.

## Decision

1. Keep pull requests mandatory and set the required approval count to zero.
   Disable stale-review dismissal and last-pusher approval because no approval
   exists in this mode; do not present those inactive fields as controls.
2. Preserve the twelve exact GitHub-App-bound checks, strict current-base
   evaluation, signed commits, conversation resolution, administrator
   enforcement, and force-push/deletion blocks.
3. Require a documented adversarial diff review and explicit owner merge
   decision for each candidate. This is solo review, not independent review.
4. Keep Release manually disabled. Before any later publication, its preflight
   must accept only the solo branch-policy shape, choose the newest run for each
   required app/check pair, require that run to pass, and wait at least 86,400
   seconds after the newest required check completes.
5. Expire this exception no later than 2026-12-01T05:59:20Z. The repository
   validator fails after expiry. Restore one independent approval earlier if a
   second eligible collaborator is added or the owner revokes the exception.
6. Do not use this decision as penetration-test, release, deployment, canary,
   reconciliation, or GA evidence. Those gates retain their own objective
   evidence requirements and do not block safe repository work.

## Alternatives considered

### Keep one approval and stop work

Rejected for the temporary operating period. With one repository principal the
rule is impossible to satisfy and measures account topology rather than the
candidate.

### Remove pull-request protection

Rejected. A zero-approval pull-request rule preserves the branch boundary,
conversation resolution, exact-head checks, audit trail, and protected merge
path without pretending a second person exists.

### Add a second account controlled by the same person

Rejected. That would simulate separation without adding independent judgment
and would create another credential to protect.

## Consequences

- The owner can merge exact-head green pull requests without a second account.
- Human error receives less separation-of-duties protection. Deterministic
  checks, adversarial review, signed history, the time-limited exception, and
  release cooling-off reduce but do not eliminate that risk.
- A second eligible collaborator or expiry requires restoring the previous
  review payload before further protected work is accepted.
- Production remains unchanged because merge, release, deployment, and GA are
  separate authorities.

## Rollback

`PATCH repos/Starfiniti/starfiniti-loyalty/branches/main/protection/required_pull_request_reviews`
with `dismiss_stale_reviews=true`, `require_code_owner_reviews=false`,
`required_approving_review_count=1`, and `require_last_push_approval=true`.
Verify every unchanged branch and repository security control after rollback.
