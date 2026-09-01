# ADR-0019: Auth-derived reversible referral review

- Status: Accepted
- Date: 2026-08-14
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M06, M10, M13

## Context

Referral attribution deliberately treats reused network, device, payment, or shipping evidence as uncertain instead of automatically fraudulent. Those signals are purpose-bound HMAC fingerprints with short retention; a merchant reviewer must never receive the fingerprint bytes or use email/domain metadata as tenant authority. A review may happen before order qualification or after an immutable `review_held` qualification fact exists. The latter fact must not be rewritten merely because a human approves it.

Internal reward jobs are database-only and atomic, so an exhausted job has no ambiguous external coupon outcome. A reviewed recovery can safely retry it, but an operator must not create an unbounded automated retry loop. PostgreSQL row/advisory locks and Supabase RLS/`SECURITY DEFINER` boundaries keep the current state and live membership authoritative rather than the browser request.

## Decision

Expose one authenticated referral review queue scoped by a public programme selector. PostgreSQL derives organization and programme group from that selector plus the caller's live membership. Owner, admin, operator, analyst, and auditor roles may inspect allowlisted risk codes, qualification state, customer display references, source-order reference, and bounded job diagnostics. The projection never includes risk fingerprints or internal tenant/customer keys.

Only owner, admin, or operator may approve or reject a `pending_review` attribution. The command requires a bounded reason, idempotency key, and correlation ID; actor and organization come from the live Auth request. It acquires the same attribution advisory lock as qualification, issuance, and refund. Approval before qualification appends `pending_review -> captured`; the normal historical evaluator still decides eligibility. Approval after an immutable `review_held` fact appends `pending_review -> cooling`; the original fact remains unchanged and the normal cooling job uses it only because the current state now proves merchant approval. Rejection appends `pending_review -> rejected` without value. Every decision appends immutable merchant transition and administration audit evidence.

An internal reward job enters `manual_review` after each ten-attempt cycle. Owner, admin, or operator may requeue it only with a bounded reason and immutable administration audit. The global attempt number continues rather than resetting, and at most four reviewed requeues are allowed, for 50 total worker claims. Each reviewed cycle is another bounded ten-attempt window; the fifth exhaustion stays nonclaimable for engineering reconciliation.

## Alternatives considered

1. Expose raw HMAC fingerprints to reviewers. Rejected because equality evidence is sufficient for automatic risk codes and the bytes create an unnecessary long-lived identity graph and exfiltration surface.
2. Rewrite `review_held` to `eligible` after approval. Rejected because it destroys the original automated decision and makes historical reconstruction depend on mutable state.
3. Let analyst/auditor roles resolve cases. Rejected because read-only oversight must remain separated from a value-adjacent authorization decision.
4. Reset `attempt_count` to zero on every reviewed retry. Rejected because attempt identities would collide and an unlimited sequence of reviews would hide cumulative operational failure.
5. Append merchant transitions, preserve immutable facts, and allow a small number of audited ten-attempt recovery cycles. Accepted because authorization, evidence, retry bounds, and rollback remain independently reconstructable.

## Security and integrity effects

- Browser input supplies only public case selectors, a two-value resolution, bounded reason, idempotency key, and correlation ID; it never supplies organization, customer, advocate, wallet, points, or risk evidence.
- Live database membership, not Auth metadata, email, or domain, gates every read and mutation. Cross-tenant and read-only-role attempts fail closed.
- Raw referral risk evidence remains private with RLS and no browser table privilege; the queue exposes only the six allowlisted risk codes.
- Approval and rejection are value-neutral. Reviewed issuance still runs through the same leased atomic two-wallet ledger function.
- Exact request hashes prevent one idempotency key from approving and later rejecting, changing the reason, or selecting another resource.
- Review retry is safe only because the job transaction has no external side effect and either committed the complete issuance or nothing.

## Operations

Monitor oldest pending risk review, decision latency, approval/rejection counts, queue depth by allowlisted risk code, exhausted reward jobs, reviewed retry cycles, and jobs reaching the 50-attempt ceiling. Alert when a risk case exceeds its qualification/cooling expectation or when a reviewed job returns to manual review. Audit views must show actor, action, bounded reason, resource, correlation, and timestamp without fingerprints or raw event payloads.

## Migration and rollback

Deploy the additive command/read functions and reviewed-cycle columns while referrals remain disabled for new production entry. Run role, tenancy, idempotency, immutable-fact, no-value, queue, and attempt-ceiling tests before enabling the pilot tenant.

Rollback may disable new referral entry and hide the mutation controls, but the review queue and accepted history remain readable. It must not delete pending reviews, merchant transitions, administration audit, attempts, jobs, or immutable qualification/ledger evidence. A forward fix resumes review or job processing; no rollback rewrites a prior decision.
