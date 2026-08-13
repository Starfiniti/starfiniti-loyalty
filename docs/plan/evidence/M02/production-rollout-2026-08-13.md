# M02 production rollout — 2026-08-13

## Change

- Source: merged `main` commit `3e26165376d6bd1b135c5236887452314a2d58aa` (PR #24).
- Database: pinned production PostgreSQL `17.6.1.136` on the isolated Supabase VM.
- Pre-change recovery point: `base-20260813T170256Z.tar.gz`; the database-only systemd backup completed with result `success` before migration.
- Applied additive migration `20260813190000_deployment_entitlements.sql` with SHA-256 `d060eb65241872f1e4febeb9d5f0d8bb3b18e4dbb4155cf62017094cad13f057` in one PostgreSQL transaction and registered version `20260813190000` once.
- Appended deployment mode `managed`, catalogue version 1, with an attributable production deployment reference and reason.
- Appended one `programme.v2` canary for the only active approved Starfiniti tenant. No tenant ID, Auth ID, provider ID, price, or secret is retained in this evidence file.

## Verification

- Migration history: 1 exact v27 row.
- Catalogue: 18 version-1 capabilities.
- Current mode: `managed`, catalogue 1; two immutable mode records preserve the initial self-hosted default and managed transition.
- Starfiniti canary: `programme.v2 = true`, source `tenant_override`.
- Protected paths: 6 declared, 6 enabled.
- Managed billing: disabled from `deployment_default`.
- Provider Price IDs: zero.
- Browser direct entitlement INSERT privilege: false.
- Live member snapshot: 18 capability rows, 7 enabled (six protected paths plus the canary).
- WAL archive after rollout: 519 archived, zero failed, last archive present.
- Public dashboard readiness: HTTP 200 `ok`.
- Unsigned WooCommerce event and command requests: HTTP 401.

## Observation and rollback

The migration and read model are live; no M03 runtime behavior exists yet, so the canary cannot create value or customer-visible effects. Existing application and worker images remain healthy and backward-compatible because the migration is additive. If the entitlement boundary regresses, append a disabled `programme.v2` tenant decision or a zero-percent rollout; retain both configuration versions and all protected value paths. Do not delete the canary or restore an older database over later writes.
