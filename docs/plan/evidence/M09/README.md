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

### S02 follow-up — Guest-safe advanced VIP catalogue

- Status: repository verified. Production remains unchanged and the M09-S06 canary gate remains open.
- Architecture: ADR-0074 adds an additive V3 anonymous projection rather than changing strict V2. PostgreSQL re-derives active tenant, workspace/group link, programme, and immutable published version, then emits only ordered public levels, period/grace, exact entry operator/metric/threshold, earning rate, and safe benefit booleans. Customer state, internal identifiers, activity selectors, reward codes/configuration, retention/re-entry internals, audit evidence, and ledger data remain private.
- Compatibility: the server requests V3 first and normalizes V2/V1 only for recognized missing-function errors. Malformed, duplicate, mismatched, non-English, or provider-error responses fail closed. Legacy tiers synthesize the equivalent lifetime/spend catalogue without changing V1/V2 functions or historical programme versions.
- Experience: the generic spend-only cards are replaced by a responsive editorial progression rail with a qualification-window policy, starting level, `all`/`any` milestone copy, exact large-integer-safe thresholds, earning rates, and public benefits. The empty state now says that tiers are not part of the published programme instead of promising an unspecified future feature.
- Browser evidence: the actual Next.js route passed Playwright review at 1512×982 and 390×844 with three levels, both expression types, exclusive benefits, one H1, no horizontal overflow, and zero console/page errors. Retained captures: [desktop](./public-vip-v3-desktop-2026-08-28.png) and [mobile](./public-vip-v3-mobile-2026-08-28.png).
- Repository evidence: exact implementation head `7a68ffa4f9812b209015aa4c597d2555637138b3` passed all 12 PR checks. CI run `33157341807` passed baseline, both pinned images, all four minimum/current HPOS/legacy WooCommerce cells, 82-migration replay, 68 pgTAP files, and 3,712 assertions; Security run `33157341670` passed CodeQL, DAST, recovery transport, supply-chain policy, secret/misconfiguration scanning, and SBOM generation. The first replay's two reviewed-function allowlist failures were corrected explicitly; the dedicated 47-case public projection suite passed in both runs.
- Rollback: return the application reader/component to V2 and leave the additive V3 function inert during mixed-version operation. No value, tier decision, reservation, coupon, checkout, or WooCommerce behavior changes.

### S02 follow-up — Guest-safe public earning catalogue

- Status: repository verified. Production remains unchanged and the M09-S06 canary gate remains open.
- Architecture: ADR-0075 adds an additive strict V4 projection instead of changing V3 or exposing raw `ProgrammeDefinitionV2`. PostgreSQL re-derives active tenant/workspace/group/programme/published-version scope, validates effects and schedules fail closed, derives public codes and labels instead of disclosing merchant-authored identifiers/copy, and returns at most twelve standard methods. Custom activities, raw selectors, exclusions, cap values, priority/stacking internals, customer state, tenant/internal IDs, audit evidence, and ledger data stay private.
- Compatibility: the server requests V4 first and normalizes V3/V2/V1 only for recognized missing-function errors. Malformed, duplicate, oversized, contradictory, non-English, or provider-error data fails closed. A legacy programme receives one conservative first-tier purchase method; a document with no safe standard method remains honestly empty.
- Experience: the generic “Eligible store activity” placeholder is replaced by an editorial catalogue with source-specific Lucide icons, exact bigint-safe purchase/fixed/multiplier effects, live/scheduled state, availability windows, and a conservative conditions indicator. The empty state says no public methods are listed and directs the guest to authenticated account-specific detail.
- Browser evidence: the actual Next.js route with a local PostgREST-compatible V4 response passed reduced-motion Playwright review at 1512×982 and 390×844 with all five public sources, exact effects, scheduled state, first-focus skip navigation, one H1, zero horizontal overflow, and zero console/page/request diagnostics. Retained captures: [desktop](./public-earning-v4-desktop-2026-08-28.png) and [mobile](./public-earning-v4-mobile-2026-08-28.png).
- Verification: focused contract, server, and presentation suites pass with strict adversarial cases; contract/dashboard typechecks, accessibility validation, migration/pgTAP static validation, and visual inspection pass. The adversarial review repaired merchant identifier/copy disclosure and sub-4.5:1 small text, then independently refuted both original failure paths. Exact implementation head `d91a2d763a65d6a4acbf75500b31c079108ed7e9` passed all 11 required checks: [CI run 33161466635](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33161466635) replayed 83 migrations, passed all 68 pgTAP files with 3,725 assertions including the expanded 60-case public projection suite, completed every concurrency probe, built both images, and passed all four minimum/current HPOS/legacy WooCommerce cells; [Security run 33161466605](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33161466605) passed CodeQL, isolated DAST, supply-chain policy, secret/misconfiguration scanning, SBOM generation, and recovery transport.
- Rollback: return the application reader/component to V3 and leave additive V4/private parsers inert during mixed-version operation. No value, programme evaluation, reservation, coupon, connector, checkout, or WooCommerce behavior changes.

### S02 follow-up — Guest-safe public reward catalogue

- Status: repository verified. Production remains unchanged and the M09-S06 canary gate remains open.
- Architecture: ADR-0076 adds an additive strict V5 projection instead of changing V4 or exposing raw `RewardDefinitionV2`. PostgreSQL re-derives active tenant/workspace/group/programme/published-version scope, validates supported benefits, currency evidence, schedules, tiers, restrictions, and delivery fail closed, derives public offer codes, and returns at most twenty offers. Internal reward codes/IDs, exact product/category selectors, fulfilment instructions, exact member/global limits, points budgets, segment access, customer state, configuration JSON, audit evidence, and ledger data stay private. Store credit and cash-like value remain excluded.
- Compatibility: ADR-0079 supersedes the unreleased intermediate application fallbacks. The complete reader requests V6 and calls released English V1 only when V6 is genuinely absent; V2-V5 SQL/contracts remain intact for composition and old clients. Malformed, duplicate, oversized, contradictory, non-English, or provider-error data fails closed. Legacy rewards remain conservative, expose no invented monetary/schedule evidence, and discard stored value.
- Experience: legacy name/kind/cost cards are replaced by an editorial catalogue with reviewed Lucide icons, exact bigint-safe benefit and point copy, available/scheduled state, public windows, condition chips, coupon validity or manual delivery expectation, and same-origin account actions. The empty state says no public rewards are listed and directs the guest to authenticated account-specific benefits.
- Browser evidence: the actual Next.js route with a local PostgREST-compatible V5 response passed reduced-motion review at 1512×982 and 390×844 with six supported benefit presentations, native/manual delivery, one H1, same-origin account actions, 44-pixel mobile reward links, no duplicate IDs, zero horizontal overflow, and zero browser diagnostics. Retained captures: [desktop](./public-rewards-v5-desktop-2026-08-28.png) and [mobile](./public-rewards-v5-mobile-2026-08-28.png).
- Verification: focused contract, server, and presentation suites pass; every workspace typecheck, accessibility validation, migration/pgTAP static validation, visual inspection, and diff check passes. Exact implementation head `294c62ae3fb360178e541af8da72658de7ab8905` passed all 11 required checks: [CI run 33165531738](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33165531738) replayed 84 migrations, passed all 68 pgTAP files with 3,740 assertions including the expanded 75-case public projection suite, completed all 22 concurrency probes, built both images, and passed all four minimum/current HPOS/legacy WooCommerce cells; [Security run 33165531707](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33165531707) passed CodeQL, isolated DAST, supply-chain policy, secret/misconfiguration scanning, SBOM generation, and recovery transport.
- Rollback: return the application reader/component to V4 and leave additive V5 inert during mixed-version operation. No value, programme evaluation, reservation, coupon, connector, checkout, or WooCommerce behavior changes.

### S02 follow-up — Guest-safe public referral catalogue

- Status: repository verified. Production remains unchanged and the M09-S06 canary gate remains open.
- Architecture: ADR-0077 adds strict additive `PublicLoyaltyExperienceV6` instead of exposing the full referral policy or weakening the existing Auth-derived customer projection. PostgreSQL re-derives active tenant/workspace/group/programme/latest published version, safe currency, immutable referral policy, and the `referrals` entitlement from the two existing public resource selectors.
- Public boundary: `available` exposes exact friend/advocate points, minimum first-order spend/currency, attribution and cooling windows, the new-customer requirement, and only a boolean monthly-limit signal. `paused`, `unavailable`, and rolling-deploy `confirm_in_account` contain no policy detail. Customer links, identities, orders, history, fingerprints, fraud rules, exact abuse caps, internal IDs, raw configuration, audit/ledger facts, and value commands remain absent.
- Compatibility: ADR-0079 limits the application bridge to V6 and released English V1, with at most two RPCs. Intermediate V2-V5 projections remain additive database/client contracts but are not runtime fallbacks because they have never shipped as separate application releases. Malformed, contradictory, oversized, duplicate, non-English, or provider-error V6 data fails closed. V6 now carries the exact immutable published programme currency; the V1 bridge uses honest currency-neutral copy instead of assuming EUR.
- Experience: the generic promise is replaced by a responsive give-and-get offer, two exact point cards, a three-step first-order/cooling flow, reviewed terms, and a same-origin private-account action. Honest paused/unavailable/compatibility states preserve existing customer progress and make no false offer claim.
- Browser evidence: the production build with a local PostgREST-compatible V6 response passed reduced-motion review at 1512×982 and 390×844 with both offers, all three steps, exact money/window/cooling copy, one same-origin action, 44-pixel action height, one H1, English output, no duplicate IDs, zero horizontal overflow, and zero console/page/request diagnostics. Retained captures: [desktop](./public-referrals-v6-desktop-2026-08-28.png) and [mobile](./public-referrals-v6-mobile-2026-08-28.png).
- Verification: the complete local `npm run check` passes 981 workspace tests, every repository validator, all workspace typechecks, accessibility, WooCommerce budgets, and all production builds. Static validation covers 85 migrations and 68 pgTAP files; visual inspection, format/diff, 1,059-file secret, zero-vulnerability production dependency, and licence checks also pass. Exact implementation head `3812e67a8360f50675c3edff90d4f196e66242ef` passed [CI 33169816691](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33169816691) and [Security 33169816719](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33169816719): 85 migrations replayed cleanly, all 68 pgTAP files passed 3,753 assertions, all 22 concurrency probes passed, both production images built, all four minimum/current HPOS/legacy WooCommerce runtime cells passed, and CodeQL, isolated DAST, supply-chain/image/SBOM policy, secret scanning, and recovery transport passed.
- Rollback: return the dashboard to released V1 and leave additive V2-V6 functions inert for forward compatibility. No published policy, private link, attribution, referral transition, ledger value, reward, connector, checkout, or WooCommerce behavior changes.

### S02 follow-up — Auth-derived purchase campaign opportunities

- Status: repository-verified on exact implementation head
  `9644d66ed4835a61d7b5a1053338a9ffe453e0c6`. Production remains unchanged and the
  M09-S06 canary gate remains open.
- Architecture: ADR-0078 adds strict additive `CustomerLoyaltyExperienceV3` without
  changing V2. Its no-argument PostgreSQL function derives the Auth subject, active
  customer link, commerce connection, exact programme and wallet, immutable treatment
  assignment, lifecycle, and one projection instant. Control, other-tenant, revoked,
  paused, ended, and exhausted opportunities remain absent.
- Public boundary: at most eight scheduled or active purchase bonus/multiplier offers
  expose only a one-way display code, safe name/description, exact times, exact bigint
  points or basis points, conservative purchase-eligibility guidance, and additive or
  highest-eligible combination semantics. Raw identifiers, audiences, controls, rules,
  selectors, caps, budgets, liability, customer data, and value commands stay private.
- Compatibility: the server requests V3 first and uses V2/V1 only for a recognized
  missing-function error. Malformed, contradictory, duplicate, oversized, private-field,
  or provider-error V3 data fails closed rather than selecting older campaign facts.
- Browser evidence: the production build passed reduced-motion review at 1512×982 and
  390×844 with active and scheduled cards, an exact extreme bigint, an exact multiplier,
  one H1, unique IDs, zero horizontal overflow, and zero browser diagnostics. Retained
  captures: [desktop](./customer-campaign-v3-desktop-2026-08-28.png) and
  [mobile](./customer-campaign-v3-mobile-2026-08-28.png).
- Local verification: focused contract and dashboard suites pass 22 tests; the full
  repository gate passes 985 workspace tests and both builds; static validation passes
  86 migrations and 68 pgTAP files. The adversarial pass repaired programme-unavailable
  compatibility, mobile extreme-number containment, exhausted-capacity presentation,
  and customer-role test authority before handoff.
- Exact-head verification: [CI 33175790670](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33175790670)
  and [Security 33175790673](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/33175790673)
  passed: 86 migrations replayed cleanly, all 68 pgTAP files passed 3,772 assertions,
  all 22 concurrency probes passed, both production images built, all four minimum/current
  HPOS/legacy WooCommerce runtimes passed, and CodeQL, isolated DAST, supply-chain image
  and SBOM policy, secret scanning, and recovery transport passed.
- Rollback: return the application reader to V2 and retain the additive V3 function.
  Do not change campaign assignments/effects, ledger value, notifications, native
  coupons, checkout, or WooCommerce behavior.

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
