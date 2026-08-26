# ADR-0052: Capability-bound organization invitations and serialized owner quorum

- Status: Accepted
- Date: 2026-08-26
- Scope: M13-S02 organization and team lifecycle

## Context

Access V1 defines the enterprise roles and proves that live PostgreSQL membership, rather than Authentik or JWT claims, is tenant authority. The product still lacks organization creation, invitations, member changes, immediate revocation, suspension, restoration, closure, offboarding, and a usable administration record.

An email-targeted invitation is familiar, but using an email/domain match as the membership decision would turn a mutable identity attribute into tenant authority. Assigning an Auth UUID directly avoids that error but is unusable for ordinary owners and couples the product to Supabase internals. Owner removal also has a concurrency hazard: two individually valid changes can remove both owners unless the stable organization row serializes the decisions.

## Decision

1. An organization invitation is a 256-bit one-use bearer capability generated with the browser cryptographic random source. The owner transfers it through a trusted channel; it is never placed in an application URL by Starfiniti.
2. Next.js validates and hashes the token. PostgreSQL stores only SHA-256, exact role, non-authoritative display label, issuer, draft-bound expiry, state, and acceptance evidence. The exact expiry remains stable across an ambiguous retry; an accepted retry never re-reveals the token.
3. Acceptance requires both the capability digest and a live signed-in Supabase Auth subject. PostgreSQL derives that subject from the request and creates/reactivates exactly one membership. Email, domain, Authentik source/group, OIDC/SAML attributes, JWT metadata, and browser-supplied user IDs are not compared and cannot grant access.
4. Invitations expire between one hour and 30 days, are organization-bound, role-immutable, one-use, revocable, and unavailable while the organization is not active. An admin can issue non-owner roles; only an owner can issue or assign owner.
5. Organization creation derives the request subject, creates one owner membership atomically, and uses a private actor-scoped receipt because no tenant exists yet to scope the ordinary administration-audit idempotency key.
6. Every lifecycle and membership command locks the stable organization row before re-reading the actor's live membership. This provides a fresh post-wait authorization decision and serializes owner-quorum, lifecycle-revision, invitation, and offboarding changes.
7. Member changes use optimistic membership revisions. Demoting or revoking an owner requires another active owner. Admins cannot change an owner or promote one. Changing or revoking an owner/admin also revokes every still-pending invitation that principal issued, so deprovisioning cannot leave delegated bearer authority behind.
8. Organization state transitions are exact: active may rename, suspend, or close; suspended may rename, restore, or close; closed may offboard once; closed/offboarded state cannot restore. Every accepted transition increments the lifecycle revision and appends immutable audit evidence.
9. Suspension immediately makes M13 permissions and the shared live-role gate used by existing merchant mutation commands ineffective while retaining an owner recovery view. Core value authorization already requires an active organization. Closure is terminal. Offboarding revokes every membership except the initiating owner plus all pending invitations, preserving exactly one recovery owner, immutable audit/ledger evidence, and the bounded minimized identity-administration export. It does not delete loyalty value or rewrite history.
10. The Team & access projection is limited to owner, active admin, or active auditor. It exposes public resource IDs, labels, roles, states, revisions, timestamps, and bounded events; it omits Auth UUIDs, email, domains, provider claims/groups, raw tokens, and digests.

## Alternatives considered

1. **Target an invitation by normalized email and accept when the session email matches.** This is easy to deliver, but email becomes part of the authorization decision, address changes complicate replay, and stored PII expands the identity boundary.
2. **Have an owner enter the invitee's Supabase Auth UUID.** This is strongly bound but unusable, exposes an internal identifier, and requires the invitee to exist before the workflow begins.
3. **Use a one-use high-entropy capability plus the accepting live Auth subject.** This keeps delivery separate from authorization attributes, stores no recipient PII or reusable secret, and supports users before tenant membership exists. Token leakage remains a bearer risk, bounded by entropy, short expiry, one use, trusted transfer guidance, revocation, and immediate audit visibility.

## Security and compatibility effects

Existing organization and membership rows gain additive revisions/timestamps and remain readable through their prior membership policies. Existing owners remain revision 1. No legacy loyalty command receives a new role or permission; the shared role helper now additionally requires an active organization, so suspension fails closed for the merchant mutation commands that already depend on it. Core ledger value authorization independently requires an active organization. Revocation continues to fail the next database request even if a Supabase access JWT remains valid. The command projection provides labels rather than Auth identity data; labels are presentation only.

The owner-quorum decision and actor recheck occur after the organization lock. This matters under PostgreSQL `READ COMMITTED`: a waiter must not authorize from a membership snapshot captured before the winning transaction revoked it. A dedicated two-session probe races reciprocal owner revocations and invitation acceptance.

## Rollout and rollback

Deploy the additive schema and UI with organization mutations disabled by release process. Canary creation, invitation, acceptance, role change, revoke, suspend/restore, close/offboard, export, and stale-session denial on a disposable Starfiniti organization. Reconcile membership, invitation, audit, organization revision, and zero ledger effects.

Rollback hides the creation/join/team controls and revokes pending canary invitations. Additive columns, digest-only invitation history, receipts, memberships, and immutable audits remain. Restore a suspension only through the compensating restore command; never rewrite a lifecycle audit. Closed/offboarded canary state is not reopened.

## Sources

- [Supabase user sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase user management and stale JWT behavior](https://supabase.com/docs/guides/auth/managing-user-data)
- [Authentik OAuth source](https://docs.goauthentik.io/users-sources/sources/protocols/oauth/)
- [Authentik SAML source](https://docs.goauthentik.io/users-sources/sources/protocols/saml/)
