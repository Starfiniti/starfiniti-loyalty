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
