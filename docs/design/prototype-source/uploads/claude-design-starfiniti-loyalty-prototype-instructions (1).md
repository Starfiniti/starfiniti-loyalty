# Claude Design Instructions

## Starfiniti Loyalty High-Fidelity Prototype

**Product:** Starfiniti Loyalty  
**Prototype URL/brand:** `loyalty.starfiniti.com`  
**Technology:** Next.js, TypeScript, Tailwind CSS, Supabase  
**Primary purpose:** Validate the complete merchant and customer experience before building the enterprise production platform  
**Last reviewed:** 2026-08-10

---

## Instructions for Claude Design

You are designing and building a high-fidelity, interactive prototype for **Starfiniti Loyalty**, a multi-tenant loyalty platform that will eventually support Shopify, WooCommerce, and other commerce systems.

This is not a simple landing page and not a collection of disconnected mock screens. Build a coherent SaaS product prototype with realistic data, working navigation, persistent Supabase-backed configuration, responsive customer views, and several complete end-to-end workflows.

The prototype must be polished enough to:

- Demonstrate to merchants and potential clients
- Test product structure and terminology
- Validate programme creation workflows
- Validate the visual hierarchy and usability
- Guide the later enterprise implementation
- Serve as a reusable design reference for the Shopify app and WooCommerce plugin

Do not attempt to implement the complete enterprise event engine, immutable production ledger, real Shopify app, real WooCommerce plugin, billing system, queues, webhooks, or compliance infrastructure in this prototype. Represent those systems convincingly through typed interfaces, realistic statuses, seeded data, and simulated connection states.

If `starfiniti-loyalty-self-improving-master-plan.md` is present, read it for product and domain context. This prototype brief controls the implementation scope.

---

## 1. How you should work

Do not stop at the first functional render.

Use this design loop:

1. Understand the product, users, workflows, and terminology.
2. Inspect any existing repository, components, assets, and design tokens.
3. Briefly research the current product patterns used by strong commerce and SaaS platforms such as Shopify Admin, Stripe, Linear, Rivo, Smile, and LoyaltyLion. Use them for interaction-pattern research only. Do not clone their design or copyrighted visual identity.
4. Define a clear visual direction and design system before building all screens.
5. Build the application shell and one representative screen first.
6. Render and inspect the screen at desktop and mobile widths.
7. Correct hierarchy, spacing, typography, density, accessibility, and interaction weaknesses.
8. Extend the validated system across all routes.
9. Implement the required interactive flows.
10. Populate Supabase with realistic demonstration data.
11. Test every route and primary interaction in the browser.
12. Capture and inspect final desktop and mobile states.
13. Score the prototype using the quality rubric in this document.
14. Improve the weakest areas until the overall score reaches at least 90/100 and no category is seriously weak.

Maintain a short `DESIGN_LOG.md` containing:

- Visual direction and reasoning
- Important UX decisions
- What was changed after browser inspection
- Known prototype limitations
- Recommended questions for user testing

You may improve screen structure, terminology, interactions, and component choices when doing so makes the product clearer. Record material improvements in `DESIGN_LOG.md`. Do not silently remove required functionality.

---

## 2. Users and primary outcomes

### 2.1 Merchant owner or loyalty manager

The merchant wants to:

- Connect a Shopify or WooCommerce store
- Launch a points and rewards programme
- Configure earning rules, expiry, tiers, and rewards
- Understand whether the programme is performing
- See outstanding points liability
- Find a customer and understand every points movement
- Create a campaign without developer assistance
- Customize the customer-facing experience
- Confirm integrations are healthy

### 2.2 Merchant support agent

The support agent wants to:

- Find a customer quickly
- See the customer’s balance, tier, order context, rewards, and timeline
- Understand why points were awarded, spent, expired, or reversed
- Make a controlled manual adjustment with a required reason
- Avoid accidentally changing the wrong organization or programme

### 2.3 Merchant customer

The shopper wants to:

- See points and their value
- Understand how to earn more
- See VIP progress
- Browse and redeem rewards
- Review transaction history
- Share a referral link
- Understand when points expire

### 2.4 Starfiniti platform administrator

The Starfiniti administrator wants to:

- See connected organizations and store health
- Enter a clearly marked support view
- Diagnose connection problems
- Never confuse Starfiniti administration with merchant administration

The Starfiniti super-administration area may remain a limited prototype route. Merchant and customer experiences are the priority.

---

## 3. Visual direction

Create an original, premium commerce-operations interface.

### 3.1 Desired character

- Trustworthy and precise
- Modern without looking like a generic AI product
- Friendly enough for marketers
- Structured enough for finance and operations
- Calm, fast, and understandable
- Visually premium but not decorative

### 3.2 Recommended design language

- Light-first interface with warm white or very light neutral canvas
- Near-black primary text rather than pure black
- Deep indigo or cobalt as the primary action colour
- Emerald for healthy/positive states
- Amber for warnings and pending states
- Red reserved for destructive or failed states
- Optional soft rose accent in the Rosy Rewards preview only
- Crisp 1px borders and subtle elevation
- Moderate corner radii, not excessive pill-shaped UI
- Data-dense tables balanced by generous page spacing
- Clear typographic hierarchy
- Use one modern sans-serif typeface with strong numeric rendering
- Small, meaningful motion for drawers, previews, success states, and step transitions

### 3.3 Avoid

- Purple gradient SaaS clichés
- Excessive glassmorphism
- Giant rounded cards everywhere
- Decorative charts without decisions attached
- Low-contrast grey text
- Emoji as the primary icon system
- Overuse of badges
- Mobile layouts that simply shrink desktop tables
- Empty screens that look unfinished
- Fake customer quotes or invented business claims

Use Lucide or another consistent open icon set. Customize components so the result does not look like an untouched component-library starter.

---

## 4. Information architecture

Use a persistent left navigation on desktop and an appropriate drawer or simplified navigation on smaller screens.

### Primary merchant navigation

1. **Overview**
2. **Programme**
   - Programme overview
   - Earning rules
   - Rewards
   - VIP tiers
   - Points expiry
3. **Customers**
4. **Campaigns**
5. **Referrals**
6. **Analytics**
7. **Experience**
   - Loyalty page
   - Widget
   - Product and cart blocks
8. **Integrations**
9. **Settings**
   - Organization and workspaces
   - Team and roles
   - Notifications
   - Audit log

### Persistent shell elements

- Organization and workspace switcher
- Current programme state: Draft, Live, Paused, or Needs attention
- Global search or command action
- Notifications
- Help/support
- Current user menu
- Connection-health indicator when attention is required

The interface must always make it clear which organization, brand, workspace, and programme the user is editing.

---

## 5. Required routes and screens

Build all routes below. The most important routes must be deeply interactive. Secondary settings routes can be lighter but must still look intentional and complete.

### 5.1 Authentication

Routes:

- `/login`
- `/forgot-password`

Requirements:

- Clean branded login
- Email and password or magic-link option
- Demo-account shortcut for reviewers
- Proper error, loading, success, and expired-link states
- Supabase Auth using the current recommended Next.js server-side pattern

### 5.2 Guided onboarding

Route:

- `/onboarding`

Create a five-step onboarding experience:

1. Organization and brand
2. Connect store
3. Choose programme foundation
4. Brand the customer experience
5. Review and launch checklist

Store connection choices:

- Shopify
- WooCommerce
- Explore in demo mode

For this prototype, connections are simulated. The interaction should look credible and explain which permissions/data will eventually be synchronized. Include success, connecting, failed, and retry states.

Programme foundations:

- Points and rewards
- VIP tiers
- Referrals
- Start from Rosy Rewards example

Allow users to leave onboarding and resume later.

### 5.3 Overview dashboard

Route:

- `/app/[workspace]/overview`

The dashboard should answer:

- Is the programme healthy?
- What changed?
- Is loyalty creating customer activity?
- Are there configuration or integration problems?
- What should the merchant do next?

Include:

- Programme health and live status
- Loyalty members
- Member revenue
- Repeat-purchase rate
- Reward redemption rate
- Outstanding points liability
- New members and recent activity trend
- Tier distribution
- Top-performing rewards
- Recent programme activity
- Integration health
- A concise recommendation or next-best action card

Charts must have readable labels, comparison periods, accessible colours, useful tooltips, and empty/loading/error states.

### 5.4 Programme overview

Route:

- `/app/[workspace]/programme`

Show the entire programme as a comprehensible system:

- Currency name and conversion
- Current programme version
- Status and last published time
- Active earning rules
- Active rewards
- VIP tier structure
- Expiry policy
- Customer preview
- Draft changes awaiting publication

Provide actions:

- Edit programme
- Preview as customer
- Simulate an order
- Publish changes
- View version history

Publishing must use a review modal that summarizes what will change. The prototype does not need a production rules engine, but it must persist draft configuration and version records.

### 5.5 Earning rules

Route:

- `/app/[workspace]/programme/earning`

Show rules as readable structured cards or rows, not raw JSON.

Required example rules:

- Purchase: 5 points per EUR 1 for Rose tier
- Purchase: 6 points per EUR 1 for Bloom tier
- Purchase: 7 points per EUR 1 for Icon tier
- Create account: 100 points
- Birthday: 300 points
- Product-category bonus: 2x points

Create a fully interactive **Add earning rule** flow using a drawer or focused modal:

1. Choose event
2. Set award
3. Add conditions
4. Add exclusions
5. Set schedule
6. Review

Include duplicate-rule warning, conflict state, draft state, disabled state, and scheduled state.

### 5.6 Rewards catalogue

Route:

- `/app/[workspace]/programme/rewards`

Include:

- EUR 5 discount for 500 points
- EUR 10 discount for 1,000 points
- Free shipping for 700 points
- Free gift for 1,500 points
- VIP-only early access

Create a complete **Add reward** workflow with:

- Reward type
- Points cost
- Customer-facing name and description
- Minimum basket
- Products/categories
- Tier eligibility
- Expiry after issue
- Usage limits
- Visual icon/image
- Review and save

Show active, draft, scheduled, paused, and depleted states.

### 5.7 VIP tiers

Route:

- `/app/[workspace]/programme/tiers`

Display the tier system visually as a progression:

- Rose: EUR 0 to EUR 149.99, 5 points per EUR 1
- Bloom: EUR 150 to EUR 499.99, 6 points per EUR 1
- Icon: EUR 500 to EUR 999.99, 7 points per EUR 1
- Optional Icon Plus preview above EUR 1,000

Allow the merchant to:

- Edit thresholds
- Edit earning multiplier
- Add benefits
- Choose qualification period
- Configure downgrade and grace period
- Preview how many customers move tiers

Include a warning when thresholds overlap or create a gap.

### 5.8 Points expiry

Route:

- `/app/[workspace]/programme/expiry`

Show:

- Current policy: 12 months after earning
- Points due to expire in 30, 60, and 90 days
- Estimated value
- Notification schedule
- Customer-facing explanation
- Example timeline

Allow the merchant to preview policy changes without rewriting historical data.

### 5.9 Customers list

Route:

- `/app/[workspace]/customers`

Build a polished, useful table with:

- Customer
- Balance and monetary value
- Tier
- Tier progress
- Lifetime spend
- Orders
- Last activity
- Expiring points
- Risk/status

Include:

- Search
- Filters
- Saved views
- Column control
- Sort
- Pagination
- Bulk action entry point
- Empty and loading states

### 5.10 Customer profile

Route:

- `/app/[workspace]/customers/[customerId]`

This is one of the most important screens.

Show:

- Customer identity and connected commerce account
- Balance and monetary value
- VIP status and progress
- Lifetime spend and orders
- Available and redeemed rewards
- Referral activity
- Expiring points
- Complete points timeline
- Related order or action for every timeline entry
- Human-readable explanation of why points changed

Implement a **Manual adjustment** flow:

- Add or remove points
- Required reason
- Optional internal note
- Preview resulting balance
- Confirmation step
- Audit entry

Use strong warnings for point removal. Do not present manual adjustment as a casual one-click action.

### 5.11 Campaigns

Routes:

- `/app/[workspace]/campaigns`
- `/app/[workspace]/campaigns/new`

Include realistic campaigns:

- Double points weekend
- Win back inactive members
- Bloom tier challenge
- Birthday-month bonus

Build a campaign creation flow:

1. Goal
2. Audience
3. Incentive
4. Schedule
5. Budget/liability estimate
6. Customer message preview
7. Review and schedule

Show scheduled, active, completed, draft, and stopped states.

### 5.12 Referrals

Route:

- `/app/[workspace]/referrals`

Show:

- Referral programme settings
- Advocate reward
- Friend reward
- Qualification condition
- Cooling/return period
- Referral funnel
- Top advocates
- Recent referrals
- Flagged referrals
- Customer referral-page preview

Include a small fraud-review interaction for a flagged referral.

### 5.13 Analytics

Route:

- `/app/[workspace]/analytics`

Create tabs or sections for:

- Overview
- Members
- Rewards
- Tiers
- Campaigns
- Liability

Always distinguish:

- Members versus non-members
- Influenced revenue versus proven incremental revenue
- Issued, spent, expired, reserved, and outstanding points

Include comparison periods, filters, export action, definitions/tooltips, and clear no-data states.

### 5.14 Experience builder

Routes:

- `/app/[workspace]/experience`
- `/app/[workspace]/experience/loyalty-page`
- `/app/[workspace]/experience/widget`

Build a split-screen editor:

- Configuration controls on the left
- Live responsive customer preview on the right

Allow editing:

- Logo
- Colour tokens
- Font choice from a safe list
- Border radius
- Hero message
- Points currency name
- Section visibility/order
- Reward-card style
- Widget position
- Logged-in and logged-out states
- Desktop and mobile preview

Changes should persist in Supabase and immediately update the preview.

### 5.15 Integrations

Route:

- `/app/[workspace]/integrations`

Create cards for:

- Shopify
- WooCommerce
- Klaviyo
- Starfiniti Hub
- Gorgias
- Webhooks/API

Show connected, available, degraded, and coming-soon states. A connected integration should open a useful detail drawer with sync health, last sync, scopes, errors, test connection, and reconnect actions.

### 5.16 Settings

Routes:

- `/app/[workspace]/settings/general`
- `/app/[workspace]/settings/team`
- `/app/[workspace]/settings/notifications`
- `/app/[workspace]/settings/audit`

Include:

- Organization and workspace details
- Programme timezone and base currency
- Team members and roles
- Notification preferences
- Audit log with actor, action, target, time, and context

The audit log must look searchable and useful, not like raw developer logs.

### 5.17 Customer-facing loyalty experience

Routes:

- `/demo/rosy-rewards`
- `/demo/rosy-rewards/account`

Build both desktop and mobile experiences.

Logged-out loyalty page:

- Branded hero
- Programme explanation
- Ways to earn
- Rewards
- Tier benefits
- Referral explanation
- FAQ
- Join/sign-in call to action

Logged-in loyalty account:

- Points balance and EUR value
- Tier and progress
- Next-best action
- Reward carousel/catalogue
- Available reward
- Expiring-points message
- Transaction history
- Referral link and sharing
- Clear redemption confirmation

This experience should look like the merchant’s brand, not like the Starfiniti admin dashboard.

### 5.18 Storefront loyalty surfaces for Shopify and WooCommerce

Do not make a generic popup the entire loyalty programme. Design one connected storefront experience across seven surfaces, with the floating launcher acting as a shortcut rather than the destination.

#### 1. Dedicated rewards hub

- Shopify: branded storefront page plus a full-page Customer Account extension
- WooCommerce: branded page or block plus `My Account > Rewards`
- Show balance, points value, tier and progress, rewards, ways to earn, transaction history, expiring points, referrals, and FAQ
- Provide strong logged-out join and sign-in states

#### 2. Floating launcher and wallet drawer

- Persistent but unobtrusive launcher at the lower-left or lower-right edge
- Desktop: 400 to 440 pixel side drawer
- Mobile: accessible bottom sheet or near-fullscreen panel
- Guest state: programme teaser, benefits, join, and sign-in
- Member state: balance, tier, available reward or next target, and expiring-points warning
- Drawer priority: balance; tier progress; available reward or next target; expiry; ways to earn; referral; link to full rewards hub
- Never auto-open on every page. Make triggers and frequency caps configurable
- Include close, focus management, keyboard navigation, and reduced-motion behavior

#### 3. Product-page earning block

- Place near the price or add-to-cart area: `Earn 48 Rosy Points with this purchase`
- Show guest, member, tier multiplier, and bonus-campaign variants
- Open a small popover or the wallet drawer for an explanation
- Reserve layout space to prevent page shift

#### 4. Cart loyalty module

- Show current balance, projected points from the order, eligible rewards, and progress to the next reward
- Let members apply an eligible reward directly where the commerce integration supports it; do not force them to copy a code
- Design states for available, insufficient balance, minimum basket not met, applied, reserved, ineligible, and application failure
- Recalculate totals and points clearly after a reward is applied or removed

#### 5. Customer account

- Add a compact balance and tier summary to the account home
- Link to a detailed rewards hub with ledger history, reward status, expiry, and referrals
- Keep terminology and balances consistent with the storefront drawer and cart

#### 6. Checkout, thank-you, and order-status experiences

- Keep checkout messaging calm: reward applied and estimated points to be earned
- Make thank-you messaging more prominent: points earned, new balance, tier progress, and next action
- Do not make Shopify checkout-step placement a core dependency because it is plan-dependent; the core journey must still work through cart, account, and thank-you surfaces
- Prototype WooCommerce Blocks and supported classic checkout placements

#### 7. Contextual nudges

- Use a compact toast, inline banner, or badge instead of a generic marketing modal
- Examples: `120 points until your next reward`, `Reward unlocked`, `Points expire in 14 days`, `You reached Bloom`, and `2x points today`
- Display one message at a time, cap frequency, and never interrupt checkout

#### Platform delivery map

| Shopper surface | Shopify delivery | WooCommerce delivery | Priority |
| --- | --- | --- | --- |
| Launcher and drawer | Theme app extension app embed | Plugin storefront component | Required |
| Product earning message | Theme app block | Block, shortcode, or supported hook | Required |
| Cart reward module | Theme app block and cart integration | Cart Block integration plus classic-cart hook | Required |
| Full rewards hub | Storefront page plus account full-page extension | Page or block plus My Account endpoint | Required |
| Account summary | Customer Account UI extension | My Account endpoint | Required |
| Thank-you and order status | Supported UI extension targets | Order-received block or hook | Required |
| Checkout step | Checkout UI extension where the Shopify plan supports it | Checkout Blocks plus supported classic path | Optional |

#### Merchant controls in the experience builder

Let merchants configure:

- Enabled storefront surfaces by platform and theme
- Launcher side, spacing, icon, label, and unread badge
- Desktop drawer versus popup behavior and mobile bottom-sheet behavior
- Open triggers, frequency caps, and suppressed pages
- Brand colors, type, radius, shadows, icon style, and light or dark treatment
- Guest, authenticated, tier, reward, expiry, and error messages
- Product and cart placement guidance with installation status
- Locale, translated copy, currency, and points terminology
- Live previews for desktop and mobile in every important state

#### Required storefront prototype routes

- `/demo/storefront/product`
- `/demo/storefront/cart`
- `/demo/storefront/account`
- `/demo/storefront/account/rewards`
- `/demo/storefront/checkout`
- `/demo/storefront/thank-you`

Add a clearly labeled prototype state switcher that can change guest or member status, tier, balance, available reward, bonus campaign, integration error, viewport, and Shopify or WooCommerce delivery context. The switcher is a design-testing tool and should not resemble production customer UI.

#### Performance and failure behavior

- Load the launcher asynchronously with a small initial payload and lazy-load history and catalogue data
- Do not block product, cart, or checkout interaction
- Degrade safely when the loyalty service is unavailable: preserve commerce flow, explain that rewards are temporarily unavailable, and never display stale success
- Keep privileged keys and private customer data out of storefront code
- Design for slow connections, storefront caching, strict content-security policy, translations, and long localized copy

---

## 6. Required end-to-end interactive flows

At minimum, the following must work from start to finish:

1. Log in using the demonstration merchant account.
2. Complete or resume onboarding.
3. Connect a simulated WooCommerce or Shopify store.
4. Create and save an earning rule.
5. Create and save a reward.
6. Edit VIP tier thresholds and see validation.
7. Preview and publish programme changes.
8. Search for a customer and open the profile.
9. Perform a manual points adjustment with confirmation and audit entry.
10. Create and schedule a double-points campaign.
11. Customize the loyalty page and see a live preview.
12. Switch between merchant admin and customer preview.
13. Redeem a demonstration reward in the customer experience.
14. View the resulting customer timeline entry.
15. Open the storefront launcher as both a guest and a signed-in member.
16. View points earning and a bonus multiplier on a product page.
17. Apply an eligible reward in the cart and see totals and balance update.
18. Complete the demonstration checkout and view earned points on the thank-you page.

Prototype operations may use simplified database logic, but they must persist across refreshes and maintain believable state transitions.

---

## 7. Demonstration data

Create reproducible Supabase seed data. Make all business numbers clearly demonstration data.

### Organization

- Organization: Nina & Valentin Demo
- Brand: Nina & Valentin
- Workspace: Slovenia Store
- Platform: WooCommerce
- Programme: Rosy Rewards
- Status: Live with draft changes
- Currency: EUR
- Timezone: Europe/Ljubljana

### Example dashboard values

- Loyalty members: 12,842
- New members this month: 684
- Member revenue in selected period: EUR 184,320
- Repeat-purchase rate: 38.6%
- Reward redemption rate: 14.8%
- Outstanding points liability: EUR 8,462.70
- Integration health: Healthy

### Example customers

Use realistic fictional Slovenian and international names. Include:

- One high-value Icon-tier customer
- One customer close to Bloom tier
- One new Rose-tier customer
- One customer with points expiring soon
- One customer with a refunded order and points reversal
- One customer with a flagged referral

Add at least 30 customer rows so the table feels credible. Generate enough ledger/activity rows for filtering, charts, and timelines.

Clearly identify fictional data in the README and demo environment.

---

## 8. Supabase prototype architecture

Use Supabase for real prototype persistence, authentication, and tenant-aware data access.

### Required baseline tables

- `profiles`
- `organizations`
- `organization_members`
- `brands`
- `workspaces`
- `commerce_connections`
- `programs`
- `program_versions`
- `earning_rules`
- `rewards`
- `tiers`
- `customers`
- `customer_identities`
- `wallets`
- `ledger_entries`
- `campaigns`
- `referrals`
- `experience_themes`
- `audit_logs`

This is a prototype schema. Keep it clean and migration-based, but do not pretend it is the complete production ledger or integration model.

### Data rules

- Every tenant-owned table must include or derive organization/workspace scope.
- Enable Row Level Security on every exposed table.
- Create membership-based RLS policies for the demonstration merchant.
- Never expose a service-role key to the browser.
- Use publishable client credentials only with correct RLS.
- Use server-only logic for privileged prototype mutations.
- Store schema changes in `supabase/migrations`.
- Store demonstration data in reproducible seed files.
- Provide a clean local reset workflow.

If a remote Supabase project is unavailable, complete migrations, seed data, typed repository interfaces, and setup documentation. An explicit `DEMO_MODE` fallback is acceptable only if it is clearly labelled and uses the same repository contracts. Do not silently replace Supabase with local browser storage.

---

## 9. Next.js implementation requirements

Use the current stable Next.js App Router with:

- TypeScript strict mode
- Tailwind CSS
- Server Components by default
- Client Components only for interactive islands
- Current Supabase SSR utilities for browser/server clients and cookie-based sessions
- Route groups and layouts for auth, onboarding, merchant app, and customer demo
- Typed validation for all forms
- Accessible component primitives
- Consistent loading, empty, success, warning, and error states
- Responsive tables that become cards, summaries, or focused lists on mobile
- URL-addressable filters and tabs where useful

Recommended supporting libraries may include:

- shadcn/ui or Radix primitives, heavily customized
- Lucide icons
- React Hook Form
- Zod
- Recharts or another accessible chart library
- date-fns

Do not add dependencies merely for minor convenience. Record important dependency choices in the README.

### Suggested structure

```text
src/
  app/
    (auth)/
    onboarding/
    app/[workspace]/
    demo/rosy-rewards/
  components/
    app-shell/
    charts/
    customers/
    experience-builder/
    forms/
    loyalty/
    programme/
    ui/
  features/
    analytics/
    campaigns/
    customers/
    integrations/
    programme/
    referrals/
  lib/
    supabase/
    auth/
    demo/
    validation/
  styles/
supabase/
  migrations/
  seed.sql
```

Adjust the structure if the existing repository already has a coherent convention.

---

## 10. Design system deliverables

Create reusable tokens and components for:

- Colours
- Typography
- Spacing
- Radius
- Elevation
- Motion
- Chart colours
- Status colours
- Focus states

Required reusable components include:

- App shell and workspace switcher
- Page header
- Metric card
- Data table
- Filter bar
- Status badge
- Health indicator
- Activity timeline
- Empty state
- Loading skeleton
- Error state
- Confirmation dialog
- Form drawer
- Stepper
- Rule builder row
- Reward card
- Tier progression
- Customer identity header
- Responsive loyalty wallet card
- Customer reward card
- Live preview frame

Document important components on an internal `/design-system` route or a lightweight component showcase.

---

## 11. Accessibility and responsive requirements

- Target WCAG 2.2 AA for the prototype.
- All interactive elements must work by keyboard.
- Use visible focus indicators.
- Provide labels and descriptions for icon-only actions.
- Do not rely on colour alone for status.
- Meet contrast requirements.
- Respect reduced-motion preferences.
- Provide appropriate table semantics on desktop.
- Create intentional mobile transformations rather than horizontally overflowing every table.
- Test at approximately 390px, 768px, 1280px, and 1440px widths.
- Test browser zoom and long translated labels.

The customer-facing loyalty experience is mobile-first. The merchant application is desktop-first but must remain usable on tablets and mobile for common support tasks.

---

## 12. Prototype boundaries

Do implement:

- Real Supabase Auth and RLS where credentials/environment allow
- Migration and seed files
- Persistent programme configuration
- Persistent demo customer adjustments and audit entries
- Interactive programme design workflows
- Simulated integration health
- Real browser navigation and responsive behaviour
- Visual and interaction polish

Do not implement yet:

- Real Shopify OAuth or App Store application
- Real WooCommerce plugin
- Production webhooks or queues
- Production immutable double-entry ledger
- Real discounts in Shopify/WooCommerce
- Production referral fraud detection
- Billing and subscriptions
- Production notifications
- Enterprise SSO
- Full legal/compliance implementation
- Infrastructure scaling

Mark simulated functionality honestly in the prototype and README. Do not use prominent “fake” labels inside the merchant experience unless needed, but include a consistent demo-environment indicator.

---

## 13. Browser testing and refinement

After implementation:

1. Run the complete app.
2. Visit every required route.
3. Execute every required interactive flow.
4. Inspect console and network errors.
5. Capture representative desktop and mobile screenshots.
6. Inspect screenshots directly, not only the code.
7. Check visual consistency across all routes.
8. Check long content, empty states, errors, loading, and success states.
9. Check keyboard navigation and focus order.
10. Check that data persists after refresh.
11. Check that one tenant cannot access another tenant’s seeded data.
12. Run lint, type check, build, and available tests.
13. Fix all critical and obvious high-severity issues.

Do not declare the prototype complete if routes exist but the main flows are dead buttons or disconnected mockups.

---

## 14. Prototype quality rubric

Score the final prototype with evidence:

| Category | Points |
| --- | ---: |
| Visual hierarchy and consistency | 15 |
| Product and loyalty-domain clarity | 15 |
| Interaction completeness | 15 |
| Visual polish and originality | 15 |
| Responsive design and accessibility | 15 |
| Realism and usefulness of data | 10 |
| Screen and state completeness | 10 |
| Code/build quality for a prototype | 5 |

Completion target:

- At least 90/100 overall
- No category below 70% of its available points
- No broken primary flow
- No critical accessibility issue in the tested routes
- No cross-tenant data access in the prototype schema
- No unresolved build or type-check failure

When below target, identify the weakest category, make focused improvements, rerun the relevant checks, and update `DESIGN_LOG.md`.

---

## 15. Required final deliverables

Deliver:

1. Runnable Next.js prototype
2. Supabase migrations and seed data
3. `.env.example`
4. `README.md` with exact setup and demo instructions
5. `DESIGN_LOG.md`
6. Complete merchant route structure
7. Customer-facing Rosy Rewards demo
8. Demonstration login or documented local account creation
9. Browser-tested interactive flows
10. Final quality score with evidence
11. Known limitations and recommended next design tests
12. Screenshots of the main desktop and mobile experiences if the environment supports them
13. Storefront launcher, drawer, product, cart, account, checkout, and thank-you prototypes
14. Guest, member, tier, reward, expiry, loading, empty, and error states

The README must clearly explain that this is a product-design prototype and not yet the production loyalty engine.

---

## 16. Definition of done

The prototype is done when a merchant can:

- Log in
- Complete onboarding
- See a useful loyalty dashboard
- Understand the entire programme
- Add an earning rule
- Add a reward
- Edit tiers
- Publish a draft programme version
- Find a customer
- Make an audited demonstration points adjustment
- Schedule a campaign
- Customize and preview the customer experience
- Inspect integration health
- Configure where loyalty components appear in the storefront
- Preview guest and member states on desktop and mobile

The customer can:

- Understand the programme
- See balance and value
- See tier progress
- Browse and redeem a demonstration reward
- Review transaction history
- Copy a referral link
- Discover the programme from a product page or launcher
- Apply an eligible reward in the cart
- Understand points earned after purchase

The design must feel like one coherent product, not separate generated pages. The Supabase data must persist. Primary flows must work. Desktop and mobile must be inspected. The final result must be polished enough for a client demonstration and structured enough to guide the enterprise build.

---

## Start now

Begin by inspecting the repository and any existing design assets. Then define the visual system and build one representative dashboard screen plus the customer loyalty wallet at desktop and mobile sizes. Inspect and refine those foundations before extending the system across all required routes.

When you discover a clearer workflow or better design pattern, improve the plan, explain the decision in `DESIGN_LOG.md`, and continue. Preserve the required outcomes and prototype boundaries.
