# Enterprise integration review evidence

Date: 2026-08-27
Status: follow-up merge-readiness candidate locally verified; PR #57 exact-head checks remain authoritative
Scope: `origin/main...13d71988d7c05ddfad807320246c9ee613a13531`

## Product-score integrity follow-up — 2026-08-28

Implementation commit `d1a78c04cefacad203c786edee85c4b3a20787a1`
closes a material M16 rescoring gap under ADR-0080. The prior human scorecard
reported 51/100 while the machine categories summed to 54/100, and neither subject
represented the implemented M04-M14 candidate. The original V1 production score is
now byte-preserved under its fixed known SHA-256 and release identity. V2 separately
reports deployed production at 54/100 and the exact integration candidate at
83/100; production is the only completion subject, while the candidate is used only
for development prioritization.

Adversarial review repaired three initial validator weaknesses before acceptance:
automatic-failure text is now exact rather than merely non-empty, history validation
is fixed to the known prior digest rather than trusting a mutable digest field, and
the integration candidate cannot become the completion subject. Bounded
descriptor-first repository reads reject path escape, links, non-regular or oversized
files, and changes during read. Exact calendar dates, commit ancestry, category
weights/floors, totals, evidence paths, task authority, and the human scorecard marker
also fail closed. Fifteen deterministic corruptions cover schema, definition, date,
history, path, subject, score, evidence, and completion drift.

The complete local `npm run check` passed 983 workspace tests, every validator and
typecheck, both production builds, and all WooCommerce budgets. Independent gates
validated 86 migrations, 68 pgTAP files, a 1,069-file secret scan, zero production
dependency vulnerabilities, licences, formatting, and diff cleanliness. The
Supabase skill review caused no runtime or schema change: official-source review was
attempted as required, while this slice remained limited to scoring governance.
Exact-head Linux database replay, image policy, the runtime matrix, and security
analysis remain the GitHub handoff authority after push.

No production release, database, programme, customer, loyalty value, WooCommerce
checkout, feature flag, entitlement, identity, billing, backup, or service changed.

## Follow-up merge-readiness review — 2026-08-28

The current candidate contains 417 commits and changes 792 files relative to
`origin/main`. Independent review axes covered security, billing/ledger integrity,
project idioms, and unnecessary complexity. Security and billing/ledger review
reported no findings. Every idiom or complexity proposal was independently checked
against the actual release, contract, migration, and rollback boundaries before it
was accepted, modified, or rejected.

Verified corrections:

- ADR-0079 removes impossible V2-V5 application fallback states from the unshipped
  migration-first public release. The reader now performs at most two RPCs: complete
  V6, then released English V1 only for recognized missing-function errors.
- V6 derives exact programme currency and minor-unit precision from the selected
  immutable published version. Public earning and VIP copy formats EUR, USD, JPY,
  and other supported currencies without guessing EUR for the V1 bridge.
- Expanded reward rows use stable editor-only identities through code edits and
  removal, so native disclosure/focus state cannot move to a different same-kind
  row. The keys never enter strict programme contracts.
- M09 uses the shared exact canary manifest envelope. All eleven M04-M14 validators
  use one bounded, no-follow, descriptor-first, SHA-256-bound JSON artifact reader
  while retaining module-specific schemas, chronology, scoring, and completion.
- ADR-0071's undeployed archive and maintenance candidates now share one installed
  fail-closed controller with explicit `archive|maintain` dispatch, one validated
  root-equivalent configuration boundary, and one copy of shared numeric-state and
  repository-metric primitives. The standalone programs remain rollback artifacts.
- The reward editor reuses the existing allowlisted selector parser instead of
  maintaining a second implementation.

The proposal to replace the backup asset validator with a regex-based shell
pseudo-parser was rejected. The current validator combines static invariants with
Linux execution of mocked success and failure paths; a partial parser would add a
second shell semantics model without strengthening the runtime boundary.

The complete local `npm run check` passed 983 workspace tests, every validator and
typecheck, both production builds, and all WooCommerce budgets. Independent gates
validated 86 migrations, 68 pgTAP files, 1,066 tracked files in the secret scan,
zero production dependency vulnerabilities, licences, formatting, and diff
cleanliness. Linux Bash behavior, clean database replay, image policy, the full
WooCommerce runtime matrix, and security analysis remain bound to the exact-head
GitHub rollup after push.

No production repository, script, timer, service, database, programme, customer,
loyalty value, WooCommerce checkout, feature flag, or release changed during this
review.

## Original review scope — 2026-08-27

The consolidated M04–M16 security-remediated integration candidate contains 350 commits and changes 705 files. Five independent review axes covered unnecessary complexity, security, billing and metering, project idioms, and implementation cruft. Every blocker or should-fix candidate received a separate adversarial verification before implementation. No blocker survived review.

## Verified corrections

- Workforce SSO now refuses a missing or malformed PKCE flow ID and a missing exact flow verifier slot before constructing a Supabase client or attempting code exchange. Every server client and callback shares the explicit hostname-independent `sb-api-auth-token` storage namespace, preserving existing production cookies when the Supabase API hostname differs. A real SSR client configured with a non-`api` hostname proves it still emits the exact callback verifier slot; regression cases mock a successful legacy exchange and prove it is never called without that correlation.
- Managed Stripe customer, Checkout, and Portal orchestration now returns external redirect authority only when PostgreSQL's post-provider record reports the exact expected state. A concurrent actor, entitlement, or provider revocation leaves the immutable operation on hold and returns no redirect.
- The isolated usage-meter worker accepts only Stripe restricted keys (`rk_test_` or `rk_live_`); broad secret keys are rejected from both direct configuration and mounted files.
- Migration adapter byte and row limits now come from one immutable executable descriptor shared by the parsers and public support registry.
- Capacity, fault, and security closeout validators open completion artifacts without following the final symlink, require one stable regular file, and enforce explicit byte limits before allocating or parsing.
- Stripe session, Stripe webhook, billing-usage, capacity, and fault inputs now use bounded descriptor-first reads with inode and stability checks rather than check-then-read paths. The fixed-length webhook hint removes an avoidable polynomial padding expression.
- Three historical Markdown whitespace defects and one stale recovery-gate count were corrected.

## Focused verification

- Dashboard Supabase server, workforce callback, proxy, and managed-session suites: 27 tests passed, including real non-`api` hostname storage-key emission.
- Billing usage worker suite: 7 tests passed against the restricted-key boundary.
- Migration adapter and registry suites: 16 tests passed.
- Dashboard, worker, and domain type checks passed.
- `npm run capacity:validate`, `npm run faults:validate`, and `npm run security:validate` passed their positive and adversarial fixtures.
- `npm run ci:validate` and `npm run db:validate` remain green for four CI jobs, three security jobs, 81 migrations, and 68 pgTAP files.
- Targeted Prettier and `git diff --check` pass.

The full local `npm run check`, independent database/secret/audit/licence gates, GitHub CI, Security workflow, external CodeQL, and mergeability checks passed for the security-remediated candidate. PR #57's current-head rollup remains authoritative; no documentation-only successor may be handed off while any required check is non-green.

## Integration candidate evidence

- Draft integration PR: [#57](https://github.com/Starfiniti/starfiniti-loyalty/pull/57)
- Candidate head: `78bb5ed34f786a6cc1a13f1127ad59be8a7dc4aa`
- CI run `33082415376` passed baseline, both production containers, clean migration/seed/pgTAP replay, and all four minimum/current HPOS/legacy WooCommerce runtime cells.
- Security run `33082415262` passed CodeQL, isolated DAST, complete dependency audit, repository/image scanning, runtime enforcement, and SBOM generation.
- External CodeQL check `98553236301` passed.
- GitHub reported the candidate `CLEAN` and `MERGEABLE` with all eleven required checks green.

## External CodeQL follow-up

- Documentation head `fa1885d20e6be2ffeb9eeef3b615649342e41481` caused external CodeQL check `98555612391` to surface seven previously unreported High alerts across the large integration diff. The check remained a deterministic blocker even though the repository Security workflow was green.
- Five real check-then-read races and one polynomial padding expression were corrected. The subsequent analyzer reduced the result to two false positives.
- Alert #15 classified `openSync(path, "r")` as temporary-file creation even though the fault runner only opens an existing owner-controlled input read-only and then verifies descriptor/path inode, type, size, stability, and permissions before use. It was dismissed as `false positive` with that audit comment.
- Alert #16 classified a deterministic SHA-256 fingerprint of a high-entropy Klaviyo API key as password storage. The fingerprint is non-secret tenant/connection binding evidence, performs no authentication, and must remain compatible with separately provisioned database evidence. It was dismissed as `false positive` with that audit comment.
- Security-remediated head: `82f644cdf707f9dca2a719d9024ec33cfc3acbb9`.
- CI run `33084847238`, Security run `33084847239`, and external CodeQL check `98562118454` all passed. GitHub reported PR #57 `CLEAN` and `MERGEABLE` with all eleven checks green and zero open Critical/High code-scanning alerts.

## Authority and remaining gates

These are repository-only corrections. Production remains on `v0.1.11` in global `self_hosted` mode. No Stripe key, provider request, deployment, WooCommerce checkout, tenant entitlement, customer, loyalty value, schedule, or public product claim changed. Real-store, disabled-deployment, canary, reconciliation, recovery, monitoring, penetration-test, elapsed M16 cadence, and approval gates remain open.
