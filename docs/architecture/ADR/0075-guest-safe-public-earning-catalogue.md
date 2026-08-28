# ADR-0075: Project published earning rules into a guest-safe catalogue

- Status: Accepted
- Date: 2026-08-28
- Extends: ADR-0074

## Context

The hosted guest page had a single generic “Eligible store activity” card even though `ProgrammeDefinitionV2` supports purchase, account-created, birthday, verified-review, referral, and signed custom-activity rules with three effect kinds, schedules, selectors, exclusions, and caps. The card neither proved which methods were published nor described their exact value. This made a functionally broad platform look unfinished and could mislead a guest when a programme did not offer purchase earning.

The public boundary must remain anonymous, English-only, bounded, tenant-derived, and incapable of revealing customer state, internal activity selectors, segments, products, caps, or value authority. Existing V1-V3 clients and immutable historical programme evaluation must remain valid during an additive rollout.

Authoritative references reviewed on 2026-08-28:

- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase breaking-change changelog](https://supabase.com/changelog?types=breaking-change)
- [PostgreSQL function security](https://www.postgresql.org/docs/17/sql-createfunction.html)

## Alternatives

1. **Keep static generic copy.** This avoids a new contract but remains shallow, cannot distinguish published methods, and may imply earning behavior that does not exist.
2. **Send raw `ProgrammeDefinitionV2` rules to the browser.** This preserves detail but exposes internal activity, product, category, segment, tier, market, and channel selectors plus cap and stacking policy. It also moves disclosure authority into browser code.
3. **Add a database-derived V4 minimized catalogue.** PostgreSQL re-derives the active tenant and immutable published version, selects only explicitly safe standard sources, and builds the exact public effect and schedule document. Older strict projections remain unchanged.

## Decision

Use option 3.

`loyalty.get_public_loyalty_experience_v4(uuid, uuid)` extends the strict V3 document with at most twelve ordered `earningMethods`. It follows the existing anonymous PostgREST boundary because the guest route cannot hold a database identity and anonymous roles have no underlying table grants. The function is therefore a narrowly reviewed `security definer` with an empty search path, fully qualified relations, explicit ownership, and execute grants only for `anon` and `authenticated`.

The database independently resolves one active workspace, linked programme group, active programme, and immutable published version before reading normalized earning rules. A public method contains only:

- a source/ordinal-derived public code and reviewed source/effect label;
- one standard source: purchase, account created, birthday, verified product review, or referral;
- one exact effect: points per major unit, multiplier basis points, or fixed bonus;
- a conservative `hasRestrictions` boolean;
- optional validated start/end timestamps; and
- a database-derived current/scheduled availability flag.

Signed `custom_activity` rules are excluded because the current contract has no separately approved public-visibility label. Merchant-authored rule codes and names are also private: the projection derives a stable `source-ordinal` key and uses one reviewed generic label for each source/effect combination. Raw condition selectors, activity codes, exclusions, cap values, priority, stackability, customer eligibility, internal IDs, tenant IDs, programme JSON, evaluation traces, ledger state, and audit evidence are never returned. The anonymous document deliberately says only that conditions apply; authenticated customer projections remain the source for exact personal limits and eligibility.

Effects and timestamps are rebuilt rather than passed through. Exact positive integers are limited to PostgreSQL `bigint`, multipliers remain bounded integers, and private bounded parsers return null on malformed numeric or timestamp input. Custom activities, malformed effects, invalid schedules, and expired methods are omitted. If no safe standard method survives projection, V4 returns an empty public catalogue rather than inventing one. A legacy V1 programme with tiers and no normalized rules receives one conservative purchase-rate method equivalent to its first tier.

The dashboard requests V4 first. V3, V2, and V1 are normalized only when PostgREST or PostgreSQL reports the newer function as absent. Duplicate rows, malformed V4, unknown fields, oversized integers, inconsistent VIP data, provider failures, and non-English legacy documents fail closed. The hosted route renders a responsive catalogue with reviewed Lucide icons, exact integer-safe effect copy, source, live/scheduled state, availability window, and restrictions guidance. An empty catalogue states that no public methods are listed and directs the guest to sign in for account-specific methods.

## Security, privacy, and reliability effects

- Browser input selects only public workspace and programme UUIDs; PostgreSQL derives tenant and published-version authority.
- Anonymous roles retain no raw earning-rule, programme, customer, wallet, ledger, or audit table access and cannot execute private parsers.
- Custom activities and raw selectors cannot leak through JSON passthrough because the function constructs every returned key.
- Exact point values remain text and multipliers remain bounded integers; JavaScript never coerces ledger-sized values through floating point.
- The stable read creates no customer, event, audit, reservation, coupon, or ledger effect and does not affect WooCommerce or checkout.
- V1-V3 functions and contracts remain valid for old clients and historical programme evaluation is unchanged.

## Migration and rollback

Deploy the additive migration before the dashboard image. Old applications continue using V3 during that interval. New application nodes use older projections only for recognized missing-function codes, never for malformed or unavailable V4 responses.

Rollback the application reader and earning component to V3 while leaving V4 and its private fail-closed parsers inert during mixed-version operation. Do not drop V4 until all application nodes are known to be older, and never edit published rules or historical effects. Rollback changes no customer value, programme evaluation, ledger history, reservation, coupon, connector, or checkout behavior.
