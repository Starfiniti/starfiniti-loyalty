# Execution Plan

## Objective

Deliver the enterprise WooCommerce roadmap in `docs/plan/ENTERPRISE_ROADMAP.md` without weakening the immutable ledger, tenant RLS, idempotency, audit, recovery, or checkout-independence guarantees. Shopify, localization, store credit, gift cards, and cash redemption are deferred.

## Current module

M09 — hosted and WooCommerce customer experience is the active dependency-safe repository module while M04–M08 retain reviewed merge/deployment/canary/reconciliation closeout. M00, M02, and M03 are complete; M01 remains active at its approved-real-store and full-service-recovery external gates.

M06-S01 through S05 are exact-head green on draft PR #31. Runs `31763563259`, `31764805380`, `31766887239`, `31768294674`, and `31770764870` passed strict policy, signed offline capture, first attribution, historical qualification/cooling, two-sided exactly-once issuance/compensation, Auth-derived reversible fraud review, customer sharing/progress/history, and a fact-sourced merchant funnel. The latest passed a clean 41-migration/1,700-assertion replay, all three concurrency probes, both images, baseline, 126 dashboard tests, 136 contract tests, and all four WooCommerce runtimes. Production-build desktop/mobile browser review passed with no critical accessibility, overflow, or diagnostic issue. M06-S06 reviewed merge, disabled deployment, Starfiniti canary, reconciliation, and scoring is active.

M07-S01 through S05 are exact-head green on draft PR #32. Strict canonical-fact audiences, immutable database-timed snapshots, seven closed campaign behaviors, explicit-instant/IANA schedules, exact budgets, private approval-bound control assignment, atomic value execution, canonical trigger queues, campaign-funded native rewards, and exactly-once refunds/reversals now have a complete Hub-style merchant command center and minimized exact results projection. M07-S06 release hardening through ADR-0030 is exact-head green at run `32677551229`/`a9e75f2`: the complete baseline, both images, clean 47-migration replay, 2,016 pgTAP assertions, all five concurrency probes including approval/publication serialization, and all four WooCommerce runtimes passed. Production-build desktop/mobile browser review passed keyboard, navigation, dynamic builders, dark mode, overflow, and diagnostic checks. The subsequent operability fix exposes the projection's exact capacity, reversal, trigger-outcome, and queue facts in the merchant result table; focused desktop/mobile browser evidence and exact-head run `32679145086` at `1b1406b` passed. Reviewed stacked merge, disabled deployment, Starfiniti-only canary, full reconciliation, and scoring remain active; no production campaign schedule, entitlement canary, or value is live yet.

M08-S01 is exact-head green on draft PR #32. ADR-0031 selects a strict provider-neutral immutable event log, local purpose-separated consent/suppression authority, Auth-derived customer commands, and late contact resolution. Nine event types reject arbitrary PII/coupon/secret/ledger properties, trusted suppression cannot be cleared from a customer session, privacy erasure suppresses both purposes, and existing point-expiry fences append one canonical event. Run `32682221777` at `33e0396` passed the complete baseline, both images, clean 48-migration replay, all 39 pgTAP files with 2,066 assertions including 50 focused notification assertions, every concurrency probe, and all four WooCommerce runtime cells after one transient upstream download was retried.

M08-S02 is exact-head green at `604bbeb` on draft PR #32. ADR-0032 isolates an optional SMTP worker from value processing, uses database-owned bounded leases and dispatch-time consent/entitlement/contact authorization, pins six immutable English templates, dead-letters deterministic local message failures, and stops ambiguous remote acceptance in manual review. Run `32686442063` passed the complete baseline, both production images, a clean 49-migration replay, all 40 pgTAP files with 2,152 assertions including all 86 focused SMTP assertions, every concurrency probe, and all four WooCommerce runtimes. The 46 worker tests include 16 focused SMTP tests and a real loopback sink. No production SMTP credentials or delivery are active.

M08-S03 is exact-head green at `a6bbf14` on draft PR #32. ADR-0033 binds every managed Klaviyo operation to one tenant connection and API-key fingerprint, resolves verified contact only after database authorization, pins API revision `2026-07-15`, minimizes profiles/events, treats provider suppression as stronger local authority, and stops ambiguous opt-in submission for review. Run `32689107286` passed the complete baseline, both production images, a clean 50-migration replay, all 41 pgTAP files with 2,219 assertions including all 67 focused Klaviyo assertions, every concurrency probe, and all four WooCommerce runtimes. The disabled worker profile has no production connection or credential; the real test-account canary remains an S06 gate.

M08-S04 is exact-head green at `ea9aa00` on draft PR #32. ADR-0034 binds Standard Webhooks v1 exact-body HMAC signatures to a stable delivery ID and endpoint-specific current/previous secret fingerprints, rejects redirects and every private/reserved DNS answer, pins the validated socket address while retaining TLS hostname verification, and rechecks subscription, entitlement, consent, suppression, payload, rate, and lease authority immediately before dispatch. Run `32691991986` passed the complete baseline, both production images, a clean 51-migration replay, all 42 pgTAP files with 2,277 assertions including all 58 focused webhook assertions, every concurrency probe, and all four WooCommerce runtimes. The disabled worker profile has no production endpoint, subscription, secret, or delivery; S05 merchant template and delivery-health experience is active.

M08-S05 is exact-head green at `a377ef7` on draft PR #32. ADR-0035 adds immutable tenant English template versions, private active bindings, Auth-derived owner/admin publication, exact event-token validation, deterministic escaped HTML, an isolated actor-bound SMTP test queue, and a minimized merchant health projection. Run `32836814262` passed the complete baseline, both production images, a clean 54-migration replay, all 43 pgTAP files with 2,340 assertions including all 63 focused template/health assertions, every concurrency probe, and all four WooCommerce runtimes. Real-component Playwright review passed template switching, safe preview, dark mode, responsive navigation, and zero browser diagnostics. S06 disabled deployment, local sink, provider canaries, reconciliation, rollback, and scoring is active; no production provider delivery is enabled.

M09-S01 through S05 are complete on draft PR #36. The Auth-derived hosted experience covers overview, earning, rewards, VIP, referrals, immutable history, and account states; demand-driven signed WooCommerce snapshots, classic placements, official namespaced Store API data, and a separately flagged Blocks panel use only strict local state. ADR-0039 adds controlled English V2 branding and exact section composition. Exact-head run `32875639062` at `639eac4` passed all seven jobs after desktop, mobile, 320-pixel, 200%-scale, keyboard, reduced-motion, dark-theme, public-privacy, preview-state, and outage review. M09-S06 is active at 88/100 with a mandatory 30-check canary validator; reviewed release, restored Proxmox access, an explicitly approved WooCommerce store, disabled deployment, production outage/rollback proof, exact reconciliation, observation, and a score of at least 90 remain.

M05-S01 through S05 are exact-head green. M05-S06 shadow comparison found and fixed a predeployment Rose/Bloom/Icon displayed-versus-executable rate mismatch; all 36 V1/V2 award comparisons now match, and exact-head run `31760806620` passed. Reviewed merge, disabled deployment, a fresh recovery point, Starfiniti-only canary, reconciliation, and scoring remain open.

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

1. M09: complete S05 controlled branding, section ordering, copy, spacing, preview and responsive/offline states plus keyboard, screen-reader, zoom, contrast, reduced-motion, slow-network, no-script, total-Hub-outage, and English-only evidence.
2. M08: complete S06 disabled deployment, local SMTP sink, bounded provider canaries, exact reconciliation, rollback proof, and module scoring without enabling unapproved production delivery.
3. M07: complete reviewed stacked merge, disabled deployment, fresh recovery point, Starfiniti-only canary, exact result/value reconciliation, smoke, and score in S06.
4. M06: after reviewed stacked merges, deploy disabled, take a fresh recovery point, run the Starfiniti-only canary, reconcile, smoke, and score.
5. M05: complete reviewed merge, disabled deployment, fresh recovery point, Starfiniti-only canary, zero-drift reconciliation, and score after the exact-green shadow gate.
6. M01: connect an approved real WooCommerce store when access is supplied and complete its value, outage, rotation, alert, and clean-room recovery gate.

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
