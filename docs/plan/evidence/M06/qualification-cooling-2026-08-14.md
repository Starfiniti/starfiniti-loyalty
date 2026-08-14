# M06-S02 qualification and cooling evidence - 2026-08-14

## Hypothesis and target

An attributed order can be qualified from its original immutable policy and exact shared purchase evaluator, then held value-neutral through a return window, without allowing delayed events, publication changes, review state, or refunds to rewrite history or create early points.

The slice target is one qualification fact for the configured paid status, exact minimum spend, and first paid order; deterministic rejection for ineligible orders; reversible review hold; an event-time cooling deadline; and refund invalidation before any ledger effect.

## Architecture

- ADR-0017 selects the attribution's original programme version rather than the currently published version.
- A worker-only context function derives attribution, historical version, current state, and required order status from the canonical event.
- The worker reloads that immutable V2 definition and evaluates the signed order with the same pure evaluator used for simulation and live awards.
- PostgreSQL verifies the canonical event identifier/time and bounded evaluation evidence, independently derives prior paid-order history and minimum-spend eligibility, and appends one cooling/rejection outcome.
- Eligible risk cases store `review_held` evidence but cannot leave `pending_review` without the later authorized review command.
- A signed source-order refund moves captured, review-held, or cooling state to `rejected`. Already qualified value returns `compensation_required` for M06-S03 atomic give/get compensation.
- Qualification, cooling, review hold, and refund rejection issue no points, reservation, coupon, or other value.

## Adversarial coverage

The focused database suite covers exact worker/browser privileges, RLS and immutability, wrong status, original-version context, minimum spend, prior paid order, forged event evidence, duplicate/delayed status, review hold, event-time cooling, refund replay, unrelated refunds, private evidence, and zero ledger transactions.

Worker tests cover processing-status qualification without purchase award and refund rejection before a completed-order award exists. Existing purchase, activity, refund, expiry, and tier tests remain green.

## Local verification

- Worker tests: 19 passed.
- Worker typecheck: passed.
- `npm run db:validate`: 38 migrations and 34 pgTAP files passed static validation.
- `git diff --check`: passed.
- Exact Docker-backed replay is pending and is not claimed in this evidence yet.

## Rollback and open limitations

The `referrals` entitlement may stop new publication, links, and attribution but does not suppress accepted qualification or refund safety. Immutable facts and transitions remain for reconciliation.

Cooling completion does not issue points in this slice. Atomic advocate/friend awards, exactly-once cooling sweep, post-issuance refund compensation, and referral-count tier facts are M06-S03.
