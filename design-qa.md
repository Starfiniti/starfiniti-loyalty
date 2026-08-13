# Design QA — Hub-style launch command center

- Source visual truth: `docs/design/qa/hub-command-center-reference.png`
- Browser-rendered implementation: `docs/design/qa/hub-command-center-implementation-1440x1024.png`
- Final full-view comparison: `docs/design/qa/hub-command-center-comparison-2880x1024.png`
- Final focused comparison: `docs/design/qa/hub-command-center-comparison-focused.png`
- Mobile evidence: `docs/design/qa/hub-command-center-mobile-390x844.png`
- Source pixels: 1487 × 1058
- Implementation pixels: 1440 × 1024
- CSS viewport: 1440 × 1024 desktop and 390 × 844 mobile
- Device density: 1 CSS pixel per image pixel. The source was normalized to 1440 × 1024 with Lanczos resampling for equal-size comparison; the implementation was not rescaled.
- State: light theme, Starfiniti / Main Store, draft v1, Rose/Bloom/Icon tiers, no reward, no WooCommerce connector, authoritative zero-value reporting.

## Full-view comparison evidence

The normalized source and implementation were placed in the same 2880 × 1024 comparison image. The final implementation preserves the selected option's fixed white sidebar, 70 px command bar, muted canvas, programme context strip, wide four-step launch checklist, narrow performance rail, recent activity surface, semantic status colors, compact Lucide iconography, and dark primary actions. The implementation uses live programme, connector, report, and audit state rather than illustrative values.

The implementation intentionally reports `1 of 4 complete` instead of the source mock's inconsistent `2 of 4 complete`: the visible state contains a complete programme structure but no reward, connector, or published version. The performance range control and “Authoritative reporting” label are retained because the production Overview already supports real 7/30/90-day reporting.

## Focused-region comparison evidence

The 2160 × 770 focused comparison covers the identity lockup, active navigation, command bar, introduction, programme strip, checklist typography, disclosure rows, statuses, reward details, and primary CTA. Sidebar width, card geometry, icon scale, surface borders, typography hierarchy, and vertical rhythm have no actionable P0/P1/P2 mismatch. The real Starfiniti raster mark and Lucide icons replace the previous initials-only and inconsistent navigation treatment.

## Required fidelity surfaces

- Fonts and typography: Geist is retained throughout. The 26 px greeting, 14 px surface headings, 13 px navigation/copy, 11 px metadata, optical weights, line height, truncation, and tabular performance figures match the selected dense Hub language.
- Spacing and layout rhythm: 268 px sidebar, 70 px command bar, 36 px desktop content inset, 16 px major grid gap, 10 px surface radii, fine borders, compact checklist rows, and grouped activity lines align with the reference. Mobile reflows to one column without horizontal overflow.
- Colors and visual tokens: white navigation/surfaces, cool near-white canvas, graphite text, muted gray metadata, lavender active state, violet actions, and semantic green/amber/red statuses map to the selected mock and the existing Hub reference.
- Image quality and asset fidelity: the supplied Starfiniti PNG is rendered at its measured 38 px slot with no redraw or approximation. All interface symbols use the installed Lucide library; no emoji, CSS drawings, handcrafted SVGs, or placeholder assets are present.
- Copy and content: programme, workspace, version, tiers, checklist states, performance metrics, and audit entries are sourced from production contracts. The honest completion count and reporting-period control are intentional product-correct deviations.

## Comparison history

1. Pass 1 found a P2 active-navigation mismatch caused by the preview route, a narrower command-bar action, and `EUR 0.00` rather than the selected compact `€0.00`. The shell gained an explicit active section, the primary action widened to 176 px, and the Overview now compacts EUR display without changing stored amounts.
2. Mobile inspection found a P2 command-bar wrap at 390 × 844. The mobile page label now yields to the persistent navigation and actions, and the primary action uses compact non-wrapping text. The revised capture has no horizontal overflow.
3. Interaction inspection found the theme state needed persistent restoration. The shell now subscribes to the local preference, synchronizes the document theme, and updates its accessible label. A reload retained dark mode, and a second toggle returned to light.
4. Final full-view and focused comparisons found no remaining actionable P0/P1/P2 difference. Remaining deviations are production-correct state/copy controls described above.

## Primary interactions tested

- Mobile navigation opens and closes and exposes the full grouped route list.
- First-reward checklist disclosure collapses and expands.
- Theme control changes its accessible label and document theme, persists through reload, and returns to light.
- 390 × 844 reports no horizontal overflow.
- Browser-rendered desktop and mobile states produced no console warning or error during the final interactive pass.

## Findings

No actionable P0, P1, or P2 fidelity finding remains.

## Follow-up polish

- P3: evaluate a user-specific display name/avatar when the Auth profile contract safely exposes one; the current role-only identity row avoids inventing or leaking profile data.

final result: passed

## Programme workflow completion — 2026-08-13

The follow-up product audit found that the original production Programme navigation was structurally incomplete despite using the approved shell. `Programme overview`, `Earning rules`, `Rewards`, and `VIP tiers` all resolved to the same monolithic editor; Earning rules and VIP tiers shared an identical fragment URL, Rewards was only a scroll target, and repeated fragment navigation could accumulate hashes. The approved `programme.dc.html`, `earning.dc.html`, `rewards.dc.html`, `tiers.dc.html`, and `HANDOFF.md` already specify distinct workflows, so the fix preserves that information architecture without changing the authoritative programme contract.

The completed implementation uses four real routes and one immutable draft model:

- `/programme` presents launch readiness, separate earning/reward/tier summaries, immutable version review/publication, and bounded administration activity.
- `/programme/earning-rules` focuses on per-tier purchase earning rates and an exact interactive order preview.
- `/programme/rewards` provides a guided first-reward state and editable WooCommerce-ready fixed, percentage, and free-shipping rewards.
- `/programme/vip-tiers` provides a distinct tier ladder, non-overlapping spend thresholds, earning-rate context, and member qualification preview.

Chrome QA at 1440 × 1024 and 390 × 844 verified the selected Hub shell, grouped Lucide navigation, active route state, desktop two-column composition, mobile single-column reflow, and zero horizontal overflow. Interaction checks proved first-reward creation, the populated reward editor, dynamic earning simulation (`€200` → Bloom → `1,200 points`), threshold-overlap blocking, responsive navigation opening/closing, and visible validation. No console warning or error was present in the final local interaction pass. The production build contains all four dynamic routes and the accessibility guard now covers the shared focused-workflow main landmark.

final programme workflow result: passed
