# Tenant SCIM browser QA — 2026-08-26

## Outcome

The real MerchantShell and SCIM directory-provisioning workflow passed local
responsive visual and interaction review with no critical overflow,
accessibility, hydration, state, or browser-diagnostic defect. No production
identity, directory, credential, membership, or entitlement state changed.

## Method

- Rendered the production `ScimLifecycle` component with public-only synthetic
  active/revoked endpoint, mapped/unmapped group, count, and minimized-event
  states through a temporary local route.
- Used the real client-generated 256-bit credential inputs and server-action
  forms without submitting mutations.
- Temporarily excluded only the synthetic route from the local Auth proxy,
  supplied non-secret local Supabase placeholders, and removed the route,
  proxy exclusion, Playwright driver, screenshots, and placeholders after QA.
- Ran native headless Chromium through Playwright and visually inspected the
  full-page captures before removal.

## Verified evidence

- Desktop `1440 × 1100`: Hub sidebar, patterned directory header, four live
  metrics, explicit non-authority boundary, endpoint creation, active and
  revoked endpoint states, credential rotation/revocation controls, audited
  reasons, confirmation copy, group role allowlist, minimized activity, and
  light/dark themes passed.
- Mobile `390 × 844` with reduced motion: collapsed Hub navigation, one-column
  metrics/forms/cards, readable trust hierarchy, lower group states, and zero
  horizontal overflow passed.
- Selecting credential rotation changed the irreversible-action explanation;
  selecting an unmapped group role preserved a labelled review flow. The create
  control was enabled only with a validated unused federation source.
- English document language, semantic headings, labelled controls, live/error
  regions, native keyboard controls, responsive grid collapse, and zero
  console warnings/errors or page errors passed.

## Remaining gate

This closes only repository browser evidence for M13-S04. A production/staging
enablement still requires an approved enterprise IdP/SCIM test tenant, one-time
credential handoff into Authentik, official-client synchronization, exact
hashed-subject correlation, deprovisioning/stale-session proof, reconciliation,
and rollback evidence.
