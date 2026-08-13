# ADR-0011: Version earning rules and serialize member-cap accounting

- Status: Accepted
- Date: 2026-08-13

## Context

M03 adds conditional purchase earning, non-purchase activities, multipliers, fixed bonuses, event caps, and member-period caps. The existing V1 evaluator and stored evidence are immutable. A live V2 rule must not reinterpret a V1 award, depend on array order, accept browser authority, or exceed a member cap when two events run concurrently.

WooCommerce delivers orders, refunds, customers, and products as signed resource facts. Its official webhook contract signs the exact JSON request body with HMAC-SHA256 and identifies deliveries separately. That is suitable for durable ingestion, but the loyalty programme—not the connector—must remain value authority. Custom merchant activity needs the same bounded signed/replay-protected shape and must never accept a browser assertion as proof.

## Alternatives

1. **Extend V1 in place and evaluate draft JSON directly.** This minimizes new types and tables, but changes historical meaning, makes publication/runtime drift likely, and provides no relational evidence that a reviewed rule was materialized.
2. **Add ProgrammeDefinitionV2 beside V1, materialize immutable normalized rules, and run one shared pure evaluator for simulation and live facts.** This keeps compatibility explicit and gives publication, workers, and operations one stable rule identity.
3. **Delegate rules and caps to a third-party promotion engine.** This accelerates breadth but introduces a synchronous external authority, weakens self-hosting, and makes immutable replay and exact ledger reconciliation provider-dependent.

For member caps, a worker-side read followed by an award is insufficient: concurrent workers can read the same remaining allowance. Optimistic retries would be safe only if every effect were recomputed after conflict, which is more complex and creates a larger failure surface than serializing the small value-bearing boundary.

## Decision

Use option 2. `ProgrammeDefinitionV2` is a strict, versioned contract. It retains the V1 tier/reward surface, requires exactly one enabled purchase base rate, selects only the highest-priority eligible multiplier with rule code as the deterministic tie-breaker, and adds only explicitly stackable fixed bonuses. Rules use allowlisted selectors, half-open UTC intervals, explicit purchase exclusions, exact decimal integer strings, and bounded event/member caps.

The database independently validates V2 at draft insertion and again at materialization. `programme.v2` must resolve enabled for the organization from PostgreSQL; Auth claims and browser state cannot enable it. Publication and scheduling materialize immutable `programme_earning_rules`. V1 publication and evaluation remain unchanged.

Live processing acquires a transaction-scoped organization/programme-group/customer advisory lock before reading immutable per-rule usage, evaluates with the same pure function used by simulation, and appends evaluation, per-rule usage, and ledger evidence in one transaction. The usage read excludes a prior effect with the same evaluation idempotency key, so an exact retry reconstructs its original result instead of consuming its own cap. Cap windows use UTC until the campaign/timezone module introduces an explicit programme timezone contract. A new rule code starts new member-cap identity; keeping a code across programme versions preserves accumulated usage.

WooCommerce cumulative order facts include product-line and shipping, tax, and fee refund evidence. V2 carries those values as exact integer strings and uses the immutable original programme when calculating proportional cumulative reversal. Missing component fields from an older connector parse as zero, preserving the V1 delivery contract while current connectors send the complete evidence.

Custom activity and birthday are accepted only through the bounded signed Merchant Activity server endpoint with timestamp, nonce, body hash, key version, and idempotent source event. Account creation and verified product review originate in the WooCommerce connector or an explicitly provisioned trusted merchant source; referral originates in M06. None can be self-reported by browser code. ADR-0012 defines the shared canonical-ingestion boundary.

## Security and integrity effects

- Unknown definition fields and malformed rule combinations fail closed in both Zod and PostgreSQL.
- Store-credit payments remain excluded even though stored-value rewards are outside scope.
- Browser roles cannot insert, update, delete, or materialize earning rules.
- Deterministic rule order makes JSON/rule/line reordering value-neutral.
- Immutable evaluation and rule-usage rows preserve the exact historical programme version and explanation.
- Serialized usage plus a unique event/rule fence prevents concurrent cap oversubscription and duplicate effects.

## Operations

Operations exposes bounded queue state and immutable evaluation references without raw facts, customer identifiers, or signing material. Alerts cover dead-letter effects, cap-command failures, and canary reconciliation. The V2 worker remains separately credentialed from signed ingress and the browser.

## Migration and rollback

Deploy additive tables and readers first. Keep live V2 processing disabled except for the named Starfiniti tenant canary. Publish a controlled V2 version only after simulator/live parity, worker, API, database, connector, and browser evidence pass. Rollback disables new V2 publication and new activity acceptance through the entitlement record; it does not delete V2 definitions, block refunds, or reinterpret accepted awards. Existing V2 versions remain readable and pinned evaluation code remains deployable for reconciliation.
