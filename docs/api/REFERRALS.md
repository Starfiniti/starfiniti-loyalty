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

Disabling rollout stops new links and attribution while preserving and continuing accepted qualification, reward jobs, refund rejection/compensation, and history. Authorized review commands and merchant/customer projections remain subsequent M06 contracts.
