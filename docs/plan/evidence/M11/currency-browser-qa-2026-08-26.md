# M11-S03 currency-policy browser QA — 2026-08-26

## Scope

The real `MerchantShell` and `CurrencyPolicyForm` were rendered from a temporary public fixture against a production Next.js build. The fixture, browser script, and temporary navigation-prefetch exception were removed after capture; no test route or Auth bypass remains in production code.

## Environments and interaction

- Chromium/Playwright desktop: 1440×1000 CSS pixels.
- Chromium/Playwright mobile: 390×844 CSS pixels.
- `prefers-reduced-motion: reduce` and English document/product copy.
- Existing USD→EUR revision inspection plus a new GBP→EUR policy draft with provider identifier, enabled state, review summary, required confirmation, and commit action.
- Light and dark theme render, mobile drawer open/close, and keyboard Tab movement from confirmation to commit.

## Measured result

- The production Hub shell rendered exactly one `h1` and one named “Multi-currency conversion” region. No language control or Slovenian copy appeared.
- Desktop document width exactly matched its 1440 px viewport; the card measured 1100 px. Mobile document width exactly matched 390 px.
- Source fields and all three evidence summaries collapsed to one column on mobile. Controls, help text, state, and safety notice remained within the viewport.
- Visible component text is 11 px or larger; the 10 px minimum measurement belongs to the existing shell group label. Review and commit actions measure 38 px high.
- The exact reviewed boundary displayed `GBP → EUR · enabled`, provider `approved-feed`, maximum age `86400s`, and next revision `1`. Confirmation remained a required input.
- Keyboard Tab reached the commit action and produced an explicit 3 px solid focus outline plus the standard focus halo.
- Dark mode gave the card an opaque themed surface. Mobile navigation opened and closed from its named controls.
- HTTP failures, failed requests, browser console warnings/errors, and page exceptions: `0`.

## Self-improvement result

The first production render exposed a real 18 px-high commit button because legacy `.primary`/`.secondary` classes supplied color but no control dimensions in this context. The component now uses the Hub `ui-button` primitives; review and commit controls measure 38 px. A second keyboard pass then exposed that the later primary-button shadow could visually mask the global focus style, so the currency form now applies its own explicit 3 px focus outline. The final run passed every deterministic check.

## Evidence

- [Desktop reviewed GBP policy](m11-currency-desktop-2026-08-26.png)
- [Mobile header and evidence summary](m11-currency-mobile-2026-08-26.png)
- [Mobile fields, safety notice, and review action](m11-currency-mobile-form-2026-08-26.png)

Result: pass. Production Auth/RLS behavior, approved provider ingestion, a real foreign order/refund, and exact source-to-ledger reconciliation remain disabled Starfiniti canary gates under M11-S06.
