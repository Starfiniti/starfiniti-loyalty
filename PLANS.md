# Execution Plan

## Objective

Deliver the enterprise WooCommerce roadmap in `docs/plan/ENTERPRISE_ROADMAP.md` without weakening the immutable ledger, tenant RLS, idempotency, audit, recovery, or checkout-independence guarantees. Shopify, localization, store credit, gift cards, and cash redemption are deferred.

## Current module

M05 — advanced VIP qualification, benefits, expiry, and member progression. M00, M02, and M03 are complete; M01 remains active at its approved-real-store and full-service-recovery external gates, while M04-S04 remains at browser/deployment/canary/reconciliation closeout.

M05-S01 through S03 are exact-head green: strict policy contracts, event-time qualification, immutable facts, original-time refund compensation, executable tier multipliers, fulfilment-bound benefit rewards, expiring reason-bound owner/admin overrides, continued underlying automatic qualification, and exactly-once override expiry passed clean replay and the complete runtime matrix. M05-S04 point-expiry policy and lifecycle automation are now active.

The active integrated baseline is released production commit `0ced4b666a55d836bd3d4927337fe057a71bb4ba` (`v0.1.11`). The previous local Phase 4 branch and its six modified planning files remain preserved in a named git stash and have not been mixed into this work.

## Completed M00 slice

- M00–M16 are the authoritative unfinished task graph while completed P0–P7 evidence remains historical truth.
- Current official Smile, LoyaltyLion, Yotpo, and Supabase sources establish the released capability baseline.
- The initial 49/100 product-readiness score, deterministic failure rules, per-module evidence format, dependency-safe external-input policy, and 90/100 enterprise finish gate are versioned.
- Clean install, unit tests, lint, all workspace typechecks/builds, architecture/accessibility/WooCommerce/workflow/deployment/migration validators, secret scan, zero-vulnerability production audit, licences, targeted formatting, YAML/JSON parsing, and diff checks pass.

## Active M01 external gate

- Production/store/recovery state is inventoried without secrets: exact `v0.1.11` images and all Supabase containers are healthy, value/event aggregates are zero, database PITR is proven and repaired, and no reachable customer store was treated as approved.
- The 22-case machine-readable pilot gate and exact operational runbook define provisioning, value, refund, expiry, reconciliation, rotation, outage, recovery, alert, and final-reconciliation evidence.
- Complete every recovery/outage/reconciliation step that does not require interactive store-owner access. Leave only explicit store selection and owner-controlled checkout/order actions for the end if credentials remain unavailable.

## Completed M02 slice

- PostgreSQL owns versioned self-hosted/managed deployment mode, 18 capability definitions, exact optional limits, tenant overrides, deterministic rollout, canaries, and private provider mappings.
- Browser and Auth claims cannot grant access; runtime and worker roles cannot mutate it. Six accepted-value paths cannot be disabled.
- Exact-head CI passed 1,095 pgTAP assertions, concurrency/property probes, both application images, and four WooCommerce runtime cells.
- Production took a physical backup, applied additive migration v27, entered managed mode, enabled only the Starfiniti `programme.v2` canary, and passed effective-read, WAL, readiness, and unauthorized-ingress checks.
- M02 closes at 93/100; evidence is under `docs/plan/evidence/M02/`.

## Next safe work

1. M05: deliver expiry policy/lifecycle automation, progression experiences, shadow comparison, disabled deployment, canary reconciliation, and score.
2. M01: connect an approved real WooCommerce store when access is supplied and complete its value, outage, rotation, alert, and clean-room recovery gate.
3. Close M04 browser/deployment/canary evidence without weakening accepted manual fulfilment, then deliver M06–M16 sequentially in versioned vertical slices.

## External inputs

- M01 production gate: approved real WooCommerce store access.
- M08 production gate: SMTP and Klaviyo credentials.
- M11 live multi-currency gate: approved exchange-rate provider.
- M13 production gate: enterprise IdP test tenant.
- M14 production gate: Stripe credentials, prices, Price IDs, and delinquency policy.
- M15 gate: independent penetration test and explicit owner GA approval.

External inputs delay only their production gate, not the next dependency-safe repository slice.

## Quality gate

`npm run check && npm run db:validate && npm run secrets:scan && npm run audit:prod && npm run licenses`

Module completion additionally requires at least 90/100, at least 80% of every relevant scoring category, no deterministic failure, an adversarial diff review, and durable evidence under `docs/plan/evidence/MXX/`.

See `docs/plan/TASKS.yaml`, `STATUS.md`, `RISKS.md`, `QUALITY_SCORECARD.md`, and `docs/architecture/ADR/`.
