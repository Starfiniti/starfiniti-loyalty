# ADR-0054: Authentik-correlated SCIM and live membership reconciliation

- Status: Accepted
- Date: 2026-08-26
- Scope: M13-S04 SCIM 2.0 users/groups, credential lifecycle, role mapping, and deprovisioning
- Supersedes: ADR-0053 only where its downstream Authentik OIDC subject mode was `user_uuid`

## Context

Starfiniti Loyalty authorizes organizations from live PostgreSQL memberships whose subject is a Supabase Auth UUID. A SCIM client normally knows an external directory identifier, username, and groups; it does not know the Supabase Auth UUID that will be minted when the person first completes brokered SSO. Creating a Supabase user from SCIM email would make a mutable identity attribute part of tenant authorization, could collide with Supabase automatic email identity linking, and would require the SCIM runtime to hold an Auth administration secret.

Authentik is already the required broker for organization OIDC/SAML. Its open-source SCIM provider is an outbound backchannel provider. Current Authentik documentation states that the default SCIM `externalId` is identical to the OIDC subject when the OAuth2 provider uses **Based on the User's hashed ID**. This gives Loyalty one opaque, stable correlation value across provisioning and authentication without email, username, domain, role, or arbitrary upstream claims.

SCIM also has different authority and retry semantics from browser commands. A bearer credential can provision an entire organization, PATCH group membership has ordered operations, clients retry after lost responses, and deprovisioning must invalidate an already issued application session on its next database request. The implementation therefore needs a database-authoritative provisioning boundary rather than direct table access or browser-held role claims.

## Decision

1. Authentik is the supported SCIM client for GA. Each organization federation source may have one active Loyalty SCIM endpoint and one one-time 256-bit bearer credential. The endpoint URL contains only an opaque public UUID. PostgreSQL stores only SHA-256 credential digests and immutable rotation/revocation evidence; raw tokens are returned once and never logged.
2. The tenant Authentik OAuth2 provider uses `sub_mode: hashed_user_id`. Its OIDC `sub` therefore matches Authentik's default outbound SCIM `externalId`. This replaces the not-yet-enabled `user_uuid` setting from ADR-0053 before any production federation canary. The two OIDC hops still request only `openid`, and no email, profile, group, domain, or custom authority claim is added.
3. SCIM `externalId` is required for Users and is unique inside one endpoint/source. `userName`, display name, and the primary email accepted for SCIM interoperability are confidential directory attributes, not authorization selectors. They are tenant-scoped, never copied into membership authority or audit metadata, and never used to find or merge a Supabase Auth user.
4. Provisioning alone creates no Auth principal and no membership. On a successful organization SSO callback, a private PostgreSQL command derives the current Supabase subject and the exact provider identity from `auth.identities`; it accepts no browser-supplied user, provider, tenant, email, or external ID. A new SCIM-managed membership is created or reactivated only when the verified OIDC provider subject equals an active SCIM User `externalId` for the same enabled federation source and that user resolves to exactly one allowlisted role. A pre-existing live invitation-created membership remains authoritative after exact provider authentication and is never silently converted to SCIM provenance; a revoked manual membership fails closed.
5. SCIM groups never map by display name. An owner or admin explicitly maps an opaque synchronized Group resource to one of `admin`, `marketer`, `operator`, `analyst`, or `auditor`. SCIM can never grant `owner`. No mapped group grants nothing. More than one distinct mapped role is an authority conflict and grants nothing until an administrator resolves it.
6. Every User activation change, Group membership mutation, role-map mutation, endpoint revocation, and resource DELETE reconciles the bound membership inside the same transaction. `active:false`, DELETE, loss of the only mapped role, conflicting mapped roles, or endpoint revocation immediately sets `organization_memberships.revoked_at`; an existing JWT then fails the next PostgreSQL authorization check. Re-activation uses the same membership row and increments its lifecycle revision rather than creating duplicate authority. DELETE retains a tombstone, an exact retry returns the already-achieved 204 state, and later POST with the same external ID reactivates the same immutable resource identity. Reprovisioned Groups never recover a prior reviewed role mapping automatically.
7. Supported SCIM V1 exposes `/ServiceProviderConfig`, `/ResourceTypes`, `/Schemas`, `/Users`, and `/Groups` using `application/scim+json`, including individual supported ResourceType and Schema retrieval. It supports bounded 1-based pagination; exact `eq` filters for resource `id`, `externalId`, and the canonical lookup attributes; complete POST/GET/PUT/DELETE; and sequential PATCH `add`, `remove`, and `replace` for the documented User and Group paths. Bulk, sorting, password change, and arbitrary filter expressions are not advertised.
8. Exact create retries with the same source identifier and representation return the existing resource and never duplicate users, groups, memberships, or audit. A conflicting representation returns SCIM `409 uniqueness`. DELETE retry is idempotent, while tombstone reprovisioning advances the existing resource revision. Updates use immutable public resource IDs and revision-derived ETags; stale conditional writes fail. Credential rotation rejects the current digest even under a new idempotency key. PostgreSQL serializes each endpoint and affected resource, applies a per-minute endpoint quota, and re-derives endpoint, organization, federation source, and credential authority from the digest.
9. SCIM audit retains resource IDs, revisions, actions, result codes, request digests, correlation IDs, and actor type only. It does not retain tokens, credential plaintext, email, username, display name, bearer headers, or raw request bodies. Directory resource tables remain inaccessible to `anon`, `authenticated`, and ordinary workers; only narrow SCIM and merchant administration functions can project minimized state.

## Alternatives considered

1. **Create or find Supabase Auth users by SCIM email.** This is familiar but makes email an authorization join, risks automatic-linking collisions, and expands the service-role blast radius. Rejected.
2. **Require the enterprise IdP to send a Supabase Auth UUID.** This is strongly bound but impossible before first login and exposes an application-internal identifier to the directory. Rejected.
3. **Provision a pending record and require an owner-issued invitation for every user.** This preserves the existing capability boundary but defeats automatic SCIM activation/deprovisioning and creates a second enrollment workflow. Kept as a manual recovery option, not the normal path.
4. **Correlate Authentik's default SCIM external ID with its hashed OIDC subject.** This is provider-documented, opaque, tenant/source-scoped, and proves both prior provisioning and current broker authentication. Selected.

## Security and compatibility effects

An IdP login by itself still grants nothing. A SCIM record without a verified matching provider subject grants nothing; a verified subject without an active SCIM record and one unambiguous allowlisted role grants no new authority. The only alternative is a pre-existing, live database membership created through the reviewed invitation/manual lifecycle. Email, username, domain, OIDC/SAML group claims, JWT metadata, and SCIM group names remain non-authoritative.

Changing ADR-0053's downstream subject from Authentik UUID to hashed user ID changes the subject exposed to Supabase for tenant providers that have not entered production. Existing Starfiniti workforce login is untouched. Any disposable S03 test identity must be relinked during the S04 canary; no organization membership, ledger, customer link, or loyalty value is rewritten.

The SCIM bearer token is high-trust organization provisioning authority but has no ledger, customer, checkout, billing, or cross-tenant privilege. Endpoint revocation and membership reconciliation remain local PostgreSQL operations and do not depend on Authentik availability.

## Rollout and rollback

Deploy the additive schema and disabled administration UI first. Create and immediately rotate a disposable endpoint, configure Authentik's SCIM backchannel with the one-time token, synchronize one non-owner test group and user, link through the exact hashed OIDC subject, then test role change, `active:false`, DELETE, credential rotation, replay, and stale-session denial. Keep the organization federation source disabled outside the controlled canary.

Rollback revokes the SCIM endpoint and all SCIM-managed non-owner memberships, disables the administration surface, and retains resource tombstones, credential digests, memberships, and immutable audit. Local owners and capability invitations remain available. Rollback never deletes an Auth user, rewrites a membership history, or changes loyalty value.

## Official references

- [SCIM core schema, RFC 7643](https://www.rfc-editor.org/rfc/rfc7643)
- [SCIM protocol, RFC 7644](https://www.rfc-editor.org/rfc/rfc7644)
- [Authentik SCIM provider and OIDC correlation](https://docs.goauthentik.io/add-secure-apps/providers/scim/)
- [Supabase Auth users and server-side invitations](https://supabase.com/docs/guides/auth/users)
- [Supabase Auth identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
