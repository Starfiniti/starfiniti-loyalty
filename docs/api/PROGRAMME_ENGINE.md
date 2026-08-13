# Programme Engine Boundary

- Contract versions: `1` and `2`
- Database migrations: `20260812054204_programme_engine_foundation.sql`, `20260813200000_programme_v2_earning_rules.sql`, `20260814010000_advanced_tier_policy.sql`, `20260814020000_live_tier_qualification.sql`, and `20260814030000_tier_benefit_enforcement.sql`
- TypeScript schemas: `packages/contracts/src/programme.ts` and `packages/contracts/src/programme-v2.ts`
- Pure evaluators: `packages/domain/src/engine.ts` and `packages/domain/src/engine-v2.ts`

## Evaluation

The engine consumes connector-neutral order facts and an immutable programme version. Product, category, collection, currency, market, channel, customer-segment, and half-open date conditions are deterministic. Tax, shipping, fees, gift-card/store-credit payments, discounts, refunds, and configured exclusions do not silently become eligible spend.

Rules are sorted by descending priority and stable rule ID. Points are calculated with integer minor units and rounded down once per order. Every line records gross, discount, refund, eligible value, selected rule, rate, outcome, and human-readable reason. Live award and simulation call the same evaluator; their stored input/result hashes and explanation JSON make later drift detectable.

## ProgrammeDefinitionV2 earning precedence

V2 exists beside V1; V1 definitions and stored evaluations are never upgraded or reinterpreted. A V2 programme retains the compatible tier and reward surface and adds strict `earningRules` for six sources: purchase, account creation, birthday, verified product review, referral, and signed custom activity.

Purchase evaluation is deterministic:

1. Apply explicit product, category, payment, discount, shipping, tax, and fee exclusions.
2. Apply exactly one enabled base purchase rate.
3. Apply the effective tier earning multiplier to the base purchase rate, then apply only the highest-priority eligible campaign multiplier to that tier-adjusted base; stable rule code breaks an equal-priority tie and the editor reports that conflict.
4. Add only fixed bonuses that explicitly opt in to stacking.
5. Apply exact event and member-period caps, allocate any shared fractional point deterministically by remainder and rule code, then retain contribution and product/component explanations whose integer points reconcile exactly to the ledger award.

Rules accept only allowlisted product/category, currency, market, channel, segment, tier, and half-open UTC date selectors. Non-purchase activities cannot smuggle commerce-line selectors or purchase exclusions. The live path rejects unverified activity facts; browser events are never proof.

PostgreSQL checks the V2 entitlement and independently validates the strict definition before a draft is stored, then validates again while publication/scheduling materializes immutable `programme_earning_rules`. Managed deployments default V2 off; self-hosted installations remain locally enabled. No Auth or browser claim grants the capability.

The live worker reads authoritative member usage and commits the V2 evaluation, per-rule usage fences, and award through one transaction-scoped advisory-lock boundary. The database rechecks published rule identity, event/programme ownership, exact contribution totals, per-event caps, per-member caps, idempotency hashes, and bigint bounds before value moves. Exact retries exclude their own prior usage and return the original evaluation/ledger references.

The merchant Earning Rules route edits this same contract rather than a UI-only approximation. It offers reviewed templates for purchase base/multiplier/bonus, account creation, birthday, verified review, referral, and signed custom activity; allowlisted selector/date fields; explicit purchase exclusions; event/member-period caps; priority conflict warnings; and a deterministic event simulator imported from the same domain package as the worker. Moving from a V1 baseline copies tiers and rewards but clearly identifies the programme-wide V2 base rate as a behavior change when legacy tier rates differ. Saving creates a new immutable draft and never changes the published programme.

## Publication lifecycle

`create_programme_draft` allocates the next version under a programme lock. `publish_programme_version` and `schedule_programme_version` require the caller's expected SHA-256 configuration hash and an approver. Publication materializes immutable relational tier and reward definitions. A due scheduled version atomically supersedes the prior published version; exactly one published version can exist per programme.

Drafts may change before approval. Scheduled, published, superseded, and retired interpretation fields cannot be rewritten. Historical ledger transactions, evaluations, tier decisions, and reservations retain their exact programme version.

## Advanced tier qualification and history

`TierPolicyV2` is optional beside existing V1 and V2 definitions. It supports lifetime, rolling-day, and IANA-timezone calendar-year qualification over eligible spend, earned points, order count, referrals, and verified actions. Ordered levels carry independent AND/OR entry, retention, and re-entry thresholds plus value-neutral benefit declarations. Existing Rose/Bloom/Icon behavior migrates to an equivalent rolling 365-day policy with the retained 30-day grace; stored V1 evaluations are never reinterpreted.

The shared pure evaluator accepts either raw immutable facts or one authoritative metric snapshot and returns exact progress, qualified/effective tiers, next milestone, grace bounds, and an explanation. The worker and merchant simulations use that same decision path.

Live purchase and verified-activity awards append a private qualification fact inside the existing atomic award boundary. Each fact keeps separate `effective_at` and `recorded_at` instants, so late delivery is visible. Partial and full refunds append compensating facts at the original order instant; neither the order fact nor historical decisions are rewritten. Cumulative refund totals and reversed points are bounded independently against the original award.

The worker can request only one serialized context for an active customer and published policy. PostgreSQL recomputes the window and metrics, rechecks every threshold, current/history state, grace boundary, transition, tenant, customer, event, programme, and version before accepting the pure result. Browser roles cannot read the private facts or execute these functions, and the worker cannot execute the underlying award primitive or enumerate facts directly.

The decision command serializes by programme group and customer. Automatic entry, upgrade, re-entry, grace, and downgrade append `tier_decisions`. When the effective tier changes, the existing history boundary closes the current `tier_memberships` interval and opens exactly one new interval in the same transaction. Closed intervals and qualification facts cannot be changed or deleted.

Tier purchase multipliers are independently checked against the current published policy at the atomic award boundary. Linked benefit rewards must be strict V2 rewards whose immutable availability includes the benefiting tier; they still use normal reservation, quantity/budget, connector, or audited manual-fulfilment state machines. Free shipping is a linked native reward, exclusive access and custom perks are linked manual rewards, and `earlyAccess` remains a value-neutral eligibility fact until a later campaign/storefront boundary consumes it.

`set_customer_tier_override_command(customer_public_id, programme_group_public_id, programme_version_public_id, tier_code, expires_at, reason, idempotency_key, correlation_id)` is the only browser-callable override boundary. It derives organization, actor, customer, wallet, and published tier authority; allows only live owners/admins; requires a trimmed 8–500 character reason and an expiry within 365 days; and writes one immutable decision, grant, and admin audit event. A second override cannot start before the first has immutable resolution evidence. Automatic evaluation continues from its underlying automatic tier while effective membership remains pinned. The worker can run only a 1–200 row expiry sweep, which restores the latest verified automatic tier (or the pre-override tier), records one resolution, and creates no duplicate on replay. Browser sessions cannot run maintenance, and the worker cannot call either raw tier-decision primitive.

## Rewards and failure compensation

V1 definitions retain their historical fixed, percentage, and free-shipping behavior. `ProgrammeRewardDefinitionV2` adds fulfilment-complete fixed discounts, uncapped percentage discounts, free shipping, product-specific free products, exclusive access, and custom perks. Store credit, gift cards, cash redemption, and maximum-capped percentage discounts remain unsupported. A reward request snapshots the version, reward, wallet, cost, expiry, idempotency key, and request hash.

Native WooCommerce fixed discounts require a positive minor-unit amount, percentage discounts require 1–10,000 basis points with no maximum cap, currency precision is 0–6 digits, and native coupons require a 1–365 day validity. V2 adds minimum-spend, product/category, sale-item, stacking, date, tier, per-customer, global-quantity, and points-budget controls. Segment availability is structurally empty until M07 provides an authoritative audience snapshot. The public contract validates authoring and PostgreSQL independently rechecks publication and redemption before customer value moves.

`20260813210000_expanded_reward_fulfilment.sql` allocates limited quantity and points budget inside the same serialized transaction as the reward reservation. Capture consumes the allocation; a definitive release returns it. An ambiguous connector outcome keeps both points and capacity reserved for inspection. Two-session verification proves that only one request can take the last unit.

`20260813211000_manual_reward_fulfilment.sql` routes exclusive-access and custom rewards into one private case created in the reservation transaction. The customer receives the same minimized reservation result as a native reward. Merchant queue reads derive organization and programme-group scope from the live member role. Owner, admin, and operator commands start a case and then record confirmed fulfilment or definitive rejection; analysts and auditors are read-only. Confirmed fulfilment captures points, definitive rejection compensates them, and uncertain delivery stays reserved and `in_progress`. The public command and response schemas are documented in `docs/api/REWARD_FULFILMENT.md`.

The state graph is:

```text
requested -> reserved -> issued -> captured
    |           |          |
    +-----------+----------+-> cancelled / expired / failed -> released
```

Value-bearing transitions must reference a unique ledger transaction for the same tenant, wallet, points cost, and operation kind. Capture/release transactions must resolve the reservation's original ledger transaction. Connector failure is recorded first, then a `cancel` ledger transaction restores the reserved points, and finally the reward reaches `released`. Retries return the original transition; key reuse against another reservation or request hash is rejected.

Connector execution references must be opaque object IDs. Coupon plaintext is not persisted in this boundary.

For WooCommerce native rewards, a reserved reward queues one high-entropy, customer-scoped coupon issue command. V2 commands are returned only when the polling plugin advertises `coupon.issue.v2`; the retained V1 claim boundary cannot receive them. Successful connector acknowledgement records `issued`. A signed completed-order coupon fact then calls the narrow capture command, which locks the reservation and creates both the related `capture` ledger transaction and `captured` transition atomically. A retry returns the original transaction; the same reservation against another order conflicts.

Authenticated hosted customers use `redeem_my_reward(account_public_id, reward_code, request_id)`. The account must be an active non-revoked link for the live Auth subject; tenant, customer, wallet, programme version, points, validity, and WooCommerce connection are never caller inputs. One transaction creates the reservation, reserves exact FIFO-funded points, records the transition, and queues the private coupon command. The response contains only reservation ID, state, and created/duplicate outcome.

Expired unused coupons follow the inverse sequence: the worker queues one cancellation, WooCommerce refuses cancellation when native usage is already non-zero, and only a confirmed unused cancellation creates the related `cancel` ledger transaction and `released` transition. Capture and release serialize on the reservation row and remain mutually exclusive.

## Expiry notifications

`PointExpiryPolicyV2` keeps finite earned-date expiry compatible with `pointsExpireAfterDays` and adds a bounded immutable reminder schedule. Publication materializes the exact policy per programme version. The worker calls only `run_point_expiry_lifecycle_v2(as_of, limit)`: it is single-flight, bounded to 1–500 groups/events, expires due lots separately by original organization, wallet, and programme version, and schedules one nearest relevant reminder per lot. The worker cannot call `expire_points` directly. Each expiry remains an immutable balanced ledger transaction and lot allocation; each reminder retains the `(organization, lot, lead-day)` fence and transactional outbox event. Retry creates no duplicate.

Reservation cancellation and other compensation restore the original lot and original expiry date. A restored past-due lot expires on the next sweep. `get_programme_expiry_liability_v2` returns tenant-authorized aggregate outstanding, overdue, reserved-past-expiry, 30/90-day, affected-member, and next-date evidence without customer identities. Provider delivery of `loyalty.points.expiring` remains M08 scope.

## Trust boundary

Browser roles receive only tenant-filtered reads. `loyalty_worker` receives the narrow command functions and cannot execute materialization primitives or write programme, tier, reservation, transition, or evaluation tables directly. The private evaluation and notification tables are outside the Data API schema.
