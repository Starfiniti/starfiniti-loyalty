# Iteration Log

## 2026-08-28 — Guest-safe public earning catalogue

- Reconstructed the hosted earning path and found that a single generic “Eligible store activity” card hid the six versioned earning sources and exact published effects already supported by the platform. It could also imply purchase earning where a V2 programme published only private custom rules.
- Compared static copy, raw `ProgrammeDefinitionV2` disclosure, and a database-derived minimized version. ADR-0075 selects additive V4: PostgreSQL re-derives active tenant and immutable published version, derives stable public codes and reviewed labels instead of exposing merchant-authored identifiers/copy, exposes only five standard public sources and rebuilt effects/schedules, and omits custom activities, selectors, exclusions, cap values, priority/stacking internals, customer facts, IDs, audit, and ledger state.
- Added bounded contracts and missing-function-only V3/V2/V1 compatibility. Duplicate codes, contradictory source/effect pairs, invalid date windows, oversized integers, malformed/duplicate rows, and provider errors fail closed. Legacy V1 receives one conservative first-tier purchase method; a V2 programme with only private rules remains honestly empty.
- Replaced the generic card with a responsive editorial catalogue using source-specific Lucide icons, exact base/multiplier/fixed copy, live/scheduled states, availability windows, conditions guidance, and an honest empty state. Accessibility guards now prevent restoration of the generic placeholder.
- Focused reduced-motion Playwright review of the real route at 1512×982 and 390×844 passed all five public sources, exact effects, scheduled state, first-focus bypass, one H1, zero horizontal overflow, and zero console/page/request diagnostics. Desktop and mobile captures are retained under M09 evidence.
- The required adversarial diff review found that the first candidate still exposed merchant-authored rule codes/names and used two sub-4.5:1 small-text colors. The final boundary derives source/ordinal codes and fixed reviewed labels in PostgreSQL, enforces those labels again in the untrusted-response contract, proves raw internal identifiers/copy and invalid timestamps are absent, and uses the established higher-contrast muted text token. No finding survived the refutation pass after those repairs.
- Local contract, server, presentation, type, accessibility, migration, and pgTAP static checks pass. Docker-backed 83-migration replay and the expanded 60-case public projection suite await the identical Linux CI job. Production, customer value, programme evaluation, WooCommerce, checkout, and M09's 88/100 canary state remain unchanged.

## 2026-08-28 — Guest-safe advanced VIP catalogue

- Reconstructed the public hosted VIP path and found a correctness gap: strict V2 exposed only legacy spend/rate tiers, while published V2 policies may qualify by spend, points, orders, referrals, or verified activities under lifetime, rolling, or calendar windows. The page therefore misrepresented advanced policies and used a speculative “coming soon” empty state.
- Compared mutating V2, passing raw policy JSON to the browser, and adding a database-derived minimized V3 projection. ADR-0074 selects additive V3 so strict clients and rollback remain compatible while PostgreSQL retains tenant/version and disclosure authority.
- Added a bounded V3 contract and projection for period, grace, ordered levels, exact entry operator/metric/threshold, rate, and safe benefit booleans. Private activity selectors, reward codes/configuration, customer progress, internal IDs, audit evidence, and ledger/value state remain absent. Legacy policies synthesize an equivalent lifetime/spend catalogue; malformed or mismatched new data fails closed and only a genuinely missing function permits V2/V1 normalization.
- Replaced generic spend cards with a responsive editorial progression rail and an honest no-tier state. Focused actual-route Playwright review at 1512×982 and 390×844 passed three levels, both expression types, benefit labels, one H1, zero horizontal overflow, and zero console/page diagnostics; desktop and mobile captures are retained under M09 evidence.
- The adversarial pass added PostgreSQL-bigint upper bounds, duplicate-safe React keys, generic wording for private verified-activity selectors, and a database test for the legacy synthesis branch. Production, customer value, tier decisions, WooCommerce, checkout, and M09's 88/100 canary state remain unchanged.
- The first Linux replay correctly rejected the new security-definer function from both global exposed-function allowlists even though its dedicated 47-case suite passed. After explicitly reviewing and adding the exact V3 signature/name to both allowlists, implementation head `7a68ffa` passed all 12 PR checks in CI `33157341807` and Security `33157341670`; database replay passed 82 migrations, 68 pgTAP files, and 3,712 assertions.

## 2026-08-28 — VM 971 transfer-loop revalidation

- Investigated the reported 200–235 MB/s five-minute pattern through the approved read-only Proxmox route. The active PostgreSQL timer uses incremental rsync and normal Borg files; the old tar-over-stdin `--content-from-command` script is only a dated rollback copy. The 3.604 TB VM counter remains cumulative incident history rather than a current rate.
- A direct quiet sample measured 1,559 VM tap bytes in 15 seconds. Watching the next scheduled cycle end to end measured about 446 KiB across the window; the job transferred four changed files, 67,885 content bytes and 409,323 received bytes, created the archive in 1.63 seconds, and exited zero. Public dashboard readiness returned HTTP 200 and the timer stayed enabled.
- No VM restart, timer change, process termination, package change, archive mutation, database operation, checkout change, or loyalty-value mutation was needed. The separate dedicated-repository, retention, monitoring, rsync 3.5, escrow, and isolated-restore gates remain open.

## 2026-08-28 — Exact recovery rollback-artifact contract

- Reconstructed the last package-level gap in ADR-0073 before any production proposal. Read-only Proxmox inspection reconfirmed both VMs running and the host on Debian amd64 with rsync `3.4.1+ds1-5+deb13u3` and `libacl1` `2.3.2-2+b1`; the host candidate is rsync `3.4.1+ds1-5+deb13u4`. The QEMU guest agent and host-to-guest SSH were unavailable, so the guest version remains bound to the prior observed Ubuntu rsync `3.2.7-1ubuntu1.5` rather than being guessed from current reachability. No service, package, timer, repository, configuration, secret, backup, route, or value was changed.
- Verified official archive availability independently of the repository contract. Debian Security host rsync is 432,964 bytes at SHA-256 `fee3fa3b5924cc7e0964603945e0edfd63b7f29fc3cd4cf7613ad970e05a55be`; Debian host `libacl1` is 32,860 bytes at `08074f01e384bc07c0c2d79a58cf4a6523f71cf75d1808101c79617656c9a39d`; Ubuntu Security guest rsync is 442,954 bytes at `8f952895697d19a6f1caa71f17c7d4e8c1f1fb485eb824ffe3e4c77dd587b338`. Local archive inspection proved valid Debian package containers. These ad hoc downloads are research evidence only, not operations escrow.
- Extended the only executable transport plan with exact authority, repository, suite, HTTPS archive URL, name, version, architecture-bound hash, and distribution-keyring boundary for all three rollback artifacts. The plan digest is `56600763ba44ab85221ecbc4effbac09055e42d135a04429ee27980389f73405`.
- Hardened the disposable build so rollback verification precedes candidate-repository changes: each exact version is downloaded through signed base APT metadata and independently from its exact HTTPS URL; both byte streams must match the fixed SHA-256, each package's name/version/architecture must match, no rollback package is installed, only name/version/hash facts survive read-only, and every package byte is removed. The runner binds those minimized facts to each endpoint report.
- Added positive and adversarial validator coverage for rollback set shape, source/URL/hash substitution, signed and direct download equality, metadata checks, ordering, non-installation, byte removal, marker/report binding, and pending exact-head evidence. The skeptic pass found and repaired a deletion-order/documentation mismatch, an under-bound runner comparison, and a missing runtime no-package-byte assertion before commit. The earlier `13e55ad` result remains candidate-package evidence only.
- Local `npm run check`, all 958 tests, 81 migration/68 pgTAP-file validation, the 1,043-file secret scan, zero-vulnerability production audit, licence inventory, and adversarial diff review passed. Exact rollback-aware implementation `ed5eb7f315e2136d43d1f5a0b4cbdb75941b1c26` then passed Security run `33151832310`, recovery job `98785369076`. Artifact `9678028203` and report SHA-256 `a35f4dbd8bd892f41718fb639022350084ee67e535919558393c0d98ce4320d3` bind all three signed-metadata/direct-URL proofs, zero retained package bytes, protocol 32, a two-file/21-byte internal transfer, no production mutation, and teardown. Operations-controlled offline escrow, host-consumer review, approved rollout, real archive evidence, and isolated restore remain open.
- The same read-only pass found no dedicated PostgreSQL backup configuration under the live backup directory and no active Prometheus, Alertmanager, Grafana, Loki, Promtail, or node-exporter unit. The incremental PostgreSQL timer remains active and maintenance remains inactive. The inspected corporate WordPress installation does not contain WooCommerce or the Loyalty connector, so it cannot be claimed as the M01 real-store pilot.

## 2026-08-28 — Exact vendor rsync 3.5 transport canary

- Reconstructed the remaining IMP-010 dependency after ADR-0072: current production intentionally fails the 3.5 gate, but current official vendor channels now publish architecture-compatible rsync 3.5 packages for both operating systems.
- Compared waiting for complete stable-distribution backports, maintaining a private upstream build, upgrading only one endpoint, and using separate vendor-signed packages with one shared behavioral canary. ADR-0073 selects the last approach without authorizing production installation.
- Bound Debian `3.5.0+ds1-2` and the rsync project's Ubuntu Noble `3.5.0-1ppa~noble1` to exact repository authorities, package checksums, the complete Launchpad signing fingerprint, and digest-pinned OS images. Candidate repositories are pinned below base repositories for every dependency except the exact rsync package.
- Added a fail-closed build and internal-only Docker canary that verifies OS/architecture, signed metadata, package identity and checksum, canonical root-owned executables, rsync 3.5/protocol 32, the upstream confinement/inode-pinning integration, restricted-command rejection, two-file content transfer, bounded evidence, and exact teardown. The runner accepts only the canonical repository plan and never names production access.
- The first exact-head Security run failed before Docker because the bounded output-path parser required a three-character basename while the workflow used `ci.json`; its always-upload step then correctly refused to publish absent evidence. The corrected allowlist accepts two-character basenames without permitting another directory, absolute path, traversal segment, or non-JSON output.
- The second exact-head run verified the Debian rsync artifact checksum, then refused installation because Debian 13's `libacl1` 2.3.2 did not satisfy rsync's declared `>= 2.4.0` dependency. The corrected plan does not loosen the unstable pin: it names the sole `libacl1` 2.4.0-1 exception, binds its official Debian URL and SHA-256, verifies package metadata before a separate local install, requires Ubuntu to retain an empty extra-dependency set, and leaves real host-consumer compatibility and exact rsync/libacl rollback escrow for the production gate.
- The third exact-head run built and checksum-verified both rsync packages plus the Debian dependency, completed wrapper checks and the internal synthetic transfer, then failed on an over-broad whole-package verification fact after package initialization changed non-executable configuration. The corrected runtime fact rejects any `dpkg --verify` drift for `/usr/bin/rsync` or `/usr/bin/rrsync` while leaving non-executable package configuration outside the executable-integrity claim. The same run made the repository scanner see the test Dockerfile and correctly reject its root runtime and absent health check; both disposable images now run as numeric uid/gid 65532, use writable `/tmp` daemon state, and declare a bounded rsync health check after root-only build verification.
- Wired positive and adversarial plan/evidence validation into the root gate and a fourth bounded Security workflow job. Exact candidate `13e55ad3bebdeb699d0df2e6ecbc4f8cbd40c706` passed CI run `33148107122`, Security run `33148107140`, and external CodeQL with all twelve checks green. Recovery-transport job `98773576973` produced artifact `9676590363`: the minimized report binds plan `c623bebcf48b0dba785ed2fa4b00bfb2899855139647fdc153a6d383cea0f17d`, protocol 32, two files/21 bytes, both package/wrapper checks, internal-only zero-port isolation, no production mutation, and passing teardown. Rollback packages, host-consumer compatibility, maintenance approval, real forced-command/manual/timer archives, production rollout, and isolated restore remain external gates. No production package, service, timer, repository, backup, route, checkout path, or loyalty value changed.

## 2026-08-28 — M16 recovery dependency drift control

- Reconstructed the M16 monthly source contract after ADR-0072 exposed a gap: Supabase, PostgreSQL, WooCommerce, Stripe, Authentik, Klaviyo, and Node.js were mandatory, but rsync, BorgBackup, OpenSSH, the guest operating systems, and Proxmox were not. The rsync incident could therefore become a one-off fix without a required future source review.
- Verified the official rsync NEWS, BorgBackup changes, OpenSSH release notes, Debian security, Ubuntu security notices, and Proxmox advisory sources. The initially inferred Proxmox category identifier returned 404, and the VE thread defaulted to its oldest pagination page; following Proxmox's own announcement link resolved the current Security Advisories category, which exposes the latest advisory dates across Proxmox projects.
- Extended the exact provider catalogue and M16 acceptance/runbook/ADR bindings from seven to thirteen sources. A monthly artifact must now record the installed and candidate version or dated entry, source/package provenance where applicable, impact, owner, and disposition through one cutoff; recovery transport review is incomplete unless it covers both endpoints.
- Added a deterministic adversarial case that substitutes an unofficial rsync source and proves the monthly review fails closed. Existing closed-set checks also reject missing or additional source identities and stale review instants.
- A final contract-to-validator refutation found the initial artifact check still accepted one generic observed entry, despite the runbook requiring actual installed and candidate state. The corrected catalogue declares exact `proxmox-host` and/or `database-guest` coverage per recovery source; monthly evidence now requires each endpoint's version/release and nonzero provenance digest plus the candidate version/entry and nonzero provenance digest. New adversarial fixtures reject a missing rsync endpoint and zero candidate provenance.
- Added `IMP-010` for the live pre-3.5 rsync boundary. Its exact score is `40 + 20 + 20 + 10 - 4 - 6 = 80`, placing it above the dedicated-repository item while retaining the approved-package/build, rollback, canary, and isolated-restore dependency. M16 remains in progress at 77/100 with seven checks passed and 32 pending; no elapsed review, package acquisition, production change, backup, checkout path, or loyalty value was claimed.
- Full local checks, 81 migration/68 pgTAP-file validation, the 1,036-file secret scan, zero-vulnerability production audit, and licence inventory passed. Exact implementation head `a7a00f2cfe082b91f8eef65b0930c24fe1c1e4b8` passed CI run `33144201269`, Security run `33144201312`, and external CodeQL with all eleven draft PR #57 checks green; the PR remained draft and merge-clean.

## 2026-08-28 — Rsync 3.5 recovery-transport security baseline

- Reconstructed both live endpoints without mutation. The Proxmox Debian 13.5 host runs rsync `3.4.1+ds1-5+deb13u3` with `deb13u4` available; the Ubuntu 24.04.4 database VM runs `3.2.7-1ubuntu1.5`. Both installed rsync/rrsync files are root-owned regular mode `0755`, but neither endpoint implements the complete upstream 3.5 security baseline.
- Reviewed upstream 3.5 release/security guidance plus Debian and Ubuntu package/CVE status. The directly applicable fixes include restricted-`rrsync` path escape and confinement, peer-triggerable memory/path failures, and command/argument injection. The current owner-only trusted topology reduces exposure but cannot replace protocol/parser repairs at a privileged host/guest boundary.
- Accepted ADR-0072 after comparing a partial Debian point update, unbounded distro-backport waiting, topology-only mitigation, a dual-endpoint 3.5 gate, and protocol replacement. The candidate does not acquire or install packages. It refuses current production until an approved provenance-checked build exists on both endpoints, while local PostgreSQL WAL/base creation continues independently.
- Hardened the undeployed host controller to require one canonical non-linked root/service-owned non-writable rsync executable under safe parent chains and an exact parsed version of 3.5.0 or newer before metrics, staging, locks, repository access, or Borg. Hardened the fixed guest wrapper to validate root-owned rsync/rrsync files and parent chains, require the same version and the upstream `--confine-root` integration, and clear inherited environment state before the read-only restricted exporter runs.
- Added static and Linux runtime assertions for the executable, version, confinement, ordering, and cleared-environment boundaries, including explicit malformed and pre-3.5 failure with zero transfer or Borg calls. Production packages, scripts, services, timers, repository, archives, database, checkout, and loyalty value remain unchanged; package provenance, dual-endpoint compatibility/rollback canary, deployment, and isolated restore remain open.
- Adversarial review rejected a substring-only confinement test and unbounded numeric version parsing. The final guest gate requires the exact upstream confinement and inode-pinning statements, and both version parsers bound and explicitly decimalize each component. Linux fixtures additionally reject symlinked, group-writable, unsafe-parent, oversized-version, and malformed-version candidates before transfer or Borg. A first base64-over-SSH parser diagnostic produced invalid input and falsely reported the host side from pipeline status; it was discarded. Normalized source streamed directly to `bash -n` passed independently on the Debian host and Ubuntu guest without installing or writing the candidate.
- Local `npm run check`, migration/pgTAP-file validation, secret scan, zero-vulnerability production audit, and licence inventory passed. Exact implementation head `fa7b4fccc908ba9944780893c40751aa008caaa6` passed CI run `33142071508`, Security run `33142071515`, and external CodeQL with all eleven PR checks green; the Linux baseline executed every new runtime rejection fixture. PR #57 remained draft and merge-clean.

## 2026-08-28 — Dedicated PostgreSQL recovery repository

- Measured the live whole-VM sequence rather than treating a shared-lock timeout as the root fix. QEMU 102 held the repository for 22 minutes 20 seconds, QEMU 940 for 18 minutes 47 seconds, and the external lock remained held for 1 hour 45 minutes 13 seconds. The first post-release PostgreSQL retry still hit Borg's remote lock; the next success established a 1 hour 50 minute 39 second archive gap. A per-guest yield cannot guarantee the five-minute PostgreSQL recovery target.
- Inspected the live retention controller and found `--keep-hourly 48` pruned 399 three-minute archives to hourly representatives. A successful archive cadence therefore did not prove a five-minute recoverable point after maintenance.
- Accepted ADR-0071 after comparing bounded shared failure, per-guest yielding, a dedicated repository, and immediate provider replacement. The candidate requires repository inequality, uses an isolated lock/cache/security state, stages before locking, bounds local and Borg waits, retains every archive for 48 hours, then prunes daily/monthly and compacts.
- Extended deployment validation with exact architecture assertions plus Linux mock execution for successful dedicated routing, missing configuration, selector/ID/lock reuse, actual-ID mismatch, lock contention, repository-check failure, prune, interval listing, and compact. Adversarial refutation added canonical actual repository-ID binding, destructive-retention check ordering, and systemd conflicts after showing selector aliases and the legacy prune timer could otherwise preserve the defect. A second refutation showed unbounded maintenance could recreate the recovery gap inside the new repository; the final candidate requires a fresh archive before maintenance, caps local waiting at 10 seconds, each Borg operation at 15 seconds, and the expanded unit at 105 seconds plus safe interruption. The first remote harness transport retained Windows CRLF and failed before candidate logic; normalized exact bytes passed every scenario. First exact-head Linux CI then rejected a stale trace assertion that omitted the new `--max-duration` argument; the assertion now binds that deadline explicitly. The old shared archives remain mandatory transition evidence.
- Closed the repository-level visibility gap with nine bounded node_exporter textfile gauges, including per-cycle transferred bytes and transfer amplification, four exact alerts, and two recovery panels. Maintenance now measures canonical post-prune archive names and fails before compaction on malformed, duplicate, future, missing, or greater-than-300-second recent intervals. The first draft made metrics storage a precondition to archive creation; adversarial review rejected that coupling. The corrected job still creates a valid archive when telemetry storage is unavailable, then leaves the unit non-passing because evidence publication failed. An isolated Linux exact-byte probe passed successful archive/maintenance and over-bound interval failure without touching production.
- Enforced the previously documented owner-only Borg configuration boundary. After comparing direct path sourcing, immediate encrypted systemd credential migration, and open-once descriptor validation, both privileged jobs now reject relative, symlink, non-regular, differently owned, executable, or group/other-accessible configuration before any external action and source only the validated descriptor. Adversarial review found that descriptor validation alone still allowed a writable parent to replace the path with a blocking FIFO before open, so the final boundary also requires a canonical path inside a service-owned non-group/other-writable directory and only service/root-owned safe higher ancestors. A second pass removed locale-dependent English `stat` file-type comparisons so valid non-English Linux hosts do not fail. Static checks and Linux fixtures cover both archive and maintenance rejection paths; encrypted systemd credentials remain a compatible future provisioning improvement.
- Reconstructed the reported VM 971 transfer again from live PVE RRD, tap counters, guest counters, timers, journals, and a 330-second flow capture. The multi-terabyte path ran from 2026-08-13 20:00 UTC until 2026-08-14 08:00 UTC under the retired tar-over-stdin controller. The 2026-08-28 05:20 CEST incremental run received 399,762 rsync bytes, increased the tap by about 407 KB, finished in five seconds, and the capture peaked at 56 Kb/s; the 3.60 TB interface value remains cumulative until VM restart.
- Closed the rule-without-source transfer gap in the undeployed ADR-0071 controller. Each completed rsync stage now uses C-locale pure-digit statistics, accepts exactly one bounded changed/received pair, atomically publishes the two canonical amplification signals, and fails before repository identity or Borg create only when received bytes are strictly above both four times changed bytes and one GiB. Exact-boundary, dual-threshold, missing, and duplicate fixtures preserve the staged recovery set and reject false health without streaming production data.
- Exact implementation head `81e230962d2052ba5e38e4cf00aed744bd5246b5` passed CI run `33136287294` and Security run `33136287286`, including the Linux runtime fixtures, complete database/WooCommerce matrix, both images, supply-chain checks, CodeQL, and isolated DAST.
- Adversarial review then tightened the committed fixtures so every unsafe configuration, malformed transfer, and amplified-transfer case proves zero Borg invocations, including repository identity reads. Final backup-boundary implementation head `ccaa928b3cc3ae58ce5b1aaf6e260ec11f65758d` passed CI run `33140104569`, Security run `33140104565`, and external CodeQL with all eleven checks green.
- No production repository, key, configuration, script, service, timer, lock, archive, retention action, database, checkout path, or loyalty value changed. Approved provisioning, escrow, dry-run retention, manual/timer evidence, isolated restore, and old-archive preservation remain open.

## 2026-08-28 — Visible bounded PostgreSQL backup lock contention

- Rechecked VM 971 after the reported transfer pattern. Its 3.604 TB counter spans 14.68 days; the latest 24-hour RRD estimate is about 190 MiB total with a 104 KB/s maximum, and a direct ten-second sample added 1,013 bytes. The resolved tar-stream amplification has not returned.
- Found a separate fail-open evidence path: the nightly whole-VM Borg job held the shared repository lock while every three-minute PostgreSQL attempt logged contention and exited zero. The last real PostgreSQL archive remained 01:30:31 CEST even though systemd continued recording successful invocations.
- Accepted ADR-0070 after comparing silent retries, indefinite waits, bounded visible failure, and separate repository/controller ownership. The candidate waits at most 120 seconds, exits with status 75 without invoking rsync/Borg when contention persists, and lets the timer retry after deactivation.
- Extended deployment validation with exact lock semantics, rejection of the former non-blocking success branch, and Linux `bash -n` parsing for all three recovery scripts. A production-host parser accepted the normalized candidate without installation; the first diagnostic's CRLF transport false positive was explicitly refuted.
- Production scripts, units, locks, archives, database, checkout, and loyalty value remain unchanged. Approved contention, manual-success, timer-success, transfer, WAL, and health evidence is required before rollout closes.

## 2026-08-28 — M04–M14 shared canary-envelope hardening

- Reconstructed all eleven module closeout manifests and found that M09 alone enforced an exact bounded parent envelope; the other ten semantic validators could still admit unreviewed parent and nested fields.
- Added one registered schema catalogue for the exact manifest, production, candidate, public-baseline, score, category, check, artifact, and automatic-failure shapes across rewards, VIP, referrals, campaigns, notifications, storefront, analytics, ecosystem, migration, enterprise identity, and managed billing.
- Wired the shared boundary into every previously shape-light module validator while preserving each module's existing sensitive-evidence inspection and semantic artifact checks. The root check now runs fourteen independent corruption cases for every module: nine unknown-field locations, an unknown schema, a future timestamp, oversized evidence, a cyclic structure, and an invalid task graph.
- Adversarial refutation found that the first integration invoked each existing sensitive-evidence inspector twice. The duplicate legacy calls were removed, retaining one bounded shared traversal plus one module-specific sensitive scan per validator.
- All eleven focused validators and the 154-fixture cross-module harness pass. Scores, pending production controls, deployment state, checkout, and loyalty value are unchanged; this proves stricter evidence handling rather than module completion.

## 2026-08-28 — M09 manifest-boundary adversarial hardening

- Reconstructed the exact-green M09 candidate and confirmed the 88/100 score is blocked by production operability rather than a missing customer or merchant surface.
- Adversarial review found the semantic artifact schemas were strict while the parent YAML still admitted unreviewed root/nested fields and future-dated evidence, and its recursive evidence inspection lacked cycle and text-size bounds.
- Added exact manifest, current-production, candidate, public-baseline, score, category, check, artifact, and automatic-failure schemas; a five-minute future-time ceiling; cycle-safe traversal; a 4 KiB evidence-string ceiling; and explicit task-graph validation.
- Added deterministic corruption fixtures for each new boundary. The honest manifest still reports eight of 34 checks passed, 26 pending, and 88/100; no production state, release, store, checkout path, coupon, or loyalty value changed.

## 2026-08-28 — M01 read-only production evidence refresh

- Reconstructed the current public, release, VM, container, database, Auth-count, migration, PostgreSQL-backup, and whole-VM Borg baseline without reading reusable material or mutating production.
- Production runs v0.1.11 at `0ced4b666a55d836bd3d4927337fe057a71bb4ba`; public health/login and Authentik readiness pass; the workforce provider redirects correctly; both application containers run; all eleven Supabase containers are healthy; and every commerce/value aggregate remains zero.
- The current base-backup and incremental PostgreSQL Borg services last exited successfully. The latest successful nightly Proxmox Borg inventory contains archives for both VM 970 and 971, replacing the stale “first run pending” statement.
- Hardened the previously shape-light M01 validator with exact root/store/VM/public/aggregate/recovery/check schemas, canonical UTC and immutable-release identity, reconciled container accounting, approval and restore/check equivalence, bounded minimized text, obvious secret/identity rejection, complete-state health/recovery floors, and eleven deterministic corruption fixtures.
- Kept `application_auth_secret_restore` pending: an archive is not a restored service. The manifest remains one of 22 checks passed until an isolated application/Auth/Authentik/configuration/signing smoke, an approved real-store value/outage sequence, alerts, exact reconciliation, and approvals exist.
- Exact integration head `657cacab3c9e114307780135106a9963a30b22e4` passed CI `33127298348`, Security `33127298345`, and external CodeQL with all eleven checks green; draft PR #57 remained merge-clean and production remained unchanged.

## 2026-08-28 — Disabled-first tenant-federation credential boundary

- Read-only public and VM inspection proved that workforce SSO is already live through Supabase custom provider `custom:starfiniti-sso`, while production v0.1.11 correctly has no per-organization federation configuration, Authentik administration token, or Supabase service-role file.
- Found that the integrated candidate nevertheless required all three administration files on every dashboard deployment. That coupled unrelated modules to an external M13 fixture and expanded dormant ambient privilege.
- ADR-0069 now makes the files an optional all-or-none set. Empty paths use the established read-only `/dev/null` bind pattern; any partial set fails preflight; a complete set retains distinct absolute regular-file, owner-only, JSON, HTTPS-origin, UUID-selector, and secret-shape validation. Missing material still fails before a provider administration client can act.
- Adversarial review caught and corrected three false-safety paths before handoff: short bind syntax could create a directory for a mistyped secret path, whitespace-only quoted values disagreed with Compose's enabled-state semantics, and the first ADR number collided with the existing GA-canary decision. Long binds now set `create_host_path: false`, disabled means exactly empty or unset, asset validation binds each reference exactly once to the dashboard target, and the decision is uniquely ADR-0069.
- The deployment self-test proves disabled, partial, and complete states, and the exact candidate Compose validates with Docker Compose 2.40.3 on VM 970 without creating or modifying a container. Workforce SSO, Auth, production configuration, tenants, checkout, and loyalty value were unchanged.

## 2026-08-28 — M05 semantic production-evidence hardening

- Reproduced a false-proof path in the completion fixture: every verified VIP artifact closed with only `{ fixture: true, mutationCount: 0 }`, so digest integrity did not prove shadow parity, qualification, tier movement, benefits, overrides, expiry, reminders, rollback, or observation outcomes.
- Added nine exact minimized detail schemas with distinct release/recovery/baseline digests, unique per-check evidence digests, bounded member/benefit/points/grace/override ceilings, exact 36-case parity plus qualification/movement/benefit/expiry/progression scenarios, and zero-difference history/value/privacy/notification assertions.
- Approved pilot, rollout, qualification, lifecycle, benefit, override, expiry, reminder, and observation policies plus numeric limits bind approval to journal. Exact images/plugin/contracts bind release; VIP evidence and every scenario/work count bind journal to reconciliation and observation. Final approval binds release and every artifact under strict pre-canary, rollback-after-canary, and minimum 24-hour covering chronology.
- Added positive and adversarial fixtures for hollow/extra fields, impossible time, current-release/commit reuse, nonzero history/liability or benefit-rate drift, changed policy/ceiling/plugin/observation evidence, parity/expiry and count mismatch, artifact rebinding, late operator baseline/release/approval, early rollback, observation drift, and short observation. Production, VIP, expiry, checkout, customer value, and deployment remain unchanged.

## 2026-08-28 — M06 semantic production-evidence hardening

- Reproduced a false-proof path in the completion fixture: every verified referral artifact closed with only `{ fixture: true, mutationCount: 0 }`, so digest integrity did not prove attribution, cooling, fraud review, give/get value, refunds, recovery, privacy, rollback, or observation outcomes.
- Added nine exact minimized detail schemas with distinct release/recovery/baseline digests, unique per-check evidence digests, bounded customer/reward/points/cooling/retention ceilings, exact referral behavior/value/review/recovery scenarios, and zero-difference ledger/privacy/queue assertions.
- Approved pilot, rollout, value, attribution, cooling, fraud-review, retention, and observation policies plus numeric limits bind approval to journal. Exact images/plugin/contracts bind release; referral evidence and every scenario/work count bind journal to reconciliation and observation. Final approval binds release and every artifact under strict pre-canary, rollback-after-canary, and minimum 24-hour covering chronology.
- Added positive and adversarial fixtures for hollow/extra fields, impossible time, current-release reuse, nonzero reconciliation or self-referral value, changed policy/ceiling/plugin/observation evidence, attribution/refund and count mismatch, artifact rebinding, late operator baseline/release/approval, early rollback, observation drift, and short observation. Production, referrals, checkout, native coupons, customer value, and deployment remain unchanged.

## 2026-08-27 — M07 semantic production-evidence hardening

- Reproduced a false-proof path in the completion fixture: every verified campaign artifact closed with only `{ fixture: true, mutationCount: 0 }`, so digest integrity did not prove audience consistency, budgets, control assignment, campaign value, refunds, native rewards, rollback, or observation outcomes.
- Added nine exact minimized detail schemas with distinct release/recovery/baseline digests, unique per-check evidence digests, bounded audience/points/quantity/liability/member ceilings, exact behavior/concurrency/refund/native-reward scenarios, and zero-difference value/privacy/queue assertions.
- Approved pilot/control, rollout, value, control, schedule, and observation policies plus numeric limits bind approval to journal. Exact images/plugin/contracts bind release; campaign evidence and every exercise/work count bind journal to reconciliation and observation. Final approval binds release and every artifact under strict pre-canary, rollback-after-canary, and minimum 24-hour covering chronology.
- Added positive and adversarial fixtures for hollow/extra fields, impossible time, current-release or current-commit reuse, capacity/liability drift, changed policy/ceiling/plugin/observation evidence, audience/refund and count mismatch, artifact rebinding, late operator baseline/release/approval, early rollback, observation drift, and short observation. Production, campaigns, checkout, native coupons, customer value, and deployment remain unchanged.

## 2026-08-27 — M08 semantic production-evidence hardening

- Reproduced a false-proof path in the completion fixture: every verified notification artifact closed with only `{ fixture: true, mutationCount: 0 }`, so digest integrity did not prove consent, suppression, provider delivery, privacy, value/checkout continuity, rollback, or observation outcomes.
- Added nine exact minimized detail schemas with distinct release/recovery/baseline digests, unique per-check evidence digests, bounded provider ceilings and counts, exact SMTP/Klaviyo/webhook/consent/suppression scenarios, and zero-difference value/privacy/queue assertions.
- Approved pilot/control and provider policies plus numeric limits bind approval to journal. Exact images/contracts/adapters bind release; provider evidence and all exercise/work counts bind journal to reconciliation, and the observation subset binds to the same journal. Final approval binds release and every artifact under pre-canary, rollback-after-canary, and minimum 24-hour covering chronology.
- Added positive and adversarial fixtures for hollow/extra fields, impossible time, current-release or current-commit reuse, consent/ledger drift, changed policy/ceiling/adapter/observation evidence, consent/suppression and count mismatch, artifact rebinding, late operator baseline/release/approval, early rollback, observation drift, and short observation. Production, providers, contacts, checkout, customer value, and deployment remain unchanged.

## 2026-08-27 — M09 semantic production-evidence hardening

- Reproduced a false-proof path in the completion fixture: every verified storefront artifact closed with only `{ fixture: true, mutationCount: 0 }`, so digest integrity did not prove hosted or WooCommerce delivery, English scope, asset budgets, privacy, coupon/value continuity, rollback, or observation outcomes.
- Added nine exact minimized detail schemas with distinct release/recovery/baseline digests, unique per-check evidence digests, approved numeric snapshot/selector/Blocks budgets, every hosted/classic/Blocks/no-script/outage exercise, local snapshot rejection cases, native coupon continuity, bounded latency/load, and zero-difference value/privacy/queue assertions.
- Approved pilot/control scope, rollout, experience-contract, asset-budget, observation policy, and numeric limits bind approval to journal. Exact images/plugin/migrations/contracts bind release; hosted/public presentation, local snapshot, coupon, outage, privacy, accessibility, and surface/work evidence bind reconciliation and observation; final approval binds release and every artifact under pre-canary, rollback-after-canary, and minimum 24-hour covering chronology.
- Added positive and adversarial fixtures for hollow/extra fields, impossible time, current-release or current-commit reuse, ledger/coupon drift, non-English delivery, changed rollout/budget/plugin/observation policy, snapshot/count mismatch, artifact rebinding, late operator baseline/release/approval, early rollback, and short observation. Production, checkout, customer value, coupons, and deployment remain unchanged.

## 2026-08-27 — M10 semantic production-evidence hardening

- Reproduced a false-proof path in the completion fixture: every verified analytics artifact closed with only `{ fixture: true, mutationCount: 0 }`, so digest integrity did not prove metrics, snapshot, export, privacy, rollback, or observation outcomes.
- Added nine exact minimized detail schemas with distinct release/recovery/baseline digests, unique per-check evidence digests, all 103 Dictionary V4 definitions, four report totals on one snapshot, bounded export/download/schedule/work counts, explicit monetary-liability and causal labels, and zero-difference value/privacy assertions.
- Approved pilot/control scope, analytics policy, export-ceiling policy and numeric byte limit, and observation policy bind approval to journal. The exact Dictionary V4 digest binds release, journal, and reconciliation; snapshot/report/export/schedule-occurrence evidence binds reconciliation; policy and effect counts bind observation; final approval binds release and every artifact under pre-canary, rollback-after-canary, and minimum 24-hour covering chronology.
- Added positive and adversarial fixtures for hollow/extra fields, impossible time, current-release reuse, ledger drift, causal overclaim, changed export policy or numeric limit, changed observation policy or Dictionary V4, schedule-occurrence/snapshot/count mismatch, artifact rebinding, late operator baseline/release/approval, early rollback, observation drift, and short observation. Production, checkout, reports, customer value, and deployment remain unchanged.

## 2026-08-27 — M11 semantic production-evidence hardening

- Reproduced a false-proof path in the completion fixture: every verified ecosystem artifact closed with only `{ fixture: true, mutationCount: 0 }`, so path and digest integrity did not prove topology, identity, currency, API, webhook, value, rollback, or observation outcomes.
- Added nine exact minimized detail schemas with distinct release/recovery/baseline digests, unique per-check evidence digests, bounded counts and latency/capacity measurements, and zero-difference authority/value assertions.
- Approved pilot scope, rate policy, and value ceiling bind approval to canary journal. Distinct control scope, observed value totals, and every topology/identity/provider/credential/API/webhook lifecycle count bind journal to reconciliation; quota and outage counts bind observation. Final approval binds the release and every other artifact. Canonical UTC chronology requires release/recovery/baseline/approvals before canary, rollback after canary end, at least 24 hours of covering observation, and final approval after all evidence.
- Added positive and adversarial fixtures for hollow/extra fields, impossible manifest time, currency drift, changed approval scope, journal/reconciliation/observation count mismatch, artifact rebinding, late release/approval, early rollback, observation ledger drift, and short observation. Production, checkout, credentials, providers, customer value, and deployment remain unchanged.

## 2026-08-27 — M12 semantic production-evidence hardening

- Reproduced a false-proof path: replacing the verified migration read-only artifact's complete observations with `{}` and rebinding its exact SHA-256 digest still left all eleven current M12 controls passing.
- Replaced byte-authentication-only acceptance with nine exact minimized details schemas. Release, recovery, population/value baselines, bounded canary records, dry-run neutrality, correction, reconciliation, rollback, and observation are now machine-checked with unique source digests and zero-difference assertions.
- Final approval binds every other artifact and release. Approved export, mapping, and value-total digests bind approval to journal; applied record counts bind journal to reconciliation. Canonical UTC chronology requires approvals/release/recovery/baseline before canary, rollback after canary end, at least 24 hours of covering observation, and final approval after all evidence.
- Added adversarial fixtures for empty/extra fields, nonzero value reconciliation, different applied counts, approval rebinding, release-after-start, early rollback, late approval, and short observation while retaining a positive complete fixture. Production, source data, customer value, checkout, and deployment remain unchanged.

## 2026-08-27 — M13 semantic production-evidence hardening

- Reproduced a false-proof path: after replacing the verified read-only artifact's complete observations with `{}` and rebinding its exact SHA-256 digest, the M13 validator still reported the public, Authentik, and operator baselines passed.
- Replaced byte-authentication-only acceptance with nine exact minimized details schemas. Every check-bearing artifact requires uniquely digest-bound zero-difference assertions; release and recovery inputs cannot reuse one digest.
- Final approval now binds the exact digest of every other artifact and the release inventory. Canonical UTC checks and chronology require release, recovery, baseline, and prerequisite approvals before canary start; reconciliation and rollback after canary end; at least 24 hours of observation covering the canary; and final approval after all evidence.
- Added adversarial fixtures for empty details, nonzero reconciliation, different approval bindings, release-after-start chronology, late prerequisite approval, and short observation while retaining a positive complete fixture. Production, Authentik, Supabase, organization access, checkout, and loyalty value remain unchanged.

## 2026-08-27 — M14 semantic production-evidence hardening

- Reproduced a false-proof path: after replacing the verified read-only artifact's complete observations with `{}` and rebinding its exact SHA-256 digest, the M14 validator still reported both public baseline and operator access passed.
- Replaced byte-authentication-only acceptance with nine exact minimized details schemas. Canary, reconciliation, rollback, and observation artifacts must carry one uniquely digest-bound zero-difference assertion for every check they support; release and recovery inputs cannot reuse one digest.
- Final approval now binds the exact digest of every other artifact. Canonical UTC checks and chronology require release, recovery, and baseline before canary start; reconciliation and rollback after canary end; at least 24 hours of observation covering the canary; and final approval after all evidence.
- Added adversarial fixtures for empty details, nonzero reconciliation, different approval bindings, release-after-start chronology, and a short observation while retaining a positive complete fixture. Production, Stripe, deployment mode, checkout, and loyalty value remain unchanged.

## 2026-08-27 — M14 digest-bound managed-billing closeout hardening

- Adversarially reviewed the 48-check billing gate and found no production artifacts, mutable automatic-failure prose, no explicit non-canary isolation, and incomplete corruption coverage despite Stripe lifecycle, usage, invoice, manual-contract, protected-path, and outage risk.
- Replaced it with a 49-check gate retaining every self-hosted no-call, sandbox, catalogue, subscription, usage, correction, invoice, policy, contract, protected-path, outage, rollback, observation, and reconciliation boundary while adding explicit non-canary isolation.
- Added nine unique path- and SHA-256-bound minimized JSON artifacts, descriptor-first bounded reads, exact candidate/check coverage, provider-specific sensitive-key/value/card rejection, sixteen fixed automatic failures, five completed prerequisite slices plus nested S05 slices, task/score synchronization, five synchronized approvals, and an attainable positive fixture.
- Corruption fixtures reject approval drift, missing/duplicate/forward-looking checks, score drift, short commits, sensitive provider material, weakened rules, missing/unsafe/reused/digest-drifted artifacts, unsafe public baselines, incomplete slices, prose-only closure, and category-floor bypass. The final review also caught a prefix-correct but otherwise invalid full candidate SHA; Git and both GitHub runs now agree on the exact 40-character commit before artifact hashing.
- Integrated candidate `9bea3d4` passed CI `33105154521` and Security `33105155321`; a fresh read-only artifact confirms canonical public/Auth/REST behavior and running application/Supabase VMs without mutation.
- The honest M14 score remains 90/100, with 13 controls passed and 36 pending. Operability is 3/10 and blocks completion until approved release/Stripe/catalogue/policy inputs, recovery, disabled isolated deployment, lifecycle/usage/invoice canary, exact reconciliation, rollback, and observation pass.

## 2026-08-27 — M13 digest-bound enterprise identity closeout hardening

- Adversarially reviewed the 50-check identity gate and found no production artifacts, mutable failure prose, unsynchronized approvals, no explicit non-canary isolation, and incomplete corruption coverage despite high-risk federation, SCIM, support, recovery, and deletion operations.
- Replaced it with a 51-check gate retaining every organization, federation, egress, rebinding, OIDC, SAML, SCIM, deprovisioning, stale-session, agency, support, AAL2 recovery, export, offboarding, deletion, outage, rollback, observation, and final reconciliation boundary while adding explicit non-canary isolation.
- Added nine unique path- and SHA-256-bound minimized JSON artifacts, descriptor-first bounded reads, exact candidate/check coverage, forbidden sensitive keys/values, seventeen fixed automatic failures, five completed prerequisite slices, task/score synchronization, four synchronized approvals, and an attainable positive fixture.
- Corruption fixtures reject approval drift, missing/duplicate/forward-looking checks, scores, short commits, sensitive material, weakened rules, missing/unsafe/reused/digest-drifted artifacts, unsafe public baselines, incomplete slices, prose-only closure, and category-floor bypass.
- Integrated candidate `0ae43ea` passed CI `33104114747` and Security `33104114894`; fresh read-only Loyalty, Supabase, Authentik, DNS, and Proxmox probes passed without mutation.
- The honest M13 score remains 90/100, with 12 controls passed and 39 pending. Operability is 3/10 and blocks completion until approved release/fixture inputs, recovery, disabled deployment, sequential identity/administration canaries, reconciliation, rollback, and observation pass.

## 2026-08-27 — M12 digest-bound migration closeout hardening

- Adversarially reviewed the 34-check migration gate and found no production artifacts, mutable failure prose, key-only sensitive scanning, unsynchronized approval booleans, stale operator evidence, and only false-completion/sensitive-key tests despite irreversible-value risk.
- Replaced it with a 36-check gate adding explicit canary approval and non-canary isolation while retaining every source, fingerprint, dry-run, mapping, batch, rerun, count, balance, expiry, liability, traceability, release, correction, outage, rollback, observation, and final reconciliation boundary.
- Added nine unique path- and SHA-256-bound minimized JSON artifacts, descriptor-first bounded reads, exact candidate/check coverage, forbidden sensitive keys/values, thirteen fixed automatic failures, five completed prerequisite slices, task/score synchronization, four synchronized approvals, and an attainable positive fixture.
- Corruption fixtures reject approval drift, missing/duplicate/forward-looking checks, score drift, short commits, sensitive material, weakened rules, missing/unsafe/reused/digest-drifted artifacts, unsafe public baselines, incomplete slices, prose-only closure, and category-floor bypass.
- Integrated candidate `16753b2` passed CI `33102977731` and Security `33102977636`; a fresh read-only artifact records public/Auth/REST availability and running application/Supabase VMs without mutation.
- The honest M12 score remains 90/100, with 11 controls passed and 25 pending. Operability is 3/10 and blocks completion until approved release/source/batch inputs, recovery, disabled deployment, exact reconciliation, rollback, and observation pass.

## 2026-08-27 — M11 digest-bound ecosystem closeout hardening

- Adversarially reviewed the 41-check ecosystem gate and found no production artifacts, mutable failure prose, only two approvals, key-only sensitive scanning, and narrow false-completion/sensitive-key tests despite broad topology, identity, currency, API, webhook, and client functionality.
- Replaced it with a 44-check gate adding explicit pilot/canary approvals and non-canary isolation while retaining every topology, connector, link, rate, order/refund, service account, replay, quota, client, webhook, outage, latency, rollback, observation, and final reconciliation boundary.
- Added nine unique path- and SHA-256-bound minimized JSON artifacts, descriptor-first bounded reads, exact candidate/check coverage, forbidden sensitive keys/values, sixteen fixed automatic failures, five completed prerequisite slices, task/score synchronization, four approval booleans, and an attainable positive fixture.
- Corruption fixtures reject approval drift, missing/duplicate/forward-looking checks, scores, short commits, sensitive material, weakened rules, missing/unsafe/reused/digest-drifted artifacts, unsafe public baselines, incomplete slices, prose-only closure, and category-floor bypass.
- Exact integrated candidate `f171770` passed CI `33101922228` and Security `33101922223`; the read-only artifact records only public/Auth/REST availability and running application/Supabase VMs without mutation.
- The honest M11 score remains 90/100, with 11 controls passed and 33 pending. Operability is 3/10 and blocks completion until approved release/pilot/provider inputs, recovery, disabled deployment, sequential canaries, exact reconciliation, rollback, and observation pass.

## 2026-08-27 — M10 digest-bound analytics closeout hardening

- Adversarially reviewed the legacy M10 closeout and found no production artifacts, mutable automatic-failure prose, only two approvals, key-only sensitive scanning, stale operator evidence, and a narrow false-completion test.
- Replaced it with a 32-check gate covering immutable value truth, commerce, programme outcomes, cohorts, causal limits, shared snapshots, legacy shadowing, exports, subject/session one-use downloads, schedules, reporting-worker isolation, latency/load, reconciliation, rollback, observation, and final zero-difference closure.
- Added four synchronized approvals, nine unique path- and SHA-256-bound minimized JSON artifacts, bounded descriptor-first reads, exact candidate and check coverage, forbidden sensitive keys/values, sixteen fixed automatic failures, five completed prerequisite slices, task/score synchronization, and an attainable positive fixture.
- Corruption fixtures reject approval drift, missing/duplicate/forward-looking checks, score drift, short commits, sensitive material, weakened rules, missing/unsafe/reused/digest-drifted artifacts, unsafe public baselines, incomplete slices, prose-only closure, and category-floor bypass.
- Exact integrated candidate `b760cec` passed CI `33101099338` and Security `33101099291`; the read-only baseline records only public/Auth/REST availability and running application/Supabase VMs without production mutation.
- The honest M10 score remains 90/100, with 11 controls passed and 21 pending. Operability is 3/10 and blocks completion until approved release/pilot inputs, recovery, disabled deployment, bounded canaries, exact reconciliation, rollback, and observation pass.

## 2026-08-27 — M09 digest-bound storefront closeout hardening

- Adversarially reviewed the legacy M09 closeout and found that it had no production artifacts, only one false-completion self-test, two loosely checked approvals, key-only secret scanning, mutable automatic-failure prose, stale operator status, and no binding between a passed production claim and exact evidence.
- Replaced it with a 34-check gate covering the complete hosted, merchant, WooCommerce snapshot, classic, Blocks, no-script, native coupon, Hub-outage, worker-outage, non-canary isolation, privacy, reconciliation, rollback, observation, and final zero-difference boundary.
- Added four synchronized approvals, nine unique path- and SHA-256-bound minimized JSON artifacts, bounded descriptor-first reads, exact candidate and check coverage, forbidden sensitive keys and values, fixed-ID/fixed-text automatic failures, five completed prerequisite slices, task/score synchronization, and an attainable positive fixture.
- Corruption fixtures reject pending completion, approval drift, missing/duplicate/forward-looking checks, short commits, changed scores, sensitive material, weakened failures, missing/unsafe/reused/digest-drifted artifacts, unsafe public baselines, incomplete slices, prose-only closure, and category-floor bypass.
- Exact integrated candidate `c989229` passed CI `33100009132` and Security `33100009100`; the refreshed read-only artifact records public/Auth/REST availability and running application/Supabase VMs without production mutation.
- The honest M09 score remains 88/100, with 8 controls passed and 26 pending. Operability is 4/10 and blocks completion until an approved release, real WooCommerce pilot, fresh recovery point, disabled deployment, hosted/local/outage canaries, exact reconciliation, rollback, and observation pass.

## 2026-08-27 — M08 fail-closed notification canary gate

- Reconstructed M08 after the provider-neutral event/consent, SMTP, Klaviyo, signed webhook, and merchant template/health slices and confirmed S06 still lacked a machine-enforced production closeout.
- Added a 53-check manifest covering exact candidate evidence, PostgreSQL authority, consent and trusted suppression, isolated provider adapters, immutable templates, delivery health, approved disabled rollout, local and external provider canaries, withdrawal, replay, scheduling, bounded retries, ambiguity review, outage isolation, value and checkout continuity, cross-tenant denial, four reconciliation domains, rollback, observation, and final zero-difference closure.
- Bound production claims to nine unique minimized JSON artifacts for the read-only baseline, release inventory, approvals, recovery point, notification baseline, canary journal, reconciliation, rollback, and observation. Verified files must be safely opened as bounded regular files, SHA-256 exact, candidate-commit bound, check-coverage exact, and free of sensitive provider, contact, payload, coupon, and ledger material.
- Added four synchronized approval flags, exact seven-category arithmetic, a 90/100 target, an 80% floor per category, sixteen fixed automatic failures, negative corruption fixtures, and a positive completion fixture. The gate is wired into `npm run check`.
- Read-only evidence confirms canonical dashboard DNS, HTTP 200 health/login, HTTP 401 unsigned WooCommerce ingress, and running application/Supabase VMs through the approved Proxmox route. No service, provider profile, credential, endpoint, deployment, production contact, checkout path, or loyalty value changed.
- The honest provisional M08 score is 90/100, with 15 checks passed and 38 pending. Operability is 3/10 and blocks completion until an approved release and pilot, provider credentials, fresh recovery point, disabled deployment, bounded SMTP/Klaviyo/webhook canaries, exact reconciliation, rollback, observation, and final scoring pass.

## 2026-08-27 — M07 fail-closed campaign canary gate

- Reconstructed M07 after its five repository slices and seven release-hardening ADRs and confirmed S06 still lacked a machine-enforced production closeout.
- Added a 51-check manifest covering exact candidate evidence, Supabase/PostgreSQL authority, allowlisted statement-consistent audiences, liability preview, approval/control assignment, IANA/DST schedules, lifecycle, all seven behavior families, capacity/member caps, native fixed discounts, cumulative refunds, source-change concurrency, deterministic/manual-review versus transient retry, published selector compatibility, cross-tenant denial, four reconciliation domains, rollback, observation, and final zero-difference closure.
- Bound production claims to nine exact evidence artifacts for the read-only baseline, release inventory, approvals, recovery point, production value baseline, canary journal, reconciliation, rollback, and observation. Verified artifacts must be unique, minimized JSON files under the M07 evidence root, safely opened as bounded regular files, SHA-256 exact, candidate-commit bound, and check-coverage exact.
- Added four synchronized approval flags, exact seven-category arithmetic, a 90/100 target, an 80% floor per category, sixteen fixed-ID and fixed-text automatic failures, sensitive-evidence scanning, negative corruption fixtures, and a positive completion fixture. The gate is wired into `npm run check`.
- Fresh read-only evidence confirms canonical dashboard DNS, HTTP 200 health/login, HTTP 401 unsigned WooCommerce ingress, and running application/Supabase VMs through the approved Proxmox route. No service, deployment, schedule, campaign state, checkout path, production data, or loyalty value changed.
- The honest provisional M07 score is 90/100, with 14 checks passed and 37 pending. Operability is 3/10 and blocks completion until an approved release and pilot store, fresh recovery point, disabled deployment, Starfiniti-only canary, exact reconciliation, rollback, observation, and final scoring pass.

## 2026-08-27 — M06 fail-closed referral canary gate

- Reconstructed M06 after its five repository slices and confirmed S06 still relied on prose evidence despite implemented attribution, qualification, value, review, recovery, and experience boundaries.
- Added a 48-check manifest covering exact candidate evidence, Supabase/PostgreSQL authority, opaque advocate sharing, first attribution, window boundaries, self-referral, duplicate identity and velocity risk, paid/minimum/new-customer qualification, cooling, pre/post-value refunds, atomic give-get value, fraud approval/rejection, bounded recovery, customer/merchant experience, cross-tenant denial, four reconciliation domains, rollback, observation, and final zero-difference closure.
- Bound production claims to nine exact evidence artifacts for the read-only baseline, release inventory, approvals, recovery point, production value baseline, canary journal, reconciliation, rollback, and observation. Verified artifacts must be unique, minimized JSON files under the M06 evidence root, safely opened as bounded regular files, SHA-256 exact, candidate-commit bound, and check-coverage exact.
- Added four synchronized approval flags, exact seven-category arithmetic, a 90/100 target, an 80% floor per category, sixteen fixed-ID and fixed-text automatic failures, sensitive-evidence scanning, negative corruption fixtures, and a positive completion fixture. The gate is wired into `npm run check`.
- Fresh read-only evidence confirms canonical dashboard DNS, HTTP 200 health/login, HTTP 401 unsigned WooCommerce ingress, and running application/Supabase VMs through the approved Proxmox route. No service, configuration, deployment, production data, checkout path, referral state, or loyalty value changed.
- The honest provisional M06 score is 90/100, with 14 checks passed and 34 pending. Operability is 3/10 and blocks completion until an approved release and pilot store, fresh recovery point, disabled deployment, Starfiniti-only canary, exact reconciliation, rollback, observation, and final scoring pass.

## 2026-08-27 — M05 fail-closed advanced VIP canary gate

- Reconstructed M05 after its 36-case Rose/Bloom/Icon shadow proof and confirmed S06 still relied on prose evidence while later modules had machine-enforced canary and score contracts.
- Added a 48-check manifest covering exact candidate and shadow evidence, Supabase/PostgreSQL authority, lifetime/rolling/calendar qualification, AND/OR metrics, event-time lifecycle, refunds and delayed facts, benefits, overrides, earned-date expiry, reminders, restoration, progress, cross-tenant denial, four reconciliation domains, disabled-state continuity, rollback, observation, and final zero-difference closure.
- Bound production claims to nine exact evidence artifacts for the read-only baseline, release inventory, approvals, recovery point, production value baseline, canary journal, reconciliation, rollback, and observation. Verified artifacts must be unique, minimized JSON files under the M05 evidence root, safely opened as bounded regular files, SHA-256 exact, candidate-commit bound, and check-coverage exact.
- Added four synchronized approval flags, exact seven-category arithmetic, a 90/100 target, an 80% floor per category, sixteen fixed-ID and fixed-text automatic failures, sensitive-evidence scanning, negative corruption fixtures, and a positive completion fixture. The gate is wired into `npm run check`.
- Replaced digest-only completion semantics with exact schemas for all nine artifacts, approved policy/ceiling and released-component binding, 36-case shadow plus qualification/movement/benefit/expiry/progression reconciliation, zero-difference assertions, canonical chronology, rollback after canary end, and a covering observation of at least 24 hours. Integrated candidate `4d04ed7` passed CI `33122704264` and Security `33122704267` with all eleven checks green.
- Fresh read-only evidence confirms canonical dashboard DNS, HTTP 200 health/login, HTTP 401 unsigned WooCommerce ingress, and running application/Supabase VMs through the approved Proxmox route. No service, configuration, deployment, production data, checkout path, or loyalty value changed.
- The honest provisional M05 score is 90/100, with 13 checks passed and 35 pending. Operability is 3/10 and blocks completion until an approved release and pilot store, fresh recovery point, disabled deployment, Starfiniti-only canary, exact reconciliation, rollback, observation, and final scoring pass.

## 2026-08-27 — M04 fail-closed reward canary gate

- Reconstructed M04 after its browser/accessibility closeout and confirmed S04 still relied on prose evidence while M09–M14 had machine-enforced canary and score contracts.
- Added a 48-check manifest covering exact candidate/release evidence, Supabase/PostgreSQL authority, native and manual reward outcomes, WooCommerce capability preflight, restrictions and capacity, historical compatibility, ambiguity recovery, connector/worker outage checkout, cross-tenant denial, four reconciliation domains, accepted-work continuity, rollback, observation, and final zero-difference closure.
- Added four synchronized approval flags, exact seven-category arithmetic, a 90/100 target, an 80% floor per category, sixteen fixed-ID and fixed-text automatic failures, and evidence scanning that rejects sensitive keys, reusable authority material, email-like values, JWTs, and raw UUIDs.
- Bound production claims to nine exact evidence artifacts for the read-only baseline, release inventory, approvals, recovery point, production value baseline, canary journal, reconciliation, rollback, and observation. Verified artifacts must be unique, minimized JSON files under the M04 evidence root, safely opened as bounded regular files, SHA-256 exact, candidate-commit bound, and check-coverage exact.
- Wired the validator and corruption self-tests into `npm run check`. False completion, approval/check drift, pending or duplicate checks, short commits, unsafe or reused artifact bindings, digest drift, missing production artifacts, unsafe public baselines, task-score drift, incomplete prerequisite slices, and category-floor failure are rejected; a synthetic positive fixture proves the gate can close when every invariant is satisfied.
- Adversarial reproduction proved a digest-valid artifact containing only fixture markers could satisfy completion. The validator now requires exact semantic schemas for every artifact; approved policy/ceiling and released-component binding; native, manual, restriction, capacity, recovery, outage, tenancy, privacy, failure, and retry evidence/count reconciliation; zero value/queue/privacy differences; a non-production candidate; canonical chronology; rollback after canary end; and a covering observation of at least 24 hours. Positive and corruption fixtures prove the hardened boundary closes and fails deterministically.
- Fresh public/read-only evidence confirms canonical dashboard DNS, HTTP 200 health/login with no-store/private caching, HTTP 401 unsigned WooCommerce ingress, and running application/Supabase VMs through the approved Proxmox route. No service, configuration, deployment, production data, checkout path, or loyalty value changed.
- The honest provisional M04 score is 90/100, with 13 checks passed and 35 pending. Operability is 3/10 and blocks completion until an approved release and pilot store, fresh recovery point, disabled deployment, Starfiniti-only canary, exact reconciliation, rollback, observation, and final scoring pass.

## 2026-08-27 — Stacked delivery-chain reconciliation

- Reconstructed every open roadmap PR from #29 through #56 against its live GitHub base. The only non-external blockers were historical backup-repair ancestry conflicts in M04–M07 and a constraint-invalid stale timestamp fixture in M13 tenant federation.
- M04 PR #29 now contains current `main` and the incremental-backup repair without losing reward evidence; exact head `30fb2f9` passed all seven jobs in CI run `33073236099` and reports `CLEAN`.
- M05 PR #30 and M06 PR #31 carry the same repair with one unique R-001–R-036 register and both module histories preserved. Exact heads `48c8784` and `f16d6b2` passed all seven jobs in runs `33074423308` and `33075109579` and report `CLEAN`.
- M07 PR #32 already contained the repaired product tree, so the reconciliation added only the missing parent relationship. Exact head `847f16e` passed all seven jobs in run `33075499745` and reports `CLEAN`.
- M13 federation PR #42 now backdates both `created_at` and `updated_at` under the guarded fixture trigger, preserving table constraints while proving stale recovery. Exact head `56e854a` passed all seven jobs in run `33073430984` and reports `CLEAN`; dependent PR #43 remains clean.
- A final GitHub audit found every open roadmap PR from #29 through #56 merge-clean with zero failed or pending checks. No PR was merged, no draft was promoted, and no deployment, tenant flag, provider, production data, checkout path, or loyalty value changed; every real-store, canary, reconciliation, exercise, elapsed-cadence, and approval gate remains explicit.

## 2026-08-27 — M16 evidence-bound continuous improvement

- Accepted ADR-0068 after comparing informal owner review, ticket/dependency automation, event-driven-only review, and fixed cadence plus event escalation with immutable evidence. Official Supabase, PostgreSQL, WooCommerce, Stripe, Authentik, Klaviyo, and Node.js change sources form the review catalogue.
- Added a canonical UTC operating contract: calendar-month reviews close within ten days, calendar-quarter exercises within thirty days, and initial close requires two distinct consecutive months plus one complete quarterly bundle. Missing or stale sources remain unknown rather than healthy zero.
- Added fourteen monthly sections, exact provider impact/disposition review, material-change module rescoring with retained history, a second-occurrence durable-control requirement, and experiment promotion only after primary-metric improvement with every guardrail passing.
- Added a machine-ranked backlog. Severity, merchant impact, customer impact, confidence, effort, and dependency penalty recompute into exact descending order; the initial eight items preserve all known real-store, monitoring, recovery, penetration, GA, Stripe, enterprise-IdP, and notification external gates.
- Added five quarterly exercises for full-service restore, tenant isolation, privacy, SCIM deprovisioning, and incident response. Every exercise requires separate digest evidence and zero unexplained protected-value, tenancy, privacy, recovery, checkout, or data-loss difference.
- Added a 39-check fail-closed manifest and validator with five distinct minimized artifacts, score/category floors, independent review, and five approval roles. Its positive fixture proves the gate can close; adversarial cases reject missing cadence, stale sources, missing providers, unrescored changes, recurring failures without controls, unsafe experiment promotion, exercise differences, low module scores, reused artifacts, missing approvals, and incomplete prerequisite modules.
- Adversarial review additionally bound every review/exercise to exact governance and backlog digests, constrained quarterly closeout to thirty days, required current accepted-risk evidence for incomplete Critical/High work, added source and exercise approval/environment/input digests, and made the final approval bind the other four artifacts plus future schedules.
- Implementation candidate `c84e836` includes the external-CodeQL-driven open-first descriptor repair. Its inherited local gate passes `npm run check` with 950 workspace tests, every repository and canary validator, both builds, and WooCommerce contract checks. All 81 migrations and 68 pgTAP files validate; secret scan, zero-vulnerability production audit, licences, formatting, lint, and diff checks pass.
- Documentation head `d61139d` passed CI run `33071077688` with all seven jobs, Security run `33071077786` with all three jobs, and external CodeQL. Repository evidence honestly records seven passed controls, 32 pending elapsed-cadence/live/approval gates, and a provisional 77/100 with performance and operability below their floors. No review schedule, owner identity, provider upgrade, experiment, exercise, deployment, production mutation, checkout path, or loyalty value changed.
- Final implementation/evidence head `88a9ef0` passed CI run `33071504559`, Security run `33071504623`, and external CodeQL with all eleven checks green; draft PR #56 is merge-clean. The elapsed monthly, quarterly, live-source, reconciliation, review, and approval gates remain unchanged and open.

## 2026-08-27 — M15 evidence-bound GA canary and claims

- Accepted ADR-0067 after comparing calendar uptime, broad rollout/support-volume observation, score substitution, and pre-evidence marketing claims with a one-pilot evidence-bound canary. Primary Google SRE and NIST SSDF guidance informs exact-release canarying, evaluation, rollback, audit trail, and provenance.
- Added a canonical one-pilot, immutable-release GA plan: at least 720 consecutive UTC hours, thirty complete daily intervals, restart on material release/configuration/value/entitlement/monitoring drift, eleven daily and fifteen final zero-difference fields, six approval roles, five exact artifacts, and deterministic automatic failures.
- Added thirteen default-non-publishable product claims mapped to exact evidence. Shopify stays deferred, English stays the only active language, and store credit, gift cards, cash redemption, and cash-like stored value stay excluded.
- Added the GA runbook for prerequisite closure, daily observations, disabled-first exposure, outage and rollback proof, full cross-module reconciliation, claims review, M15 and whole-product score/category floors, independent review, owner approval, and M16 handoff.
- Added a 50-check fail-closed manifest and validator. Its positive fixture proves completion is attainable; adversarial cases reject pending completion, a short or missing day, material drift, nonzero ledger differences, open High findings, category-floor failure, non-publishable claims, unsafe/reused artifacts, incomplete modules, and missing approvals.
- Bound the manifest to implementation candidate `900ffbc`. Documentation head `6b57148` passed all seven jobs in CI run `33068012282`, all three jobs in Security run `33068012381`, and the external CodeQL policy check.
- Repository evidence honestly records five passed controls, 45 pending live/module/approval gates, and a provisional M15 score of 77/100 with performance and operability below their floors. No release, deployment, tenant enablement, public claim, approval, checkout path, or loyalty value changed.

## 2026-08-27 — M15 bounded observability and incident evidence

- Reconstructed production read-only: Prometheus, Alertmanager, Grafana, Loki, Promtail, and node-exporter units are inactive; VM 971's approximately 3.60 TB transmit value is cumulative incident history, while the latest twelve one-minute samples peak below 7 KB/s. Monitoring absence and cumulative counters are now explicit evidence states rather than health conclusions.
- Accepted ADR-0066 after comparing immediate host installation, external uptime-only monitoring, identifying tenant labels, and a canonical vendor-neutral contract with environment-owned deployment. No unapproved service or receiver was installed on the memory-constrained Proxmox host.
- Added twenty-four aggregate signals and twenty-three exact alerts across edge, application, workers, PostgreSQL, backups, host, security evidence, exercise evidence, and the monitoring plane. Ledger, tenancy, privacy, checkout, WAL-RPO, security, and ambiguous-value alerts page immediately through billing-independent routes; an absent-or-below-complete series-ratio alert prevents missing telemetry from appearing healthy.
- Added an exact Prometheus rule projection, a four-class routing policy with independent page destinations and last-known-good reload behavior, and a locked source-provisioned Grafana operations dashboard with no tenant selector. Receiver destinations, credentials, and named owners remain outside Git.
- Made the contained full-stream incident a permanent dual-threshold guard: more than four-times changed-byte amplification and more than one GiB transferred. OPS-008 distinguishes current rate from cumulative counters and forbids production database streaming as an alert test.
- Replaced the one-paragraph incident guidance with seventeen alert-linked runbooks, SEV0–SEV2 severity, monotonic detected-to-closed states, acknowledgement/escalation/handoff and communication rules, restricted-evidence boundaries, integrity-first closure, and a durable postmortem template.
- Added a 34-check manifest and validator. Local `npm run check` passed 950 workspace tests, every repository/canary/security/recovery/operations validator, WooCommerce checks, and both production builds; migration validation sees all 81 migrations and 68 pgTAP files, the production audit has zero vulnerabilities, and licence/secret checks pass.
- Draft PR #54 is clean. CI run `33065803812` passed all seven jobs and Security run `33065803818` passed CodeQL, exact image policy/SBOMs, repository scanning, and isolated DAST at exact documentation head `05c0c20` containing implementation candidate `c2a6fd5`; external CodeQL policy also passed. Thirteen repository/reality/CI controls pass and 21 approved environment, live source/rule/dashboard/route, dead-man, owner roster, two independent exercises, zero-difference reconciliation, regression, and approval checks remain pending. Production monitoring, checkout, and loyalty value are unchanged.

## 2026-08-27 — M15 deployable security, SBOM, provenance, and isolated DAST

- Accepted ADR-0064 after comparing one repository-wide dependency result, exact deployable-image scans with a separately retained development advisory, hosted production DAST, and bounded internal disposable DAST. Production images are the release boundary; R-032 stays open and still blocks the module.
- Added a separate three-job Security workflow: CodeQL `security-extended`; Trivy repository secret/misconfiguration and exact dashboard/worker vulnerability/secret/misconfiguration/licence scans; Syft CycloneDX image SBOMs; and ZAP 2.17.0 active testing on an internal Docker network with no published port or external route.
- Rechecked the full development audit when WordPress published `@wordpress/env` 11.14.0. The exact upgrade removes vulnerable `extract-zip`, installs patched `adm-zip` 0.6.0, and changes the complete npm audit from two High findings to zero. The Security workflow now runs that full audit, while the exact-head four-cell Linux WooCommerce matrix remains the final R-032 compatibility proof.
- Extended tagged releases to record exact pushed image digests, generate and checksum both SBOMs, attest all four release files, attest both registry image digests, and publish the SBOMs beside the WooCommerce package. Every action and the ZAP image uses an immutable reviewed input.
- Added a 25-check fail-closed manifest and validator. It binds exact workflow/plan digests, enforces the six-job DAST sequence and bounds, rejects sensitive evidence/false completion/task drift/public targets, and requires fresh exact-head scans, tagged-release verification, approved non-destructive production review, independent penetration test plus retest, zero Critical/High findings, R-032 resolution, and named owner approval.
- Local workflow and security validation pass with six repository controls proven and 19 execution/external checks pending. No production scan, external dynamic target, provider credential, customer data, or loyalty-value mutation was used.

## 2026-08-27 — M15 disposable fault control and retry bounds

- Accepted ADR-0063 after comparing ad hoc Compose/network commands, a standing in-cluster chaos daemon, and a short-lived local controller on an approved disposable host. The local controller avoids permanent Docker/orchestrator authority and still requires independent value reconciliation.
- Added one canonical plan for worker `SIGKILL`, database crash/restart, database-path latency, exact duplicate HTTP delivery, provider proxy disablement, and a bounded provider-outage trigger burst. Every scenario runs readiness and native-checkout probes, carries explicit duration/recovery/rate/count/concurrency/response limits, and restores applied faults in `finally`.
- Bound execution to a clean commit, owner-only short approval, separate sandbox marker, raw control/marker/Compose digests, aggregate fixture-set digest, a `starfiniti-chaos-*` Compose project, exact disposable/non-production container labels, and loopback-only public/Toxiproxy origins. The controller has no arbitrary-command, remote-shell, global proxy-reset, or production Compose path.
- Added a 27-check fail-closed manifest. Completion requires two exact environment runs, verified proxy routing and monitoring, worker interruption on both sides of commit, PostgreSQL crash/WAL integrity, bounded retries/queues, checkout independence, immutable ledger/idempotency/coupon/no-loss evidence, operator alerts, and zero-difference final reconciliation.
- The self-test exercises all six adapters, deterministic and ambiguous-outcome restoration/recovery, exact fixed-arrival replay counts/drops/statuses, report minimization, production-origin/unsafe-Compose rejection, missing-scenario rejection, and closeout report corruption. Exact implementation-head GitHub Actions run `33049635069` at `adf6d9d` passed all seven jobs. Six repository controls pass and 21 external checks remain pending; no production or disposable-environment fault has run.

## 2026-08-27 — M15 declared capacity and fixed-arrival evidence

- Accepted ADR-0062 after comparing ad hoc closed-loop requests, database-only `pgbench`, and a domain-aware fixed-arrival HTTP driver. The initial driver remains repository-owned for exact current signatures and contracts; publication also requires a mature independent-driver cross-check.
- Added concurrent readiness, authenticated customer-account, scoped Service API customer, and signed WooCommerce order scenarios across warmup, sustained, two-times burst, and recovery phases. Each scenario has exact rate, minimum sample, concurrency, timeout, response-size, status, response-contract, latency, error, and schedule-lag bounds.
- Bound every real run to a clean full commit and a short-lived approval containing exact origin/workload digests, rate, duration, and target class. Authority is read only from separate owner files; known production origins reject mutation; aggregate output omits URLs, paths, bodies, headers, selectors, customer data, credentials, cookies, tokens, and signatures.
- Added a 22-check fail-closed manifest and validator. Completion requires exact environment/data/monitoring evidence, healthy driver, sustained/burst/recovery results, wallet and event-to-ledger SLOs, request/ledger/WooCommerce reconciliation, repeatability, an independent driver, the first failed higher boundary, exact-head CI, and explicit claim approval.
- The adversarial pass repaired phase-local request identities that would have turned later phases into duplicates, rejected status-only success by validating response contracts, added 500-request measured minima and a two-million-request ceiling, removed unbounded maximum calculations, bound the approval to the driver commit, and made a dirty worktree fail.
- Local format, lint, the evidence corruption matrix, and two in-process driver outcomes pass. Exact implementation-head GitHub Actions run `33046822172` at `10b0728` passed all seven jobs. Six repository checks pass and 16 externally measured/approval checks remain pending; no capacity number is published and no production load or mutation has run.

## 2026-08-27 — M14 fail-closed canary gate

- Added the exact-schema 48-check M14 manifest and validator to the root repository gate. Completion requires exact release/commit evidence, five explicit approvals, all checks passing, a 90/100 module score, at least 80% of every category, completed prerequisite task state, and no deterministic automatic failure.
- Covered recovery, disabled deployment, runtime self-hosted no-call evidence, one-tenant enablement, owner-only Checkout/Portal, verified webhook replay/disorder, official test-clock lifecycle, immutable source-fact usage/correction, bounded asynchronous provider convergence, invoice reconciliation, commercial recovery, protected paths, provider/worker outage, rollback, observation, and final reconciliation.
- Added evidence scanning for secret-bearing keys, personal data, reusable credentials, and raw Stripe resource patterns. Self-tests corrupt approvals, checks, score arithmetic, commit identity, public access, prerequisites, category floors, and evidence to prove false completion is rejected.
- Revalidated the canonical public baseline without authentication or mutation: dashboard health and login return 200, Supabase Auth and REST without a key return 401, and DNS resolves. Production remains globally `self_hosted` with no Stripe configuration or request.
- Thirteen checks pass and 35 remain pending. The provisional module score is 90/100, but operability is 3/10 and below its mandatory 8/10 floor; approved release, sandbox/catalogue/policy inputs, recovery point, deployment, lifecycle/usage/invoice canaries, reconciliation, rollback, observation, and owner approval remain mandatory.
- Exact implementation-head run `33044421620` at `b02fabee5ad1cd236e65a0b19a1a9675bf4d6c22` passed all seven jobs: 950 workspace tests, both images, 81 migrations, all 68 pgTAP files with 3,701 assertions, all 22 concurrency probes, and all four WooCommerce runtime cells.

## 2026-08-27 — M14 managed-billing merchant closeout

- Completed the Billing recovery experience across unconfigured, grace, restricted, cancelled, active, and manual-contract authority. Every state now explains who can act, what action is available, and which balances, history, operations, exports, reconciliation, checkout, and promised rewards remain protected.
- Bound Checkout, Portal, plan selection, and manual-contract presentation to the minimized database-authoritative projection. Manual contracts no longer imply self-serve provider authority, zero-plan configurations fail honestly to an operator dependency, non-owners receive owner-directed guidance, and browser redirects remain navigation only.
- Added semantic operational-continuity navigation, exact friendly restriction reasons, responsive 4→2→1 layout, 40/44 px controls, route metadata, and the existing Starfiniti application icon.
- Adversarial production-browser review repaired contradictory controls/copy and a skip-link pointer collision over the mobile menu. The final 1440×1000, 720×700, 390×844, and 320×900 light/dark reduced-motion matrix passed landmarks, keyboard/drawer focus, Escape restoration, reflow, overflow, exact bigint usage, diagnostics, and measured 4.5:1-or-better contrast.
- Local `npm run check` passed 950 workspace tests and the 32-route production build. Exact implementation-head run `33043411759` at `f7a4def55ae5d4cd646ac6cad26004992f498d2b` passed all seven jobs: 81 migrations, all 68 pgTAP files with 3,701 assertions, all 22 concurrency probes, both images, and all four WooCommerce runtime cells. M14-S05 is repository-complete; S06 canary and closeout is active with production unchanged.

## 2026-08-27 — M14 table-bound managed growth enforcement

- Accepted ADR-0061 after comparing a global entitlement substitution, explicit command calls, UI-only denial, and table-bound guards. A private immutable inventory now covers 23 reviewed mutable growth/configuration roots while protected value, commerce, customer access, export, organization-access, correction, and checkout roots remain structurally absent.
- Kept product entitlement and commercial policy independent. Existing commands and contract validators continue to decide each product capability; the ordered guard checks only tenant-canary `managed.billing`, so mixed immutable V1/V2 history and established deterministic errors remain compatible.
- Self-hosted installations and managed tenants without the billing canary retain their prior product behavior. Trial, active, grace, and effective contract-managed states allow new configuration; unconfigured, suspended, and cancelled states deny it without hiding immutable history or restricting safe lifecycle reduction.
- Database-role privilege is resolved before request metadata. Operator/worker lifecycle and recovery paths cannot be commercialized by stale JWT claims, `loyalty_runtime` remains policy-evaluated behind its private actor-validating functions, and ordinary subjectless roles fail closed.
- Added the twenty-second two-session database probe. Concurrent exact authoring creates one effect; the exact historical retry remains readable after restriction; changed growth is denied; active recovery reopens configuration; and the loyalty ledger remains unchanged.
- Linux run `33040086022` found a PL/pgSQL record-name parse error. Run `33040384316` then exposed overbroad activation and validation-order masking. Run `33040993138` exposed invalid structural-test syntax, duplicated product authority, and request-claim privilege confusion. Run `33041269073` isolated the remaining subjectless `loyalty_runtime` compatibility case. All were repaired at the authority boundary rather than waived.
- Exact implementation-head run `33041473615` at `100c164361a9a9c5fed026b92592f4df70d44546` passed all seven jobs: 945 workspace tests, both production images, a clean 81-migration replay, all 68 pgTAP files with 3,701 assertions, all 22 concurrency probes, and all four WooCommerce runtime cells. S05B is repository-complete; S05C merchant experience and closeout is active with production unchanged.

## 2026-08-27 — M14 deterministic commercial-policy core

- Accepted ADR-0060 after comparing live provider authorization with effective-dated local evidence. PostgreSQL deterministically combines deployment, immutable provider occurrence, append-only delinquency policy, and approved manual-contract evidence without changing the general entitlement resolver.
- Added strict minimized `BillingSummaryV2` while retaining V1 compatibility, plus a separate private growth/configuration authorization helper that always preserves protected value paths and returns locally in `self_hosted`.
- Added append-only, RLS-private policy and contract versions with separate actor/approver, bounded reason and interval, exact idempotency, semantic convergence across caller keys, and conflicting same-instant failure independent of lock acquisition order.
- Bound past-due grace to policy effective and already recorded at provider occurrence time. Explicit stored grace wins; later-observed backdated policy cannot retroactively alter an old provider event. Manual `allow_growth` wins only while effective, and `defer_to_provider` explicitly ends the override.
- The billing experience now explains authority source, restriction cause, grace deadline, and contract term while keeping balances, usage, history, protected-operation guidance, and private provider evidence separated.
- Adversarial review repaired one status-copy selector regression, same-instant authority nondeterminism, retroactive policy selection, a pgTAP role-context mistake, an invalid entitlement fixture, and a concurrency probe interval crossing prior append-only deployment history.
- Production-rendered Chromium passed restricted/grace/contract states at desktop/mobile in light/dark with reduced motion, exact bigint display, responsive card reflow, current navigation, drawer focus restoration, zero overflow, and zero real diagnostics.
- Exact implementation-head run `33038559023` at `877f7e91de2d3eb4c047f0ff5edaa74877045d52` passed all seven jobs: 945 workspace tests, both images, 80 migrations, all 67 pgTAP files with 3,658 assertions, all 21 concurrency probes, and all four WooCommerce runtime cells. S05A is repository-complete; S05B explicit command enforcement is active with production unchanged.

## 2026-08-27 — M14 immutable source-fact usage metering

- Accepted ADR-0059 after comparing mutable daily/monthly aggregates with immutable source facts. PostgreSQL remains authoritative; Stripe is an asynchronous managed-only sink with bounded duplicate enforcement, while corrections append signed compensating facts.
- Added exact UTC source identities for first-ingested orders, ledger-active members, delivered SMTP/Klaviyo events, and accepted Service API commands. Private RLS evidence retains UUID/digest attribution without copying commerce IDs, contacts, payloads, provider responses, prices, or secrets.
- Added append-only meter configuration, permanent per-fact provider identifiers, bounded database leases, authorization-time deployment/entitlement/account/meter/provider/time rechecks, minimized attempt evidence, ambiguity holds, and a twentieth two-session concurrency probe. Self-hosted capture returns before source scans and provider construction.
- Added a separate regular-file restricted-key Stripe meter-event adapter with fixed origin, pinned API version, POST-only/no-redirect requests, exact signed integer quantities, 32 KiB response bounds, duplicate acceptance, and no logging of authority. Usage processing remains isolated from checkout and every loyalty-value path.
- Added a strict live-member UTC usage summary and responsive Billing panel with four exact decimal-string metrics, shadow/configured state, pending and attention health, large-integer-safe formatting, and independently degradable reads.
- The first Linux database gate exposed one PL/pgSQL output-name conflict plus two intentional global exposed-function allowlists; all were tightened without changing grants. The next gate passed all 57 focused pgTAP assertions and exposed a concurrency-fixture error where an exact retry generated two timestamps; the probe now reuses one immutable instant.
- The third Linux database gate passed all 3,589 pgTAP assertions, then reproduced two claimers racing across the fact and its derived provider-identifier constraints. Dispatch creation now treats either immutable identity conflict as the same row before the fenced lease query, rather than surfacing a harmless unique violation.
- Production-rendered Chromium review at 1440×1000 and 390×844 in light and dark themes passed four-to-one card reflow, exact 64-bit totals, pending/reconciliation visibility, current navigation, mobile drawer focus and Escape restoration, zero horizontal overflow, and zero browser diagnostics. The review raised the usage badge and meter labels from 11 to 12 pixels before a clean rerun.
- The final adversarial diff review found that capture could backfill activity from before managed-billing activation, a correction timestamp could drift into another UTC billing month, a policy hold could be reclaimed immediately, the Hub could show `configured` while tenant entitlement or provider configuration was disabled, and a correction could reach a new meter without its original positive event. Capture now proves source-time eligibility with real pre/post-activation commerce events; corrections remain in-period and reuse only an accepted original dispatch's meter/account; policy holds cool for five minutes; and the public mode uses the same managed entitlement/provider gates as claims. The executable source-time test also exposed and removed a dormant PL/pgSQL conflict-target ambiguity.
- Exact implementation-head run `33036216639` at `c7f72ec4d18a7b8595bbdbf4689e436b1949617d` passed all seven jobs: 939 workspace tests, both production images, 79 migrations, all 66 pgTAP files with 3,595 assertions, all 20 concurrency probes, and all four WooCommerce runtime cells. S04 is repository-complete; S05 delinquency and manual-contract policy is active without production mutation.

## 2026-08-27 — M14 database-reserved Checkout and Portal sessions

- Accepted ADR-0058 after comparing browser/provider session creation, a broad Stripe SDK, and a narrow server-owned REST adapter. PostgreSQL reserves and reauthorizes each operation; verified webhooks remain the only commercial lifecycle authority.
- Added strict public plan/session contracts, immutable private provider configuration and plan versions, serialized per-tenant customer provisioning, stable customer/session idempotency keys, minimized attempt evidence, historical Price retention, and recoverable ambiguous/held states with zero loyalty ledger effects.
- Added a regular-file secret/restricted-key boundary plus fixed HTTPS origin, pinned Stripe API version, POST-only methods, no redirects, bounded time/body, official redirect validation, and no persisted provider response, return, contact, payment, card, or secret material.
- Added owner-only managed plan and Portal actions to the existing Hub Billing experience. Production-rendered desktop/mobile review passed owner, read-only, and unavailable states; responsive reflow; drawer focus restoration; English-only output; zero overflow; and zero diagnostics.
- The first database gate found that raising after a hold update rolled the update back. Authorization now commits the recoverable hold and returns no provider authority; a server regression proves the Stripe key and client remain untouched. Three metadata/fixture assertions were corrected without relaxing production grants or behavior.
- Exact-head run `33030547427` at `d72166ae778f1a381926ceb7e4b5c09f942ddf77` passed all seven jobs: root checks with 925 tests, both production images, a clean 78-migration replay, all 65 pgTAP files with 3,532 assertions, all 19 concurrency probes, and all four WooCommerce runtimes. Production/global `self_hosted` mode remain unchanged; M14-S04 shadow usage metering is active.

## 2026-08-27 — M14 verified Stripe inbox and isolated normalization

- Accepted ADR-0057 after comparing synchronous processing, raw-event persistence, a minimized durable inbox, and a full provider client. Exact bounded bytes are verified in memory; only a digest-bound allowlisted projection is retained and lifecycle processing is independently leased.
- Added a managed-only route that asks PostgreSQL for the deployment/entitlement gate before reading the request body or mounted secret. It verifies Stripe's HMAC-SHA256 format, multiple `v1` rotation signatures, five-minute tolerance, strict JSON/lifecycle shape, and a 256 KiB ceiling without logging or storing raw provider material.
- Added immutable receipt and attempt evidence, a private mutable job lease, exact provider-event replay fencing, entitlement checks at intake/claim/effect, invoice-observation semantics, capped lease recovery, and an isolated `billing` worker with no Stripe credential, API client, or network behavior.
- Added 16 focused dashboard cases, three worker cases, 67 pgTAP assertions, and an eighteenth two-session concurrency probe. Local contracts, route/worker tests, all workspace typechecks, worker build, static 77-migration/64-pgTAP validation, CI workflow validation, and deployment asset self-tests pass.
- Added a disabled Compose profile and optional regular-file secret mount plus managed billing API/operations documentation. Production and global `self_hosted` mode remain unchanged; no provider endpoint, credential, Price, checkout, portal, usage, payment, or loyalty value is live.
- Exact-head run `33024281886` at `5b7ff26` passed all seven jobs: root checks, both production images, a clean 77-migration replay, all 64 pgTAP files with 3,477 assertions, all 18 concurrency probes, and all four WooCommerce runtimes. The final probe proved exact event races converge, changed replays fail one caller closed, competing workers lease distinct receipts, and no loyalty ledger value changes.

## 2026-08-27 — M14 billing authority and self-hosted independence

- Accepted ADR-0056: managed commercial state is an append-only normalized PostgreSQL mirror, while database entitlements and protected loyalty paths remain authoritative. Live Stripe reads and a mutable latest-subscription row were rejected because provider outage, disorder, or a late event must not become product authorization.
- Added strict `BillingSummaryV1`, private account/state evidence, a live-membership minimized projection, deterministic event-time ordering, provider-customer and provider-event replay fencing independent from caller idempotency keys, and a structural return before provider construction in self-hosted mode.
- Added the real English Billing & plan route to the existing merchant shell. It explains deployment, commercial state, new-configuration availability, the six permanent safeguards, and disabled provider controls without exposing fake checkout or portal actions.
- Added 61 focused pgTAP assertions and a seventeenth two-session concurrency probe for grants, RLS, claims, revocation, exact/changed request, provider-customer and event replay, delayed evidence, immutability, tenant isolation, and zero ledger effects. Targeted lint, workspace tests/typechecks, client, workflow, entitlement, architecture, accessibility, and static database gates pass locally.
- Exact-head run `33020484560` at `68479f1` passed all seven jobs: root checks, both production images, a clean 76-migration replay, all 63 pgTAP files with 3,410 assertions, all 17 concurrency probes, and all four WooCommerce runtimes. The final probe proved exact provider-account and provider-event races converge, changed event races fail one caller closed, and no loyalty ledger value changes.
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
