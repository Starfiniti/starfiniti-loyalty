# Continuous improvement operations

This runbook governs M16. It makes product learning, operational follow-up, and vendor change review reconstructable without pretending that elapsed cadence exists before it does. Times and review periods use UTC.

## Authority and safety

- The source-controlled plan defines cadence, ranking, score floors, artifacts, and deterministic failures. It does not grant production, tenant, value, provider, billing, security, or approval authority.
- Evidence is minimized, immutable after review, digest-bound, and stored under `docs/plan/evidence/M16/runs/`. Do not put names, email addresses, tokens, cookies, tenant identifiers, customer data, coupon plaintext, raw provider payloads, or incident secrets in Git.
- A missing source is unknown. Never coerce missing metrics, provider checks, exercise output, or owner review into a healthy zero.
- Historical evidence is never edited to improve a result. Corrections are new records. Architecture decisions are superseded through a later ADR.

## Monthly review

Close each calendar month within ten days. The initial M16 gate requires two distinct consecutive months; one review copied twice does not qualify.

1. Bind the period, exact repository/release identities, source digests, reviewer, and observation time.
2. Review activation, errors, support, reconciliation, fraud, campaigns, churn, usability, performance, security, and billing. Each section records source freshness, the baseline, observed result, target, interpretation, and linked action or explicit no-action rationale.
3. Review every official provider, platform, and recovery-dependency source in the canonical catalogue. Record the installed version/release and digest-bound provenance for every exact endpoint declared by the catalogue, the candidate version/entry and digest-bound provenance, breaking/security/support impact, affected modules, an owner, and the resulting task, ADR, test, upgrade plan, or explicit no-impact rationale. Recovery review covers both ends of privileged transport boundaries; a host-only or guest-only version check is incomplete and fails validation.
4. Recompute the evidence-ranked backlog. Verify the arithmetic and exact order. Critical work is due within two days and High work within fourteen days unless a distinct approved-risk digest, external dependency, and future review instant exist; `blocked_external` is not “done.”
5. Rescore every module changed materially in the period. Preserve the prior score and evidence; record category weights, new evidence, and the reason for each change. Keep deployed-production and integration-candidate subjects distinct under ADR-0080; a candidate score is not elapsed production evidence.
6. Review failures and incidents by stable fingerprint. At the second occurrence, link at least one merged regression test, validator, monitor, runbook, or agent rule. A ticket or promise alone is not a durable control.
7. Review experiments. Promotion requires a predeclared primary metric, baseline, target, guardrails, measured improvement, and every guardrail passing. Stop an experiment immediately on guardrail breach.
8. Sign and checksum the completed monthly artifact. Do not overwrite it after review.

## Quarterly exercises

Within thirty days after each calendar quarter, execute and reconcile all five exercises against the approved release and environment:

- full-service restore with measured database/WAL/Auth/application/configuration/signing/connector RPO and RTO;
- adversarial tenant-isolation and revoked-membership checks;
- privacy consent, suppression, export, deletion, pseudonymization, and retained-evidence checks;
- SCIM deprovisioning with stale-session denial and forged domain/group/metadata failures;
- incident detection, primary/secondary notification, acknowledgement, escalation, protected-path continuity, postmortem, and regression follow-up.

Each exercise binds its approval, environment, exact inputs, start/end, outcome, source coverage, unexplained differences, open findings, owner, and a separate report digest. Restore or fault exercises follow their dedicated safe controllers; M16 never expands their authority. Any unexplained protected-value, tenant, privacy, recovery, checkout, or data-loss difference fails the bundle.

## Evidence closeout

M16 initial close requires five distinct digest-bound artifacts: two consecutive monthly reviews, one quarterly exercise bundle, one final reconciliation, and one approval record. Reviews and exercises bind the candidate governance commit plus exact plan/backlog digests; the final approval cryptographically binds the other four artifact digests and future active review dates. The reconciliation proves:

- no due review or exercise is missing;
- all thirteen canonical provider, platform, and recovery-dependency sources plus dependency pins are current through the review cutoff;
- ranking arithmetic and order are exact, with no overdue unaccepted Critical or High item;
- every recurring failure has a durable control;
- every materially affected module was rescored and retained its historical score;
- promoted experiments improved their declared metric and passed all guardrails;
- all quarterly exercises passed with zero unexplained protected difference;
- the roadmap, task graph, status, risks, scorecard, iteration log, and evidence index agree;
- the M16 score is at least 90/100 and every category reaches 80% of its weight.

An independent reviewer checks artifact digests, chronology, source freshness, backlog arithmetic, score history, regression links, experiment decisions, and exercise separation. Product, engineering, security, operations, and the owner approve the final record. The recurring schedule continues after initial close; a later missed cadence reopens the operational gate and creates a ranked backlog item.

Run `npm run product-score:validate` and `npm run continuous-improvement:validate` before review. The first command verifies score arithmetic, subject identity, category floors, automatic failures, exact evidence and commit bindings, preserved history, and the human scorecard marker. The second verifies the elapsed-cadence and closeout contract. Both must pass; neither creates missing live evidence.

## Rollback and stop conditions

Continuous-improvement history is append-only, so it is not rolled back. Stop or pause the affected experiment, provider upgrade, rollout, or exercise when a guardrail fails. Preserve accepted commerce events, ledger value, customer access, refunds, reconciliation, exports, promised rewards, and native checkout. Correct the condition through a forward fix, compensating value transaction where required, new evidence, and an ADR when the decision changes.
