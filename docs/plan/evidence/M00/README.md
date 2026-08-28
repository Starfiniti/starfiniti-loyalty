# M00 Evidence — Reality, Task Graph, and Competitive Baseline

- Date: 2026-08-13
- Source: `origin/main` / `ff7978dd8faa4519a378f5bb538c7956905b2125`
- Released production baseline: `v0.1.10`
- Implementation branch: `codex/enterprise-roadmap`
- Hypothesis: stable measurable modules prevent shallow breadth and unverifiable completion.

## Reconstruction

The prior local branch `agent/phase-4-woocommerce-inbox` and its six modified planning files were stored in the named git stash `preserve stale phase-4 planning state before enterprise roadmap 2026-08-13`. The active branch was created from clean `origin/main`; no stale file was applied.

Repository evidence confirms 26 migrations, 1,049 CI-passed pgTAP assertions, 177 unit tests, four WooCommerce runtime variants, production Proxmox/Supabase deployment, Authentik workforce login, immutable value processing, and a released merchant/customer foundation. It also confirms no real store, no accepted customer value, and no completed M03–M16 capability.

## Research and decision

The competitive matrix uses official Smile, LoyaltyLion, and Yotpo documentation retrieved 2026-08-13. Current Supabase self-hosted breaking-change documentation was checked for PostgreSQL 17, Envoy, Auth URL, Data API grant, Studio role, and OAuth response changes. ADR-0009 records the three delivery approaches and rollback consequences.

## Baseline and target

- Whole-product baseline at this M00 cutoff: 49/100. The active score file later
  evolved under ADR-0080; this historical result is not rewritten.
- Released engineering score: 95/100 with recovery/real-store automatic failure still active.
- Enterprise target: at least 90/100 overall and per module, at least 80% of each relevant category, and no deterministic failure.

## Verification

- Clean baseline `npm.cmd run check`: stopped at repository-wide Prettier because the Windows checkout reports the known tracked CRLF baseline across 180 files; no later script ran.
- `npm ci`: passed and restored 962 packages from the lockfile; this corrected an incomplete local install that initially lacked the declared worker `esbuild` binary.
- Changed-file Prettier: passed.
- `TASKS.yaml` and the then-current product-score JSON parse passed with 27 unique
  tasks, 17 enterprise modules, valid dependencies, one active module, and a
  reconciled historical score of 49.
- Lint, all workspace typechecks, and 177 unit tests: passed.
- Dashboard and worker production builds: passed.
- CI, deployment, architecture, accessibility, WooCommerce, and migration validators: passed. Architecture validation covers eight models and five accepted ADRs.
- Secret scan, production dependency audit, and licences: passed; production vulnerabilities are zero.
- `git diff --check`: passed.
- Clean install reports two high-severity development-only audit entries from `@wordpress/env` 11.8.0 and transitive `extract-zip`; production dependencies remain at zero vulnerabilities. The registry's 11.13.0 replaces this with a different high-severity `adm-zip` denial-of-service advisory, so it is not a risk-reducing update. R-032 tracks a safe upstream resolution and treats untrusted runtime archives as prohibited.

## Result

| Category             | Available |  Score | Evidence                                                                                                             |
| -------------------- | --------: | -----: | -------------------------------------------------------------------------------------------------------------------- |
| Correctness          |        20 |     20 | Graph parses, IDs/dependencies are unique, score sums, and released/planned states are distinct                      |
| Security and privacy |        15 |     13 | Authority and automatic-fail boundaries are explicit; R-032 remains development-only and monitored                   |
| Value reliability    |        10 |     10 | Ledger/checkout invariants and protected commercial-state paths are mandatory in every relevant gate                 |
| Test strength        |        15 |     15 | Parser invariants plus all 177 released unit tests and deterministic validators pass                                 |
| Performance          |         5 |      4 | Machine-readable graph/score are small and local; no dedicated planner benchmark is necessary                        |
| Operability          |        15 |     14 | Owner inputs, rollout, rollback, evidence, dependency bypass, and risk ownership are explicit                        |
| Maintainability      |        20 |     18 | One authoritative roadmap and stable IDs replace broad phases; task-schema validation is currently an inline command |
| **Total**            |   **100** | **94** | Every category reaches at least 80%                                                                                  |

M00 scores 94/100. Its largest discovered weakness—the undocumented development-tool advisory—is now explicit R-032 and does not affect shipped production dependencies. No M00 deterministic failure remains. M01 is active; M02 is ready if the real-store gate waits for owner-controlled access.

## Rollout and rollback

M00 changes documentation and task authority only; no runtime, database, tenant, or value state changes. Rollback is a commit revert. Completed P0–P7 evidence remains retained either way.
