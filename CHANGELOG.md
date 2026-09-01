# Changelog

- Activated a temporary, owner-approved solo-maintainer merge policy under
  ADR-0124. Pull requests remain mandatory but require zero approvals because
  the repository has one administrator and no eligible second reviewer. All
  twelve app-bound checks, strict current-base evaluation, signed commits,
  resolved conversations, administrator enforcement, and force-push/deletion
  blocks remain exact. The exception expires no later than
  `2026-12-01T05:59:20Z` and must be rolled back sooner if a second eligible
  collaborator appears or the owner revokes it. Release remains manually
  disabled; its preflight now requires the newest run for every app/check pair
  to pass and enforces a 24-hour exact-head cooling-off period. This records
  solo authority honestly and does not claim independent review, penetration
  testing, release, deployment, or GA approval.

- Rebound M15 automated security evidence after the solo-policy workflow change.
  Exact candidate `b97dde21de81660b7c182e5b2653fb1617863750` passed CI
  `33598916504`, Security `33598916554`, and external CodeQL `100148436020`.
  Fresh digest-bound CodeQL, repository, image, SBOM, DAST, scanner-freshness,
  WooCommerce, and Medium-triage evidence restores 19/27 checks. The eight tagged
  release, production review, independent test/retest, final reconciliation, and
  approval gates remain open; no production state changed.

- Added ADR-0121 and an additive database-authoritative guard for storefront
  theme and English-copy authoring. Managed tenants whose
  `storefront.experience` capability is disabled now fail before either
  authoring table changes; explicit canary enablement restores writes, later
  disablement stops new revisions, and existing configuration remains readable.
  The merchant editor presents the same fail-closed state and stale commands
  receive accurate guidance. Analytics is now reachable from the persistent
  sidebar. The complete local gate passes 1,001 workspace tests, both builds,
  every deterministic validator, 90-migration/70-pgTAP static validation,
  secret scan, zero-vulnerability production audit, and licence inventory.
  Exact implementation `996d78227f310b949fe352264f655fde1f3bdb09`
  passed CI `33525862937` and Security `33525862820` across all twelve checks,
  including all 70 pgTAP files and 3,845 assertions. Eligible independent PR
  review and the stacked merge chain remain pending. Production,
  self-hosted defaults, checkout, coupons, ledger value, M09 status, and scores
  are unchanged.

- Reconciled the semantic backup-network control to exact Linux and fresh
  production evidence. CI `33518906422`, Security `33518906410`, and independent
  CodeQL `99893417542` pass at implementation
  `f822a7933ac207e83ec780b3cbe1c8cdb704cedb`; retained artifact `9804957219`
  binds the Linux amd64 observability canary while the Security job executes the
  collector's positive and fail-closed runtime fixtures. A new read-only VM 971
  sample measured 468,904 guest-egress bytes over twenty seconds and only a
  10,376.71 bytes/s one-hour RRD peak. The whole-VM timer remains
  disabled/inactive and the latest PostgreSQL backup service result is success.
  R-004/R-049, production monitoring activation, M15 scores, release, and
  loyalty state remain unchanged.

- Added ADR-0120 and a production-disabled semantic network-rate guard for the
  VM 971 incident shape. A hardened non-root oneshot reads only two
  operator-bound Linux network counters, atomically publishes three
  topology-free textfile metrics, and has no network, process, Docker,
  database, backup, or loyalty mutation authority. The bounded catalogue now
  has 34 signals and 29 exact alerts: one detects guest egress above 100 MiB/s
  and four times physical-uplink egress for one minute, while the other pages
  immediately when either counter is absent or capture evidence is older than
  90 seconds. The locked dashboard shows derived rates and capture age;
  deterministic corruption tests and a Linux runtime fixture reject weakened
  thresholds, stale-evidence coercion, topology leakage, unsafe authority,
  arguments, wrong-direction paths, malformed output, and non-atomic mode
  drift. The full gate exposed that immutable V1/V2 recurrence controls were
  incorrectly re-read from the evolving working tree before their existing
  merge-commit proof; the validator now checks merged control bytes at the
  recorded merge commit while candidate controls still bind current bytes.
  Accepted V1 and V2 history remains unchanged except for rebinding the
  candidate validator's own new digest. Focused gates pass locally. Production
  activation remains false, R-004 stays open, and no product score, service,
  network, database, checkout, or loyalty value changed.

- Stabilized the M15 capacity adapter self-test after repeated full-suite and
  stress execution reproduced an event-loop-only false failure. All four
  adapters and every scenario decision passed; the sub-second Windows harness
  alone occasionally exceeded the real 25 ms production-driver threshold. The
  canonical 24-minute workload remains unchanged at 25 ms. Only the loopback
  self-test now uses a bounded 250 ms scheduler ceiling, while failures retain
  minimized adapter, scenario-decision, and driver-decision diagnostics without
  exposing authority, origin, payload, or credentials. One hundred consecutive
  post-fix stress iterations pass.

- Added an append-only read-only production follow-up for the VM 971 backup
  incident. A ten-second tap sample, complete latest-day/month RRD, five
  consecutive PostgreSQL archive completions, timer state, and public
  readiness prove that the historical 200–235 MB/s full-stream loop remains
  absent. A closed YAML successor binds the accepted containment evidence by
  SHA-256, and the operations validator recomputes traffic and archive
  chronology while rejecting cumulative-counter, erased-archive, unsafe-timer,
  production-mutation, monitoring-activation, and false-closure claims. The
  whole-VM timer remains disabled, the PostgreSQL timer remains healthy, and
  R-004 stays open for dedicated-repository, monitoring, retention, custody,
  and isolated-restore evidence. No production state or loyalty value changed.

- Added ADR-0119 and a generalized M16 recurring-failure registry without
  rewriting the accepted recovery-specific V1 bytes. V2 retains the two R-004
  Borg-lock occurrences and adds the R-065 GitHub Actions startup failure plus
  both supply-chain setup failures as three distinct chronological occurrences.
  It binds the exact thirteen-pattern policy, full-SHA requirement, false broad
  GitHub-owned and verified-creator trust, successful third attempt, candidate
  preflight/validator controls, and an explicit prohibition on claiming
  exhaustive future composite-action discovery. Fifty-eight adversarial cases
  now reject erased negative evidence, policy drift, false merge/release/
  deployment authority, and V1 history drift. PR #58 is now merged as a verified
  squash; Release, deployment, production, product scores, and protected loyalty
  value remain unchanged.

- Enabled repository-native continuous security without enabling Release.
  ADR-0118 corrects ADR-0117's first direct-only action inventory after
  fail-closed startup/setup evidence: Actions now allow thirteen exact patterns
  covering nine direct references and four newly required Trivy composite
  patterns,
  deny implicit GitHub-owned and verified-creator trust, and require full-SHA
  pinning. Vulnerability alerts, unpaused Dependabot security updates, secret
  scanning, push protection, and private vulnerability reporting are live. Two
  deterministic Stripe-format unit-test
  fixtures were resolved as `used_in_tests`; zero Dependabot, code-scanning, or
  secret-scanning alerts remain open and no external credential rotation is
  claimed. ADR-0117 and the chronological evidence successor extend release
  preflight to enforce these controls, exact branch check/app identities, signed
  and last-push approval policy, and the two distinct tag rulesets. Release,
  deployment, and production remain unchanged. The changed release-workflow
  input first returned M15 Security to 7/27. Exact candidate `4ac7414` then
  passed CI `33501867357`, Security `33501867336`, and external CodeQL
  `99837291269`; a new digest-bound review restores 19/27 without relabeling the
  historical `fec7f86` artifacts.

- Enforced the repository-side release authority boundary without enabling
  Release. Protected `main` originally required twelve exact app-bound checks,
  signed commits, one review, stale-review dismissal, last-pusher separation,
  resolved conversations, and administrator enforcement while blocking force
  pushes and deletion. ADR-0124 later replaced only the impossible review count
  with bounded solo authority. Two active tag rulesets still allow only audited
  signed `v*.*.*` creation and prohibit matching-tag update or deletion without
  bypass. The protected release environment, policy token, and eight external
  gates stay open. No tag, release, deployment, or production state changed.

- Added a closed live GitHub release-policy audit and adversarial validator.
  The read-only snapshot records eleven green checks on merged `main` while
  proving that branch protection, rulesets, environments, and the repository
  policy token are absent and the replacement Release workflow remains
  manually disabled. Eight external publication gates remain explicit; the
  audit made no repository-policy, release, deployment, or production change.

- Contained the recurring production recovery conflict without stopping the
  loyalty VM or database. Live Proxmox RRD and interface counters show that VM
  971's 3.605 TB value is cumulative from the 2026-08-14 full-stream incident;
  current one-day traffic peaks at 107 KB/s. Host RRD and Borg's kilobyte-scale
  deduplicated additions confirm that the old amplification stayed on the
  internal VM-to-host path; later physical totals include whole-host backups.
  The whole-host job remained configured for raw disks, shared the PostgreSQL
  Borg boundary, and had both caused a 1h34m36s
  off-site gap and failed its next scheduled run on the shared lock. Its timer
  is now disabled/inactive. The three-minute PostgreSQL timer remained active
  and created `loyalty-postgres-20260901T092222Z` after containment with 67,757
  changed bytes and 576,022 wire bytes. Existing archives, database, VM,
  application, checkout, and loyalty value were unchanged; R-004 remains open.

- Reconciled the enterprise handoff after PR #57 merged reviewed head
  `149724a3a2fad89d1a7990e0c3114be2754ecab6` into `main` as
  `c85d93d0e6e0273543078050e697f04309f11d93`. Post-merge CI
  `33475350770` and Security `33475350801` passed. ADR-0116 promotes that exact
  merged commit only as the unchanged 83/100 candidate, advances the three
  R-004 controls from candidate to merged, and removes the completed merge
  dependency from IMP-012. Product scoring now correctly keeps unresolved
  Critical recovery, host/runtime security, release-policy, and penetration-test
  gates active instead of treating green integration checks as clearance. The
  fourteen owner gates remain thirteen external and one dependency-blocked;
  Release workflow `333373957` remains manually disabled and production remains
  v0.1.11 at 54/100 with no deployment or loyalty-value change.

- Refreshed the M16 material-change score and generated owner handoff against exact 2026-08-31 implementation evidence. Code head `7fb4403863e7409e38bf4fbfc1f3ec68d6325e3f` passed CI `33434852244` and Security `33434852266` with 999 workspace tests, both images, 89 migrations, 3,831 pgTAP assertions, 22 concurrency probes, and all four WooCommerce runtime cells; evidence head `609705692d2fe38e64b12360d392e1c62aabdf74` passed all twelve PR checks. The fourteen-item backlog now records the 3,604,822,111,248-byte recovery-transfer incident and exact M14 repair without changing a gate state or score. Production remains 54/100, the candidate 83/100, M14 provisional 90/100, and M16 77/100; no production or loyalty-value state changed.

- Repaired additive V2 managed-usage recovery for mixed V1/V2 worker rollout. Counter backfill and active evidence normalization no longer destroy an in-flight V1 claim identity; an expired authorized V1 claim consumes exactly one provider attempt even after nine prior policy holds, while an expired pre-network claim consumes none. Compatible lease creation and V2 normalization now use separate fail-closed statements so PostgreSQL snapshot visibility cannot strand a processing row. Public-function security allowlists and the one-live-subscription fixture now match the intended schema. Exact code head `7fb4403863e7409e38bf4fbfc1f3ec68d6325e3f` passed CI `33434852244` and Security `33434852266`, including all 89 migrations, 3,831 pgTAP assertions, 22 concurrency probes, both images, and all four WooCommerce runtime cells. Production billing remains disabled and unchanged.

- Added ADR-0115 and replaced the unsafe tag-sourced release design with a
  default-branch `repository_dispatch` workflow. Read-only preflight verifies
  external branch, tag, check, and environment policy; an exact candidate build
  creates one sealed short-lived artifact; and only an independently approved
  publisher without checkout or build steps receives write access. The Release
  workflow remains manually disabled until every external control, licence,
  security, and owner gate is complete; no tag, package, release, or deployment
  was created.

- Added ADR-0114 and additive V2 billing safety. Managed Checkout now loses
  provider retry authority after 23 hours, requires immutable owner-only
  reconciliation, and rejects a second live subscription. Usage metering now
  separates claim churn from actual sends, preserves canonical order occurrence
  time, and counts only immutable SMTP delivery rather than Klaviyo acceptance.
  Self-hosted mode still returns before provider access and every billing path
  remains disabled in production.

- Hardened M04–M11 canary evidence with one bounded, cycle-safe minimization
  scanner and corrected merchant action state so one-time service credentials
  survive route revalidation while completed operations cannot be silently
  replayed. Exact code head `7fb4403863e7409e38bf4fbfc1f3ec68d6325e3f`
  passed CI `33434852244` and Security `33434852266`.

- Refreshed M15's stale production-reality snapshot from a bounded read-only
  observation. VM 971's cumulative counter was 3,604,822,111,248 bytes while
  the latest hour averaged 3,263 bytes/s and peaked at 9,761 bytes/s; three real
  PostgreSQL archives completed in ten minutes without contention, the timer
  was waiting, and the whole-VM service was inactive. This updates evidence
  only: no monitoring service, recovery design, score, production state, or
  owner authority changed, and R-004 remains open.

- Recorded a bounded post-incident production revalidation without changing
  the server. Six real PostgreSQL off-site archives completed at
  199–211-second intervals, the newest was 110 seconds old, the timer was
  waiting normally, and the one-time whole-VM service was inactive. VM 971's
  live receive rate was about 680 bytes/s and its one-hour maximum was 9,753
  bytes/s, so neither the historical full-tree transfer nor immediate archive
  staleness was active. R-004 and M15 recovery/operations remain open because
  the shared lock, unbounded wait, missing paging, retention, and isolated
  restore defects are unchanged.

- Added ADR-0113 and closed every future M16 monthly, quarterly,
  reconciliation, score, and approval V1 artifact schema. The validator now
  rejects unknown nested members, identity keys, embedded email or credentials,
  credential-bearing URLs, control and bidirectional text, unbounded content,
  duplicate evidence, malformed role slugs, and non-finite metrics through
  thirty-seven completion mutations. Full private inputs remain environment-
  owned, schema extension requires a superseding version, and no elapsed gate,
  approval, score, runtime, or production state changed.

- Added ADR-0112 and a production-disabled M15 observability deployment
  candidate. Exact OCI indexes bind Prometheus 3.14.0, Alertmanager 0.34.0,
  Grafana 13.2.0, blackbox_exporter 0.28.0, and postgres_exporter 0.20.1 in a
  read-only, capability-free, loopback-administered Compose plane with
  unpublished exporters, isolated control traffic, bounded resources, and
  environment-owned targets and secrets. An exact-archive non-root
  node_exporter enables only aggregate textfile collection. Repository and
  adversarial validation pass 9/16 deployment checks; the Security workflow
  now runs a clean Linux exact-version/configuration/teardown canary. Production
  activation, receivers, live targets, dead-man paging, observation,
  reconciliation, module/product scores, and loyalty value remain unchanged or
  pending.
- Rebound the M15 security manifest to the changed Security workflow and
  intentionally invalidated prior exact-head CodeQL, repository, image, SBOM,
  DAST, header, scanner-freshness, Medium-triage, development-audit, and
  WooCommerce claims. Seven repository contracts remain passing and twenty
  checks are pending until the new exact candidate and artifacts are reviewed;
  historical evidence was preserved rather than relabelled.

- Added ADR-0111 and a fail-closed M16 recurring-failure registry. The register
  records the 2026-08-28 and 2026-08-31 PostgreSQL off-site shared-lock gaps as
  two distinct digest-bound evidence anchors under one Critical R-004
  fingerprint. It binds exact candidate decision, implementation, validator,
  monitor, and runbook bytes while explicitly retaining null merge, production,
  and observation proof. Twenty adversarial cases reject false occurrence,
  path, digest, control, delivery, and activation claims. This adds no production
  authority or mutation; the dedicated repository, paging, continuity,
  retention, restore, elapsed monthly reviews, scores, and approvals remain
  unchanged or open.

- Recorded a repeat production off-site recovery gap without changing the
  server. VM 971's tap remained quiet and its local base/WAL source was fresh,
  but a one-time whole-VM raw migration held the shared Borg lock while the
  deployed PostgreSQL service waited under a 14,400-second lock/five-hour unit
  boundary. No backup metrics were deployed to page. The migration later exited
  successfully and the waiting service created a new incremental archive, but
  the exact completed-archive gap was 1h34m36s. Exact live script/unit hashes
  prove production is neither the ADR-0070 bounded-failure artifact nor the
  ADR-0071 dedicated-repository controller. R-004 and M15 recovery/operations
  remain open; scores, release, production configuration, routes, checkout, and
  loyalty value are unchanged.

- Reconciled the reviewed `74a37e9` M15 security artifacts from CI
  `33384160196` and Security `33384160199`. The fresh digest-bound review
  records zero Critical/High vulnerability findings, zero DAST
  Critical/High/Medium/Low alerts, zero false positives, and maps all 29 Medium
  reciprocal-licence occurrences to 15 exact dispositions. M15 Security is now
  19/27; 14 third-party source/notice dispositions still block tagged image
  distribution, and all eight release, production-review, independent-test,
  reconciliation, and approval gates remain open.

- Added ADR-0110 and a fourteen-scenario exact Authentik 2026.8 runtime
  rehearsal. Digest-pinned Authentik, PostgreSQL, and Node Linux/amd64
  manifests run on one internal-only Docker network with no published port,
  Docker socket, production route, or real credential. A read-only operator
  bundles the production federation client and covers disabled OIDC/SAML
  reconciliation, idempotent rotation, strict downstream OIDC discovery, and
  Authentik's outbound SCIM discovery, pagination, provisioning, membership,
  quoted removal, and deactivation against a bounded synthetic sink. The root
  gate runs only the network-free contract and bundle self-test; the existing
  Security recovery job runs the containers and retains a minimized report
  after exact teardown. Exact implementation `c94cc9e` and evidence head
  `e96cd18` passed CI `33381604540`, Security `33381604545`, and external
  CodeQL `99455421534`; recovery job `99454991777` passed all fourteen runtime
  scenarios and published only the minimized digest-bound artifact. Fresh
  automated evidence advances M15 Security to 18/27; the prior Medium triage is
  intentionally not inherited. This is not M13 production-canary, RLS,
  recovery, rollback, upgrade, or deployment authority; production and scores
  are unchanged.

- Added ADR-0109 and an exact Authentik 2026.8 source/OpenAPI compatibility
  contract. It pins the 2026.5.6 baseline and 2026.8.0 candidate tag, commit,
  schema, release, OCI/GHCR, attestation, and protocol-source provenance. A new
  offline root validator binds all 27 owned admin operations and 248 sent field
  occurrences across 18 request schemas—240 exact and eight compatible—plus
  OIDC/SAML/SCIM and stale-session invariants,
  rollback, remaining runtime gates, and false production authority. Source
  facts can be independently recomputed from immutable commit URLs with an
  explicit networked verifier; the root gate remains offline. Source
  compatibility is not runtime acceptance: production stays on 2026.5.6 and no
  provider, tenant, session, database, checkout, or loyalty value changed. M16
  and product scores remain unchanged. Exact implementation
  `5b9419acdfe0e4cd84db81d258ed3692b88ed85c` passed CI `33368245319`, Security
  `33368245722`, and external CodeQL `99413667343`; all 12 PR checks are green
  and PR #57 is merge-clean.

- Added ADR-0108, a clean-commit bounded public Authentik runtime collector,
  exact 3,257-byte minimized evidence for served patch `2026.5.6`, and an
  append-only V2 provider-impact amendment. Three independent same-version
  assets and both health endpoints are digest/status bound without retaining
  bodies, headers, cookies, addresses, credentials, or private configuration.
  Official policy supports the exact patch on the prior feature line, changing
  only Authentik from High unknown to Medium supported-prior-line; V1 remains
  immutable. Image/outpost inventory, private recovery evidence, `2026.8`
  compatibility, candidate acceptance, approvals, deployment, production
  mutation, and reconciliation remain open. M16 and product scores are
  unchanged. Exact `de8e19f` passed CI `33363302645`, Security `33363302635`,
  and external CodeQL check `99399102937`; all twelve PR checks are green and
  PR #57 is clean and mergeable.

- Added ADR-0107 and a cutoff-bound M16 provider-impact register. The register
  binds the immutable thirteen-source and six-provider installed snapshots,
  classifies every canonical entry as two Critical, five High, three Medium,
  and three Low, assigns engineering dispositions, and records
  provider-specific rollback. A root-gated network- and SSH-free validator
  rejects forty-six snapshot, catalogue, pin, candidate, evidence, task, ADR,
  and false-authority corruptions. Unknown state remains blocking, automatic
  upgrades remain prohibited, and the elapsed monthly review, acceptance,
  approvals, deployment, production mutation, and reconciliation remain
  incomplete. M16 and product scores are unchanged. Exact implementation
  `e4a1e573` passed CI `33306849568`, Security `33306849601`, and external
  CodeQL `99244979080`; all twelve checks are green.

- Added ADR-0106 and refreshed only the reviewed federation/notification
  untrusted-input patch set: exact `fast-xml-parser` 5.11.1, Nodemailer 9.0.6,
  and test-only `smtp-server` 3.19.4 pins with Git/npm provenance and coherent
  rollback. Existing bounded independent SAML validation and SMTP transport-
  plus-message file/URL denial remain unchanged. A new root-gated validator
  rejects thirty-two package, lock, source-control, task, ADR, rollback, and
  production-authority corruptions. No contract, migration, ledger, tenant,
  checkout, release, deployment, or production state changed; M16 and product
  scores remain unchanged. Adversarial review then separated candidate runtime
  dependency change from live production mutation, bound the actual SAML/SMTP
  source controls, rejected unknown review fields, and added runtime regression
  tests for the 256 KiB SAML limit and both SMTP denial layers. Clean install,
  all 997 workspace tests, both production builds, static database validation,
  secret scan, production audit, licence inventory, and diff review pass. Exact
  implementation `c14a8f5` passed CI `33281041057`, Security `33281041055`, and
  external CodeQL `99176310303`; all twelve checks are green and PR #57 is
  merge-clean.

- Added a durable enterprise task-graph validator and wired it into the root
  quality gate. It requires exact M00-M16 coverage, unique bounded task/slice
  IDs, valid acyclic dependencies, the approved active/deferred scope, Shopify
  deferral, the fixed 90/0.8 deterministic completion boundary, measurable
  enterprise module fields, and effective owner inputs for every active slice.
  Twenty-three adversarial mutations cover module/ID/input omission or duplication,
  hidden follow-up and pending-work bypass, missing dependencies, cycles,
  invalid dates/root shapes, removed dependency edges, false/sub-90 completion,
  baseline identity, scope and score weakening, and unsupported status.
  M09 and M09-S06 now explicitly declare the approved immutable release
  and storefront window, real linked WooCommerce pilot, and recovery/rollback
  inputs already required by their canary evidence. M00 stays 94/100 and M09
  stays 88/100; no runtime, release, deployment, pilot, checkout, or loyalty
  value changed.

- Repaired the authentication card at narrow and short viewports. Company SSO controls now stack below 480 pixels instead of collapsing the organization slug field, and tall login/access cards retain safe centering while owning a bounded vertical scroll range so final guidance and actions remain reachable. The accessibility validator guards those layout primitives. Production-rendered Chromium passed desktop, 390×844 mobile, and 320×500 keyboard stress checks with same-origin protected redirects, English-only output, no horizontal overflow, and zero browser diagnostics. Exact integrated candidate `1e55a82` passed CI `33276262061`, Security `33276262148`, and external CodeQL `99163614374` with all twelve checks green. Explicit material-change rescoring leaves M09 at 88/100, the integration candidate at 83/100, and deployed production at 54/100 because no live gate changed. No Auth, tenant, checkout, connector, or loyalty-value state changed.

- Added ADR-0105 and repaired the WooCommerce tagged-release identity contract.
  Historical v0.1.11 and the development tree expose `0.1.0-dev`; future
  release packages now derive an exact numeric version from the Git tag and
  inject it only into the plugin header, runtime constant, POT project version,
  and readme stable tag. Deterministic closed-inventory packaging and an
  independent bounded ZIP verifier reject unsafe or non-regular entries,
  encrypted paths, inventory drift, development markers, version mismatch or
  duplication, missing metadata, source mutation, and non-reproducible output.
  CI builds and verifies a synthetic package, the release workflow verifies the
  tag-derived package before publication evidence, and the M15 release record
  must prove tag/plugin equality. Exact Security run `33272662903` then found a
  High file metadata/open race in the new reader; the corrected boundary opens
  read-only/no-follow descriptors first and reconciles path identity only after
  the bounded descriptor read. Correction `695067c` passed CI `33273056805`,
  Security `33273056780`, and external CodeQL `99155114588`; all twelve PR
  checks are green, the minimized CodeQL artifact has zero findings, and PR #57
  is merge-clean. The candidate remains 83/100 because a real corrected tag and
  live evidence are still absent. No release, deployment, or production state
  changed.

- Refreshed M16 after the material M15 capacity change without inflating product
  readiness. The V2 score now binds exact integrated candidate `cbe89b4` and
  remains 83/100; deployed production remains 54/100. The recomputable backlog
  grows from twelve to fourteen by ranking the still-unapproved whole-system
  fault exercise at 69 and supported-capacity exercise at 61 as distinct
  external gates. Adversarial review also closes a deletion/substitution bypass:
  the validator now requires the exact fourteen-item blocker set and each
  blocker's canonical evidence path in addition to recomputing its score and
  order. Exact implementation `affa2ef` passed CI `33270731237`, Security
  `33270731250`, and CodeQL `99148811211` with all twelve PR checks green and PR
  #57 merge-clean. M16 remains 77/100 with seven of 39 checks passing. No load,
  fault, deployment, production mutation, checkout change, or loyalty value is
  claimed.

- Added ADR-0104 and replaced M15's label-only independent-capacity evidence
  with an exact Grafana k6 2.2.0 cross-check contract. The official OCI index,
  Linux/amd64 manifest, canonical workload, and reviewed script are
  digest-bound; all four phases and scenarios use rational constant-arrival
  rates, closed VU limits, contract-aware results, zero dropped iterations, and
  recomputed schedule/error/latency decisions. Authority stays in read-only
  files, cloud/usage/raw output is disabled, known production origins are
  refused, temporary summaries are removed, and only minimized aggregates are
  retained. Twenty-three evidence checks plus corruption fixtures reject tool,
  image, workload, plan, phase, scenario, schedule, drop, threshold, raw-target,
  and production-authority drift. The complete local repository gate passes
  with 995 tests, both production builds, all 23 capacity checks/corruptions,
  and every release, recovery, security, operations, score, accessibility, and
  WooCommerce validator. Adversarial review additionally closed a false secret
  collision on the public `v1` WooCommerce key selector, rejected impossible
  duration/VU and non-monotonic or negative latency aggregates, and required
  caller-owned private authority paths plus exclusive report publication below
  a stable parent. The exact image/script inspection is delegated to Linux CI.
  A real approved independent run and every
  capacity/reconciliation gate remain pending, so no capacity number,
  deployment, production access, checkout change, or loyalty-value mutation is
  claimed.
  Exact implementation commit `c8e3439` passed CI `33269532474`, Security
  `33269532376`, and CodeQL `99145597424`; all 12 PR checks were green and the
  Linux baseline successfully completed the pinned image/script inspection.

- Added ADR-0103 and an exact Supabase repository patch refresh: CLI 2.116.0,
  supabase-js 2.112.4, and SSR 0.12.5, including every matching platform binary
  and client subpackage. The reviewed CLI restores a true default for
  `auto_expose_new_tables`; the Supabase configuration and database validator now
  require explicit false while preserving the existing public API schema list,
  private-schema exclusion, explicit grants, and RLS. A network-free validator
  rejects forty-seven official-source, package, lockfile, Node, configuration,
  immutable-evidence, task, ADR, and false-authority corruptions. Exact
  implementation `1b9a4d4` passed CI `33265165945`, Security `33265166008`, and
  external CodeQL with all twelve checks green; immutable 5,932-byte evidence
  SHA-256 `3826e55e239bb4a2f9a3ee6d3d3f3e7541c5de0572d0d53dcd552b3cccd21aa7`
  binds the complete database, image/security, and WooCommerce regression.
  PostgreSQL client 3.4.9 is already current and unchanged. No production stack,
  database, release, checkout path, or loyalty value changed.

- Added ADR-0102 and an exact Next.js 16.3.3 security update for two official
  Critical unauthenticated RCE advisories affecting the previously pinned
  16.3.0 runtime. Next.js and eslint-config-next now use matching exact npm
  package and lockfile integrity evidence; image optimization remains disabled
  as defence in depth, and rollback to a deployable 16.3.0 artifact is
  prohibited. A network-free validator binds advisory/release provenance,
  released-production impact, task/risk/backlog evidence, package bytes, and
  false merge/release/deployment/reconciliation authority through twenty-nine
  corruptions. A clean-install complete local gate passes with 995 tests, both
  production builds, 87 migrations, 69 pgTAP files, all validators, zero npm
  audit findings, secret scanning, and licence validation. Exact implementation
  `c3b2954` passed CI `33261152926`, Security `33261152934`, and external
  CodeQL with all twelve checks green; a 5,199-byte immutable evidence record
  binds the rebuilt images and complete regression/security results under
  SHA-256 `d90150e1ec818f1fa092df6cf6a91137c1333cf5b97b4eafb4bcfe3b4ec205ca`.
  Explicit merge, release, deployment, observation, and reconciliation gates
  remain pending; production is unchanged on 16.3.0.

- Added ADR-0101 and a fail-closed current WordPress/WooCommerce compatibility review. The disposable current matrix now uses versioned WordPress 7.1 and WooCommerce 11.0.1 URLs on PHP 8.4 in both HPOS and legacy modes, while the WordPress 6.6.5/WooCommerce 9.0.2/PHP 8.1 minimum remains unchanged. Exact implementation `c3b2954` passed all four minimum/current × HPOS/legacy jobs in CI `33261152926`; the 4,291-byte immutable evidence file binds reviewed artifact checks, live runtime assertions, native coupon order/reconciliation paths, cleanup, chronology, and false production authority under SHA-256 `950091da92c90a5834a1020bed83d275e1d3b0891ff6ca565ac79d2a0682188e`. The network-free validator rejects twenty-three source, matrix, evidence, byte-preservation, task, and authority corruptions. Real release and pilot-store upgrade gates remain pending; no production store, VM, database, checkout path, or loyalty value changed, and M16 remains 77/100.

- Added ADR-0100 and an exact Node 24 LTS runtime refresh. Both dashboard and
  worker build/runtime stages move from the immutable 2026-08-03 Node 24.19.0
  index to the official 2026-08-27 Node 24.20.0 index. The M16 review binds the
  thirteen-source snapshot, official release and Registry index/platform/config
  identities, impact owner, rollback pin, and false production authority. A
  network-free validator rejects ten source, digest, mutable-tag, partial-stage,
  rollback, engine, and authority corruptions. The complete 995-test local gate,
  static migration/pgTAP validation, secret scan, zero-vulnerability audit, and
  licence checks pass. Exact head `d2c347a` passed CI `33257511194`, Security
  `33257511192`, and external CodeQL with all twelve checks green; the immutable
  evidence record binds fresh images, SBOMs, Trivy, CodeQL, DAST, database,
  concurrency, and WooCommerce jobs. Release deployment, rollback observation,
  and production reconciliation remain open, and production is unchanged.

- Added ADR-0099 after exact candidate `e71e62d` passed CI but the raw CodeQL
  artifact proved three findings remained. The minimizer now resolves rules from
  CodeQL tool extensions, not only the driver, and dismissals never satisfy the
  repository policy. Federation preflight and fault-exercise inputs use
  descriptor-first read-only/no-follow file access. Klaviyo's legacy 64-hex
  credential field now carries a connection-bound scrypt V2 fingerprint, with a
  secret-safe operator CLI for disabled-first provisioning. ADR-0098's
  federation HMAC remains accepted hardening, while its original attribution of
  the older two findings is explicitly corrected. The complete local gate passes
  with 995 tests and all builds/validators. Candidate `ccf1d89` reduced the raw
  CodeQL count from three to one; the remaining OS-temp-derived read-only fault
  input now carries an explicit owner-only creation-mode fail-safe. Final
  candidate `fe8a6ff` passed all twelve exact-head checks, raw CodeQL analysis
  has zero results, and fresh Trivy, image, SBOM, DAST, dependency, WooCommerce,
  database, recovery, and Medium-triage evidence advances the M15 security
  manifest to 18/26 checks without changing production.

- Added ADR-0098 after the first retained CodeQL summary correctly blocked two
  previously unclassified results. The SARIF minimizer now reads exact
  `security-severity/<score>` tags and treats malformed/conflicting declarations
  as unknown; temporary fixtures use explicit `0600` files. Tenant-federation
  upstream and broker credential bindings now use purpose-separated
  HMAC-SHA256 under a fourth distinct owner-only canonical 256-bit key while
  preserving the V1 64-hex wire shape and disabled self-hosted deployments.
  Authentication precedes secret-file reads, and deployment preflight rejects
  linked or changing federation inputs through stable no-follow reads.
  Exact-head CodeQL and retained artifact proof remain pending.

- Repaired two Medium CodeQL message-origin findings in the executable design
  prototype by binding host/editor messages to the exact parent/self source and
  load-time origin before payload access.
- Added secret-safe minimized CodeQL and repository Trivy evidence plus exact
  24-hour Trivy database/check-bundle freshness proof; raw SARIF and raw secret
  matches remain ephemeral and excluded from artifact uploads.

- Added ADR-0096 and the V3 native-rsync private recovery-artifact escrow contract. Immutable V1/V2 bytes remain hash-bound, the cross-suite V2 `rsync-transport` candidate is explicitly historical-only, and the effective closed catalogue contains thirty unchanged BorgBackup/OpenSSH entries plus forty-four native-rsync executable, wrapper, signed-source, rollback, endpoint-dependency, retained-report, build, runtime, governance, and evidence inputs. The no-network/no-copy/no-execution verifier requires exactly seventy-four entries, rejects replacement artifacts and wrong/duplicate endpoint dependency bindings, and emits only versioned minimized false-authority evidence. Exact implementation `21262cf08e265c61d3e76e1971ce7604916469cc` passed all twelve CI, Security, and independent CodeQL checks; real custody, independent review, consumer/selector, forced-command/archive, and isolated-restore gates remain pending, and production and M16 are unchanged.

- Added ADR-0095 and a safer rsync 3.5.0 production-candidate architecture. The prior package canary and V2 escrow remain immutable, but future activation no longer upgrades the Proxmox host's global `libacl1`: exact signed upstream source is verified against a closed safe-tree manifest, built separately for Debian 13 and Ubuntu 24.04 with native hardening plus executable-structure checks, and staged only under a versioned side-by-side root while distribution executables, packages, and native ACL libraries remain exact rollback anchors. Bootstrap Security run `33247037670` passed the disposable internal-network current/candidate interoperability, confinement rejection, bounded two-file/21-byte payload, read-only non-root isolation, and exact teardown, and its retained report discovered separate Debian/Ubuntu executable digests plus one shared wrapper digest. Trivy and CodeQL then failed closed on an absent runtime health check and a report-path reopen; both controls are corrected and all four Security jobs pass at `49aa5d1`. Locked plan SHA-256 `46adc671b15fddead44c014edb334dc815ef14ee4d17bcdc3f18dd2ffb9c120f` makes all three artifact digests mandatory. Security run `33248120835`, recovery job `99089014687`, rebuilt that exact locked plan, reproduced every hash, and passed all four security jobs; artifact `9713549190` and the exact retained report are independently hash-bound. Candidate plan SHA-256 is `cb6fee76b837c5274172182d7a58de71d2ccf13901722f856833b2ce6e7e0912`. V3 escrow, real provider/archive/restore evidence, and independent approval remain pending. Production and VM 971 were not accessed or changed.

- Added ADR-0093 and an executable private recovery-artifact escrow boundary for the proven BorgBackup and OpenSSH candidates. A closed 30-entry policy binds candidate, rollback, signing, dependency, build, runbook, decision, evidence, and canary inputs; a no-network, no-copy, no-execution verifier creates only a private manifest and an external minimized report through direct-parent, repeated bounded stable no-follow descriptors, rejects missing, extra, linked, mutable, wrong-byte, wrong-commit, ambiguous-check, and report-leak inputs, and keeps fingerprint, dependency, offline-custody, second-review, production, and escrow-complete claims false. Exact implementation `504555c` passed CI `33243336082`, Security `33243336070`, and separate CodeQL check `99076519435`. No real escrow or production change occurred, so R-004 and M16 remain open at the same score.

- Added ADR-0092 and a fail-closed, client-only OpenSSH 10.5p1 recovery candidate without changing production. The review distinguishes the applicable privileged-client malicious-server boundary from agent-forwarding, multiplexed remote-forwarding, and tunnel-restriction features that the backup path does not use. The plan binds Debian's exact installed host client and rollback package, Ubuntu's exact current guest client/server/SFTP packages and server executable, the official portable archive/release checksum/detached signature/release-key fingerprint, a safe permission-normalized 930-entry/892-file/10,059,047-byte source manifest, a versioned client-only build, explicit forwarding/proxy/multiplex/password prohibitions, internal no-port current/candidate compatibility, health-checked non-root image defaults, an exact minimal root override for the disposable server, bounded exclusive evidence, and exact teardown. Bootstrap Security run `33240398639` discovered executable SHA-256 `be9dd9ee2550e3fca2a6fa15edb5ab9303e42ac783ac766928fa5380971bf081`; digest-locked candidate `275c9e8` then passed exact-plan Security run `33241151463` job `99070606112`. The retained 741-byte report and GitHub artifact archive have distinct SHA-256 bindings. Both distribution daemons, `/usr/bin/ssh`, keys, known-host data, consumers, production, R-004, and M16 remain unchanged or open.

- Added ADR-0091 and a fail-closed BorgBackup 1.4.5 security candidate without changing production. Debian's exact installed Trixie `borgbackup=1.4.0-5` package and `/usr/bin/borg` executable remain the rollback anchor; Debian records `CVE-2026-62268` as affected with a no-DSA/minor disposition. The selected upstream single-directory artifact is bound by exact archive/signature/README hashes, the README-published full primary fingerprint, VALIDSIG primary fingerprint, executable digest, and a pre/post-extraction 106-entry, 95-file, 79,942,815-byte safe tree manifest. A digest-pinned Debian 13 build independently requires signed-metadata and exact-URL byte equality for the rollback package. The networkless, read-only, UID 65532, capability-free runtime covers current/candidate clients against current/candidate remote servers, eight operation families, candidate extraction of a current archive, rollback extraction of a candidate archive, strict local fake-SSH commands, resource ceilings, exclusive minimized output, and exact container/image teardown. Exact implementation `fe727d5` passed Security run `33235799207` job `99056449824`; the retained report SHA-256 is `f5336456b20afa1f188893019a63cd323562eea83dc1aacda3d698bb7bca113c` and the GitHub artifact archive SHA-256 is `d63b12169bbf03f292d7024d3a60fedf7444a9f6e0fc78d71d1348acd283cf67`. Operations escrow, real-provider compatibility, every consumer-path switch, manual/timer/maintenance evidence, monitoring, rollback, isolated restore, independent review, R-004, and M16 remain open; production is unchanged.

- Added ADR-0090 and a fail-closed isolated whole-host Proxmox compatibility rehearsal contract. It binds the exact candidate/package/preflight/inventory evidence, released Starfiniti `v0.1.11`, reviewed Supabase `self-hosted/v0.8.0` compatibility/Compose/`linux/amd64` image identities, fifteen QEMU profiles, four LXC profiles, two storage profiles, nine services, two restricted critical clones, thirteen canonical stages, a fresh minimized approval-bound dependency simulation and same-projection inventory read no more than five minutes old, cleared driver environment, independently bounded timing/chronology, controller teardown, an approval-expiry-bound out-of-process auto-destroy lease, and immutable minimized output. Thirty-nine adversarial cases pass. Exact implementation `741a375d67725dab0191d4f06bbd2779638c57b4` passed CI `33232583190`, Security `33232583183`, and external CodeQL `99048027493` with all twelve checks green and PR #57 merge-clean. A controller pass can advance only `rehearsalExecuted`; compatibility, independent review, recovery, rollback, repository policy, approval, installation, reboot, production mutation, and post-change gates remain false. No real rehearsal or production change occurred.

- Added ADR-0089 and a route-free, read-only, privacy-minimized Proxmox whole-host consumer-inventory contract. It binds all 22 anonymous guests into 19 exact QEMU/LXC behavior profiles plus storage, management-service, aggregate network, HA, boot/KVM/IOMMU, and local-tool facts; rejects 56 deterministic corruptions; and publishes exclusively without raw facts or infrastructure identifiers. Exact implementation `e7825b6` produced the independently verified 9,236-byte artifact `proxmox-compatibility-inventory-e7825b6-2026-08-29T023345Z.json` (file SHA-256 `f6af50f506044e7578dcd02f800c1c71680e322460bf81cf4faa705b0ff5e25f`, internal report SHA-256 `495d7960a59359794fdb5024171c2e2de66cf69fc7b6701447ae285b46ee376f`). Only consumer inventory advances; compatibility, recovery, approval, install, reboot, mutation, and post-change gates stay false.

- Added ADR-0088 and a route-free, read-only production preflight for the Critical R-059 Proxmox repair candidate. The repository collector has no endpoint, credential, SSH, or network capability; requires exact committed bytes, root, and Python isolated safe-path mode; and runs only the twelve validator-bound exact versions through `apt-get --simulate --no-remove` in an empty network namespace. Sixty adversarial cases reject fact, action, state, hash, chronology, output, and false-authority drift. The exact committed 13,152-byte report has SHA-256 `b18037b19263020fabce46c2b6b13ec69b640775d2747dae474521191cba8a85` and proves eleven upgrades, one install, twelve configurations, zero removals/downgrades, four retained recovery packages, no relevant holds, explicit retention of the autoremovable running prior kernel, and byte-identical bounded dpkg/APT/repository state. Head `8f2934b` passed CI `33226696854`, Security `33226696825`, and external CodeQL `99031930348`; all twelve PR checks are green. Only dependency simulation and installed starting state advance. Compatibility, recovery, rollback, repository policy, approvals, execution, reboot, smoke, reconciliation, and R-059 remain open; production is unchanged.

- Added ADR-0087 and a bounded disposable Proxmox package-provenance canary for the Critical R-059 repair candidate. A digest-pinned Debian 13 container uses only five reviewed repositories, authenticated Debian bootstrap/keyring inputs, and the official Proxmox Trixie keyring pinned by SHA-256 and release fingerprint. Nine networked attempts failed closed on keyring shape/mode/tool checks, an external CodeQL report-path race, Apt URI/hash parser assumptions, and cross-mount atomic publication; none was relabelled as passing evidence. Head `45e9a12` then passed CI `33223681162`, Security `33223681183`, and external CodeQL `99023166148`. Job `99022913369` produced artifact `9706126317`, which independently verifies five fresh signed repositories, ten accepted signatures, each signed uncompressed package index, all twelve exact Apt URIs, separate official-URL copies, package fields, size, SHA-256, byte equality, 165,341,024 package bytes, unchanged dpkg status, zero installation/retained package bytes, no production credential/route/mutation, and teardown. The exact committed 9,606-byte report has file SHA-256 `3eec19512a6b2535cf0c6359144c1807b78e01015f43c470ad53335c6eb1090e`; package-byte, repository-signature, and fresh signed-metadata gates now pass. Dependency simulation, installed state, compatibility, rollback, recovery, repository policy, maintenance, install/reboot approval, execution, and reconciliation remain false or pending; production is unchanged and still vulnerable.

- Added ADR-0086 and a fail-closed Proxmox security-repair candidate after read-only review found the production host below fixed floors in five published advisories. The exact V1 plan binds five signed repository indexes, eleven upgrades, one signed-kernel install, zero removals, 165,341,024 package bytes, four retained recovery-boundary packages, five advisory sources/floors, immutable candidate provenance, and explicit false package-byte/signature, compatibility, recovery, rollback, maintenance, reboot, mutation, and reconciliation gates. The validator rejects metadata and false-authority drift; R-059 and top-ranked IMP-011 remain Critical and blocked on operations, security, owner, repository-policy, and recovery approval. Production is unchanged.

- Added ADR-0085 and a bounded recovery installed-state snapshot contract for M16. The repository helper has no SSH or production-discovery authority; it validates two opaque endpoint fact envelopes, canonical normalization, the exact six-provider/component catalogue, timestamps, public versions, executable hashes, historical committed official-source and full rsync-candidate provenance, clean commits, exclusive output, and false review/approval/mutation assertions through thirty-six deterministic cases. The first independently verified 8,813-byte real artifact binds clean implementation `c5678b6`, both endpoints, all six provider projections, the thirteen-source artifact, and the full rsync plan under SHA-256 `9960e01bea1a66856a2e0ed36493b28e183f5e316ce027fef3534ba5043448f7`; that implementation passed CI `33215968172`, Security `33215968421`, and external CodeQL with all twelve PR checks green. Five candidates plus review, impact, approval, and production mutation remain open.

## Unreleased

- Added ADR-0094 and a versioned shared recovery-artifact escrow contract. The accepted thirty-entry BorgBackup/OpenSSH V1 policy and evidence remain byte-for-byte hash-bound, while V2 adds thirty-four exact rsync and governance inputs covering candidate, dependency, rollback, canary-report, forced-command, controller, unit, sudoers, validator, verifier, canary, runbook, ADR, and current/historical policy or evidence. The shared verifier emits V2 manifests and minimized reports and fails closed on V1 drift, package/plan/report drift, repository/head drift, filesystem races, open catalogues, or completion overclaims. It performs no network, copy, artifact execution, installation, production access, or mutation. Exact implementation `b2cbba0` passed all twelve CI/Security/CodeQL checks. Private inventory, package/signature/dependency/consumer review, redundant offline custody, real rollout, isolated recovery, independent approval, R-004, IMP-010, and M16 remain open; production is unchanged.
- Added ADR-0084 and a bounded M16 official-source provenance collector. A clean exact commit can now stream-hash the thirteen canonical Supabase, PostgreSQL, WooCommerce, Stripe, Authentik, Klaviyo, Node.js, rsync, BorgBackup, OpenSSH, Debian, Ubuntu, and Proxmox sources without retaining provider bodies. Every initial and redirected hop rejects private/reserved, IPv4-mapped-private, or mixed DNS answers, pins one validated public socket while preserving TLS hostname verification, permits only closed query-free redirect hosts, and enforces exact TLS/header/time/type/encoding/byte bounds. Exclusive no-follow output in a pre-existing regular directory binds the exact plan and commit while keeping review, impact, installed evidence, and approval explicitly false; POSIX mode `0600` is enforced without overstating Windows ACL semantics. Twenty-six network-free adversarial cases pass, including enforcement of the Git byte-preservation rule. Corrected head `257e99c` passed all twelve CI/Security/CodeQL checks, and the first independently verified 13-source artifact has SHA-256 `5786186426b065493f5c01b5d76742322e2e8ed3fe92b8f80c30d787caa516be`; human impact, installed-evidence, and monthly-review gates remain open, and production is unchanged.
- Added ADR-0083 and a fail-closed reciprocal-source release boundary. The dashboard globally bypasses its unused optimizer for statically imported small assets and removes only the reviewed traced sharp/@img runtime family. A checksum-bound plan covers the exact product tree, seven Alpine packaging commits, every APKBUILD input, and seven pinned SPDX licence texts. Release CI validates the real image SBOM inventory, builds and independently streams/verifies a bounded deterministic source archive before registry authentication, then checksums, attests, and publishes all seven release files. The verifier uses no-follow descriptor-bound reads and same-byte hashing for release envelopes and staged inputs, and rejects unsafe paths, escaping symlinks, duplicate or excess entries, unexpected types or modes, expanded-byte drift, and any file/hash/envelope difference without filesystem extraction. The file-race correction passed exact-head CI, Security, and external CodeQL and independently rebuilt the full 13-component source bundle. R-056 remains open until a real tagged artifact and release-security owner review pass; production is unchanged.
- Added ADR-0082 and repaired two real Medium deployable-dashboard DAST findings rather than waiving them. Every document response now carries a fresh Next.js request nonce with a strict same-origin script policy; all responses deny framing and MIME sniffing and restrict referrers/browser capabilities, while API content receives a non-executable sandbox policy. Exact candidate CI `33204477508` and Security `33204478017` pass; the fresh ZAP report has zero Critical/High/Medium/Low alerts. The current digest-bound Medium register reconciles 29 reciprocal-licence occurrences to 15 dispositions with zero false positives and blocks tagged image distribution under R-056 until exact source/notice evidence closes 14 third-party obligations across 12 packages. Production remains unchanged.
- Added ADR-0081 and an executable self-hosted Supabase compatibility lock over exact upstream provenance, two approved Compose variants, fifteen mounted assets, eleven `linux/amd64` image IDs, critical gateway/Auth/Data API/database behavior, and cumulative RLS coverage. Deployment files use bounded descriptor-first no-follow reads with before/after metadata checks. An additive migration enables RLS on three previously uncovered private coordination tables while preserving reviewed owner-function access and zero direct-role policies. Read-only production evidence records one pending stale Studio schema environment plus future upgrade and clean-room recovery gates; production was not changed.
- Added ADR-0080 and a strict V2 whole-product score so deployed production and the exact integration candidate can be measured without conflation. The byte-preserved V1 production evaluation is fixed to its known SHA-256 and release identity; fixed weights, category floors, automatic-failure definitions, commit ancestry, bounded no-link evidence reads, completion-subject identity, scorecard marker, and task-graph authority are machine-validated with fifteen adversarial corruptions. Production remains the only completion subject at 54/100; the unmerged candidate is the development-prioritization subject at 83/100. Activation remains below its floor and required live evidence remains absent. The CI baseline now checks out full history so ancestor proof is executed rather than weakened for a depth-one clone. This changes no runtime, deployment, tenant, checkout, billing, or loyalty value.

- Added ADR-0079 and corrected the complete public release bridge: the unshipped V2-V5 application fallbacks are removed, V6 falls directly to released English V1 only when V6 is genuinely absent, malformed/provider responses fail closed, and the reader performs at most two RPCs. V6 now carries the exact immutable published programme currency, so earning rates and VIP spend/rates render EUR, USD, zero-decimal JPY, and other supported precisions without guessing; legacy V1 uses currency-neutral copy. Expanded reward rows now retain editor-only identity through edits/removal without polluting the strict payload. M09 uses the shared canary envelope and all eleven M04-M14 validators share one no-follow digest-bound JSON artifact reader; every focused suite and module validator passes. Production, loyalty value, WooCommerce, checkout, and feature flags are unchanged.
- Amended ADR-0071 so one installed `starfiniti-loyalty-postgres-borg-controller` owns explicit archive and maintain subcommands, one root-equivalent configuration load, and shared numeric-state/atomic-repository-metric primitives. The systemd units select exact subcommands; the two former standalone programs remain unchanged rollback artifacts. Static validation covers the single active privileged boundary, and the Linux mock suite executes both modes, invalid-mode/config/repository/lock/transfer/retention/timeout failures, and exact archive/maintenance success. Production scripts, timers, repositories, archives, and credentials are unchanged.
- Added ADR-0077 and a strict additive V6 anonymous loyalty projection so the hosted Referrals area renders the exact published friend and advocate points, minimum first-order spend/currency, attribution and cooling windows, new-customer scope, monthly-limit signal, and database-authoritative availability state. Customer links, identities, orders, history, fraud evidence, exact abuse caps, internal IDs, raw configuration, and value authority remain private; V5/V4/V3/V2/V1 are missing-function-only fallbacks and malformed V6 fails closed. The responsive give-and-get flow passed production-rendered reduced-motion review at desktop/mobile widths with same-origin account routing, 44-pixel actions, zero overflow, and zero browser diagnostics. Exact implementation head `3812e67` passed CI `33169816691` and Security `33169816719`, including clean 85-migration replay, 68 pgTAP files with 3,753 assertions, all 22 concurrency probes, both images, and every WooCommerce runtime cell. Production and the M09 canary score remain unchanged.
- Added ADR-0076 and a strict additive V5 anonymous loyalty projection so the hosted Rewards area renders supported published fixed/percentage discounts, free shipping, free products, exclusive access, and custom perks with exact bigint-safe cost/benefit evidence, schedules, summarized public conditions, and native/manual delivery. Raw reward configuration, selectors, instructions, exact limits/budgets, internal codes/IDs, segment/customer state, stored value, and value authority remain private; V4/V3/V2/V1 are missing-function-only fallbacks and malformed V5 fails closed. The responsive Lucide catalogue passed focused reduced-motion desktop/mobile review with zero overflow or diagnostics. Exact implementation head `294c62a` passed all 11 required checks, including 84 migrations and 3,740 pgTAP assertions. Production and the M09 canary score remain unchanged.
- Added ADR-0075 and a strict additive V4 anonymous loyalty projection so the hosted “Ways to earn” area renders actual published purchase, account, birthday, verified-review, and referral methods with derived public codes/labels, exact bigint-safe effects, schedule state, and conservative restrictions guidance. Merchant-authored identifiers/copy, custom activities, selectors, caps, customer state, internal IDs, and value authority remain private; V3/V2/V1 are missing-function-only fallbacks and malformed V4 fails closed. The responsive Lucide catalogue passed focused desktop/mobile reduced-motion browser review with zero overflow or diagnostics. Exact implementation head `d91a2d7` passed all 11 required checks, including 83 migrations and 3,725 pgTAP assertions. Production and the M09 canary score remain unchanged.
- Added ADR-0074 and a strict additive V3 anonymous loyalty projection so the hosted guest VIP experience represents advanced lifetime/rolling/calendar qualification, `all`/`any` entry thresholds, exact bigint-safe metrics, grace, earning rates, and safe benefit flags instead of flattening every tier into legacy spend. V2/V1 remain missing-function-only rolling-deploy fallbacks, malformed V3 fails closed, private selectors/value state remain absent, and the responsive editorial progression rail has retained desktop/mobile browser evidence. Exact implementation head `7a68ffa` passed all 12 PR checks, including 82-migration replay and 3,712 pgTAP assertions. Production and the M09 canary score remain unchanged.
- Bound the complete pre-change rsync rollback set to ADR-0073: exact Debian Security host rsync, Debian host `libacl1`, and Ubuntu Security guest rsync versions, archive URLs, signed-metadata authorities, package metadata, and SHA-256 digests. The disposable build resolves each version through signed base-distribution metadata, requires the exact URL bytes to match, installs none, retains only minimized facts, and deletes the packages before candidate acquisition; validators adversarially reject source/hash/metadata/order/removal/report drift. Exact implementation head `ed5eb7f` passed the rollback-aware Linux canary, and artifact `9678028203` binds all three minimized proofs plus zero retained package bytes. Operations-controlled offline escrow and every production gate remain pending; production is unchanged.
- Added ADR-0073's exact vendor-package recovery-transport canary. Digest-pinned Debian 13 and Ubuntu 24.04 containers acquire exact rsync 3.5 packages through scoped signed Debian and rsync-project Launchpad repositories, verify authority/fingerprint/checksum/package metadata/canonical executables/protocol/wrapper confinement, reject an unsafe restricted command, and transfer only two synthetic files over a unique internal Docker network. Exact candidate `13e55ad` passed the Linux job, and the manifest binds its minimized artifact/report hashes after zero-residue teardown. Production remains on the prior packages and no installation is authorized until rollback escrow, host-consumer compatibility, real forced-command/manual/timer archive evidence, and isolated recovery pass.
- Extended M16's mandatory monthly source set from seven application providers to thirteen provider, platform, and recovery-dependency sources after the backup-transport incident exposed an ungoverned drift path. The exact catalogue now includes official rsync, BorgBackup, OpenSSH, Debian, Ubuntu, and Proxmox security feeds; the validator rejects a missing, stale, or substituted recovery source, missing required host/guest endpoint, or absent/zero installed and candidate provenance digest; and the unresolved dual-endpoint rsync 3.5 rollout is the top recomputed improvement-backlog item at 80. This records no elapsed monthly review and changes no production package, service, schedule, backup, checkout path, or loyalty value.
- Added ADR-0072's fail-closed rsync 3.5 backup-transport baseline after read-only inspection found the Debian host on 3.4.1 and the Ubuntu database VM on 3.2.7 while upstream's security release closes directly applicable restricted-wrapper and malicious-peer flaws. The candidate validates canonical trusted non-writable executables and their parent chains, rejects missing/malformed/pre-3.5 runtimes before staging or Borg, requires the guest `rrsync` confinement integration, and clears its inherited environment. It deliberately performs no package installation: ADR-0073 now proves exact candidate provenance and disposable compatibility, while production rollout still requires rollback escrow, host compatibility, real archive evidence, and isolated recovery.
- Isolated the PostgreSQL off-site archive from whole-VM Borg serialization. The candidate requires a distinct externally provisioned and actual-ID-verified repository, local lock, cache/security state, stages incremental files before locking, bounds both local and remote waits, and exits 75 without a Borg write on contention. Both privileged jobs now require a canonical path inside a service-owned non-writable parent with only service/root-owned safe ancestors, open the configuration once, and source only the validated descriptor after rejecting relative, symlink, non-regular, differently owned, executable, or group/other-accessible shell input. The archive controller captures exactly one locale-stable pure-digit rsync statistics pair, publishes received-byte and changed-to-wire amplification gauges atomically, and stops before repository access when both the strict four-times and one-GiB boundaries are crossed. Dedicated daily maintenance requires a fresh archive, caps each Borg operation at 15 seconds and the expanded unit at 105 seconds, checks a bounded repository slice, keeps every archive within 48 hours before 35 daily and 12 monthly tiers, proves the canonical post-prune interval is at most 300 seconds, and only then compacts. Archive, transfer, actual-isolation, maintenance, retained-count, and maximum-interval gauges publish atomically for node-exporter without identifiers or contents; absent/stale/zero/failed/over-bound states map to exact protected alerts and dashboards. Static and Linux fixtures also prove unavailable telemetry cannot suppress archive creation while leaving the unit non-passing. ADR-0071, the recovery/runbook/task/risk evidence, and the preserved ADR-0070 history record why per-guest yielding is insufficient; production remains unchanged.
- Unified the M04–M14 canary-envelope boundary under one exact schema catalogue and wired every previously shape-light module validator into it. The root gate now rejects unreviewed root, production, candidate, public-baseline, score, category, check, artifact, and automatic-failure fields; unregistered schemas; future timestamps; oversized evidence text; cycles; and invalid task graphs through 154 deterministic cross-module fixtures. Existing scores and production-pending controls remain unchanged.
- Closed M09's remaining top-level evidence-schema bypass: the storefront canary validator now requires exact manifest, production, candidate, public-baseline, score, check, artifact, and automatic-failure shapes; rejects future-dated manifests, cyclic structures, oversized evidence text, and invalid task graphs; and exercises each boundary with deterministic adversarial fixtures. The score remains honestly 88/100 because production operability evidence is still pending.
- Refreshed M01's minimized read-only production baseline to v0.1.11: public and container health pass, all commerce/value aggregates remain zero, PostgreSQL backup services succeed, and one successful nightly Borg inventory contains both production VMs. Its hardened exact validator now rejects contradictory, sensitive, stale-shaped, or false-complete evidence through eleven adversarial fixtures. Full-service restoration and every real-store value/outage/reconciliation gate remain explicitly pending.
- Made tenant-federation administration credentials optional only as a complete disabled set: workforce SSO remains independent, empty paths use established fail-closed read-only `/dev/null` binds, partial configuration fails preflight, and complete configuration retains strict file, ownership, schema, origin, selector, and secret validation. The candidate Compose validates with the production VM's Docker Compose version without starting a container; production remains unchanged.
- Closed M04's digest-valid-but-empty reward evidence bypass with exact semantic schemas for all nine production artifacts, approved rollout/value/availability/stacking/fulfilment/ambiguity policies and numeric ceilings, exact release/plugin/contract binding, native/manual/restriction/capacity/recovery/outage evidence and count reconciliation, zero-difference ledger/value/privacy/queue assertions, cross-artifact final approval, canonical chronology, rollback after canary end, and a minimum 24-hour observation. Positive and adversarial fixtures reject hollow, nonzero, count-mismatched, stale, short, relabelled, or differently approved evidence.
- Closed M05's digest-valid-but-empty VIP evidence bypass with exact semantic schemas for all nine production artifacts, approved qualification/lifecycle/benefit/override/expiry/reminder policies and numeric ceilings, exact release/plugin/contract binding, 36-case shadow parity plus qualification/movement/benefit/expiry/progression evidence and count reconciliation, zero-difference history/value/privacy/notification assertions, cross-artifact final approval, canonical chronology, rollback after canary end, and a minimum 24-hour observation. Positive and adversarial fixtures reject hollow, nonzero, mismatched, stale, short, relabelled, or differently approved evidence.
- Closed M06's digest-valid-but-empty referral evidence bypass with exact semantic schemas for all nine production artifacts, approved attribution/cooling/fraud/value/retention policies and numeric ceilings, exact release/plugin/contract binding, referral behavior/value/review/recovery evidence and count reconciliation, zero-difference ledger/privacy/queue assertions, cross-artifact final approval, canonical chronology, rollback after canary end, and a minimum 24-hour observation. Positive and adversarial fixtures reject hollow, nonzero, mismatched, stale, short, relabelled, or differently approved evidence.
- Closed M07's digest-valid-but-empty campaign evidence bypass with exact semantic schemas for all nine production artifacts, approved audience/value/control/schedule policies and numeric ceilings, exact release/plugin/contract binding, all behavior/concurrency/refund/native-reward evidence and count reconciliation, zero-difference value/privacy/queue assertions, cross-artifact final approval, canonical chronology, rollback after canary end, and a minimum 24-hour observation. Positive and adversarial fixtures reject hollow, nonzero, mismatched, stale, short, relabelled, or differently approved evidence.
- Closed M08's digest-valid-but-empty notification evidence bypass with exact semantic schemas for all nine production artifacts, approved policy and numeric provider ceilings, exact release/contract/adapter binding, SMTP/Klaviyo/webhook/consent/suppression evidence and count reconciliation, zero-difference value/privacy/queue assertions, cross-artifact final approval, canonical chronology, rollback after canary end, and a minimum 24-hour observation. Positive and adversarial fixtures reject hollow, nonzero, mismatched, stale, short, relabelled, or differently approved evidence.
- Closed M09's digest-valid-but-empty storefront evidence bypass with exact semantic schemas for all nine production artifacts, approved rollout and numeric asset budgets, exact release/plugin/contract binding, hosted and WooCommerce surface/outage/coupon reconciliation, English/privacy/accessibility states, zero-difference value and queue assertions, cross-artifact final approval, canonical chronology, rollback after canary end, and a minimum 24-hour observation. Positive and adversarial fixtures reject hollow, non-English, nonzero, count-mismatched, stale, short, or differently approved evidence.
- Closed M10's digest-valid-but-empty analytics evidence bypass with exact semantic schemas for all nine production artifacts, approved pilot/policy/export/observation binding, exact shared-snapshot/report/export/schedule reconciliation, explicit liability and causal states, zero-difference value/privacy assertions, distinct release/recovery/baseline digests, cross-artifact final approval, canonical chronology, rollback after canary end, and a minimum 24-hour observation. Positive and adversarial fixtures reject hollow, nonzero, causal-overclaim, snapshot/count-mismatched, stale, short, or differently approved evidence.
- Closed M11's digest-valid-but-empty ecosystem evidence bypass with exact semantic schemas for all nine production artifacts, approved pilot/rate/value binding, exact topology/identity/currency/API/webhook count reconciliation, zero-difference assertions, distinct release/recovery/baseline digests, cross-artifact final approval, canonical UTC chronology, rollback after canary end, and a minimum 24-hour observation. Positive and adversarial fixtures reject hollow, nonzero, count-mismatched, stale, short, or differently approved evidence.
- Closed M12's digest-valid-but-empty evidence bypass with exact semantic schemas for all nine production artifacts, bounded applied-record reconciliation, zero-difference customer/balance/lot/expiry/liability assertions, distinct release/recovery/baseline digests, cross-artifact approval binding, canonical UTC chronology, rollback after canary end, and a minimum 24-hour observation. Positive and adversarial fixtures reject hollow, count-mismatched, nonzero, stale, short, or differently approved migration evidence.
- Closed M13's digest-valid-but-empty evidence bypass with exact semantic schemas for all nine production artifacts, unique check-level source digests, zero-difference assertions, distinct release/recovery inputs, cross-artifact approval binding, canonical UTC validation, enforced release-to-canary chronology, and a minimum 24-hour observation. Positive and adversarial fixtures now prove both attainable completion and rejection of hollow, nonzero, stale, short, or differently approved enterprise-identity evidence.
- Closed M14's digest-valid-but-empty evidence bypass with exact semantic schemas for all nine production artifacts, unique check-level source digests, zero-difference assertions, distinct release/recovery inputs, cross-artifact approval binding, canonical UTC validation, enforced release-to-canary chronology, and a minimum 24-hour observation. Positive and adversarial fixtures now prove both attainable completion and rejection of hollow, nonzero, stale, short, or differently approved evidence.
- Hardened M14's managed-billing closeout from a mutable 48-check gate to a 49-check, five-approval, nine-artifact boundary with safe bounded reads, exact candidate/check/path/SHA-256 binding, sensitive provider-evidence rejection, sixteen fixed automatic failures, explicit non-canary isolation, prerequisite/task/score synchronization, and positive/adversarial fixtures. Thirteen repository/read-only controls pass; 36 approved production controls remain pending and operability blocks completion.
- Hardened M13's enterprise-identity closeout from a mutable 50-check gate to a 51-check, four-approval, nine-artifact boundary with safe bounded reads, candidate/path/SHA-256 binding, exact artifact coverage, sensitive-key/value rejection, fixed claim/tenancy/egress/SCIM/agency/support/recovery/deletion failures, explicit non-canary isolation, prerequisite/task synchronization, and positive/adversarial fixtures. Twelve repository/read-only controls pass; 39 approved production controls remain pending and operability blocks completion.
- Hardened M12's migration closeout from a mutable 34-check gate to a 36-check, four-approval, nine-artifact boundary with safe bounded reads, candidate/path/SHA-256 binding, exact artifact coverage, sensitive-key/value rejection, fixed source/identity/ledger/rollout/rollback failures, explicit non-canary isolation, completed-slice/task synchronization, and positive/adversarial fixtures. Eleven repository/read-only controls pass; 25 approved production controls remain pending and operability blocks completion.
- Hardened M11's ecosystem closeout from a mutable 41-check gate to a 44-check, four-approval, nine-artifact boundary with safe bounded reads, candidate/path/SHA-256 binding, exact artifact coverage, sensitive-evidence rejection, fixed topology/identity/currency/API/webhook/client/value failures, explicit non-canary isolation, completed-slice/task synchronization, and positive/adversarial fixtures. Eleven repository/read-only controls pass; 33 approved production controls remain pending and operability blocks completion.
- Hardened M10's analytics closeout from a mutable 29-check gate to a 32-check, four-approval, nine-artifact boundary with safe bounded reads, candidate/path/SHA-256 binding, exact artifact coverage, sensitive-evidence rejection, fixed causal/precision/privacy/capability/rollout failures, completed-slice and task synchronization, and positive/adversarial fixtures. Eleven repository/read-only controls pass; 21 approved production controls remain pending and operability blocks completion.
- Hardened M09's storefront closeout from a prose-only 30-check gate to a 34-check, four-approval, nine-artifact fail-closed boundary with safe bounded reads, candidate/path/SHA-256 binding, exact artifact coverage, sensitive-evidence rejection, fixed automatic failures, non-canary isolation, final reconciliation, prerequisite/task synchronization, and positive/adversarial completion fixtures. Eight repository/read-only controls pass; 26 approved production controls remain pending, the honest score remains 88, and operability blocks completion.
- Added M08's 53-check fail-closed notification canary gate with four approval flags, seven exact score categories, nine path- and SHA-256-bound production artifacts, safe bounded artifact reads, sensitive-evidence rejection, consent/suppression, SMTP, Klaviyo, signed webhooks, immutable templates, provider outages, value/checkout continuity, reconciliation, rollback, observation, and deterministic false-completion self-tests. Fifteen repository/read-only controls pass; 38 approved production controls remain pending and operability blocks completion.
- Added M07's 51-check fail-closed campaign canary gate with four approval flags, seven exact score categories, nine path- and SHA-256-bound production artifacts, safe bounded artifact reads, sensitive-evidence rejection, audiences, schedules, controls, seven behaviors, budgets, native rewards, cumulative refunds, lifecycle, selector compatibility, retries, reconciliation, rollback, observation, and deterministic false-completion self-tests. Fourteen repository/read-only controls pass; 37 approved production controls remain pending and operability blocks completion.
- Added M06's 48-check fail-closed referral canary gate with four approval flags, seven exact score categories, nine named path- and SHA-256-bound production artifacts, safe bounded artifact reads, sensitive-evidence rejection, first attribution, cooling, give-get ledger value, refund compensation, fraud review, recovery, customer/merchant experience, reconciliation, rollback, observation, and deterministic false-completion self-tests. Fourteen repository/read-only controls pass; 34 approved production controls remain pending and operability blocks completion.
- Added M05's 48-check fail-closed advanced VIP canary gate with four approval flags, seven exact score categories, nine named path- and SHA-256-bound production artifacts, safe bounded artifact reads, sensitive-evidence rejection, historical V1/V2 parity, event-time qualification, lifecycle, benefits, overrides, expiry, progression, reconciliation, rollback, observation, and deterministic false-completion self-tests. Thirteen repository/read-only controls pass; 35 approved production controls remain pending and operability blocks completion.
- Added M04's 48-check fail-closed reward canary gate with four approval flags, seven exact score categories, nine named path- and SHA-256-bound production artifacts, safe bounded artifact reads, sensitive-evidence rejection, prerequisite/task synchronization, public and operator baselines, all native/manual reward outcomes, checkout outages, tenant denial, reconciliation, rollback, observation, and deterministic false-completion self-tests. Thirteen repository/read-only controls pass; 35 approved production controls remain pending and operability blocks completion.
- Completed M04 reward-workflow browser/accessibility review against the real optimized-build components at desktop, mobile, and 320 px: invalid V2 drafts no longer disappear into the legacy presentation, exact contract errors mark and focus their field, Save remains available for submit-time guidance, M04 text is readable, and relevant mobile targets measure at least 44 px. The manual queue's pending, in-progress/overdue, fulfilled, and rejected recovery states passed without action submission or production mutation.
- Hardened the full M04–M16 integration after independent complexity, security, billing, idiom, and cruft review: exact PKCE flow correlation now fails closed through one hostname-independent server storage namespace; post-provider PostgreSQL holds suppress Stripe Checkout/Portal redirects; the usage worker accepts restricted Stripe keys only; migration limits have one executable source; bounded descriptor-first reads remove five file races; and fixed-length webhook hints remove a polynomial expression. Security-remediated candidate `82f644c` passed all local gates and all eleven PR #57 checks with zero open Critical/High CodeQL alerts; two false positives retain audited dispositions. Production and all live canary gates remain unchanged.
- Reconciled the stacked enterprise delivery chain from `main` through M16: preserved the incremental-backup incident and unique risk IDs across M04–M07, repaired the constraint-valid M13 federation test fixture, and verified exact-head CI on PRs #29–#32 and #42 so every open roadmap PR through #56 is merge-clean without claiming deployment or canary completion.
- Added the M16 continuous-improvement operating system: UTC monthly and quarterly cadence; fourteen review sections; thirteen official provider, platform, and recovery-dependency sources; exact evidence-ranked backlog arithmetic; second-occurrence durable regression controls; material-change module rescoring; fail-closed experiment promotion; five quarterly recovery/tenancy/privacy/SCIM/incident exercises; append-only ADR supersession; five distinct closeout artifacts; and a 39-check positive-and-adversarial validator. Seven repository/CI controls pass; elapsed reviews, exercises, owners, reconciliation, and approval remain pending.
- Added the M15 GA closeout foundation: a canonical one-pilot, 720-hour/thirty-interval immutable-release canary plan; thirteen default-private evidence-bound claims and three explicit product limitations; daily and final zero-difference contracts; exact prerequisite, release, score-floor, rollback, incident, M16-handoff, and six-role approval gates; five distinct minimized artifacts; and a 50-check false-completion validator with positive and adversarial fixtures. No release, deployment, tenant enablement, production mutation, public claim, approval, checkout path, or loyalty value changed.
- Added the M15 operations and incident foundation: a canonical 24-signal/23-alert bounded-label catalogue with an absent-or-incomplete required-series page; exact Prometheus projection; billing-independent route policy; locked Grafana provisioning; seventeen safe runbooks including dual-threshold backup-transfer amplification; monotonic SEV0–SEV2 incident states; minimized postmortems; and a 34-check digest-bound false-completion gate for production sources, paging, acknowledgement/escalation, two independent exercises, checkout independence, exact reconciliation, and owner approval. Read-only inspection found current VM 971 egress quiet and no active monitoring stack; no service, receiver, credential, page, production configuration, checkout path, or loyalty value changed.
- Added the M15 clean-room recovery foundation: a fourteen-stage digest-bound controller for isolated provisioning, physical PostgreSQL/WAL recovery, database integrity, Supabase Auth, Authentik, application/configuration, signing references, privacy replay, connector/value proof, reconciliation, and always-run teardown; private copies of approved driver/control/inventory bytes; controller-measured stage and full-service timing; independent primary/repeat inventory binding; fresh source-marker RPO; minimized reports; and a 32-check false-claim gate. No recovery drill, production route, backup, credential, identity, or runtime was used.
- Added the M15 security/supply-chain foundation: immutable CodeQL, Trivy, Syft, ZAP, upload, and provenance inputs; exact production-image vulnerability/secret/misconfiguration/licence scans; an explicit no-ignore AGPL-compatible licence policy; secret-free full-severity review reports; patched minimal runtime images without npm/Corepack/Yarn; an exact three-package worker runtime boundary with built-image import proof; bounded image-level health checks; two CycloneDX SBOMs; an internal no-port/no-egress disposable DAST target; tagged-release file and registry-image attestations; and a 25-check fail-closed closeout manifest. Production was not scanned or mutated, and exact-head Linux evidence resolved R-032.
- Upgraded the development-only WordPress runtime from `@wordpress/env` 11.8.0 to 11.14.0, replacing vulnerable `extract-zip` with patched `adm-zip` 0.6.0 and reducing the complete npm audit from two High findings to zero; exact Linux WooCommerce runtime verification remains the R-032 closure gate.
- Added the M15 fault-injection foundation: a disposable-host-only six-scenario controller for worker/database death, network latency, duplicate delivery, provider outage, and bounded retry bursts with exact approval/digest binding, Compose-label and loopback guards, deterministic restoration, native-checkout recovery probes, minimized reports, and a 27-check independent reconciliation gate. No production fault was run.
- Added the M15 capacity-evidence foundation: a four-scenario fixed-arrival runner with clean-commit and approval binding, owner-file credentials, known-production mutation denial, signed WooCommerce and Service API contracts, bounded samples/concurrency/timeouts/responses, driver saturation evidence, minimized aggregate reports, independent-driver confirmation, exact environment/value reconciliation contracts, and a 22-check false-claim gate. No supported capacity is claimed and no production load was run.
- Added M14's 48-check fail-closed managed-billing canary gate with exact release/task evidence, five approvals, seven-category scoring and floors, sensitive Stripe-evidence rejection, deterministic corruption self-tests, self-hosted no-call proof, sandbox/test-clock lifecycle, usage/invoice reconciliation, protected-path, outage, rollback, and observation requirements.
- Completed M14's managed commercial-policy experience with exact restriction reasons, role/state-aware recovery, protected operational-continuity routes, manual-contract/provider-control separation, honest unconfigured states, responsive accessible action sizing, and production-rendered keyboard/contrast verification. Production and global self-hosted behavior remain unchanged.
- Added M14 immutable managed usage metering for orders, ledger-active members, delivered messages, and accepted Service API commands with exact UTC source facts, append-only compensation, permanent provider identifiers, database-authorized leases, a separate restricted-key Stripe sink, tenant-scoped queue health, and zero self-hosted, checkout, or loyalty-value dependency.
- Added M14 database-reserved managed Checkout and Portal sessions with strict public selectors, private effective Price versions, serialized customer provisioning, database reauthorization before provider access, regular-file secret/restricted keys, a fixed/version-pinned/bounded Stripe REST boundary, webhook-only lifecycle authority, recoverable holds, and owner-only Hub plan/payment controls. Production and self-hosted behavior remain unchanged.
- Added M14's disabled managed-only Stripe webhook boundary: a database-first self-hosted bypass, bounded exact-byte HMAC verification, strict private digest-only event receipts, exact replay/conflict fencing, invoice-observation semantics, database-owned leases, and an isolated no-provider billing worker with entitlement rechecks and zero loyalty-value authority.
- Added M14's managed-billing authority foundation: strict minimized commercial-state contracts, private append-only provider references and normalized lifecycle evidence, event-time plus provider-customer/provider-event replay fences, self-hosted no-provider construction, six permanent loyalty safeguards, a responsive Billing & plan route, 61 focused database assertions, and a two-session concurrency probe. Stripe integration remains disabled and absent from self-hosted runtime behavior.
- Added the 50-check fail-closed M13 enterprise identity canary validator with exact release/commit and public-baseline checks, sensitive-key and obvious raw-value rejection, deterministic corruption self-tests, seven weighted score categories, mandatory category floors, and explicit production approval gates.
- Added M13 bilateral agency portfolios, separately approved short read-only support with tenant-visible use history, signed-AAL2/live-session owner recovery, bounded administration export, comprehensive credential offboarding, and seven-day cooled organization pseudonymization while preserving immutable value/audit evidence. Terminal offboarding also scrubs live webhook destination, origin, and signing fingerprints.
- Added disabled-first per-organization OIDC/SAML federation through Authentik with `openid`-only explicit Supabase identity linking, database-authoritative membership and entitlements, public socket-pinned metadata validation, digest-only immutable lifecycle evidence, one active source, ambiguity/compensation and interrupted-operation recovery, minimized login discovery, owner-only mounted administration credentials, and a Hub-style tenant identity workflow. Production egress and enterprise-IdP canaries remain mandatory.
- Added M13 organization/team lifecycle with owner creation, digest-only one-use invitations, serialized owner quorum, immediate membership revocation, exact tenant state transitions, offboarding, minimized export, and a Hub-style administration workflow.
- Added M13's database-authoritative Access V1 catalogue with six tenant membership roles, structurally grant-only support, active-organization permission enforcement, a minimized live access projection, forged-claim/revocation/cross-tenant pgTAP coverage, and a responsive Hub-style English Team & access review.
- Added the M12 canonical migration and value-free dry-run foundation with strict source/identity/balance/lot/tier/referral/history contracts, explicit non-email identity resolution, deterministic exact-total fingerprints, immutable minimized PostgreSQL receipts, content/idempotency replay fences, and zero ledger effects.
- Completed M12 receipt-bound opening-balance application with exact canonical revalidation, deterministic cross-receipt source-row serialization, immutable ledger/lot attribution, exact once-only pending release, projection reconciliation, and append-only correction evidence; production value remains disabled.
- Added strict versioned Generic CSV, WPLoyalty CSV, and WooRewards JSON migration adapters with bounded transient parsing, exact source/canonical digests, official synthetic fixtures, fail-closed format/encoding/formula checks, privacy-safe bounded error export, and no database or value capability; YITH remains unavailable pending a reviewed redacted export.
- Added the versioned migration adapter support registry and public execution choke point with exact source/ID/version selection, reference-fixture drift evidence, typed privacy-safe refusals, and a proven no-hash/no-parse YITH gate.
- Added the M12 migration centre with request-local source inspection, explicit no-email customer mapping, authoritative minimized dry-run receipts, exact file/mapping re-presentation before opening-balance application, entitlement-independent compensating corrections, and tenant-scoped bigint-safe reconciliation history; migration writes remain disabled pending pilot canary.
- Repaired migration form target sizes after production-build desktop/mobile browser review and added a 34-check fail-closed M12 canary validator with sensitive-evidence rejection, exact score/category floors, and mandatory release, source, value, reconciliation, rollback, and observation gates.
- Added the M11 ecosystem closeout manifest and validator with 41 exact repository/production checks, deterministic seven-category scoring, an 80% category floor, sensitive-evidence rejection, and false-completion self-tests.
- Normalized outbound-webhook secret hints to the database-safe Base64URL alphabet while retaining the canonical Base64 `whsec_` secret wire format.
- Added endpoint-scoped outbound-webhook lifecycle operations with one-time 256-bit signing keys, digest-only storage, immutable revisions, disabled-only bounded rotation, disable-before-authorization, retirement scrubbing, and minimized merchant health.
- Added supported dependency-light TypeScript and PHP 8.1 clients for strict Service API requests and exact raw-body Standard Webhooks verification with shared executable replay vectors.
- Added M11 scoped Service APIs with digest-only one-time credentials, least-privilege customer/activity scopes, bounded rotation and immediate revocation, database-derived authority and fixed-minute quotas, opaque customer namespaces, canonical event/ledger reuse, and responsive owner/admin operations.
- Repaired service-account confirmation contrast, action target sizes, and checkbox-label alignment after desktop/mobile dark-mode browser review.
- Added M11 exact multi-currency evidence with immutable occurrence-time provider snapshots, rational conversion and PostgreSQL recomputation, original-snapshot refunds, source-currency rule visibility, exact retries, and an English policy/revision Operations control.
- Added M11 verified cross-workspace customer linking with independent signed-store proofs, immutable source/canonical revisions, value-conflict rejection, protected reversible projections, Auth-derived unlink, and a responsive connected-stores customer experience.
- Added M11's explicit multi-store wallet-scope foundation with immutable programme-group sharing revisions, exact isolated/shared workspace allowlists, Auth-derived owner/admin entitlement authority, optimistic idempotent commands, projection-drift detection, connector-removal protection, and a responsive review-before-save Operations control.
- Completed the M10 analytics command-center slice with one explicit cross-report snapshot instant, fail-closed divergence/future checks, current/stale integrity states, section navigation, honest loading/empty/partial-error states, and keyboard-focusable responsive cohort tables.
- Added the fail-closed M10 analytics closeout manifest and validator with 29 repository/production checks, exact seven-category scoring, an 80% category floor, sensitive-evidence rejection, false-completion self-test, and a read-only legacy Overview compatibility shadow.

- Added the versioned M10 analytics dictionary and immutable value-truth report with exact issued, released, pending, available, reserved, spent, expired, reversed, manual, outstanding, and expiry-window point evidence; projection reconciliation; explicit unavailable monetary liability; and a responsive formula-backed merchant experience.
- Added mature-cohort activation, participation, refund-compensated V1/V2 eligible commerce, repeat purchase, AOV, observed LTV, source coverage, guest activity, and missing-link reporting with exact currency scope, bigint-safe contracts, independently degradable dashboard reads, and no inferred prediction or incrementality.
- Added immutable reward realization, event-time VIP movement, privacy-minimized referral issuance and compensation, and deduplicated refund-compensated campaign influence reporting with exact reversal evidence and an explicit unavailable causal-lift state.
- Added mature IANA-local daily activation cohorts, exact 31–60-day earning retention, and evidence-gated campaign intention-to-treat eligible-spend lift with immutable assignment populations, zero outcomes, exact rational evidence, sample floors, and explicit unavailable/significance boundaries.
- Added controlled aggregate analytics exports and daily/weekly/monthly IANA-local schedules with Dictionary V4 plus all four strict reports, private 24-hour payloads, five-minute subject/session-bound one-use downloads, exact digest evidence, bounded retries, concurrency fences, and an isolated reporting-worker profile that cannot delay loyalty value or checkout.

- Added the strict M09 customer experience boundary: one Auth-derived snapshot for balances, earning, rewards, reservations, expiry, VIP, referrals, and activity; enhancement-only entitlement behavior; minimized public summaries; and fail-closed server parsing without browser-supplied scope.
- Added the feature-flagged Hub-style hosted loyalty experience with overview, earning, rewards, VIP, referrals, immutable history, and account areas; exact affordability and progress guidance; a bounded guest journey; responsive evidence; and one same-origin English account path without a language switcher.
- Added signed demand-driven WooCommerce customer snapshots with database-derived exact balances, tier, expiry, earning and reward summaries; strict monotonic non-autoloaded local storage; privacy lifecycle support; and My Account, product, cart, classic checkout, and post-purchase placements with zero connector assets or render-time Hub calls.
- Added staged WooCommerce Cart and Checkout Blocks support with a namespaced local-only Store API projection, separate data/panel flags defaulted off, an official SlotFill integration, strict fresh/stale privacy behavior, a no-script account path, compressed asset budgets, and zero panel-initiated Hub requests.
- Added a strict English-only V2 customer presentation with audited brand tokens, reviewed Lucide hero assets, density and optional-section controls, exact semantic section ordering, member/public/WooCommerce preview states, real member/public delivery, bounded provider-failure recovery, and RPC-absence-only V1 rollout compatibility.
- Added a machine-validated M09 production-canary gate with 30 minimized checks, deterministic seven-category scoring, per-category floors, approved-release and operator-access requirements, and fail-closed completion while any rollout, outage, reconciliation, rollback, or observation evidence is absent.
- Replaced the production PostgreSQL tar-over-stdin Borg pull, which retransmitted the complete 22 GB recovery tree every cycle, with a forced read-only, zstd-compressed incremental rsync stage and normal Borg file caching while retaining host-only repository credentials.
- Added the M08 provider-neutral notification and consent foundation: nine strict English event types, PII/coupon/secret-free payloads, immutable deduplicated event evidence, purpose-separated Auth-derived customer preferences, stronger trusted suppression, privacy-erasure suppression, and point-expiry dual-write without activating an external provider.
- Added disabled-first self-hosted transactional SMTP delivery with an isolated notification worker, database-authoritative leases and dispatch authorization, six immutable English templates, ephemeral verified-Auth contact resolution, deterministic Message-ID, bounded evidence-based retries, and manual review for ambiguous acceptance.
- Added disabled-first managed Klaviyo synchronization with tenant/key binding, minimized profile and event projection, pinned API revision, provider-suppression import, dispatch-time consent authorization, bounded evidence-based retries, and manual review for ambiguous opt-in submission.
- Added disabled-first generic outbound webhooks with Standard Webhooks v1 HMAC signatures, endpoint-bound rotatable secret fingerprints, stable replay IDs, public-only socket-pinned destinations, no redirects, minimized payloads, database-authoritative consent and entitlement rechecks, rate limits, bounded evidence-based retries, and manual review.
- Added the M08 notification studio with immutable tenant-owned English template versions, event-specific token allowlists, deterministic escaped HTML, actor-bound SMTP test delivery, consent/provider health, and a bounded contact/secret-free issue queue.

- Added the M07 audience authority foundation: strict allowlisted predicates over canonical loyalty facts, exact bigint TypeScript/domain contracts, independently validated immutable PostgreSQL versions, database-timed private membership snapshots, Auth-derived idempotent commands, and rollback-safe campaign entitlement enforcement without arbitrary SQL, PII selectors, or browser-supplied targeting authority.
- Added strict contracts for seven campaign behaviors, explicit-instant/IANA schedule evidence with DST gap/overlap checks, immutable audience/exclusion bindings, hard points/liability ceilings, exact decimal preview values, exact salted-hash approval-time treatment/control assignment, and Auth-derived preview/approve/pause/cancel lifecycles without activating value execution.
- Added atomic campaign effect/points/liability counters, deterministic fixed-bonus and highest-priority multiplier evaluation, one-transaction programme and campaign-attributed ledger commits, immutable exact-retry context, and a two-session last-budget reservation probe.
- Added exact-programme canonical milestone, win-back, tier, referral, and limited-quantity campaign jobs; bounded ten-attempt leases; campaign-funded WooCommerce reward reservations; atomic point/native execution; refund/cancellation compensation; and rollback-safe entitlement gating that preserves accepted work and ambiguous native value.
- Added the complete Campaign command center: multi-condition audience and seven-behavior campaign versioning, snapshot publication, DST-safe scheduling, liability preview, approval, pause/cancel, responsive calendar, minimized exact aggregate results, canonical metric definitions, and honest influenced-versus-incremental measurement boundaries.
- Exposed the protected campaign result detail already returned by PostgreSQL—reserved capacity, purchase reversals, control/suppression outcomes, trigger fulfilment/reversal states, and bounded queue health—in a keyboard-operable responsive disclosure instead of discarding it in the merchant UI.
- Hardened campaign release boundaries with append-only cumulative purchase-refund compensation, published fixed-discount-derived monetary liability, and one-statement coherent audience snapshot evaluation.
- Added bounded database-timed campaign activation and completion with immutable private lifecycle evidence, including completion of paused/missed-start schedules so historical versions do not block successors.
- Anchored campaign point availability and expiry to the immutable trigger instant so worker delay cannot extend customer value or change the historical earned-date policy.
- Added exact-programme connector preflight for native campaigns and first-attempt manual review for deterministic trigger failures while retaining bounded retries for transient database faults.
- Replaced hard-coded/free-text campaign earning-rule and tier codes with exact published-programme selectors, database validation at draft/approval, and an atomic programme-publication compatibility guard for accepted campaigns.
- Hardened purchase-campaign refunds with append-only cumulative per-effect compensation, exact original-ledger attribution, atomic worker rollback, and merchant reversal results derived without rewriting gross campaign effects or capacity.
- Bound hard campaign monetary ceilings to the immutable face value, currency, precision, exact programme, and published state of V2 fixed-discount rewards; unsupported native kinds can no longer claim merchant-estimated hard liability.

- Added the M06 referral foundation: strict versioned policy, opaque Auth-linked advocate URLs, offline WooCommerce capture with purpose-separated expiring fingerprints, database-derived first attribution, deterministic self-referral blocking, reversible risk review, and entitlement rollback without issuing value before qualification.
- Added historical-version referral qualification with configured paid-status, minimum-spend, and first-order enforcement; immutable evaluator evidence; reversible review hold; event-time return cooling; and value-neutral refund rejection before give/get ledger issuance.
- Added bounded leased referral reward work with atomic advocate/friend award-release pairs, historical expiry lots, immutable tier evidence, ten-attempt manual-review exhaustion, and exactly-once two-sided refund compensation.
- Added the referral review workspace with fingerprint-free risk cases, Auth-derived owner/admin/operator decisions, immutable reason-bound audit, read-only analyst/auditor access, and capped reviewed recovery for exhausted atomic jobs.
- Added customer referral link sharing, give/get explanation, minimized progress/history, canonical merchant funnel and advocate performance, honest metric boundaries, independently degradable referral reads, and responsive merchant/customer experiences.

- Added advanced VIP qualification with lifetime, rolling-day, and IANA-calendar windows; independent entry, retention, and re-entry expressions; immutable event-time facts; refund compensation; exact progress; and database-verified automatic entry, upgrade, grace, downgrade, and re-entry.
- Added executable tier earning multipliers and fulfilment-bound tier reward benefits. Purchase awards independently prove their published tier factor, linked free-shipping/manual perks retain normal reservation and fulfilment controls, and fixed bonuses remain unmultiplied.
- Added owner/admin-only, reason-bound, future-expiring tier overrides with immutable audit/history, continued underlying automatic qualification, bounded exactly-once worker expiry, tenant RLS, and no raw browser/worker membership-writing capability.
- Added earned-date point expiry administration with immutable per-version policy, 30/14/7 reminder scheduling, aggregate liability preview, version-scoped ledger expiry, original-lot reservation restoration, and a bounded single-flight worker lifecycle.
- Added bigint-safe merchant and customer tier progression, immutable history, next/retention/re-entry milestones, aggregate tier performance, and a responsive advanced-policy builder and simulator.
- Hardened legacy tier migration with exact Rose/Bloom/Icon V1/V2 shadow parity and independent contract/PostgreSQL enforcement that displayed points rates equal executable base-rate multipliers.

- Added strict V2 native rewards with WooCommerce restrictions, product-specific free products, date/tier/customer limits, atomic global quantity and points-budget reservations, capability-negotiated mixed-version connector rollout, and a two-session last-unit concurrency gate. Segment availability remains fail-closed until M07 provides authoritative audiences.
- Added exclusive-access and custom-perk rewards with a private audited manual-fulfilment queue, role-separated inspection and operations, exactly-once capture or definitive-rejection compensation, and reservation preservation for uncertain outcomes.
- Rebuilt Rewards as a six-template merchant workflow with restrictions, availability, capacity controls, readiness guidance, operational summaries, and hosted customer confirmation for every supported native and manual type.
- Hardened reward rollout and compatibility: accepted manual cases remain visible and resolvable after expanded rewards are disabled, offset-bearing availability windows compare by instant, and public programme RPCs preserve only validated legacy fixed, percentage, and free-shipping rewards while rejecting unsupported or disguised legacy definitions before publication.

- Released and deployed `v0.1.11`: applied the additive V2 migration after a fresh recovery point, retained zero production value, enabled only the Starfiniti database-authoritative canary, and passed authenticated desktop/mobile earning-builder simulation with no browser diagnostics.

- Repaired the live PostgreSQL off-host backup race with a snapshot-safe forced exporter, incomplete-base exclusion, retained-base-aware WAL cleanup, deterministic deployment validation, and successful forced-WAL/manual/timer-driven production archives.

- Added `ProgrammeDefinitionV2` competitive earning rules with six sources, explicit precedence/exclusions, exact event/member caps, immutable explanation evidence, signed WooCommerce/Merchant Activity ingestion, and atomic ledger commit while retaining V1 evaluation.
- Rebuilt Earning Rules as a Hub-style rule catalogue and source-safe condition/cap builder with deterministic conflict diagnostics, V1 migration review, and the same evaluator for merchant simulation and worker execution.

- Added self-hosted and managed deployment modes, a versioned 18-capability entitlement catalogue, exact tenant limits, deterministic percentage rollout, explicit tenant canaries, and private externally configured provider-price mappings.
- Kept entitlement authority in PostgreSQL with membership-derived RLS reads, append-only configuration evidence, fail-closed dashboard parsing, no Stripe dependency for self-hosted installations, and non-disableable balance/refund/reconciliation/checkout/export/promised-redemption paths.

- Added the M01 real-WooCommerce pilot runbook and a machine-validated 22-check evidence gate covering store approval, value lifecycle, refunds, expiry, reconciliation, key rotation, outages, recovery, alerts, and exact final reconciliation.
- Recorded the zero-value production baseline and corrected the recovery claim: database PITR is proven, while the configured nightly whole-VM Borg job has not completed its first loyalty-VM run and application/Auth/signing recovery remains pending.

- Replaced broad unfinished phases with the evidence-gated M00–M16 enterprise roadmap, stable dependencies, owner-input fields, rollout/rollback requirements, and deterministic finish rules while preserving completed historical evidence.
- Added an official-source Smile/LoyaltyLion/Yotpo capability matrix, a machine-readable 49/100 whole-product baseline distinct from the 95/100 engineering score, a module evidence standard, and ADR-0009 for sequential vertical delivery.
- Kept Shopify, localization, store credit, gift cards, and cash redemption deferred; self-hosted AGPL installations remain independent of Stripe or remote licence enforcement.

- Replaced the monolithic Programme editor and duplicate fragment links with four honest merchant workflows: a launch/readiness overview, tier-based earning rules with live order simulation, a WooCommerce-ready rewards catalogue with guided empty state, and a distinct VIP-tier ladder with overlap validation and member qualification preview.
- Rebuilt merchant administration around the owner-selected Hub-style launch command center: one fixed Lucide sidebar, real Starfiniti identity, data-backed programme checklist, compact performance rail, audit activity, responsive drawer, and persistent light/dark theme now frame Overview, programme, customer, connector, and experience workflows without a tenant or language switcher.
- Show eligible spend as unavailable until an authoritative published-programme currency exists instead of exposing an implementation-level minor-unit fallback in the merchant command center.
- Fixed production server-side Supabase reachability with a validated container-only split-DNS mapping that retains the public HTTPS hostname, and documented the required RLS-protected `loyalty` PostgREST schema allowlist.
- Verified the real Authentik-to-Supabase PKCE exchange, atomically bootstrapped the approved Starfiniti owner UUID, and rendered the live English-only tenant dashboard without a language or tenant switcher.
- Fixed workforce PKCE callbacks by preserving pending verifier cookies through the callback proxy, correlating each OAuth exchange to its exact verifier, anchoring every success/failure redirect to the configured public dashboard origin, rejecting bind-address origins, and hardening server-side auth cookies in production.
- Made the launch experience English-only: removed merchant/customer/public language switchers, canonicalized legacy locale URLs to English, limited customer-copy editing to English, removed the bundled Slovenian WooCommerce catalog, and stopped propagating locale through signed claim links while retaining legacy database compatibility.
- Added Starfiniti workforce sign-in through Authentik as Supabase custom OIDC, preserving the Supabase Auth UUID/RLS subject, customer password login, and customer-export password reauthentication.
- Added exact callback/provider redirect validation, English/Slovenian login copy, ADR-0008, and an explicit real-SSO-identity gate before initial tenant bootstrap.
- Parameterized the dashboard's non-wildcard IPv4 bind for separate trusted reverse proxies, and made preflight enforce the production container's UID-1001 owner-only WooCommerce signing pool.
- Recorded the first self-hosted production recovery implementation: one-minute WAL archive, daily physical base backups, encrypted off-host copies every three minutes, nightly VM backup, retention timers, and a successful `pg_verifybackup` rehearsal.
- Documented the pinned PostgreSQL `GRANT ... TO current_user` crash workaround and the required Supavisor recreation after an in-place database-container replacement.

- Bootstrapped the Starfiniti Loyalty repository from the approved design-only handoff.
- Scoped the current product to self-hosted Supabase on Proxmox, Next.js, and WooCommerce; deferred Shopify implementation.
- Added repository operating documents, ADRs, task ledger, baseline CI, and environment templates.
- Added a responsive, production-built Next.js Overview route with working date-range, publish-review, and mobile-navigation interactions.
- Added typed integer value primitives, versioned commerce-event contracts, four unit tests, and a Supabase-generated foundation migration.
- Added the WooCommerce HPOS-compatible plugin scaffold and Proxmox/Supabase deployment contract.
- Fixed standalone packaging so HTML, CSS, and JavaScript assets are served by the production server.
- Added a Docker-backed Supabase CI job that replays migrations/seed and runs pgTAP security checks.
- Added durable guards for schema grants, RLS coverage, security-definer placement, pinned CI actions, and exact Supabase CLI versions.
- Added clear container-runtime preflight diagnostics and database-testing documentation.
- Created the private GitHub repository and verified the full baseline plus migration/seed/pgTAP database gate on GitHub Actions.
- Completed Phase 0 and opened ADR-0004 for explicit loyalty value-semantics approval.
- Accepted ADR-0004 with the owner-approved Rosy Rewards v1 semantics and resolved the prototype/master-plan tier conflict in favor of live Rose/Bloom/Icon tiers.
- Added versioned programme configuration plus pure integer award, release, expiry, refund-reversal, negative-balance, redemption-lot, and tier-review helpers with 16 domain tests.
- Licensed the hosted platform under AGPL-3.0-or-later while retaining GPL-2.0-or-later for the WooCommerce plugin.
- Completed the Phase 1 product-model gate for the active WooCommerce scope; Shopify remains deferred.
- Merged the verified Phase 0/1 work and published `Starfiniti/starfiniti-loyalty` as a public AGPL repository.
- Completed Phase 2 with reviewable architecture, data, identity, event, threat, privacy, recovery, deployment, and SLO models.
- Accepted ADR-0005 through ADR-0007 for database authorization boundaries, an immutable double-entry points ledger, and transactional inbox/outbox processing.
- Added a deterministic Phase 2 architecture validator to the complete repository gate.
- Completed the Phase 3 tenancy foundation with no-login roles, explicit grants, composite tenant keys, live membership RLS, and scoped support access.
- Added 41 adversarial tenancy assertions; exact-head Docker/Supabase CI now passes 49 total pgTAP checks across migration replay and reset.
- Completed Phase 4 with strict WooCommerce contracts, raw-body HMAC verification, a server-only Next.js intake route, durable layered idempotency, and canonical normalization.
- Added a local WooCommerce outbox with HPOS-safe hooks, exact-envelope Action Scheduler retries, bounded dead-letter behavior, and no synchronous hub dependency during checkout.
- Added 38 commerce pgTAP assertions; exact-head Docker/Supabase CI passes 87 total database assertions including replay and out-of-order delivery paths.
- Completed Phase 5 with programme/customer/wallet foundations, immutable zero-sum ledger transactions/entries, FIFO lots, compensating allocations, six balance projections, and eight atomic value commands.
- Added tenant ledger export, programme liability reporting, wallet/lot drift detection and rebuild tools, plus strict versioned ledger command contracts.
- Added 91 ledger pgTAP assertions and a two-session concurrency/property probe; exact-head CI passes 178 total database assertions and prevents concurrent overspend.
- Completed Phase 6 with deterministic connector-neutral earning/exclusion rules, one-step order rounding, identical live/simulation evaluation, and human-readable line evidence.
- Added immutable programme draft/publish/schedule/supersede lifecycle, materialized tier/reward definitions, effective tier intervals, approval attribution, and versioned programme contracts.
- Added idempotent reward reservations with audited state transitions bound to exact ledger effects, safe connector-failure compensation, and transactional advance expiry notifications.
- Added 82 programme pgTAP assertions; the five-migration database gate now exercises 260 assertions plus ledger concurrency/property checks.
- Added the Phase 7 WooCommerce worker with durable effect leases, explicit programme binding, PII-free channel identity resolution, completed-order awards, and cumulative original-attribution refund reversals.
- Added signed native coupon issue/cancel polling, idempotent customer-scoped WooCommerce coupons, completed-order coupon capture, and expiry cancellation that releases points only after confirmed unused native cancellation.
- Added encrypted-at-rest plugin signing material, connection/queue diagnostics, WP-CLI dead-letter recovery and source reconciliation, My Account/cart reward surfaces, privacy export/erase, and opt-in uninstall cleanup.
- Added a separate Proxmox worker service/credential, connection health watermarks, installable plugin ZIP packaging, and Phase 7 contract/worker/pgTAP coverage.
- Fixed reservation settlement so capture/release preserves the immutable original reserve-ledger pointer and retries can continue proving their origin.
- Added a real minimum/current WordPress and WooCommerce runtime matrix across HPOS and legacy storage, classic and Blocks coupon paths, hub outage, partial/full refunds, activation lifecycle, reconciliation, and dead-letter recovery.
- Added the Phase 9 Supabase Auth merchant shell with verified claim refresh, private cookie responses, live RLS-backed tenant context, safe local redirects, login/logout/callback flows, and honest preview labelling for analytics not yet connected to reporting queries.
- Added the audited Phase 9 programme editor with structured tier/reward configuration, deterministic preview, database-canonical immutable drafts, exact-hash publish/schedule confirmation, visible version/audit history, and live role/tenant enforcement.
- Added tenant-scoped customer search and detail views with masked channel identifiers, six authoritative wallet buckets, and the latest immutable programme-attributed ledger entries.
- Added tenant-scoped WooCommerce health and queue operations with bounded payload-free failure metadata, safe role-guarded canonical-effect replay, and immutable reason/correlation audit evidence; compensated outbound coupon dead letters remain inspect-only.
- Added owner/admin customer point adjustments with exact bigint preview, expiry-bound credits, strong debit confirmation, request-derived actors, immutable double-entry ledger effects, and matching administration audit evidence.
- Added reviewed owner/admin/operator WooCommerce order reconciliation from the hub through an audited private outbox, signed connector polling, idempotent plugin source-fact re-emission, and explicit missing-order termination.
- Replaced illustrative Overview figures with tenant/workspace/programme-authorized reporting for members, eligible loyalty spend, repeat-member rate, point redemption, liability, and aligned daily trends using exact integer contracts and private-source aggregation.
- Hardened customer list/detail reads with live-membership database wrappers, literal bounded search, database-side channel-ID masking, fixed result ceilings, and text-form wallet/ledger integers that remain exact beyond JavaScript's safe range.
- Added guided first-programme onboarding for existing tenant owners/admins through an idempotent, audited, server-authorized database command; public tenant provisioning remains disabled.
- Added minimized customer tier visibility with current/qualified/grace state, exact eligible-spend minor units, and no private decision evidence in the merchant response.
- Added a keyboard bypass link and focusable main landmark across every merchant route, extended visible focus styling to text areas, retained reduced-motion safeguards, and fixed the sign-in card's narrow-viewport overflow.
- Added a tenant-scoped support-diagnostics download that aggregates queue totals and a labelled bounded sample of canonical error codes while excluding payloads, commerce/customer identities, store names, actors, reasons, signing references, and secrets.
- Added exact WooCommerce POT coverage and a bundled Slovenian catalog loaded through the standard WordPress text-domain path, with customer navigation translation exercised in every supported runtime-matrix cell.
- Added tenant-scoped, revisioned customer-experience tokens with accessible color validation, local font stacks, responsive member/guest previews, owner/admin-only idempotent saves, and immutable audit evidence; executable CSS and remote assets remain excluded.
- Added allowlisted customer timeline filters for order earnings/refunds, reward lifecycle, release/expiry, and manual adjustments over the existing bounded immutable ledger read model.
- Added owner/admin bulk point adjustments for 2–50 customers with an exact read-only dry run, projected balances, explicit fingerprint approval, deterministic balance locking, atomic per-customer immutable ledger effects, idempotent batch evidence, and aggregate audit attribution.
- Enforced zero-JavaScript, zero-CSS, zero-render-request WooCommerce storefront budgets with bounded server-rendered account/cart markup and real hub-outage assertions in every supported runtime cell.
- Added tenant-scoped English and Slovenian hosted customer-copy management with independent locale revisions, bounded translation contracts, live localized previews, owner/admin-only idempotent saves, RLS reads, and copy-free immutable audit metadata.
- Added a guest-safe hosted loyalty page that renders published tiers and rewards with controlled merchant styling and English/Slovenian copy through one bounded anonymous PostgreSQL projection.
- Added a one-use five-minute WooCommerce customer claim with explicit Auth confirmation, immutable hashed decision evidence, revocable conflict-safe customer links, and no email matching or render-time hub request.
- Added an authenticated hosted member account with exact balances, tier/expiry, safe rewards/reservations, and redacted activity through a no-argument Auth-derived PostgreSQL projection.
- Added explicit hosted-member reward confirmation and one narrow Auth-derived redemption command that atomically reserves exact points, records immutable reservation evidence, and queues one private customer-scoped WooCommerce coupon command without browser-supplied tenant/value authority.
- Added validated native coupon amount, percentage, currency precision, and 1–365 day validity fields to structured programme authoring, plus automatic point release through the existing connector failure/unused-expiry compensation paths.
- Added end-to-end WooCommerce customer erasure: one opaque deduplicated local event, strict PII-free contract, immutable private keyed tombstone, hosted-link revocation, channel-identity and raw-event pseudonymization, and suppression of later re-import without changing wallet or ledger history.
- Localized the complete hosted customer journey in English and Slovenian across WooCommerce claim links, authentication continuation, claim confirmation, member accounts, and reward redemption while keeping locale outside signed identity authority.
- Added a password-reauthenticated hosted customer JSON export with a five-minute one-use session-bound capability, subject-only database projection, exact ledger history, direct private download, strict response contract, and immutable per-customer audit evidence without persisted export content.
- Added guided owner/admin WooCommerce connector provisioning from the operations hub using a deployment-generated read-only signing-key pool, a runtime-only audited database command, and a one-time exact setup package imported into the plugin without exposing signing references through the browser Data API.
- Added reproducible deployment artifacts: digest-pinned dashboard/worker bases, pull-request Docker builds, a constrained build context, and version-tag publication of commit-addressed GHCR images plus a checksummed WooCommerce plugin release.
- Added a secret-safe production configuration preflight for Proxmox Compose parity, placeholder/floating-image rejection, canonical HTTPS origins, distinct least-privilege database logins, signing-pool validation, and Linux owner-only permissions.
- Added a public-minimal dependency-aware dashboard readiness route that proves the runtime database login can execute exact ingestion/provisioning functions and that a valid signing pool is mounted, while exposing only `ok` or `unavailable`.
- Added a deployment-only, atomic, and audited initial-tenant bootstrap plus a confirmation-gated operator command that creates the first organization, owner membership, workspace, programme group, and link from an existing Auth UUID without exposing administration credentials to application roles.
- Localized the authenticated merchant Overview, programme creation/edit/publish/schedule workflow, and WooCommerce connector operations in English and Slovenian, including locale-preserving mutations, one-time setup guidance, diagnostics, reconciliation, replay feedback, and responsive browser evidence.
- Made programme scheduling interpret `datetime-local` as Europe/Ljubljana wall time rather than server-local time, with explicit rejection of daylight-saving gaps and ambiguous instants.
- Localized customer search/detail, tier/wallet/activity, individual and bulk adjustment, theme-token, customer-copy, responsive preview, mutation feedback, document-language, and keyboard-bypass administration in English and Slovenian; customer credit expiries now share the deterministic Europe/Ljubljana wall-time boundary.
- Hardened signed WooCommerce event and command receivers with a streaming 64 KiB cap before database/signing access, including omitted-length and chunked request coverage.
- Bounded WooCommerce issue, cancellation, and reconciliation delivery at ten claims with inspect-only manual-review diagnostics that preserve ambiguous coupon reservations until the native result is verified.
- Removed unsupported maximum caps from native percentage rewards, added independent PostgreSQL publication/scheduling and pre-reservation guards, and exercised uncapped percentage coupons in every supported WooCommerce runtime.
- Server-rendered the allowlisted English/Slovenian document language, preserved Slovenian across guest/authenticated redirects, and removed inert Overview controls plus placeholder navigation.
