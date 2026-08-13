# Programme Engine Boundary

- Contract versions: `1` and `2`
- Database migrations: `20260812054204_programme_engine_foundation.sql` and `20260813200000_programme_v2_earning_rules.sql`
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
3. Apply only the highest-priority eligible multiplier; stable rule code breaks an equal-priority tie and the editor reports that conflict.
4. Add only fixed bonuses that explicitly opt in to stacking.
5. Apply exact event and member-period caps, allocate any shared fractional point deterministically by remainder and rule code, then retain contribution and product/component explanations whose integer points reconcile exactly to the ledger award.

Rules accept only allowlisted product/category, currency, market, channel, segment, tier, and half-open UTC date selectors. Non-purchase activities cannot smuggle commerce-line selectors or purchase exclusions. The live path rejects unverified activity facts; browser events are never proof.

PostgreSQL checks the V2 entitlement and independently validates the strict definition before a draft is stored, then validates again while publication/scheduling materializes immutable `programme_earning_rules`. Managed deployments default V2 off; self-hosted installations remain locally enabled. No Auth or browser claim grants the capability.

The live worker reads authoritative member usage and commits the V2 evaluation, per-rule usage fences, and award through one transaction-scoped advisory-lock boundary. The database rechecks published rule identity, event/programme ownership, exact contribution totals, per-event caps, per-member caps, idempotency hashes, and bigint bounds before value moves. Exact retries exclude their own prior usage and return the original evaluation/ledger references.

## Publication lifecycle

`create_programme_draft` allocates the next version under a programme lock. `publish_programme_version` and `schedule_programme_version` require the caller's expected SHA-256 configuration hash and an approver. Publication materializes immutable relational tier and reward definitions. A due scheduled version atomically supersedes the prior published version; exactly one published version can exist per programme.

Drafts may change before approval. Scheduled, published, superseded, and retired interpretation fields cannot be rewritten. Historical ledger transactions, evaluations, tier decisions, and reservations retain their exact programme version.

## Tier history

The pure domain engine supports rolling, calendar, and lifetime qualification over spend, earned points, or order counts. Rosy uses rolling eligible spend. Automatic upgrades, downgrade grace, downgrades, and explicit manual overrides produce append-only `tier_decisions` with explanation evidence.

The decision command serializes by wallet. When the effective tier changes, it closes the current `tier_memberships` interval and opens exactly one new interval in the same transaction. Closed intervals cannot be changed or deleted.

## Rewards and failure compensation

Approved definitions support fixed or percentage discounts, free products, free shipping, store credit, exclusive access, and custom connector-neutral rewards. A reward request snapshots the version, reward, wallet, cost, expiry, idempotency key, and request hash.

Native WooCommerce fixed discounts require a positive minor-unit amount, percentage discounts require 1–10,000 basis points with no maximum cap, currency precision is 0–6 digits, and fixed/percentage/free-shipping coupons require a 1–365 day validity. These fields are validated before a programme draft can be saved and rechecked before customer value moves.

The state graph is:

```text
requested -> reserved -> issued -> captured
    |           |          |
    +-----------+----------+-> cancelled / expired / failed -> released
```

Value-bearing transitions must reference a unique ledger transaction for the same tenant, wallet, points cost, and operation kind. Capture/release transactions must resolve the reservation's original ledger transaction. Connector failure is recorded first, then a `cancel` ledger transaction restores the reserved points, and finally the reward reaches `released`. Retries return the original transition; key reuse against another reservation or request hash is rejected.

Connector execution references must be opaque object IDs. Coupon plaintext is not persisted in this boundary.

For WooCommerce native rewards, a reserved reward queues one high-entropy, customer-scoped coupon issue command. Successful connector acknowledgement records `issued`. A signed completed-order coupon fact then calls the narrow capture command, which locks the reservation and creates both the related `capture` ledger transaction and `captured` transition atomically. A retry returns the original transaction; the same reservation against another order conflicts.

Authenticated hosted customers use `redeem_my_reward(account_public_id, reward_code, request_id)`. The account must be an active non-revoked link for the live Auth subject; tenant, customer, wallet, programme version, points, validity, and WooCommerce connection are never caller inputs. One transaction creates the reservation, reserves exact FIFO-funded points, records the transition, and queues the private coupon command. The response contains only reservation ID, state, and created/duplicate outcome.

Expired unused coupons follow the inverse sequence: the worker queues one cancellation, WooCommerce refuses cancellation when native usage is already non-zero, and only a confirmed unused cancellation creates the related `cancel` ledger transaction and `released` transition. Capture and release serialize on the reservation row and remain mutually exclusive.

## Expiry notifications

`enqueue_point_expiry_notifications` finds non-empty lots within a positive lead-time window, writes one tenant/lot/lead-time fence, and appends a `loyalty.points.expiring` command to the transactional outbox. A scheduler retry creates no duplicate notification. Actual value expiry remains the immutable `expire_points` ledger command.

## Trust boundary

Browser roles receive only tenant-filtered reads. `loyalty_worker` receives the narrow command functions and cannot execute materialization primitives or write programme, tier, reservation, transition, or evaluation tables directly. The private evaluation and notification tables are outside the Data API schema.
