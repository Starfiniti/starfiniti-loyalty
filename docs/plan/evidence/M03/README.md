# M03 Evidence — Earning Rules

Status: in progress.

## Slice 1 — contract, engine, and publication boundary

- `ProgrammeDefinitionV2` is strict and coexists with the unchanged V1 reader/evaluator.
- Six earning sources, allowlisted conditions, explicit purchase exclusions, per-event/member-period caps, deterministic base/multiplier/bonus precedence, and conflict inspection are versioned.
- The pure V2 evaluator uses exact bigint arithmetic and one implementation for live and simulation calls. Tests prove line/rule reordering is value-neutral, only one multiplier wins, activities require authoritative verification, and values beyond JavaScript's safe-integer range remain exact.
- Migration `20260813200000_programme_v2_earning_rules.sql` checks the database-authoritative `programme.v2` entitlement, independently validates direct-RPC input, and materializes immutable tenant-scoped rules on publish/schedule. V1 remains accepted when V2 is disabled.
- `programme_v2_earning_rules_test.sql` covers grants, RLS, cross-tenant denial, canary gating, direct-RPC bypass attempts, strict validation, publication, normalized evidence, and immutability.
- ADR-0011 records the alternatives, concurrent-cap boundary, authority model, UTC window decision, and forward-fix rollback.

Pending before module closure: atomic member-cap usage/award boundary, live V2 WooCommerce evaluation/refunds, signed activity API and connector facts, merchant builder/simulator/publish review, browser/accessibility evidence, exact-head CI/database matrix, canary, and 90/100 score.
