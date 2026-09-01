# ADR-0051: Database-authoritative enterprise access profiles

- Status: Accepted
- Date: 2026-08-26
- Scope: M13 enterprise roles, access review, and authority boundaries

## Context

The tenancy foundation stores live organization memberships in PostgreSQL and derives the signed-in subject from Supabase Auth. It currently recognizes owner, admin, operator, analyst, and auditor. The enterprise roadmap adds marketer and support responsibilities, tenant federation, SCIM, agency administration, and visible support access.

An Authentik upstream identity can authenticate a person but its source, email domain, groups, or mapped claims may be stale or incorrectly configured. Supabase documents that a revoked session's access JWT remains valid until expiry, so sign-out or Auth deletion alone cannot provide immediate application deprovisioning. SCIM also deliberately leaves group authorization semantics to the service provider and scopes `externalId` to the provisioning domain.

## Decision

Create a versioned PostgreSQL catalogue for the seven enterprise access profiles and expose it through one minimized Auth-derived access-review projection.

- Owner, admin, marketer, operator, analyst, and auditor are tenant membership profiles.
- Support is a grant-only profile. It cannot be stored as a permanent organization membership; M13-S05 will bind it to a separately approved, scoped, expiring support grant.
- The catalogue defines M13 administration permissions. Existing loyalty business commands retain their current exact role checks until a later slice deliberately maps them; a label in this catalogue cannot broaden a legacy command.
- Every M13 command rechecks a live database membership or support grant inside PostgreSQL. Email, domain, Authentik source/group, OIDC/SAML attribute, SCIM group, JWT metadata, and browser selectors are never tenant authority.
- Membership permissions are effective only while the organization is active. A suspended organization may retain a read-only recovery review, but the projection marks the assigned profile ineffective and command helpers reject it.
- The first projection accepts one public organization UUID, derives the Auth subject, and returns organization state, the assigned membership profile, its effective state and M13 permissions, seven role definitions, and aggregate live membership counts. It returns no Auth UUID, email, domain, upstream subject/group, token, or secret.
- The permission catalogue and review projection are database owned. Browser, runtime, and worker roles receive no direct catalogue mutation privilege.

## Alternatives considered

1. **Authorize directly from Authentik groups or upstream claims.** This simplifies login configuration, but claim lifetime and IdP mapping mistakes can retain or cross tenant authority. It also conflicts with immediate deprovisioning and the existing RLS model.
2. **Store all seven profiles as ordinary tenant memberships.** This makes the role list uniform, but permanent support membership would bypass approval, scope, expiry, and tenant-visible use requirements.
3. **Keep free-text roles and duplicate checks in each service.** This avoids a new catalogue but makes SCIM group mapping, the merchant access matrix, and future commands drift independently.

The selected approach keeps authentication brokerage separate from tenant authorization and makes the exceptional support path structurally visible.

## Security and compatibility effects

The membership constraint is widened only for marketer; existing rows and role checks remain compatible. Support remains rejected by that constraint. The projection exposes aggregate counts rather than identities and fails closed for absent, revoked, and cross-tenant memberships. A still-valid Supabase JWT cannot recover a revoked membership because PostgreSQL checks the row on every request. Suspended organizations cannot make catalogue permissions effective even when a live membership remains.

## Rollout and rollback

Deploy the additive catalogue and projection before enabling any identity mutation. The read-only Team and access route can be hidden without changing any existing membership or loyalty behavior. Rollback drops the new projection/catalogue objects and restores the prior membership constraint if no marketer has been assigned; once marketer membership is used, forward-fix by revoking or remapping it before constraint rollback. No ledger or customer record changes.

## Sources

- [Supabase user sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase user management and stale JWT behavior](https://supabase.com/docs/guides/auth/managing-user-data)
- [Authentik OAuth source](https://docs.goauthentik.io/users-sources/sources/protocols/oauth/)
- [Authentik SAML source](https://docs.goauthentik.io/users-sources/sources/protocols/saml/)
- [Authentik SCIM provider](https://docs.goauthentik.io/docs/providers/scim/)
- [RFC 7643 SCIM core schema](https://www.rfc-editor.org/rfc/rfc7643)
- [RFC 7644 SCIM protocol](https://www.rfc-editor.org/rfc/rfc7644)
