# Starfiniti Loyalty

## Self-Improving Enterprise Build Plan for Codex or Claude

**Product:** `loyalty.starfiniti.com`  
**Purpose:** Enterprise-grade, multi-tenant loyalty platform for Shopify and WooCommerce  
**Document role:** Master product mandate, execution plan, quality contract, and agent operating procedure  
**Status:** Living plan  
**Last reviewed:** 2026-08-10

---

## 1. Instructions to the coding agent

Read this document completely before changing code. Treat it as a living engineering contract, not a frozen checklist.

Your job is to build the strongest practical version of Starfiniti Loyalty. You are explicitly authorized to improve this plan when research, implementation evidence, testing, platform changes, security findings, performance data, or a better architecture shows that part of it is weak or outdated.

You must not blindly follow a bad instruction. You must also not silently ignore or weaken an instruction. When you find a better approach:

1. Describe the problem with the existing plan.
2. Research the issue using current primary documentation and repository evidence.
3. Compare at least two realistic approaches when the choice is material.
4. Record the decision in an Architecture Decision Record, or ADR.
5. Update the living plan, task dependencies, tests, risks, and documentation.
6. Preserve a migration or rollback path where working code or stored data is affected.
7. Continue implementation after the updated plan passes its relevant review gate.

Do not lower quality gates merely to declare success. Do not label the platform enterprise-ready until every enterprise release gate in this document is supported by evidence.

### 1.1 Decisions you may make autonomously

You may autonomously:

- Improve module boundaries, database indexes, APIs, internal contracts, queues, caching, test strategy, observability, deployment workflows, developer tooling, and task order.
- Add missing tasks, tests, documentation, security controls, migration steps, reconciliation jobs, operational tooling, or failure handling.
- Split a large phase into smaller production-grade slices.
- Replace an unproven dependency when evidence shows a better maintained, more secure, or better licensed option.
- Refactor working code when the benefit is documented and regression tests exist.
- Stop and repair architectural debt that would make later work unsafe.
- Remove dead code, obsolete experiments, and superseded documentation after confirming they are not user-owned or required.

### 1.2 Decisions requiring explicit product-owner approval

Stop and ask the product owner before:

- Removing Shopify or WooCommerce support.
- Changing the platform from multi-tenant to single-tenant.
- Making a commerce plugin the source of truth for points.
- Allowing points balances to be edited without ledger transactions.
- Weakening tenant isolation, auditability, encryption, privacy, refund correctness, idempotency, or backup requirements.
- Automatically sharing customer data between unrelated organizations.
- Changing the legal or monetary interpretation of points, cash rewards, gift cards, or store credit.
- Introducing production access, production credentials, destructive production changes, or irreversible data migrations.
- Changing the commercial scope, pricing model, or ownership/licensing model.
- Making a decision where two valid options produce materially different merchant or customer behaviour.

### 1.3 Working rules

- Never assume the previous agent session is correct. Verify repository state, tests, migrations, documentation, and current platform APIs.
- Never rely only on chat history. Persist state inside the repository.
- Never implement from memory when current Shopify, WooCommerce, security, privacy, or dependency documentation can be checked.
- Prefer primary documentation, source code, standards, and reproducible tests over blog posts.
- Pin API versions and record when documentation was checked.
- Use small, reviewable changes with tests and clear rollback paths.
- Do not create fake production integrations, placeholder security, silent error suppression, or tests that only prove mocks call mocks.
- Do not hardcode Rosy Rewards, Nina & Valentin, Petspemf, Starfiniti, Slovenia, EUR, or a single language into the domain engine.
- Do not introduce microservices simply to appear enterprise. Begin with a well-structured modular monolith and extract services only when measured operational or scaling needs justify it.
- Do not use Redis, caches, Shopify, or WordPress as the authoritative ledger.
- Do not identify or merge customers by email alone.
- Do not mutate production schema without a versioned migration, backup, compatibility analysis, and tested rollback or compensating procedure.
- Do not expose customer personal data in logs, traces, analytics, exception messages, or support screens without a justified role and masking policy.

---

## 2. Product mandate

Build a central loyalty platform that supports multiple organizations, brands, stores, markets, currencies, languages, and commerce systems.

Shopify and WooCommerce are connectors and execution channels. Starfiniti Loyalty is the source of truth for:

- Loyalty programmes and their published versions
- Points and credits
- Wallets and balances
- VIP tiers and tier history
- Rewards and reward reservations
- Referrals and referral qualification
- Campaign eligibility and attribution
- Loyalty-related audit history
- Loyalty liability reporting

Commerce platforms remain the source of truth for orders, products, refunds, fulfilments, customers within that channel, and native discount execution.

The first real-world acceptance programmes should be:

1. **Rosy Rewards on WooCommerce** with 100 points equal to EUR 1, 12-month expiry, automatic tier progression, tier thresholds of EUR 150, EUR 500, and EUR 1,000, and earning rates of 5, 6, and 7 points per EUR 1.
2. **A Shopify pilot**, preferably Petspemf or another controlled Starfiniti Shopify store.
3. **A multi-brand test programme** proving that a loyalty currency can be intentionally shared between approved brands while unrelated tenants remain completely isolated.

These are acceptance cases, not hardcoded domain rules.

---

## 3. Product and engineering invariants

The following invariants cannot be traded away for speed.

### 3.1 Ledger invariants

- Every points or credit change is represented by an immutable ledger transaction.
- Every transaction records organization, programme, workspace, wallet, source, reason, timestamp, rule version, idempotency key, actor, and correlation ID where applicable.
- Corrections use reversals or compensating transactions. Historical rows are never silently rewritten.
- Duplicate source events cannot create duplicate business effects.
- Partial refunds reverse only the correct attributable amount.
- Pending, available, reserved, spent, expired, and reversed states are explicitly modelled.
- A reward redemption cannot spend the same points twice.
- Monetary values use integer minor units. Points use integers or a formally defined fixed-precision representation.
- Multi-currency awards store the order currency, amount, programme base currency, conversion rate, conversion source, and conversion timestamp.

### 3.2 Multi-tenancy invariants

- Every tenant-owned record is scoped through a trusted organization or workspace relationship.
- PostgreSQL Row Level Security protects all tenant-owned tables where technically applicable.
- Service-role access exists only in trusted backend processes and is never exposed to a browser or plugin.
- Tenant isolation is verified with automated adversarial tests.
- Cross-brand identity and shared wallets require an explicit programme-group policy.
- Customer records are not merged solely because email addresses match.

### 3.3 Commerce invariants

- Webhooks are treated as at-least-once and potentially out of order.
- The system creates exactly-once business effects through inbox storage, idempotency constraints, transactional writes, and reconciliation.
- Store checkout must continue to function if Starfiniti Loyalty is temporarily unavailable.
- The platform must be able to reconstruct and reconcile loyalty effects from commerce data.
- Installation, reinstallation, token rotation, uninstall, deletion, API throttling, and temporary commerce outages are first-class workflows.

### 3.4 Security and privacy invariants

- Least privilege applies to users, service accounts, API scopes, platform tokens, and support access.
- Sensitive credentials are encrypted and rotatable.
- Administrative and support actions are auditable.
- Privacy deletion, export, retention, consent, and suppression workflows are implemented and testable.
- No payment-card data is stored.
- The platform does not claim SOC 2, ISO 27001, GDPR compliance, or another certification without appropriate legal or audit evidence. It may be designed to support those controls.

---

## 4. Required repository operating system

Before feature development, create and maintain the following files. If equivalent files already exist, preserve and improve them rather than duplicating them.

```text
AGENTS.md
PLANS.md
STATUS.md
QUALITY_SCORECARD.md
RISKS.md
CHANGELOG.md
docs/
  product/
    PRODUCT_REQUIREMENTS.md
    DOMAIN_GLOSSARY.md
    PROGRAMME_EXAMPLES.md
  architecture/
    SYSTEM_ARCHITECTURE.md
    DATA_MODEL.md
    EVENT_MODEL.md
    IDENTITY_MODEL.md
    ADR/
  security/
    THREAT_MODEL.md
    PRIVACY_MODEL.md
    DATA_CLASSIFICATION.md
    INCIDENT_RESPONSE.md
  integrations/
    SHOPIFY.md
    WOOCOMMERCE.md
    KLAVIYO.md
  operations/
    RUNBOOKS.md
    BACKUP_RESTORE.md
    DEPLOYMENT.md
    SLOS.md
  testing/
    TEST_STRATEGY.md
    PLATFORM_MATRIX.md
    LOAD_TEST_PLAN.md
  api/
    VERSIONING.md
    WEBHOOKS.md
    IDEMPOTENCY.md
  plan/
    TASKS.yaml
    ITERATION_LOG.md
```

### 4.1 `AGENTS.md`

Keep it concise. It must state:

- Repository layout
- Required reading order
- Build, test, lint, type-check, migration, and local-development commands
- Security and ledger invariants
- Review rules
- Definition of done
- Which documents must be updated when behaviour changes

Do not put the entire master plan into `AGENTS.md`. Reference this document and `PLANS.md`.

### 4.2 `PLANS.md`

This is the current human-readable execution plan. It must contain:

- Current objective
- Current phase
- Completed work with evidence
- Active work
- Next safe tasks
- Dependencies and blockers
- Decisions awaiting approval
- Quality gates and commands
- Known risks
- Links to relevant ADRs

### 4.3 `docs/plan/TASKS.yaml`

Maintain a machine-readable task ledger. Every task should include:

- Stable ID
- Title
- Phase
- Status: proposed, ready, in_progress, blocked, verification, completed, or superseded
- Dependencies
- Acceptance criteria
- Verification commands
- Relevant risks
- Relevant documentation
- Implementation owner or agent session when useful
- Completion evidence

Only one task should normally be `in_progress` for one agent. Parallel agents may work only on independent tasks with non-overlapping write scope.

### 4.4 `STATUS.md`

This is the session handoff. Update it before ending meaningful work. It must say:

- What currently works
- What is partially implemented
- What is broken
- Last commands run and their results
- Current database migration state
- Current branch and important uncommitted changes
- Next recommended task
- Exact blocker, if any

### 4.5 Decision records

Use ADRs for material choices. An ADR must include:

- Context
- Decision
- Alternatives considered
- Security and data-integrity effects
- Operational effects
- Migration and rollback implications
- Status and date

Never delete superseded ADRs. Mark them superseded and link the replacement.

---

## 5. Self-improving execution loop

Run this loop for every meaningful task and every resumed session.

### Step 1: Reconstruct reality

1. Read `AGENTS.md`, this master plan, `PLANS.md`, `STATUS.md`, open risks, and relevant ADRs.
2. Inspect Git status, recent commits, active migrations, dependency lockfiles, and the relevant modules.
3. Run the smallest trustworthy baseline checks for the affected area.
4. Compare documented state with actual state.
5. Repair stale documentation before relying on it.

### Step 2: Validate the next task

1. Confirm the task contributes to the current phase exit gate.
2. Confirm dependencies are complete.
3. Identify affected tenants, data, APIs, security boundaries, and failure modes.
4. Check whether current official platform documentation changes the assumptions.
5. Split the task if it cannot be safely implemented and verified in one coherent change.

### Step 3: Research before design

1. Use current Shopify, WooCommerce, PostgreSQL, Supabase, security-standard, and dependency documentation as applicable.
2. Prefer official documentation and maintained source repositories.
3. Record API version, documentation URL, and review date in the integration document.
4. Check package maintenance, license, release cadence, vulnerabilities, transitive risk, and replaceability before adding a production dependency.
5. If research invalidates the plan, update the plan and create an ADR before implementation.

### Step 4: Define measurable success

Before coding, add or confirm:

- Behavioural acceptance criteria
- Security and tenant-isolation criteria
- Ledger and idempotency invariants
- Failure and retry behaviour
- Required unit, property, integration, contract, end-to-end, and load tests
- Observability requirements
- Documentation and migration requirements
- Exact commands that will prove the work

### Step 5: Implement one coherent slice

1. Write or update tests that expose the missing behaviour or regression.
2. Implement the smallest complete production-grade slice.
3. Include schema migrations, API contracts, retry behaviour, metrics, logs, and documentation in the same change where applicable.
4. Keep platform-specific behaviour behind connector interfaces.
5. Keep client-specific behaviour in versioned programme configuration.

### Step 6: Verify locally

Run all relevant checks, including:

- Formatting
- Linting
- Type checks
- Unit tests
- Property-based tests
- Integration and contract tests
- Database migration tests
- RLS isolation tests
- End-to-end tests
- Security scans
- Performance or load checks when the critical path changes

Never report a check as passed unless it actually ran successfully.

### Step 7: Adversarial review

Review the change as if trying to break it:

- Can another tenant access this data?
- Can a duplicate or delayed webhook duplicate points?
- Can events arrive out of order?
- Can a partial refund over-reverse points?
- Can a retry create multiple rewards or coupons?
- Can a customer redeem the same reward concurrently?
- Can a cache hide an authoritative change?
- What happens when Shopify, WooCommerce, Redis, email, or the loyalty API is unavailable?
- Does logging expose personal data or secrets?
- Can an administrator action occur without an audit trail?
- Is the migration safe for existing data and old application versions?

### Step 8: Score the result

Update `QUALITY_SCORECARD.md` and machine-readable eval output. Score the affected area:

| Category                                | Weight |
| --------------------------------------- | -----: |
| Functional and domain correctness       |     20 |
| Security and tenant isolation           |     20 |
| Ledger integrity and reliability        |     15 |
| Test strength and regression resistance |     15 |
| Performance and storefront experience   |     10 |
| Observability and operability           |     10 |
| Documentation and maintainability       |     10 |

Rules:

- Target overall score: at least 90/100.
- No relevant category may score below 80% of its available points.
- Any critical security, privacy, tenant-isolation, ledger, backup, or data-loss failure is an automatic fail regardless of total score.
- Subjective agent review may supplement deterministic tests, but it cannot override a deterministic failure.
- Record evidence for every score. Do not award points based on confidence alone.

### Step 9: Improve again when necessary

If the score or exit gate is below target:

1. Identify the largest verified weakness.
2. Make one focused improvement.
3. Re-run the affected evaluations.
4. Compare results to the current best version.
5. Retain the better version.
6. Log what improved, regressed, and remains weak.
7. Repeat until the gate passes or a genuine blocker requires product-owner input.

Do not endlessly refactor low-risk code for aesthetic reasons. Continue iterating where tests, scores, security, reliability, performance, usability, or maintainability show a material gap.

### Step 10: Close and hand off

1. Review the complete diff.
2. Update `PLANS.md`, `TASKS.yaml`, `STATUS.md`, scorecard, ADRs, risk register, API docs, and changelog as applicable.
3. Record verification commands and results.
4. State remaining limitations without hiding them.
5. Select the next highest-value unblocked task.

---

## 6. Target architecture

Use a TypeScript-first monorepo with clear platform boundaries. The exact tooling can change through an ADR when evidence supports it.

```text
apps/
  dashboard/          Next.js merchant and Starfiniti administration
  api/                Fastify public and internal API
  workers/            Durable event, reconciliation, expiry, campaign jobs
  shopify-app/        Shopify application and extensions
packages/
  domain/             Pure loyalty domain logic
  contracts/          Versioned schemas and event contracts
  database/           Migrations, RLS, repositories, transaction helpers
  integrations/       Connector interfaces and shared integration logic
  sdk-js/             Browser and server JavaScript SDK
  sdk-php/            Generated or maintained PHP client contracts
  ui/                 Shared accessible components and design tokens
  observability/      Logging, tracing, metrics, correlation
  testing/            Test factories, fakes, contract and failure harnesses
plugins/
  woocommerce/        Production WooCommerce plugin
infrastructure/
  environments/
  modules/
docs/
```

Recommended baseline:

- Next.js for merchant and hosted customer interfaces
- Fastify for API and event ingestion
- PostgreSQL as the authoritative database
- Supabase capabilities where they add value, without coupling the core ledger to proprietary-only behaviour
- PostgreSQL RLS for tenant protection
- Redis or Valkey for rate limits, short-lived locks, and replaceable cache
- Transactional inbox and outbox tables
- Durable workers with dead-letter and replay tooling
- Cloudflare R2 or S3-compatible storage for exports and generated artifacts
- OpenTelemetry, structured logs, Sentry, metrics, traces, dashboards, and alerts
- Infrastructure as code and separate development, staging, and production environments

Start as a modular monolith. Candidate future extractions include webhook ingestion, notifications, analytics, and high-volume campaign processing. The ledger and reward reservation boundary must remain transactionally coherent.

---

## 7. Step-by-step implementation phases

Each phase ends with a gate. A phase can be improved, reordered, or split, but its gate cannot be silently skipped.

## Phase 0: Repository discovery and bootstrap

### Objective

Create a safe, reproducible engineering environment and determine whether useful code already exists.

### Steps

1. Inspect the repository, branches, existing applications, documentation, migrations, tests, and deployment configuration.
2. Preserve unrelated or user-owned changes.
3. Record the baseline architecture and gaps.
4. Create the repository operating files described in Section 4.
5. Define supported runtimes and package manager.
6. Create repeatable local setup and test commands.
7. Establish CI for formatting, linting, type checks, unit tests, migration validation, and secret scanning.
8. Create development and test environment templates without committing secrets.
9. Create a local test database with automated reset and seed procedures.
10. Add dependency, license, and vulnerability reporting.

### Exit gate

- A new developer or agent can clone, configure, run, test, and understand the repository using documented commands.
- CI provides trustworthy baseline results.
- The living plan and handoff system work.

## Phase 1: Product model and domain specification

### Objective

Remove ambiguity before encoding financial-style loyalty behaviour.

### Steps

1. Define Agency, Organization, Brand, Workspace, Commerce Connection, Programme Group, Programme, Programme Version, Customer, Customer Identity, Wallet, Ledger Transaction, Reward, Reservation, Redemption, Tier, Campaign, Referral, Consent, and Audit Event.
2. Define whether points have monetary value, promotional value, or both.
3. Define order qualification states and configurable award timing.
4. Define cancellation, return, partial-refund, exchange, chargeback, and manual-adjustment policies.
5. Define expiry policy variants and customer notification timing.
6. Define shared-wallet and shared-brand behaviour.
7. Define guest versus member behaviour.
8. Define multi-currency conversion and rounding policies.
9. Define fraud and negative-balance policies.
10. Encode Rosy Rewards and the Shopify pilot as programme examples.
11. Build executable domain examples and acceptance fixtures.

### Exit gate

- Every balance-affecting behaviour has an unambiguous example.
- Product decisions requiring owner input are resolved or explicitly blocked.
- Examples are reusable as automated tests.

## Phase 2: Architecture, data model, and threat model

### Objective

Design for correctness, isolation, failure recovery, and future connectors.

### Steps

1. Define the modular architecture and dependency rules.
2. Design tenant hierarchy and membership model.
3. Design customer identity links without email-only merging.
4. Design the immutable ledger and balance projections.
5. Design programme versioning and deterministic rule evaluation.
6. Design event inbox, normalization, outbox, retry, replay, and reconciliation.
7. Design reward reservation and commerce execution state machines.
8. Design audit and support-access models.
9. Create a data classification map.
10. Threat-model authentication, tenancy, webhooks, referrals, reward theft, coupon leakage, support impersonation, API abuse, supply chain, exports, logs, backups, and administration.
11. Define SLO, RPO, RTO, initial capacity, and performance targets.
12. Create ADRs for material technology choices.

### Exit gate

- Architecture and threat model have no unresolved critical issue.
- Ledger, tenancy, reward, and event state machines are reviewable.
- Migrations can be implemented without inventing core behaviour during coding.

## Phase 3: Platform foundation and tenancy

### Objective

Build the secure control plane used by every later module.

### Steps

1. Implement organizations, brands, workspaces, programme groups, users, memberships, and roles.
2. Implement authentication and session security.
3. Implement RBAC and workspace-scoped authorization.
4. Add RLS to every tenant-owned table.
5. Build adversarial RLS tests across randomly generated tenants and roles.
6. Implement API keys and service accounts with granular scopes.
7. Implement audit logging with correlation IDs and actor context.
8. Implement tenant-aware object-storage access.
9. Implement feature flags and plan entitlements centrally.
10. Build administrator support access with reason, expiry, and audit.
11. Add rate limiting, structured errors, request IDs, metrics, and traces.

### Exit gate

- Cross-tenant access tests fail closed.
- Every administrative mutation is authorized and audited.
- Service-role credentials are unreachable from client code.
- Foundation checks pass in CI and staging.

## Phase 4: Commerce event platform

### Objective

Receive unreliable external events and create reliable internal facts.

### Steps

1. Define versioned canonical events for orders, customers, products, refunds, fulfilments, app lifecycle, and deletions.
2. Implement raw webhook inbox storage.
3. Verify signatures before processing.
4. Acknowledge valid webhook receipt quickly.
5. Normalize platform payloads behind connector adapters.
6. Enforce unique source event and business idempotency keys.
7. Support delayed, duplicated, missing, and out-of-order events.
8. Implement retry queues, dead-letter handling, replay controls, and poison-event quarantine.
9. Implement transactional outbox delivery.
10. Build initial and incremental synchronization workflows.
11. Implement scheduled reconciliation between commerce orders and normalized events.
12. Build operational dashboards for connection health, lag, errors, and replay.

### Exit gate

- Duplicate-event and out-of-order test suites pass.
- Restarting workers cannot duplicate business effects.
- Failed events can be diagnosed and safely replayed.
- Reconciliation detects and repairs controlled discrepancies.

## Phase 5: Immutable ledger and wallets

### Objective

Create the authoritative, auditable balance system.

### Steps

1. Implement wallets scoped to the correct programme group and identity.
2. Implement ledger transactions and immutable entries.
3. Implement pending, available, reserved, spent, expired, and reversed balance projections.
4. Add transactional idempotency constraints.
5. Implement award, release, reserve, capture, cancel, expire, reverse, and manual-adjustment operations.
6. Require references and reasons for reversals and manual adjustments.
7. Add concurrency tests for simultaneous awards and redemptions.
8. Add property-based tests for ledger invariants.
9. Build projection rebuild and consistency-check tools.
10. Implement ledger export and liability reports.
11. Add repair tooling that uses compensating transactions.

### Exit gate

- Randomized invariant tests cannot produce an unexplained or duplicate balance.
- Projection rebuilds match stored balances.
- Concurrent redemption cannot overspend.
- Every mutation is attributable and auditable.

## Phase 6: Programme rules, rewards, expiry, and tiers

### Objective

Make loyalty behaviour configurable, deterministic, versioned, and explainable.

### Steps

1. Implement draft, published, scheduled, retired, and superseded programme versions.
2. Implement base earning rules.
3. Implement product, category, collection, currency, market, channel, customer-segment, and date conditions.
4. Implement exclusion rules for tax, shipping, gift cards, discounts, and specified products.
5. Implement reward types: fixed discount, percentage discount, free product, free shipping, store credit, exclusive access, and custom reward.
6. Implement reward reservations, expiry, capture, and release.
7. Implement points expiry and advance notifications.
8. Implement rolling-period, calendar, lifetime, spend, points, and order-count tiers.
9. Implement automatic upgrade, downgrade, grace period, and manual override.
10. Implement rule simulation against historical or fixture orders.
11. Produce a human-readable explanation trace for every award and tier decision.
12. Implement approval workflow for sensitive programme changes.

### Exit gate

- Rosy Rewards runs entirely through configuration.
- Published programme changes do not alter historical transaction explanations.
- Simulation and live evaluation produce identical results for identical inputs.
- Reward reservation failure paths are safe and recoverable.

## Phase 7: WooCommerce connector and plugin

### Objective

Deliver a production-grade WooCommerce channel without moving central loyalty logic into WordPress.

### Steps

1. Implement secure one-click connection and credential rotation.
2. Implement signed event delivery with a local outbox.
3. Use Action Scheduler for durable background delivery and retry.
4. Support orders, status changes, refunds, customers, products, coupons, uninstall, and privacy events.
5. Implement initial sync and reconciliation commands.
6. Build WooCommerce account, product, cart, checkout, and post-purchase loyalty components.
7. Support Cart and Checkout Blocks and documented classic-checkout compatibility.
8. Implement native coupon creation, validation, restriction, capture, and cleanup.
9. Implement HPOS compatibility and declaration.
10. Add WordPress multisite analysis and support decision.
11. Add plugin health diagnostics, logs, connection test, queue inspection, and WP-CLI commands.
12. Test supported WordPress, PHP, WooCommerce, HPOS, Blocks, currency, tax, refund, and caching combinations.
13. Test failure of the central loyalty API without breaking checkout.

### Exit gate

- The supported compatibility matrix passes.
- The plugin can recover after network and API outages.
- Checkout remains safe during platform failure.
- Full and partial refunds reconcile correctly.
- Rosy Rewards pilot acceptance tests pass.

## Phase 8: Shopify application

### Objective

Deliver a current, App-Store-ready Shopify integration using supported extension points.

### Steps

1. Verify current Shopify API versions, app requirements, protected-customer-data requirements, billing, privacy, and extension capabilities.
2. Implement OAuth or current recommended token exchange with encrypted offline token storage and rotation support.
3. Implement GraphQL Admin API access with scopes limited to required capabilities.
4. Implement mandatory compliance webhooks and app lifecycle handling.
5. Implement order, refund, fulfilment, customer, product, and app events.
6. Implement rate-limit-aware initial sync and reconciliation.
7. Build App Home using current Shopify design requirements.
8. Build theme app extensions for product, cart, loyalty page, and storefront prompts.
9. Build Customer Account UI extensions for balance, tier, history, rewards, and referrals.
10. Implement discounts using currently supported Shopify primitives and functions.
11. Implement checkout extensions only where current platform and merchant plan capabilities allow them.
12. Implement Shopify Flow actions and triggers after the core is stable.
13. Implement Shopify Billing or managed pricing for public distribution.
14. Add App Store review tests, installation tests, reinstall tests, uninstall cleanup, privacy tests, and API upgrade tests.

### Exit gate

- Shopify pilot end-to-end tests pass on real development stores.
- App uninstall and privacy workflows pass.
- API throttling and webhook retries do not lose or duplicate effects.
- Storefront components meet performance and accessibility budgets.
- App review requirements are documented and testable.

## Phase 9: Merchant administration and customer experience

### Objective

Make the platform genuinely usable, accessible, brandable, and supportable.

### Steps

1. Build guided onboarding and connection health.
2. Build visual programme, tier, reward, and expiry configuration.
3. Build programme preview and simulation.
4. Build customer search, timeline, wallet, tier, referral, order, and adjustment views.
5. Build bulk operations with dry run, approval, idempotency, and audit.
6. Build localized customer components and translation management.
7. Build theme controls, design tokens, custom fonts, and controlled custom CSS.
8. Build responsive and keyboard-accessible loyalty pages and widgets.
9. Apply WCAG 2.2 AA criteria and automated plus manual accessibility testing.
10. Establish strict storefront JavaScript, CSS, request, and rendering budgets.
11. Add support diagnostics without exposing secrets or unrelated tenants.
12. Conduct merchant and customer usability tests, then iterate against recorded findings.

### Exit gate

- A merchant can configure and launch a valid programme without developer intervention.
- Dangerous configuration is prevented or requires explicit confirmation.
- Customer flows work across supported devices, languages, and input methods.
- Storefront performance and accessibility targets pass.

## Phase 10: Referrals, campaigns, notifications, and fraud

### Objective

Add growth features without creating an abuse or uncontrolled-liability system.

### Steps

1. Implement advocate links, referral codes, attribution windows, and qualification rules.
2. Implement advocate and referred-customer rewards with return or cooling periods.
3. Detect obvious self-referral and duplicate patterns using configurable risk signals.
4. Implement manual fraud review and reversible decisions.
5. Build scheduled bonus-point, multiplier, milestone, win-back, tier, referral, and limited-quantity campaigns.
6. Add campaign budgets and maximum liability controls.
7. Implement customer eligibility snapshots and explanation traces.
8. Implement notification events and provider adapters.
9. Integrate Klaviyo first without making Klaviyo the source of truth.
10. Add consent, suppression, locale, and channel-aware delivery.
11. Add control-group capability for incrementality measurement.

### Exit gate

- Fraud and self-referral scenarios are tested.
- Campaign concurrency cannot over-issue limited rewards.
- Notifications respect consent and suppression.
- Campaign liability can be estimated, limited, and audited.

## Phase 11: Analytics, reporting, and financial liability

### Objective

Provide trustworthy operational, growth, and accounting insight.

### Steps

1. Define every metric and its source fields.
2. Separate operational truth from analytical projections.
3. Report issued, pending, available, reserved, spent, expired, and reversed points.
4. Report outstanding liability, breakage, and expiry forecast.
5. Report member activity, redemption, repeat purchase, AOV, LTV, tier movement, referrals, and campaign performance.
6. Distinguish influenced revenue from experimentally measured incremental revenue.
7. Implement timezone, currency, refund, and attribution handling.
8. Add exports with role checks, expiry, audit, and personal-data controls.
9. Reconcile analytics aggregates against ledger truth.
10. Introduce a separate analytical store only when measured volume justifies it.

### Exit gate

- Metric definitions are documented and tested.
- Aggregate financial totals reconcile to the ledger.
- Reports correctly handle refunds, currencies, and time boundaries.
- Claims of incrementality require valid control-group evidence.

## Phase 12: Billing, plans, super-administration, and agency operation

### Objective

Operate Starfiniti Loyalty as a sustainable multi-tenant product.

### Steps

1. Define plans and feature entitlements centrally.
2. Implement Shopify-native app billing for Shopify-distributed plans.
3. Implement appropriate off-platform billing for WooCommerce and direct enterprise contracts.
4. Handle trials, upgrades, downgrades, failed payments, grace periods, cancellation, and data retention.
5. Ensure billing status cannot corrupt or hide customer balances.
6. Build Starfiniti super-administration with least-privilege support access.
7. Build organization onboarding, suspension, export, deletion, restore, and offboarding workflows.
8. Add usage metering with idempotent aggregation and audit.
9. Add SLA, service status, incident, and customer communication processes.

### Exit gate

- Billing lifecycle tests pass.
- A plan change cannot delete or silently change loyalty value.
- Support access and tenant lifecycle are audited and reversible where required.

## Phase 13: Migration framework

### Objective

Allow merchants to adopt the platform without losing historical value.

### Steps

1. Define a canonical migration format.
2. Build import adapters for CSV and prioritized competitors such as Smile, Rivo, LoyaltyLion, Yotpo, WPLoyalty, YITH, and WooRewards as source formats permit.
3. Import customer identifiers, balances, tiers, expiry, referrals, and historical context where legally and technically appropriate.
4. Build dry-run validation, duplicate detection, invalid-data reporting, and totals comparison.
5. Require approval before committing opening balances.
6. Commit imported value as auditable opening-balance ledger transactions.
7. Preserve source IDs and migration batch identity.
8. Produce before-and-after reconciliation reports.
9. Support safe correction through compensating imports.

### Exit gate

- Test migrations reconcile customer counts and balance totals.
- Re-running the same import cannot duplicate value.
- Every imported balance can be traced to source data and migration batch.

## Phase 14: Enterprise hardening and release

### Objective

Prove that the system is secure, recoverable, observable, and operable under realistic failure and load.

### Steps

1. Define the launch capacity envelope and expected growth.
2. Load-test ingestion, ledger writes, wallet reads, reward reservations, exports, and campaign fan-out.
3. Run long-duration and burst tests.
4. Inject dependency failures, network delay, duplicate delivery, worker crashes, database failover, cache loss, and API throttling.
5. Verify graceful degradation and recovery.
6. Run dependency, container, secret, SAST, DAST, and infrastructure scans.
7. Arrange independent penetration testing and resolve critical/high findings.
8. Verify privacy export and deletion end to end.
9. Verify encrypted backups, point-in-time recovery, and scheduled restore tests.
10. Verify rollback or forward-fix procedures for application and database releases.
11. Complete operational dashboards, alerts, on-call paths, incident runbooks, status communication, and postmortem template.
12. Run pilot merchants through a controlled production launch with feature flags and reconciliation.
13. Review every claim in marketing and documentation against demonstrated capabilities.

### Exit gate

- No unresolved critical or high security issue.
- Tenant isolation, ledger integrity, backup restore, privacy workflows, and reconciliation pass.
- SLO, RPO, RTO, performance, and capacity claims have measured evidence.
- Pilot balances reconcile.
- Operational ownership and incident procedures exist.
- The product owner explicitly approves general availability.

## Phase 15: Continuous self-improvement after launch

### Objective

Improve the platform based on evidence without destabilizing its core.

### Steps

1. Review errors, support cases, reconciliation discrepancies, performance, security findings, churn, merchant activation, reward usage, and customer usability.
2. Convert repeated incidents and review feedback into tests, linters, monitors, runbooks, or `AGENTS.md` rules.
3. Review platform changelogs and pinned API versions on a scheduled cadence.
4. Run dependency and vulnerability updates through test environments.
5. Conduct quarterly restore, failover, tenant-isolation, privacy, and incident exercises.
6. Re-score every major module after material changes.
7. Archive obsolete plan items only after documenting why they were superseded.
8. Turn stable repeated workflows into reusable agent skills or scripts.
9. Maintain a product evidence backlog rather than implementing every feature request immediately.

---

## 8. Mandatory test catalogue

The agent must expand this catalogue as new failure modes are discovered.

### 8.1 Ledger and rules

- Duplicate order event
- Same idempotency key with different payload
- Pending to available transition
- Full refund before award release
- Full refund after redemption
- Partial refund across multiple items
- Multiple partial refunds
- Cancellation and reinstatement
- Return after points expiry
- Reward reservation timeout
- Two simultaneous reward requests
- Expiry while points are reserved
- Tier upgrade and downgrade boundaries
- Programme version changes during order lifecycle
- Currency conversion and rounding boundaries
- Projection rebuild
- Reversal of reversal
- Negative-balance policy
- Bulk import replay

### 8.2 Tenant and security

- Cross-tenant direct-object-reference attempts
- Forged tenant ID
- Missing membership
- Revoked membership and stale session
- Service-role leakage test
- API-key scope boundaries
- Expired and rotated credentials
- Support impersonation audit
- Export authorization
- Webhook signature failure
- Webhook replay attack
- Rate-limit and abuse handling
- Personal-data masking in logs and errors

### 8.3 Shopify

- New install, reinstall, scope change, token expiry/rotation, uninstall
- Mandatory compliance webhooks
- Protected customer data absent or redacted
- API throttling
- Duplicate, delayed, and out-of-order webhooks
- Refund and partial refund
- Multiple currencies and markets
- New customer accounts
- Theme extension disabled or removed
- Checkout capability unavailable on merchant plan
- Billing trial, upgrade, downgrade, cancellation, and failure

### 8.4 WooCommerce

- Supported PHP, WordPress, WooCommerce, HPOS, and Blocks matrix
- Classic and block checkout paths where supported
- Order status differences
- Guest checkout and later account creation
- Full and partial refunds
- Plugin deactivation, reactivation, deletion, and reconnection
- Action Scheduler backlog
- WordPress cron unavailable
- REST credentials rotated or revoked
- Central API unavailable during checkout
- Cache and object-cache interaction
- Multilingual and multi-currency plugin interaction

### 8.5 Operations

- Worker termination mid-transaction
- Database connection interruption
- Redis or Valkey loss
- Queue backlog
- External API outage
- Retry storm
- Dead-letter replay
- Backup restoration
- Point-in-time recovery
- Deployment rollback
- Migration compatibility between old and new application versions
- High-volume export
- Burst campaign

---

## 9. Initial quality and reliability targets

These are initial targets. Improve or revise them through measured evidence and an ADR. Do not lower them merely because a test fails.

- Availability target: 99.9% monthly for the central API, excluding documented maintenance where contractually allowed.
- Webhook acknowledgement: p95 under 2 seconds for valid events.
- Normal event-to-ledger processing: p95 under 10 seconds under the declared capacity envelope.
- Customer wallet read: p95 under 300 ms from the platform API under the declared capacity envelope.
- Storefront impact: remain within an explicitly measured JavaScript, request, and rendering budget.
- Recovery Point Objective: 5 minutes or better for authoritative production data.
- Recovery Time Objective: 60 minutes or better for a declared regional failure scenario.
- Zero tolerance for unexplained balance changes, cross-tenant exposure, duplicate redemption, or unrecoverable event loss.

Every target must identify its measurement method, environment, load profile, alert threshold, and owner.

---

## 10. Definition of done for every task

A task is complete only when:

- Acceptance criteria are met.
- Relevant automated tests exist and pass.
- Relevant failure modes were tested.
- Tenant isolation and authorization were considered.
- Ledger and idempotency effects were considered.
- Observability exists for production behaviour.
- Schema changes include safe migrations.
- API changes update contracts and versioning documentation.
- User-facing behaviour is accessible and localized where applicable.
- Security and privacy impact is documented.
- The diff was reviewed for regression and unnecessary complexity.
- Documentation, status, plan, risk, scorecard, and changelog are updated as applicable.
- Remaining limitations are stated honestly.

Passing unit tests alone is not sufficient.

---

## 11. Stop conditions and escalation

The agent should continue autonomously through ordinary engineering decisions. Stop and request direction when:

- Required product behaviour is genuinely ambiguous and choices would change customer value.
- A legal or accounting interpretation is required.
- Production credentials, data, deployment, deletion, or irreversible migration require new authority.
- A critical security or privacy issue is found in production.
- Existing user changes conflict directly with necessary work and cannot be preserved.
- A required third-party permission, protected API scope, paid account, or external approval is unavailable.
- Evidence shows the agreed product scope is technically impossible on a platform and no safe equivalent exists.

When escalating, provide:

1. The exact decision or blocker.
2. Evidence.
3. Realistic options.
4. Recommendation and tradeoffs.
5. Work that can safely continue meanwhile.

---

## 12. First agent session

The first implementation session should execute only the following sequence:

1. Read this document and inspect the entire repository structure.
2. Report actual repository state and preserve unrelated work.
3. Research the current official Shopify and WooCommerce requirements that affect architecture.
4. Create or improve the repository operating files from Section 4.
5. Create a gap analysis between actual state and this plan.
6. Create the initial `TASKS.yaml` dependency graph.
7. Create Phase 0 acceptance commands and baseline CI.
8. Create ADR candidates, but do not prematurely decide unresolved material architecture.
9. Run the baseline checks.
10. Update `STATUS.md` with exact evidence.
11. Begin Phase 1 only when the Phase 0 gate passes.

Do not attempt to generate the entire platform in the first session. Build a system that can keep building, testing, reviewing, and improving itself across sessions without losing reality.

---

## 13. Current primary platform references

The agent must verify current versions when work begins. These links are starting points, not permission to rely on stale assumptions.

- Shopify app authentication and authorization: <https://shopify.dev/docs/apps/build/authentication-authorization>
- Shopify Customer Account UI extensions: <https://shopify.dev/docs/api/customer-account-ui-extensions/latest>
- Shopify protected customer data: <https://shopify.dev/docs/apps/launch/protected-customer-data>
- Shopify privacy requirements: <https://shopify.dev/docs/apps/launch/privacy-requirements>
- Shopify App Store requirements: <https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements>
- WooCommerce REST API: <https://developer.woocommerce.com/docs/apis/rest-api/>
- WooCommerce extension compatibility: <https://developer.woocommerce.com/docs/extensions/best-practices-extensions/compatibility/>
- WooCommerce Marketplace and HPOS requirements: <https://developer.woocommerce.com/docs/woo-marketplace/submitting-your-product/>
- Codex project guidance and execution planning: <https://learn.chatgpt.com/guides/best-practices>
- Codex eval-driven improvement loops: <https://learn.chatgpt.com/use-cases/iterate-on-difficult-problems>

---

## Final mandate

Build Starfiniti Loyalty as a reusable commerce infrastructure product, not a collection of store-specific scripts.

Keep the plan alive. Challenge weak assumptions. Measure the real system. Preserve correctness before convenience. Make every points movement explainable, every integration recoverable, every tenant isolated, and every enterprise claim demonstrable.
