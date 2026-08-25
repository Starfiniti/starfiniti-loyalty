# M10 analytics command-center browser QA — 2026-08-25

## Scope

The temporary public fixture rendered the real `MerchantShell` and `AnalyticsValueTruth` components with strict Dictionary V4 report fixtures. It was removed after the run. No fixture route, sample value, or test-only data remains in the application.

## Environments

- Chromium desktop: 1512 × 982 CSS pixels
- Chromium mobile: 390 × 844 CSS pixels
- `prefers-reduced-motion: reduce`
- English document and product copy

## Results

- Both environments returned HTTP 200 with exactly one page heading, six named analytics section links, and no page-level horizontal overflow (`0 px`).
- The section link moved to the cohort anchor through keyboard activation. Both non-empty cohort tables exposed named, keyboard-focusable scroll regions with captions, column headers, and row headers.
- Primary heading contrast measured 16.68:1 against the command-center canvas.
- The 390-pixel layout is narrower than a 1280-pixel desktop at 200% reflow and retained readable wrapping, stacked cards, an internal section-navigation scroller, and no document overflow.
- Reduced-motion context reported no active animation on tested command-center status/loading selectors.
- The stale variant rendered “Stale but reconciled,” the exact-snapshot warning, and no estimated fallback.
- The zero-denominator variant replaced both cohort tables with “No mature members in this cohort window” and rendered no focusable empty data grid.
- Browser console warnings, browser console errors, page errors, and failed fixture requests: `0`.
- Slovenian copy or language switcher: `0`.

## Evidence

- [Desktop viewport](analytics-command-center-desktop-2026-08-25.png)
- [Mobile viewport](analytics-command-center-mobile-2026-08-25.png)

The loading route and unavailable/disabled/setup-required server states also passed the production build and typed component boundary. Production Auth/RLS behavior and canary data reconciliation remain M10-S06 gates.
