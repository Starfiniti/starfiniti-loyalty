# M04 reward workflows browser and accessibility evidence — 2026-08-27

## Result

`M04-S03-MERCHANT-WORKFLOWS` passes its repository browser and accessibility gate. The production `ExpandedRewardsEditor`, `RewardFulfilmentQueue`, and Hub merchant shell passed native-Chrome review at 1440 × 1000, 390 × 844, and 320 × 720. No authenticated request, action submission, database mutation, connector call, or production deployment occurred.

The browser exercise used a temporary local-only page with synthetic UUIDs and member references. It rendered the real production components from an optimized standalone Next.js build. Route prefetches outside the fixture and `/_next/` assets were isolated, all form submissions remained blocked, and the temporary route and driver were removed after evidence capture.

## Adversarial workflow

- Added one product-specific WooCommerce reward and one audited custom perk through the six-template catalogue.
- Opened the availability controls and verified the authoring and readiness summaries remained coherent.
- Entered the invalid code `Invalid code`, then verified the reward stayed editable instead of being reclassified as legacy.
- Verified the invalid field received `aria-invalid="true"`, referenced the visible validation summary through `aria-describedby`, and received focus after the still-enabled Save action was attempted.
- Corrected the code to `free-product` and verified the editor returned to `Ready for review` without stale invalid state.
- Verified pending, in-progress/overdue, fulfilled, and rejected manual cases; the start, fulfil, and reject controls; captured-value evidence; and released-reservation evidence.
- Opened the mobile navigation, verified initial focus on Close, closed it with Escape, and verified focus returned to Open navigation.
- Verified the English skip link is the first keyboard stop, exactly one H1 and one focusable main landmark exist, all visible controls have accessible names, and reduced-motion mode does not break interaction.

## Measured evidence

| Viewport                       | Visible controls | M04 mobile targets checked | Minimum M04 target height | Minimum control font | Horizontal overflow | Browser diagnostics |
| ------------------------------ | ---------------: | -------------------------: | ------------------------: | -------------------: | ------------------: | ------------------: |
| 1440 × 1000 light              |               50 |              desktop rules |                       n/a |                12 px |                0 px |                   0 |
| 390 × 844 dark/reduced motion  |               52 |                         25 |                     44 px |                12 px |                0 px |                   0 |
| 320 × 720 light/reduced motion |               52 |                         25 |                     44 px |                12 px |                0 px |                   0 |

The 24 px minimum height reported by the general control inventory belongs to compact inline navigation/disclosure controls outside the M04 mobile target set. Every M04 template button, action button, icon action, text field, select, textarea, and checkbox row measured at least 44 px on both mobile viewports.

## Defects repaired

1. V2 rewards were previously identified by complete schema validity. One invalid edit therefore made the reward disappear into the legacy read-only presentation. The editor now uses the immutable V2 configuration discriminator for presentation while retaining the strict contract for save authority.
2. Nested programme validation collapsed an invalid V2 reward to a generic `rewards → 0` union error. The editor now expands the exact per-reward contract issues, maps them to stable field paths, exposes field-level ARIA state, and focuses the first invalid field after submit.
3. Save was disabled for any invalid draft, preventing keyboard and screen-reader users from receiving submit-time guidance. Save is now disabled only while an action is pending; invalid submissions are prevented locally and focused deterministically.
4. M04-only 9–10 px helper text and 38 px mobile actions were below the product's readability and touch-target standard. Reward and fulfilment copy now renders at 11–12 px or larger, form controls at 12 px, and relevant mobile targets at 44 px or larger.
5. The post-QA adversarial diff pass stabilized editable reward keys when two draft codes collide, preserved independent cross-reward errors when one reward also has a local schema error, and widened the narrow-screen remove-action grid track to its measured 44 px target.

## Captures

- [Desktop reward authoring](m04-rewards-desktop-2026-08-27.png)
- [Mobile reward authoring](m04-rewards-mobile-2026-08-27.png)
- [320 px reward authoring](m04-rewards-narrow-2026-08-27.png)
- [Desktop manual fulfilment](m04-fulfilment-desktop-2026-08-27.png)
- [Mobile manual fulfilment](m04-fulfilment-mobile-2026-08-27.png)

## Verification

- `npm run typecheck --workspace=@starfiniti/dashboard`
- `npm run accessibility:validate`
- `npm run build --workspace=@starfiniti/dashboard`
- `npm run check` — passed with 958 workspace tests and the normal 32-route production build
- `npm run db:validate` — passed for 81 migrations and 68 pgTAP files
- `npm run secrets:scan`, `npm run audit:prod`, and `npm run licenses` — passed; zero production dependency vulnerabilities
- Native Chrome production-build browser exercise described above

## Remaining M04 gate

This closes only M04-S03. M04 remains in progress until S04 has an approved exact release, disabled production deployment, Starfiniti-only canary, native/manual reward and ledger reconciliation, rollback/observation evidence, and a final score of at least 90 with every category above its floor.
