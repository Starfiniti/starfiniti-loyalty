# M13-S02 organization/team browser and adversarial QA — 2026-08-26

## Scope and safety

- Exercised the production `MerchantShell`, `TeamLifecycle`, and organization-onboarding components through a temporary synthetic, identity-free fixture route.
- The route and temporary authentication bypass were removed after review. The final production build contains 29 application routes and no QA route.
- No server action was submitted, no Supabase request was made, and no production identity, membership, invitation, organization, or loyalty value changed.

## Browser matrix

- Desktop `1440 × 1000`: light and dark themes, sidebar hierarchy, lifecycle summary, invitation form, members, invitation history, lifecycle controls, recent evidence, and onboarding cards rendered without clipping or browser diagnostics.
- Mobile `390 × 844` and narrow `320 × 800`: document/main widths remained within the viewport, controls retained a minimum 44-pixel target, and the page had no horizontal overflow.
- Keyboard: Enter opened the navigation drawer; focus moved to Close; Tab and Shift+Tab wrapped inside the drawer; Escape closed it and restored focus to Open navigation. Background workspace content was inert and hidden from the accessibility tree while open.
- Breakpoint recovery: an open mobile drawer closes when the viewport enters desktop layout, releases the inert workspace, and focuses the main region.
- Reduced motion: the browser media emulation matched `prefers-reduced-motion: reduce` and navigation transitions resolved to zero seconds.
- Forms: invitation label, exact role, expiry, confirmation, lifecycle action-dependent fields, and onboarding confirmations changed predictably without submission. All eight reviewed forms had programmatic labels and English-only interface copy.

## Deterministic findings repaired

1. Dark-theme export and onboarding surfaces used fixed white backgrounds. They now use the merchant surface tokens.
2. The mobile drawer left focus behind the overlay and exposed background controls. It now has focus entry/trapping, Escape/scrim closure, focus restoration, inert background state, and desktop-breakpoint recovery.
3. Mobile lifecycle fields/buttons could remain 40 pixels high. The relevant navigation, form, confirmation, token, and export controls now meet the 44-pixel minimum.
4. Successful invitations, role changes, and lifecycle transitions could preserve an obsolete operation identity or action selection. Member and lifecycle forms now remount on authoritative revisions; successful invitation drafts receive a fresh operation/token while preserving the just-issued one-time token for copying.
5. Invitation expiry was recomputed on the server for each retry. Expiry is now bound to the browser draft, validated again by Next.js and PostgreSQL, and remains byte-identical across an ambiguous retry.
6. Clipboard failure was reported as success. Copy status now follows the actual clipboard promise and gives a manual-selection recovery message.
7. A bounded identity export looked like a complete organization export. The UI and JSON now call it an identity snapshot and publish exact collection limits plus possible-truncation flags.

## Adversarial authority findings repaired

- Organization suspension now disables the shared active-role gate used by existing merchant mutation commands; owner recovery lifecycle and identity export remain available through direct live-owner rechecks.
- A changed/revoked owner or admin now loses every pending invitation capability they issued in the same transaction.
- Accepted invitation replay now rechecks the current organization state and live membership, so a revoked subject fails on the next database request.
- Offboarding revokes every membership except the initiating owner, rather than retaining all former co-owners, and revokes every pending invitation.
- The bounded team projection orders a live owner and current actor ahead of ordinary members so its contract cannot fail merely because an organization exceeds the display limit.
- Invitation acceptance evaluates expiry after acquiring the organization and invitation locks, preventing a lock wait from accepting a capability using stale function-entry time.

## Local evidence

- Focused dashboard action suite: 6/6 passing.
- Dashboard typecheck, zero-warning lint, static validation of 72 migrations and 59 pgTAP files, production build, workflow validation, secret scan, and production dependency audit pass.
- The lifecycle pgTAP plan now contains 70 focused assertions. Docker-backed replay/pgTAP and the fourteenth two-session concurrency probe require Linux CI on the candidate commit.
- Repository-wide Windows `npm run check` reaches the known tracked CRLF/Prettier baseline (227 untouched files); every changed parseable file passes targeted Prettier and Linux clean-checkout CI is authoritative.

No production identity mutation or deployment occurred.
