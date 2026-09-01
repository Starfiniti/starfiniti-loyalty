# ADR-0014: Event-time advanced tier qualification

- Status: Accepted
- Date: 2026-08-14
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M05, M06, M07, M09

## Context

The original programme contract stores an ordered spend ladder and the database already preserves immutable tier decisions and membership intervals. It does not yet express entry, retention, and re-entry thresholds over different metrics or calculate rolling and merchant-calendar windows from authoritative facts. Reinterpreting an already published V1 or V2 definition would break historical evaluation.

Current competitor documentation separates tier progress from a spendable points balance and commonly supports lifetime, rolling, and calendar-year qualification. Yotpo also distinguishes entry, retention, and re-entry thresholds, while Smile and LoyaltyLion document calendar/lifetime or rolling/lifetime progress. PostgreSQL stores `timestamptz` in UTC and applies IANA timezone rules when a named zone is used, which is required for deterministic merchant-calendar boundaries across daylight-saving changes.

References reviewed on 2026-08-14:

- [Smile VIP tier milestones](https://help.smile.io/en/articles/4036321-understand-vip-tier-milestones)
- [LoyaltyLion tier construction](https://help.loyaltylion.com/en/articles/1965846-building-tiers-how-they-work)
- [LoyaltyLion customer tier progress](https://help.loyaltylion.com/en/articles/9042359-customer-tier-progress)
- [Yotpo VIP tier entry, retention, and re-entry](https://support.yotpo.com/docs/loyalty-referrals-vip-tiers)
- [Yotpo Loyalty Tiers benefits](https://support.yotpo.com/docs/create-loyalty-tiers-program)
- [LoyaltyLion tier benefits](https://help.loyaltylion.com/en/articles/5464060-shopify-tier-benefits)
- [PostgreSQL date/time and IANA timezone behavior](https://www.postgresql.org/docs/current/datatype-datetime.html)

## Decision

Keep `ProgrammeDefinitionV2` and add an optional nested `TierPolicyV2` discriminator. Definitions without that discriminator retain their current interpretation. The existing ordered `tiers` array remains the immutable display and earning-rate snapshot; the advanced policy references those codes and cannot add a hidden tier.

Each advanced policy selects one qualification window: lifetime, an exact rolling number of days, or a calendar year in an IANA timezone. Each non-base tier defines entry, retention, and re-entry threshold expressions. An expression is either `all` or `any` over bounded thresholds for eligible spend, earned points, completed orders, qualified referrals, or verified actions. Values remain decimal integer strings through browser, worker, and PostgreSQL boundaries.

Progress remains a projection, not a mutable authority. Merchant and customer reads rebuild exact qualification metrics from immutable event-time facts under the currently published policy, combine them with immutable decision/membership history, and return only bounded versioned view contracts. The customer boundary derives scope from an active Auth/customer link and accepts no resource selector; the merchant boundary derives organization membership before accepting public customer/programme selectors. Aggregate tier performance contains no customer identity.

The experience deliberately shows spendable wallet points and qualification metrics as separate facts. It exposes the active qualification window and review date, exact amount remaining for every AND/OR threshold, retention state, grace/override bounds, and immutable tier intervals. This follows the documented Smile milestone/reset and LoyaltyLion progress/review-date models without treating a points balance as qualification authority.

Qualification uses immutable facts with two timestamps: `effective_at` determines the qualification window and `recorded_at` proves when the platform learned the fact. Late events append a current decision from a recomputed event-time snapshot; they never rewrite a past decision or membership interval. Refund effects retain original-order attribution for qualification, so reversing an old order cannot create an unrelated negative metric in the current rolling period.

The evaluator returns the selected window, exact metrics, matched expression, effective threshold kind, next milestone, and grace evidence. The live worker and merchant simulator use the same pure evaluator. PostgreSQL independently validates policy publication, derives organization/customer/wallet authority, serializes live fact/decision writes, and verifies the submitted metric snapshot against stored facts before opening or closing a membership interval.

Rose, Bloom, and Icon migrate as a 365-day rolling eligible-spend policy with thresholds EUR 0, EUR 150, and EUR 500 and a 30-day downgrade grace. Entry, retention, and re-entry expressions are identical for this migration. Their retained 5/6/7 points-per-euro rates derive exact 10,000/12,000/14,000 basis-point benefits from the 5-point base. Contract and PostgreSQL validation reject any advanced definition whose displayed tier rate differs from that executable product. Shadow evaluation must prove the same tier and award rate at every boundary before the advanced policy can be enabled for the pilot tenant.

Tier earning multipliers are part of the member's effective base purchase rate, not another merchant-authored campaign rule. The engine applies the effective tier multiplier to the base-rate numerator, then applies at most the one existing highest-priority eligible purchase multiplier to that tier-adjusted base; explicitly stackable fixed bonuses remain unmultiplied. The evaluation records both factors, so liability and historical explanations remain reconstructable. Tier reward codes grant access only to immutable published rewards and still pass the normal redemption, reservation, connector/manual fulfilment, and budget boundaries. Free-shipping benefits are therefore linked free-shipping rewards, while exclusive access and custom perks use the audited manual fulfilment state machine. `earlyAccess` is a visible eligibility fact for later campaign/storefront enforcement and grants no direct commerce authority by itself.

Manual tier overrides are separate append-only, expiring decisions. Owner/admin commands derive the tenant, programme, customer, wallet, and published tier; require a bounded reason, future expiry, idempotency key, and correlation ID; and never edit qualification facts. Automatic qualification continues to calculate progress against its underlying automatic tier while an active override pins only the effective membership. Expiry restores the latest independently verified underlying automatic tier, or the pre-override tier when no new automatic decision exists, before opening the next membership interval. A second override cannot start until the prior override has immutable expiry resolution evidence. Rollback can stop new overrides and expiry processing without deleting the active/history evidence.

## Alternatives considered

1. Reinterpret the existing `tiers` array as advanced policy. Rejected because published V1/V2 definitions would silently gain new semantics and cannot express independent retention or re-entry.
2. Introduce `ProgrammeDefinitionV3` immediately. Rejected for this slice because the approved public roadmap establishes versioned subcontracts within V2, and an optional discriminator can preserve every existing V2 byte-level configuration and reader.
3. Maintain mutable per-customer counters. Rejected because late events, refunds, window changes, and recovery would be hard to audit and could drift from ledger/canonical evidence.
4. Recompute from immutable event-time facts and append decisions. Accepted because it supports deterministic replay, exact shadow comparison, late facts, and forward-only correction.
5. Use the server session timezone for calendar years. Rejected because results would depend on deployment configuration. Policies store a named IANA zone and all boundaries are explicit instants.
6. Model tier multipliers as ordinary priority rules. Rejected because merchant rule ordering could silently remove a promised tier benefit and make the same tier depend on unrelated campaign priority.
7. Multiply fixed bonuses and every eligible campaign multiplier. Rejected because liability would grow combinatorially and would contradict the one-multiplier M03 precedence contract.

## Security and integrity effects

- Browser input can select policy structure but cannot supply tenant, customer, wallet, accumulated metrics, or effective tier authority.
- Facts are idempotent and tenant-scoped; decisions serialize per wallet.
- Exact integer strings avoid JavaScript precision loss.
- Calendar boundaries use a stored timezone rather than session or browser locale.
- Backdated facts and refunds append evidence instead of rewriting historical membership.
- Manual overrides remain a separate audited command and never masquerade as automatic qualification.
- Displayed tier rates and executable base-rate multipliers must have exact integer parity before draft storage and publication.

## Migration and rollback

Deploy the additive contract, schema, and readers while `vip.advanced` is disabled. Existing definitions omit `tierPolicy` and continue unchanged. Shadow-evaluate migrated Rose/Bloom/Icon policies without moving memberships, then enable one tenant.

While rollout remains disabled, legacy V1 tier authoring stays available. If an accepted advanced definition already exists, disabling the capability makes its editor read-only but does not hide customer progress, merchant history/performance, or accepted tier value. Rollback therefore removes only new advanced authoring; the projection functions remain safe to serve until a forward fix.

Rollback disables new advanced policy publication and automatic transitions. Existing advanced definitions, immutable facts, decisions, and membership history remain readable. The last effective tier remains in place while a forward fix is prepared; historical decisions are never deleted or rewritten.
