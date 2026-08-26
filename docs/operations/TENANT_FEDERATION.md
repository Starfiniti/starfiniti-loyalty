# Tenant federation operations

SCIM provisioning for the same tenant source is documented separately in
[`TENANT_SCIM.md`](./TENANT_SCIM.md). Federation authentication cannot create
tenant authority by itself; an enterprise user must be invited manually or
correlated through active SCIM provisioning and one reviewed group-role map.

This runbook enables per-organization OIDC or SAML through Authentik while Supabase Auth continues to issue application sessions. PostgreSQL membership remains the authorization authority. Do not treat an IdP email, domain, group, role, NameID, or JWT claim as organization access.

## Production prerequisites

1. Run a currently supported Authentik release containing every published security fix. The SAML source fixes first appeared in `2026.2.3`; the supported 2026.2 line must be at least `2026.2.6`, and a newer supported line must use its latest patch. Do not deploy the now-unsupported 2025 maintenance lines merely because they received the original backport. Verify the release against Authentik's current security policy and advisories before every rollout.
2. Put Authentik behind an enforced IPv4/IPv6 egress policy before creating a tenant source. Allow its exact private PostgreSQL, cache, reverse-proxy, monitoring, and trusted DNS-resolver destinations and ports; deny every other private, loopback, link-local, carrier-grade NAT, multicast, reserved, documentation, and instance-metadata destination. Permit public IdP traffic only on the reviewed ports. This network boundary is mandatory because Authentik resolves token, user-info, and SAML endpoints after the dashboard's socket-pinned validation and DNS can rebind later.
3. Keep IdP-initiated SAML disabled. The generated source requires both the response and assertion to be signed with SHA-256 and accepts one current signing certificate in V1.
4. In self-hosted Supabase Auth set `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true`, retain disabled public signup, and retain PKCE. Add only these dashboard routes to the Auth redirect allowlist:
   - `https://loyalty.starfiniti.com/auth/callback`
   - `https://loyalty.starfiniti.com/auth/link/callback`
5. Confirm the installed Supabase Auth build exposes the custom-provider administration API used by the pinned JavaScript client. Test create, disabled update, enable, disable, and ambiguous timeout behavior in staging before production.
6. Keep one active organization owner with a local password. PostgreSQL rejects federation enablement without this break-glass path.

## Authentik administration identity

Create a dedicated service account and a non-expiring API token held only in the dashboard secret file. Grant the minimum tested view/add/change permissions for these resources and no superuser access:

- OAuth and SAML sources;
- certificate/key pairs;
- flow instances and flow bindings;
- Identification and User Login stages;
- OAuth2/OIDC providers;
- applications.

The runtime calls only fixed `/api/v3/` paths on the configured Authentik origin. It creates deterministic `loyalty-<opaque>` objects, a dedicated authentication flow restricted to exactly one source, a hidden application, and a downstream OIDC provider. Both OIDC hops request only `openid`. Do not add Authentik email, profile, or group mappings to the downstream provider. `providerOpenidPropertyMappingId` must identify only the built-in OpenID subject scope mapping. The downstream provider must use Authentik's `hashed_user_id` subject mode: its opaque `sub` then matches Authentik's default outbound SCIM `externalId` without copying email, username, domain, role, group, or an arbitrary claim. Every `sourceUserPropertyMappingIds` entry must be a reviewed tenant-federation mapping that derives the local identifier from the stable upstream subject and does not require or copy email, profile, domain, role, or group claims.

Record the UUIDs of these existing Authentik objects:

- source authentication flow;
- source enrollment flow;
- provider authorization flow;
- provider invalidation flow;
- provider signing certificate/key;
- OpenID-only provider property mapping;
- reviewed source user property mappings.

The generated OAuth2 provider ID is an integer. Source, flow, stage, binding, key, and mapping selectors are UUIDs.

## Mounted configuration

Create `/etc/starfiniti-loyalty/federation-management.json` outside Git:

```json
{
  "authentikOrigin": "https://auth.starfiniti.com",
  "supabaseUrl": "https://api.loyalty.starfiniti.com",
  "sourceAuthenticationFlowId": "REPLACE_WITH_UUID",
  "sourceEnrollmentFlowId": "REPLACE_WITH_UUID",
  "providerAuthorizationFlowId": "REPLACE_WITH_UUID",
  "providerInvalidationFlowId": "REPLACE_WITH_UUID",
  "providerSigningKeyId": "REPLACE_WITH_UUID",
  "providerOpenidPropertyMappingId": "REPLACE_WITH_UUID",
  "sourceUserPropertyMappingIds": ["REPLACE_WITH_UUID"]
}
```

Create two separate files containing only the raw credential and a trailing newline:

- `/etc/starfiniti-loyalty/authentik-federation-token`
- `/etc/starfiniti-loyalty/supabase-service-role-key`

All three files must be owned by dashboard UID/GID `1001:1001`, mode `0400`, and mounted only into the dashboard. The environment file contains only their host paths. Run:

```text
npm run deploy:preflight -- --env /absolute/path/to/starfiniti.env
```

Preflight validates ownership, permissions, distinct paths, exact HTTPS origins, selector types, configuration shape, and secret structure without printing values.

## Merchant lifecycle

1. An owner/admin adds OIDC discovery or SAML metadata from **Team & access**. The server performs pinned public-network validation, provisions both brokers disabled, and stores only fingerprints and public evidence.
2. Configure the returned callback/metadata/ACS values in the upstream IdP. The raw OIDC client secret is write-only; losing it requires disabled rotation.
3. Verify the provider from a separate browser with a pre-invited test member. Then enable it. Enablement first repeats bounded discovery/metadata validation and requires exact continuity with the stored document, endpoints, issuer/entity ID, and signing fingerprints. The database resolver becomes public only after continuity and both external enables succeed and the completion revision commits.
4. Each existing member signs in locally and selects **Link company SSO**. Supabase manual linking binds the upstream subject to that existing Auth UUID. The callback rechecks the exact provider and live membership.
5. Members can then use the organization slug on the login page. An unlinked direct login can create an orphan Auth principal but cannot create organization membership or access tenant data.

V1 retains up to five configurations for migration and recovery, but only one source may be active or activating for an organization. Disable and reconcile the current source before enabling another; the database serializes this rule and the login resolver never guesses between providers.

The database `enterprise.identity` entitlement controls only new source creation, enablement, and OIDC secret rotation. If it is disabled, existing enabled sign-in, exact retries, accepted-operation completion, owner disablement, retirement, local recovery, membership checks, and audit remain available.

## Failure and reconciliation

- A deterministic external rejection records failure and leaves the source disabled.
- A timeout or uncertain response records `review_required`. Do not retry blindly. Inspect Authentik and Supabase by the opaque selectors, reconcile the exact desired state, then use the owner disable path.
- A process death can leave a visible pending operation. Do not start another provider action. After five minutes, an owner may choose **Recover**; this records `orchestration_interrupted` as an immutable ambiguous outcome and clears only the pending reservation. Reconcile both brokers and then disable explicitly.
- A mutation-side network failure, HTTP 408/429/5xx, empty body, or malformed success response is treated as ambiguous because the provider may already have applied the write.
- Disable and retire hide the database resolver before external calls. Disable attempts both brokers even if one fails.
- Enable orders Supabase first and Authentik second. If Authentik rejects, the coordinator compensates by disabling Supabase. An uncertain compensation supersedes the original rejection and records an ambiguous review outcome.
- Rotation disables both brokers before changing the upstream OIDC secret and remains disabled afterward.

Never delete Auth users, database memberships, federation revisions, or audit evidence as rollback. Existing sessions continue to pass through live organization membership and RLS checks.

## Canary evidence

For the approved enterprise IdP test tenant, retain redacted evidence of:

- discovery/metadata and signing fingerprint validation;
- disabled provisioning and exact callback configuration;
- explicit identity linking from an invited account;
- successful service-provider-initiated login;
- forged email/domain/group claims granting no membership;
- immediate membership revocation with a stale session;
- IdP outage and local owner recovery;
- Authentik egress denial for loopback, RFC1918, link-local, carrier-grade NAT, reserved IPv4/IPv6, and instance-metadata destinations, including a controlled public-to-private DNS-rebinding attempt;
- disable, rotation, ambiguous timeout, reconciliation, and rollback;
- no email, group, assertion, token, secret, or service credential in logs.

Production enablement remains blocked until that external canary passes.

## Official references

- [Authentik OAuth sources](https://docs.goauthentik.io/users-sources/sources/protocols/oauth/)
- [Authentik SAML sources](https://docs.goauthentik.io/users-sources/sources/protocols/saml/)
- [Authentik service accounts and API tokens](https://docs.goauthentik.io/users-sources/user/account-types/service-accounts)
- [Authentik security policy](https://docs.goauthentik.io/security/policy/)
- [Authentik SAML signature advisory CVE-2026-25922](https://docs.goauthentik.io/security/cves/CVE-2026-25922/)
- [Authentik SAML NameID advisory CVE-2026-40165](https://docs.goauthentik.io/security/cves/CVE-2026-40165/)
- [Supabase custom OAuth providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
