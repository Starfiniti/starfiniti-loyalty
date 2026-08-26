# Iteration Log

## 2026-08-27 — M14 billing authority and self-hosted independence

- Accepted ADR-0056: managed commercial state is an append-only normalized PostgreSQL mirror, while database entitlements and protected loyalty paths remain authoritative. Live Stripe reads and a mutable latest-subscription row were rejected because provider outage, disorder, or a late event must not become product authorization.
- Added strict `BillingSummaryV1`, private account/state evidence, a live-membership minimized projection, deterministic event-time ordering, provider-event replay fencing independent from caller idempotency keys, and a structural return before provider construction in self-hosted mode.
- Added the real English Billing & plan route to the existing merchant shell. It explains deployment, commercial state, new-configuration availability, the six permanent safeguards, and disabled provider controls without exposing fake checkout or portal actions.
- Added 59 focused pgTAP assertions and a seventeenth two-session concurrency probe for grants, RLS, claims, revocation, exact/changed request and event replay, delayed evidence, immutability, tenant isolation, and zero ledger effects. Targeted lint, workspace tests/typechecks, client, workflow, entitlement, architecture, accessibility, and static database gates pass locally; clean Linux database replay and image/runtime gates are active on draft PR #46.
- Production and the global self-hosted mode are unchanged. No Stripe package, credential, request, Price ID, customer, subscription, checkout, portal, webhook endpoint, metering, payment/card record, or billing enforcement was introduced.

## 2026-08-26 — M13 fail-closed enterprise identity canary gate

- Added the exact-schema 50-check M13 production manifest and validator to the root repository gate. Completion requires every check, exact release/commit evidence, operator access, enterprise-identity and canary approval, a 90/100 module score, and at least 80% of every weighted category.
- Added deterministic adversarial self-tests for false completion, sensitive evidence, missing checks, score drift, short commits, hollow automatic-failure claims, unsafe public status, incomplete prerequisite slices, and category-floor failures.
- Fresh read-only production probes passed dashboard, login, Supabase unauthorized, Authentik live/ready, canonical DNS, Proxmox access, and VM 970/971 health without mutating production.
- Exact candidate run `33015769949` at `6f1c1790f672f9aecfef61a581592313d5d67610` passed all seven jobs: root checks, both images, a clean 75-migration replay, all 62 pgTAP files with 3,349 assertions, all 16 concurrency probes, and all four WooCommerce runtimes.
- The manifest now records 12 passed and 38 pending checks. Its provisional score is 90/100, but operability is 3/10 and below the mandatory 8/10 floor; approved release/fixtures, private-egress, live identity/SCIM/agency/support/recovery/deletion, reconciliation, rollback, observation, and owner approval remain mandatory.

## 2026-08-26 — M13 agency, support, recovery, and terminal offboarding

- Accepted ADR-0055: agency portfolios require one digest-only client invitation and a separate agency-owner acceptance but never create tenant membership or product authority. Exact read-only support requires a separate client-owner approval, a maximum four-hour grant, a live agency relationship/membership/Auth session, and one tenant-visible immutable event for every use.
- Added signed-AAL2 plus live-session owner recovery without granting Loyalty roles access to `auth.sessions`, a bounded PII/secret-free administration export, comprehensive credential offboarding, and seven-day cooled deletion that pseudonymizes mutable identity while retaining immutable value and audit evidence.
- Added versioned contracts, Auth-derived server actions, Hub-style agency/support/recovery workflows, a 75th additive migration, 73 focused pgTAP assertions, and a sixteenth concurrency probe covering competing agency acceptance, exact support approval, and terminal deletion completion.
- Production-build browser review passed desktop/mobile/narrow, light/dark, keyboard focus and drawer restoration, reduced motion, 44-pixel mobile controls, cooling-period denial, English-only output, zero overflow, and zero browser diagnostics.
- The adversarial loop closed relationship/support/deletion serialization, changed-retry drift, post-approval revocation, live-session privilege isolation, fixture authority, and exact retry timing. Its final pass found that offboarding retired webhooks without removing the live destination/current fingerprint; terminal cleanup now applies the approved webhook tombstones and the focused suite proves every reusable field is removed.
- Exact-head Linux run `33013504755` at `8587841d9a0e41afa00a94af506e2cddf5740422` passed all seven jobs: root checks, both production images, a clean 75-migration replay, all 62 pgTAP files with 3,349 assertions, all 16 concurrency probes, and all four WooCommerce runtimes. M13-S06 production canaries remain open and production is unchanged.

# 2026-08-26 — M12 canonical migration and value-free dry run

- Reconstructed the current ledger, bulk-adjustment, privacy, entitlement, and identity boundaries and reviewed official WPLoyalty, WooRewards, and YITH migration evidence. WPLoyalty publishes CSV `email`/`points`/optional referral fields and WooRewards publishes JSON `email`/`points`; YITH publishes no stable column contract and is therefore redacted-fixture gated.
- Accepted ADR-0047: every source translates to one strict canonical V1 document, email is transient evidence rather than match authority, every row needs an explicit resolution, exact lots reconcile per bucket, and a receipt can never directly authorize value.
- Added strict migration contracts and a pure deterministic engine covering exact totals, resolution-order independence, identity/target duplicates, fingerprint drift, unresolved/ambiguous states, bounded PII-free issues, and changed approval inputs.
- Added an immutable tenant-RLS PostgreSQL receipt with live Auth owner/admin, published-programme and migration-entitlement authority, database-derived approval, content/idempotency replay, minimized audit, and zero customer/ledger/connector effects. The focused pgTAP file plans 50 adversarial assertions and a twelfth two-session probe covers concurrent equal content under different idempotency keys.
- Seven contract and six domain cases, both affected typechecks, targeted formatting, and static validation passed. Exact-head run `32937499899` at `d8d223a` subsequently passed all seven jobs, clean 68-migration replay, 55 pgTAP files/2,955 assertions, 12 concurrency probes, both images, and all four WooCommerce runtimes; M12-S01 is complete.
- M12-S02 began with strict application/correction contracts, exact canonical JSON re-presentation, explicit opening-balance ledger semantics, pending-lot release before expiry, source-row fences, and immutable correction batches. Database replay and adversarial S02 closeout remain active before any production enablement.

## 2026-08-26 — M11 fail-closed production closeout gate

- Added a 41-check machine-readable ecosystem canary manifest covering exact release identity, recovery, disabled deployment, explicit topology, verified identity, immutable currency evidence, scoped API replay/quota, endpoint-isolated webhooks, checkout outage continuity, reconciliation, rollback, and observation.
- Added immutable seven-category arithmetic, a 90/100 target, an 80% per-category floor, ten deterministic automatic failures, prohibited evidence-key scanning, and self-tests that reject false completion and sensitive evidence keys.
- Refreshed the read-only production baseline: canonical dashboard health/login returned 200, unauthenticated Supabase Auth/REST returned 401, DNS resolved, and the configured `s2-root` route confirmed VM 971 running. No production mutation occurred.
- Eleven repository/public/operator checks pass and 30 production checks remain pending. The provisional total is 90/100, but operability is 3/10, so completion remains deterministically impossible until approved release, canaries, reconciliation, rollback, and observation pass.
- The first exact-head Linux run exposed a random-alphabet contract defect: canonical Base64 signing material can place `/` or `+` in the six-character hint, while PostgreSQL correctly accepts only Base64URL hints. The generator now normalizes only the non-reusable hint, retains the documented canonical Base64 `whsec_` secret, and includes a deterministic all-`0xff` regression case.
- Exact candidate run `32934487896` at `2063858` passed all seven jobs: the complete baseline and secret scan, both production images, clean 67-migration replay, all 54 pgTAP files with 2,905 assertions, all eleven concurrency probes, and all four WooCommerce runtimes.

## 2026-08-26 — M11 outbound webhooks, supported clients, and operations

- Accepted ADR-0046: each outbound endpoint owns one separately mounted secret and isolated worker; PostgreSQL owns lifecycle authority and retains only fingerprints/hints while the M08 event and Standard Webhooks wire contracts remain compatible.
- Added disabled creation, disabled-only bounded rotation, disable-before-authorization, terminal destination scrubbing, immutable endpoint revisions, minimized endpoint health, and responsive owner/admin lifecycle controls with fail-closed analyst state.
- Added supported dependency-light TypeScript and PHP 8.1 clients with strict bounded Service API requests, exact raw-body constant-time Standard Webhooks verification, timestamp tolerance, stable replay identity, and shared executable vectors.
- Linux replay first rejected special `substring` syntax behind a schema-qualified call, then rejected missing independent function inventories and a private-table assertion executed under the runtime role. The fixes used callable syntax, explicitly reviewed the new read surface, and restored the test owner before private inspection without granting runtime table access.
- Adversarial diff review removed the final trusted actor bridge: exact-signature authenticated wrappers derive the Auth subject and tenant in PostgreSQL, private primitives are not executable by browser/runtime/worker roles, and the eleventh two-session probe serialized concurrent retries into one endpoint, one revision, one attributed audit, and zero ledger effects.
- Exact code-head run `32932756596` at `a495433` passed baseline, both images, clean 67-migration replay, all 54 pgTAP files with 2,905 assertions including 59 focused lifecycle cases, all eleven concurrency probes, and all four WooCommerce runtimes. The baseline includes 229 dashboard, 107 worker, 281 contract, 62 domain, and eight TypeScript SDK tests plus nine PHP sources and executable cross-language vectors.
- Production-build desktop/mobile review passed active, disabled, retired, degraded, expanded lifecycle, and read-only states; dark mode; reduced motion; mobile navigation; 40-pixel actions; 3-pixel focus; English-only output; zero overflow; and zero diagnostics. The fixture was removed and the normal 26-route application rebuilt.
- Production endpoints remain disabled. M11-S06 owns reviewed release, isolated secret mount, Starfiniti-only activation/delivery/replay/rotation/retirement, exact reconciliation, rollback, observation, and module scoring.

## 2026-08-26 — M11 scoped service accounts and inbound APIs

- Accepted ADR-0045: the server parses one high-entropy opaque bearer credential, while PostgreSQL derives organization, workspace, programme, synthetic connection, scopes, entitlement, customer namespace, and quota authority from its digest.
- Added one-time credential issuance, bounded-overlap rotation, immediate revocation, minimized owner/admin operations, customer synchronization without email merging, and signed custom activity through the existing canonical event/effect/ledger pipeline.
- Added 72 focused pgTAP assertions and a tenth two-session probe for concurrent customer identity and fixed-minute quota serialization. Exact-head run `32927596360` at `479f605` passed baseline, both images, clean 66-migration replay, all 53 pgTAP files with 2,846 assertions, all ten concurrency probes, and all four WooCommerce runtimes after the browser-driven repair.
- Linux self-improvement runs exposed a reserved record name, incomplete security inventories, invalid V2 fixtures, missing harness-role membership, and a reserved test alias; narrow corrections made tests deterministic without relaxing production authority.
- Playwright desktop/mobile review found hard-coded dark confirmation colors, undersized review actions, and checkbox grid displacement. Tokenized colors, 40-pixel actions, and an explicit flex label passed 16.48:1 dark contrast, aligned review states, English-only output, reduced motion, keyboard focus, zero overflow, and zero browser diagnostics.
- Production API issuance remains disabled until M11-S06. M11-S05 now owns versioned TypeScript/PHP clients, outbound webhook lifecycle, and integrated health/deletion operations.

## 2026-08-26 — M11 exact multi-currency evidence

- Accepted ADR-0044: only immutable provider evidence selected at the canonical commerce occurrence can convert a foreign V2 order; WooCommerce, the browser, and worker timing never supply the rate.
- Added strict contracts and exact BigInt conversion, four private immutable/RLS evidence tables, independent PostgreSQL recomputation, exact retry binding, source-currency rule visibility, original-snapshot refunds, and an English review-before-save Operations policy surface.
- Production-build desktop/mobile review passed exact confirmation, dark mode, mobile navigation, keyboard focus, English-only output, zero overflow, and zero diagnostics after correcting undersized legacy actions and a masked focus ring.
- Linux self-improvement runs exposed and fixed stale security allowlists, wall-clock fixtures, invalid canonical-event shortcuts, test-role lookups, and the race harness membership assumption without relaxing production authority.
- Exact-head run `32918516110` at `6bf137c` passed baseline, both images, clean 65-migration replay, all 52 pgTAP files with 2,774 assertions, all nine concurrency probes, and all four WooCommerce runtimes. Production conversion remains disabled until M11-S06 receives an approved provider and completes canary reconciliation.

## 2026-08-26 — M11 verified cross-workspace customer identity

- Accepted ADR-0043: one live Auth subject must present a separate fresh WooCommerce HMAC proof for every store; email, profile attributes, organization membership, and browser tenant/customer inputs grant no identity authority.
- Added immutable exact link revisions, source-customer retention, transaction-scoped projection guards, stable canonical-customer routing, value-conflict rejection, Auth-derived unlink/relink, a minimized no-selector customer read, and explicit zero-ledger boundaries.
- Added strict contracts, server parsing/actions, an English responsive connected-stores experience, 53 focused pgTAP assertions, and an eighth concurrency probe covering simultaneous secondary proofs plus competing Auth subjects.
- Playwright review found and corrected unreadable 8–11 px supporting type, a small destructive action, and a non-rendering color-mixed focus ring. The corrected real component passed desktop/mobile layout, long-name wrapping, required confirmation, keyboard focus, reduced motion, degraded state, zero overflow, and zero diagnostics.
- Four database CI iterations failed closed on a reserved alias, legacy insert compatibility/ambiguous naming, test-role misuse, and a final temporary-fixture grant. The fixes preserved production authority. Exact-head run `32910582010` at `19c24a4` passed baseline, both images, clean 64-migration replay, all 51 pgTAP files with 2,716 assertions, all eight concurrency probes, and all four WooCommerce runtimes. M11-S06 owns production canary closeout.

## 2026-08-26 — VM 971 backup-traffic follow-up

- Re-established read-only operator access through the configured `s2-root` route and checked VM 971, bridge/tap counters, PVE RRD, active units, processes, sockets, timers, and Borg/rsync journals without mutating production.
- Confirmed the 3.60 TB VM transmit counter is historical from the Aug 14 full-stream incident and persists across the VM's 12.6-day uptime. The active unit is the reviewed incremental `rrsync` implementation; the tar-over-stdin command exists only in a timestamped rollback copy.
- The observed scheduled cycle transferred 50,108 bytes of new file content and 308,904 rsync wire bytes, while the direct tap counter rose about 383 KB. PVE's maximum VM outbound rate over both the last hour and last 24 hours was about 103 KB/s, with effectively zero disk reads. No other active timer or cron target referenced the database guest.

## 2026-08-25 — M11 explicit multi-store wallet scope

- Accepted ADR-0042: programme groups remain the wallet boundary, same-organization membership grants no implicit link, and cross-workspace customer identity waits for an explicit verified M11-S02 workflow rather than email matching.
- Added immutable sharing revisions and exact workspace membership, migration parity checks, RLS with revoked direct grants, a minimized member projection, and an owner/admin `ecosystem.api` command with group/workspace locks, optimistic revision, idempotency, audit, and connector-history removal protection.
- Added strict public-selector contracts and a responsive Hub-style Operations control for isolated/shared modes, exact store selection, protected connector states, unavailable handling, and review-before-save English copy.
- All 626 workspace tests, every workspace typecheck, targeted lint, production build, validators, 63-migration/50-pgTAP static validation, formatting, and diff checks pass. Native Chrome desktop/mobile review passed isolated-to-shared interaction, connector lock, exact review, keyboard focus, reduced motion, English-only output, mobile stacking, zero overflow, and zero unexpected diagnostics.
- First exact-head run `32905188833` correctly rejected two new `SECURITY DEFINER` functions missing from independent reviewed allowlists plus one ambiguous JSON-operator expression. The narrow fix added exact signatures and explicit parentheses without relaxing any migration, grant, policy, or authority. Run `32905613578` at `3cb609d` then passed all seven jobs: clean replay, all 50 pgTAP files and 52 focused assertions, all seven concurrency probes, both images, baseline, and all four WooCommerce runtimes. Only disabled production deployment/canary closeout remains for S01.

## 2026-08-25 — M10 shadow and canary gate

- Added a 29-check machine-readable analytics closeout gate with exact category arithmetic, a 90/100 target, an 80% per-category floor, sensitive-key rejection, deterministic automatic failures, and a self-test that rejects false completion.
- Added a read-only legacy Overview shadow at one exact scope/range/instant. The first CI run correctly exposed an invalid unlinked-wallet fixture; the fixture now uses a workspace-linked commerce identity so the comparison covers shared member and outstanding-point semantics without altering either production report.
- Exact-head run `32901023124` at `65f1dfb` passed all seven jobs, including the corrected shadow, clean 62-migration replay, 49 pgTAP files with 2,611 assertions, six concurrency probes, both images, and all four WooCommerce runtimes.
- Refreshed the public production baseline and recorded the real blocker: PR #37 is an unapproved stacked draft and neither configured SSH route proves safe Proxmox operator access. No production mutation was attempted.

## 2026-08-25 — M10 analytics command center

- Bound the four parallel interactive reports to one explicit database snapshot instant and rejected invalid, future, or divergent timestamps before presenting a combined decision surface.
- Added current/stale integrity labeling, value-free loading, explicit partial-error and reporting failure states, zero-denominator cohort states, six section anchors, and keyboard-focusable named table regions without synthetic values.
- Chromium review passed desktop/mobile responsive layout, zero document overflow, 16.68:1 primary heading contrast, keyboard anchors and data regions, reduced motion, English-only output, stale/empty variants, and zero browser diagnostics. Exact-head run `32900284858` at `e04fafd` passed all seven jobs, including a clean 62-migration/2,609-assertion database gate and all four WooCommerce runtimes, closing S05.

## 2026-08-25 — M10 controlled exports and scheduled reports

- Closed M10-S04 with one strict Dictionary V4/four-report JSON bundle, exact request/generation/timezone/digest evidence, 24-hour private payloads, and five-minute subject/session-bound one-use downloads.
- Added owner/admin scheduling plus analyst/auditor manual authority, daily/weekly/monthly IANA-local recurrence, atomic schedule/instant and command-idempotency fences, bounded lease/retry/expiry handling, and an isolated optional reporting worker with no loyalty-value authority.
- The adversarial two-session probe proved concurrent manual and schedule retries return one created plus one duplicate result, one due occurrence materializes once, two workers claim distinct jobs, and one capability consumer wins exactly once.
- Desktop/mobile Chromium review passed cadence interaction, keyboard focus, reduced motion, overflow, English-only output, private-operation copy, and zero diagnostics. Scheduled reports remain Hub downloads, not claimed email delivery, and the production profile remains stopped until S06.
- Exact-head run `32897999942` at `4f97f3a` passed root checks, both images, a clean 62-migration replay, all 49 pgTAP files with 2,609 assertions, every concurrency probe, and all four WooCommerce runtimes.

## 2026-08-25 — M10 cohort retention and causal evidence

- Closed M10-S03 with Dictionary V4's 103 exact definitions and an independently degradable mature-cohort/experiment report supporting IANA-local daily activation and exact elapsed-day 31–60 earning retention.
- Added an evidence-gated campaign intention-to-treat difference-in-means estimator over every immutable assignment, including zero outcomes, with exact rational evidence, one-currency reconciliation, 30-member-per-arm floors, and deterministic unavailable reasons.
- Preserved the causal boundary: eligible-spend lift is a point estimate rather than gross/accounting revenue or statistical significance, mixed currencies are not converted, and no customer, wallet, order, assignment, or fraud identity is exposed.
- Exact-head run `32893065219` at `02f03a4` passed root checks, both images, a clean 61-migration replay, all 48 pgTAP files with 2,549 assertions including 25 focused cases, and every minimum/current HPOS/legacy WooCommerce runtime.

## 2026-08-25 — M10 programme outcome performance

- Closed M10-S02B with Dictionary V3's 89 exact definitions and an independently degradable reward, VIP, referral, and campaign report sourced from immutable transitions, decisions, issuance/compensation facts, and purchase/trigger effects.
- Kept unresolved native rewards distinct from realization, reconstructed VIP movement by effective and knowledge time, removed referral identity from the projection, deduplicated multi-effect influenced orders, and compensated campaign spend and points through append-only reversal evidence.
- Preserved the causal boundary: influenced revenue remains descriptive and incremental revenue remains unavailable until S03 supplies a declared treatment/control estimator, population, window, exclusions, and sample evidence.
- Exact-head run `32889287858` at `37998c6` passed root checks, both images, a clean 60-migration replay, all 47 pgTAP files with 2,524 assertions, and every minimum/current HPOS/legacy WooCommerce runtime.

## 2026-08-25 — M09 WooCommerce Blocks progressive panel

- Closed M09-S04 with ADR-0038's PII-free `starfiniti-loyalty` Store API namespace, official WooCommerce Blocks integration handles, separately staged default-off data/panel flags, native no-script guidance, and zero render-time Hub dependency.
- Static and real Chromium review passed exact 3,821-byte source/1,177-byte gzip JavaScript and 980-byte source/430-byte gzip CSS budgets, fresh/stale and unsafe-link states, visible focus, same-origin navigation, mobile overflow, and zero browser diagnostics.
- Exact-head run `32859649418` at `bf5ec90` passed baseline, both images, a clean 56-migration replay, all 44 pgTAP files with 2,392 assertions, and every minimum/current HPOS/legacy runtime lane with staged flags, real namespaced Store API payloads, native coupons, no-script fallback, and forced Hub failure.

## 2026-08-14 — M01 backup transfer-amplification incident

- Contained VM 971's recurring 200–235 MB/s internal transfer after Proxmox tap/bridge counters, SSH journal entries, systemd cadence, and Borg statistics proved the host was pulling the complete 22 GB PostgreSQL recovery tree every cycle.
- Confirmed the traffic did not traverse the physical uplink and was not database replication or another guest. PostgreSQL, all Supabase containers, continuous WAL archiving, the daily verified base timer, and the Borg repository remained healthy.
- Replaced the single tar-over-stdin object with a forced read-only `rrsync` source, an owner-only incremental host stage, and normal Borg file caching while keeping the off-site repository credential off the database VM.
- Seeded the stage from the last valid encrypted archive. The first delta run transferred 269,360,503 guest bytes, the warm run transferred 16,871,892 bytes in three seconds, and a scheduled run transferred 50,602,257 bytes and completed Borg work in 0.50 seconds instead of retransmitting 22 GB.
- Rejected arbitrary-command use of the pull key, validated systemd and sudoers policy, extracted and byte-compared one base plus one WAL file from the new archive, and recorded ADR-0013, rollback copies, and R-033. Negotiated zstd then reduced a measured 50,331,648 bytes of new WAL to 45,178 guest-interface bytes without increasing the three-second cycle. Transfer anomaly alerting and the wider M01 full-service restore gate remain open.

## 2026-08-14 - M06 qualification and value-neutral cooling

- Closed M06-S01 at exact-head run `31763563259`: clean 37-migration replay, all 33 pgTAP files with 1,549 assertions, both concurrency probes/images, and all four minimum/current HPOS/legacy WooCommerce runtimes.
- Accepted ADR-0017 after comparing current-policy evaluation, a second SQL rules engine, and historical shared-evaluator evidence. Qualification now reloads the attribution's immutable V2 version so delayed publication cannot change paid-status, eligible-spend, or cooling meaning.
- Added private immutable qualification facts and worker-only context/record boundaries. PostgreSQL verifies canonical event identity/time, derives prior paid-order history and minimum-spend outcome, and appends cooling, deterministic rejection, or review-held evidence without issuing value.
- Added conservative source-refund rejection for captured/review/cooling states and an explicit `compensation_required` outcome after qualification. Exact-head run `31764805380` passed baseline, both images, a clean 38-migration replay, all 34 pgTAP files with 1,592 assertions including 43 focused qualification/cooling assertions, both concurrency probes, and all four WooCommerce runtimes.

## 2026-08-14 — M06 first-attribution foundation

- Reviewed current official Smile, LoyaltyLion, and Yotpo referral behavior and accepted ADR-0016: first eligible attribution from signed WooCommerce evidence, no synchronous hub call, no browser identity authority, and only purpose-separated expiring HMAC evidence for ambiguous risk review.
- Added the strict referral policy, one opaque Auth-linked advocate code, local WooCommerce capture, database-serialized first attribution, deterministic self-referral blocking, append-only review states, bounded fingerprint purge, and entitlement rollback. Attribution remains value-neutral until qualification and cooling pass.
- Added 55 focused pgTAP assertions plus contract/domain/worker/runtime coverage. Exact-head run `31763563259` passed clean replay, 1,549 total assertions, both images/probes, and all four WooCommerce runtime cells.

## 2026-08-14 — M05 progression and predeployment shadow gate

- Completed bigint-safe merchant and customer tier progress, immutable history, exact next/retention/re-entry milestones, aggregate tier performance, and the responsive advanced policy builder/simulator. Exact-head run `31759304542` passed 35 migrations, 1,491 pgTAP assertions, both images, and all four WooCommerce runtimes.
- The required V1/V2 shadow comparison found a predeployment correctness defect: preserved Bloom/Icon display rates of 6/7 points could execute the Rose 5-point base rate because all migrated multipliers were 1.0×. Advanced VIP was still undeployed and unpublished, so no customer value moved.
- Forward-fixed migration, contract, database, and editor boundaries to derive and enforce exact 1.0×/1.2×/1.4× benefits. All 36 V1/V2 Rose/Bloom/Icon award comparisons now match, and desktop/mobile production-build interaction kept display and serialized execution atomic.
- Exact-head run `31760806620` passed baseline, both production images, a clean 36-migration replay, all 32 pgTAP files with 1,494 assertions, both concurrency probes, and all four WooCommerce runtime cells. Reviewed merge, disabled deployment, recovery point, canary reconciliation, and scoring remain open.

## 2026-08-13 — M03 production canary and closure

- Release run `31738294379` passed the complete `v0.1.11` gate and published immutable artifacts from commit `0ced4b666a55d836bd3d4927337fe057a71bb4ba`.
- After the repaired recovery gate produced a fresh base and timer-driven encrypted archive, production transactionally applied migration `20260813200000`; its ledger entry, RLS, Starfiniti `programme.v2` override, zero-value baseline, and WAL archiver passed.
- A guarded application-selector error restored `v0.1.10` without replacing healthy containers; the corrected rollout then moved dashboard and worker to the exact `v0.1.11` SHA and passed readiness, public health/login, unsigned-ingress denial, and clean recent logs.
- Authenticated production Chrome rendered the V2 rule catalogue and exact `EUR 150.00 → 750 points` simulation at 1744 and 390 pixel widths with no overflow or browser diagnostics. No draft was saved or published because M05 must preserve the existing tier-specific V1 rates.
- M03 closes at 93/100 with every category at or above 80%. Evidence-based whole-product readiness rises to 54/100; M04 expanded rewards is next while M01 remains externally gated by an approved real store.

## 2026-08-13 — M01 live backup-export repair

- Stopped production migration work after the three-minute off-host PostgreSQL job failed closed: its recursive `tar` rewalk observed the live `wal/` directory changing during export.
- Added a versioned forced exporter that snapshots completed regular-file names and excludes partial bases, plus a versioned base-backup command that verifies recovery metadata and deletes WAL only before the oldest retained base boundary.
- Installed the reviewed scripts with prior versions retained, created and validated a fresh physical base, forced a WAL switch during a full 11.3 GB export, and completed two manual encrypted Borg archives.
- The next timer-triggered archive `loyalty-postgres-20260813T194657Z` completed in 51 seconds with exit code zero. Database-native PITR is healthy again; whole-VM application/Auth/signing recovery remains open.

## 2026-08-13 — M03 authoritative activity sources

- Extended the strict V2 rule contract with activity-code selectors and verified-review product/category conditions; the shared pure evaluator now proves source-specific matching and exact member caps.
- Added PII-free WooCommerce account-created and verified product-review events, queue claiming, public worker evaluation, connector validation, and real runtime smoke assertions without introducing a synchronous hub dependency.
- Added a separate-purpose signed Merchant Activity API with a streaming 64 KiB cap, exact raw-body HMAC, timestamp/nonce/key-version replay controls, public customer selectors, one audited source per workspace, and one-time secret packaging.
- Reused the canonical delivery/effect pipeline instead of creating a parallel value path. PostgreSQL derives tenant/programme scope and the worker commits evaluation, cap usage, and immutable ledger value atomically.
- Reviewed current official Supabase database-function/RLS, PostgreSQL locking, and WooCommerce webhook/review verification guidance; ADR-0012 records alternatives, security effects, rollout, and rollback.

## 2026-08-13 — M01 production and pilot reconstruction

- Connected read-only through the approved Proxmox host to application VM 970 and Supabase VM 971. Exact `v0.1.10` dashboard/worker images and all eleven Supabase containers are healthy; public health/login pass TLS and unsigned WooCommerce ingress fails with 401.
- Aggregate-only PostgreSQL evidence found one owner tenant/workspace/programme and one draft version, with zero connections, customers, wallets, ledger transactions, reservations, deliveries, canonical events, effects, or commands.
- WAL archiving, the physical base backup, three-minute off-host PostgreSQL Borg archive, and prior isolated WAL promotion are healthy/proven. The nightly whole-VM Borg timer is configured but has no completed run for the new loyalty VMs; corrected documentation instead of overstating application/Auth/signing recovery.
- Reviewed current official WooCommerce HPOS, Blocks, webhook, order, refund, and coupon guidance. Compared an existing merchant production store with a dedicated Starfiniti-controlled store; prefer the controlled store, and never treat SSH reachability as merchant approval.
- Added an exact 22-check pilot runbook and machine validator. Only database WAL restore currently passes; no store was selected or modified, and no customer or loyalty value was accepted.

## 2026-08-13 — M00 enterprise roadmap reconstruction

- Preserved the stale `agent/phase-4-woocommerce-inbox` worktree changes in a named stash, fetched repository truth, and created `codex/enterprise-roadmap` from clean `origin/main` commit `ff7978dd8faa4519a378f5bb538c7956905b2125`.
- Reconstructed released `v0.1.10` capability from status, tasks, risks, ADRs, migrations, contracts, tests, operations, WooCommerce integration, and production evidence.
- Reviewed current official Smile, LoyaltyLion, Yotpo, and Supabase change documentation. The comparison confirmed strong Starfiniti ledger/isolation/recovery architecture but material gaps in feature breadth, real-store proof, enterprise administration, and managed commercial operation.
- Compared a broad parallel feature build, sequential vertical modules, and third-party loyalty-core adoption. Accepted ADR-0009: dependency-gated vertical modules with server-side pilot canaries preserve authority, compatibility, and rollback evidence best.
- Added M00–M16 with measurable hypotheses, baselines, targets, owner inputs, acceptance, failure modes, rollout, rollback, verification, risks, docs, and evidence locations. Added a 49/100 product baseline and deterministic failures that scores cannot override.
- The clean Windows baseline reproduced the repository's tracked CRLF Prettier warning across 180 files before lint/tests/build. M00 uses targeted changed-file formatting plus independent validation rather than rewriting unrelated release history.
- A clean `npm ci` restored the declared worker build binary. Lint, 177 tests, all workspace types/builds, workflow/deployment/architecture/accessibility/WooCommerce/migration validators, secret scan, production audit, licences, changed-file formatting, YAML/JSON parsing, and diff safety then passed.
- Full development audit found the pinned WordPress test runtime's ZIP advisory. Its available minor update trades it for a different high advisory, so the dependency remains pinned, production audit stays at zero, untrusted runtime archives are prohibited, and R-032 blocks the M15 security gate until upstream resolves it.

## 2026-08-11 — Repository reconstruction

- Found no existing repository or implementation; preserved the user-provided design archive.
- Deferred Shopify per owner direction.
- Verified current Supabase self-hosting guidance and WooCommerce REST/compatibility requirements.
- Selected npm workspaces to match the available local toolchain.
- Implemented and visually verified the responsive Next.js Overview route against the approved 912 × 512 source.
- Fixed sidebar overflow, action/metric fidelity, mobile drawer state, and standalone static-asset packaging based on browser evidence.
- Verified the production bundle, four unit tests, PHP syntax, secret scan, migration naming/content validation, and production dependency audit.
- Left Phase 0 open because Docker-backed Supabase reset/migration/seed/RLS verification cannot run on this workstation.

## 2026-08-11 — Supabase database gate

- Rechecked the current Supabase changelog, CLI help, local workflow, pgTAP, and CI documentation.
- Added `db:start`, `db:reset`, `db:test`, `db:verify`, and destructive local cleanup commands discovered from CLI help.
- Added a transactional pgTAP security suite covering schema grants, RLS coverage, and privileged functions.
- Added a parallel Ubuntu/Docker database CI job using the lockfile-pinned CLI and full-SHA GitHub Actions.
- Added static validators for Supabase config/tests and CI safety contracts.
- Confirmed Docker, Podman, and WSL are unavailable locally. Kept Phase 0 in verification instead of claiming an unexecuted database pass.

## 2026-08-11 — GitHub publication and Phase 0 closure

- Created private repository `Starfiniti/starfiniti-loyalty` and pushed initial commit `3e822e8`.
- GitHub Actions run `31506030405` passed the baseline job and Linux/Docker database job.
- Replayed the foundation migration and seed, passed all eight pgTAP assertions, and removed the disposable test containers and volumes.
- Closed `P0-BOOTSTRAP` with execution evidence and started `P1-DOMAIN-DECISIONS`.
- Probed both Proxmox SSH aliases; the public host rejected the configured key and the VPN route timed out.

## 2026-08-11 — Rosy Rewards semantics and Phase 1 closure

- Received explicit owner approval for ADR-0004, a 30-day pending period, rolling eligible-spend tiers, Rose/Bloom/Icon at EUR 0/150/500 with 5/6/7 points, and AGPL-3.0-or-later.
- Resolved the master-plan/prototype tier conflict in the accepted ADR; EUR 1,000/8 points remains an unpublished future concept.
- Encoded Rosy Rewards as a validated, versioned fixture and kept programme behavior merchant-neutral.
- Added integer award, original-attribution refund, negative-balance, expiry-lot, and tier-review helpers. Award calculation requires the stored historical tier snapshot.
- Added 16 domain tests covering approved values, thresholds, month-end dates, cumulative partial refunds, downgrade grace persistence, negative balances, expiry ordering, and invalid inputs.
- Added the full AGPL license and package metadata while retaining the WooCommerce plugin's GPL license.
- Closed Phase 1 for the owner-directed WooCommerce scope and restored the Phase 2 architecture/threat-model gate before tenancy implementation.
- Merged PR `#1`, published the repository publicly under AGPL, and confirmed public `main` CI run `31513294330` passed both baseline and Docker/Supabase jobs.

## 2026-08-11 — Phase 2 architecture and threat-model gate

- Reviewed the current Supabase breaking-change changelog and self-hosting, RLS, Auth-key, JWT, and connection guidance.
- Incorporated Envoy's default gateway, `/auth/v1` external Auth URL, PostgreSQL 17 upgrade boundary, Studio ownership change, opt-in Data API exposure, and generated publishable/secret/asymmetric keys.
- Defined explicit browser, BFF, ingestion, worker, database-role, WordPress, and infrastructure trust boundaries.
- Designed live membership authorization, composite tenant keys, immutable double-entry ledger/projections, signed inbox/outbox, reward reservation, identity claim, privacy, backup/restore, and failure state models.
- Accepted ADR-0005, ADR-0006, and ADR-0007 with alternatives and rollback implications.
- Added `architecture:validate` to `npm run check`; full check, migration validation, secret scan, production audit, and license validation passed.
- Closed `P2-ARCHITECTURE` and started `P3-TENANCY-SCHEMA`.

## 2026-08-11 — Phase 3 tenancy and RLS gate

- Generated the tenancy migration through the pinned Supabase CLI workflow and exposed only the RLS-protected `loyalty` schema.
- Added organizations, memberships, workspaces, programme groups, explicit workspace sharing, expiring support grants, and composite tenant foreign keys.
- Added no-login ownership/runtime/worker roles, explicit grants, private fixed-search-path authorization helpers, and live membership policies.
- Added 41 pgTAP assertions covering tenant isolation, revoked and absent membership, scoped support, forbidden direct DML, ownership boundaries, and forged cross-tenant links.
- Used disposable GitHub Actions runs to correct Supabase migration-role ownership requirements and keep helper functions independent of the Auth schema.
- Exact-head run `31524730760` passed the baseline and database jobs: migrations replayed twice, reset and seed succeeded, all 49 pgTAP assertions passed, and containers were removed.
- Closed `P3-TENANCY-SCHEMA` and started `P4-WC-INBOX`.

## 2026-08-11 — Phase 4 signed WooCommerce ingestion gate

- Added strict delivery/canonical schemas and raw-byte signature helpers with bounded input, SHA-256, HMAC-SHA-256, constant-time comparison, timestamp policy, and connection/delivery binding.
- Added a WooCommerce local outbox using idempotent event keys and Action Scheduler retries. Checkout hooks perform no hub network call.
- Added the Next.js ingestion route with pre-parse connection/key lookup, secret-file material, signature verification, durable receipt, and retry-safe canonical normalization.
- Added commerce connection, inbox, canonical event, business effect, and transactional outbox tables with RLS, explicit runtime/worker grants, composite tenant foreign keys, and claim indexes.
- Added 38 commerce pgTAP assertions for privileges, replay, body conflicts, disabled connections, cross-tenant links, effect/command uniqueness, repeated normalization, and late/out-of-order history.
- Exact-head run `31527785181` passed the full baseline and Docker database gate with 87 total pgTAP assertions and cleanup.
- Closed `P4-WC-INBOX` and started `P5-LEDGER-FOUNDATION`.

## 2026-08-12 — Phase 5 immutable ledger gate

- Added programmes, immutable programme versions, customers/channel identities, wallets, six wallet accounts, and programme control accounts with composite tenant keys and RLS.
- Added an immutable header/entry posting design that inserts entries under a deferred foreign key and validates at least two non-zero entries summing exactly to zero before accepting the header.
- Added atomic idempotent award, release, reserve, capture, cancel, expiry, original-attribution refund reversal, and attributable manual-adjustment commands.
- Added earliest-expiry lots, immutable compensating allocations, wallet/lot projections, drift detectors, rebuild commands, tenant ledger export, and programme liability reporting.
- Added five ledger contract tests and 91 ledger pgTAP assertions covering privileges, tenancy, balance, immutability, retries, event effects, FIFO, resolution conflicts, negative balances, attribution, reports, and rebuilds.
- Added a two-session overspend test and a deterministic 20-round property sequence to the standard database gate.
- Exact-head run `31566530867` passed baseline and Docker/Supabase verification with four migration replays, reset/seed, 178 pgTAP assertions, the concurrency/property probe, and cleanup.
- Closed `P5-LEDGER-FOUNDATION` and started `P6-PROGRAMME-ENGINE`.

## 2026-08-12 — Phase 6 programme engine gate

- Added stable connector-neutral order rules for products, categories, collections, currency, market, channel, segments, dates, and explicit value-component exclusions.
- Kept live evaluation and simulation on one pure integer evaluator with immutable version attribution and human-readable per-line explanation evidence.
- Added approved draft/publication/scheduling commands, immutable materialized tiers/rewards, rolling/calendar/lifetime qualification helpers, and atomic effective tier intervals.
- Added reward reservations and audited transition history tied to unique same-wallet ledger transactions; connector failure restores points through an attributable cancel transaction.
- Added idempotent advance point-expiry notification fences and transactional outbox commands.
- Added 82 programme pgTAP assertions and versioned programme contracts, bringing the database suite to 260 assertions plus the ledger concurrency/property probe.
- Closed `P6-PROGRAMME-ENGINE` and started `P7-WOOCOMMERCE-CONNECTOR`.

## 2026-08-12 — Phase 7 WooCommerce pipeline implementation

- Added a bundled, separately credentialed worker with durable claim leases, retries, quarantine/dead-letter states, signed channel-ID customer resolution, and explicit connection-to-programme binding.
- Connected completed orders to immutable evaluation/award evidence and cumulative refund snapshots to original-attribution reversal with deterministic rounding and a full-refund cap.
- Added signed command polling/acknowledgement and idempotent native fixed, percentage, and free-shipping coupons without any checkout-time hub dependency.
- Added PII-free completed-order coupon capture, atomic reserved-to-spent settlement, expiry cancellation, and points release only after WooCommerce confirms an unused coupon was disabled.
- Added encrypted plugin signing material, validated settings, queue diagnostics, WP-CLI dead-letter retry and order reconciliation, customer reward surfaces, privacy export/erase, multisite policy, uninstall policy, and plugin ZIP packaging.
- Added a worker service and least-privilege database credential to the Proxmox compose contract; no persistent environment was mutated because the available SSH routes remain unusable.
- GitHub Actions run `31575751260` passed the final settlement database checkpoint with six migrations, 322 pgTAP assertions, concurrency/property probes, and cleanup. The expanded suite covers origin-pointer preservation, delayed issue acknowledgement, definitive issue failure, ambiguous cancellation, capture retry, and compensating release.
- Added a four-case Docker-backed matrix for WordPress 6.6.5/WooCommerce 9.0.2/PHP 8.1 and WordPress 7.0.2/WooCommerce 10.9.4/PHP 8.3 in HPOS and legacy modes.
- Exact-head run `31577312529` passed classic and Blocks-native coupon use with a configured unreachable hub and zero checkout HTTP calls, PII-free capture, partial/full refunds, reconciliation idempotency, activate/deactivate/reactivate, bounded dead-letter exhaustion, and operator retry.
- Closed `P7-WOOCOMMERCE-CONNECTOR`; the broader PHP, money, cache, and lifecycle release matrix remains tracked by R-008 rather than overstated.

## 2026-08-12 — Phase 9 merchant operations and source reconciliation

- Added tenant-scoped customer wallet/ledger reads, payload-free connector queue summaries/issues, guarded canonical-effect replay, and owner/admin immutable point adjustments with exact bigint preview.
- Exact-head runs `31581760825`, `31584171545`, and `31584351529` passed the clean baseline, disposable Supabase verification, and all minimum/current HPOS/legacy WooCommerce runtime variants for those slices.
- Added a reviewed owner/admin/operator source-order repair that atomically records actor/reason audit evidence and one private `woocommerce.order.reconcile` command.
- Extended the signed connector envelope and polling route. The plugin reuses its stable local reconciliation primitive to append order, refund, and coupon-capture facts without a central ledger mutation; missing orders dead-letter explicitly.
- Added 37 pgTAP assertions for privilege, tenant, role, revocation, input, live-connection, idempotency, claim-lease, acknowledgement, private-outbox, and immutable-audit boundaries, plus signed plugin runtime cases.
- Exact-head run `31585681985` passed that reconciliation slice with a clean Next.js build, ten migrations and 485 pgTAP assertions, and all four real WooCommerce runtime variants.

## 2026-08-12 — Phase 9 tenant-authorized Overview reporting

- Removed hard-coded Overview figures and the preview analytics disclaimer; no synthetic tenant value is rendered as truth.
- Added a stable, live-membership reporting wrapper scoped to one active organization/workspace/programme assignment and allowlisted 7/30/90-day UTC windows.
- Defined loyalty members/new members, eligible loyalty spend, repeat-member rate, captured-to-awarded point redemption, and pending/available/reserved point liability from immutable evaluation, ledger, and projection evidence.
- Kept raw canonical payloads, channel identities, evaluation inputs/explanations, ledger rows/metadata, actors, reasons, and signing material outside the browser response.
- Added exact text-form reporting contracts, `BigInt` formatting, aligned current/previous chart series, honest empty scope, and 33 pgTAP plus seven unit assertions for precision, boundaries, definitions, minimization, and tenant isolation.
- Exact-head run `31588394642` passed the clean baseline, eleven migrations, all 518 pgTAP assertions, concurrency/property probes, and all four real WooCommerce runtime variants.

## 2026-08-12 — Phase 9 exact customer read models

- Replaced multi-query JavaScript assembly with stable, live-membership database wrappers for the bounded customer list and 100-entry customer ledger detail.
- Cast every wallet balance and ledger point value to text before the Data API and format it with `BigInt`, removing IEEE-754 precision loss from customer screens.
- Moved channel-ID masking into PostgreSQL, made search literal and capped at 100 characters/50 results, and kept actor IDs, reasons, metadata, request hashes, and raw commerce evidence out of the response.
- Added 33 pgTAP assertions for privileges, search paths, indexed access, exact large integers, masking/minimization, fixed bounds, empty wallet scope, group mismatch, revocation, and cross-tenant isolation plus one dashboard precision test.
- Exact-head run `31589866616` passed the clean baseline, twelve migrations, all 551 pgTAP assertions, concurrency/property probes, and all four real WooCommerce runtime variants after one external Composer TLS retry.

## 2026-08-12 — Phase 9 initial programme onboarding

- Replaced the developer-dependent empty programme state with a guided owner/admin form for creating the first programme inside the selected active programme group.
- Added a narrow `create_programme_command` that derives actor and organization from live database state, locks the group, validates canonical name/slug inputs, preserves exact retry identity, and commits `programme.create` audit evidence atomically.
- Kept direct programme inserts unavailable to authenticated clients and left public organization/group provisioning disabled until abuse, billing, and lifecycle controls exist.
- Added 35 pgTAP assertions for exact privileges/search paths, canonical inputs, owner/admin authority, tenant/group derivation, retry/conflict behavior, role revocation, suspended groups, cross-tenant denial, RLS-filtered audit reads, and audit immutability.
- Exact-head run `31591151097` passed the clean baseline, thirteen migrations, all 586 pgTAP assertions, concurrency/property probes, and all four real WooCommerce runtime variants.

## 2026-08-12 — Phase 9 customer tier visibility

- Added a tenant-authorized one-row tier read model over the current membership interval and its immutable qualification decision.
- Exposed current and qualified tier labels, transition, exact text-form eligible-spend minor units, and effective/below-threshold/grace timestamps while omitting explanations, hashes, idempotency keys, actors, and unrelated history.
- Added responsive merchant customer-detail presentation with an honest unevaluated state and no invented tier default.
- Added 27 pgTAP assertions for exact privileges/search paths, bounds, grace semantics, large-integer preservation, minimization, live analyst access, and revoked/suspended/cross-tenant denial.
- Exact-head run `31592427051` passed the clean baseline, fourteen migrations, all 613 pgTAP assertions, concurrency/property probes, and all four real WooCommerce runtime variants.

## 2026-08-12 — Phase 9 keyboard bypass and responsive authentication

- Added a first-focus skip link and one focusable `main` target to all seven route surfaces so keyboard users can bypass repeated merchant navigation.
- Extended the shared visible-focus treatment to text areas while preserving the existing reduced-motion override and 44-pixel skip-link target.
- Added a deterministic accessibility validator to the complete repository check for route targets, skip-link wiring, text-area focus, and reduced-motion coverage.
- Rendered the authentication page at desktop and 390-pixel widths; the mobile capture exposed a CSS Grid intrinsic-size overflow, corrected with a bounded, shrinkable card width.
- Local accessibility validation, dashboard lint/typecheck, and all 27 dashboard tests pass. The in-app browser could not route to the workstation's localhost, so the successful local Edge DOM/capture evidence is recorded without claiming automated WCAG conformance.
- Exact-head run `31596460783` passed the baseline, fourteen migrations, all 613 pgTAP assertions, concurrency/property probes, and all four WooCommerce runtime variants.

## 2026-08-12 — Phase 9 sanitized support diagnostics

- Added a versioned JSON diagnostic download to the tenant operations view using the same live-membership/RLS-scoped connector read model already visible to the merchant.
- Aggregated the newest bounded issue sample by canonical kind, state, operation, error code, and retryability; the bundle labels both returned and maximum sample counts, and individual queue item IDs never enter it.
- Omitted display names, raw payloads, source/customer identifiers, actors, reasons, signing references, and secrets, and fail-closed redacted any noncanonical diagnostic string that could carry private text.
- Added direct unit evidence for deterministic scope, queue aggregation, issue grouping, impossible-counter normalization, and forbidden-value absence.
- Exact-head run `31597255280` passed the baseline, fourteen migrations, all 613 pgTAP assertions, concurrency/property probes, and all four WooCommerce runtime variants.

## 2026-08-12 — Phase 9 WooCommerce localization foundation

- Registered the self-distributed plugin's `/languages` directory at WordPress `init`, avoiding the too-early translation loading rejected by current WordPress behavior.
- Added an exact POT template for all 38 connector strings and a bundled Slovenian catalog using the performant `.l10n.php` format supported by every declared WordPress version.
- Added a deterministic validator for literal text-domain use, exact/no-stale POT coverage, customer-string coverage, nonempty translations, and placeholder parity; the validator is part of `npm run check` through `woocommerce:validate`.
- Verified the installable ZIP includes both language artifacts and added a real `sl_SI` locale switch plus localized customer-navigation assertion to every minimum/current HPOS/legacy runtime cell.
- Exact-head run `31598618092` passed the baseline, fourteen migrations, all 613 pgTAP assertions, concurrency/property probes, and the Slovenian navigation assertion in all four WooCommerce runtime variants.

## 2026-08-12 — Phase 9 controlled customer-experience themes

- Added one revisioned theme per linked tenant workspace/programme group with composite tenant foreign keys, member-read RLS, no direct browser DML, and an owner/admin-only idempotent command that appends immutable audit evidence.
- Defined a strict v1 token contract for a canonical brand color with 4.5:1 white-text contrast, three local font stacks, bounded radius and copy, tier/reward visibility, and widget side. Raw CSS, font URLs, scripts, and uploads are rejected rather than stored.
- Added a responsive `/experience` merchant editor with live member-wallet and guest previews, honest unsaved/revision state, role-aware controls, and setup guidance for unlinked scope.
- Added 41 adversarial pgTAP assertions, six new unit tests across contracts/dashboard, an eighth keyboard-bypass route guard, and a production-build route check.
- Exact-head run `31600742177` passed the baseline, fifteen migration replays, all 654 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 customer activity filters

- Added allowlisted URL filters for order earnings/refunds, reward reservation/capture/cancel, release/expiry, and manual adjustment activity on the customer detail timeline.
- Kept the existing newest-first, RLS-scoped, 100-entry minimized database response as the only data source; filtering neither queries nor exposes raw commerce, identity, metadata, reason, actor, or request evidence.
- Added visible filtered/total counts and distinct no-wallet-history versus no-matching-activity states, with keyboard-focusable filter links.
- Added three adversarial unit tests for unknown/array query fallback, complete transaction-kind categorization, and stable non-mutating filtering; the full unit total is 109.
- Exact-head run `31601351946` passed the baseline, fifteen migration replays, all 654 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 controlled bulk customer adjustments

- Added a responsive owner/admin route for selecting 2–50 active customers and reviewing exact database-derived before/after balances, aggregate effect, reason, expiry, programme version, and SHA-256 preview evidence.
- Added a bounded preview contract plus atomic execution command that derives tenant/actor authority, locks balance rows in deterministic order, rejects stale approval, and preserves exact retry behavior after the original batch changes balances.
- Added immutable RLS-scoped batch/item evidence, one zero-sum ledger transaction and credit lot/debit allocation per customer, and one minimized aggregate administration audit event.
- Added 39 pgTAP assertions for non-mutating preview, canonical arithmetic/order, exact retry, stale/conflicting input, role/revocation/cross-tenant denial, evidence immutability, and projection rebuilds.
- Exact-head run `31603764054` passed all six jobs: sixteen migration replays, all 693 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 WooCommerce storefront budgets

- Documented and enforced a zero-byte connector JavaScript, zero-byte connector CSS, and zero hub-request budget for customer account/cart rendering and checkout behavior.
- Retained native WooCommerce markup and coupon application, capped one account response at 20 active rewards, and set explicit source/markup ceilings so future expansion requires review.
- Extended all minimum/current HPOS/legacy runtime cells to render account/cart loyalty surfaces during forced hub outage and assert bounded semantic asset-free output with no HTTP request.
- Exact-head run `31604654919` passed all six jobs, including every storefront assertion in all four localized WooCommerce runtime variants and the unchanged 693-assertion database gate.

## 2026-08-12 — Phase 9 hosted customer translations

- Added separate RLS-scoped, revisioned customer-copy rows for the explicit English and Slovenian launch locales, keyed by the existing linked tenant workspace/programme scope.
- Added an owner/admin-only idempotent save command with canonical request hashing and immutable audit evidence containing scope, locale, and revision but no translated text.
- Refactored the experience editor into independent design-token and translation forms with a live locale selector; existing saved English theme copy remains the fallback until explicitly translated.
- Added strict contracts and 33 pgTAP assertions for supported locales, input/markup bounds, direct-DML denial, independent revisions, retries/conflicts, role/revocation/tenant/mixed-scope denial, RLS, and audit immutability.
- Exact-head run `31606226276` passed all six jobs: 114 unit tests, seventeen migration replays, all 726 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 hosted guest loyalty delivery

- Added a responsive public route for one active workspace and published programme with explicit English/Slovenian switching, merchant-controlled safe theme tokens, localized approved copy, exact tier rates, and bounded reward presentation.
- Added one stable anonymous PostgreSQL projection capped at 12 tiers and 20 rewards. The response omits organization identity, customers, ledgers, raw programme/reward configuration, actors, audits, connectors, signing data, and commerce evidence; underlying tables remain unavailable to `anon`.
- Added malformed-ID rejection before PostgreSQL, mixed/unknown/suspended/unpublished fail-closed cases, a merchant launch link, exact bigint formatting tests, and 26 pgTAP assertions proving the narrow schema/function grants, minimization, and zero read-side effects.
- Exact-head run `31608392260` passed all six jobs: 119 unit tests, eighteen migration replays, all 752 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 signed authenticated customer delivery

- Added a locally generated five-minute WooCommerce customer capability binding connection, numeric customer ID, issue time, UUID nonce, and current key version under the encrypted connector HMAC key; account rendering still makes zero hub requests.
- Added verified-Auth login continuation and an explicit store-labelled confirmation page with private/no-store/no-referrer handling so opening a link alone never changes identity state.
- Added revocable `customer_user_links`, immutable hashed `identity_link_decisions`, unique active user/customer fences, serialized conflict checks, exact replay behavior, and a private runtime-only claim command that never matches email.
- Added a no-argument Auth-derived self-service projection and responsive member page for exact pending/available/reserved points, current tier, nearest expiry, bounded safe rewards/reservations, and redacted recent activity.
- Added 39 claim and 27 self-service pgTAP assertions plus four claim contract tests, a safe-navigation bound, two new accessibility route guards, 40-string English/Slovenian plugin coverage, and real link-signature assertions in every WooCommerce runtime cell.
- Exact-head run `31618909782` passed all six jobs: 124 unit tests, twenty migration replays, all 818 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 controlled customer reward redemption

- Added an authenticated explicit-confirmation flow for native fixed-discount, percentage-discount, and free-shipping rewards; the browser submits only its linked account public ID, published reward code, and request UUID.
- Added one private Auth-derived database command that resolves the active customer, tenant, connector, programme version, and wallet, then atomically creates the reservation, immutable FIFO ledger effect, transition evidence, and private WooCommerce coupon-issue command.
- Added strict native coupon configuration contracts and database validation, exact idempotent retry semantics, full rollback on failure, and response minimization that excludes coupon codes, external customer IDs, and private command payloads.
- Added 45 adversarial pgTAP assertions, bringing the suites to 126 unit tests and 863 database assertions, plus a 390-pixel unauthenticated browser check for safe login continuation and private response headers.
- Exact-head run `31622879767` passed all six jobs: twenty-one migration replays, all 863 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 WooCommerce customer erasure

- Connected WooCommerce user deletion and its native privacy eraser to one opaque, locally deduplicated signed deletion event containing only the numeric channel subject.
- Added an immutable private privacy-case boundary with separately stored per-connection 256-bit pepper material and keyed subject fingerprints so low-entropy source IDs are not retained as plain digests.
- Added one leased worker transaction that pseudonymizes the channel/customer display state, revokes hosted access, scrubs raw and canonical deletion-event identifiers, preserves wallets and immutable ledger history, and suppresses repeat or later identity import.
- Added 47 adversarial pgTAP assertions plus connector runtime and strict contract/worker tests, bringing the suites to 128 unit tests and 910 database assertions.
- Exact-head run `31625573608` passed all six jobs: twenty-two migration replays, all 910 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 hosted customer language continuity

- Added one exact English/Slovenian locale boundary and complete system-copy dictionaries for login, WooCommerce claim, authenticated member-account, and native-reward redemption routes.
- Preserved the selected locale through validated local authentication, confirmation, success, error, public-programme, and redemption navigation; unsafe protocol-relative, backslash, unsupported, and oversized inputs fall back to English.
- Added the active WordPress locale to locally generated customer claim links outside the purpose-bound HMAC message, retaining the existing connection/customer/nonce authority and zero-render-request behavior.
- Added four locale unit tests and a 390-pixel Playwright check for Slovenian login, safe unauthenticated redemption continuation, and horizontal overflow, bringing the unit suite to 132 tests.
- Exact-head run `31627622779` passed all six jobs: twenty-two migration replays, all 910 pgTAP assertions, concurrency/property probes, and active-locale claim assertions in all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 one-time hosted customer data export

- Added password reauthentication before export and a random five-minute, one-use capability stored only as a SHA-256 digest and bound to the verified Auth subject and Supabase session.
- Added one no-selector private transaction that rechecks every active customer-link/tenant boundary, consumes the capability atomically, and returns a versioned document containing active linked identities, wallets, tiers, reservations, and complete wallet-side ledger history.
- Returned the document directly over TLS with private/no-store attachment headers and no PostgreSQL, object-storage, queue, or log persistence; immutable per-customer audit records contain no export payload or Auth email.
- Added 43 adversarial pgTAP assertions, contract/runtime tests, and a 390-pixel Slovenian password-reauthentication browser check, bringing the suites to 141 unit tests and 953 database assertions.
- Exact-head run `31629852692` passed all six jobs: twenty-three migration replays, all 953 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Phase 9 guided WooCommerce connector provisioning

- Added an owner/admin operations workflow for creating the first active WooCommerce connection only when the selected active workspace has an active programme with a published version.
- Kept key selection behind the trusted application runtime: a deployment generator creates or atomically appends unique 256-bit keys in a root-readable read-only pool, while PostgreSQL stores only globally unique opaque references.
- Added a runtime-only security-definer command with independent live role, tenant, workspace/programme, lifecycle, canonical store-origin, idempotency, and reference-reuse checks plus immutable secret-free audit evidence.
- Added a one-result exact JSON package and a WooCommerce settings importer that validates and saves endpoint, connection UUID, key version, and signing key together through the existing encrypted-at-rest option.
- Removed `signing_material_ref` from authenticated table-wide reads, added explicit safe-column grants, and proved that browser roles cannot call the provisioning command or observe secret references.
- Added 44 adversarial pgTAP assertions, three contract tests, two dashboard helper tests, a safe key-pool generator test, 43-message Slovenian catalog coverage, and real package imports in all four minimum/current HPOS/legacy runtime cells, bringing the suites to 146 unit tests and 997 database assertions.
- Exact-head run `31633310240` passed all six jobs: twenty-four migration replays, all 997 pgTAP assertions, concurrency/property probes, and real setup-package import in all four localized WooCommerce runtime variants.

## 2026-08-12 — Reproducible deployment artifacts

- Pinned every external dashboard/worker Docker stage to the same exact Node 24 Alpine manifest digest and added a build context that excludes Git state, dependencies, build output, coverage, logs, local environment files, and Supabase temporary state.
- Added a pull-request container job that performs real dashboard and worker image builds on the Linux/Docker runner.
- Added an exact `vMAJOR.MINOR.PATCH` release workflow that reruns the baseline and disposable migration/pgTAP gate before publishing dashboard and worker images under both commit-SHA and version tags.
- Added checksummed WooCommerce ZIP publication to the matching GitHub release and static enforcement for tag trigger, least required workflow permissions, full-SHA actions, digest-pinned bases, both image builds, database cleanup, and Proxmox image variables.
- Corrected the Proxmox environment template to require the worker image independently from the dashboard image. No release tag or production package has been created yet.
- Exact-head run `31634024586` passed all seven jobs: real dashboard and worker Docker builds, the baseline, twenty-four migration replays, all 997 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Secret-safe production configuration preflight

- Added a read-only preflight for the real off-repository Proxmox application environment and signing pool; output reports only pass/fail categories and pool-slot count, never supplied values.
- Enforced exact template/Compose variable parity, no duplicate declarations or placeholder values, commit-SHA image tags or digests, distinct dashboard/worker repositories, canonical path-free HTTPS origins, and a plausible publishable key.
- Required separate nonadministrative PostgreSQL logins with complete connection coordinates and an absolute 1–1000-entry signing pool containing canonical unique references and at least 256-bit exact-base64 keys.
- Enforced no group/other access on the signing pool when run on Linux and added adversarial self-tests for floating images, shared credentials, HTTP origin, placeholder key, duplicate env variables, malformed pool, unsafe permissions, and secret-free failures.
- Added the self-test to the complete repository check while keeping live DNS/TLS/connectivity, database role membership, package visibility, and restore evidence as real-environment gates.

## 2026-08-12 — Dependency-aware dashboard readiness

- Replaced the Proxmox dashboard root-page healthcheck with `/api/healthz`, a dynamic no-store route that exposes only `ok` or `unavailable` and catches all internal detail.
- Added one read-only catalog query that requires the configured database login to possess the exact signed-ingestion and guided-provisioning function privileges, plus validation that the mounted key pool contains at least one canonical entry.
- Added fail-closed pure tests for missing, null, duplicate, denied, and empty-pool states and made the deployment preflight require the readiness route in Compose.
- Added a pgTAP assertion that executes the same production catalog probe under `loyalty_runtime`, bringing the suites to 147 unit tests and 998 database assertions.
- Exact-head run `31635189128` passed all seven jobs: both production Docker builds, baseline, twenty-four migration replays, all 998 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-12 — Audited initial tenant bootstrap

- Added one deployment-only PostgreSQL boundary that atomically creates an organization, first live owner membership, workspace, programme group, and workspace/group link for an existing Supabase Auth UUID.
- Bound exact retries to a canonical request hash and stable organization-scoped idempotency key; changed retries, existing slugs, missing Auth users, noncanonical inputs, and partial state fail closed and roll back.
- Appended one minimized immutable `tenant.bootstrap` administration event while excluding email and tenant display names from audit metadata.
- Revoked execution from anonymous, authenticated, dashboard-runtime, and worker roles; the operator must connect directly through a trusted administration URL and assume `loyalty_owner` inside the transaction.
- Added a confirmation-gated repository command, secret-redaction self-tests, a production runbook, and adversarial pgTAP coverage for privileges, atomic scope creation, exact retry, conflicts, minimization, and audit immutability.
- Exact-head run `31636596218` passed all seven jobs: both production Docker builds, baseline, twenty-five migration replays, all 1,028 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants. The first run exposed one stale expected trigger message in the new test; the corrected exact head is green.

## 2026-08-12 — Phase 9 authenticated merchant launch localization

- Added one explicit English/Slovenian locale boundary to the authenticated Overview, programme, and connector-operations launch workflow, preserving it through safe links, sign-out, onboarding, draft saves, publish/schedule commands, provisioning, reconciliation, and effect replay.
- Localized programme rules/rewards authoring, deterministic preview values, immutable history/audit, guided WooCommerce setup and one-time secret handling, queue health, sanitized diagnostics, and action feedback while retaining English fallback for merchant-supplied names and technical identifiers.
- Replaced server-local parsing of `datetime-local` publication input with explicit Europe/Ljubljana conversion; winter/summer offsets are tested and DST gaps, ambiguous instants, malformed dates, and rolled calendar dates fail closed.
- Added 390×844 and 1440×1000 Playwright passes over the real Overview, programme, and operations components. Locale switching, add-reward and provisioning-review interactions pass without horizontal overflow, console errors, or failed requests.
- Exact-head runs `31638672681`, `31640311302`, and `31640919355` passed all seven jobs for the Overview, programme, and operations slices, ending at 154 unit tests, twenty-five migration replays, 1,028 pgTAP assertions, concurrency/property probes, both production images, and all four localized WooCommerce runtimes.

## 2026-08-12 — Customer and experience administration localization

- Localized customer search, detail, tier, wallet, immutable activity filters, individual adjustments, and exact-preview bulk adjustments in English and Slovenian while preserving locale through navigation, review forms, and server-action outcomes.
- Reused one explicit Europe/Ljubljana wall-time parser for programme publication and customer credit expiries, retaining exact winter/summer conversion and fail-closed DST gap/ambiguity handling independently of the server timezone.
- Localized the bounded experience-theme and customer-copy editor, role/validation/conflict/revision feedback, and responsive preview shell while keeping the independently selected customer preview locale authoritative for sample wallet copy and formatting.
- Added a navigation-aware document-language and first-focus skip-link boundary with a server-rendered English accessibility fallback.
- Playwright exercised the real customer and experience forms at 390×844 and 1440×1000, including adjustment review and customer-locale preview interactions, with no horizontal overflow, console errors, or failed requests. A production login pass verified the Slovenian document language and keyboard skip link.
- Exact-head runs `31642070490`, `31642918324`, and `31643300533` passed all seven jobs with 154 unit tests, both production images, twenty-five migration replays, all 1,028 pgTAP assertions, concurrency/property probes, and all four localized WooCommerce runtime variants.

## 2026-08-13 — Phase 9 adversarial release hardening

- Replaced pre-buffer `Content-Length` checks on both public signed WooCommerce routes with a shared streaming 64 KiB reader that validates declared lengths, cancels overflow, and completes before database or signing-material access.
- Added a ten-claim ceiling for issue, cancellation, and reconciliation commands. Exhausted and expired-ceiling commands enter an inspect-only `manual_review` state with bounded diagnostics; ambiguous coupon issuance keeps its reservation and creates no speculative release ledger transaction.
- Removed unsupported maximum caps from native percentage rewards. Contracts and authoring reject them, PostgreSQL independently blocks direct authenticated publication/scheduling and legacy capped redemption before any durable effect, and the real plugin matrix now covers uncapped percentage coupons.
- Moved allowlisted document language to the server-rendered root layout, preserved Slovenian across authenticated and guest redirects, strengthened the public experience color contract, and removed inert Overview search/preferences/notification and placeholder navigation affordances.
- Parallel adversarial reviews covered complexity, security, value flows, project idioms, and prototype cruft; all verified blocker and should-fix findings were fixed and independently re-reviewed with no unresolved release-level finding.
- Exact-head run `31645976689` passed all seven jobs with 164 unit tests, both production images, twenty-six migration replays, all 1,049 pgTAP assertions, concurrency/property probes, and uncapped percentage issuance in all four minimum/current HPOS/legacy WooCommerce runtimes.

## 2026-08-13 — v0.1.0 production deployment

- Merged the release branch, published `v0.1.0`, and verified exact-head release run `31681490618` produced immutable dashboard and worker images plus the checksummed WooCommerce plugin archive.
- Deployed pinned self-hosted Supabase and the application onto isolated Proxmox VMs behind Caddy TLS at `loyalty.starfiniti.com` and `api.loyalty.starfiniti.com`; public database, pooler, and administration ports remain closed.
- Applied all twenty-six migrations, created distinct least-privilege runtime and worker logins, disabled public signup, validated dashboard readiness, and confirmed unsigned WooCommerce ingress and command requests fail closed.
- Enabled PostgreSQL WAL archiving, daily physical base backups, restricted off-host export, and encrypted Borg retention. The first off-host archive passed `pg_verifybackup` with the exact production PostgreSQL image; a complete start-and-WAL-replay RTO rehearsal remains open.
- Recorded two rollout safeguards: the signing pool must be owner-readable by the container UID `1001`, and Supavisor must be recreated after a database-container address change so it does not retain stale Docker DNS state.

## 2026-08-13 — Authentik workforce SSO

- Added a Starfiniti workforce button to the hosted login while retaining password login for customers and omitting workforce SSO from purpose-bound customer-export password reauthentication.
- Supabase Auth remains the broker and durable RLS subject. The server starts `custom:starfiniti-sso` with PKCE and exact scopes, validates the canonical dashboard callback, and rejects authorize URLs outside the configured Supabase origin, `/auth/v1/authorize` path, or provider.
- Accepted ADR-0008: Authentik application entitlement is authentication-only; live Loyalty memberships and RLS remain tenant authority, and mutable OIDC/user metadata grants no role.
- Production recovery points and a secret-free Authentik blueprint exist. Public signup remains disabled, and tenant bootstrap is explicitly blocked until the owner completes a real SSO flow and the linked custom identity, session, and Supabase UUID are verified.
- Zero-warning lint, all workspace typechecks, 167 tests, workflow/deployment/architecture/accessibility/WooCommerce validators, both application builds, secret scan, zero-production-vulnerability audit, and licenses pass. Changed parseable files pass targeted Prettier; the repository-wide Windows check retains only the tracked CRLF baseline.

## 2026-08-13 — English-only launch presentation

- Product-owner direction superseded the original bilingual launch requirement. Removed language switchers from merchant, login, customer account, public programme, and experience-editor surfaces; legacy locale queries now canonicalize to English.
- Limited active customer-copy authoring and rendering to English while retaining historical locale-keyed database rows and contracts for migration compatibility rather than rewriting released migrations.
- Removed the bundled Slovenian WooCommerce catalog and stopped adding language to signed customer-claim navigation. The standard WordPress text domain and exact source POT remain available for a future explicitly approved localization phase.
- PR `#10` passed all seven CI jobs and merged at `3d1a7cb`; release run `31691454507` published `v0.1.2`, its checksummed WooCommerce ZIP, and immutable application images.
- Production now runs the exact `3d1a7cb` dashboard and worker images. Public smoke against the legacy `?lang=sl-SI` login URL returned English HTML with Starfiniti SSO and no language switcher or Slovenian label.

## 2026-08-13 — Workforce SSO callback hardening

- A real owner login reached Authentik and Supabase successfully but the Next.js PKCE exchange failed, then its error redirect exposed the internal `0.0.0.0:3000` bind address.
- Enabled flow-specific verifier correlation through the reserved `sb_flow_id`, passed only bounded flow identifiers into the one-time code exchange, and hardened production server auth cookies as HTTP-only, Secure, SameSite=Lax.
- Anchored every callback success and failure to `DASHBOARD_PUBLIC_ORIGIN`, rejected unspecified bind-address origins, and added route/unit coverage proving internal request origins cannot escape into browser navigation.
- The first deployed correction eliminated the bind-address redirect but live browser verification proved the exchange still stopped before Supabase's token endpoint. Excluded the one-time callback route from proxy session refresh so its pending verifier cookies reach the route unchanged.

## 2026-08-13 — Focused Programme workflows

- Audited the authenticated production Programme experience after owner feedback and confirmed a structural defect: Earning rules and VIP tiers shared one fragment URL, Rewards was only another fragment, Programme overview contained the complete editor, and same-page navigation could accumulate hashes.
- Reused the approved Programme, Earning, Rewards, and Tiers prototypes and the owner-selected Hub tokens to create four honest routes without changing the database or programme value contract.
- Kept each focused editor contract-complete: earning changes preserve tiers/rewards, reward changes preserve all tiers, and tier changes preserve earning rates/rewards before one immutable draft command is submitted.
- Added guided WooCommerce-ready reward creation, exact order simulation, tier qualification preview, overlap validation, unique active navigation, route-wide cache revalidation, and accessibility coverage.
- Dashboard typecheck, 83 dashboard tests, the 14-surface accessibility guard, and the standalone production build pass. Chrome interaction QA at 1440 × 1024 and 390 × 844 found no horizontal overflow or console error.
- PR `#20` exact-head run `31713151458` passed all seven CI jobs with 177 unit tests, both production images, twenty-six migration replays, all 1,049 pgTAP assertions, concurrency/property probes, and all four minimum/current HPOS/legacy WooCommerce runtimes.
- Release run `31713458344` published `v0.1.10`, the checksummed WooCommerce ZIP, and immutable commit `4713c65e4ca47c0a97264854afea46f6a8730a3a` dashboard/worker images. Both images are healthy on the production Proxmox application VM with the prior `v0.1.9` environment retained for rollback.
- Authenticated production Chrome verification passed all four live Programme routes, first-reward setup, `€200 → Bloom → 1,200 points` simulation, overlap blocking, exact navigation, the mobile drawer, and a 390-pixel no-overflow check with no browser warnings or errors.

## 2026-08-13 — M02 deployment entitlements

- Added versioned self-hosted/managed deployment modes, 18 stable capabilities, exact optional limits, append-only tenant overrides, deterministic percentage rollout, explicit canaries, and private externally configured provider mappings.
- Made PostgreSQL the authority and denied browser/runtime/worker mutation. Auth claims and provider configuration grant nothing; six balance/refund/reconciliation/checkout/export/promised-redemption paths cannot be disabled.
- Added contracts, a fail-closed dashboard adapter, ADR-0010, API/data/threat/deployment/runbook updates, a deterministic no-provider validator, and 46 focused pgTAP assertions.
- Exact-head run `31723413178` passed baseline, both containers, migration replay, all 1,095 pgTAP assertions, concurrency/property probes, and all four WooCommerce runtime cells.
- PRs #22–#24 merged sequentially. Production took a new physical base backup, applied the exact v27 migration, entered managed mode, enabled only the Starfiniti `programme.v2` canary, retained all 6/6 protected paths, kept billing/provider mapping inactive, and passed WAL/readiness/unauthorized-ingress smoke.
- M02 closes at 93/100 with every category at or above 80%. Product readiness rises from 49/100 to 51/100; M03 is next while the M01 real-store gate remains externally pending.

## 2026-08-13 — M03 competitive earning rules

- Added the strict `ProgrammeDefinitionV2` contract and shared exact-bigint evaluator with explicit exclusions, base/multiplier/bonus precedence, per-event/member caps, immutable explanations, and V1 compatibility.
- Extended WooCommerce with PII-free account-created and verified-review facts, then added a purpose-bound signed Merchant Activity API for birthday, referral, and custom authoritative activity without browser-supplied value authority.
- Added database-authoritative entitlement, publication validation, immutable rule materialization, serialized cap accounting, atomic evaluation/ledger commit, exact retries, and source provisioning with one-time external signing material.
- Replaced the old tier-rate-only Earning Rules view with a Hub-style V2 rule catalogue, allowlisted condition/exclusion/cap builder, conflict warnings, migration review, and the exact shared live simulator.
- Local lint, typechecks, focused/full tests, validators, production build, and desktop/mobile browser interactions pass. Exact-head Docker database replay and the managed pilot canary remain the closure gates.

## 2026-08-14 — M05 earned-date point expiry

- Added a strict earned-date `PointExpiryPolicyV2`, immutable per-version policy materialization, and a bounded single-flight worker lifecycle that groups expiry by original tenant, wallet, and programme version.
- Preserved original-lot expiry through reward reservations and cancellation, scheduled nearest-relevant 30/14/7 reminders behind durable deduplication fences, revoked worker access to the low-level expiry primitive, and exposed only minimized aggregate liability evidence.
- Exact-head run `31756142529` passed a clean 34-migration replay, all 32 pgTAP files and 1,472 assertions, both concurrency probes, both production images, and all four WooCommerce runtime variants.
- A temporary production-build Playwright fixture exercised the real merchant shell and expiry editor at 1440 by 1000 and 390 by 844. Reminder filtering, liability evidence, mobile navigation, and responsive layout passed with no horizontal overflow or browser diagnostics; the fixture was removed after verification.

## 2026-08-26 — M13-S02 organization/team lifecycle

- Added capability-bound organization creation/invitation/acceptance/revocation, optimistic team member changes, exact organization state transitions, owner quorum, suspended-owner recovery, bounded identity evidence, and a Hub-style responsive Team & access workflow.
- Adversarial review repaired retry-time expiry drift, repeat-form operation reuse, revoked-capability replay, delegated pending capabilities after administrator authority removal, shared-role mutation access during suspension, multiple retained owners after offboarding, stale lock-entry expiry time, and owner omission at the bounded projection limit.
- Production-build browser review passed light/dark desktop, 390-pixel mobile, 320-pixel narrow, keyboard drawer trapping/restoration, inert background, desktop-breakpoint recovery, reduced motion, English-only output, 44-pixel controls, zero overflow, and zero final diagnostics after dark-surface and mobile accessibility repairs.
- Local focused tests, lint, typecheck, production build, workflow/static migration validation, secret scan, and production dependency audit pass. Exact-head Linux run `32966869787` at `e02765568b91a316953e5fa53bd0298fb72ff866` then passed all seven jobs: root checks, both images, clean 72-migration replay, all 59 pgTAP files with 3,128 assertions including the 70 focused lifecycle assertions, all 14 concurrency probes, and all four WooCommerce runtimes.
- The preceding run correctly rejected a retry fixture whose separate statement clocks supplied different expiry input under one idempotency key. The fixture now binds exact retries to one transaction timestamp while preserving the explicit changed-expiry conflict case.
