# Starfiniti Loyalty Enterprise Roadmap

Last reviewed: 2026-09-01

This is the active delivery plan after production `v0.1.10`. It supersedes the broad unfinished phases in `docs/product/MASTER_PLAN.md`; completed phase evidence remains historical truth in `docs/plan/TASKS.yaml`.

## Finish definition

Starfiniti Loyalty is enterprise-ready when:

- WooCommerce earning, rewards, VIP, referrals, campaigns, communications, customer experience, analytics, integrations, migration, agency administration, tenant SSO/SCIM, and managed billing pass their module gates.
- A real store passes value reconciliation, outage, recovery, refund, expiry, coupon, and credential-rotation tests.
- Managed tenants can use Stripe Billing while self-hosted AGPL deployments make no Stripe or remote-licence call.
- Every module scores at least 90/100, every scored category reaches 80% of its available points, and no deterministic critical gate fails.
- Shopify, stored-value credit, gift cards, and cash redemption remain outside the active scope. English is the only active product language.

## Execution loop

Every coherent slice follows the same measured loop:

1. Reconstruct repository and production reality from a clean `origin/main`; preserve unrelated local work separately.
2. Research current official provider documentation, compare at least two viable approaches for material decisions, and record the choice and rollback in an ADR.
3. Define the hypothesis, baseline, target, failure modes, security boundaries, rollout, rollback, and required browser/API/worker/database/connector/operational evidence in `TASKS.yaml` before implementation.
4. Build one vertical slice: versioned contracts, additive migrations, domain behavior, worker/connector, merchant UI, and customer delivery. Incomplete behavior stays behind a server-authoritative feature flag.
5. Test tenancy, authorization, idempotency, concurrency, retry, refund/reversal, privacy, outage, rollback, accessibility, and backward compatibility.
6. Score the slice, fix its largest evidenced weakness, and repeat until the module gate passes.
7. Deploy disabled, canary the Starfiniti tenant, observe and reconcile, then update evidence, plans, risks, scorecard, changelog, contracts, integration docs, and runbooks.

An unavailable external credential delays only that production gate. Work continues on the next safe dependency-complete module.

## Module graph

| Module | Outcome                                                                | Depends on           | Production gate                                                        |
| ------ | ---------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| M00    | Repository reality, executable task graph, competitive baseline, score | released foundations | Repository truth is reconstructable and every later gate is measurable |
| M01    | Real WooCommerce pilot and recovery proof                              | M00                  | Zero unexplained value/coupon difference; checkout survives outages    |
| M02    | Deployment mode, entitlements, and server-side rollout                 | M00                  | Billing/flags cannot hide value, block recovery, or interrupt checkout |
| M03    | Competitive versioned earning rules                                    | M02                  | Simulator/live parity and exactly one historical effect                |
| M04    | Expanded native and manual rewards                                     | M03                  | Every authored reward is fulfilable; ambiguity never releases points   |
| M05    | Advanced VIP, expiry, and progression                                  | M04                  | Boundaries/refunds/downgrades pass; V1 outcomes remain identical       |
| M06    | Referrals and fraud review                                             | M05                  | Attribution and rewards are replay-safe, reversible, and ledger-backed |
| M07    | Segments and campaigns                                                 | M06                  | Concurrent budgets/quantity cannot be exceeded                         |
| M08    | Notifications, SMTP, Klaviyo, and webhooks                             | M07                  | Consent is immediate; provider outage cannot affect value or checkout  |
| M09    | Storefront and customer experience                                     | M08                  | Desktop/mobile/accessibility pass with zero checkout hub dependency    |
| M10    | Analytics, reporting, and liability                                    | M09                  | Financial aggregates reconcile exactly to source evidence              |
| M11    | Multi-store, currency, service APIs, and ecosystem                     | M10                  | Explicit sharing, exact currency evidence, isolated/replay-safe APIs   |
| M12    | Traceable migration framework                                          | M11                  | Reruns duplicate nothing and every point traces to a batch/source row  |
| M13    | Enterprise administration, tenant SSO, and SCIM                        | M12                  | Deprovisioning is immediate and all cross-tenant forgery fails closed  |
| M14    | Managed Stripe billing and usage                                       | M13                  | Replay/out-of-order safe; delinquency preserves existing loyalty value |
| M15    | Enterprise hardening and GA                                            | M14                  | No critical/high issue; capacity/recovery/canary claims have evidence  |
| M16    | Continuous self-improvement                                            | M15                  | Monthly/quarterly evidence and rescoring remain current                |

M01 may wait for real-store access while M02 proceeds. Later modules remain sequential unless an ADR proves that parallel work cannot create contract, value, rollout, or evidence ambiguity.

## Module slices

### M00 — Reality, task graph, and competitive evidence

- Preserve stale work, branch from current `origin/main`, map released capability to production evidence, replace broad remaining phases with stable module IDs, publish the competitor matrix, product score, and evidence format.
- Gate: every later module has dependencies, owner inputs, metrics, acceptance, failure modes, verification, rollout, rollback, and evidence locations.

### M01 — Production baseline and real WooCommerce pilot

- Connect one approved store; publish a controlled programme/reward; link a test customer; exercise award, release, redemption, capture, refunds, expiry, reconciliation, key rotation, retries, and recovery.
- Force hub/worker outages, verify checkout, then perform Auth/application/signing-secret/database/WAL clean-room recovery and reconcile each order, event, ledger effect, balance, and coupon.

### M02 — Deployment mode, entitlements, and feature flags

- Add `self_hosted` and `managed`, a versioned database-authoritative entitlement catalogue, effective-dated limits, provider price references, audit, tenant canaries, and percentage rollout.
- Self-hosted access remains locally controlled without Stripe. Disabling features preserves history, balances, refunds, reconciliation, promised redemptions, exports, and checkout.

### M03 — Competitive earning rules

- Add `ProgrammeDefinitionV2` with purchase, account, birthday, verified review, referral, and signed custom-activity sources; scoped conditions/exclusions; one base purchase rule; highest-priority multiplier; explicit fixed bonuses; per-member/order caps; explanation traces; rule catalogue, simulator, conflict review, and signed activity API.
- Retain V1 readers/evaluation and reject browser self-reported social activity.

### M04 — Expanded rewards and fulfilment

- Add fixed/percentage/free-shipping/free-product native rewards plus exclusive/custom manual fulfilment, restrictions, limits, availability, inventory/budget reservation, templates, previews, operations, and summaries.
- Preserve FIFO point reservation and reservation-aware ambiguous-outcome recovery. Maximum-capped percentages and stored value remain unsupported.

### M05 — Advanced VIP, expiry, and progression

- Add lifetime/rolling/calendar qualification across spend, points, orders, referrals, and verified actions; AND/OR thresholds; entry/retention/re-entry/grace/downgrade/override; non-cash benefits; expiry administration/notifications/liability; progress/history/performance.
- Migrate Rose/Bloom/Icon to equivalent V2 behavior without changing live results.

### M06 — Referrals and fraud review

- Add one opaque advocate code/link, first eligible attribution in a 1–90 day window, cooling-period qualification, normal ledger rewards, minimized fraud signals, manual review, reversible decisions, customer sharing/progress, and merchant funnel/fraud views.

### M07 — Audiences, segments, and campaigns

- Add versioned allowlisted segments and bonus, multiplier, milestone, win-back, tier, referral, and limited campaigns with schedules/timezones, snapshots, caps, budgets/liability, control groups, atomic capacity, calendar, forecast, approval, pause/cancel, and immutable explanations.

### M08 — Notifications and Klaviyo

- Add provider-neutral events, consent/suppression/purpose/template/deduplication/scheduling/retry/dead-letter state, local transactional SMTP, managed Klaviyo sync, signed generic webhooks, English templates, test delivery, and health views.
- Logs exclude secrets, coupon plaintext, raw PII, and ledger metadata.

### M09 — Storefront and customer experience

- Expand hosted loyalty into overview/earning/rewards/VIP/referrals/history/account states; add cached WooCommerce My Account/product/cart/checkout/post-purchase placements and an optional budgeted progressive panel; add controlled assets, branded order/copy/spacing, discovery, affordability, progress, sharing, and expiry warnings.
- Prove keyboard, screen-reader, zoom, reduced-motion, contrast, mobile, slow/offline behavior and native checkout/coupons under total hub outage.

### M10 — Analytics, reporting, and liability

- Publish a metric dictionary and exact points/liability/breakage/forecast, activation/participation/purchase/value, reward/tier/referral/campaign/cohort/retention reports, controlled exports, and scheduled delivery.
- Separate influenced from experimentally incremental revenue and reconcile every aggregate to immutable evidence.

### M11 — Multi-store, currency, API, and ecosystem

- Add explicit isolated/shared programme groups, versioned currency-rate evidence and rounding, scoped service accounts/API keys, rotation/rate limits, signed outbound webhooks, idempotent activity/customer APIs, TypeScript/PHP contracts, and integration health/data-flow/deletion views.
- Required GA integrations are WooCommerce, SMTP, Klaviyo, and generic APIs/webhooks; other connectors require measured demand.

### M12 — Migration framework

- Add canonical import for identities/balances/lots/tiers/referrals/history; dry-run validation/deduplication/mapping/reconciliation/fingerprint; traceable opening-balance transactions; idempotent CSV, WPLoyalty, YITH, and WooRewards adapters; compensating corrections and before/after reports.
- Add Smile/Rivo/LoyaltyLion/Yotpo adapters only where stable documented exports exist.

### M13 — Enterprise administration, tenant SSO, and SCIM

- Add organization lifecycle, invitations/offboarding, seven separated roles, per-organization OIDC/SAML federation through Authentik, SCIM 2.0 users/groups with hashed organization credentials and allowlisted mapping, invitation/provisioning-only membership, break-glass access, expiring support, agency portfolios, and tenant-visible support history.
- Supabase Auth remains the session issuer; live database membership/RLS remains authority.

### M14 — Managed billing and usage metering

- Add Stripe only for `managed`: customer/subscription references, verified idempotent webhooks, checkout/portal/lifecycle/grace, externally configured Price IDs, source-fact usage metering, protected delinquency behavior, and effective-dated approved manual contracts.
- Never store card data or enforce payments in self-hosted deployments.

### M15 — Enterprise hardening and GA

- Measure capacity; inject worker/network/database/provider/retry failures; complete code/dependency/container/secret/licence/SBOM/DAST/infra scans; resolve independent penetration findings; prove clean-room recovery/RPO/RTO; complete dashboards/alerts/runbooks/on-call/incidents; run a 30-day reconciled canary; verify product claims and obtain owner GA approval.
- ADR-0112 supplies a production-disabled digest-pinned central monitoring
  candidate plus a least-authority native textfile agent and disposable Linux
  canary. It does not satisfy approved-host, live-source, receiver, dead-man,
  exercise, reconciliation, or production-activation gates.

### M16 — Continuous self-improvement

- Monthly metrics/error/support/reconciliation/fraud/campaign/churn/usability/performance/security/billing review; convert recurring failures into tests/validators/monitors/runbooks/rules; review provider changes; rescore material changes; run quarterly recovery/isolation/privacy/SCIM/incident exercises; maintain an evidence-ranked backlog and ADR history.
- ADR-0116 promotes exact merged `main` only as the 83/100 candidate subject and
  advances three R-004 controls to merged. Production remains v0.1.11 at 54/100;
  release, deployment, activation, observation, reconciliation, and elapsed
  review gates remain open.
- ADR-0107 now provides one cutoff-bound engineering classification for all thirteen provider/platform/recovery entries. It does not satisfy the elapsed monthly review, candidate acceptance, independent review, owner approval, deployment, or reconciliation gates; M16 remains 77/100.
- ADR-0113 makes every future monthly, quarterly, reconciliation, score, and approval V1 artifact a closed minimized schema. Unknown members, boundedness failures, duplicates, machine-detectable personal or credential material, and control or bidirectional text fail closed; private inputs remain environment-owned and extension requires a superseding version.

## Compatibility and authority boundaries

- New public definitions/events/APIs are versioned. V1 programme readers and immutable V1 evaluation remain supported.
- Merchant commands accept public selectors, idempotency keys, and correlation IDs only; PostgreSQL derives tenant, actor, wallet, programme, and value authority.
- Customer commands derive active Auth/customer links and accept no customer, channel, or tenant authority.
- WooCommerce commands remain signed, bounded, leased, idempotent, recoverable, and asynchronous to checkout.
- Schema changes are additive, explicitly granted, RLS-protected, backward-compatible, and accompanied by forward-fix/rollback guidance.

## External owner inputs

[`OWNER_GATES.md`](OWNER_GATES.md) is the generated, priority-ordered handoff for every remaining owner, approved-environment, credential, independent-review, maintenance, elapsed-canary, and GA gate. It is derived from the authoritative fourteen-item [`IMPROVEMENT_BACKLOG.yaml`](IMPROVEMENT_BACKLOG.yaml), validated by `npm run owner-gates:validate`, and distinguishes current evidence artifacts from evidence that can only be created after the external action occurs.

Credentials, receiver destinations, private inventories, customer data, and provider payloads remain outside Git. An owner approval is scoped to one gate and does not imply merge, release, deployment, reboot, destructive exercise, canary, tenant, ledger, database, billing, or GA authority. External inputs do not block repository implementation of the next safe module.
