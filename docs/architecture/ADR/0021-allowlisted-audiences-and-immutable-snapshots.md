# ADR-0021: Allowlisted audiences and immutable snapshots

- Status: Accepted
- Date: 2026-08-14
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M03, M04, M05, M06, M07, M09, M10

## Context

Campaigns and segment-restricted rewards need authoritative customer eligibility. The current programme contract already reserves `segmentCodes`, but the worker deliberately supplies an empty list and V2 reward publication rejects every segment selector. Accepting browser tags, WordPress customer metadata, arbitrary merchant SQL, or current segment membership at effect time would let an untrusted or mutable source control loyalty value and rewrite historical explanations.

Current official competitor documentation shows the expected merchant value but also exposes useful constraints. Yotpo describes dynamic condition-based segments and targeted time-bound campaigns; Smile supports scheduled purchase multipliers but limits overlap and duration; Yotpo earning-rule scheduling uses an explicit account timezone; and LoyaltyLion exposes targeted multiplier and reward-discounting campaigns. Starfiniti needs comparable targeting and scheduling without inheriting ambiguous stacking, timezone drift, or mutable historical membership.

Starfiniti already has canonical active customers and wallets, current ledger balances, immutable tier-qualification facts for eligible spend, earned points, paid-order count, referrals, and verified actions, plus current tier intervals. These facts are sufficient for the first safe audience catalogue. They do not support arbitrary demographic or engagement claims.

## Decision

Create a strict `AudienceDefinitionV1` contract with one stable code, descriptive metadata, `all` or `any` matching, and at most 20 allowlisted conditions. The initial catalogue supports current available/pending points, lifetime or rolling eligible spend, earned points, paid-order count, referral count, verified-action count, customer age, days since the last paid order, and current tier. Verified-action conditions may select bounded canonical activity codes. A customer with no paid order has a null recency value and never matches an inactivity-duration condition; merchants can target never-purchased members explicitly with lifetime order count equal to zero.

Store definitions as immutable versions. Publication supersedes the prior published definition without editing it. Build an immutable audience snapshot from one published definition using the database clock, live tenant scope, active customer/wallet state, and only facts recorded by the snapshot boundary. The public snapshot command accepts an audience-version resource selector, idempotency key, and correlation ID; it cannot supply organization, customer, member list, metric totals, evaluation time, or count.

Persist included customer IDs only in a private snapshot-members table. Each member row retains the deterministic condition results and observed values used at inclusion. Public and merchant read models return definitions, counts, hashes, state, and bounded operational evidence, never the member identity list. Later campaign approval binds one immutable snapshot ID; audience edits or customer changes cannot alter accepted campaign eligibility.

Keep the pure TypeScript evaluator and PostgreSQL evaluator semantically identical. Both use exact bigint comparisons, normalized rolling-day boundaries, explicit null recency, sorted activity-code identity, and the same `all`/`any` rule. PostgreSQL independently validates stored JSON and recomputes every metric from canonical facts before snapshot insertion.

## Alternatives considered

1. Allow merchant-authored SQL. Rejected because it is not safely portable, reviewable, tenant-bounded, or compatible with stable public contracts.
2. Re-evaluate a dynamic segment whenever an order or campaign effect occurs. Rejected because later customer/fact changes could change historical eligibility and make budgets, control groups, and explanations unreconstructable.
3. Accept WooCommerce tags or browser-supplied segment codes on earning events. Rejected because connector/customer metadata is not tenant or value authority and can be replayed or forged.
4. Store copied customer profiles in each snapshot. Rejected because campaign execution needs an internal customer key and condition evidence, not duplicated PII.
5. Version definitions and bind campaign value to an immutable database-generated membership snapshot. Accepted because authoring remains flexible while value, audit, rollback, and historical explanation remain deterministic.

## Security and integrity effects

- Every exposed table uses RLS and explicit grants; private membership/evaluation tables remain unreachable to browser, anonymous, runtime, and connector roles.
- Owner/admin commands derive organization and programme-group authority from the live Auth membership. Analysts and auditors receive read-only aggregate evidence; operators may inspect and run already-approved work but cannot author value policy. The marketer role remains deferred to the M13 role model.
- The `campaigns` entitlement blocks new definitions, publication, and snapshots. Disabling it never deletes definitions, snapshots, accepted campaign work, ledger effects, refunds, reconciliation, history, or exports.
- Definition size, condition count, code arrays, rolling windows, snapshot members, and public response size are bounded. No condition can access identity, email, address, payment, device, network, or arbitrary JSON.
- Snapshot insertion uses a transaction-scoped audience lock and immutable idempotency evidence. Concurrent identical commands create one snapshot; conflicting payload reuse fails.

## Operations

Monitor definition-validation errors, preview/snapshot duration, candidate/member counts, null-recency counts, snapshot hash mismatches, tenant denials, idempotency conflicts, and evaluator parity. Before canary, measure the supported candidate envelope and add a leased batch builder if a synchronous bounded snapshot cannot meet the declared capacity target.

Official references used for this decision:

- [Smile bonus-points campaigns](https://help.smile.io/en/articles/8802037-manage-a-bonus-points-campaign)
- [LoyaltyLion AI campaign types](https://help.loyaltylion.com/en/articles/13334624-ai-campaigns)
- [Yotpo segment overview](https://support.yotpo.com/docs/about-lists-segments)
- [Yotpo campaign overview](https://support.yotpo.com/docs/loyalty-campaigns-overview)
- [Yotpo earning-rule scheduling and timezone behavior](https://support.yotpo.com/docs/campaign-scheduling)
- [Supabase Data API grants and RLS](https://supabase.com/docs/guides/api/securing-your-api)

## Migration and rollback

Deploy additive contracts, tables, validators, and commands while `campaigns` remains disabled for managed tenants. Verify contract/PostgreSQL parity, direct-RPC bypass, RLS, cross-tenant denial, duplicate/conflict behavior, rolling boundaries, null recency, and two-session snapshot creation before enabling a pilot.

Rollback may disable new audience authoring and hide the merchant surface. It must preserve immutable audience versions, snapshots, private member evidence, accepted campaign bindings, ledger value, refunds, reconciliation, customer history, and checkout independence. Schema rollback is forward-fix only after any snapshot has been accepted by a campaign.
