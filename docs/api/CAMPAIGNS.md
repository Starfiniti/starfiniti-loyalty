# Audiences and campaigns

## AudienceDefinitionV1

M07 starts with an audience authority boundary. `AudienceDefinitionV1` is a closed, versioned contract over allowlisted canonical loyalty facts. It never accepts merchant SQL, browser tags, arbitrary customer attributes, email, names, channel identifiers, or caller-supplied member lists.

Definitions contain 1–20 conditions and use explicit `all` or `any` matching. Supported metrics are:

- current available and pending points;
- eligible spend, earned points, order count, referral count, and verified-action count over a lifetime or 1–3,650 day rolling window;
- customer age in days; and
- days since the last paid order, with no order represented as `null` and therefore not matched by numeric conditions.

Tier conditions use only published tier codes. Verified-action conditions may filter by an allowlisted set of activity codes. Thresholds and observations use canonical decimal bigint text. Balance evidence may be negative; cumulative activity metrics must be nonnegative or evaluation fails closed.

`packages/domain` evaluates the same exact fact contract without platform dependencies. PostgreSQL independently validates stored definitions and derives production facts from canonical tables. A condition result retains its index, match decision, and exact observed value so later effects can explain the snapshot used.

## Version and snapshot lifecycle

- `loyalty.audiences` is the immutable stable identity for one code in a programme group.
- `loyalty.audience_versions` stores immutable draft, published, and superseded definitions. Only one version may be published per audience.
- `loyalty.audience_snapshots` stores database-timed aggregate snapshot evidence.
- `loyalty_private.audience_snapshot_members` stores included customer/wallet keys and exact evaluation evidence. Browser, anonymous, application runtime, and connector roles cannot read it.

Snapshots consider active customers with active wallets in the version's exact organization and programme group. Synchronous creation is limited to 100,000 candidates; a later worker slice may replace that implementation without changing the public contract. The caller cannot choose the tenant, programme group, member identities, observation values, or snapshot time.

## Merchant commands

All commands require an authenticated Supabase session and derive authorization from current organization membership. Selectors are public UUIDs; idempotency keys are tenant-scoped and request-hash-bound.

`loyalty.create_audience_draft_command(programmeId, definition, idempotencyKey, correlationId)` permits owner/admin roles. It validates the definition independently, checks the database-authoritative `campaigns` entitlement, serializes creation by stable audience code, and returns the immutable version ID, hash, and number.

`loyalty.publish_audience_version_command(versionId, expectedDefinitionSha256, idempotencyKey, correlationId)` permits owner/admin roles. It locks the stable audience, resolves exact accepted retries first, checks the reviewed hash and strict definition, supersedes the prior published version, and publishes atomically.

`loyalty.create_audience_snapshot_command(versionId, idempotencyKey, correlationId)` permits owner/admin/operator roles for a published version. It resolves exact accepted retries before rollout checks, obtains time from PostgreSQL, evaluates canonical facts, writes private membership evidence, and exposes only the snapshot ID, timestamp, and exact aggregate count.

Analyst and auditor roles remain read-only through tenant RLS. No authenticated role receives direct mutation privileges on audience tables.

## Rollout and compatibility

The `campaigns` entitlement gates new draft, publication, and snapshot work. Disabling it preserves definitions, completed snapshots, private evidence, audit history, and exact retries of already accepted commands. Campaign execution, capacity reservation, scheduling, control assignment, UI, and results are later M07 slices and must remain disabled until their own gates pass.

Audience contracts are additive. Existing V1/V2 programme evaluation and historical loyalty effects are unchanged.

## CampaignDefinitionV1

M07-S02 adds seven closed campaign behaviors: `bonus_points`, `purchase_multiplier`, `milestone`, `win_back`, `tier`, `referral`, and `limited_quantity`. Each behavior exposes only its reviewed trigger and points/programme-reward fields. Arbitrary event names, scripts, SQL, customer properties, and unmaterialized programme rewards fail at both contract and storage boundaries.

Every definition binds one completed inclusion snapshot and at most ten completed exclusion snapshots in the same organization/programme group. It also carries a global effect limit, a per-member limit, a hard maximum-points budget for every points-producing behavior, and a monetary liability ceiling with explicit ISO currency/precision for every programme-reward behavior. Limited rewards permit one effect per member. These are approval ceilings; S03 must reserve capacity atomically before any effect.

## Explicit schedule and control evidence

Schedules contain an IANA timezone, explicit-offset start/end instants, and matching local start/end evidence. TypeScript and PostgreSQL compare chronological instants and independently format each instant in the selected zone. Repeated fall-back time is accepted only with its chosen offset; a spring-gap local time, unknown zone, mismatch, reversed interval, or duration over 366 days fails closed.

Approval materializes the eligible inclusion-minus-exclusion wallet set and generates a private random salt. Wallets are ranked by salted SHA-256 evidence; the exact floor of the approved 0–9,000 basis-point ratio enters `control` and every remaining wallet enters `treatment`. Merchant reads expose only eligible/treatment/control counts and an aggregate hash. `loyalty_private.campaign_controls` and `loyalty_private.campaign_assignments` have no browser, anonymous, runtime, connector, or worker table grants.

## Campaign commands

- `create_campaign_draft_command` allows owner/admin authoring and stores one immutable version under a stable campaign code.
- `preview_campaign_version_command` allows owner/admin/operator preview of inclusion, exclusions, expected control/treatment counts, maximum effects, points budget, and liability without member identities.
- `approve_campaign_version_command` allows owner/admin approval only while the reviewed hash matches, the start remains future, the audience is nonempty, no accepted version overlaps, the entitlement is enabled, and private assignments reconcile in the same transaction.
- `pause_campaign_version_command` allows owner/admin/operator to stop accepted operational work.
- `cancel_campaign_version_command` allows owner/admin to terminate accepted policy with a bounded reason.

All commands derive tenant and actor from the live Auth session, use tenant-scoped request-hash idempotency, and append minimized audit evidence. Count, capacity, points, and liability values cross the RPC boundary as exact decimal strings, including a valid zero-effect empty preview; PostgreSQL retains native bigint authority internally. Exact retries return the original accepted outcome even after later pause/cancel or rollout disablement. Pause and cancellation are never commercially blocked. S02 creates no ledger/reward effect and does not activate schedules; production scheduling remains disabled until S03/S04 pass their atomic value gates.

## Atomic purchase execution

M07-S03 adds a private purchase execution boundary without changing the signed WooCommerce event contract. Inside the existing event transaction, the worker requests `get_purchase_campaign_context_v1`. PostgreSQL derives the active wallet, immutable treatment/control assignments, event-time schedule state, and exact remaining global/member/points capacity. The worker cannot choose tenant, campaign, assignment, counters, or schedule time.

The pure domain evaluator applies these rules:

- fixed campaign bonuses stack when their configured earning-rule selectors contributed;
- purchase multipliers compete with the selected programme multiplier by descending priority and stable namespace identity;
- only one multiplier is awarded;
- treatment candidates without effect/member/points headroom are recorded as `capacity_exhausted`;
- control candidates retain zero-value evidence; and
- suppressed multipliers retain zero-value evidence.

`commit_purchase_campaign_execution_v1` independently reconstructs the expected decisions and points from immutable definitions, baseline contribution evidence, assignments, and locked counters. It reserves all awarded campaign capacity before calling the existing ProgrammeDefinitionV2 award boundary. It then appends one campaign-attributed ledger award per awarded campaign, links each decision to the exact pending origin entry, commits its counters, and stores one immutable execution batch. Any error rolls back programme value, campaign value, counters, and evidence together.

The batch stores the original private candidate context. An exact retry receives and submits that context even after capacity is consumed or the campaign is paused, so it returns the original result without re-evaluating mutable headroom. A changed hash or resource identity fails closed.

## Reserved non-purchase capacity

`reserve_campaign_capacity_v1` is the S03 primitive for milestone, win-back, tier, referral, and limited-quantity triggers. It requires one treatment assignment and an open event-time schedule, derives points or `liabilityMinorPerEffect` from the accepted definition, and atomically enforces global effects, per-member effects, maximum points, and maximum liability. A reservation is either committed with a bounded downstream reference or released; terminal evidence cannot be rewritten.

S04 must combine canonical trigger verification, reservation, ledger/reward fulfilment, and completion in one transaction before any non-purchase schedule is activated. S03 does not start a scheduler, issue a programme reward, reverse a campaign award, or enable the managed rollout.

## Privileges and rollback

Campaign counters, candidate replay context, assignments, batches, effects, and allocations remain in `loyalty_private`, have RLS enabled, and have no direct grants to browser, runtime, connector, or worker roles. The worker receives only the four narrow context/reservation/completion/commit functions; internal arithmetic and table mutation remain private.

Rollout disablement may stop new context and reservation work. It must preserve exact retries, accepted batches, campaign-attributed ledger transactions, allocations, counters, refunds, reconciliation, history, and checkout independence. After value exists, schema rollback is forward-fix only.
