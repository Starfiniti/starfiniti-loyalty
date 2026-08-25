# M11 programme-group sharing browser QA — 2026-08-26

## Scope

A temporary public fixture rendered the real `MerchantShell` and `ProgrammeSharingForm` with a strict isolated-policy fixture containing one connector-protected store and two available stores. The temporary route, proxy exception, disabled-prefetch change, and Chrome protocol script were removed after capture; no fixture state or test bypass remains in production code.

## Environments

- Native Chrome desktop: 1512 × 982 CSS pixels
- Native Chrome mobile: 390 × 844 CSS pixels
- `prefers-reduced-motion: reduce`
- English document and product copy

## Results

- Desktop rendered exactly one page heading inside the real Hub-style sidebar/application shell and the named “Multi-store programme scope” region.
- Initial isolated state selected exactly one workspace. The connected Primary store control was disabled, visibly marked Connected, and retained in the submitted selector set through a separate exact hidden value.
- Switching to explicit shared wallet deterministically retained the protected store, added one exact available store, enabled review, and produced the reviewed summary “Primary store, Outlet.”
- Review-before-save displayed the programme name, exact selected stores, mandatory confirmation, and a visible forced keyboard-focus style on the commit button.
- Reduced-motion emulation removed the sharing-card transition (`0s`). The page exposed no language selector or Slovenian copy.
- At 390 pixels, mode and workspace cards collapsed to one column, the mobile menu remained available, content wrapped without document-level horizontal overflow, and the protected state remained readable.
- Unexpected HTTP responses, failed requests, browser console warnings/errors, and page exceptions: `0`. The intentional initial blank-document cancellation and absent optional favicon were excluded.
- Final production server log after prefetch was disabled for the fixture contained no application errors. Production code was rebuilt after removing every fixture-only change.

## Evidence

- [Desktop reviewed shared scope](m11-sharing-desktop-2026-08-26.png)
- [Mobile isolated scope](m11-sharing-mobile-2026-08-26.png)

Production Auth/RLS, database replay, concurrent revision conflict, and tenant canary remain separate gates.
