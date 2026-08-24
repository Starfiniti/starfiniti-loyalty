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

Snapshots consider active customers with active wallets in the version's exact organization and programme group. Synchronous creation is limited to 100,000 candidates. One materialized cursor statement fixes the database-time anchor, bounded candidate set, balances, facts, tiers, and every member decision to one MVCC snapshot; a timestamp alone is not treated as read-consistency evidence. The caller cannot choose the tenant, programme group, member identities, observation values, or snapshot time.

## Merchant commands

All commands require an authenticated Supabase session and derive authorization from current organization membership. Selectors are public UUIDs; idempotency keys are tenant-scoped and request-hash-bound.

`loyalty.create_audience_draft_command(programmeId, definition, idempotencyKey, correlationId)` permits owner/admin roles. It validates the definition independently, checks the database-authoritative `campaigns` entitlement, serializes creation by stable audience code, and returns the immutable version ID, hash, and number.

`loyalty.publish_audience_version_command(versionId, expectedDefinitionSha256, idempotencyKey, correlationId)` permits owner/admin roles. It locks the stable audience, resolves exact accepted retries first, checks the reviewed hash and strict definition, supersedes the prior published version, and publishes atomically.

`loyalty.create_audience_snapshot_command(versionId, idempotencyKey, correlationId)` permits owner/admin/operator roles for a published version. It resolves exact accepted retries before rollout checks, obtains time from PostgreSQL, evaluates canonical facts, writes private membership evidence, and exposes only the snapshot ID, timestamp, and exact aggregate count.

Analyst and auditor roles remain read-only through tenant RLS. No authenticated role receives direct mutation privileges on audience tables.

## Rollout and compatibility

The `campaigns` entitlement gates new draft, publication, snapshot, purchase-context, and trigger-issue work. Disabling it preserves definitions, completed snapshots, private evidence, audit history, exact retries of already accepted commands, accepted trigger jobs, reversals, refunds, and customer value. It does not delete or compensate an ambiguous native outcome.

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
- `approve_campaign_version_command` allows owner/admin approval only while the reviewed hash matches, the start remains future, the audience is nonempty, no accepted version overlaps, the entitlement is enabled, any native reward has an active or rotating connection for the exact programme, and private assignments reconcile in the same transaction.
- `pause_campaign_version_command` allows owner/admin/operator to stop accepted operational work.
- `cancel_campaign_version_command` allows owner/admin to terminate accepted policy with a bounded reason.

All commands derive tenant and actor from the live Auth session, use tenant-scoped request-hash idempotency, and append minimized audit evidence. Count, capacity, points, and liability values cross the RPC boundary as exact decimal strings, including a valid zero-effect empty preview; PostgreSQL retains native bigint authority internally. Exact retries return the original accepted outcome even after later pause/cancel or rollout disablement. Pause and cancellation are never commercially blocked. S02 creates no ledger/reward effect and does not activate schedules; production scheduling remains disabled until S03/S04 pass their atomic value gates.

The worker calls `advance_campaign_lifecycle_v1(limit)` before campaign issue scheduling. PostgreSQL advances due `scheduled` versions to `active`, and ended `scheduled`, `active`, or `paused` versions to `completed`, in stable bounded `SKIP LOCKED` batches. The wrapper derives time from PostgreSQL and appends one private immutable lifecycle event per transition. Completion releases the accepted-version uniqueness boundary but never blocks delayed canonical in-window effects, refunds, reversals, or reconciliation, which continue to use immutable schedule/audit evidence.

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

`reserve_campaign_capacity_v1` is the capacity primitive for milestone, win-back, tier, referral, and limited-quantity triggers. It requires one treatment assignment and an open event-time schedule, derives points or `liabilityMinorPerEffect` from the accepted definition, and atomically enforces global effects, per-member effects, maximum points, and maximum liability. Hard monetary liability is available only for a V2 fixed-discount reward from the campaign's exact published programme; PostgreSQL binds per-effect face value, currency, and precision to the immutable reward at draft and approval boundaries. Percentage, free-shipping, and free-product rewards cannot claim a hard monetary campaign ceiling. A reservation is either committed with a bounded downstream reference or released; terminal evidence cannot be rewritten.

## Canonical trigger execution

M07-S04 appends private jobs only from database-owned tier qualification facts, tier decisions, referral issuance/compensation evidence, and immutable limited-campaign assignments. Milestone and win-back history is restricted to the campaign's exact programme even when another programme shares the same wallet group. Purchase campaign context is likewise bound to the exact immutable programme version supplied by the canonical evaluation transaction.

The worker may schedule at most 100 due limited assignments, claim at most 25 jobs per sweep, and lease each claim for 60 seconds. PostgreSQL recovers no more than the requested claim limit of expired leases, increments attempts only on rows actually claimed, stops after the tenth attempt, and retains exhausted jobs as `manual_review`. Deterministic SQL input/arithmetic/contract/authority failures move directly to manual review after their rolled-back first attempt; transient database failures alone remain retryable. The worker records only allowlisted safe codes, never raw database messages. The worker receives minimized public job/version IDs and cannot select or mutate private queues, assignments, counters, or source evidence directly.

`execute_campaign_trigger_job_v1(jobId, workerId)` verifies the owned lease, immutable evidence hash, source-bound programme/campaign/assignment, and event-time schedule before it atomically reserves capacity and records one of these outcomes:

- treatment points append an attributable award, immediate release at the canonical trigger instant, expiry derived from that same earned instant under the immutable programme policy, and committed capacity;
- native programme rewards create a campaign-funded reservation, internal control-to-reserved ledger entry, WooCommerce issue command, and committed capacity without debiting member available points;
- control and capacity-exhausted assignments append zero-value execution evidence; and
- canonical refunds/compensations cancel unleased work or append exactly one linked points reversal/native cancellation decision.

Campaign-funded native rewards use the existing WooCommerce state machine. Definitive pre-delivery cancellation compensates the internal funding entries exactly once. Issued rewards request native cancellation. Captured or ambiguous connector outcomes are never speculatively released or clawed back.

## Privileges and rollback

Campaign counters, candidate replay context, assignments, batches, effects, allocations, lifecycle events, trigger jobs, attempts, and executions remain in `loyalty_private`, have RLS enabled, and have no direct grants to browser, runtime, connector, or worker roles. The worker receives only narrow lifecycle, context, scheduling, claim, execution, retry, reservation, and completion functions; internal arithmetic and table mutation remain private.

Rollout disablement stops new issue context and trigger jobs while preserving accepted work and every reversal path. It must preserve exact retries, accepted batches/jobs, attempts, executions, campaign-attributed ledger transactions, reservations, connector commands, allocations, counters, refunds, reconciliation, history, and checkout independence. After value exists, schema rollback is forward-fix only.

## Merchant catalogue, operations, and results

The `/campaigns` merchant route is the complete M07 operating surface. It supports:

- allowlisted multi-condition audience authoring and editing as new immutable versions;
- audience publication and database-timed completed snapshots;
- all seven campaign behaviors with completed inclusion/exclusion snapshots, explicit IANA/local schedule evidence, control groups, member/effect caps, points budgets, and fixed-discount face-value liability ceilings;
- immutable campaign-version editing, preview, exact-hash approval, calendar inspection, pause, and cancellation; and
- exact aggregate capacity, points, liability, purchase, trigger, reversal, and manual-review results with visible metric definitions.

Authoring, new snapshots, preview, and approval follow the database-authoritative `campaigns` entitlement. Disabling rollout never hides existing catalogue history, accepted schedules, pause/cancel controls, canonical results, or manual-review counts.

`loyalty.get_campaign_results_v1(programmeId, limit)` accepts a public programme UUID and a 1–100 row limit. The function derives the current actor, tenant, internal programme, and allowed membership from Auth. It returns one strict `CampaignResultV1` JSON object per immutable version. Exact PostgreSQL integers remain decimal strings.

The projection exposes only public campaign/version metadata, aggregate assignment counts, aggregate capacity counters, purchase outcome counts, trigger job states, and trigger execution outcomes. It excludes assignment membership, customers, wallets, source references, raw evidence, retry errors, salts, actors, channel identifiers, and coupon material. Anonymous, application runtime, and worker roles cannot execute it and authenticated roles retain no direct private-table read.

Every displayed metric has a versioned canonical-source definition. Current outcome measures are labelled `influenced`; `incrementalityState` is always `not_measured` with the fixed explanation that directly attributed outcomes are not experimentally measured incremental lift. M10 must introduce a new evidence-backed metric contract before presenting causal incrementality.
