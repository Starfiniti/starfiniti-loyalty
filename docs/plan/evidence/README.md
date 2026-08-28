# Module Evidence

Each module stores durable, secret-free evidence below `docs/plan/evidence/MXX/`. A module cannot be marked complete from prose alone.

The module index must record:

1. source branch, commit, release, production version, and relevant provider versions;
2. hypothesis, baseline, target, score before/after, and largest corrected weakness;
3. acceptance and failure cases with exact automated and manual commands;
4. links or checksums for browser, API, worker, PostgreSQL, connector, security, accessibility, load, recovery, and operational results as applicable;
5. canary tenant and feature-flag state without tenant secrets or personal data;
6. reconciliation totals and any explained difference;
7. rollout time, observation window, rollback trigger, rollback execution/result, and retained compatibility;
8. remaining limitations, external inputs, owner approval where required, and the next safe task.

Raw evidence containing secrets, personal data, coupon codes, production payloads, or infrastructure credentials stays in the approved restricted evidence store. The repository records only minimized summaries, checksums, timestamps, and retrieval instructions.

Whole-product scoring uses `docs/plan/evaluations/product-score.json` V2. It keeps
the deployed-production and integration-candidate subjects separate, binds both to
exact commits and evidence paths, and preserves prior score files by digest. The
candidate is used for development prioritization only; production remains the
runtime truth. Module-local scoring uses 100 points across correctness,
security/tenancy/privacy, value reliability, tests, performance, operability, and
maintainability. Completion requires at least 90/100, at least 80% in every relevant
category, and no automatic failure. Run `npm run product-score:validate` after every
material score change.
