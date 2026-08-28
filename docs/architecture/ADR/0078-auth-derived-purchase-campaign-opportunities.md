# ADR-0078: Auth-derived purchase campaign opportunities

- Status: Accepted
- Date: 2026-08-28
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M07, M09

## Context

Starfiniti can author, approve, assign, execute, measure, pause, cancel, refund,
and reconcile all seven campaign behavior families. The hosted customer account,
however, does not show an eligible member that a scheduled or active purchase
bonus exists. Notifications and immutable history explain value after an event,
but they do not provide pre-purchase discovery.

Current official competitor documentation was rechecked on 2026-08-28. Smile
surfaces an active bonus-points campaign through an automatic on-site prompt that
states the multiplier. Yotpo defines campaigns as targeted, time-bound experiences
with an audience, reward, and schedule, and uses customer-visible points-drop
campaigns to create urgency. These approaches support proactive discovery, but a
Starfiniti projection must also preserve its immutable audience assignment and
control-group guarantees.

References:

- [Smile bonus-points campaign management](https://help.smile.io/en/articles/8802037-manage-a-bonus-points-campaign)
- [Yotpo loyalty campaigns overview](https://support.yotpo.com/docs/loyalty-campaigns-overview)
- [Yotpo points-drop campaigns](https://support.yotpo.com/docs/points-drop-campaigns-yotpo-loyalty)
- [Supabase database function security](https://supabase.com/docs/guides/database/functions)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)

## Decision

Add `CustomerLoyaltyExperienceV3` with a bounded
`campaignOpportunities` collection. PostgreSQL starts from the strict V2 account
document and independently derives the live Auth subject, active customer link,
commerce connection, exact programme, wallet, immutable campaign assignment, and
projection instant. The function accepts no arguments.

Only `treatment` assignments for purchase bonus and purchase multiplier campaign
versions are eligible. A version is returned only while scheduled or open at the
single projection instant, while no effective pause or cancellation exists, and
while global, per-member, and points capacity can still fund an effect. Control
assignments, non-members, exhausted or ended campaigns, and revoked customer
links are indistinguishable empty results. Accepted assignments remain visible
even if a later commercial entitlement change blocks new campaign configuration;
billing cannot erase a promised loyalty experience.

Each item exposes only:

- a stable one-way derived display code;
- safe bounded name and optional description;
- `scheduled` or `active` state and exact start/end instants;
- either exact fixed bonus points or multiplier basis points;
- a conservative indicator that only eligible purchases qualify; and
- the combination rule: additive fixed bonus or highest eligible multiplier.

The projection omits campaign/version IDs and codes, audience and exclusion
snapshots, treatment evidence, control membership, customer/wallet identity,
earning-rule codes and priorities, products/categories/segments/tiers, exact caps,
budgets, liability, counts, audit metadata, raw definitions, and every value
command. Non-purchase milestone, win-back, tier, referral, and limited-quantity
campaigns continue to arrive through their existing automatic execution,
notification, and immutable-history paths; they are not mislabeled as
pre-purchase offers.

The Next.js reader tries V2 and then V1 only when PostgreSQL reports that V3 is
absent during an additive rolling deployment. Malformed, contradictory, duplicate,
oversized, or provider-error V3 data fails closed. The member overview renders a
campaign strip with explicit scheduling and combination language; it does not add
a second campaign navigation area or client-side eligibility logic.

## Alternatives considered

1. Publish all active campaigns anonymously. Rejected because targeted membership,
   absence, and experimental controls would leak or mislead.
2. Let the browser submit customer, wallet, tenant, or campaign selectors. Rejected
   because those values are not identity, tenancy, assignment, or value authority.
3. Rely on notifications and post-event history only. Rejected because eligible
   members cannot discover a time-bound earning opportunity before purchase.
4. Return all seven campaign definitions. Rejected because automatic trigger
   campaigns are not necessarily actionable offers and their raw selectors expose
   more policy than a customer needs.
5. Return only Auth-derived treatment-assigned purchase opportunities with typed,
   minimized benefit evidence. Accepted because it preserves discovery, controls,
   exact behavior, compatibility, and rollback.

## Security and integrity effects

- The no-selector function is an explicitly granted, bounded `SECURITY DEFINER`
  read with an empty search path and schema-qualified references.
- Raw campaign assignments remain private and have no browser table grant.
- A control member cannot distinguish control assignment from ineligibility, and a
  member cannot enumerate another account or organization.
- Reads do not reserve capacity, post ledger value, enqueue work, alter counters,
  or affect WooCommerce checkout.
- The projection hides an exhausted campaign but does not reserve capacity; final
  eligibility and atomic capacity authority remain in the existing order pipeline.
- Contract time/state contradictions and unsafe merchant text fail before rendering.

## Rollout and rollback

Deploy the additive V3 function before the reader while production remains
unchanged. Verify no-selector Auth derivation, treatment/control isolation,
programme binding, time and lifecycle states, exact benefits, minimization,
revocation, zero mutation, responsive rendering, and missing-function-only
compatibility. Include the exact release in M09's existing disabled Starfiniti
canary rather than opening a separate production gate.

Rollback the application reader to V2 while retaining the additive V3 function.
Do not alter accepted campaign definitions, assignments, effects, ledger entries,
notifications, history, or WooCommerce behavior.
