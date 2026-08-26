# Tenant federation browser QA — 2026-08-26

## Outcome

The production-build tenant-federation workflow passed responsive visual and interaction review with no critical accessibility, overflow, copy, state, or browser-diagnostic defect. No production identity state or committed runtime behavior changed.

## Method

- Rendered the real `MerchantShell` and `FederationLifecycle` with public-only synthetic OIDC and SAML states through a temporary local route.
- Exercised an enabled OIDC provider, an ambiguous `review_required` SAML provider with an interrupted disable operation, the successful explicit-link state, provider creation, and lifecycle controls.
- Built and served the optimized Next.js standalone output rather than relying on a static mock.
- Removed the temporary route, proxy bypass, Playwright driver, screenshots, and synthetic data after review.

## Verified evidence

- Desktop `1440 × 1100`: light and dark themes, full Hub navigation, summary hierarchy, provider creation, enabled and review-required cards, long endpoint truncation, audited action selection, reason entry, confirmation, and zero horizontal overflow passed.
- Mobile `390 × 844` and narrow `320 × 720`: collapsed navigation, inert background, Escape close and focus restoration, single-column card flow, upper and lower workflow states, readable warning hierarchy, labelled checkbox targets, and zero horizontal overflow passed.
- The OIDC/SAML protocol switch showed only its applicable fields. Reduced-motion emulation, English document language, visible control hit areas, exact inner-scroll widths, and client hydration passed.
- Playwright reported zero page errors, console warnings/errors, and HTTP failures after local-only Next Link prefetches were isolated from authenticated routes that require a configured Supabase test environment.
- Visual inspection covered both the top-level federation summary and the bottom review/recovery controls at mobile and narrow widths.

## Remaining gate

This closes only the repository browser-evidence item for M13-S03. Exact Linux migration/pgTAP replay, Authentik private-egress and DNS-rebinding proof, mounted-secret staging, and the approved enterprise-IdP canary remain required before tenant federation is complete or enabled in production.
