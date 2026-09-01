# ADR-0017: Historical referral qualification with value-neutral cooling

- Status: Accepted
- Date: 2026-08-14
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M06, M10

## Context

An attribution can be captured at `processing` and qualify at `completed`, with a programme publication or entitlement rollback between those events. Qualification therefore cannot use whichever programme happens to be live when a delayed status event arrives. It must preserve the attributed policy, purchase exclusions, minimum spend, event time, and new-customer evidence without issuing points before the configured return-cooling period ends.

The worker already owns the shared exact V2 evaluator, while PostgreSQL owns tenant, customer, programme, attribution, status, idempotency, and value authority. Copying the purchase evaluator into SQL would create a second rules engine. Accepting a browser-computed amount would violate the command boundary.

## Decision

Each attribution retains its original immutable programme version. For a signed canonical WooCommerce status event, a private worker function derives the matching attribution, original programme version, current state, and configured qualifying status. It accepts no tenant, customer, programme, order, attribution, or reward selector from the worker.

The worker reloads that historical V2 version, evaluates the signed order with the same pure purchase evaluator used for live awards, and submits bounded hashes plus the strict evaluation document. PostgreSQL verifies the canonical event identity, order status, event identifier, event time, result shape, bigint bounds, and attribution scope before storing an immutable `referral_qualification` programme evaluation.

PostgreSQL independently derives whether the customer had an earlier paid order on the same connection, compares exact eligible spend with the immutable minimum, and appends one decision:

- eligible captured attribution -> `cooling` until canonical event time plus the configured days;
- below-minimum or returning customer -> `rejected` with a deterministic reason;
- eligible `pending_review` attribution -> immutable `review_held` evidence with no state or value bypass.

Qualification and cooling create no ledger transaction. A signed refund for the source order conservatively moves a value-neutral captured, review-held, or cooling attribution to `rejected`. If rewards have already reached `qualified`, the refund boundary returns `compensation_required`; M06-S03 must reverse both ledger effects atomically before appending the terminal referral transition.

Rollout entitlement controls new policy publication, links, and attribution. It does not block qualification, refund rejection, inspection, or later compensation for already accepted attribution, so rollback cannot strand historical customer value.

## Alternatives considered

1. Evaluate against the currently published programme. Rejected because delayed events would change meaning after publication and could make replay order affect qualification.
2. Reimplement purchase exclusions and eligible spend in PostgreSQL. Rejected because two rules engines would drift from simulator and live award behavior.
3. Accept a browser or connector eligible-spend amount. Rejected because untrusted clients do not hold programme or value authority.
4. Store the worker's full evaluation without database checks. Rejected because canonical event, version, status, time, and bigint boundaries still require independent enforcement.
5. Store a bounded worker evaluation against the database-derived historical context, then derive new-customer and state transitions in PostgreSQL. Accepted because it reuses one evaluator while retaining tenant, state, and value authority in the database.

## Security and integrity effects

- Only `loyalty_worker` can request or record qualification context; browser roles have neither function nor table access.
- Historical programme version, attribution, customer, source order, status, and cooling deadline are database-derived.
- One attribution, one canonical qualification event, and one immutable evaluation are enforced by unique constraints and an attribution-scoped advisory lock.
- Status mismatch remains pending. Deterministic failures cannot be overridden by a risk-review decision.
- No points, reservation, coupon, or other value exists during qualification and cooling.
- Raw identity and risk evidence remain outside qualification facts.

## Operations

Monitor status-pending age, attribution-to-qualification delay, cooling backlog, deterministic rejection counts, review-held age, and refund rejection/compensation outcomes. A duplicate or delayed event must resolve to the existing fact or terminal state without another transition.

## Migration and rollback

Deploy the additive evaluation kind, private qualification table, worker-only functions, and worker integration while `referrals` remains disabled. Existing programmes without a referral policy are unaffected.

Rollback disables new referral publication and attribution but continues processing already accepted contexts. Immutable evaluations, qualification facts, cooling deadlines, transitions, and later ledger effects are retained. Schema removal is a forward migration only after every accepted case is terminal and reconciled.
