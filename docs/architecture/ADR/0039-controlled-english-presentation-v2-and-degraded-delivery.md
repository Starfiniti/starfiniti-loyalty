# ADR-0039: Controlled English presentation V2 and independently degraded delivery

- Status: Accepted
- Date: 2026-08-25
- Module: M09 storefront and customer experience
- Extends: ADR-0036, ADR-0037, ADR-0038

## Context

The hosted member experience now exposes the complete loyalty journey, and the
WooCommerce connector renders a bounded local snapshot without a Hub request.
The original experience-theme boundary predates those surfaces. It controls a
brand colour, font, radius, two visibility switches, widget position, and a
small guest copy set, but the hosted member experience does not consume it.
Merchants cannot order sections, select a reviewed brand mark, choose content
density, preview real member/public/storefront/offline states, or see the final
mobile composition while editing.

Changing strict V1 JSON in place would break deployed readers. Keeping the new
choices only in React state would make the database cease to be the audited,
tenant-scoped authority. Allowing CSS, JavaScript, arbitrary URLs, uploads, or
remote fonts would create an executable-content, tracking, privacy, and outage
boundary that this module explicitly excludes.

Current platform guidance supports the selected boundary:

- Supabase recommends RLS plus explicit grants for exposed data and separate
  per-operation policies, and notes that missing grants fail before policies:
  <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase recommends invoker functions by default and requires an empty
  `search_path`, fully qualified objects, and explicit execute grants for
  security-definer commands:
  <https://supabase.com/docs/guides/database/functions>
- The 2026 Supabase changelog makes Data API exposure opt-in for new tables;
  this change therefore extends the existing explicitly granted RLS table and
  adds only deliberately granted functions:
  <https://supabase.com/changelog?types=breaking-change>
- WCAG 2.2 reflow expects usable vertical content at 320 CSS pixels, visible
  focus requires a persistent indicator, and non-essential motion should
  respect the user's reduced-motion preference:
  <https://www.w3.org/WAI/WCAG22/Understanding/reflow.html>,
  <https://www.w3.org/WAI/WCAG22/Understanding/focus-visible>, and
  <https://www.w3.org/WAI/WCAG22/Techniques/css/C39>.

## Decision

1. Add `ExperienceThemeDefinitionV2` while retaining every V1 contract,
   function, column, and reader. V2 contains the V1 safe tokens plus one exact
   seven-section order, `comfortable|compact` density,
   `none|sparkles|gift|crown` reviewed hero asset, and a referral-visibility
   boolean.
2. Store the new tokens as constrained columns on the existing tenant-scoped
   `loyalty.experience_themes` row. Existing rows receive outcome-equivalent
   defaults. The existing RLS policy and tenant-scope index remain applicable;
   no browser-supplied organization ID crosses the command boundary.
3. Add a separate `save_experience_theme_v2_command`. PostgreSQL derives the
   organization, locks the exact workspace/programme-group link and theme row,
   validates the complete order and allowlists independently, hashes the exact
   request, and appends minimized immutable audit evidence. V1 saves preserve
   V2-only fields.
4. Keep English as the only active presentation locale. The V2 copy object is
   English-only and uses the existing allowlisted copy columns. Stored legacy
   `sl-SI` rows and V1 functions remain for rollback/history but no active
   merchant, public, customer, preview, or WooCommerce path selects or renders
   them. Active writes use a selector-minimized, security-invoker
   `save_experience_copy_v2_command` that fixes the delegated guarded V1
   command to `en`; the browser cannot submit a locale. The editor is named
   **Customer copy**, not translations, and contains no locale switcher.
5. Add Auth-derived `get_my_loyalty_experiences_v2()` with no arguments. It
   retains the complete strict V1 value projection and adds only the
   database-derived presentation object for the exact linked workspace and
   programme group. V1 remains callable and immutable.
6. Add `get_public_loyalty_experience_v2(workspace, programme)` with no locale
   selector. It resolves English copy only and returns the bounded V1 public
   catalogue plus V2 presentation. The anonymous function receives an exact
   execute grant; source tables remain inaccessible to `anon`.
7. The dashboard prefers strict V2 readers and falls back only when the RPC is
   genuinely absent during a rolling deployment. Malformed, unauthorized, or
   provider-error responses fail closed and never downgrade to a looser
   interpretation.
8. Render hosted member navigation and sections from the exact persisted
   order, filtering only optional rewards, VIP, and referral sections when the
   corresponding database-authored visibility flag is false. Overview,
   earning, history, account, customer value, and privacy access cannot be
   hidden by presentation configuration.
9. Render reviewed Lucide assets by enum lookup. Merchant values never become
   component names, paths, SVG markup, HTML, CSS, URLs, or JavaScript. `none`
   renders no decorative asset. The old CSS-drawn background orbs are removed.
10. Replace the shallow editor preview with real English member, public, and
    WooCommerce-panel compositions; desktop/mobile and ready/guest/offline/
    empty controls affect preview state only. Native buttons expose ordering
    and viewport/state controls to keyboard and assistive technology.
11. A hosted customer read failure produces a generic, no-store recovery state
    with no tenant, balance, tier, reward, referral, or activity evidence.
    Public read failures produce an equally bounded temporary-unavailable page
    rather than a false not-found result. WooCommerce continues using its last
    valid local snapshot, stale guidance, native coupons, and local account
    route under total Hub failure.
12. All customer surfaces use semantic headings, logical DOM order, visible
    focus, forced-colour support, reduced-motion handling, 320-pixel reflow,
    and bounded copy. Presentation changes never mutate programme versions,
    reservations, coupons, commerce facts, or the immutable ledger.

## Alternatives

### Extend strict V1 JSON and RPC results in place

Rejected. Existing Zod readers are strict by design, so adding fields changes
successful historical responses into deterministic failures during rollout.

### Store layout choices only in the browser

Rejected. They would not propagate consistently to public, member, and
WooCommerce surfaces, would be unaudited, and could be forged per browser.

### Allow arbitrary uploads, URLs, CSS, fonts, or scripts

Rejected. This would require storage lifecycle, malware/content review, CSP,
tracking consent, privacy export/erasure, cache invalidation, and outage
behavior that are not justified by the current customer value. Reviewed local
asset keys cover the launch need without creating executable tenant content.

### Add a second theme table

Rejected. V2 is one additive current-state extension of the same tenant scope,
not an immutable programme contract. A second table would create synchronization
and partial-save ambiguity without improving rollback.

## Security and integrity effects

- All merchant mutation authority is derived from the active Auth session and
  live owner/admin membership in PostgreSQL. JWT metadata, browser fields, and
  copy values cannot select a tenant.
- Exact section membership is checked in contracts, PostgreSQL constraints,
  and the command. Duplicate, missing, unknown, or reordered-on-retry payloads
  cannot create ambiguous state.
- Public and customer projections contain no executable content, remote URL,
  secret, coupon, contact, internal numeric ID, ledger metadata, or referral
  identity. Reviewed asset keys map only to compiled Lucide components.
- Billing/entitlement presentation can disable enhancements but cannot hide
  core balance access, privacy export, accepted reservations, native coupons,
  refunds, reconciliation, or history.

## Operations

- Deploy the additive columns and V2 functions before application readers.
  Verify V1 and V2 side by side for the Starfiniti fixture and assert identical
  balances, rewards, tier, referral, and history facts.
- Deploy the dashboard preferring V2 while retaining RPC-absence fallback.
  No production tenant is switched to V2 presentation during this repository
  slice; M09-S06 owns the disabled deployment and pilot canary.
- Browser evidence covers editor/member/public/storefront preview at desktop,
  mobile, 200% reflow equivalent, light/dark, reduced motion, forced colours,
  keyboard order, offline/empty states, slow requests, and zero diagnostics.
- Database evidence covers grants, RLS, role separation, idempotency conflict,
  cross-tenant denial, exact order constraints, V1 compatibility, minimized
  public/Auth projections, and zero ledger/value mutation.

## Migration and rollback

The migration is additive. V2-only columns have safe defaults; V1 functions
and readers remain unchanged. Rollback first switches application reads and
writes back to V1, then stops rendering V2-only controls. Existing V2 columns
remain inert and auditable. Do not drop columns, legacy translations, or V2
functions during the rollback window.

If a controlled asset or layout causes a presentation regression, switch the
tenant to `none`, `comfortable`, and the canonical section order through the
same audited V2 command. No rollback path rewrites programme versions,
customer value, reservations, coupons, commerce events, or ledger history.
