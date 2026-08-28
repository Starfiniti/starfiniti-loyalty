# M16 Evidence — Continuous Improvement

The active fail-closed manifest is `continuous-improvement.yaml`. It records repository controls now and leaves elapsed monthly reviews, the quarterly exercise bundle, the thirteen-source provider/platform/recovery-dependency review, regression controls, scoring, independent review, and owner approval pending.

ADR-0080 closes the current score-subject ambiguity without claiming an elapsed
review. `docs/plan/evaluations/product-score.json` V2 preserves the exact V1
production history, reports deployed `v0.1.11` at 54/100, and reports the exact
integration candidate at 83/100. The candidate remains ineligible because activation
is below its category floor and required live evidence is absent. The deterministic
validator is part of `npm run check`; two future elapsed monthly reviews must still
rescore their affected modules and retain prior/current evidence.

Approved run artifacts belong in `runs/` and must use the five schemas in `infrastructure/governance/continuous-improvement.yaml`. Do not commit raw telemetry, personal data, tenant identifiers, customer data, credentials, receiver destinations, provider payloads, or mutable review drafts.
