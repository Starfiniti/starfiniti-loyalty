# ADR-0076: Project published rewards into a guest-safe catalogue

- Status: Accepted
- Date: 2026-08-28
- Extends: ADR-0075
- Application fallback superseded by: ADR-0079

## Context

The hosted guest page exposed legacy reward name, kind, and point cost cards. It could not explain the exact benefit, availability window, public purchase conditions, tier access, native versus manual delivery, coupon validity, or limited availability supported by `RewardDefinitionV2`. The generic empty state also read like unfinished product work rather than an honest description of the published programme.

Current competitor and WooCommerce documentation confirms that customer reward discovery normally spans fixed and percentage discounts, free shipping, product rewards, custom benefits, minimum-spend or product restrictions, validity, stacking, and usage limits. These references are capability evidence only; Shopify runtime work remains deferred:

- [Yotpo redeemable rewards overview](https://support.yotpo.com/docs/redeemable-rewards-overview-for-shopify-and-shopify-plus)
- [LoyaltyLion rewards overview](https://help.loyaltylion.com/en/articles/1965651-what-are-rewards)
- [Smile reward restrictions](https://help.smile.io/en/articles/4779069-configure-reward-restrictions)
- [WooCommerce coupon API](https://developer.woocommerce.com/docs/apis/rest-api/v2/coupons)

The anonymous boundary must remain English-only, bounded, tenant-derived, and unable to reveal internal reward codes, WooCommerce product/category selectors, fulfilment instructions, exact customer or global limits, points budgets, customer eligibility, inventory state, or value authority. Store credit is excluded by product decision. Existing V1-V4 clients and immutable programme evaluation must remain valid through an additive rollout.

## Alternatives

1. **Keep legacy name/kind/cost cards.** This needs no new projection but makes working reward fulfilment look incomplete and cannot distinguish exact or scheduled customer value.
2. **Send raw `RewardDefinitionV2` to the browser.** This exposes internal selectors, fulfilment instructions, limits, budgets, stable merchant codes, and configuration structure that the guest does not need.
3. **Add a database-derived minimized V5 catalogue.** PostgreSQL re-derives the active tenant and immutable published version, validates each supported reward fail closed, and constructs only reviewed customer-facing fields. V1-V4 remain unchanged.

## Decision

Use option 3.

`loyalty.get_public_loyalty_experience_v5(uuid, uuid)` extends the strict V4 document with at most twenty ordered reward offers and removes the legacy raw `rewards` array from the V5 browser contract. The function is a narrowly reviewed `security definer` with an empty search path, fully qualified relations, explicit ownership, and execute grants only for `anon` and `authenticated`. Anonymous roles retain no underlying table access.

The database independently resolves one active workspace, linked programme group, active programme, and immutable published version. A public offer contains only:

- a derived `reward-N` key and the explicitly customer-facing reward name;
- exact point cost and a rebuilt supported benefit;
- the published ISO currency and minor-unit scale where an exact monetary value is shown;
- available, scheduled, or compatibility state with validated public timestamps;
- native WooCommerce coupon, audited manual, or compatibility delivery;
- coupon validity or manual delivery estimate; and
- summarized public conditions: minimum spend, resolved tier names, selector presence, sale-item exclusion, member-limit presence, limited-availability presence, and stacking behavior.

V2 fixed discounts, percentage discounts without a maximum monetary cap, free shipping, free products, exclusive access, and custom perks are eligible. Store credit, gift cards, cash-like value, expired offers, segment-restricted offers, malformed benefits, unsafe names, invalid schedules, unknown tiers, duplicate tier selectors, and mismatched currency evidence are excluded. Exact selectors and quantities are reduced to booleans; exact per-member limits, global quantity, points budget, product/category IDs, internal codes and IDs, fulfilment instructions, tenant/customer state, configuration JSON, audit evidence, and ledger state are never returned.

Legacy V1 fixed, percentage, and shipping rewards are represented conservatively during rolling compatibility. Unknown monetary evidence is not invented, their state tells the guest to confirm terms in the account, and the dashboard never claims an exact schedule or fulfilment contract. Legacy store credit is filtered before normalization.

The dashboard requests V5 first. V4, V3, V2, and V1 are normalized only when PostgREST or PostgreSQL reports the newer function as absent. Duplicate rows, malformed V5, unknown fields, conflicting delivery data, oversized integers, provider failures, and non-English legacy documents fail closed. The hosted page renders an editorial responsive catalogue with Lucide icons, integer-safe money and point formatting, exact benefit and timing, public condition chips, delivery expectations, and same-origin account actions. An empty catalogue says only that no public rewards are listed and directs the guest to account-specific benefits.

## Security, privacy, and reliability effects

- Browser input selects only public workspace and programme UUIDs; PostgreSQL derives tenant and published-version authority.
- The function constructs every JSON key and never passes raw reward configuration to the browser.
- Monetary and point values remain bounded decimal text; JavaScript formatting uses `BigInt`, not floating-point value coercion.
- Exact customer eligibility and available balance remain authenticated account concerns; the guest page makes no redemption promise.
- The stable read creates no customer, event, audit, reservation, coupon, command, or ledger effect and does not affect WooCommerce checkout.
- V1-V4 projections and clients remain valid, and historical programme evaluation is unchanged.

## Migration and rollback

Deploy the additive migration before the dashboard image. Old application nodes continue using V4 during that interval. New nodes use older projections only for recognized missing-function codes, never for malformed or unavailable V5 responses.

Rollback the application reader and reward component to V4 while leaving V5 inert during mixed-version operation. Do not drop V5 until every application node is known to be older. Rollback changes no customer value, published configuration, ledger history, reservation, coupon, connector command, or checkout behavior.
