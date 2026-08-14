# ADR-0022: Explicit-instant campaign schedules and bound control assignment

- Status: Accepted
- Date: 2026-08-14
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M03, M04, M06, M07, M08, M10

## Context

Campaign approval commits future loyalty value to an audience, schedule, budget, and experimental policy. Merchant-local date/time alone is ambiguous during a daylight-saving fall-back and may not exist during a spring-forward gap. Resolving membership or control assignment later would also let audience changes, retries, or implementation changes alter who can receive value and invalidate experimental evidence.

Official Yotpo scheduling guidance makes the account timezone a first-class campaign input, while Smile documents bounded scheduled bonus campaigns and overlapping-campaign constraints. LoyaltyLion and Yotpo expose targeted multiplier, reward, win-back, milestone, tier, and referral campaign behavior. Starfiniti needs equivalent breadth without relying on a browser clock, mutable segment membership, hidden stacking, or unbounded liability.

## Decision

Create strict `CampaignDefinitionV1` contracts for bonus points, purchase multipliers, milestones, win-back, tier movement, referral qualification, and limited-quantity programme rewards. Every definition binds one completed inclusion snapshot, at most ten completed exclusion snapshots, an explicit behavior, a future schedule, a per-member effect limit, a global effect limit, the relevant points and/or monetary liability ceiling, and a 0–90% control ratio.

A schedule carries an IANA timezone, an offset-bearing start/end instant, and the corresponding local start/end text. TypeScript verifies that the instant formats to the supplied local evidence in the selected timezone; PostgreSQL independently performs the same mapping. The instant disambiguates a repeated fall-back hour. A nonexistent spring-gap local time, unsupported zone, reversed interval, mismatch, or duration beyond 366 days fails before storage.

Campaign definitions are immutable versions. Draft, preview, approval, pause, and cancellation commands accept only public resource selectors, exact definition hashes, idempotency keys, reasons where applicable, and correlation IDs. PostgreSQL derives organization, programme group, actor, snapshots, rewards, time, counts, and entitlement authority.

Approval requires a future start, a completed nonempty eligible audience, no other accepted version for the stable campaign, and a database-authoritative `campaigns` entitlement. In the same transaction PostgreSQL generates a private random salt and materializes one immutable wallet assignment after exclusions. A SHA-256 score assigns treatment or control according to the approved basis-point ratio. Public rows retain only reconciled aggregate counts and an aggregate assignment hash; salts and wallet membership stay in `loyalty_private` without browser/runtime grants.

Pause is an operator safety action; cancellation is owner/admin policy authority. Neither is blocked by later entitlement disablement. Exact retries return the originally accepted command outcome even after a later lifecycle transition. No S02 command executes a points/reward effect; S03/S04 must consume the accepted version and immutable assignments through a separately reviewed atomic boundary.

## Alternatives considered

1. Store merchant-local time and resolve it when a worker wakes. Rejected because DST rule changes, gaps, and overlaps can move or duplicate the execution window.
2. Store only a UTC instant. Rejected because it is unambiguous but does not prove that the reviewed merchant-local time and selected timezone matched that instant.
3. Re-evaluate the audience and randomly split control at each effect. Rejected because retries and changing facts would rewrite eligibility, budget, and experimental evidence.
4. Assign treatment/control in the browser. Rejected because the browser is not tenant, identity, time, or value authority and could target itself.
5. Bind explicit instants plus timezone/local evidence and materialize private deterministic assignments at approval. Accepted because review, retry, rollback, execution, and reporting can reconstruct one immutable decision.

## Security and integrity effects

- Exact-key TypeScript and PostgreSQL validators reject arbitrary JSON, SQL, caller-supplied members, browser time, unbounded integers, unsupported rewards, missing budgets, and cross-tenant snapshots/rewards.
- Owner/admin author and approve. Operator may preview and pause accepted work but cannot author, approve, or cancel value policy. Analyst/auditor access remains aggregate and read-only.
- Private salts and assignments have RLS enabled and no anonymous, authenticated, runtime, or worker table grants. A later executor receives a narrower function, not table access.
- One partial unique index prevents overlapping accepted versions for a stable campaign. Definition, audience, schedule, capacity, assignments, and hashes are immutable.
- Disabling `campaigns` blocks new drafts, previews, and approvals but preserves exact retries, pause/cancel, accepted work, private assignments, history, refunds, reconciliation, and checkout independence.

## Operations

Monitor validation failures by bounded code, draft-to-approval time, schedule lead time, eligible/excluded/treatment/control counts, assignment reconciliation, points/liability headroom, idempotency conflicts, pause/cancel latency, and attempted cross-tenant bindings. S03 must prove atomic capacity under concurrency before any scheduled version can become active.

Official references retained with ADR-0021:

- [Smile bonus-points campaigns](https://help.smile.io/en/articles/8802037-manage-a-bonus-points-campaign)
- [LoyaltyLion AI campaign types](https://help.loyaltylion.com/en/articles/13334624-ai-campaigns)
- [Yotpo campaign overview](https://support.yotpo.com/docs/loyalty-campaigns-overview)
- [Yotpo campaign scheduling](https://support.yotpo.com/docs/campaign-scheduling)

## Migration and rollback

Deploy additive contracts, tables, validators, and commands while managed `campaigns` remains disabled. Replay from a clean database; test direct RPC bypass, all seven behavior variants, DST overlap/gap, cross-tenant references, exact retries before/after rollback, private grants, immutable assignment reconciliation, and lifecycle roles.

Rollback may disable new drafts, previews, approvals, and future activation. It must not delete or hide accepted definitions, aggregate evidence, private assignments, command audit, effects, refunds, reconciliation, or customer history. After any approval, schema rollback is forward-fix only. Pause and cancel remain available even when rollout or billing disables new growth.
