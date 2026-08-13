# Execution Plan

## Objective

Deliver the enterprise WooCommerce roadmap in `docs/plan/ENTERPRISE_ROADMAP.md` without weakening the immutable ledger, tenant RLS, idempotency, audit, recovery, or checkout-independence guarantees. Shopify, localization, store credit, gift cards, and cash redemption are deferred.

## Current module

M01 — real WooCommerce production pilot, outage behavior, and clean-room recovery. M00 is complete.

The implementation branch is `codex/enterprise-roadmap`, created from production baseline `origin/main` at `ff7978dd8faa4519a378f5bb538c7956905b2125`. The previous local Phase 4 branch and its six modified planning files are preserved in a named git stash and have not been mixed into this work.

## Completed M00 slice

- M00–M16 are the authoritative unfinished task graph while completed P0–P7 evidence remains historical truth.
- Current official Smile, LoyaltyLion, Yotpo, and Supabase sources establish the released capability baseline.
- The 49/100 product-readiness score, deterministic failure rules, per-module evidence format, dependency-safe external-input policy, and 90/100 enterprise finish gate are versioned.
- Clean install, 177 unit tests, lint, all workspace typechecks/builds, architecture/accessibility/WooCommerce/workflow/deployment/migration validators, secret scan, zero-vulnerability production audit, licences, targeted formatting, YAML/JSON parsing, and diff checks pass.

## Current M01 slice

- Production/store/recovery state is inventoried without secrets: exact `v0.1.10` images and all Supabase containers are healthy, value/event aggregates are zero, and no reachable customer store was treated as approved.
- The 22-case machine-readable pilot gate and exact operational runbook now define provisioning, value, refund, expiry, reconciliation, rotation, outage, recovery, alert, and final-reconciliation evidence.
- Complete every recovery/outage/reconciliation step that does not require interactive store-owner access. Leave only explicit store selection and owner-controlled checkout/order actions for the end if credentials remain unavailable.

## Next safe work

1. M01: connect an approved real WooCommerce store and complete value, outage, credential-rotation, alert, and clean-room recovery evidence.
2. M02 may proceed while M01 waits for real-store access: add `self_hosted`/`managed`, database-authoritative entitlements, limits, and tenant canary/percentage flags.
3. After M02, deliver M03–M16 sequentially in versioned vertical slices and close each measured module gate before beginning its dependent module.

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
