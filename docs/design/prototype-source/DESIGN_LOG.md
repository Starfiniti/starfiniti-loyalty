# DESIGN_LOG — Starfiniti Loyalty prototype

## Visual direction
- shadcn component anatomy used literally (36px controls, 1px stone borders, 8px control radius / 12px card radius, shadow-sm, sidebar-07-style app shell, dialog + sheet patterns) — not re-invented lookalikes.
- Starfiniti skin on top: warm-white canvas #faf9f7, stone neutrals, deep indigo #4f46e5 primary, emerald/amber/red status colors, Geist type with tabular numerals, Lucide icons.
- Rosy Rewards customer experience is deliberately a different brand: cream #fdf8f6 canvas, rose #b13d5e, Lora serif display, pill buttons, 16–20px radii, mobile-first ≤480px column.

## Scope decisions
- Design prototype only (user-confirmed): no Next.js/Supabase. Flow state (publish draft, wallet redemptions) persists via localStorage so demos survive refresh.
- Screens are separate .dc.html pages linked by the sidebar; active nav item is hard-set per page.

## UX decisions
- Publish is a review modal summarizing v2.3 → v2.4 diff before confirming; draft chip and header CTA disappear after publish (persisted).
- Reward redemption uses a bottom sheet with explicit cost + resulting balance, then a success state with code; new ledger row appears in history and balance updates.
- Liability metric shows both € and outstanding points.

## Route map (all built)
- login.dc.html (sign in / forgot / magic link / expired states, demo shortcut)
- onboarding.dc.html (5 steps, simulated store connection w/ fail+retry, resumable)
- overview.dc.html · programme.dc.html (publish flow, order simulator, versions)
- earning.dc.html (6-step add-rule drawer, dup warning, all rule states)
- rewards.dc.html (4-step add-reward drawer, active/draft/scheduled/paused/depleted)
- tiers.dc.html (editable thresholds, overlap validation, movement preview)
- expiry.dc.html (30/60/90 buckets, policy-change preview)
- customers.dc.html (34 seeded rows, search/filters/views/sort/pagination/bulk)
- customer-profile.dc.html (timeline w/ reasons, audited manual adjustment)
- campaigns.dc.html (6-step wizard w/ liability estimate + message preview)
- referrals.dc.html (funnel, advocates, fraud-review interaction)
- analytics.dc.html (6 tabs; influenced vs incremental; points-flow liability)
- experience.dc.html (split-screen editor, live preview, persisted theme)
- integrations.dc.html (connected/degraded/available/coming-soon + detail drawer)
- settings.dc.html (general/team/notifications/searchable audit log)
- rosy-rewards.dc.html (logged-out page) · rosy-account.dc.html (wallet)

## Cross-page state (localStorage)
sf_published_v24, sf_custom_rules, sf_custom_rewards, sf_tiers, sf_custom_campaigns,
sf_adjustments + sf_audit (profile → audit log), sf_flag_rok, sf_theme, sf_onboarding,
rosy_wallet (customer redemption → merchant profile timeline).

## Round 3 additions (10 Aug 2026)
- admin.dc.html: Starfiniti platform-admin route — dark internal theme, INTERNAL badge, org/store health table, degraded-store diagnosis interaction, "support view" confirmation that logs to the merchant audit trail. Linked from login footer.
- Working notifications panel on all 12 topbar-bell pages (4 seeded items → deep links, settings link).
- Functional date-range dropdown on Overview and Analytics.
- Chart hover tooltips (per-day values) on the Overview trend chart.
- Rosy account: two-column layout at ≥760px (balance/rewards left, referral/history right); single column on mobile.

## Storefront layer (brief §5.18, 10 Aug 2026)
- New pages: storefront-product, storefront-cart, storefront-checkout, storefront-thankyou, storefront-account (Nina & Valentin store look, Rosy loyalty surfaces).
- Floating launcher + 420px wallet drawer (guest/member states, expiry warning, ways to earn, referral, hub link); hidden on checkout; footer notes delivery mechanism + frequency cap.
- Product earning block near price with guest/member/2×-bonus/service-down variants, reserved layout height.
- Cart module: projected points, apply/remove rewards with instant total updates (no codes); states: applicable, applied, min-basket not met, insufficient balance, one-per-order, service unavailable. Applied reward persists through checkout → thank-you.
- Thank-you: points earned, new balance, tier progress, redeemed-reward note; guest retro-claim variant.
- Prototype state switcher (bottom-left, clearly non-production): guest/member, Shopify/WooCommerce delivery labels, 2× bonus, service unavailable. Persisted in sf_store.
- Experience builder: storefront surface toggles + drawer frequency cap, persisted in sf_theme.
- Flows 15–18 from the updated brief all work end-to-end.

## WooCommerce plugin admin (brief §5.19, 10 Aug 2026)
- 6 wp-admin routes in a faithful WordPress frame (admin bar, left nav, WooCommerce > Loyalty submenu, nav-tabs, WP notices/buttons; labeled WP-ADMIN PROTOTYPE): wc-loyalty (overview), wc-loyalty-connect (5-step setup: env checks → one-time auth w/ pending state → workspace + plain-language scopes → background reconciliation w/ progress → surfaces + connection test; resumable), wc-loyalty-storefront (7 surfaces w/ status/placement/test/enable, emergency hide-all, block vs classic guidance, deep links to Starfiniti builder), wc-loyalty-sync (queue summary, job table, failed 429 reversal → Inspect → Retry → recovered health across Overview too), wc-loyalty-diagnostics (9 sequential health checks, redacted log, support-bundle download, copy status, test event), wc-loyalty-settings (connection, event families, privacy, fallback, permissions, typed-confirmation danger zone, credential rotation).
- Boundary kept explicit: plugin is a connector; all programme management deep-links to loyalty.starfiniti.com. Flows 19–22 work end-to-end; linked from Integrations → WooCommerce card.

## WC plugin premium restyle (10 Aug 2026)
- Matched the Loyalty plugin admin to the Starfiniti Cart design system read from Starfiniti/starfiniti-side-cart (assets/admin/style.scss): indigo #5346e6 accent, #4438c9→#6d4ef0 gradient primary buttons + active nav pills, white pill nav bar, 14px-radius #e7e9f2-border cards, 3px gradient accent line + white brand header (18px/800 + CONNECTED badge), 22px/800 metrics with uppercase micro-labels, 9px-radius inputs/buttons, emerald #22c55e status greens. WordPress chrome (admin bar, wp nav) intentionally kept native.

## Round 4 (10 Aug 2026): dark mode + coherence
- Dark mode on all 14 merchant pages: moon toggle in topbar, persisted (sf_dark), init before paint. Palette is the Hub's approved "softer" warm graphite read from starfiniti-hub globals.css (#1F1F1E canvas, #292927 surfaces, #262625 sidebar, #3A3A37 borders, #E5E4DF/#C0BFB9/#A09F99 text, violet #9A85F0 accents, dark-adjusted status colors). Implemented as attribute-scoped overrides of the inline-style values (hex + rgb serialized forms).
- Theme propagation: rosy + storefront pages now read sf_theme — brand colour via --rosy/--rosy-deep vars, points currency name, hero message. Experience-builder edits show up live on the customer pages.
- Points continuity: thank-you page credits the wallet once (balance + rosy_orders entry) → rosy account history and merchant profile reflect the storefront purchase.
- SaaS primary buttons adopted the #4438c9→#6d4ef0 gradient (matches plugin/Cart).
- A11y: :focus-visible rings on all merchant + customer pages; customers table reflows to stacked cards ≤560px; Overview trend chart draws in (reduced-motion safe).

## Round 5 (10 Aug 2026): go-list extras
- Overview trend chart recomputes per date range (7d/30d/90d/YTD datasets, hover titles, animated redraw).
- Dark mode extended to the 6 plugin admin pages (same Hub graphite tokens; toggle in the wp-admin bar; shared sf_dark key).
- shopify-loyalty.dc.html: optional Shopify admin twin (Polaris-style frame, theme-app-extension surface list, plan-gated checkout note); linked to wc-loyalty for comparison.
- HANDOFF.md: developer handoff spec (route map, tokens incl. dark palette, localStorage→Supabase contracts, behaviours to preserve, component inventory, simplifications).
- Demo Deck.dc.html: 10-slide client demo deck on deck-stage with live prototype screenshots (screenshots/), speaker notes, PPTX-exportable.

## Known limitations
- Mobile (≤900px): sidebar becomes a hamburger + slide-in drawer on all merchant pages; wide tables scroll horizontally rather than reflowing to cards.
- Search, notifications, date-range are visual affordances only.
- Charts are static SVG (values consistent with seeded numbers).

## Vendored runtime security patch (29 Aug 2026)

- `deck-stage.js` and generated `support.js` now authenticate both the exact
  parent/self `WindowProxy` and its load-time origin before reading host/editor
  `message` data. Missing parent referrer evidence fails closed. ADR-0097 and
  the M15 security validator deliberately preserve this local patch when the
  upstream design runtime is refreshed.

## Final QA pass (10 Aug 2026)
- All 18 routes loaded individually: zero console errors.
- Verifier-checked: overview (desktop + tablet), customer profile (adjustment flow), earning (full-screen create flow), customers (table + mobile nav patch).
- Create flows converted from drawers to full-screen pages per stakeholder feedback.
- Mobile nav (hamburger + drawer) added to all 14 merchant pages.

## Self-score vs. brief rubric (evidence-based)
- Visual hierarchy & consistency 14/15 · Domain clarity 14/15 · Interaction completeness 13/15
- Visual polish & originality 13/15 · Responsive & accessibility 12/15 (tables scroll, not card-reflow; reduced-motion not yet handled)
- Data realism 9/10 · Screen/state completeness 9/10 · Prototype code quality 4/5
- Total ≈ 88–90/100. Weakest: responsive tables + reduced-motion → first candidates for the next pass.

## Recommended UX improvements — BUILT (10 Aug 2026)
1. ⌘K command palette on all 11 search-bar pages (customers, rewards, rules, pages; keyboard + click, esc to close).
2. Campaigns: status filter chips (All/Active/Scheduled/Completed/Draft/Stopped) + "Add follow-up" nudge on completed campaigns.
3. Expiry → one-click "Create reminder campaign" (writes into Campaigns, persisted).
4. Tier movement preview now names example affected customers.
5. Customers table drops secondary columns below 760px (customer/tier/balance/status remain); prefers-reduced-motion honoured on all 18 pages.
Customer-facing wording (earn/redeem/expiry clarity) left as a user-testing question — copy already states 100 pts = €1 and expiry rules everywhere.

## Recommended user-testing questions
- Do merchants understand "draft changes" vs "published version"?
- Is "points liability" the right term for finance users?
- Do customers understand expiry messaging before redeeming?
