# ADR-0008: Broker workforce Authentik through Supabase Auth

- Status: Accepted
- Date: 2026-08-13
- Scope: workforce sign-in, Supabase identity continuity, and tenant bootstrap

## Context

Starfiniti Loyalty already uses self-hosted Supabase Auth sessions and `auth.uid()` as the subject for database memberships and RLS. Starfiniti workforce identities are centrally governed in Authentik, while Loyalty also serves customer identities whose password reauthentication and account lifecycle must remain separate. Public signup is disabled in production.

The production GoTrue release is 2.189.0. Its custom-provider flow can link an external OIDC identity to a deliberately pre-provisioned same-email Auth user, but it rejects first-time external account creation while signup is disabled.

## Decision

Register Authentik as a Supabase custom OIDC provider named `custom:starfiniti-sso` and keep Supabase Auth as the application session broker.

- Authentik uses a per-provider issuer, an asymmetric signing key, authorization-code flow, PKCE, and a strict callback of `https://api.loyalty.starfiniti.com/auth/v1/callback`.
- The dashboard starts OAuth with an exact callback of `https://loyalty.starfiniti.com/auth/callback` and scopes `openid profile email`.
- The callback exchanges the PKCE code with Supabase Auth. Application routes continue to consume the Supabase session and UUID.
- Authentik group `app-loyalty-admin` controls access to the central application. Loyalty organization roles still come only from live database memberships and RLS; OIDC groups, email domain, and user metadata grant no tenant authority.
- Customer password login remains available. Workforce SSO is not offered during customer-export password reauthentication.
- With signup disabled, operations may create the approved owner Auth principal without a password, tenant, role, or business data. The initial tenant bootstrap remains blocked until a real owner SSO session links the custom identity and the resulting UUID is verified.

## Alternatives

1. **Use Authentik directly in Next.js.** This would create a second application session model and break the direct relationship between the signed-in subject, `auth.uid()`, memberships, and existing RLS tests.
2. **Enable public signup for the first OIDC login.** This widens the production account-creation boundary and makes entitlement mistakes more consequential.
3. **Authorize tenants from Authentik groups or OIDC claims.** Those claims can be stale and do not encode Loyalty's organization lifecycle or immediate membership revocation.
4. **Replace customer password authentication with workforce SSO.** Customer and workforce identity domains have different ownership, recovery, and reauthentication requirements.

## Security and integrity effects

The browser receives only the existing publishable key. The Authentik client secret and Supabase administration credential remain server-side and are transferred without logging. The OAuth authorize destination is validated against the configured Supabase origin, exact `/auth/v1/authorize` path, and exact provider identifier before redirect.

An Authentik entitlement allows authentication but does not authorize any Loyalty tenant. The database UUID remains the durable identity for membership, audit, and RLS, including after rollback.

## Operations

Deploy the Authentik blueprint and custom Supabase provider only after backups/snapshots exist. Verify OIDC discovery and provider metadata before pre-provisioning the owner Auth principal. Verify a real linked identity and session before running the existing atomic tenant-bootstrap command.

## Migration and rollback

Rollback disables the custom provider and restores the previous application image while retaining the Auth user and UUID. Removing a linked OIDC identity or restoring the database is an incident-level action because it can disrupt identity continuity; it is not part of routine application rollback.
