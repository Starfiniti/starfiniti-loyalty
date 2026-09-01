# ADR-0109: Authentik 2026.8 source compatibility contract

**Status:** Accepted as a source-contract gate; production upgrade not accepted

**Date:** 2026-08-31

**Modules:** M01, M13, M15, M16

## Context

The minimized public runtime evidence in ADR-0108 proves that
`auth.starfiniti.com` serves Authentik 2026.5.6. That is the latest patch in the
still-supported prior feature line at this review cutoff. It does not prove the
container image, outposts, private configuration, tenant OIDC/SAML/SCIM
behavior, recovery, or upgrade safety.

Authentik 2026.8.0 is the current feature release. Its release changes include
a Rust server entrypoint and proxy outpost, same-version outpost requirements,
a Base URL setting that becomes required in 2026.11, deprecated PostgreSQL
connection-option variables, additive OAuth capabilities, SAML source schema
changes, SCIM pagination and membership-removal changes, and session deletion
when a user is deactivated. Those changes intersect the operational boundary
even where they do not remove a Starfiniti request field.

The repository already owns a deliberately narrow identity surface:

- fixed Authentik `/api/v3/` administration calls;
- upstream OIDC or SAML broker configuration;
- a downstream authorization-code OIDC provider using `openid`, strict
  callback matching, and `hashed_user_id` subjects;
- outbound Authentik SCIM correlated to the same opaque subject;
- live PostgreSQL membership and RLS authorization on every application
  session, including stale sessions.

We need to close the deterministic source-contract question without turning a
source review into an upgrade claim or touching the live broker.

## Decision

Pin the exact Authentik 2026.5.6 baseline and 2026.8.0 candidate tag objects,
commits, OpenAPI schemas, release-note source, release artifact, GHCR index and
linux/amd64 manifest digests, attestation digest, and eight protocol source files
in
[`infrastructure/governance/authentik-2026-8-compatibility.yaml`](../../../infrastructure/governance/authentik-2026-8-compatibility.yaml).

The contract records and validates:

- all 27 owned API operations still exist with the same path, method, and
  operation ID;
- 18 request schema boundaries contain 248 sent request-field occurrences: 240
  retain identical schema descriptors and eight have compatible descriptor
  changes; the 202 figure is the remaining eight-shape census after excluding
  the 46 OAuth-source occurrences, not an exact-field count;
- the five relevant schema changes are compatible widenings, additive
  capabilities, or fields Starfiniti neither writes nor relies on;
- OIDC remains `openid` plus authorization code, strict callback matching, and
  `hashed_user_id`;
- SAML remains service-provider initiated with signed response and assertion;
- Authentik's current `startIndex`/`count` discovery and
  `members[value eq "<uuid>"]` removal forms match Starfiniti's SCIM boundary;
- Authentik session deletion is defense in depth only: IdP claims never grant
  tenant authority and stale application sessions still recheck live database
  membership and RLS;
- every production, merge, release, deployment, reconciliation, and provider
  upgrade authority remains false.

The offline validator binds the frozen review to the current administration,
configuration, SCIM contract, database migration, runbooks, task graph, root
quality gate, and this ADR. Its corruption suite must fail if provenance,
routes, protocol invariants, limitations, rollback, or authority are weakened.
The separate explicit upstream command fetches only immutable commit URLs,
verifies the schema, release-note, and protocol-source byte counts and SHA-256
values, reparses both OpenAPI schemas, and recomputes the operation and
request-field census. It is reproducible
research evidence and is deliberately excluded from the network-free root gate.

This source contract does not prove runtime compatibility. The production
broker remains on 2026.5.6 until the exact candidate is exercised in a
disposable environment with private configuration, image/outpost inventory,
OIDC/SAML/SCIM fixtures, stale-session deprovisioning, clean-room recovery,
rollback, independent review, and owner approval.

## Alternatives considered

### Upgrade or canary the production broker now

Rejected. Public shell evidence and source compatibility do not establish the
private image, configuration, signing material, outposts, migrations, protocol
traffic, recovery, or rollback. A production mutation would exceed both the
evidence and current authority.

### Require the full disposable runtime rehearsal before recording anything

Stronger as a final gate but incomplete as the only action. It would leave a
deterministic source/API question undocumented while waiting for private
configuration and owner-controlled inputs. The exact runtime rehearsal remains
mandatory; this contract makes its remaining questions explicit and bounded.

### Accept semantic-version support as compatibility evidence

Rejected. Authentik's feature releases can change schemas, entrypoints,
outposts, configuration, and protocol behavior without removing a release from
its supported window. Version support and Starfiniti compatibility are
different claims.

## Security and data-integrity effects

- No credential, private configuration, customer identity, token, assertion,
  session, or production response is captured.
- The contract preserves opaque subject correlation and rejects email, domain,
  group, or JWT metadata as tenant authority.
- Exact source and registry provenance reduce candidate ambiguity but do not
  make an unsigned Git tag trusted on their own. The unsigned state remains
  explicit and the release asset plus registry digests are independently
  pinned.
- The change does not touch loyalty value, tenant data, the ledger, checkout,
  production database state, or production identity state.

## Operational effects

The next candidate rehearsal has an exact image target and a concrete checklist:

1. export and verify private configuration, database, signing material, and
   local break-glass access;
2. inventory the current image and every outpost, deprecated PostgreSQL option,
   and Base URL state;
3. start exact 2026.8.0 server and same-version outposts in isolation;
4. reconcile all 27 admin operations;
5. exercise upstream OIDC, upstream SAML, downstream OIDC, SCIM discovery,
   Users, Groups, membership removal, deactivation, and a stale application
   session;
6. perform clean-room recovery and exact rollback before any production
   acceptance.

M16 remains 77/100. Source compatibility resolves neither the elapsed review
cadence nor M13/M15 production canaries, independent review, recovery, or owner
approval.

## Migration and rollback

There is no application or database migration in this slice. The production
runtime and configuration are unchanged.

If any candidate gate fails, reject the candidate before production and retain
2026.5.6. Preserve the current database/configuration export, signing and
encryption material, local owner, Supabase callback and provider identifiers,
and exact current image/outpost inventory. Never roll back by deleting tenant
membership, federation history, SCIM history, or audit evidence.

## Verification

```text
npm run continuous-improvement:authentik-2026-8:validate
npm run continuous-improvement:authentik-2026-8:upstream:verify
npm run check
npm run db:validate
npm run secrets:scan
npm run audit:prod
npm run licenses
```
