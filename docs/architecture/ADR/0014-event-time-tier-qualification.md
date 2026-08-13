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
- [PostgreSQL date/time and IANA timezone behavior](https://www.postgresql.org/docs/current/datatype-datetime.html)

## Decision

Keep `ProgrammeDefinitionV2` and add an optional nested `TierPolicyV2` discriminator. Definitions without that discriminator retain their current interpretation. The existing ordered `tiers` array remains the immutable display and earning-rate snapshot; the advanced policy references those codes and cannot add a hidden tier.

Each advanced policy selects one qualification window: lifetime, an exact rolling number of days, or a calendar year in an IANA timezone. Each non-base tier defines entry, retention, and re-entry threshold expressions. An expression is either `all` or `any` over bounded thresholds for eligible spend, earned points, completed orders, qualified referrals, or verified actions. Values remain decimal integer strings through browser, worker, and PostgreSQL boundaries.

Qualification uses immutable facts with two timestamps: `effective_at` determines the qualification window and `recorded_at` proves when the platform learned the fact. Late events append a current decision from a recomputed event-time snapshot; they never rewrite a past decision or membership interval. Refund effects retain original-order attribution for qualification, so reversing an old order cannot create an unrelated negative metric in the current rolling period.

The evaluator returns the selected window, exact metrics, matched expression, effective threshold kind, next milestone, and grace evidence. The live worker and merchant simulator use the same pure evaluator. PostgreSQL independently validates policy publication, derives organization/customer/wallet authority, serializes live fact/decision writes, and verifies the submitted metric snapshot against stored facts before opening or closing a membership interval.

Rose, Bloom, and Icon migrate as a 365-day rolling eligible-spend policy with thresholds EUR 0, EUR 150, and EUR 500 and a 30-day downgrade grace. Entry, retention, and re-entry expressions are identical for this migration. Shadow evaluation must prove the same tier at every boundary before the advanced policy can be enabled for the pilot tenant.

## Alternatives considered

1. Reinterpret the existing `tiers` array as advanced policy. Rejected because published V1/V2 definitions would silently gain new semantics and cannot express independent retention or re-entry.
2. Introduce `ProgrammeDefinitionV3` immediately. Rejected for this slice because the approved public roadmap establishes versioned subcontracts within V2, and an optional discriminator can preserve every existing V2 byte-level configuration and reader.
3. Maintain mutable per-customer counters. Rejected because late events, refunds, window changes, and recovery would be hard to audit and could drift from ledger/canonical evidence.
4. Recompute from immutable event-time facts and append decisions. Accepted because it supports deterministic replay, exact shadow comparison, late facts, and forward-only correction.
5. Use the server session timezone for calendar years. Rejected because results would depend on deployment configuration. Policies store a named IANA zone and all boundaries are explicit instants.

## Security and integrity effects

- Browser input can select policy structure but cannot supply tenant, customer, wallet, accumulated metrics, or effective tier authority.
- Facts are idempotent and tenant-scoped; decisions serialize per wallet.
- Exact integer strings avoid JavaScript precision loss.
- Calendar boundaries use a stored timezone rather than session or browser locale.
- Backdated facts and refunds append evidence instead of rewriting historical membership.
- Manual overrides remain a separate audited command and never masquerade as automatic qualification.

## Migration and rollback

Deploy the additive contract, schema, and readers while `vip.advanced` is disabled. Existing definitions omit `tierPolicy` and continue unchanged. Shadow-evaluate migrated Rose/Bloom/Icon policies without moving memberships, then enable one tenant.

Rollback disables new advanced policy publication and automatic transitions. Existing advanced definitions, immutable facts, decisions, and membership history remain readable. The last effective tier remains in place while a forward fix is prepared; historical decisions are never deleted or rewritten.
