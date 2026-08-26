# M12-S05 migration workspace browser QA — 2026-08-26

## Scope

- The production `MerchantShell`, `MigrationWorkflow`, and `MigrationHistory` components rendered from a temporary public local fixture against an optimized Next.js build. The fixture was removed and is not part of the product, Auth boundary, or final build.
- Chromium exercised a 1440 × 1000 desktop viewport and a 390 × 844 mobile viewport with synthetic receipts, one exactly reconciled batch, correction controls, light/dark themes, and `prefers-reduced-motion: reduce`.
- No production customer, source row, contact, store, tenant, credential, or loyalty value appeared in the fixture or captures.

## Findings and repair

- The first mobile inspection measured new migration form controls at 39 pixels, buttons at 38 pixels, and the correction checkbox at 13 pixels.
- The migration stylesheet now provides 42-pixel desktop controls, 44-pixel mobile form/action targets, an 18-pixel checkbox, a 44-pixel clickable confirmation row, and 44-pixel disclosure summaries.
- A sidebar capture taken during its transition looked empty; a settled capture and computed-style inspection confirmed all navigation items were visible, scrollable, and correctly positioned. No navigation defect remained.

## Passed evidence

- The page has one clear H1 and hierarchical H2–H4 sections for the workflow, applied batches, and receipts.
- Source, export reference/time, expiry policy, store selector, file input, correction reason, confirmation, and actions expose accessible names. The hidden native file input is represented by its visible labelled drop target.
- Generic CSV and both fixed-format adapters default to `apply_default`; exact expiry-lot preservation remains an explicit merchant choice rather than a hazardous default.
- Mobile document and main content overflow were both `0 px`. The workflow, six configuration fields, file control, primary action, reconciliation facts, disclosures, and receipts reflow to one readable column.
- Keyboard focus produced a visible 3-pixel solid outline. Reduced-motion media matched, and light/dark themes retained the workflow hierarchy.
- The rendered document language was English; Slovenian markers and language switchers were both `0`.
- Fresh-browser warnings/errors and page diagnostics were `0`.

## Captures

- [Desktop light overview](m12-migrations-desktop-light-2026-08-26.png)
- [Desktop dark workflow](m12-migrations-desktop-dark-2026-08-26.png)
- [Mobile import form](m12-migrations-mobile-form-2026-08-26.png)
- [Mobile reconciliation](m12-migrations-mobile-reconciliation-2026-08-26.png)

Result: pass. Production deployment, an approved redacted source, real value application, correction rehearsal, rollback, and observation remain fail-closed M12-S06 gates.
