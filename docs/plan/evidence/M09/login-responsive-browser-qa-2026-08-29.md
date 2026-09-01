# Authentication responsive Chrome QA — 2026-08-29

Result: passed against source commit `f7e5a95542f94990fcd68dda3ef29b8f5c810c64`. Production, Auth, tenant membership, and loyalty value were not changed.

## Finding and correction

The exact-candidate production audit found that the company SSO row gave its organization-slug field only about 70 pixels at a 390-pixel viewport. Stacking the controls exposed a second defect: the taller card extended below the root scroll range, so the final guidance could not be reached.

The correction keeps the established card, tokens, and desktop composition; stacks only the company SSO input and action below 480 pixels; and makes the full-height authentication surface the bounded vertical scroll owner. A deterministic accessibility validator now requires the narrow layout, safe centering, and scroll boundary.

## Production-rendered evidence

Chromium exercised the optimized standalone Next.js bundle with an identity-free local Supabase sink. The sink rejected Auth requests and returned provider-unavailable responses; it supplied no session, tenant, customer, programme, or value fixture. The temporary browser driver and sink were removed after capture.

| Surface               | Evidence                                                                                              | Result                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1512 × 982 login      | [desktop](login-desktop-2026-08-29.png)                                                               | Card remains centered; one H1 and main landmark; first keyboard target is the visible skip link; zero horizontal overflow or browser diagnostics.                                                     |
| 390 × 844 login       | [mobile top](login-mobile-2026-08-29.png) and [mobile scroll end](login-mobile-bottom-2026-08-29.png) | Company SSO input and action are stacked at 276 pixels each. The 1,001-pixel surface has an exact 157-pixel scroll range, and the final session guidance is fully visible at its end.                 |
| 320 × 500 stress case | [compact](login-compact-2026-08-29.png)                                                               | No horizontal overflow. Keyboard traversal reaches the final company SSO action, automatically advances the authentication surface to `scrollTop = 356`, and leaves the focused action fully visible. |

The protected `/programme` request returned `307` with the same-origin relative target `/login?next=%2Fprogramme`; no `0.0.0.0` browser URL was produced. Login and public recovery stayed English-only, reached network idle, exposed one H1 and one main landmark, and emitted zero warnings, errors, or page exceptions. The public provider-unavailable state remained fail closed and repeated that store checkout stays available.

## Verification and limits

- `npm run accessibility:validate` passed with the new deterministic guards.
- `npm run build --workspace=@starfiniti/dashboard` passed and produced the audited standalone bundle.
- The exact production browser run reported no failure across desktop, mobile, compact keyboard, protected redirect, and public recovery checks.
- This focused run did not perform a real Supabase or Authentik login and makes no SSO-provider or production-canary claim. Those remain governed by the M01/M13 production gates.

Rollback restores the prior authentication layout only. It does not touch Auth configuration, memberships, sessions, programme state, connector state, coupons, or ledger value.
