# Starfiniti Loyalty — Developer Handoff

> Production design decision (2026-08-13): the product owner selected the Hub-style launch command center documented in root `design-qa.md`. It supersedes the original Overview composition while retaining the bounded production behaviors below. Merchant routes use one fixed Starfiniti/Lucide sidebar, compact command bar, data-backed launch checklist/performance/activity surfaces, and responsive drawer. There is no tenant or language switcher.

Design prototype → production (Next.js + TypeScript + Tailwind + Supabase). The prototype is the spec: every screen, state, and flow below exists as a working `.dc.html` page in this project. This doc maps them to the production architecture from the brief.

## 1. Route map (prototype file → production route)

Auth/onboarding: login (`/login`, `/forgot-password` states inline), onboarding (`/onboarding`, 5 steps, resumable).
Merchant app `/app/[workspace]/…`: overview, programme, earning, rewards, tiers, expiry, customers, customer-profile (`customers/[id]`), campaigns (+ full-screen `campaigns/new`), referrals, analytics (6 tabs, `?tab=`), experience, integrations, settings (4 tabs, `?tab=`).
Platform admin: admin (`/admin`, internal-only).
Customer demo `/demo/rosy-rewards[/account]`: rosy-rewards, rosy-account.
Storefront `/demo/storefront/…`: storefront-product, -cart, -checkout, -thankyou, -account.
WooCommerce plugin `/demo/woocommerce-admin/loyalty[/…]`: wc-loyalty, -connect, -storefront, -sync, -diagnostics, -settings. Shopify twin: shopify-loyalty.

## 2. Design tokens

Merchant SaaS (light): canvas #faf9f7, surface #fff, sidebar #fafaf9, borders #e7e5e4/#f5f5f4, text #1c1917 / #57534e / #78716c / #a8a29e, primary indigo #4f46e5 (primary buttons: gradient #4438c9→#6d4ef0, shadow rgba(83,70,230,.35)), active-nav #eef2ff/#4338ca, success #047857/#ecfdf5, warning #b45309/#fffbeb, danger #b91c1c/#fef2f2. Type: Geist, 13–13.5px UI, tabular-nums for figures. Radii: 8px controls, 12px cards. Shadow: 0 1px 2px rgba(0,0,0,.04).
Dark mode (from starfiniti-hub globals.css, "softer graphite"): bg #1F1F1E, surface #292927, sidebar #262625, elevated #343432, borders #3A3A37/#333330, text #E5E4DF/#C0BFB9/#A09F99, brand violet #9A85F0, status #3BB87C/#E0A23C/#E76B72. Persisted key `sf_dark`, `data-sf-dark` attr on html.
Plugin admin premium skin (from starfiniti-side-cart style.scss): accent #5346e6, gradient #4438c9→#6d4ef0, borders #e7e9f2, subtle #fafbfe, cards r14, controls r9, header 18px/800 + badge pill #eeedfc/#4438c9, uppercase 11px/700 micro-labels, metrics 22px/800.
Rosy Rewards (customer brand, themeable): default brand #b13d5e (CSS vars --rosy/--rosy-deep), cream #fdf8f6/#faf7f4, Lora display + Geist body, pill CTAs, r16–20 cards.

## 3. State contracts (prototype localStorage → Supabase tables)

- sf_published_v24 → program_versions (draft→published)
- sf_custom_rules → earning_rules · sf_custom_rewards → rewards · sf_tiers → tiers
- sf_custom_campaigns → campaigns · sf_flag_rok → referrals (fraud review)
- sf_adjustments + sf_audit → ledger_entries + audit_logs (adjustment writes both)
- sf_theme → experience_themes (brand, font, radius, hero, currency, sections, widget, surfaces, freqCap)
- rosy_wallet / rosy_orders / sf_ty_credited → wallets + ledger_entries (order earn credits once)
- sf_cart_reward → reward reservation (reserved → spent on order completion)
- sf_store → storefront demo switcher only (not production)
- sf_wc_fixed / sf_wc_store / sf_wc_connect → plugin-side connection + queue state
- sf_dark → user preference (profiles)

## 4. Behaviours to preserve (validated in prototype)

- Publish = review modal with explicit diff; drafts visibly badged until published.
- Manual adjustment: reason required, preview of resulting balance, typed warnings on removal, audit entry with actor.
- Tier threshold edit: overlap validation blocks save; movement preview names affected customers.
- Cart rewards: apply directly (no codes), one per order, states for min-basket/insufficient/one-per-order/service-down; totals + projected points recalc.
- Launcher never auto-opens; hidden on checkout; frequency cap configurable; drawer priority order per brief §5.18.
- Plugin is a thin connector: 4 read-only metrics max, deep links for programme management, retry queue with human-readable errors, typed-confirmation danger zone, redacted diagnostics.
- Liability language: distinguish influenced vs incremental revenue; issued/spent/expired/reserved/outstanding.

## 5. Component inventory (per brief §10)

App shell + switcher, page header, metric card, data table (sortable, saved views, mobile reflow ≤560px), filter bar, status badge, health indicator/strip, activity timeline, empty/loading/error states, confirmation dialog, full-screen create stepper, rule row, reward card, tier progression, customer identity header, wallet card, reward card (customer), live preview frame, command palette (⌘K), notifications popover, prototype state switcher (design-testing only).

## 6. Known prototype simplifications

Search index is static; charts are seeded SVG (recompute switches datasets, not live data); auth simulated; dark mode is override-based in the prototype but should be token-based (CSS vars) in production; Klaviyo degradation, connect failures, and 429 retry are scripted states.
