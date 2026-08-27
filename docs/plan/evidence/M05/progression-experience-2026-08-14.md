# M05-S05 progression experience evidence

Date: 2026-08-14
Code commit: `06f1b4d`; security-surface test hardening: `6d1b337`
Status: complete; exact-head run `31759304542` passed

## Decision and competitive evidence

Official current Smile documentation distinguishes points/amount-spent milestones and lifetime/calendar reset behavior. Official LoyaltyLion documentation distinguishes tier progress from points balance/revenue and exposes the qualifying total, amount to go, lock-in date, qualifying window, and review date. ADR-0014 records the selected projection approach and rollback consequences.

- Smile: <https://help.smile.io/en/articles/4036321-understand-vip-tier-milestones>
- Smile benefits/perks: <https://help.smile.io/en/articles/4036320-vip-rewards-and-perks>
- LoyaltyLion progress: <https://help.loyaltylion.com/en/articles/9042359-customer-tier-progress>

## Implemented vertical slice

- `CustomerTierProgressV1` and `TierPerformanceV1` provide bounded exact-text contracts and reject inconsistent threshold/population evidence.
- Additive migration `20260814050000_tier_progression_experience.sql` rebuilds progress from immutable qualification facts and decision/membership history.
- Merchant customer progress requires live tenant membership; customer progress derives only active Auth links; aggregate performance exposes no identity.
- The VIP route replaces the advanced-policy gap with window/grace controls, multi-requirement AND/OR entry/retention/re-entry editing, multiplier/early-access/reward-benefit controls, deterministic simulation, and data-backed tier health.
- Legacy V1 editing remains available when advanced VIP is disabled. An already accepted advanced definition remains visible read-only after rollback.
- Merchant detail and hosted customer account show exact next/retention milestones, progress bars, review/reset timing, grace/override state, and immutable tier history while keeping available/expiring points visibly separate.

## Adversarial checks

- 19 new focused pgTAP assertions cover function grants, private-helper denial, tenant authorization, Auth-derived scope, revocation, exact next/re-entry metrics, bounded history, aggregate performance, and omission of balances/private evidence. Existing global SECURITY DEFINER allowlists independently recognize only the three reviewed public projections.
- Contract tests cover bigint-safe values and reject fabricated remaining/matched and population state.
- Dashboard/contract typechecks, lint, 287 unit tests, production Next.js build, migration validator, architecture validator, accessibility validator, targeted formatting, and diff checks passed locally.
- Exact-head GitHub run `31759304542` passed all seven jobs: baseline, clean 35-migration replay, all 32 pgTAP files with 1,491 assertions including 141 focused VIP assertions, both concurrency probes, both production images, and all four minimum/current HPOS/legacy WooCommerce runtime cells.

## Real browser review

A temporary production-build fixture rendered the actual `MerchantShell`, `VipTiersEditor`, and `TierProgress` at 1440 by 1000 and 390 by 844. It was removed after verification.

Verified interactions:

- switched rolling to calendar-year qualification and back;
- added a second entry requirement, selected order-count qualification, and edited its exact minimum;
- changed the simulator to 60,000 eligible minor units and nine orders and observed deterministic Rose-to-Icon upgrade output;
- rendered separate spendable points, qualifying spend, retention review, and expiry evidence;
- rendered next milestone, retention requirements, exact progress bars, and immutable tier history;
- opened and closed mobile navigation and activated the English skip link;
- verified zero horizontal overflow in both the document and scrollable merchant canvas.

The component under test produced no console warning, console error, or page error. Sixteen expected RSC prefetch failures for unrelated authenticated routes were identified by exact URL and excluded because the isolated fixture intentionally had no Supabase/Auth environment; the fixture route itself returned 200 and all tested interactions remained clean.

Screenshots were visually inspected from:

- `C:\Users\dejan\AppData\Local\Temp\starfiniti-m05-s05-desktop.png`
- `C:\Users\dejan\AppData\Local\Temp\starfiniti-m05-s05-mobile.png`

## Slice closure

M05-S05 is complete. M05 retains S06 shadow comparison, disabled deployment, Starfiniti canary, reconciliation, and score.
