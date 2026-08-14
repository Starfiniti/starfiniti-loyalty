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

This foundation issues no points. Qualification, cooling, two-sided ledger effects, refund reversal, review operations, and merchant/customer projections are subsequent M06 contracts. Disabling rollout stops new links and attribution while preserving accepted history.
