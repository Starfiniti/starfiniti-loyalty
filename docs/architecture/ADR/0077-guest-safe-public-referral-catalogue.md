# ADR-0077: Guest-safe public referral catalogue

- Status: Accepted
- Date: 2026-08-28
- Application fallback superseded by: ADR-0079
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M06, M09

## Context

The public loyalty page has exact guest-safe VIP, earning, and reward catalogues,
but its referrals section is still generic. A visitor cannot tell whether a
programme currently offers referrals, what the advocate and friend receive, or
which first-order conditions apply. The authenticated customer experience already
provides one private opaque link, progress, and identity-free history through the
no-selector boundary selected in ADR-0020; duplicating those customer facts into an
anonymous projection would weaken that boundary.

Current official competitor documentation was rechecked on 2026-08-28. Smile
centres the customer journey on a unique link shared from the signed-in customer
panel and completes the advocate reward after the friend purchases. LoyaltyLion
keeps customer referral history alongside the member timeline. Yotpo presents the
advocate and friend offers together with minimum-spend and first-purchase
qualification. These approaches agree that discovery should explain both sides of
the offer and its qualification, while private sharing and history belong to the
customer account.

References:

- [Smile referral flow and customer-panel sharing](https://help.smile.io/en/articles/4036289-understand-how-referrals-work)
- [LoyaltyLion customer referral history](https://help.loyaltylion.com/en/articles/1965801-managing-customers)
- [Yotpo link-based referral programme](https://support.yotpo.com/v1/docs/setting-up-your-referral-program)
- [Supabase database function security](https://supabase.com/docs/guides/database/functions)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)

## Decision

Add `PublicLoyaltyExperienceV6` with one strict
`PublicReferralCatalogueV1`. The catalogue has four explicit states:

- `available`: exact programme-level advocate points, friend points, minimum
  first-order spend and currency, attribution window, return-cooling period,
  new-customer requirement, and a boolean monthly-limit signal;
- `paused`: a published policy exists, but the database-authoritative referral
  entitlement is not active for the selected programme;
- `unavailable`: the selected immutable published version has no referral policy;
- `confirm_in_account`: a conservative V5-to-V1 rolling-deploy normalization that
  makes no current availability or reward claim.

The V6 PostgreSQL projection starts from the bounded V5 public document, derives
the exact active workspace, programme group, programme, latest immutable published
version, safe currency, materialized referral policy, and server-side entitlement.
The caller continues to provide only the existing public workspace and programme
selectors. The document excludes customer and advocate identifiers, share URLs,
friend or order evidence, attribution history, risk settings and fingerprints,
internal IDs, raw configuration, exact monthly caps, audit data, ledger metadata,
and every value command.

The public page renders a concrete give-and-get offer and three-step qualification
flow only for `available`. Paused, unavailable, and compatibility states use honest
bounded explanations and the same-origin account path. Authenticated link creation,
sharing, counts, and history remain exclusively on ADR-0020's Auth-derived
no-selector projection.

The Next.js reader tries V5 through V1 only when PostgreSQL reports that the V6
function is absent. A malformed, contradictory, duplicate, oversized, or
provider-error V6 response fails closed; it never silently selects older data.

## Alternatives considered

1. Keep the generic referral card. Rejected because it looks unfinished and can
   imply an offer where none is published.
2. Return the full `ReferralPolicyV1` configuration. Rejected because fraud
   thresholds, qualification implementation details, internal configuration, and
   exact abuse limits are not needed for guest discovery.
3. Reuse the authenticated customer projection anonymously. Rejected because its
   private link, customer progress, and history require live Auth/customer authority.
4. Derive a minimized immutable programme catalogue in PostgreSQL and keep private
   actions in the account. Accepted because public truth, rollout state, privacy,
   compatibility, and rollback remain independently testable.

## Security and integrity effects

- The function is an explicitly granted read boundary; all underlying referral,
  customer, risk, and ledger tables retain their existing grants and RLS.
- `SECURITY DEFINER` uses an empty search path, schema-qualified references, a
  bounded result, explicit ownership, and execute revocation before grants.
- Programme policy and rollout state are database-derived. Browser input cannot
  choose a customer, advocate, friend, reward amount, wallet, or ledger effect.
- Contract contradictions fail closed, and the projection performs no mutation.
- Public reads cannot create links, capture attribution, qualify referrals, issue
  points, or affect WooCommerce checkout.

## Rollout and rollback

Deploy the additive V6 function before the reader and keep it behind the existing
M09 disabled production release gate. Verify grants, exact selected version,
entitlement states, malformed policy refusal, minimization, zero ledger mutation,
V5 compatibility, and responsive accessibility before the Starfiniti canary.

Rollback the application reader to V5 while leaving the additive function in place
for forward compatibility. Never delete or reinterpret published policies,
advocate links, attributions, transitions, ledger effects, or customer history.
