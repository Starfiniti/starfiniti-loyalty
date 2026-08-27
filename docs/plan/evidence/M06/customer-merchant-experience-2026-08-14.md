# M06-S05 customer and merchant experience evidence - 2026-08-14

## Hypothesis and target

Customers can share one opaque referral link and understand give/get qualification, progress, and history without seeing a friend's identity. Merchants can inspect a useful funnel, advocate performance, immutable outcomes, and the protected review queue without fabricated share, click, signup, revenue, or acquisition metrics.

The target is an Auth-derived customer projection with no authority selector, a tenant-derived merchant projection over canonical facts, strict reconciled contracts, independent outage boundaries, and responsive keyboard-accessible production UI.

## Architecture and product evidence

- ADR-0020 compares current official Smile, LoyaltyLion, and Yotpo referral experiences and selects separate customer and merchant projections over expanding the stable balance contract, raw-table reads, or forgeable browser analytics.
- `get_my_referral_experiences_v1()` derives customer, tenant, programme, published policy, rollout, advocate, counts, and at most 20 identity-free history rows from the live Auth subject. It accepts no tenant, customer, programme, advocate, or friend selector.
- `get_referral_dashboard_v1(programmeId, lookbackDays)` derives tenant scope from live membership and reconciles active advocates, current outcomes, two-sided issued points, top advocates, and recent canonical referrals.
- Customer copy and native-share actions progressively enhance a selectable HTTPS URL. A paused or disabled programme removes sharing while preserving history.
- Each history row uses its attribution's immutable historical policy amount, not the currently published policy, and labels potential, pending, issued, reversed, and no-value outcomes explicitly.
- The referral panel fails closed independently of balances, rewards, tier progress, export, and accepted value. Merchant performance and review reads also fail independently, with explicit unavailable states instead of false zeroes or a blank page.
- The merchant view explicitly documents its metric boundary: no observed canonical fact means no displayed shares, clicks, signups, influenced revenue, or CAC.

## Adversarial and browser coverage

The 32 focused pgTAP assertions cover no-selector customer isolation, tenant roles, count reconciliation, bounded history, identity minimization, historical policy preservation, rollout pause, active/disabled sharing, fact-sourced merchant totals, unsupported metrics, and cross-tenant denial. Contract and server tests reject malformed URLs, unreconciled counts, invalid state/point combinations, malformed merchant facts, and preserve unrelated loyalty reads during referral projection outages.

A temporary production-build fixture used the real customer panel, merchant shell, funnel, history, and review queue, then was removed before handoff. Browser review covered 1440 by 1000 and 390 by 844 layouts; landmark and heading snapshots; skip link and visible focus; copy success and native-share fallback; desktop and mobile navigation; 606-pixel table containment inside a 338-pixel horizontal scroller; no page-level horizontal overflow; the lower mobile review form; and zero console warnings or errors. The review found and fixed missing spaces in the give/get explanation before final build verification.

## Verification

Exact-head run `31770764870` passed all seven jobs:

- the complete repository baseline and both production images;
- a clean replay of 41 migrations;
- all 35 pgTAP files with 1,700 assertions, including 151 focused referral assertions;
- ledger/programme, reward-capacity, and two-worker referral concurrency probes;
- 126 dashboard tests, 136 contract tests, 14 accepted ADRs, and a production build containing `/account/loyalty` and `/referrals`; and
- minimum/current WordPress and WooCommerce with HPOS and legacy storage.

Local verification passed the same dashboard tests, dashboard typecheck, two production builds, strict contract tests, static migration validation, architecture validation, and `git diff --check`.

## Rollback and open limitations

Rollback may pause new links and attribution or hide the new reporting surface. It must preserve customer history, accepted review cases, immutable transitions, jobs, issuance, compensation, audit, balances, refunds, reconciliation, export, and checkout independence. Projection failure cannot hide unrelated loyalty value.

Disabled deployment, a fresh recovery point, Starfiniti-only canary, zero-drift reconciliation, module scoring, reviewed merge, and production smoke remain M06-S06. A real referral purchase still depends on the approved WooCommerce pilot store gate shared with M01.
