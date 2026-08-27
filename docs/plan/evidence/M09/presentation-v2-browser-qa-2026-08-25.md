# Presentation V2 Chrome QA — 2026-08-25

Result: passed after one blocking dark-theme contrast defect was found and corrected. The merchant editor, authenticated member Hub, and anonymous public page match the approved Starfiniti Hub structure, remain English-only, and preserve bounded offline behavior.

## Visual evidence

| Surface                  | Evidence                                                             | Result                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Merchant editor, desktop | [experience-v2-editor-desktop.png](experience-v2-editor-desktop.png) | Hub shell, controlled tokens, seven-section order, and deterministic preview remain visually coherent at 1512 × 982.                       |
| Merchant editor, mobile  | [experience-v2-editor-mobile.png](experience-v2-editor-mobile.png)   | One-column 390 × 844 composition with no page overflow.                                                                                    |
| Merchant editor, dark    | [experience-v2-editor-dark.png](experience-v2-editor-dark.png)       | Corrected controls use `rgb(229, 228, 223)` on `rgb(32, 32, 31)`; selected preview controls use `rgb(221, 214, 254)` on `rgb(60, 53, 83)`. |
| Member Hub, desktop      | [experience-v2-member-desktop.png](experience-v2-member-desktop.png) | Sidebar, live balance, earning, rewards, VIP, referrals, history, and account composition are present.                                     |
| Member Hub, mobile       | [experience-v2-member-mobile.png](experience-v2-member-mobile.png)   | Mobile navigation and cards reflow without page overflow.                                                                                  |
| Public page, desktop     | [experience-v2-public-desktop.png](experience-v2-public-desktop.png) | Anonymous programme story exposes no customer, order, balance, or referral identity.                                                       |
| Public page, mobile      | [experience-v2-public-mobile.png](experience-v2-public-mobile.png)   | Hero, actions, programme sections, and horizontal navigation remain usable without page overflow.                                          |

The desktop editor was compared in one visual review against the approved Experience Builder reference and the existing Starfiniti Hub shell. Spacing, border treatment, navigation grouping, typography hierarchy, preview proportion, and Lucide icon usage are consistent with that source while the implemented editor exposes the stricter production controls required by ADR-0039.

## Interaction and accessibility evidence

- Chrome used the real React components with realistic fixture data; the fixture route, proxy exception, and development-origin allowance were removed after capture and are not production code.
- Member, public, and WooCommerce preview selectors changed the active `aria-pressed` state. Desktop/mobile, ready/guest/offline states, optional referral visibility, and exact section reordering updated the same composition without form submission.
- Public keyboard traversal reached the skip link, programme identity, and ordered section navigation. The skip link becomes visible through its focus transform and shadow; customer navigation links expose a solid three-pixel focus outline.
- The semantic snapshot exposed one main landmark, labelled navigation, ordered headings, labelled controls, live/recovery status text, and meaningful links. Essential status never depended on colour alone.
- Reduced-motion emulation matched `prefers-reduced-motion: reduce`; merchant navigation and sidebar transition durations were both `0s`.
- A 640-pixel layout at 200% page scale produced a 320-pixel visual viewport with no horizontal page overflow. Direct 320-pixel checks also reported `scrollWidth === clientWidth` for editor, member, and public surfaces.
- The document language remained `en`; no language or locale switcher was rendered.
- The anonymous public DOM contained no fixture customer store or balance data.
- Fresh Chrome tabs reported zero warnings or errors after every final editor, member, public, keyboard, zoom, reduced-motion, and interaction check.

## Degraded delivery evidence

- The merchant preview displayed explicit last-verified offline content and native account access rather than invented live data.
- Hosted and public projection failures remain fail-closed recovery components covered by the dashboard suite.
- WooCommerce no-script guidance, stale local snapshots, unsafe-link rejection, native-coupon continuity, and forced Hub failure were already exercised in M09-S03/S04 browser and runtime evidence. Checkout has no synchronous Hub dependency.

## Finding closed during review

The first dark-theme capture showed light form surfaces with low-contrast labels. Commit `4f8be7a` added scoped dark presentation tokens for fields, optional-section cards, section ordering, preview controls, status copy, and pass/fail colours. The accessibility validator now fails if those selectors are removed. The corrected computed colours and clean-console capture are recorded above.
