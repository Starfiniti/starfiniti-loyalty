# ADR-0079: Bridge the public experience from released V1 directly to complete V6

- Status: Accepted
- Date: 2026-08-28
- Supersedes: the application-fallback portions of ADR-0074, ADR-0075,
  ADR-0076, and ADR-0077
- Related modules: M03, M05, M06, M09

## Context

The public loyalty reader accumulated V2, V3, V4, and V5 fallbacks while the
advanced VIP, earning, reward, and referral projections were built on one
unmerged integration branch. Production `v0.1.11` exposes only the English V1
function. The deployment runbook applies every additive migration before one
new dashboard image. No released application can therefore encounter a
database that exposes only an intermediate V2-V5 projection.

Keeping those impossible application paths increased provider calls from two
to six, multiplied malformed-response behavior, and made a partial database
rollout look supported when it is not. The page also formatted purchase rates
and eligible-spend thresholds as EUR even though `ProgrammeDefinitionV2`
supports a published ISO currency and zero through six minor-unit digits.

The V2-V5 functions, contracts, migrations, and immutable evaluation behavior
remain valid database history and composition boundaries. This decision is
only about the application release bridge and the complete V6 display
contract.

## Alternatives

1. Retain every application fallback. This preserves hypothetical mixed states
   but tests and operates states that have never shipped and are absent from
   the approved rollout.
2. Change deployment to publish five sequential application images. This adds
   operational risk and elapsed rollout states without customer value.
3. Request V6 and fall directly to the released English V1 function only when
   V6 is genuinely absent. Keep V2-V5 SQL and contracts for composition and old
   clients, while rejecting every malformed or provider-error V6 response.

## Decision

Use option 3.

The Next.js server performs at most two RPCs. It requests
`loyalty.get_public_loyalty_experience_v6(uuid, uuid)` first. Only PostgREST
`PGRST202` or PostgreSQL `42883` permits one call to the released
`loyalty.get_public_loyalty_experience(uuid, uuid, text)` function with the
fixed English locale. Duplicate rows, malformed V6, provider errors, and
non-English V1 fail closed. V1 normalization remains conservative: referral
and exact reward details require account confirmation, stored value stays
excluded, and programme currency is `null` rather than guessed.

The complete V6 projection exposes `programmeCurrency` as either the exact
published `{ code, minorUnitDigits }` pair or `null` for the legacy bridge. The
database derives it from the same selected immutable programme version used by
the other catalogues. The browser formats base earning rates, VIP rates, and
eligible-spend thresholds with bigint-safe currency helpers. A legacy `null`
uses currency-neutral copy and never assumes EUR. The active formatter accepts
English only; legacy locale contracts remain readable historical interfaces.

## Security and reliability effects

- Browser input still supplies only public workspace and programme selectors;
  PostgreSQL derives tenant and published-version authority.
- The release bridge cannot silently downgrade malformed current data or turn
  a provider outage into stale public terms.
- At most two bounded anonymous RPCs reduce latency and failure surface.
- Currency code and precision are strict display evidence, not award,
  redemption, ledger, wallet, or checkout authority.
- V1-V5 functions, grants, contracts, migrations, and immutable programme
  effects remain unchanged for old clients and database composition.

## Rollout, verification, and rollback

Deploy all additive migrations, including the completed V6 signature, before
the dashboard image. Verify V6 with EUR, USD, and zero-decimal JPY fixtures;
V6-missing-to-V1 behavior; malformed/provider refusal; non-English V1 refusal;
and a maximum of two RPCs. Production remains behind the existing disabled M09
canary gate.

Rollback the application image to `v0.1.11`; leave additive V2-V6 functions in
place. If the V6 migration has not completed, the new image uses V1. Never drop
an intermediate function during mixed client operation, rewrite a published
programme, or change ledger, reservation, coupon, connector, or checkout state.
