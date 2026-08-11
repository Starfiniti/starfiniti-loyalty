# ADR-0005: Database authorization and schema boundaries

- Status: Accepted
- Date: 2026-08-11
- Scope: Supabase Auth, PostgREST exposure, application roles, and RLS

## Context

The platform is multi-tenant and self-hosted. Supabase secret/service keys bypass ordinary RLS and are too powerful for browsers, WordPress, or routine server requests. JWT organization claims can be stale, and `user_metadata` is user-editable. Direct application ownership of tables would also bypass RLS expectations.

## Decision

Use Supabase Auth for authentication and database membership rows as the authorization source of truth.

- `loyalty` is the only candidate Starfiniti Data API schema. Exposure and grants are explicit; `anon` receives none.
- Every `loyalty` table enables RLS and uses live, indexed membership/customer-link checks.
- `loyalty_private` is never exposed and holds privileged functions and restricted internal tables.
- Browser clients receive only the publishable key. They never receive a Supabase secret/service-role key or a database credential.
- Routine servers use dedicated least-privilege roles without superuser, ownership, or `BYPASSRLS`.
- Balance-affecting writes execute through narrow private command functions owned by a `NOLOGIN` role. Functions use an empty search path, schema-qualified names, locked-down `EXECUTE`, verified actor context, and in-function authorization.
- Membership roles are not authorized from `user_metadata`, email, or a client-provided tenant ID.

## Alternatives

1. **Use the service-role key for all server access.** Simple, but a server bug or credential leak bypasses all tenant policies and makes least privilege untestable.
2. **Authorize only in Next.js.** Faster to prototype, but one missing filter becomes a cross-tenant incident and database access paths drift.
3. **Put organization roles in JWT metadata.** Avoids lookups, but claims are stale and user metadata is unsafe; even app metadata is not immediate enough for revocation-sensitive actions.

## Security and integrity effects

Tenant isolation is enforced at application, privilege, RLS, and composite-foreign-key layers. Compromise of a publishable key yields no tenant data without an authorized user. Compromise of a runtime credential is bounded to approved command functions rather than arbitrary table DML.

## Operations

Runtime, worker, migration-owner, and break-glass credentials rotate independently. RLS helper performance is monitored and every policy column is indexed. PostgREST schema exposure is configuration-reviewed during deploys.

## Migration and rollback

Phase 3 creates roles, schemas, helpers, grants, policies, and tests before any browser-facing data path. Rollback revokes new grants and removes empty tables/functions through a forward migration. Once tenant data exists, schema removal requires export/restore evidence; authorization may be tightened without rewriting data.
