# M09 Evidence — Storefront Experience

Status: in progress. M09-S01 through M09-S05 are complete; M09-S06 disabled deployment, Starfiniti canary, reconciliation, rollback, and scoring are active.

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

## S03 — Local WooCommerce snapshot and classic placements

- Commit: `c2e2c82b5557c9105d4311afed9f621776f11c53`
- Exact-head CI: [run 32853757058](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32853757058)
- Result: baseline, dashboard and worker images, clean 56-migration replay, all 44 pgTAP files with 2,392 assertions, and all four minimum/current HPOS/legacy WooCommerce runtime cells passed.
- Delivery boundary: a signed connector poll advertises `customer_experience.snapshot.v1` and supplies at most 25 unique numeric channel-local selectors. PostgreSQL derives connection, tenant, registered customer, programme, wallet, exact balances, tier, expiry, earning summaries, reward affordability, and presentation entitlement; neither WordPress nor the browser can choose value or tenant authority.
- Local integrity: one strict, bounded, PII-free, monotonic command updates a per-customer non-autoloaded option only after complete schema, freshness, size, affordability, local-user, and connection checks. Older, conflicting, private, stale, or cross-connection payloads cannot replace the last known good revision. WordPress privacy export/erasure, user deletion, and explicit data-removing uninstall cover the cache.
- Classic experience: My Account, product, cart, checkout, and post-purchase hooks expose local core value or generic stale guidance, gated enhancements, the secure account path, and native coupons. Runtime tests force every Hub HTTP call to fail while all placements render; checkout remains independent.
- Budgets: 0 bytes connector JavaScript, 0 bytes connector CSS, 0 render-time Hub calls, 32 KiB per snapshot, 25 customer selectors per poll, and about 30 KiB combined storefront/snapshot PHP under a 48 KiB ceiling.
- Rollback: stop queueing the capability and remove enhanced hooks. The last valid cache, secure account link, native coupons, local commerce outbox, and every canonical ledger/value record remain intact.

## S04 — Cart and Checkout Blocks progressive panel

- Commit: `bf5ec90ae76420143a9bec85bc5d570691f40bb1`
- Exact-head CI: [run 32859649418](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32859649418)
- Result: baseline, dashboard and worker images, clean 56-migration replay, all 44 pgTAP files with 2,392 assertions, and all four minimum/current HPOS/legacy WooCommerce runtime cells passed.
- Architecture: ADR-0038 registers one `wc/store/cart` extension under `starfiniti-loyalty`, derives only the logged-in user's strict local snapshot, and uses the official `IntegrationInterface` plus `ExperimentalOrderMeta`. The display projection accepts no scope or value selector and cannot reserve, redeem, issue, capture, or cancel value.
- Rollout: separate non-autoloaded Blocks-data and panel flags default off. The data response can be observed first; enabling the panel also enables its dependency. Disabling the panel removes its script, style, and no-script enhancement while native coupons, classic placements, hosted access, and the separately controlled data canary remain intact.
- Privacy and failure behavior: fresh data is bounded to exact string-form available points, safe programme/tier labels, one same-origin account URL, and three reward summaries. Stale data contains no balance, programme, tier, or reward value. Unsafe account URLs fail closed in PHP and JavaScript, and the panel contains no request, socket, dynamic-HTML, remote-code, or absolute-provider primitive.
- Budgets: the reviewed source is 3,821 bytes/1,177 bytes gzip JavaScript and 980 bytes/430 bytes gzip CSS against hard 4 KiB/2 KiB compressed ceilings. Classic placements retain their independent zero-JavaScript and zero-CSS budget. All panel rendering makes zero Hub requests.
- Browser evidence: the real unbundled panel and production stylesheet passed Chromium DOM, region naming, visible-focus, same-origin-link, fresh/stale, unsafe-link, mobile overflow, and zero-diagnostic checks at 900×700 and 390×844. Retained captures: [desktop](./woocommerce-blocks-desktop.png) and [mobile](./woocommerce-blocks-mobile.png).
- Runtime contract: every minimum/current HPOS/legacy cell exercised default-off and staged flags, official integration handles, the no-script path, actual fresh/stale `/wc/store/v1/cart` responses, native classic/Store API coupons, and forced Hub failure. The current-HPOS lane also verified the real namespaced JSON wire payload and controller coupon behavior.
- Rollback: disable the panel first and Blocks data second. No database migration or value-bearing WordPress data is introduced, and the existing local snapshot, native coupon, outbox, reservation, and canonical ledger boundaries remain unchanged.

## S05 — Controlled presentation and degraded delivery

- Status: complete.
- Commits: `125c3fea3f3bb1ce76bb90d3d0d2b592a44e2d30` and dark-theme hardening `4f8be7a55589d70710080a468f371b3fc9fe0533`.
- Exact-head CI: [run 32875015095](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32875015095).
- Result: baseline, both production images, a clean 57-migration replay, all 44 pgTAP files with 2,441 assertions, every concurrency probe, and all four minimum/current HPOS/legacy WooCommerce runtime cells passed.
- Architecture: ADR-0039 adds strict `ExperienceThemeDefinitionV2`, English-only copy, an exact seven-section order, reviewed Lucide asset keys, controlled density and optional visibility, one audited Auth-derived command, no-selector customer reads, and no-locale anonymous reads while retaining strict V1 contracts and functions.
- Delivery: merchant preview covers member, public, and locally cached WooCommerce surfaces at desktop/mobile and ready/guest/offline/empty states. The hosted member and public DOM consume the exact persisted order, and only rewards, VIP, and referrals may be hidden. Overview, earning, history, privacy, and account access remain present.
- Failure behavior: V2 readers fall back to V1 only when the additive RPC is absent. Malformed, unauthorized, or provider-failure responses render bounded no-store/no-customer recovery states. WooCommerce continues using its last valid snapshot, native coupons, no-script guidance, and zero synchronous Hub dependency.
- Local verification: lint; all workspace typechecks; 177 dashboard, 97 worker, 234 contract, and 57 domain tests; CI/deployment/pilot/entitlement/architecture/accessibility/WooCommerce validators; production builds; secret scan; zero-vulnerability production audit; licence validation; changed-file formatting; `git diff --check`; and static validation of 57 migrations plus 44 pgTAP files passed.
- Browser and accessibility: [the dated Chrome report](presentation-v2-browser-qa-2026-08-25.md) records desktop, mobile, 320-pixel, and 200%-scale review of the real components. The approved Hub composition, working previews/states, English-only DOM, anonymous-public privacy, keyboard focus, reduced motion, no horizontal overflow, and zero final diagnostics passed. The first dark-theme capture exposed low-contrast labels and white controls; the scoped repair and regression validator landed before the retained final capture.
- Retained visual evidence: [editor desktop](experience-v2-editor-desktop.png), [editor mobile](experience-v2-editor-mobile.png), [editor dark](experience-v2-editor-dark.png), [member desktop](experience-v2-member-desktop.png), [member mobile](experience-v2-member-mobile.png), [public desktop](experience-v2-public-desktop.png), and [public mobile](experience-v2-public-mobile.png).
- Rollback: application readers and writers can return to V1 while additive V2 columns/functions remain inert and auditable. Presentation reset uses `none`, `comfortable`, and canonical order; no rollback mutates programme versions, reservations, coupons, commerce facts, or ledger value.

## S06 — Canary and close

- Status: in progress; pre-canary automation is complete and no production mutation has been attempted.
- Integrated exact-head CI: [run 33100009132](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33100009132) and [Security run 33100009100](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33100009100) passed candidate `c989229d84a08a9d377b23c747219661fbb74a31` across all eleven checks.
- Machine gate: [`canary.yaml`](canary.yaml) is validated during `npm run check`. It requires 34 exact checks, four synchronized approvals, seven-category arithmetic, at least 90/100 overall, at least 80% in every category, nine unique path- and SHA-256-bound production artifacts, no failed/pending check, and matching completed task state before it can claim completion.
- Artifact and corruption boundary: verified production claims must be unique minimized JSON files under the M09 production evidence root, safely opened as bounded regular files, candidate-commit and check-coverage exact, semantically valid under [the M09 artifact contract](ARTIFACT_CONTRACT.md), and free of contact, coupon plaintext, reusable signing, raw payload, and private ledger evidence.
- Exact detail schemas bind release/recovery/baseline evidence, approved pilot/control rollout and numeric asset budgets, released images/plugin/migrations/contracts, hosted public/member/editor and English-only states, every local snapshot/classic/Blocks/no-script/outage path, native coupon continuity, exact value/queue/presentation reconciliation, rollback, and at least 24 hours of canary-covering observation. Final approval binds every artifact and the same release.
- Self-tests reject top-level and nested manifest schema drift, future or impossible timestamps, cyclic structures, oversized evidence text, invalid task graphs, approval drift, short commits, missing/duplicate checks, forward-looking passed claims, weakened automatic failures, unsafe/reused paths and digests, hollow/extra artifact evidence, current-release reuse, non-English delivery, changed rollout/budgets/artifacts, mismatched snapshot/counts, nonzero value/coupon evidence, impossible chronology, short observation, prose-only closure, task-score drift, incomplete prerequisite slices, and category-floor bypass.
- Current pre-canary score: 88/100. Correctness, security, ledger reliability, tests, performance, and maintainability clear their category floors; operability remains 4/10 until the disabled deployment, production rollback, observation, and reconciliation evidence exists.
- Public/read-only baseline: canonical dashboard and API DNS resolve; dashboard health and login return HTTP 200; unauthenticated Auth and REST roots reject with HTTP 401; the approved Proxmox route confirms both VMs are running without mutation.
- Safe stop: PR #57 remains a draft, not an approved release, and no real WooCommerce store or canary window is approved. The release contract forbids deployment or tenant enablement. These conditions preserve implementation evidence without permitting a false canary claim.

## Remaining

- Reviewed merge and approved immutable release and pilot store/window.
- Fresh recovery point, disabled migration/application deployment, Starfiniti hosted and WooCommerce canary, outage/rollback rehearsal, exact reconciliation, observation, and score of at least 90.
