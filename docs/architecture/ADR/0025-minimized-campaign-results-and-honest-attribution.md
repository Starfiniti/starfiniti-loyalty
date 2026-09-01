# ADR-0025: Minimized campaign results and honest attribution

- Status: Accepted
- Date: 2026-08-24
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M07, M10

## Context

M07 campaign execution evidence is deliberately private. Treatment/control assignments, source references, retry errors, member identities, salts, and canonical evidence cannot be granted to browser sessions merely to render a dashboard. Merchants still need a complete workflow: create/edit audience and campaign versions, freeze membership, preview liability, approve schedules, pause/cancel accepted work, and inspect exact operational and influenced outcomes.

Directly attributed campaign outcomes are not causal proof. Calling an awarded effect or influenced order “incremental revenue” would overstate what the current assignment and execution facts establish. M10 may later introduce experiment estimators, but M07 must not invent them.

Rollout disablement adds a second constraint. It may block new authoring, snapshots, previews, approvals, and issue work, but it cannot hide accepted schedules, results, manual-review health, or pause/cancel controls.

## Decision

Expose one bounded Auth-derived aggregate read, `loyalty.get_campaign_results_v1(programmeId, limit)`. PostgreSQL resolves the programme and live organization membership, accepts all five current merchant roles for inspection, limits output to 1–100 immutable campaign versions, and returns exact bigint values as decimal text.

The projection contains only:

- public programme, campaign, and campaign-version identities;
- immutable campaign name/code/version, lifecycle, and schedule;
- approved aggregate eligible/treatment/control counts;
- effect, points, and liability ceilings plus reserved/committed counters;
- aggregate purchase outcome, trigger-job state, and trigger-execution outcome counts; and
- a fixed measurement boundary: `classification = influenced` and `incrementalityState = not_measured`.

It does not return member rows, treatment membership, source references, raw evidence, salts, errors, actors, channel identifiers, coupon material, or customer data. Private tables retain RLS and no browser or worker table grants.

The merchant route uses existing tenant-RLS public audience/campaign versions for catalogue history and the aggregate RPC independently for results. Either read may fail without fabricating data or hiding the other healthy surface. Owner/admin roles author, publish, and approve. Owner/admin/operator roles may snapshot, preview, and pause according to the existing commands. Owner/admin roles cancel. Analyst/auditor roles inspect only.

The UI provides real controls for all seven supported behaviors, allowlisted multi-condition audiences, immutable-version editing, completed inclusion/exclusion snapshots, explicit IANA local-time evidence, effect/member/points/liability/control bounds, preview, approval, calendar, pause/cancel, canonical health, and metric definitions. Inert placeholder controls are prohibited.

## Alternatives considered

1. Grant authenticated users `SELECT` on private execution tables and aggregate in Next.js. Rejected because browser sessions could enumerate identities, assignments, source references, errors, and evidence outside the minimized contract.
2. Materialize a mutable analytics table from application code. Rejected because it creates a second truth source and retry/reconciliation problem before measured load requires one.
3. Report only public campaign-version counters. Rejected because merchants would miss retry exhaustion, outcome mix, and reversal health needed to operate accepted work.
4. Label attributed effects as incremental lift. Rejected because treatment/control assignment alone is not an estimator and current facts do not implement an experimental metric definition.
5. Use a database-authoritative minimized aggregate projection with explicit metric definitions. Accepted because exact results remain reconcilable, tenant scoped, and honest without weakening private evidence.

## Security and integrity effects

- The function derives actor and tenant from the Supabase Auth session and checks live membership; callers cannot choose an organization.
- The exact programme binding prevents campaigns from another programme in the same wallet group appearing in results.
- Anonymous, runtime, and worker execution is revoked. Authenticated callers receive no direct private-table privilege.
- Exact counters remain text through the public contract and are checked for assignment and capacity reconciliation before rendering.
- Metric definitions name the canonical source and distinguish operational from influenced measures. The contract rejects any claim that incrementality is measured.
- Feature disablement cannot remove accepted operations or results; it only disables controls whose existing database command requires the entitlement.

## Operations

Monitor projection latency, malformed-result failures, capacity/counter reconciliation, manual-review jobs, and public catalogue/result availability independently. The UI must show a truthful unavailable state rather than zeros when the aggregate read fails.

The database remains the analytical source until M10 load evidence proves a separate store is necessary. Any later incremental metric requires a versioned metric definition, experiment population, estimator, exclusion rules, and reconciliation evidence; it cannot replace this attributed result contract silently.

Official references retained for this decision:

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [PostgreSQL aggregate functions](https://www.postgresql.org/docs/current/functions-aggregate.html)

## Migration and rollback

Deploy the additive function and supporting index with the `campaigns` entitlement disabled. Replay from an empty database, exercise owner/operator/analyst/auditor reads, unrelated-tenant denial, exact-programme isolation, bounded limits, malformed-result rejection, and responsive merchant states before canary approval.

Rollback may revoke the aggregate function and hide only the new results panel. It must preserve public audience/campaign versions, private assignments, jobs, executions, counters, ledger effects, reward reservations, audit, pause/cancel controls, refunds, and reconciliation. After merchants rely on the contract, prefer a versioned forward fix rather than changing V1 semantics.
