# M06-S03 give/get ledger evidence - 2026-08-14

## Hypothesis and target

A cooled qualified referral can issue the promised advocate and friend points exactly once, remain recoverable across worker failure or rollout disablement, and reverse both sides exactly once from a canonical refund without a half-issued or half-compensated state.

The slice target is one bounded leased job per eligible attribution, one atomic two-sided issuance, historical expiry lots and tier facts, ten-attempt manual-review exhaustion, and one atomic two-sided refund compensation.

## Architecture

- ADR-0018 selects deterministic `FOR UPDATE SKIP LOCKED` leases plus one PostgreSQL issue/compensation transaction over an unleased sweep or independent worker awards.
- An eligible cooling transition creates one private job at the immutable event-time deadline. Existing cooling rows are backfilled without value movement.
- PostgreSQL derives the attribution, original policy/version, both customer wallets, points, qualification fact, canonical event, and historical expiry policy. The worker supplies only a public job selector and active lease identity.
- One issue transaction creates both evaluation/award/release/lot/tier chains, one immutable issuance, `cooling -> qualified`, and completed attempt evidence.
- A canonical refund shares the same attribution advisory lock. It cancels value-neutral work or creates both ledger/tier reversals and one immutable compensation before `qualified -> reversed`.
- The commerce refund worker wraps referral compensation and any ordinary purchase reversal in one outer transaction.
- Disabling `referrals` does not block already accepted jobs. The tenth failed or expired lease becomes nonclaimable `manual_review`; stored errors are generic bounded codes.

## Adversarial coverage

The focused pgTAP extension covers worker/browser privileges, private RLS, immutability, event-time due work, rollout disablement after acceptance, exclusive lease ownership, two award/release pairs, exact wallets/lots/expiry/tier facts, state ordering, acknowledgement replay, two-sided refund compensation, lot/balance restoration, tier reversal, and refund replay.

Worker tests cover bounded result parsing, active issue, generic error persistence, tenth-attempt manual review, malformed claim rejection, and one outer refund transaction. Existing purchase, refund, tier, expiry, connector, and WooCommerce tests remain in the repository gate.

## Local verification

- Worker tests: 21 passed.
- Worker typecheck: passed.
- `npm run db:validate`: 39 migrations and 34 pgTAP files passed static validation.
- `npm run architecture:validate`: 8 models and 11 accepted decisions passed.
- `git diff --check`: passed.

## Exact-head verification

Exact-head run `31766887239` passed all seven jobs:

- baseline and both production images;
- a clean replay of 39 migrations;
- all 34 pgTAP files with 1,635 assertions, including 86 focused referral qualification, cooling, issuance, compensation, tenancy, immutability, and retry assertions;
- ledger/programme, reward-capacity, and dedicated two-worker referral-reward concurrency probes; and
- minimum/current WordPress and WooCommerce with HPOS and legacy storage.

Earlier exact-head failures were deterministic test-gate findings: ambiguous SQL selectors, historical entitlement fixture timing, and replacement of the wrong auto-named tier-fact constraint. Each was corrected at its source before the passing run; no failing result was overridden.

## Rollback and open limitations

Rollback may disable new policy/link/attribution entry or stop claims, but it cannot delete or hide accepted jobs, immutable ledger/tier facts, issuance, compensation, or transition history. Forward fixes resume accepted work with the same identity.

Merchant fraud-review commands and customer/merchant progress/funnel views remain M06-S04/S05. Disabled deployment, browser evidence, Starfiniti canary, reconciliation, and module scoring remain open.
