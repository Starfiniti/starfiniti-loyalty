# Execution Plan

ADR-0124 is the temporary active merge-governance exception. The owner chose
solo repository operation because the public repository has one administrator
and no eligible second reviewer. Pull requests still remain mandatory, but
their approval count is zero until `2026-12-01T05:59:20Z`, owner revocation, or
the addition of a second eligible collaborator. The twelve exact app-bound
checks, strict current-base evaluation, signed commits, conversation resolution,
administrator enforcement, and force-push/deletion blocks remain unchanged.
Every candidate still needs an adversarial diff review and explicit owner merge
decision; neither is labelled independent. Release stays manually disabled and
its preflight now requires the newest run for every required app/check pair to
pass plus a 24-hour cooling-off period after the newest exact-head check. Merge
the exact-head-green PR #58 stack sequentially, then reconcile merged `main`;
do not deploy production or inflate any module score from these merges.

ADR-0120 is the current repository-safe M15 operations slice. It adds a
semantic guest-versus-uplink rate guard for the exact VM 971 failure shape that
the existing instrumented backup-cycle metrics cannot see. Keep its systemd
collector and timer disabled in production until an approved monitoring host,
private operator-owned sysfs mappings, synthetic threshold/absence exercise,
receiver routes, dead-man path, rollback window, and independent observation
are available. The immediate repository gate is 34 bounded signals, 29 exact
Prometheus alerts, 14 locked dashboard panels, digest-bound collector assets,
static adversarial cases, and the Linux runtime fixture. Cumulative totals are
evidence, never rates; no interface or VM identity may enter metrics. This
slice changes no production state, R-004/R-049 status, or score.
The recurrence gate must preserve this distinction as the rules evolve:
already-merged R-004 control revisions validate at their recorded merge commit,
while the new semantic collector/rules remain current candidate bytes until a
reviewed merge. Never rewrite V1 history to make a new working-tree digest fit.

The M15 capacity self-test now separates loopback adapter correctness from a
real driver-performance claim. Its sub-second local harness uses a bounded
250 ms event-loop ceiling and safe decision-only failure diagnostics; the
canonical 25 ms threshold, workload rates, production-like evidence gate, and
independent k6 cross-check remain unchanged. No capacity or production claim is
promoted by a stable self-test.

The latest bounded production observation is retained as append-only M15
evidence. VM 971's current tap and RRD rates remain quiet, five consecutive
PostgreSQL archives met the current 300-second cadence objective, public
readiness passed, and the whole-VM timer remained disabled. The machine-readable
successor binds the prior containment digest and makes traffic arithmetic,
archive chronology, timer safety, remaining gates, and false authority part of
the operations regression gate. This is freshness evidence only: it does not
change the active repository slice, close R-004, or authorize production
mutation, timer re-enablement, release, or deployment.

ADR-0119 is the active repository-safe M16 slice. It preserves the accepted V1
recovery registry by exact digest and adds a generalized V2 record for both
R-004 and the repeated R-065 GitHub Actions policy failure. The immediate gate
is deterministic: preserve all five occurrence anchors, require the exact
thirteen selected action patterns and full-SHA policy with both broad trust
switches false, retain the successful third attempt without upgrading failed
attempts to completion, and reject exhaustive future composite-dependency
claims. PR #58 is merged as verified commit `63418ee`; the preflight and three
validators remain candidate controls until PR #59 passes exact-head checks,
adversarial solo review, and merge under ADR-0124. No independent review,
release, or production authority is introduced and all product scores remain
unchanged.

ADR-0118 is the active correction to ADR-0117's M15 repository-security slice.
GitHub Actions is restricted to thirteen exact allowed patterns: nine direct
references plus four newly required SHA-pinned Trivy composite patterns exposed
by two fail-closed job-setup attempts and exact pinned source. Implicit
GitHub-owned and verified-creator trust stays disabled, and full-SHA references
remain mandatory. Dependency alerts and
unpaused security updates, secret scanning and push protection, and private
vulnerability reporting are live. The two historical secret detections were
synthetic Stripe-format test fixtures and are resolved as `used_in_tests`; all
three repository alert classes now have zero open items. The disabled release
preflight must revalidate the exact action policy, repository security features,
zero alerts, exact twelve branch checks, signed/last-push policy, and both
distinct tag rulesets before release. This does not remove the independent
reviewer, environment, expanded read-only token, tag, security/licence, or
approval gates.

Because the solo slice also changes `.github/workflows/release.yml`, M15 Security
again returned to 7/27 until fresh evidence existed. Exact candidate
`b97dde21de81660b7c182e5b2653fb1617863750` passed CI `33598916504`, Security
`33598916554`, and external CodeQL `100148436020`; exact image, SBOM, DAST,
freshness, WooCommerce, and digest-bound Medium-review reconciliation restore
19/27. The earlier `4ac7414` and `fec7f86` results remain historical and are not
relabelled.

The repository-side release boundary remains fail-closed. Protected `main`
requires all twelve exact checks, verified signatures, pull requests, resolved
conversations, and administrator enforcement; force pushes and deletion are
blocked. Two active version-tag rulesets separate audited signed creation from
no-bypass immutability. ADR-0124 temporarily replaces the impossible approval
requirement with bounded solo authority and an exact rollback payload. Keep
Release disabled while the protected release environment, policy token, signed
exact tag, security/licence closure, and owner release approval remain open.

The earlier `2026-09-01T09:09:45Z` read-only audit is retained as immutable
precondition evidence rather than rewritten. Its successor
`release-policy-hardening-2026-09-01.yaml` records the exact policy mutation and
rollback endpoints. The next successor,
`repository-security-hardening-2026-09-01.yaml`, binds the external security
settings, minimized alert triage, and rollback. `npm run
release-policy:audit:validate` must validate all three states and continue
rejecting publication or production overclaim.

Production containment on 2026-09-01 disabled only the scheduled whole-host raw
Borg timer after proving it still shared the authoritative PostgreSQL archive
lock and repository. The apparent 200–249 MB/s VM 971 burst is historical RRD
evidence from 2026-08-14, not a current five-minute transfer: the latest day
peaks at 107 KB/s and the post-containment database cycle received 576,022
bytes before creating `loyalty-postgres-20260901T092222Z`. Existing whole-host
and PostgreSQL archives remain intact. Keep the raw whole-host timer disabled
until ADR-0071's dedicated PostgreSQL repository and monitored restore boundary
pass; do not trade the five-minute database RPO for an unsupervised raw VM run.

PR #57 merged reviewed head `149724a3a2fad89d1a7990e0c3114be2754ecab6`
into `main` as `c85d93d0e6e0273543078050e697f04309f11d93` on 2026-09-01.
Post-merge CI `33475350770` and Security `33475350801` passed on that
commit. ADR-0116 therefore makes exact merged `main` the unchanged 83/100
candidate subject and advances the R-004 validator, monitor contract, and
runbook to merged status. Production remains `v0.1.11` at 54/100, Release
workflow `333373957` remains manually disabled, and no tag, release,
deployment, provider, database, checkout, or loyalty-value mutation occurred.

ADR-0113 is the active safe M16 closeout-artifact hardening slice. The five
future monthly, quarterly, reconciliation, score, and approval V1 artifacts now
use exact nested key sets, bounded arrays and text, finite metrics, minimized
role slugs, stable unique identifiers, and machine-detectable personal,
credential, control-character, bidirectional-text, duplicate, and unknown-field
rejection. Full private inputs stay outside Git and future extension requires a
superseding schema and ADR. Thirty-seven completion mutations pass locally. This
creates no elapsed review, exercise, approval, production authority, or score
change; M16 remains 77/100 with 32 checks pending.

The active safe M16 slice is a generated final owner-gate handoff. The existing
ranked improvement backlog remains authoritative; `docs/plan/OWNER_GATES.md`
renders all fourteen entries into one priority queue with exact owner action,
dependency, evidence state, and passing boundary. `npm run
owner-gates:validate` must reject score/order drift, missing or duplicate gates,
unsafe or non-canonical evidence paths, common reusable credential forms,
Markdown injection,
false completion, and edited generated output. This slice changes no product
score or production state and grants no merge, release, deployment, reboot,
exercise, canary, tenant, ledger, database, billing, or GA authority.

ADR-0112 is the active safe M15 observability-deployment slice. It turns the
existing 34-signal/29-alert contract into a production-disabled deployment
candidate: Prometheus 3.14.0, Alertmanager 0.34.0, Grafana 13.2.0,
blackbox_exporter 0.28.0, and postgres_exporter 0.20.1 are bound to exact OCI
indexes in an isolated hardened Compose plane, while node_exporter 1.12.1 is a
separate non-root textfile-only native agent. Target files, receivers, Grafana
administrator material, and PostgreSQL exporter modules remain environment
owned. A clean Linux amd64 Security-job canary must prove native configuration,
exact versions, loopback administration, unpublished exporters, and zero
residue. Repository validation passes 9/16 deployment checks; exact-head Linux,
approved-host, live-target, receiver, dead-man, activation, and observation
evidence remain pending. The broader M15 operations gate remains 14/35,
production has no monitoring plane, and product/module scores do not change.
Because this slice changed the Security workflow and exact checkout semantics,
the older exact-head scanner, image, SBOM, DAST, header, freshness, Medium-
triage, development-audit, and WooCommerce evidence became historical only.
Fresh candidate `4ac7414` now has exact green CI/Security/CodeQL and
digest-bound artifact reconciliation, so M15 Security is again 19/27 without
relabeling prior runs.

An active read-only production incident review on 2026-08-31 confirmed the old
VM 971 full-tree transfer loop was not running: the guest sent only 13,508 bytes
over twenty seconds and its local WAL source remained current. A distinct
one-time whole-VM raw migration nevertheless held the shared Borg lock from
12:35 CEST. The PostgreSQL off-site unit waited from 12:36:50 under a
repository-unbound 14,400-second lock wait/five-hour service deadline, while the
last archive had completed at 12:33:41. The five-minute off-site objective was
breached again and no deployed metrics could page. The migration later exited
successfully and the waiting service created a new incremental archive at
14:08:17 CEST, but the exact completed-archive gap was 1 hour 34 minutes 36
seconds. A bounded 19:01 CEST follow-up found six consecutive real archives
from 18:42:58 through 18:59:48 at 199–211-second intervals; the newest was 110
seconds old, the whole-VM service was inactive, and VM 971's one-hour RRD
maximum was only 9,753 bytes/s. A 19:22 CEST freshness check then found three
real archives in ten minutes without contention, a waiting timer, an inactive
whole-VM service, and a 9,761 bytes/s one-hour maximum. M15 operations now uses
that bounded observation instead of its 27 August traffic snapshot. Current
cadence has recovered, but the accepted
ADR-0071 dedicated repository/controller remains the correct repair. Neither
automatic catch-up nor this observation closes R-004, M15 recovery/operations,
or GA; it adds no rsync provenance, custody, rollout, retention, restore,
monitoring, or approval evidence. No production process or loyalty value was
changed.

ADR-0111's V1 recovery register remains immutable evidence. It records the
2026-08-28 and 2026-08-31 shared Borg-lock starvation incidents as two distinct
chronological anchors under one Critical R-004 fingerprint and SHA-256 binds
ADR-0071, the dedicated controller, backup-assets validator, archive-RPO
monitor, and OPS-007. ADR-0116 advances those three controls to `merged`, while
activation and observation evidence remain null. ADR-0119's V2 register now
supersedes only the schema and adds the R-065 recurrence without rewriting V1.
This is durable repository prevention work, not production closure: M16 stays
77/100, the candidate stays 83/100, production stays 54/100, and elapsed
monthly, provisioning, monitoring, continuity, retention, restore, review, and
approval gates remain open.

ADR-0110 is the active safe M13/M15/M16 identity-runtime slice. It preserves
ADR-0109's exact Authentik 2026.8.0 source/OpenAPI result and adds a fourteen-
scenario executable rehearsal with digest-pinned Authentik, PostgreSQL, and
Node Linux/amd64 manifests. One internal-only Docker network has no
published port, Docker socket, production route, or real credential. A
short-lived read-only operator bundles the production federation client and
exercises disabled OIDC/SAML reconciliation, exact source-only flows,
idempotent rotation, hidden authorization-code/hashed-subject provider, strict
Supabase callback, OpenID discovery, and the real Authentik SCIM worker against
a bounded bearer-protected synthetic sink. SCIM service-provider discovery,
pagination, external IDs, membership, quoted removal, deactivation, evidence
minimization, and teardown are deterministic gates. The offline plan and bundle
self-tests pass locally; the existing Security recovery job runs the exact
candidate and retains only the minimized report. This still does not test a real
enterprise IdP, current private configuration/outposts, Starfiniti database
authorization, recovery, rollback, or production. M13 remains 12/51, M16 stays
77/100, the candidate 83/100, and production 54/100 and unchanged. Merge,
release, upgrade, approval, deployment, observation, and reconciliation remain
false or pending.
Security run `33379515023` proved that Authentik 2026.8's `ak scim_sync`
management command raises `ResultMissing` after scheduling its asynchronous
task. Exact implementation `c94cc9e2181079ac80524fc3d9c9496ad6d0d6a6`
instead discovers the provider-owned schedule and triggers the supported
permissioned `/send/` API after application association; container shell and
management-command paths remain forbidden. Reviewed artifact head
`74a37e930cda44e4eedb550bd4a6237da03c75c5` passed CI `33384160196`,
Security `33384160199`, and external CodeQL `99463328597`; all twelve PR checks
are green and PR #57 is clean and mergeable. Recovery job `99454991777`
completed all fourteen synthetic runtime scenarios. Artifact `9754193837`
binds the exact candidate commit, 14/14 result, minimized report SHA-256
`df528a9de5d0b7f99c1d833f6fdbf7c542c252b0ba9a4580ef5da7441803b84c`,
and archive digest
`sha256:36c024a8ec3e41c9538bc6d6d8b959324e295abd21c1927635841417015e9772`.
Fresh CodeQL, repository, image, SBOM, DAST, header, scanner-freshness, and
WooCommerce evidence advances M15 Security to 19/27 passed and eight pending.
A new digest-bound review reconciles 29 reciprocal-licence occurrences to 15
exact dispositions with zero false positives; 14 third-party dispositions stay
release-blocking under R-056.

ADR-0109 is the preceding source-contract slice. It pins the exact Authentik
2026.5.6 baseline and 2026.8.0 candidate tag objects, commits, OpenAPI schemas,
release source and asset, GHCR linux/amd64 manifest, and eight protocol source
files. All 27 administration operations and 248 sent request-field occurrences
across 18 schemas remain supported—240 exactly and eight through compatible
widenings/additions. Exact implementation
`5b9419acdfe0e4cd84db81d258ed3692b88ed85c` passed CI `33368245319`, Security
`33368245722`, and external CodeQL `99413667343`; all 12 PR checks were green.

ADR-0108 is the active safe M16 installed-runtime slice. A clean exact-commit,
bounded public capture proves that the served Authentik login runtime is exact
`2026.5.6` across one version family and three independently retrieved static
assets; live and ready health both returned HTTP 200. The 3,257-byte artifact
has SHA-256
`4e89321c09f46bb4b3cd7e2690eed54110c9e516c0537d88b2c4424b141b5cb0`
and retains no page bodies, headers, cookies, addresses, credentials, or private
configuration. Official policy places it at the latest patch of the supported
prior feature line, so V2 changes only Authentik from High unknown to Medium
supported-prior-line. The exact V1 register remains immutable; the effective
V2 digest is
`3b8372a74aee6128b947e43c3ff3beba34029434b197c4340dff0d9cb3f6dfc3`
with two Critical, four High, four Medium, and three Low entries. Image/outpost
inventory, private configuration/signing recovery, `2026.8` compatibility,
identity canaries, recovery, independent review, every approval, and production
authority remain false. M16 stays 77/100, the candidate 83/100, and production
54/100 and unchanged.
Exact implementation and evidence head
`de8e19f00252faf4c4170d0cdad354206213fd96` passed CI `33363302645`,
Security `33363302635`, and external CodeQL check `99399102937`; all twelve PR
checks are green and PR #57 is clean and mergeable. This authorizes no merge,
release, provider upgrade, deployment, or production mutation.

ADR-0107 is the preceding M16 reconstructability slice. One cutoff-bound
register now composes the immutable thirteen-source and six-provider installed
snapshots, classifies every canonical provider/platform/recovery entry, assigns
an engineering disposition, and records provider-specific rollback. The
canonical decision set contains two Critical, five High, three Medium, and
three Low entries under SHA-256
`ee97ed58f003c8148a19b1e6afc5683bbc9c5b9652b6b43fc55dfd5647667645`.
The root-gated validator rejects forty-six source, snapshot, catalogue, pin,
candidate, evidence, task, ADR, and false-authority corruptions. Classification
does not accept any candidate: ADR-0108 later resolves Authentik's served patch
but not its image, outposts, private configuration, or compatibility; automatic
upgrades are prohibited, and candidate selection, monthly cadence,
independent review, owner approval, deployment, and reconciliation remain
incomplete. M16 stays 77/100, the candidate stays 83/100, and production stays
54/100 and unchanged. Exact implementation `e4a1e573` passed CI `33306849568`,
Security `33306849601`, and external CodeQL `99244979080`; all twelve checks
are green.

ADR-0106 is the preceding safe M16 dependency-hardening slice. The current
repository review selected only `fast-xml-parser` 5.11.1, Nodemailer 9.0.6,
and `smtp-server` 3.19.4 from the available updates because they share the
tenant-federation and notification untrusted-input boundary. Exact Git tag
commits, npm tarballs, integrity values, licences, Node floors, owning
manifests, and lock paths are versioned. The application still rejects SAML
documents above 256 KiB and declarations before independent syntax/entity
validation, and SMTP still denies file and URL access on both transport and
message. A root-gated validator rejects thirty-two provenance, pin,
lock-alignment, control, rollback, task, and false-authority corruptions.
Unrelated compiler, lint, contract, and interface updates remain separate.
This changes no contract, migration, ledger, tenant authority, checkout,
release, or production runtime; M16 stays 77/100 and the candidate stays
83/100. Clean install found zero vulnerabilities; focused SAML and SMTP tests
pass 36/36 and 18/18; the complete local gate passes 997 tests, both production
builds, 87-migration/69-pgTAP-file static validation, secret scan, production
audit, licence inventory, and diff review. Exact implementation `c14a8f5`
passed CI `33281041057`, Security `33281041055`, and external CodeQL
`99176310303`, with all twelve checks green and PR #57 merge-clean. The
existing elapsed/live gates remain pending.

The M00 task authority now has a durable owner-input gate. M09 was the only
active enterprise module whose canary-closeout evidence required external
approval and a real store while its task declared an empty owner-input list;
both the module and M09-S06 now identify the exact release/window, linked
WooCommerce pilot, and recovery/rollback inputs. The root check validates all
27 tasks, 108 task/slice nodes, exact M00-M16 inventory, dependency integrity,
locked scope and completion thresholds, and active-slice input inheritance with
twenty-three adversarial mutations. This changes no module or product score and
does not authorize a merge, release, deployment, or canary.

ADR-0105 is the active safe M15 release-integrity correction. The published
v0.1.11 WooCommerce artifact and current development source identify the plugin
as `0.1.0-dev`, so the existing tag workflow could not provide trustworthy
installed-version, update, support, or reconciliation evidence. The selected
boundary keeps development source unchanged, derives an exact numeric version
from the release tag only while packaging, and independently verifies the
plugin header, runtime constant, translation template, readme stable tag,
closed non-test inventory, regular-file entry types, size bounds, and
reproducibility. CI uses a synthetic numeric version and release evidence must
prove that the connector version equals the tag. The first exact Security run
`33272662903` rejected the initial reader's metadata/open race; descriptor-first
correction `695067c` then passed CI `33273056805`, Security `33273056780`, and
external CodeQL `99155114588` with all twelve PR checks green and PR #57
merge-clean. The whole-product candidate is rescored at an unchanged 83/100
because no real tag or live evidence was added. Historical release assets remain
immutable; no release, deployment, WordPress installation, VM, database,
checkout path, or loyalty value changed.

ADR-0103 is the active safe M16 Supabase client/toolchain slice. Official review
found current patch releases for CLI 2.116.0, supabase-js 2.112.4, and SSR
0.12.5; PostgreSQL client 3.4.9 remains current. The repository exact-pins the
three updates and their aligned platform/subpackage graph. Because CLI 2.116.0
restores `auto_expose_new_tables` to a true default, the local/CI Supabase
configuration now explicitly sets it false while retaining only `public`,
`graphql_public`, and `loyalty` in the Data API schema list. Explicit grants and
RLS remain authoritative. A network-free validator binds official sources,
package bytes, Node compatibility, transitive alignment, configuration, task
evidence, immutable CI results, and false production authority through
forty-seven corruptions. Exact implementation `1b9a4d4` passed CI
`33265165945`, Security `33265166008`, and external CodeQL with all twelve
checks green. The 5,932-byte evidence record binds the complete database,
image/security, and WooCommerce regression under SHA-256
`3826e55e239bb4a2f9a3ee6d3d3f3e7541c5de0572d0d53dcd552b3cccd21aa7`.
No live self-hosted stack, database grant, migration, release, or loyalty value
changed; merge and every production gate remain separate.

ADR-0102 is the active safe M16 security slice. Official Next.js 16.3.3 fixes
two Critical unauthenticated RCE advisories, while released production v0.1.11
and the integration candidate both declared 16.3.0. The candidate now pins
Next.js and eslint-config-next to exact 16.3.3 npm package bytes and retains
disabled image optimization as defence in depth. A network-free validator binds
the official release and advisories, released impact, lockfile provenance,
task/risk/backlog evidence, no-vulnerable-rollback policy, and false production
authority through twenty-nine corruptions. The complete local gate passes with
995 tests, both production builds, 87 migrations, 69 pgTAP files, every roadmap
validator, zero npm audit findings, the secret scan, and licence validation.
Exact implementation `c3b2954` passed CI `33261152926`, Security
`33261152934`, and external CodeQL with all twelve checks green. The immutable
5,199-byte evidence record binds those results and the image/SBOM/Trivy/CodeQL/
DAST/database/WooCommerce evidence under SHA-256
`d90150e1ec818f1fa092df6cf6a91137c1333cf5b97b4eafb4bcfe3b4ec205ca`.
Separate merge, release, deployment, observation, and reconciliation approvals
are still required. Production remains on 16.3.0 and unchanged.

ADR-0101 is the completed repository portion of the current M16 compatibility slice. It pins the disposable
current matrix to WordPress 7.1, WooCommerce 11.0.1, and PHP 8.4 in HPOS and
legacy modes while preserving the minimum cells and the prior current versions
as rollback facts. The network-free validator binds exact official artifacts,
release sources, workflow cells, compatibility headers, task acceptance, and
false production authority. Exact implementation `c3b2954` passed all four
minimum/current × HPOS/legacy jobs in CI `33261152926`; a 4,291-byte immutable
record binds the reviewed artifact checks, exact runtime assertions, native coupon
order/reconciliation path, cleanup, and chronology under SHA-256
`950091da92c90a5834a1020bed83d275e1d3b0891ff6ca565ac79d2a0682188e`.
A real store upgrade rehearsal, owner approval, deployment, observation, and
reconciliation remain later production gates. No production mutation or score
increase is authorized.

ADR-0100 is the preceding safe M16 provider/dependency slice. It refreshes all four
dashboard/worker Node stages from the immutable Node 24.19.0 image index to the
official Node 24.20.0 LTS index after exact source and Registry review. The new
network-free validator binds the official-source snapshot, release, image index,
linux/amd64 manifest, image configuration, Dockerfile stage set, impact owner,
rollback index, and false production authority. The focused and complete local
gates pass with 995 tests, all validators, both production builds, static
migration/pgTAP validation, secret scanning, audit, and licences. Exact head
`d2c347a` subsequently passed CI `33257511194`, Security `33257511192`, and
external CodeQL with all twelve checks green, including fresh images, SBOMs,
Trivy, DAST, database, and WooCommerce evidence. Release deployment, rollback
observation, and production reconciliation remain open. No release, deployment,
restart, production mutation, or score increase is authorized.

ADR-0099 is the current exact-head security correction. CI run `33254530487`
passed at `e71e62d`, but Security run `33254530449` failed closed with three raw
CodeQL results. The minimizer had ignored direct security scores because CodeQL
published its query rules under `tool.extensions`; GitHub showed only the new
file race because the temporary-input and Klaviyo fingerprint results matched
older dismissed alerts. The parser now indexes driver and extension rules and
continues to reject dismissed raw findings. Deployment and fault inputs use
descriptor-first `O_RDONLY|O_NOFOLLOW` reads, and the Klaviyo binding is a
connection-specific scrypt V2 fingerprint with a secret-safe operator command.
ADR-0098's federation HMAC and four-file fail-closed boundary remain accepted
hardening but were not the source of the older findings. The complete local
`npm run check` gate passes with 995 tests, every validator, the production
dashboard and worker builds, and both supported client packages. Final code
candidate `fe8a6ff` passed CI run `33255970171` and Security run `33255970172`:
all twelve PR checks are green, raw CodeQL analysis `1691796393` has zero
results, and artifact `9715823372` records zero findings in every severity. The
fresh Trivy, CycloneDX, DAST, dependency, image, database, WooCommerce, and
recovery evidence is reconciled in M15; release, production review, independent
penetration testing/retest, R-056 source obligations, and owner approval still
gate M15. Production remains unchanged.

## Objective

Deliver the enterprise WooCommerce roadmap in `docs/plan/ENTERPRISE_ROADMAP.md` without weakening the immutable ledger, tenant RLS, idempotency, audit, recovery, or checkout-independence guarantees. Shopify, localization, store credit, gift cards, and cash redemption are deferred.

## Current module

M16 — continuous self-improvement is the active dependency-safe repository module while M01 and M04–M15 retain reviewed deployment/canary/reconciliation closeout. M00, M02, and M03 are complete. The complete M04–M16 repository stack is merged into `main` through PR #57; exact merge commit `c85d93d0e6e0273543078050e697f04309f11d93` passed post-merge CI and Security. The current repository gate covers 89 migrations, 70 pgTAP files with 3,831 assertions, 22 concurrency probes, 999 workspace tests, both images, and all four WooCommerce runtime cells. ADR-0084 adds a clean-commit, metadata-only provenance collector for all thirteen official sources with 26 network-free adversarial cases; its verified artifact has SHA-256 `5786186426b065493f5c01b5d76742322e2e8ed3fe92b8f80c30d787caa516be`. ADR-0085 defines the separate no-SSH installed-state preparation boundary across two opaque recovery endpoints and six providers. Thirty-six network-free/SSH-free cases pass against canonical fact ordering, exact historical committed source and full candidate-plan bytes, safe repository paths, version, executable, output, and false-authority controls. The independently verified 8,813-byte real artifact binds clean implementation `c5678b6` under SHA-256 `9960e01bea1a66856a2e0ed36493b28e183f5e316ce027fef3534ba5043448f7`; installed capture is complete. ADR-0091 selects BorgBackup's exact candidate and ADR-0092 selects the client-only OpenSSH architecture without rewriting that artifact; both digest-bound Linux compatibility canaries pass, while real-provider review and every broader human review, approval, upgrade, and monthly-close assertion remain open. Production remains self-hosted and unchanged.

ADR-0094 records the accepted historical IMP-010 package-candidate preparation. It leaves the accepted V1 policy/evidence immutable and makes a hash-bound shared V2 catalogue: sixty-four exact entries including the minimized rsync canary report, verifier source, and current/historical governance evidence, versioned manifests/reports, stable no-follow byte verification, and explicit false package-authority, compatibility, custody, recovery, and production authority. The complete local repository, static database, secret, production-audit, and licence gates pass; exact implementation `b2cbba0b01a0efeffc0fb62eee0c7599d6eb9887` passed CI `33244976784`, Security `33244976845`, and independent CodeQL `99080920204`. V2 remains immutable evidence but its cross-suite rsync package provider is no longer eligible for activation.

ADR-0095 supersedes the cross-suite package shape for future rsync rollout without rewriting ADR-0073 or the V2 evidence. Debian's 3.5 package would replace the Proxmox host's global Trixie `libacl1` with a next-release library, so the selected candidate builds the exact signed upstream rsync 3.5.0 source separately in digest-pinned Debian 13 and Ubuntu 24.04 environments and copies only root-owned, non-writable artifacts below `/opt/starfiniti/rsync/3.5.0`. Exact current distribution rsync paths and native ACL libraries remain the rollback boundary. Bootstrap Security run `33247037670`, recovery job `99086186056`, passed both native builds, the complete isolation contract, current-host and candidate-host transfers, and exact teardown. Its retained report binds host executable SHA-256 `962b026fd37b68dce86a5601b24cddafc68db8d8c3b9d60c5b63c554fcee7b7c`, guest executable SHA-256 `5c754e6809d1ac79b81def92056059a31c12bb40fc476a81b5489ad318c7f188`, and shared wrapper SHA-256 `263d7bf7934442aa585e54152cf9ae8f93b01b1bd9719454deb4dc6f31b0bad8`. Digest-locked Security run `33248120835`, recovery job `99089014687`, reproduced every pinned hash and passed all isolation, compatibility, confinement, and teardown checks; artifact `9713549190` and the retained report are independently hash-bound. The plan is now a repository candidate under SHA-256 `cb6fee76b837c5274172182d7a58de71d2ccf13901722f856833b2ce6e7e0912`. V3 escrow, real forced-command/archive/restore proof, and independent review remain required. Production VM 971, SSH, package state, timers, archives, checkout, and loyalty value remain untouched.

ADR-0096 defines the current V3 private recovery handoff without treating both rsync candidates as active. V3 hash-binds the immutable V2 policy, marks `rsync-transport` historical-only, and composes the thirty accepted V1 BorgBackup/OpenSSH entries with forty-four native-rsync inputs: the two endpoint-native executables, shared wrapper, signed source/key, unchanged distribution rollback packages, distinct endpoint dependency inventories, retained digest-lock report, build and runtime controls, runbooks, decisions, and historical/current evidence. The shared verifier requires exactly seventy-four effective entries, binds each dependency inventory to the correct endpoint executable, and keeps source-signature, package-authority, native-build, consumer/selector compatibility, custody, independent-review, restore, and production authority false. Exact implementation `21262cf08e265c61d3e76e1971ce7604916469cc` passed CI run `33250002574`, Security run `33250002462`, and independent CodeQL check `99094120148` with all twelve PR checks green. Production remains untouched and the M16 score stays 77/100.

The installed review has now promoted one real host issue above the prior backlog: ADR-0086 and R-059 show that the running Proxmox host is below fixed floors in five published security advisories. An exact signed-index candidate contains eleven upgrades, one new signed kernel, zero removals, and 165,341,024 package bytes; its fixed metadata meets every listed floor. ADR-0087 adds a GitHub-hosted digest-pinned disposable canary that independently proves every fresh repository signature and signed index plus Apt/exact-URL byte equality for all twelve packages, installs none, retains no package bytes, emits only minimized evidence, and preserves all production authority gates as false. Nine networked attempts failed closed on keyring/tool/parser/report-publication boundaries and remain audit history. Head `45e9a12` passed CI `33223681162`, Security `33223681183`, and external CodeQL `99023166148`; job `99022913369` produced artifact `9706126317`, which independently verifies five repositories, ten signatures, twelve packages, 165,341,024 bytes, unchanged dpkg status, zero candidate installation/retention, zero production credential/route/mutation, and teardown. The exact committed 9,606-byte report has file SHA-256 `3eec19512a6b2535cf0c6359144c1807b78e01015f43c470ad53335c6eb1090e`. ADR-0088 separately binds the current production starting state and exact dependency simulation. Its exact 13,152-byte report has SHA-256 `b18037b19263020fabce46c2b6b13ec69b640775d2747dae474521191cba8a85` and proves eleven upgrades, one install, twelve configurations, zero removals/downgrades, four retained recovery packages, and byte-identical bounded package/APT/repository state without refresh, download, install, service control, reboot, route, credential, or mutation. Head `8f2934b` passed all twelve checks in CI `33226696854`, Security `33226696825`, and external CodeQL `99031930348`. ADR-0089 adds the independently verified 9,236-byte route-free whole-host inventory `proxmox-compatibility-inventory-e7825b6-2026-08-29T023345Z.json`, covering all 22 anonymous guests and 19 exact behavior profiles plus storage, services, network, HA, boot/KVM/IOMMU, and tool provenance without retained raw facts. ADR-0090 now binds those inputs to a thirteen-stage, owner-controlled rehearsal on an isolated equivalent physical Proxmox host: every synthetic profile plus only the application/database critical clones at released Starfiniti `v0.1.11` and reviewed Supabase `self-hosted/v0.8.0` compatibility/Compose/image identities, a fresh approval-bound dependency simulation and same-projection production inventory read no more than five minutes old, exact candidate boot, services, storage, checkout independence, reconciliation, controller teardown, and an approval-expiry-bound out-of-process auto-destroy lease are fail-closed. Repository fixtures pass, and exact implementation `741a375d67725dab0191d4f06bbd2779638c57b4` passed CI `33232583190`, Security `33232583183`, and external CodeQL `99048027493` with all twelve checks green and PR #57 merge-clean; no real target, driver, approval, install, reboot, or report exists. None of these proofs authorizes deployment. Compatibility, recovery and rollback escrow, owner choice of enterprise versus no-subscription repository, separate installation and reboot approvals, running-kernel/service smoke, observation, reconciliation, and independent review remain open. IMP-011 is therefore the top Critical item; production remains unchanged.

ADR-0091 addresses the installed BorgBackup 1.4.0-5 CVE impact as a separate R-004 recovery slice. It rejects cross-suite Debian unstable and a private backport in favor of Borg's exact upstream-signed 1.4.5 glibc 2.31 single-directory release beside the untouched Debian executable. The plan binds signed-metadata plus exact-URL byte equality for the rollback package, archive/signature/README/full-fingerprint provenance, safe pre/post-extraction tree identity, current/candidate client/server operations, rollback extraction, networkless unprivileged ceilings, immutable minimized output, and exact container/image teardown. Exact implementation `fe727d5` passed the four-pair, eight-operation Security canary in run `33235799207`, job `99056449824`; the exact retained report and GitHub artifact archive are independently SHA-256-bound. Escrow, real remote providers, all consumer paths, rollout, rollback, monitoring, isolated full-service restore, and independent approval remain pending. This changes neither the M16 score nor production.

ADR-0092 advances the next recovery-provider review without replacing an SSH daemon. The exact plan binds Debian Trixie's installed `openssh-client=1:10.0p1-7+deb13u4` and Ubuntu Noble's `openssh-server=1:9.6p1-3ubuntu13.18` to an official signed OpenSSH Portable 10.5p1 client-only build. It preserves both distribution daemons and `/usr/bin/ssh`, verifies the Debian rollback package and all three Ubuntu server-side packages through signed metadata plus exact URL bytes, rejects unsafe source members, fixes the source tree and build flags, and requires current/candidate clients to pass strict-host-key, public-key, forwarding-disabled, restricted-command behavior on an internal no-port network with exact teardown. Bootstrap Security run `33240398639` discovered stripped executable SHA-256 `be9dd9ee2550e3fca2a6fa15edb5ab9303e42ac783ac766928fa5380971bf081`; digest-locked candidate `275c9e8` then passed Security run `33241151463` job `99070606112`. The exact retained report and artifact archive are independently hash-bound. Escrow, real rsync/Borg consumers, rollout, monitoring, rollback, isolated restore, and review remain pending. Production and the M16 score are unchanged.

ADR-0093 now makes the shared BorgBackup/OpenSSH private byte handoff
executable without claiming that operations escrow exists. A closed 30-entry
policy covers the candidate and rollback artifacts, signing inputs, candidate
executables, dependency inventories, reviewed build/verifier files, runbooks,
ADRs, evidence, and retained canary reports. The no-network, no-copy,
no-execution verifier inventories only an operations-staged directory, rejects
missing/extra/linked/mutable/wrong-byte/wrong-commit inputs through stable
no-follow descriptors, and emits only minimized aggregate evidence. The
repository contract and adversarial fixtures pass. Exact implementation
`504555c` passed CI `33243336082`, Security `33243336070`, and separate CodeQL
check `99076519435`; a real private inventory,
signing/dependency review, offline redundant custody, second-person review,
recovery proof, and approvals remain pending. Production, R-004, and the M16
77/100 score are unchanged.

M15-S03 is the current dependency-safe hardening slice under ADR-0064, ADR-0082, and ADR-0083. Reviewed artifact-head CI `33384160196` and Security `33384160199` at `74a37e9` pass CodeQL, repository and deployable-image scans, both exact CycloneDX inventories, scanner freshness, the development audit, four WooCommerce runtime cells, and isolated DAST with zero Critical/High/Medium/Low alerts. The fresh digest-bound review maps all 29 raw Medium reciprocal-licence occurrences to 15 exact dispositions with zero false positives; product source is available, while 14 third-party obligations across 12 packages remain release-blocking. The candidate removes the unused small-image optimizer runtime, binds exact product/Alpine source/build/licence inputs, and requires deterministic source generation and verification before registry login or image publication. External CodeQL previously exposed one real metadata/read race in the release envelope; the corrected no-follow stable-descriptor verifier remains in the candidate. This is repository evidence, not a real tagged release: 19 of 27 checks pass and eight real-release, production-review, independent-test/retest, final-reconciliation, and owner-approval checks remain non-passing. R-056 stays open and production remains unchanged.

M01-S01 is now the active infrastructure compatibility slice under ADR-0081. It turns the self-hosted Supabase assumption into an executable, fail-closed contract over the exact upstream source provenance, both approved Compose byte variants, fifteen mounted assets, eleven reviewed `linux/amd64` image IDs, required gateway/Auth/Data API/database behavior, and cumulative RLS coverage for all 173 tenant tables. Three private coordination tables that already denied direct access now enable RLS through an additive migration and zero direct-role policies. Read-only VM 971 evidence matches the approved files and healthy runtime except for an older Studio container that still has the pre-`loyalty` schema environment. Production remains untouched; approved Studio recreation/smoke, a future exact upgrade rehearsal, and clean-room restore are the remaining compatibility closeout gates.

ADR-0079 now binds the real public release boundary: production exposes English V1 and the complete V2-V6 stack ships migration-first in one dashboard release. The application therefore requests V6 and falls directly to V1 only for recognized missing-function errors, performs at most two RPCs, and fails closed on malformed/provider responses. V6 carries the exact immutable published programme currency; bigint-safe earning and VIP formatting no longer assumes EUR, while the V1 bridge uses currency-neutral copy. Reward-editor row identity and the shared M04-M14 canary artifact/envelope primitives were also repaired during the merge-readiness review. Focused tests and all eleven module validators pass; production and M09's 88/100 canary state are unchanged pending exact-head CI and the approved production gate.

M09 has one dependency-safe hosted-experience correction repository-verified under ADR-0074. V2 could only describe legacy spend tiers and therefore rendered advanced points/order/referral/activity policies incorrectly. The additive V3 guest projection derives the published tenant/version in PostgreSQL, exposes only bounded public qualification and benefit facts, and drives a responsive VIP progression rail. Its original V2/V1 rollout bridge is historical; ADR-0079 now governs the complete application reader. Focused desktop/mobile browser evidence passes; exact implementation head `7a68ffa` passed all 12 PR checks in CI `33157341807` and Security `33157341670`, including 82-migration replay and 3,712 pgTAP assertions. M09 remains 88/100 until its approved production canary, rollback, observation, and reconciliation gates pass.

ADR-0075 closes the next hosted discovery gap: the generic anonymous earning card becomes an additive V4 catalogue derived from the immutable published rule version. It shows only derived public codes/labels, safe standard sources, exact bigint-safe effects, schedule state, and a conservative restrictions signal; merchant-authored identifiers/copy, custom activities, selectors, caps, customer state, and value authority remain private. Its original V3/V2/V1 rollout bridge is historical; ADR-0079 now governs the complete application reader and malformed current data fails closed. Focused desktop/mobile browser evidence passes with all five public sources and zero diagnostics. Exact implementation head `d91a2d7` passed all 11 required checks in CI `33161466635` and Security `33161466605`, including 83 migrations, all 68 pgTAP files with 3,725 assertions, the complete concurrency matrix, both images, and all four WooCommerce runtime cells. Production and the M09 88/100 canary state are unchanged.

ADR-0076 closes the next hosted discovery gap. Additive V5 removes the legacy raw reward array from the browser contract and presents six supported non-cash benefit families with exact bigint-safe cost/benefit evidence, schedule, summarized public conditions, and native/manual delivery. Raw selectors, instructions, exact limits/budgets, stable merchant codes, customer state, and value authority stay private; store credit remains excluded. Its original V4/V3/V2/V1 rollout bridge is historical; ADR-0079 now governs the complete application reader and malformed current data fails closed. Focused reduced-motion desktop/mobile browser evidence passes with no overflow or diagnostics. Exact implementation head `294c62a` passed all 11 required checks in CI `33165531738` and Security `33165531707`, including 84 migrations, all 68 pgTAP files with 3,740 assertions, all 22 concurrency probes, both images, and all four WooCommerce runtime cells. Production and the M09 88/100 canary state are unchanged.

ADR-0077 closes the remaining generic public referral card without broadening the authenticated customer boundary. Additive V6 derives the active tenant, immutable published policy, safe currency, and referral entitlement in PostgreSQL; exposes only both point offers, minimum first-order spend, attribution/cooling windows, new-customer scope, a monthly-limit signal, and honest available/paused/unavailable state; and retains private link, identity, history, fraud, exact-cap, internal, and value facts exclusively behind the Auth-derived account projection. ADR-0079 supersedes its original intermediate fallback chain: the application requests complete V6 then released English V1 only, and malformed V6 fails closed. Production-rendered desktop/mobile reduced-motion review passes with exact terms, same-origin account routing, 44-pixel actions, zero overflow, and zero diagnostics. Exact implementation head `3812e67` passed CI `33169816691` and Security `33169816719`, including 85 migrations, 68 pgTAP files with 3,753 assertions, all 22 concurrency probes, both images, and all four WooCommerce runtimes. Production and M09's 88/100 canary state remain unchanged.

ADR-0078 closes the authenticated pre-purchase campaign discovery gap without publishing
targeted campaigns anonymously. Additive customer V3 derives the live Auth subject,
customer link, programme, wallet, treatment assignment, lifecycle, and remaining
capacity in PostgreSQL; returns only bounded safe scheduled/active purchase bonuses and
multipliers; and preserves exact bigint/basis-point and combination semantics. Control,
other-tenant, revoked, paused, ended, or exhausted opportunities and all raw audience,
rule, budget, liability, identity, and value authority remain absent. V2/V1 are used only
when V3 is missing, and malformed V3 fails closed. Production-build desktop/mobile
review and the complete local 985-test gate pass. Exact implementation head `9644d66`
passed CI `33175790670` and Security `33175790673`, including 86 migrations, all 68
pgTAP files with 3,772 assertions, all 22 concurrency probes, both images, and all four
WooCommerce runtimes. Production and M09's 88/100 canary state remain unchanged.

The M04–M14 production canary family now shares one exact registered-envelope catalogue. Every module gate rejects unknown parent and nested fields, unregistered schemas, future evidence, strings above 4 KiB, cyclic structures, and invalid task graphs; the root check exercises fourteen corruptions per module, or 154 fixtures in total. This closes a cross-module false-evidence class without changing any module score, pending production control, deployment, checkout path, or loyalty value.

M13's deployment boundary is repaired under ADR-0069 so unrelated releases do not require dormant tenant-federation administration credentials. Workforce SSO remains the existing Supabase custom OIDC provider and is live independently. The three optional Authentik/Supabase federation files are all-or-none: an empty set passes deployment preflight and binds fail-closed non-files, a partial set fails, and a complete set retains strict owner-only validation. Commit `945c92f` and its exact-head CI `33126151633`, Security `33126151639`, and external CodeQL checks passed; the exact candidate Compose also validates with Docker Compose 2.40.3 on VM 970 without creating a container. Production configuration and runtime remain unchanged.

M01's read-only production baseline is current again: v0.1.11 and all production containers are running, all loyalty commerce/value aggregates remain zero, current PostgreSQL backup jobs succeed, and the latest successful nightly Borg inventory includes VM 970 and 971. Its exact baseline/check validator now includes eleven adversarial false-evidence fixtures. No restoration was inferred from archive creation. The real-store sequence, application/Auth/Authentik/configuration/signing clean-room recovery, alerts, reconciliation, and owner approvals remain the exact blockers; M01 stays at one of 22 checks passed.

The 2026-08-28 VM 971 follow-up confirmed the terabyte transfer loop remains absent but exposed false backup success during the nightly whole-VM Borg lock window. Live timing then proved that truthful bounded failure alone cannot meet the recovery target: individual VM archives held the shared repository for up to 22 minutes 20 seconds, the full external-lock sequence lasted 1 hour 45 minutes 13 seconds, the first post-release retry still hit Borg's remote lock, the resulting PostgreSQL archive gap reached 1 hour 50 minutes 39 seconds, and the live hourly retention policy could thin recent three-minute recovery points to one per hour. ADR-0071 selects and verifies a distinct actual PostgreSQL Borg repository/lock/cache plus exact 48-hour recent retention and compaction. ADR-0072 records the transport gap: the live host's rsync 3.4.1 and guest's 3.2.7 predate a directly applicable 3.5 security release, so the candidate requires canonical trusted 3.5-or-newer executables on both sides, guest confinement, and environment cleanup. ADR-0073 binds both exact candidate packages and the three exact pre-change rollback artifacts. The rollback-aware exact-head disposable proof passed signed-metadata and exact-URL byte equality, checksums and package metadata, installed none of the rollback set, deleted the bytes, and emitted only minimized facts before candidate acquisition. Static and Linux mock gates also cover success, version/config/selector/ID/actual-identity refusal, staging-before-lock, contention status, prune, and compact. Production is not changed; operations escrow, dual-endpoint rollout, repository provisioning, timer/retention evidence, and isolated restore remain required.

ADR-0071's active privileged assets are now consolidated into one explicit `archive|maintain` controller. It shares the root-equivalent configuration, numeric state, and atomic repository-isolation metric primitives while retaining separate mode allowlists, timeouts, stage-before-lock order, transfer guard, and retention behavior. Both former standalone programs remain rollback artifacts and no reviewed unit executes them. The Linux mock gate is the behavioral authority; production remains unchanged.

A new direct watch of the 10:27 CEST scheduled cycle again refuted transfer amplification: 67,885 changed bytes produced 409,323 received rsync bytes and about 446 KiB of observed VM tap traffic, then Borg completed in 1.63 seconds. Dashboard readiness remained 200 and the healthy timer stayed enabled. The displayed 3.604 TB value remains the VM-uptime cumulative counter; production was not restarted merely to clear telemetry history.

M04-S03 is complete after a production-component browser and accessibility pass at desktop, mobile, and 320 px. Invalid V2 edits remain in the editor, exact contract issues bind to and focus the first invalid field, Save remains usable for submit-time guidance, M04 text meets the readable control floor, and mobile M04 targets measure at least 44 px. M04-S04 now has a 48-check fail-closed canary contract wired into `npm run check`; production claims require nine named, minimized, safe-read, path-, SHA-256-, and semantic-bound evidence artifacts with exact approved policy/ceiling, release/component, reward behavior/count, zero-difference, chronology, rollback, and 24-hour observation reconciliation. Thirteen repository/read-only controls pass, 35 approved-release/pilot/deployment/canary/reconciliation controls remain pending, and the provisional 90/100 score is blocked by operability 3/10. No production deployment or value mutation was made.

M15-S01 is active under ADR-0062 and ADR-0104 with a four-scenario fixed-arrival workload, exact clean-commit/origin/workload approval binding, owner-file credentials, production-mutation denial, contract-aware signed WooCommerce and Service API adapters, driver headroom, and minimized aggregate reports. The independent boundary now pins Grafana k6 2.2.0 to the official OCI index plus both Linux platform manifests, translates every canonical phase/rate/scenario to constant arrival rates, seals descriptor-validated authority/script bytes for owner-only UID/GID mounts, disables cloud/usage/raw output, and recomputes schedules, drops, classifications, thresholds, tool provenance, repository drift, and false production authority instead of accepting a tool label plus passing booleans. Exact implementation commit `c8e3439` passed CI `33269532474`, Security `33269532376`, and CodeQL `99145597424`; all 12 PR checks were green, including the network-disabled digest-pinned Linux k6 image/script inspection. The complete local repository gate also passes with 995 tests and both production builds. The 23-check manifest records seven repository controls passing and 16 approved-environment, inventory, data-shape, monitoring, sustained/burst/recovery, latency, reconciliation, repeatability, real independent-driver, and claim checks pending. No capacity number is published and no production load or mutation has run.

M15-S02 is active under ADR-0063 with a canonical six-scenario fault plan and a short-lived disposable-host controller. Exact Compose labels plus a disposable marker, loopback-only HTTP/Toxiproxy controls, digest-bound owner files, bounded fixed-arrival replays, per-scenario `finally` restoration, public readiness/checkout recovery probes, minimized reports, and a 27-check fail-closed manifest prevent the exercise from becoming production authority. Exact implementation-head run `33049635069` at `adf6d9d` passed all seven jobs. Six repository controls pass and 21 environment/routing/monitoring/fault/WAL/queue/value/reconciliation checks remain pending. No production fault or external exercise has run.

M15-S03 is active under ADR-0064, ADR-0082, and ADR-0083. A separate four-job Security workflow adds CodeQL, repository secret/misconfiguration scanning, exact deployable-image vulnerability/secret/misconfiguration/licence scanning, two CycloneDX image SBOMs, bounded ZAP testing of a disposable dashboard on an internal no-port Docker network, exact reciprocal-source inventory, and recovery-transport verification. Tagged releases build and independently verify corresponding source before registry authentication, then checksum and attest seven exact files plus both registry image digests. Reviewed artifact-head CI `33384160196` and Security `33384160199` at `74a37e9` are fully green; DAST has zero Critical/High/Medium/Low alerts, and the fresh exact-artifact review records zero false positives plus 14 open R-056 release obligations across 12 packages. Nineteen checks pass and eight release/production/independent-test/final-reconciliation/approval checks remain non-passing. No release, production scan, or mutation ran.

M15-S04 is active under ADR-0065 with a fourteen-stage clean-room controller and 32-check fail-closed manifest. A fresh pre-failure authoritative marker prevents idle-time RPO understatement; controller-measured RTO starts before provisioning and stops only after database, Supabase Auth, Authentik, application/configuration, signing, privacy, connector/value, and reconciliation checks pass. ADR-0071 provides the undeployed dedicated repository/retention boundary, and ADR-0072 refuses malformed or pre-3.5 rsync before recovery access. ADR-0073 selects exact vendor-signed Debian and rsync-project Launchpad candidates; earlier candidate `13e55ad` and artifact `9676590363` proved candidate checksums, metadata, canonical executables, protocol 32, repaired wrapper, restricted-command rejection, bounded synthetic transfer, internal-only networking, minimized reporting, and teardown. Rollback-aware implementation `ed5eb7f` passed Security run `33151832310`, job `98785369076`; artifact `9678028203` additionally binds exact official pre-change host rsync, host `libacl1`, and guest rsync signed-metadata and exact-URL proofs, zero installation/retained package bytes, no production mutation, and teardown. Operations escrow, host-consumer compatibility, approved real dual-endpoint rollout, forced-command/manual/timer archive evidence, dedicated-repository provisioning, and two independently reconciled full-service recoveries remain non-passing. No production package, backup, credential, identity, clean-room infrastructure, route, checkout path, or loyalty value changed.

M15-S05 is active under ADR-0066. Read-only production inspection confirms the approximately 3.60 TB VM 971 transmit value is a historical cumulative counter and current one-minute egress is quiet, while no Prometheus, Alertmanager, Grafana, Loki, Promtail, or node-exporter unit is active. The repository now has a canonical 24-signal/23-alert bounded-label catalogue, including an absent-or-incomplete required-series page, exact Prometheus projection, environment-neutral routing policy, locked source-provisioned Grafana dashboard, seventeen safe runbooks, a monotonic SEV0–SEV2 incident process, postmortem contract, and 34-check false-completion gate. Exact-head CI `33065803812` passed all seven jobs and Security `33065803818` passed CodeQL, supply-chain/image/SBOM policy, secret scanning, and isolated DAST. Thirteen repository/reality/CI controls pass and 21 approved source/deployment/routing/exercise/reconciliation/approval checks remain pending. No monitoring service, receiver, credential, page, incident, production configuration, checkout path, or loyalty value changed.

M15-S06 is active under ADR-0067 at implementation candidate `900ffbc`. One canonical plan fixes one pilot tenant, an immutable release/configuration, at least 720 consecutive UTC hours and thirty complete daily intervals, five distinct minimized artifacts, exact M15 prerequisite digests, eleven daily and fifteen final zero-difference fields, six approval roles, a claims catalogue, M15 and whole-product score floors, and deterministic restart/failure rules. Documentation head `6b57148` passed all seven CI jobs in run `33068012282`, all three Security jobs in run `33068012381`, and external CodeQL policy. The 50-check manifest records five repository controls passing and 45 module/release/deployment/canary/reconciliation/security/recovery/operations/claim/approval checks pending; its honest provisional M15 score is 77/100, with performance and operability below their floors. No release, deployment, production mutation, public claim, approval, checkout path, or loyalty value changed.

M16 is active under ADR-0068 and ADR-0084 through ADR-0093. Its versioned UTC operating contract requires two distinct consecutive monthly reviews, one complete quarterly bundle spanning restore, tenant isolation, privacy, SCIM deprovisioning, and incident response, thirteen official provider/platform/recovery-source reviews, exact evidence-ranked backlog arithmetic, second-occurrence durable controls, material-change score history, guarded experiment promotion, append-only ADR supersession, five distinct minimized artifacts, independent review, and five approvals. The source collector's independently verified 6,534-byte artifact binds thirteen source digests under SHA-256 `5786186426b065493f5c01b5d76742322e2e8ed3fe92b8f80c30d787caa516be`; the no-SSH installed collector's 8,813-byte artifact binds the two-endpoint six-provider catalogue under SHA-256 `9960e01bea1a66856a2e0ed36493b28e183f5e316ce027fef3534ba5043448f7`. The Proxmox candidate also has independently verified package and read-only starting-state evidence. Compatibility, recovery, repository-policy decision, approvals, execution, reboot, and reconciliation remain open. ADR-0080 preserves deployed production at 54/100 and the 2026-08-29 rescore binds exact candidate `cbe89b4` at an unchanged 83/100 because no live evidence was added; both remain completion-ineligible. The exact backlog now has fourteen items and separately ranks the still-unapproved capacity run at 61 and whole-system fault exercise at 69. Exact governance implementation `affa2ef` passed all twelve checks in CI `33270731237`, Security `33270731250`, and CodeQL `99148811211`; PR #57 is merge-clean. ADR-0073 supplies exact rsync candidate and rollback provenance plus a passing rollback-aware Linux canary. ADR-0091 selects the exact BorgBackup candidate and its digest-bound Linux compatibility canary passes. ADR-0092 selects the OpenSSH client-only architecture, locks the bootstrap-discovered executable digest, and now has a passing second exact-plan Linux compatibility artifact. ADR-0093 adds a closed in-place byte verifier but does not create approved offline escrow; private inventory, custody, signing/dependency review, recovery, real-provider, rollout, and independent review evidence remain unresolved, while Debian, Ubuntu, and the remaining Proxmox candidate gates also remain open. The 39-check continuous-improvement validator remains at seven controls passing and 32 elapsed-cadence/broader-source/candidate/exercise/reconciliation/review/approval checks pending. M16's provisional score is 77/100 with performance 5/10 and operability 2/10 below their floors. No elapsed review, schedule, owner, production package upgrade, experiment, exercise, production mutation, checkout path, or loyalty value changed.

The former stacked delivery chain is consolidated conflict-free from `main` through M16 on ready PR #57. Exact artifact head `8f2934ba30c367d94d2142bcbe2a47d92fc74701` was reported `CLEAN` and `MERGEABLE` with all twelve checks green after CI `33226696854`, Security `33226696825`, external CodeQL `99031930348`, the passing package-provenance artifact, and the exact read-only production preflight. Earlier component PR evidence remains historical review evidence. This proves reviewable merge readiness and the two bounded Proxmox evidence gates only; it does not satisfy package rollout, disabled deployment, real-store canaries, reconciliation, security/recovery exercises, elapsed cadence, or approval gates.

M06-S01 through S05 are exact-head green on draft PR #31. Runs `31763563259`, `31764805380`, `31766887239`, `31768294674`, and `31770764870` passed strict policy, signed offline capture, first attribution, historical qualification/cooling, two-sided exactly-once issuance/compensation, Auth-derived reversible fraud review, customer sharing/progress/history, and a fact-sourced merchant funnel. The latest passed a clean 41-migration/1,700-assertion replay, all three concurrency probes, both images, baseline, 126 dashboard tests, 136 contract tests, and all four WooCommerce runtimes. Production-build desktop/mobile browser review passed with no critical accessibility, overflow, or diagnostic issue. M06-S06 is active with a 48-check, four-approval, nine-artifact fail-closed canary validator whose exact semantic schemas bind approved attribution/cooling/fraud/value/retention policies and ceilings, released images/plugin/contracts, referral behavior/value/review/recovery evidence and counts, zero-difference reconciliation, rollback chronology, and at least 24 hours of covering observation. Integrated head `c38c658` passed CI run `33121739492` and Security run `33121739491`. Fourteen controls pass, 34 production controls remain pending, and operability 3/10 blocks the provisional 90/100 score. No production referral capability or value is live yet.

M07-S01 through S05 are exact-head green on draft PR #32. Strict canonical-fact audiences, immutable database-timed snapshots, seven closed campaign behaviors, explicit-instant/IANA schedules, exact budgets, private approval-bound control assignment, atomic value execution, canonical trigger queues, campaign-funded native rewards, and exactly-once refunds/reversals now have a complete Hub-style merchant command center and minimized exact results projection. M07-S06 release hardening through ADR-0030 is exact-head green at run `32677551229`/`a9e75f2`: the complete baseline, both images, clean 47-migration replay, 2,016 pgTAP assertions, all five concurrency probes including approval/publication serialization, and all four WooCommerce runtimes passed. Production-build desktop/mobile browser review passed keyboard, navigation, dynamic builders, dark mode, overflow, and diagnostic checks. The subsequent operability fix exposes the projection's exact capacity, reversal, trigger-outcome, and queue facts in the merchant result table; focused desktop/mobile browser evidence and exact-head run `32679145086` at `1b1406b` passed. S06 is active with a 51-check, four-approval, nine-artifact fail-closed canary validator whose exact semantic schemas bind approved audience/value/control/schedule policies and ceilings, released images/plugin/contracts, all behavior/concurrency/refund/native-reward evidence and counts, zero-difference reconciliation, rollback chronology, and at least 24 hours of covering observation. Exact integrated head `6fb98ad` passed CI run `33120192619` on attempt 2 and Security run `33120192581`; the first container attempt ended only on npm registry `ECONNRESET`, and its isolated retry passed. Fourteen controls pass, 37 production controls remain pending, and operability 3/10 blocks the provisional 90/100 score. No production campaign schedule, entitlement canary, or value is live yet.

M08-S01 is exact-head green on draft PR #32. ADR-0031 selects a strict provider-neutral immutable event log, local purpose-separated consent/suppression authority, Auth-derived customer commands, and late contact resolution. Nine event types reject arbitrary PII/coupon/secret/ledger properties, trusted suppression cannot be cleared from a customer session, privacy erasure suppresses both purposes, and existing point-expiry fences append one canonical event. Run `32682221777` at `33e0396` passed the complete baseline, both images, clean 48-migration replay, all 39 pgTAP files with 2,066 assertions including 50 focused notification assertions, every concurrency probe, and all four WooCommerce runtime cells after one transient upstream download was retried.

M08-S02 is exact-head green at `604bbeb` on draft PR #32. ADR-0032 isolates an optional SMTP worker from value processing, uses database-owned bounded leases and dispatch-time consent/entitlement/contact authorization, pins six immutable English templates, dead-letters deterministic local message failures, and stops ambiguous remote acceptance in manual review. Run `32686442063` passed the complete baseline, both production images, a clean 49-migration replay, all 40 pgTAP files with 2,152 assertions including all 86 focused SMTP assertions, every concurrency probe, and all four WooCommerce runtimes. The 46 worker tests include 16 focused SMTP tests and a real loopback sink. No production SMTP credentials or delivery are active.

M08-S03 is exact-head green at `a6bbf14` on draft PR #32. ADR-0033 binds every managed Klaviyo operation to one tenant connection and API-key fingerprint, resolves verified contact only after database authorization, pins API revision `2026-07-15`, minimizes profiles/events, treats provider suppression as stronger local authority, and stops ambiguous opt-in submission for review. Run `32689107286` passed the complete baseline, both production images, a clean 50-migration replay, all 41 pgTAP files with 2,219 assertions including all 67 focused Klaviyo assertions, every concurrency probe, and all four WooCommerce runtimes. The disabled worker profile has no production connection or credential; the real test-account canary remains an S06 gate.

M08-S04 is exact-head green at `ea9aa00` on draft PR #32. ADR-0034 binds Standard Webhooks v1 exact-body HMAC signatures to a stable delivery ID and endpoint-specific current/previous secret fingerprints, rejects redirects and every private/reserved DNS answer, pins the validated socket address while retaining TLS hostname verification, and rechecks subscription, entitlement, consent, suppression, payload, rate, and lease authority immediately before dispatch. Run `32691991986` passed the complete baseline, both production images, a clean 51-migration replay, all 42 pgTAP files with 2,277 assertions including all 58 focused webhook assertions, every concurrency probe, and all four WooCommerce runtimes. The disabled worker profile has no production endpoint, subscription, secret, or delivery; S05 merchant template and delivery-health experience is active.

M08-S05 is exact-head green at `a377ef7` on draft PR #32. ADR-0035 adds immutable tenant English template versions, private active bindings, Auth-derived owner/admin publication, exact event-token validation, deterministic escaped HTML, an isolated actor-bound SMTP test queue, and a minimized merchant health projection. Run `32836814262` passed the complete baseline, both production images, a clean 54-migration replay, all 43 pgTAP files with 2,340 assertions including all 63 focused template/health assertions, every concurrency probe, and all four WooCommerce runtimes. Real-component Playwright review passed template switching, safe preview, dark mode, responsive navigation, and zero browser diagnostics. S06 disabled deployment, local sink, provider canaries, reconciliation, rollback, and scoring is active; no production provider delivery is enabled.

M08-S06 is active with a 53-check, four-approval, nine-artifact fail-closed canary validator whose exact semantic schemas bind approved provider policies and numeric ceilings, released images/contracts/adapters, SMTP/Klaviyo/webhook/consent/suppression evidence, provider/work counts, zero-difference reconciliation, rollback chronology, and at least 24 hours of covering observation. Fifteen repository/read-only controls pass at a provisional 90/100; 38 release, credential, deployment, provider-canary, outage, reconciliation, rollback, and observation controls remain pending. Operability is 3/10 and blocks close. No provider profile, credential, endpoint, production delivery, checkout path, or loyalty value changed.

M09-S01 through S05 are complete. The Auth-derived hosted experience covers overview, earning, rewards, VIP, referrals, immutable history, and account states; demand-driven signed WooCommerce snapshots, classic placements, official namespaced Store API data, and a separately flagged Blocks panel use only strict local state. ADR-0039 adds controlled English V2 branding and exact section composition. Integrated candidate `c989229` passed CI run `33100009132` and Security run `33100009100` after desktop, mobile, 320-pixel, 200%-scale, keyboard, reduced-motion, dark-theme, public-privacy, preview-state, and outage review. M09-S06 is active at 88/100 with a 34-check, four-approval, nine-artifact fail-closed canary validator whose exact top-level and artifact schemas bind approved rollout/budgets, released images/plugin/contracts, hosted and every WooCommerce delivery path, English/privacy/accessibility, native-coupon and outage continuity, zero-difference value/queue reconciliation, rollback chronology, and at least 24 hours of observation. Adversarial fixtures also reject schema drift, future dates, cyclic structures, oversized evidence, and invalid task graphs. Eight controls pass, 26 production controls remain pending, and operability remains below its floor; approved release/pilot, disabled deployment, canary, rollback, reconciliation, and observation remain. Read-only Proxmox operator access is verified without mutation.

M10-S01 through S05 are complete. Dictionary V4 publishes 103 exact definitions across four independently degradable reports and one strict aggregate JSON bundle. Private 24-hour payloads, five-minute subject/session-bound one-use downloads, owner/admin IANA-local schedules, bounded lease/retry/expiry handling, and the separately deployable reporting worker preserve tenant and loyalty-value isolation. The command center binds every module to one exact database snapshot and passed its Hub-style loading/stale/empty/error, desktop/mobile, keyboard, reduced-motion, contrast, overflow, and English-only review. Integrated candidate `b760cec` passed CI run `33101099338` and Security run `33101099291`. S06 is active with a 32-check, four-approval, nine-artifact fail-closed canary manifest whose exact semantic schemas bind approved scope/policies, shared snapshot, four reports, exports/downloads/schedules, explicit liability/causal labels, zero-difference value/privacy reconciliation, rollback chronology, and at least 24 hours of observation. Eleven controls pass, 21 production controls remain pending, and the provisional 90/100 score remains blocked by 3/10 operability. Read-only production operator access is verified without mutation.

M11-S01 repository and browser gates are complete on `codex/m11-multistore`. The first vertical slice preserves the existing programme-group wallet boundary while replacing implicit/mutable topology administration with exact isolated or explicit workspace allowlists, immutable revisions, Auth-derived PostgreSQL authority, optimistic concurrency, connector-history removal protection, minimized read models, and a responsive Operations editor. Exact-head run `32905613578` at `3cb609d` passed baseline, both images, clean replay, all 50 pgTAP files including 52 focused sharing assertions, all seven concurrency probes, and all four WooCommerce runtimes; native Chrome desktop/mobile review passed. The disabled Starfiniti deployment/canary closeout remains with M11-S06.

M11-S02 repository and browser gates are complete under ADR-0043. The slice binds each store to its own fresh HMAC proof and the same live Auth subject, rejects email/attribute matching and secondary wallets with existing state, records immutable exact source/canonical revisions, and uses trigger-guarded projections so established customer/worker paths keep one canonical wallet. The Auth-derived customer read/unlink boundary and readable responsive connected-stores UI passed desktop/mobile Playwright review. Exact-head run `32910582010` at `19c24a4` passed baseline, both images, clean 64-migration replay, all 51 pgTAP files with 2,716 assertions, all eight concurrency probes, and all four WooCommerce runtimes. M11-S06 owns disabled deployment/canary closeout.

M11-S03 repository and browser gates are complete under ADR-0044. Immutable occurrence-time provider snapshots, exact rational arithmetic, PostgreSQL-recomputed atomic evidence, source-currency condition scope, original-snapshot refunds, and the English policy/revision Operations control passed exact-head run `32918516110` at `6bf137c`: baseline, both images, clean 65-migration replay, all 52 pgTAP files with 2,774 assertions, all nine concurrency probes, and all four WooCommerce runtimes. Production conversion remains disabled pending provider approval and M11-S06.

M11-S04 repository and browser gates are complete under ADR-0045. Digest-only one-time service credentials, bounded rotation, immediate revocation, database-derived tenant/workspace/programme/connection/scopes, opaque customer namespaces, serialized fixed-minute quotas, and canonical custom-activity processing passed exact-head run `32927596360` at `479f605`: baseline, both images, clean 66-migration replay, all 53 pgTAP files with 2,846 assertions, all ten concurrency probes, and all four WooCommerce runtimes after the browser-driven repair. Desktop/mobile Playwright review found and repaired confirmation contrast, action sizing, and label alignment. Production issuance remains disabled pending M11-S06.

M11-S05 repository and browser gates are complete under ADR-0046. Endpoint-scoped one-time signing keys, digest-only storage, immutable lifecycle revisions, disabled-only bounded rotation, disable-before-authorization, terminal destination scrubbing, minimized health, and supported TypeScript/PHP clients preserve the M08 Standard Webhooks wire contract and canonical notification path. Exact code-head run `32932756596` at `a495433` passed all seven jobs: baseline, both images, clean 67-migration replay, all 54 pgTAP files with 2,905 assertions, all eleven concurrency probes, and all four WooCommerce runtimes. Auth-derived public wrappers accept no actor/tenant authority and private lifecycle primitives are no longer executable by application roles. Desktop/mobile production-build review passed lifecycle, degraded, read-only, dark, reduced-motion, keyboard, overflow, and diagnostic checks. M11-S06 disabled deployment, Starfiniti canary, reconciliation, rollback, observation, and scoring is active.

M11-S06 now enforces a 44-check, four-approval, nine-artifact fail-closed ecosystem canary manifest with exact candidate/release identities, fixed automatic failures, safe bounded reads, sensitive-key/value rejection, seven-category arithmetic, an 80% category floor, and comprehensive corruption self-tests. Every artifact has an exact minimized semantic schema; approved pilot/rate/value digests bind approval to journal, topology/identity/currency/API/webhook counts reconcile across artifacts, all value and authority differences must be zero, and final approval binds release plus every artifact under canonical pre-canary, rollback, and minimum 24-hour observation chronology. Integrated candidate `f171770` passed CI `33101922228` and Security `33101922223`. Eleven repository/public/operator checks pass and 33 production checks remain pending. The provisional score is 90/100, but operability is 3/10; approved release/pilot/provider, fresh recovery point, disabled deployment, sequential Starfiniti canaries, exact reconciliation, rollback, and observation are required before completion.

M12-S01 through S05 are complete under ADR-0047 through ADR-0050. The receipt-bound application revalidates exact canonical rows and resolutions, derives live authority, fences source rows across competing receipts, posts immutable opening-balance transactions and exact available/pending lots, releases pending value once at the source instant, and corrects only with compensating batches. Pure bounded adapters translate only exact Generic CSV, WPLoyalty CSV, and WooRewards JSON V1 shapes; the registry refuses unavailable YITH or changed formats before parsing. The English Hub workflow keeps uploads request-local, requires explicit non-email mapping and exact source re-presentation, exposes minimized immutable history/reconciliation, and preserves correction access after entitlement disablement. Integrated candidate `16753b2` passed CI `33102977731` and Security `33102977636` with the current repository/database/container/WooCommerce matrix. M12-S06 now enforces a 36-check, four-approval, nine-artifact fail-closed gate with fixed source, identity, immutable-value, isolation, recovery, rollback, and reconciliation failures. Every production artifact has an exact minimized semantic schema; applied record counts reconcile across journal/report, customer/balance/lot/expiry/liability differences must be zero, final approval binds every artifact, and enforced chronology includes rollback after canary end and at least 24 hours of covering observation. Eleven controls pass, 25 approved production controls remain pending, and operability 3/10 blocks completion despite a provisional 90/100 score. No production migration value is enabled.

M13-S01 through S05 are repository-complete under ADR-0051 through ADR-0055 with every production capability disabled. Access V1, organization lifecycle, Authentik tenant federation, exact hashed-subject SCIM, immediate deprovisioning, bilateral agency, short approved support, signed-AAL2 recovery, bounded export, credential offboarding, and cooled pseudonymization are implemented without broadening tenant authority or changing loyalty value. Integrated candidate `0ae43ea` passed CI `33104114747` and Security `33104114894`. M13-S06 now has a 51-check, four-approval, nine-artifact fail-closed gate with fixed claim, tenancy, egress, SCIM, agency, support, recovery, offboarding, deletion, rollback, and reconciliation failures. Each production artifact must satisfy an exact minimized semantic schema; check evidence is uniquely digest-bound and zero-difference, final approval binds every artifact, and enforced chronology includes a canary-covering observation of at least 24 hours. Twelve controls pass, 39 approved production controls remain pending, and operability 3/10 blocks completion despite a provisional 90/100 score. The approved enterprise IdP/SCIM and agency/support fixtures, private egress, AAL2 recovery/deletion, reconciliation, rollback, observation, and owner approvals remain mandatory.

M05-S01 through S05 are exact-head green. M05-S06 shadow comparison found and fixed a predeployment Rose/Bloom/Icon displayed-versus-executable rate mismatch; all 36 V1/V2 award comparisons now match, and exact-head run `31760806620` passed. S06 now has a 48-check, four-approval, nine-artifact fail-closed canary validator whose exact semantic schemas bind approved qualification/lifecycle/benefit/override/expiry/reminder policies and ceilings, released images/plugin/contracts, all shadow/qualification/movement/benefit/expiry/progression evidence and counts, zero-difference reconciliation, rollback chronology, and at least 24 hours of covering observation. Integrated candidate `4d04ed7` passed CI run `33122704264` and Security run `33122704267` with all eleven PR checks green. Thirteen controls pass, 35 production controls remain pending, and operability 3/10 blocks the provisional 90/100 score. No production deployment or value mutation was made.

M06-S01 through S05 are exact-head green. Opaque first attribution, historical qualification and cooling, atomic two-sided give-get value and refund compensation, reversible minimized fraud review, and customer/merchant referral experiences passed their repository, database, concurrency, browser, and WooCommerce gates. S06 now has a 48-check fail-closed canary contract wired into `npm run check`; production claims require nine named, minimized, safe-read, path-, SHA-256-, and semantic-bound evidence artifacts with exact policy/release/referral/count/chronology reconciliation. Integrated head `c38c658` passed CI run `33121739492` and Security run `33121739491`. Fourteen repository/read-only controls pass, 34 release/pilot/deployment/canary/reconciliation controls remain pending, and the provisional 90/100 score is blocked by operability 3/10. No production deployment or value mutation was made.

The active integrated baseline is released production commit `0ced4b666a55d836bd3d4927337fe057a71bb4ba` (`v0.1.11`). The previous local Phase 4 branch and its six modified planning files remain preserved in a named git stash and have not been mixed into this work.

## Completed M00 slice

- M00–M16 are the authoritative unfinished task graph while completed P0–P7 evidence remains historical truth.
- Current official Smile, LoyaltyLion, Yotpo, and Supabase sources establish the released capability baseline.
- The initial 49/100 product-readiness score, deterministic failure rules, per-module evidence format, dependency-safe external-input policy, and 90/100 enterprise finish gate are versioned.
- Clean install, unit tests, lint, all workspace typechecks/builds, architecture/accessibility/WooCommerce/workflow/deployment/migration validators, secret scan, zero-vulnerability production audit, licences, targeted formatting, YAML/JSON parsing, and diff checks pass.

## Active M01 external gate

- Production/store/recovery state is inventoried without secrets: exact `v0.1.11` images and all Supabase containers are healthy, value/event aggregates are zero, database PITR is proven and repaired, and no reachable customer store was treated as approved.
- The self-hosted Supabase source bundle now has an exact offline compatibility contract and 39-corruption self-test. Repository/static checks cover 87 migrations, 69 pgTAP files, all 173 tenant tables, two Compose variants, fifteen mounted assets, and eleven platform image IDs; runtime Studio schema parity, exact future upgrade rehearsal, and full clean-room recovery remain explicitly pending.
- The 22-case machine-readable pilot gate and exact operational runbook define provisioning, value, refund, expiry, reconciliation, rotation, outage, recovery, alert, and final-reconciliation evidence.
- Complete every recovery/outage/reconciliation step that does not require interactive store-owner access. Leave only explicit store selection and owner-controlled checkout/order actions for the end if credentials remain unavailable.

## Completed M02 slice

- PostgreSQL owns versioned self-hosted/managed deployment mode, 18 capability definitions, exact optional limits, tenant overrides, deterministic rollout, canaries, and private provider mappings.
- Browser and Auth claims cannot grant access; runtime and worker roles cannot mutate it. Six accepted-value paths cannot be disabled.
- Exact-head CI passed 1,095 pgTAP assertions, concurrency/property probes, both application images, and four WooCommerce runtime cells.
- Production took a physical backup, applied additive migration v27, entered managed mode, enabled only the Starfiniti `programme.v2` canary, and passed effective-read, WAL, readiness, and unauthorized-ingress checks.
- M02 closes at 93/100; evidence is under `docs/plan/evidence/M02/`.

## Next safe work

1. M15: retain exact green merged `main`; close ADR-0115's protected-main, tag-ruleset, independent release-environment, policy-token, licence, release-security, and owner approval gates before any release, then retain the immutable-release 30-day canary contract while live capacity, fault, recovery, monitoring, incident, independent-security, reconciliation, claims, and observation inputs wait for approved windows.
2. M16: run the closed private BorgBackup/OpenSSH inventory only when an approved destination and reviewers exist, then continue the next dependency-safe provider/recovery contract without claiming offline custody or production authority.
3. M14: retain the external Stripe sandbox/catalogue/policy, approved release, recovery, managed-tenant lifecycle/usage/invoice canary, rollback, observation, and reconciliation checks for their approved window without changing global self-hosted production.
4. M13: complete S06's enterprise IdP/SCIM, Authentik private-egress, bilateral agency/support, stale-session, AAL2 recovery/export/deletion, rollback, reconciliation, observation, and category-floor gates when their approved external inputs are available.
5. M11/M10: complete their reviewed releases, disabled deployments, isolated Starfiniti canaries, exact reconciliation, rollback, observation, and category-floor scoring.
6. M09/M08: complete reviewed releases, disabled deployments, provider/store outage proof, exact reconciliation, observation, and scoring as external inputs permit.
7. M07/M06/M05: complete reviewed stacked merges, disabled deployments, fresh recovery points, Starfiniti-only canaries, exact reconciliation, smoke, and scores.
8. M01: connect an approved real WooCommerce store when access is supplied and complete its value, outage, rotation, alert, and clean-room recovery gate.

## External inputs

- M01 production gate: approved real WooCommerce store access.
- M01 Supabase compatibility closeout: approved isolated Studio recreation/smoke window, exact future upgrade rehearsal, and clean-room recovery exercise.
- M08 production gate: SMTP and Klaviyo credentials.
- M11 live multi-currency gate: approved exchange-rate provider.
- M13 production gate: enterprise IdP test tenant.
- M14 production gate: Stripe credentials, prices, Price IDs, and delinquency policy.
- M15 gate: approved monitoring environment and receiver destinations, named operations/security/value/recovery owners, two incident exercises, disposable recovery/load/fault exercises, non-destructive production security review, independent penetration test/retest, and explicit owner GA approval.

External inputs delay only their production gate, not the next dependency-safe repository slice.

## Quality gate

`npm run check && npm run db:validate && npm run secrets:scan && npm run audit:prod && npm run licenses`

Module completion additionally requires at least 90/100, at least 80% of every relevant scoring category, no deterministic failure, an adversarial diff review, and durable evidence under `docs/plan/evidence/MXX/`.

See `docs/plan/TASKS.yaml`, `STATUS.md`, `RISKS.md`, `QUALITY_SCORECARD.md`, and `docs/architecture/ADR/`.
