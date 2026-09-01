# Enterprise administration V1

M13-S05 adds authenticated PostgreSQL command boundaries for bilateral agency
relationships, separately approved read-only support, AAL2 owner recovery,
bounded administration export, and terminal organization deletion. The
versioned TypeScript/Zod wire contracts are in
`packages/contracts/src/enterprise-administration.ts`.

## Authority model

- Public commands accept public resource selectors, expected revisions,
  idempotency keys, correlation IDs, bounded reasons, and narrowly typed
  requested state only.
- PostgreSQL derives the Auth subject, signed session ID, organization,
  membership, role, relationship, grant, and internal keys. Email, domain,
  claims, groups, labels, browser state, and caller-supplied user IDs grant no
  authority.
- `loyalty_owner` receives no `auth` schema or `auth.sessions` access. A
  boolean-only migration-administrator-owned security-definer bridge confirms
  that the signed `session_id` still belongs to the live subject.
- Browser and worker roles receive no direct administration-table DML. Public
  projections are bounded and omit Auth UUIDs, PII, secrets, raw capabilities,
  wallet/customer records, and ledger metadata.

## Agency relationship boundaries

- `create_organization_agency_invitation_command_v1(...)` stores only the
  SHA-256 digest of a 256-bit one-time capability. The client owner creates it.
- `accept_organization_agency_invitation_command_v1(...)` requires a different
  live agency organization owner and atomically creates one relationship.
- `revoke_organization_agency_relationship_command_v1(...)` is optimistic and
  idempotent. Either organization owner may revoke; dependent support requests
  and grants are revoked in the same transaction.
- `get_organization_agency_portfolio_v1(organization_id)` returns minimized
  counterpart organization names, perspective, lifecycle, and invitations.
  A relationship is never membership, RLS authority, customer sharing, or a
  shared-wallet policy.

## Support boundaries

- `create_support_access_request_command_v1(...)` allows a live agency owner,
  admin, or operator to request an exact canonical subset of four V1 read-only
  scopes for at most four hours.
- `resolve_support_access_request_command_v1(...)` requires a separate live
  client owner. Approval can only narrow scopes and expiry; rejection carries
  neither. A requester or existing client member cannot approve hidden access.
- `get_support_workspace_v1(grant_id)` rechecks the relationship, organizations,
  grant, request, agency membership, subject, expiry, and live Auth session.
  It materializes only approved fields and appends one immutable tenant-visible
  use event atomically. It is intentionally volatile.
- `revoke_support_access_grant_command_v1(...)` immediately invalidates the
  grant. `get_support_administration_workspace_v1(organization_id)` exposes
  minimized request, grant, and recent-use history to authorized tenant review.

V1 support scopes are `organization.summary.read`, `members.summary.read`,
`identity.health.read`, and `audit.summary.read`. V1 defines no write or
impersonation scope.

## Owner recovery and deletion

- `start_organization_break_glass_command_v1(...)` requires a retained live
  owner, signed `aal2`, and a live correlated Auth session. The capability lasts
  30 minutes and every use is appended to tenant-visible evidence.
- `get_organization_administration_export_v1(...)` returns a versioned bounded
  manifest of organization/resource/credential counts plus exact ledger
  reconciliation. It contains no customer PII or credential material.
- `organization_deletion_command_v1(...)` supports `request`, `cancel`, and
  `complete`. Completion requires an offboarded closed organization, a live
  AAL2 recovery session, the exact case revision, and an elapsed seven-day
  cooling period.
- Completion pseudonymizes mutable organization identity and removes remaining
  access. It never deletes or rewrites ledger transactions, ledger entries,
  programme history, immutable administration evidence, or the public tombstone.
- Terminal offboarding retires every outbound webhook, replaces its live
  destination/origin with the fixed `retired.invalid` tombstone, replaces the
  current signing fingerprint, and clears current/previous hints, the previous
  fingerprint, and overlap expiry. Immutable endpoint revisions and delivery
  attempts remain available as non-reusable evidence.

All mutating commands bind exact retries to a canonical request digest. Reusing
an idempotency key with changed input fails; stale revisions fail; corrections
are new lifecycle events rather than edits to history.
