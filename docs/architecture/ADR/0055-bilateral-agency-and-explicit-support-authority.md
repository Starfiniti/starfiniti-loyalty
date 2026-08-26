# ADR-0055: Bilateral agency portfolios and explicit support authority

- Status: Accepted
- Date: 2026-08-26
- Scope: M13-S05 agency portfolios, support grants, break-glass access, organization export/deletion, and terminal offboarding

## Context

Agencies need one portfolio view across client organizations, and Starfiniti operators sometimes need temporary diagnostic access. Neither need justifies a permanent tenant membership, an identity-provider claim, or a platform-wide bypass. A portfolio relationship must not make customer, ledger, programme, connector, or tenant data visible. Support access must be approved by the affected tenant, limited to exact read-only projections, expire quickly, and produce tenant-visible evidence every time it is exercised.

The tenancy foundation contains an unused `support_access_grants` table with broad free-form scopes and direct authenticated `SELECT`. That placeholder exposes Auth UUIDs and has no request, approval-separation, session, revision, or use-audit model. It is not sufficient authority and cannot be activated as-is.

Organization offboarding currently revokes non-owner memberships and pending invitations but does not explicitly revoke every later federation, SCIM, service-account, connector, notification, export, agency, or support credential. Hard-deleting the organization would cascade or sever evidence that is required to explain balances and historical effects. Conversely, retaining reusable identity attributes and active credentials after a terminal deletion request would violate the privacy and offboarding boundary.

Current official guidance reviewed on 2026-08-26 establishes the implementation constraints:

- Supabase warns that `auth.uid()` is null without a valid session, that user-editable metadata must not authorize access, and that privileged functions require an empty `search_path` with fully qualified names.
- Supabase access tokens carry a `session_id` that correlates with `auth.sessions`. JWTs are short lived, so sensitive support and break-glass operations need a live-session check in addition to claim validation.
- Supabase MFA exposes `aal2` in the signed JWT. Break-glass elevation can therefore require both AAL2 and a current Auth session without trusting browser-supplied assurance.
- PostgreSQL RLS defaults to deny when enabled without a policy, but table owners and `BYPASSRLS` roles can bypass it. Narrow explicitly granted functions and adversarial privilege tests remain necessary.
- PostgreSQL row locks block competing writers until transaction end. Multi-organization commands must lock organizations in stable ID order to avoid deadlocks.

## Decision

### Agency portfolios

1. An agency portfolio relationship is an explicit bilateral organization-to-organization record. A client owner creates a one-use 256-bit invitation and stores only its SHA-256 digest; an owner of the invited agency organization accepts it. The relationship records both organizations, both owner approvals, lifecycle revisions, and immutable audit evidence.
2. Acceptance locks both organization rows in ascending internal-ID order, requires both organizations to be active and distinct, and requires the accepting subject to be a live owner of the agency organization. Reuse with changed input fails; concurrent acceptance yields one effect.
3. Either organization's live owner may revoke the relationship immediately. Revocation retains the relationship and audit history.
4. The portfolio projection contains only opaque organization IDs, names, relationship status, and timestamps. It contains no workspace, customer, wallet, programme, connector, membership, identity, or ledger data.
5. A relationship never creates a membership and is never consulted by general tenant RLS or product commands. Agency personnel need a separate tenant invitation for ordinary tenant administration. The relationship is only an eligibility prerequisite for a separately approved support grant.

### Support access

1. A live owner, admin, or operator in the agency organization may request support for a related client organization. PostgreSQL derives the requesting Auth subject, verifies the active bilateral relationship, and stores an exact subset of the V1 read-only scopes: `organization.summary.read`, `members.summary.read`, `identity.health.read`, and `audit.summary.read`.
2. A live client owner other than the requester approves or rejects the request. Approval sets a start time and an expiry no more than four hours later. The client owner may narrow scopes or duration but may not expand the request. The requester cannot approve, and a client member cannot be the support subject for that client.
3. The existing placeholder grant table is hardened and used only through exact commands. Direct authenticated table access and the legacy RLS policy are removed. New grants are linked to one approved request and active agency relationship, use an explicit V1 revision, and are unavailable after relationship, organization, agency membership, Auth session, expiry, or grant revocation changes.
4. A support read calls one volatile projection function with the public grant ID. PostgreSQL derives the current user and signed session ID, checks the session against `auth.sessions` through a boolean-only migration-administrator-owned bridge, rechecks every authority boundary, applies scopes field-by-field, and appends an immutable use event in the same transaction. No loyalty role receives `auth` schema/table access, and no support membership or broad RLS path exists.
5. Tenant owners, admins, and auditors receive a minimized administration projection showing requests, grants, exact scopes, status, and every use. It omits Auth UUIDs, email, provider claims, tokens, secrets, raw identity data, and support-visible customer or ledger data.
6. V1 support is deliberately read-only. A future mutation scope requires a new contract/ADR and its own dual-control, reversible command. A label or UI action cannot silently expand a V1 grant.

### Break-glass owner access

1. Break-glass is not support impersonation and grants no new tenant role. A retained live owner may open a 30-minute recovery session only with a signed `aal2` JWT whose `session_id` is present for that subject in `auth.sessions`, plus an 8–500 character reason.
2. Break-glass exposes only organization summary, immutable administration history, export manifest, and recovery state. It cannot mutate loyalty value, membership, federation, SCIM, agency, support, billing, or connector state.
3. Session creation and every projection use append immutable, tenant-visible events. Revoking or terminating the Auth session fails the next use even if an older access token has not expired.

### Export, deletion, and offboarding

1. Organization export is a bounded, versioned administrative manifest assembled from live PostgreSQL authority. It contains configuration/resource identifiers, counts, lifecycle and credential states, and ledger reconciliation totals; it excludes secrets, raw tokens, raw PII, customer contact data, private payloads, and arbitrary audit metadata. Existing subject and analytics exports remain their authoritative detailed workflows.
2. Offboarding remains terminal and preserves one owner solely for export and recovery evidence. In one serialized command it explicitly revokes or disables organization memberships, invitations, support requests/grants, agency relationships, federation sources, SCIM endpoints and SCIM-derived memberships, service accounts and credentials, commerce connections, notification provider/webhook endpoints, scheduled reports, and unused aggregate-export capabilities. It pseudonymizes mutable SCIM directory attributes while retaining opaque resource identities and immutable provisioning evidence.
3. A deletion case can be requested only after offboarding. It uses a seven-day cooling period, exact revision, reason, idempotency, and immutable events. The retained owner may cancel before the due time. Completion rechecks the state, repeats credential revocation defensively, pseudonymizes the organization name/slug and mutable merchant identity labels, and revokes the last membership. It never deletes or rewrites ledgers, programme versions, canonical events, effect receipts, audit events, or migration evidence.
4. Cancellation restores no credential or previously revoked access. There is no automatic restore after deletion completion. A legal or operational correction requires a new superseding decision; historical evidence is never rewritten.

## Alternatives considered

1. **Agency membership in every client tenant.** Simple, but it conflates portfolio discovery with tenant authority, increases standing access, and makes revocation/error isolation difficult. Rejected.
2. **Platform-wide support role or service-role proxy.** Operationally convenient, but invisible to tenants and capable of bypassing RLS. Rejected.
3. **Tenant-approved support membership.** Reuses existing roles but overgrants every product command assigned to that role and cannot express per-use evidence. Rejected.
4. **Email/domain/group based agency or support discovery.** Mutable, forgeable, and incompatible with database-authoritative membership. Rejected.
5. **Hard-delete the organization and cascade dependants.** Removes data quickly but destroys required value/audit explanation and makes restored backups unsafe. Rejected.
6. **Retain all configuration unchanged and only mark the organization closed.** Preserves evidence but leaves credential and privacy exposure. Rejected.

## Security and compatibility effects

V1 readers and existing membership authorization remain unchanged. Agency and support tables have RLS enabled with no direct browser policies. Only exact security-definer functions in the exposed `loyalty` schema are granted to `authenticated`; every one has an empty search path, bounded input, live subject derivation, tenant locks, and minimized output. Support and break-glass never invoke the ledger or product mutation primitives.

The pre-existing unused support rows are treated as legacy-unreviewed and are not effective. No production grant exists, so this is a fail-closed compatibility change. If an installation inserted unsupported rows manually, they remain retained for audit but gain no authority until recreated through V1 approval.

Offboarding changes terminal cleanup, not the meaning of historical events. Checkout independence remains: disabled commerce connections stop new hub ingestion, but the WooCommerce plugin and native checkout continue operating without a synchronous hub dependency.

## Rollout and rollback

Deploy the additive migration and administration UI disabled. Exercise one agency invitation/accept/revoke flow, one denied self-approval, one four-hour-or-shorter read-only support grant, live-session termination, AAL2 break-glass, export manifest, and a disposable organization offboarding/deletion rehearsal. Enable first for the Starfiniti provider organization and one consenting pilot tenant.

Rollback revokes all active support grants and agency relationships and hides the administration surfaces. Retained immutable request, relationship, use, break-glass, offboarding, and deletion evidence remains readable to authorized owners/auditors. Rollback never restores a revoked credential or removes pseudonymization; recovery is a deliberate forward action.

## Official references

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Auth sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Auth MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [PostgreSQL row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [PostgreSQL explicit locking and deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html)
