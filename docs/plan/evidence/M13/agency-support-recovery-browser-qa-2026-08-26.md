# Agency support and recovery browser QA — 2026-08-26

## Outcome

The production `MerchantShell`, bilateral agency/support administration, and
owner recovery/offboarding controls passed local production-build responsive,
keyboard, reduced-motion, theme, and browser-diagnostic review. No production
organization, identity, support, recovery, export, or deletion state changed.

## Method

- Rendered the real `AgencySupportLifecycle` and `RecoveryLifecycle` components
  with public-only synthetic portfolio, request, grant, use, AAL2, recovery,
  offboarded, and cooling-period states through a temporary identity-free route.
- Built and served the optimized Next.js standalone output with non-secret
  Supabase placeholders. No action form was submitted.
- Used native headless Chromium through Playwright, then visually inspected the
  full-page and recovery captures in light and dark themes.
- Removed the temporary route, its single-path Auth-proxy bypass, the Playwright
  driver, synthetic fixtures, screenshots, report, and local placeholders after
  review.

## Verified evidence

- Desktop `1440 × 1100`: the complete Hub sidebar, agency invitation and
  acceptance, active/revoked relationships, exact support-scope request and
  decision controls, active/revoked grants, tenant-visible use history, AAL2
  recovery, bounded export, and cooling-period deletion states passed in light
  and dark themes.
- Mobile `390 × 844` and narrow `320 × 720` with reduced motion: the workflow
  reflowed to one column with zero document overflow. The drawer opened with
  focus on Close, Escape closed it, and focus returned to Open navigation.
- All four cases returned HTTP 200 with zero console warnings/errors, page
  errors, or failed route/static responses. The English document language and
  all 13 workflow headings remained present.
- All 58 desktop and 60 mobile visible controls had accessible names. Mobile
  buttons, fields, links, and labelled checkbox targets were at least 44 CSS
  pixels in both dimensions. Keyboard focus used the visible three-pixel Hub
  focus ring.
- Eleven server-action forms remained individually labelled. The terminal
  deletion action was disabled while the seven-day cooling period was active,
  and its explanatory state remained visible at every width.

## Remaining gate

This closes repository browser evidence for M13-S05 only. Production enablement
still requires a consenting client/agency canary, mounted credential transfer,
live grant-use and revocation reconciliation, an AAL2 recovery rehearsal on a
disposable organization, retained export verification, and explicit approval
before any terminal deletion rehearsal.
