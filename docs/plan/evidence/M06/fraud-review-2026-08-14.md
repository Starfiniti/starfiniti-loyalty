# M06-S04 fraud-review evidence - 2026-08-14

## Hypothesis and target

Uncertain referral signals can be reviewed without exposing fingerprint values, granting tenant authority from browser input, or issuing value before an authorized decision. Exhausted atomic reward jobs can be recovered without an unbounded retry loop.

The target is one minimized queue, live database-role enforcement, owner/admin/operator approval or rejection, immutable automated and merchant evidence, exact command idempotency, and four audited ten-attempt recovery cycles after the initial ten attempts.

## Architecture

- ADR-0019 selects an Auth-derived `SECURITY DEFINER` command and projection over raw-table browser access or fingerprint disclosure.
- The queue accepts only a public programme selector. PostgreSQL derives organization/programme scope from live membership and returns customer display references, source-order reference, allowlisted risk codes, qualification state, and bounded job diagnostics.
- Approval before qualification appends `pending_review -> captured`; approval after immutable `review_held` evidence appends `pending_review -> cooling`. The original automated decision is never rewritten.
- Rejection appends `pending_review -> rejected` without creating a job or ledger value.
- Reward recovery is safe because issuance is one internal atomic transaction. Cumulative attempt identity never resets; every reviewed requeue permits another ten claims, with 50 claims as the hard terminal ceiling.
- Every mutation binds resource, action, bounded reason, request hash, idempotency key, actor, and correlation in immutable administration audit evidence.

## Adversarial coverage

The focused pgTAP suite verifies exposed-function allowlists, raw fingerprint denial, analyst/auditor read-only separation, no-member denial, minimized risk codes, immutable held evidence, no-value approval/rejection, exact retry, idempotency conflict, audited reason, queue removal, tenth-attempt exhaustion, operator recovery, attempt eleven, cumulative cycle state, and the 50-attempt ceiling.

Contracts reject raw or inconsistent queue shapes and require bounded reasons. Dashboard tests verify minimized parsing, malformed diagnostic fail-closed behavior, no browser organization/points authority, route navigation, and server action validation.

## Verification

Exact-head run `31768294674` passed all seven jobs:

- full repository baseline and both production images;
- a clean replay of 40 migrations;
- all 34 pgTAP files with 1,668 assertions, including 119 focused referral assertions;
- ledger/programme, reward-capacity, and two-worker referral concurrency probes;
- 115 dashboard tests, 132 contract tests, and a successful Next.js production build containing `/referrals`; and
- minimum/current WordPress and WooCommerce with HPOS and legacy storage.

Focused local verification also passed dashboard 115/115, contracts 132/132, both typechecks, the production dashboard build, static migration validation, architecture validation for 13 accepted decisions, and `git diff --check`.

## Rollback and open limitations

Rollback may stop new referral entry and hide mutation controls, but accepted review cases, immutable decisions, audit, jobs, attempts, and ledger evidence remain readable and recoverable through a forward fix. Rollout entitlement does not hide the review queue.

Customer share/progress/history, merchant funnel/history, and production browser/accessibility evidence remain M06-S05. Disabled deployment, Starfiniti canary, reconciliation, and module scoring remain M06-S06.
