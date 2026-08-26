# M11-S04 service-account browser QA — 2026-08-26

## Scope

- The production `MerchantShell` and `ServiceAccountsPanel` rendered through a temporary public local fixture; the fixture route and automation source were removed after capture.
- Chromium ran headless through Python Playwright after live Next.js rendering and hydration.
- Desktop viewport: 1440 × 1000 CSS pixels in dark mode.
- Mobile viewport: 390 × 844 CSS pixels with reduced motion.
- Fixture states: active, retiring, and revoked credentials; rotation review; new-account review; least-privilege scopes; quota; and owner controls.

## Findings and improvements

The first review found two deterministic visual failures:

1. The confirmation surface used a hard-coded pale background, so inherited dark-theme text was nearly unreadable.
2. Generic primary/review actions had no service-account target-size rule, and a later grid label rule displaced confirmation checkboxes above their copy.

The production stylesheet now derives confirmation foreground, background, and border from dashboard tokens; enforces 40-pixel issuance/create actions; and keeps the whole checkbox label as one aligned 24-pixel target. The repaired dark confirmation measured 16.48:1 text contrast.

## Passed evidence

- Exact active/retiring/revoked projections and secret hints render without a reusable credential.
- Rotation and create flows require explicit review and confirmation.
- Review actions and final issuance/create actions are at least 40 pixels high.
- Confirmation checkboxes and copy share a vertically aligned clickable label.
- Desktop dark mode and mobile light mode retain readable hierarchy and status colors.
- Mobile navigation opens and closes; reduced-motion mode remains usable.
- English is the only rendered language and no language switcher exists.
- Desktop and 390-pixel mobile document overflow is zero.
- Keyboard focus reaches an interactive control.
- Browser console and page-error diagnostics are empty.

## Captures

- [Desktop dark review state](m11-service-accounts-desktop-2026-08-26.png)
- [Mobile light review state](m11-service-accounts-mobile-2026-08-26.png)

The local fixture carried no production credentials, customer data, tenant authority, or external network dependency.
