# M02 Evidence — Entitlements and Feature Flags

Status: implementation verification in progress.

## Implemented evidence

- Contract v1 enumerates 18 stable capabilities, deployment modes, exact text-form limits, rollout basis points, effective periods, protected paths, and minimized tenant snapshots.
- Migration `20260813190000_deployment_entitlements.sql` adds an immutable catalogue, deployment-mode history, private provider-price history, deterministic rollout history, and tenant-scoped override/canary evidence.
- Six protected paths structurally preserve balances, refunds, reconciliation, checkout independence, exports, and promised redemption in both modes.
- Self-hosted mode is the safe upgrade default and `managed.billing` remains disabled; no Stripe or remote-licence runtime dependency is installed.
- The browser can only call a membership-derived read model. Browser, dashboard runtime, and worker roles cannot mutate authority; workers can only resolve the database decision.
- Forty-six pgTAP assertions cover grants, RLS, exact limits, mode defaults, canaries, 0/100% rollout, provider non-authority, forged claims, revocation, cross-tenant reads, protected paths, and immutability.
- Dashboard parsing rejects empty, duplicate, mixed-mode, mixed-tenant, and malformed snapshots and fails closed for absent capabilities.
- ADR-0010 records alternatives, provider isolation, operational sequencing, and append-only rollback.

## Verification state

- Contract tests: 66 passed.
- Dashboard tests: 86 passed.
- Contract and dashboard typechecks: passed.
- Migration/static validator: passed for 27 migrations and 26 pgTAP files.
- Local Docker replay: unavailable because this Windows host has no running Docker or Podman engine; the exact `npm run db:verify` gate remains required in GitHub Actions before module completion.
