# Referral contracts

## Versioned policy

`ProgrammeDefinitionV2.referralPolicy` is optional. `ReferralPolicyV1` defines:

- a 1–90 day first-attribution window;
- `processing` or `completed` qualification status and a 0–90 day cooling period;
- exact minimum eligible spend and monthly advocate cap;
- positive points-only advocate and friend rewards; and
- bounded manual-review risk settings.

The TypeScript contract and PostgreSQL publication boundary validate the same closed shape. The immutable published policy, not browser state or WooCommerce, is value authority. Existing V1/V2 programmes without the policy remain compatible.

## Customer link command

`loyalty.create_my_referral_link(accountId uuid, requestId uuid)` is available only to `authenticated`.

The caller supplies one public linked-account selector and idempotency UUID. PostgreSQL derives the live Auth subject, customer, tenant, source connection, active published programme/policy, and `referrals` entitlement. A successful response is:

```json
{
  "advocateCode": "00000000-0000-4000-8000-000000000000",
  "shareUrl": "https://store.example/?stf_ref=00000000-0000-4000-8000-000000000000",
  "outcome": "created"
}
```

Exact retries return `duplicate` with the same code. Changed account/actor reuse conflicts. Revoked links, disabled customers/connections/programmes, absent Auth, cross-account selectors, and disabled entitlement fail closed. The code is an opaque identifier, not authorization.

## WooCommerce evidence

`WooCommerceOrderFactV1.referral` optionally carries `ReferralAttributionEvidenceV1`:

```json
{
  "version": "1",
  "advocateCode": "00000000-0000-4000-8000-000000000000",
  "capturedAt": "2026-08-14T00:00:00Z",
  "sourceNetworkFingerprint": null,
  "deviceFingerprint": null,
  "paymentFingerprint": null,
  "shippingFingerprint": null
}
```

Non-null fingerprints are lowercase 64-character HMAC-SHA-256 hex. They are equality/velocity evidence only. The plugin never sends raw IP, proxy headers, user agent, payment tokens, shipping address, email, or name.

## Attribution boundary

Only `loyalty_worker` may execute `loyalty_private.record_referral_attribution_v1(canonicalEventId)`. The function accepts no tenant, customer, advocate, programme, reward, or value selector. It derives all scope from the signed canonical order event, published policy, connection, and database identities.

Outcomes are `created`, `duplicate`, `existing_attribution`, `no_referral`, `policy_unavailable`, `feature_disabled`, `outside_window`, or `unknown_advocate`. Accepted initial states are `captured`, `pending_review`, or `blocked`. The first eligible friend/programme-group attribution is immutable; later decisions append transitions.

## Qualification and cooling

`loyalty_private.get_referral_qualification_context_v1(canonicalEventId)` is worker-only. It derives the matching attribution, original immutable programme version, current state, and configured `processing` or `completed` status from one signed canonical order event. It accepts no tenant, customer, programme, order, attribution, or reward selector.

The worker evaluates that order against the attribution's historical V2 programme with the shared purchase evaluator. `loyalty_private.record_referral_qualification_v1(...)` verifies the canonical event identifier and time, strict result shape, bounded hashes, and bigint fields before PostgreSQL independently derives the new-customer decision, checks minimum eligible spend, and appends exactly one result:

- eligible `captured` -> `cooling` until event time plus policy days;
- returning customer or below minimum -> `rejected` with a deterministic reason;
- eligible `pending_review` -> private `review_held` evidence without changing review state.

Qualification facts and their `referral_qualification` programme evaluations are immutable and private. Delayed/wrong status remains pending, and duplicates create no second fact or transition. Qualification and cooling issue no ledger value.

`loyalty_private.reject_referral_for_refund_v1(canonicalEventId)` derives the source-order attribution from a signed refund. Captured, review-held, or cooling cases cancel accepted reward work and append `source_order_refunded -> rejected` without value. A qualified case atomically reverses the advocate and friend ledger awards, appends both compensating tier facts and one immutable compensation, and only then appends `qualified -> reversed`. Exact replay returns the terminal state without another ledger effect.

## Cooling-completion reward lifecycle

An eligible cooling transition creates one private job due at the canonical event-time cooling deadline. `loyalty_private.claim_due_referral_reward_jobs_v1(workerId, limit, leaseSeconds)` is worker-only, capped at 50 by contract and 25 by the production worker, uses deterministic `FOR UPDATE SKIP LOCKED` claiming, and grants a 15–300 second lease. Attempts are capped at ten; expired leases retry, and exhaustion becomes nonclaimable `manual_review` with a bounded error code.

`loyalty_private.issue_referral_reward_job_v1(jobId, workerId)` accepts only the public job selector and active lease owner. PostgreSQL derives attribution, historical policy/version, both customers, points, qualification evidence, canonical event, wallets, and expiry. One transaction creates separate immutable advocate/friend evaluations, award/release ledger pairs, FIFO lots, tier facts, one two-sided issuance, `cooling -> qualified`, and job completion. A failure commits nothing. An unknown acknowledgement retry returns the existing issuance.

`loyalty_private.finish_referral_reward_job_v1(...)` records only an allowlisted generic error code and bounded retry delay. Job, attempt, issuance, and compensation tables are private and RLS-enabled. Browser/runtime roles have no table or function access.

## Merchant review and internal recovery

`loyalty.list_referral_review_cases(programmeId, kind, limit)` derives organization and programme group from the public programme selector plus the live membership. Owner, admin, operator, analyst, and auditor roles can inspect `risk` and `reward` cases. The bounded projection includes display references, source-order reference, allowlisted risk codes, qualification/cooling state, attempt/review counts, and a generic error code. It never returns network/device/payment/shipping fingerprints or internal tenant/customer keys.

`loyalty.resolve_referral_review_command(attributionId, resolution, reason, idempotencyKey, correlationId)` is limited to live owner, admin, or operator roles. `approved` before qualification returns the attribution to `captured`; `approved` after immutable `review_held` evidence appends `cooling` and creates the normal event-time job; `rejected` appends the terminal value-neutral state. The bounded reason is request-hash-bound and retained in immutable administration audit. Exact retries are duplicates; changed reuse conflicts.

`loyalty.retry_referral_reward_job_command(jobId, reason, idempotencyKey, correlationId)` can requeue only an atomic internal job already at its ten-attempt manual-review boundary. Attempt numbers remain cumulative. At most four merchant-reviewed cycles are allowed after the initial cycle, for 50 total claims; the fifth exhaustion remains nonclaimable for engineering reconciliation. Analyst and auditor roles remain read-only.

## Customer and merchant experience reads

`loyalty.get_my_referral_experiences_v1()` accepts no arguments. It derives the live Auth subject and linked active customer accounts, then returns one strictly versioned experience per account: sharing state, canonical opaque HTTPS URL when active, current give/get policy and currency precision, reconciled current-state counts, and at most 20 newest-first identity-free history rows. Every history amount comes from that attribution's immutable historical policy version. Friend identity, order reference, risk evidence, fingerprints, and internal keys are never returned.

`loyalty.get_referral_dashboard_v1(programmeId, lookbackDays)` accepts one public programme selector and a 1–365 day window. PostgreSQL derives the organization/programme group from live membership and returns active advocates, reconciled current outcomes, immutable two-sided issued points, bounded top advocates, and recent canonical referral orders. It deliberately excludes shares, clicks, signups, influenced revenue, and CAC because no authoritative fact currently supports those metrics.

Both projections are optional read surfaces. A customer-projection error suppresses only the referral panel and cannot hide balances, rewards, tier progress, export, or accepted value. Merchant performance and review projections degrade independently and render explicit unavailable states rather than false zeroes. Copy and native-share actions are progressive enhancement over the selectable URL.

Disabling rollout stops new links and attribution while preserving and continuing accepted qualification, reward jobs, refund rejection/compensation, review inspection/resolution, customer history, and merchant history.
