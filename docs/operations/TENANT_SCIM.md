# Tenant SCIM operations

This runbook configures one organization-scoped Authentik SCIM 2.0 directory
against Starfiniti Loyalty. SCIM is an enterprise identity input, not an
authorization authority: live PostgreSQL membership and RLS remain decisive.

## Safety model

- The SCIM `externalId` must equal the same Authentik hashed user ID emitted as
  the brokered OIDC subject. Email, username, domain, group display name, JWT
  metadata, and custom claims are never membership selectors.
- A user is eligible only after an active SCIM User exists, the verified broker
  subject matches exactly, and the user belongs to exactly one group mapped by
  an owner or admin to a non-owner tenant role.
- Two different mapped roles fail closed by revoking SCIM-managed access until
  an owner resolves the conflict.
- SCIM cannot provision `owner`. Keep at least one local recovery-capable owner.
- Endpoint bearer credentials are shown once. PostgreSQL stores a SHA-256
  digest only. Do not paste credentials into tickets, logs, screenshots, or
  shell history.
- Provisioning failure never changes ledger value and never affects storefront
  checkout.

## Prerequisites

1. The organization has an OIDC or SAML source that is validated and is in
   `validated`, `enabled`, or `disabled` state.
2. The corresponding Authentik-backed OIDC provider uses the hashed user ID
   subject mode. Do not use Authentik user UUID mode for this tenant source.
3. Enterprise identity entitlement is enabled for the tenant.
4. An owner or admin is signed in at **Team & access**. Auditors may inspect but
   cannot mutate directory state.

## Create the endpoint

1. Open **Team & access → Directory provisioning**.
2. Choose the validated company identity provider and give the directory an
   operational name.
3. Confirm that provisioning grants no role until a group is reviewed.
4. Select **Create endpoint**.
5. Copy both one-time values immediately:
   - Base URL:
     `https://loyalty.starfiniti.com/api/scim/<endpoint-id>/v2`
   - Bearer token: `stf_scim_<43 base64url characters>`
6. Store the token directly in the Authentik SCIM provider. Closing or
   refreshing the result loses the plaintext token permanently.

Starfiniti creates at most one endpoint per federation source and five per
organization. Exact create retries return the original database effect; a
changed payload with the same idempotency key fails closed.

## Configure Authentik

Follow the current [Authentik SCIM provider documentation](https://docs.goauthentik.io/add-secure-apps/providers/scim/).

1. Create a SCIM provider with the Starfiniti Base URL and one-time token.
2. Retain the provider's default hashed user ID behavior for `externalId`.
3. Select only the users and groups intended for this organization. Avoid
   sending broad workforce directories unnecessarily.
4. Attach the SCIM provider to the correct Authentik application/outpost flow
   as required by the installed Authentik version.
5. Trigger synchronization and confirm Users and Groups appear in Starfiniti.

Starfiniti implements `ServiceProviderConfig`, `ResourceTypes`, `Schemas`,
Users, Groups, filtering, bounded pagination, PUT, PATCH, DELETE, weak ETags,
and retry-safe resource creation. Request bodies are capped at 512 KiB, groups
at 2,000 members, list responses at 200 records, and endpoints at their
database-configured per-minute quota.

Authentik 2026.8 discovery sends bounded `startIndex` and `count` parameters,
and membership removal may use `members[value eq "<uuid>"]`; both forms are
covered by Starfiniti's contract and database tests. ADR-0109 establishes that
source-level match only. A disposable exact-version fixture must still exercise
discovery, Users, Groups, additions, filtered removals, deactivation, retry, and
the correlated OIDC subject before the candidate can be accepted.

## Review group access

1. Wait for the opaque group to appear under **Group role mappings**.
2. Verify the group in Authentik through a separate administrative session.
   The displayed name in Starfiniti is descriptive and grants nothing.
3. Choose `Admin`, `Marketer`, `Operator`, `Analyst`, `Auditor`, or **No access**.
4. Enter an audited reason, confirm the effect, and save.
5. Verify the expected user count and bound-member count.

Role changes reconcile every current group member in the same transaction. A
stale group revision is rejected, so refresh and review again rather than
blindly retrying.

## Login and deprovisioning

- On company SSO callback, Starfiniti compares the verified Authentik subject
  with the already-provisioned SCIM `externalId`. It never searches by email.
- An invited/manual membership remains manual and is not silently converted to
  SCIM ownership.
- `active: false`, User deletion, removal from the last mapped group, mapping
  removal, a conflicting second role, or endpoint revocation invalidates the
  SCIM-managed membership in the same database transaction.
- Existing sessions fail on their next live tenant-context check. Database RLS is authoritative even if an application cookie has not expired.
- A live invitation-created membership remains valid after authentication by
  the exact organization provider and is not silently converted to SCIM. A
  revoked manual membership remains revoked.
- Repeated User or Group DELETE returns 204 without another state change. If
  Authentik later reprovisions the same `externalId`, Loyalty reactivates the
  same immutable resource ID at a higher revision. A restored Group has no role
  mapping until an owner or admin reviews it again.

## Rotate or revoke

Credential rotation invalidates the previous token immediately:

1. Prepare the Authentik provider edit in a separate tab.
2. In Starfiniti choose **Rotate credential**, enter an audited reason, confirm,
   and apply.
3. Copy the new token once and replace the Authentik token immediately.
4. Trigger a test synchronization and confirm recent directory activity.

Rotation may briefly pause provisioning but does not revoke memberships.

Use **Revoke endpoint** for compromise, tenant offboarding, or provider
retirement. Revocation rejects all subsequent API requests and revokes every
membership with that endpoint's SCIM provenance. The endpoint and audit remain
visible for reconstruction.

## Verification and incident response

- A successful discovery request returns `application/scim+json`, `no-store`,
  and bounded rate-limit headers.
- Replayed creates return one resource, DELETE retry remains a 204 success, and
  tombstone reprovisioning preserves resource identity. Stale `If-Match`
  changes return HTTP 412. Invalid/revoked tokens return HTTP 401 without
  revealing endpoint state.
- Reconcile Authentik selected users/groups, Starfiniti active records, bound
  members, approved mappings, and minimized recent activity.
- For suspected credential exposure, revoke first. Do not rotate when the
  intended outcome is to terminate the integration.
- Do not inspect raw provider traffic in general-purpose logs. Audit evidence
  intentionally excludes the bearer token, request body, email, username, and
  ledger metadata.

Repository verification is `npm run db:validate`, the SCIM pgTAP file,
`node scripts/verify-scim-concurrency.mjs`, dashboard contract/route tests, and
the full `npm run check` gate. Production enablement additionally requires an
approved enterprise IdP test tenant and a controlled canary.

## Rollback

Disable tenant federation sign-in if subject correlation is uncertain, revoke
the SCIM endpoint, and retain local owner recovery. Do not delete directory or
membership history. Restore access through an explicit invitation/manual
membership after independent identity verification; never compensate by email
or domain matching.
