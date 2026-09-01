# ADR-0122: Treat entitlement authoring drift as a recurring failure

- Status: Accepted
- Date: 2026-09-01
- Decision owners: Starfiniti product and engineering
- Scope: M02, M08, M09, M14, and M16 merchant-authoring boundaries

## Context

Two independently corrected defects share one stable failure shape. The
storefront experience exposed role-correct authoring commands whose persistence
roots did not recheck the disabled `storefront.experience` capability. The
notification workspace was database-safe, but still presented publication,
SMTP test, endpoint creation, and key rotation as usable while the projected
`notifications` capability was disabled. In both cases, a live role and a live
tenant entitlement were represented inconsistently across persistence, server
action, and merchant presentation.

The fixes are intentionally different at the last mile: storefront authoring
needed database triggers on both persistence roots, while notifications needed
an honest UI model that retained endpoint disable and retirement. Treating them
as unrelated would allow the same cross-layer drift to recur in another module
without satisfying M16's second-occurrence rule.

## Options considered

### Keep only the focused regression tests

The tests protect the two corrected surfaces, but do not prove that the central
authoring mutation-root inventory still covers every reviewed capability or
that protected value paths remain structurally excluded.

### Make the browser entitlement snapshot authoritative

This would turn stale presentation data into authorization and would allow a
forged or delayed client decision to grant tenant work. It violates the M02
database-authority boundary.

### Disable every action, including recovery, when a capability is off

This would strand accepted work and prevent risk-reducing endpoint disable,
retirement, schedule pause, and other reviewed recovery transitions.

### Add one cross-layer entitlement regression validator

The validator can preserve the complete reviewed mutation-root inventory,
prove that it contains no protected value capability, and bind the focused
storefront persistence and notification presentation regressions without
granting authority to the browser.

## Decision

1. Register `authorization.entitlement-authoring-boundary-drift` under R-025
   after the storefront persistence and notification presentation occurrences.
2. Extend `scripts/validate-entitlements.mjs` to require all twenty-three
   reviewed authoring mutation roots across nine capabilities and to reject any
   protected `core.*` value path in that inventory.
3. Bind the storefront guard on both theme and English-copy persistence roots,
   its disabled/enabled/disabled pgTAP sequence, preserved readable history,
   read-only merchant presentation, and stale-command guidance.
4. Bind the notification access model and rendered-markup regression: role,
   capability, and deployment mode remain independent; disabled rollout blocks
   new authoring and rotation; owner/admin endpoint disable and retirement stay
   available; managed mode never offers the self-hosted SMTP test.
5. Run eleven deterministic corruption cases from the normal repository gate.
   Missing capabilities, roots, triggers, denial cases, read-only presentation,
   recovery actions, deployment boundaries, rendered disabled controls, or the
   local-only resolver must fail.
6. Keep PostgreSQL authoritative. Browser state may make a control unavailable,
   but cannot grant tenant, actor, provider, configuration, or value authority.
7. Mark the new controls candidate-only until the stacked PR chain receives an
   eligible independent review and merges. This decision changes no production
   entitlement, rollout, provider, checkout, ledger, or customer state.

## Consequences

- A future authoring root or capability must update one explicit inventory and
  preserve the protected-value exclusion before the root check can pass.
- The two original failure paths remain independently testable while their
  common cross-layer invariant gains a durable M16 control.
- Safe recovery transitions remain different from new growth/configuration;
  the validator fails if notification shutdown is collapsed into authoring.
- This is a repository regression gate, not production-canary evidence and not
  grounds to increase M08, M09, M15, M16, or whole-product scores.

## Rollback implications

Reverting the validator must retain this ADR, the recurring-failure evidence,
the storefront database triggers, focused pgTAP cases, notification access
model, and rendered tests. A later replacement must supersede this decision
additively and prove at least the same mutation-root, protected-value,
safe-recovery, stale-command, and merchant-presentation boundaries. Rollback
must not enable a feature, remove history, strand accepted work, or weaken
PostgreSQL authorization.
