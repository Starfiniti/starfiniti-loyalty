# ADR-0030: Bind campaign selectors to the published programme

- Status: Accepted
- Date: 2026-08-24
- Decision owners: Starfiniti Loyalty engineering
- Related modules: M03, M05, M07

## Context

Purchase campaigns select earning-rule codes and tier campaigns select tier
codes. The first merchant builder rendered those fields as free text and
seeded new drafts with developer-specific `purchase-base`, `rose`, and `bloom`
placeholders. PostgreSQL validated only code syntax. A merchant or direct RPC
caller could therefore create and approve a campaign whose selectors did not
exist in its exact programme. The campaign remained valid-looking but could
never award value or react to a tier transition.

A later programme publication could also remove a selector used by an already
accepted campaign. That would turn a scheduled or active campaign into a
silent no-op without changing its immutable definition or merchant-visible
status.

## Decision

The current published programme is the authoring and acceptance authority:

- the merchant catalogue reads enabled purchase rules and tiers from the exact
  published programme version;
- audience and campaign builders render those values as selectors rather than
  accepting arbitrary campaign rule/tier text;
- blank drafts use the first real published option, never a developer or
  locale-specific code, and schedules default to portable `UTC` while still
  accepting any validated IANA zone;
- PostgreSQL independently requires every purchase campaign selector to be an
  enabled purchase rule and every tier campaign selector to be a tier in the
  exact published programme at draft insertion and approval; and
- publishing or activating a new programme version fails atomically if it
  would remove a selector used by a scheduled, active, or paused campaign.

Campaign approval and programme publication serialize on the exact stable
programme row before the approval transition is accepted. Whichever operation
wins, the later operation observes and validates against the committed
programme/campaign state; a concurrent change cannot pass both guards against
different published versions.

Completed and cancelled campaign history does not constrain future programme
versions. Immutable campaign templates retain their original selectors for
inspection, but a new version cannot be accepted until its selectors match
the current programme.

## Alternatives considered

1. Keep free-text selectors and warn only in React. Rejected because direct RPC
   callers bypass React and a warning does not stop a zero-value campaign.
2. Accept any syntactically valid stable code. Rejected because syntax is not
   authority and future programme changes can silently invalidate accepted
   work.
3. Copy rule and tier behavior into each campaign. Rejected because it creates
   a second programme evaluator and weakens immutable source attribution.
4. Bind campaigns to one immutable programme version forever. Deferred because
   purchase campaigns intentionally observe canonical contributions from the
   live published version; stable selectors plus a publication compatibility
   guard preserve that behavior without duplicating programme policy.
5. Use the published programme catalogue plus independent database guards.
   Accepted as the smallest fail-closed boundary.

## Security and integrity effects

- Browser input supplies only selectors already projected through tenant RLS;
  PostgreSQL still derives organization, programme, version, and authority.
- Direct authenticated RPC calls cannot introduce unknown, disabled,
  non-purchase, cross-programme, or stale selector codes.
- Programme publication and activation roll back status, materialization, and
  supersession together when an accepted campaign would be broken.
- Existing accepted assignments, effects, ledger value, refunds, reversals,
  manual review, and checkout behavior are unchanged.

## Operations

Monitor campaign draft/approval failures and programme publication failures by
safe selector error code. The canary must author rule- and tier-selected
campaigns, reject unknown selectors through the direct RPC boundary, attempt a
programme change that removes an accepted selector, and prove the old
programme remains published with no partial materialization.

## Migration and rollback

Deploy the server read model, selector UI, private validators, and publication
guard while campaigns remain disabled. There is no production accepted
campaign to backfill.

Rollback may hide new authoring and stop new campaign approval/programme
publication while preserving all accepted definitions, assignments, effects,
ledger entries, jobs, reservations, and reconciliation. Do not weaken the
database guard after a campaign is accepted; forward-fix incompatible
programme or campaign drafts instead.

## References reviewed

- [PostgreSQL 17 explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html),
  reviewed 2026-08-24: conflicting `FOR UPDATE` row locks wait until the
  owning transaction completes and are held through transaction end.
- [PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html),
  reviewed 2026-08-24: under the default read-committed isolation, a later
  statement observes a concurrent transaction after waiting for its row lock.
- [Supabase breaking-change changelog](https://supabase.com/changelog?types=breaking-change),
  reviewed 2026-08-24: no current change alters this PostgreSQL locking
  boundary; the repository's pinned self-hosted PostgreSQL 17 runtime remains
  the verification authority.
