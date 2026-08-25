# M09 Evidence — Storefront Experience

Status: in progress. M09-S01 and M09-S02 are complete; M09-S03 is active. Local cache/offline behavior, plugin placements and matrix, progressive-panel budget, checkout-independence, hardening, and canary evidence remain required for module closure.

## S01 — Auth-derived customer experience contract

- Commit: `f531f82e2fcd78ab43ca5ac2d4d7e1247dec0b2c`
- Exact-head CI: [run 32839387263](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32839387263)
- Result: baseline, dashboard and worker images, clean database replay, and all four minimum/current HPOS/legacy WooCommerce runtime cells passed.
- Database: 55 additive migrations and all 43 pgTAP files passed with 2,361 assertions. The focused read-model suite exercises Auth derivation, grants, live tenant membership, cross-account rejection, disabled-presentation behavior, bounded/minimized earning data, one-statement coherence, and zero ledger mutation.
- Application: the server consumes one `get_my_loyalty_experiences_v1` call, strictly parses every row, rejects duplicates and mismatched account identifiers, and fails closed on unauthenticated or malformed database responses.
- Contract: exact bigint text balances, reward affordability, bounds, identifiers, account states, earning summaries, expiry, tier, referral, reservation, and activity consistency are validated without browser-supplied tenant, customer, channel, wallet, or programme authority.
- Rollback: stop consuming the V1 aggregate and retain the compatible legacy projections. The additive function and old readers can coexist; rollback never removes ledger or customer value.

## S02 — Hosted seven-area customer experience

- Commit: `ad1ddcfcf144ba176fece4247d0bc331db854785`
- Exact-head CI: [run 32844158775](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32844158775)
- Result: baseline, dashboard and worker images, clean 55-migration database replay with all 43 pgTAP files and 2,361 assertions, and all four minimum/current HPOS/legacy WooCommerce runtime cells passed.
- Member experience: one Auth-derived aggregate now powers a persistent Hub-style overview, ways to earn, rewards, VIP, referrals, immutable history, and account experience. It preserves exact bigint values and exposes affordability, shortfalls, progression, sharing, expiry guidance, reservations, and account state without accepting tenant, customer, channel, wallet, or programme authority from the browser.
- Guest experience: the bounded anonymous page explains programme value, earning, tiers, rewards, and redemption, then routes to the tested same-origin English account path. Legacy non-English content cannot become the active fallback, and there is no locale query path or language switcher.
- Browser evidence: the real production components passed Playwright review at 1440×1000, 390×844, and 720×900 200%-reflow equivalent with reduced motion. The page retained one visible H1, all seven stable section headings, unique IDs, working anchors, a first-focus bypass link, no horizontal overflow, and zero console errors, page errors, or failed requests.
- Retained captures: [desktop](./hosted-customer-desktop.png), [mobile](./hosted-customer-mobile.png), [200% reflow](./hosted-customer-reflow-200.png), [rewards](./hosted-customer-rewards.png), [VIP](./hosted-customer-vip.png), [referrals](./hosted-customer-referrals.png), [history](./hosted-customer-history.png), and [account](./hosted-customer-account.png).
- Local verification: 41 dashboard test files with 164 tests, dashboard lint/typecheck/build, root lint, every workspace typecheck/test/build, database/deployment/pilot/entitlement/architecture/accessibility/WooCommerce validators, secret scan, production audit, licence inventory, targeted formatting, and diff checks passed. The Windows Nextcloud worktree still reports the documented untouched-file CRLF Prettier noise; exact Linux CI is authoritative.
- Rollback: disable `enhancements_enabled` and retain the compatible core account and public experience. The immutable read model, customer value, reservations, native coupons, and history remain available.

## Remaining

- S03 local WooCommerce snapshot and classic placements.
- S04 Blocks data and progressively enhanced panel.
- S05 branding, accessibility, and outage hardening.
- S06 disabled deployment, Starfiniti canary, reconciliation, rollback, and score.
