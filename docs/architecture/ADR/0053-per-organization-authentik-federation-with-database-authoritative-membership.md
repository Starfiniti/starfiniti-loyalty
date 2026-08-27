# ADR-0053: Per-organization Authentik federation with database-authoritative membership

- Status: Accepted
- Date: 2026-08-26
- Scope: M13-S03 tenant OIDC/SAML federation, secret handling, login discovery, and rollback

## Context

Starfiniti Loyalty already brokers the Starfiniti workforce through Authentik and Supabase Auth. Supabase remains the application-session issuer, and the resulting Auth UUID is the subject used by PostgreSQL RLS. M13-S01 and M13-S02 prove that live database membership—not email, domain, upstream source, mapped group, or JWT metadata—is organization authority.

Tenant federation must add upstream OIDC and SAML without creating a second application session model, exposing provider secrets, allowing browser-selected tenant authority, or depending on an Authentik Enterprise-only flow stage. It must also fail closed when discovery or SAML metadata points at private infrastructure, changes unexpectedly, or produces an ambiguous external provisioning result.

Current official behavior informs the boundary:

- Authentik OAuth sources can consume OIDC discovery, but fetch it only when the source is saved and do not refresh it automatically.
- Authentik SAML sources act as the service provider, support signed requests, and explicitly warn that IdP-initiated login can be a security risk.
- Authentik source property mappings can map user or group attributes, but source identity remains based on the upstream subject/NameID.
- Supabase custom OIDC providers use discovery and PKCE and issue the application session after the broker flow.
- Supabase automatically links OAuth identities that present the same verified email. A tenant-controlled IdP email claim could therefore attach to an existing Starfiniti Auth UUID and inherit its unrelated live memberships if email were requested downstream.
- Supabase manual identity linking requires an existing authenticated session and is disabled unless `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true` in self-hosted Auth.
- Supabase self-hosted SAML can create or link Auth users dynamically, but direct tenant SAML would bypass the locked Authentik broker and would not provide one uniform OIDC application boundary.

## Decision

Use a per-organization brokered topology while retaining Supabase as the only application-session issuer:

1. Each organization federation source has one opaque public Loyalty ID, one deterministic Authentik source slug, and one deterministic Supabase custom-provider identifier. Neither identifier contains an organization slug, email domain, upstream tenant ID, or human identity.
2. An OIDC organization creates an Authentik OAuth source. A SAML organization creates an Authentik SAML source. Both feed a dedicated Authentik OAuth2/OIDC application whose callback is the existing Supabase Auth callback. Each application uses a dedicated open-source authentication flow containing an Identification stage restricted to exactly that source and a User Login stage; it does not depend on the Authentik Enterprise Source Stage.
3. Supabase registers that Authentik application as a custom OIDC provider. The dashboard starts OAuth only after a server-side PostgreSQL resolver returns an enabled provider for a public organization slug. The browser-supplied slug selects a login route, never membership or tenant authority.
4. Public signup remains disabled. A member first authenticates using an existing local or approved workforce identity, obtains live database membership by invitation/SCIM, and explicitly invokes Supabase manual identity linking from the organization access screen. The callback verifies the exact custom provider and rechecks live membership. Regardless of authentication, every application read or command still requires live database membership or a later explicit support grant.
5. Both OIDC hops request only `openid`. The per-tenant Supabase provider is `email_optional`, has an empty custom-claim allowlist, and receives only Authentik's OpenID subject mapping. Authentik profile, email, and group scope mappings are prohibited. The source uses a dedicated subject-derived user mapping and identifier matching rather than email or username matching. Upstream email, domain, group, role, source, and arbitrary claims are never copied into organization membership or used for automatic account selection. Only stable upstream subject continuity is required for explicit identity linking.
6. IdP-initiated SAML login is disabled. All tenant login is service-provider initiated through the Loyalty resolver, Supabase PKCE authorization, Authentik, and the selected upstream source.

### Configuration and state

PostgreSQL stores a tenant-scoped current source, immutable configuration revisions, idempotent command receipts, minimized validation evidence, opaque external object selectors, and SHA-256 fingerprints. The lifecycle is `draft`, `validated`, `enabled`, `disabled`, `review_required`, and `retired`. A source is never publicly discoverable before `enabled`.

V1 permits up to five retained configurations but exactly one active or activating login source per organization. The organization lock serializes activation and refuses a second source while another is enabled, pending, or requires reconciliation, so the organization-slug resolver remains deterministic.

The database-authoritative `enterprise.identity` entitlement gates new source creation, enablement, and secret rotation. Exact retries of accepted work, lifecycle completion, existing enabled login, emergency disablement, and retirement remain available after entitlement loss. This preserves access and recovery while preventing new managed growth.

Authentik source, flow, stage, binding, and key selectors are UUIDs. The Authentik OAuth2 provider primary key is an integer and is typed and stored separately; treating it as a UUID prevents safe reconciliation and is forbidden.

The raw upstream client secret is write-only and transient. It exists only in the browser-to-server request and trusted server provisioning memory. Loyalty stores its SHA-256 fingerprint, never plaintext or recoverable ciphertext. Authentik becomes the only persistent holder after successful provisioning. A lost secret requires a disabled rotation; it cannot be read back.

Immediately before a new enable reservation, the trusted server repeats the bounded discovery/metadata validation and requires exact continuity of the document digest, endpoints, issuer/entity ID, and signing fingerprints. Changed or unavailable evidence leaves the source unreserved and disabled. Exact completed retries and recovery of an already pending operation do not depend on the upstream IdP. After continuity succeeds, the server reserves the exact database revision before calling fixed Authentik and Supabase administration origins loaded from server configuration. Deterministic source/provider identifiers make retries and reconciliation possible. A network failure, rate limit, server error, oversized or malformed response after a mutation is ambiguous and records `review_required`; it never guesses success, automatically activates, or exposes the provider publicly. If the process dies before completion, a live owner may convert the stale pending reservation to immutable ambiguous review evidence only after a five-minute safety window. This clears the pending marker and unconfirmed rotation fingerprint, not confirmed credentials or external objects, so explicit disable/reconciliation can continue.

### Discovery and metadata validation

Before any Authentik source is created or updated, the server performs a bounded validation fetch:

- HTTPS only; default port only; no URL credentials, fragments, IP literals, localhost-like hostnames, redirects, or browser-supplied administration origin.
- Resolve all DNS answers and reject the request if any address is private, loopback, link-local, multicast, reserved, documentation, carrier-grade NAT, or otherwise non-public.
- Pin one reviewed public address for the connection while retaining TLS hostname verification.
- Limit connect/response time, decompressed bytes, and content type; log only a correlation ID, public source ID, outcome code, and fingerprints.
- OIDC requires exact issuer continuity, authorization/token/JWKS endpoints using HTTPS, supported authorization-code behavior, and a bounded JWKS document.
- SAML requires one bounded metadata document, no DTD or external entity, one exact entity ID, a supported HTTP-POST or Redirect SSO service, and exactly one distinct currently valid signing certificate. Multiple concurrent current signing certificates are rejected in V1 because unattended rollover choice would be ambiguous; a controlled rollover workflow remains a recorded limitation.

Validation stores only normalized public endpoints, issuer/entity ID, certificate/JWKS fingerprints, document digest, and validation time. Raw discovery, JWKS, SAML XML, tokens, assertions, secrets, email, and group claims are not retained in Loyalty audit or logs.

Application validation cannot pin the DNS answer used by Authentik during later token, user-info, or SAML calls. Production therefore requires an independent egress boundary around Authentik: allow only its exact private database/cache/proxy dependencies and trusted DNS resolver, deny every other private, loopback, link-local, carrier-grade NAT, multicast, reserved, documentation, and instance-metadata destination for IPv4 and IPv6, and allow public IdP traffic only over the required ports. A controlled DNS-rebinding canary must prove that a hostname changing from public to private remains unreachable. Federation cannot be enabled without this network evidence.

## Alternatives

1. **Register every tenant SAML IdP directly in Supabase Auth.** This is supported by Supabase, but bypasses Authentik, creates separate OIDC/SAML application behavior, and conflicts with the locked identity-broker model.
2. **Use the existing single Starfiniti Authentik provider and choose a source with a query parameter.** This would depend on undocumented routing or the Authentik Enterprise Source Stage. It is not an acceptable open-source or fail-closed foundation.
3. **Authorize from Authentik groups, email domains, or provider claims.** This is operationally convenient but stale, forgeable through mapping mistakes, and incompatible with immediate database revocation and tenant isolation.
4. **Persist recoverable upstream secrets in the Loyalty database.** This makes unattended reconciliation easier but expands the database and worker blast radius. The selected write-only model accepts explicit re-entry after ambiguous or lost-secret outcomes.

## Security and integrity effects

Provider discovery is a public login hint, not authority. Guessing a provider identifier or completing an upstream login grants no Loyalty organization without live membership. Disabling a source stops new resolver output immediately but does not delete existing Auth identities, memberships, audit, or value history. Existing sessions continue to be constrained by live PostgreSQL membership and organization state.

An unauthenticated request can still reach the public Supabase custom-provider endpoint directly and may create an orphan Auth principal. That principal has no organization membership and therefore no Loyalty authority. The supported enrollment path is explicit linking from an existing invited account; orphan cleanup is operational hygiene, not an authorization control.

The Authentik and Supabase administration credentials are separate mounted secrets with least-privilege service identities. They never enter contracts, PostgreSQL, browser output, audit metadata, or application logs. External provisioning does not run in a value worker and cannot affect checkout, ledger, refunds, reconciliation, or customer login. The Authentik egress boundary is a required compensating control for post-validation DNS rebinding; dashboard socket pinning alone is insufficient.

## Rollout and rollback

Deploy additive schema and disabled UI first. Create one disabled Starfiniti source, validate its exact discovery/metadata evidence, provision deterministic external objects, and verify one pre-provisioned user. Enable the public resolver only for that organization, observe, then test disablement and local owner password recovery.

Rollback first disables the database resolver entry, then disables the Supabase custom provider and Authentik application/source. It retains Auth users, memberships, immutable revisions, and audit. External deletion is a separate retirement operation after observation; rollback never deletes identity continuity.

## Official references

- [Authentik OAuth source](https://docs.goauthentik.io/users-sources/sources/protocols/oauth/)
- [Authentik SAML source](https://docs.goauthentik.io/users-sources/sources/protocols/saml/)
- [Authentik sources and policy bindings](https://docs.goauthentik.io/users-sources/sources)
- [Authentik service accounts and API tokens](https://docs.goauthentik.io/users-sources/user/account-types/service-accounts)
- [Supabase custom OAuth/OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase self-hosted SAML SSO](https://supabase.com/docs/guides/self-hosting/self-hosted-saml-sso)
