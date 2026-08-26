# M13 Evidence — Enterprise identity

Status: M13-S01 access catalogue and review is complete on draft PR #40. M13-S02 organization and team lifecycle is complete on draft PR #41. M13-S03 tenant federation is implemented on draft PR #42 with production disabled; production-build browser evidence passes while Authentik egress proof and the enterprise-IdP canary remain open. M13-S04 SCIM is a disabled repository candidate on draft PR #43 with fresh isolated database, browser, adversarial, and exact-head CI evidence; the approved enterprise IdP/SCIM canary remains open. M13-S05 bilateral agency, scoped support, owner recovery, export, offboarding, and deletion is a disabled repository candidate on draft PR #44 with exact database, concurrency, browser, contract, action, image, and WooCommerce evidence. M13-S06 production canaries remain open and production is unchanged.

## M13-S01 access catalogue and review

- ADR-0051 separates Authentik/Supabase authentication from live PostgreSQL tenant authority and makes support a grant-only profile.
- Access V1 defines exactly seven profiles: six live membership roles (`owner`, `admin`, `marketer`, `operator`, `analyst`, and `auditor`) plus structurally grant-only `support`. It does not broaden existing loyalty command authorization.
- The implemented projection is minimized to public organization state, assigned/effective access, M13 permissions, seven role definitions, and aggregate active membership counts. It exposes no member identity, Auth UUID, email, domain, provider claims/groups, token, or secret.
- PostgreSQL rechecks the request subject's live membership. Revoked membership and cross-tenant selectors return no row; forged email, role, group, and organization claims grant nothing. Organization suspension keeps read-only review evidence but makes the assigned profile ineffective for commands.
- Current official references were reviewed for Supabase stale JWT/session behavior, Authentik OIDC/SAML sources and SCIM provisioning, and RFC 7643/7644 identity and protocol semantics.

### Repository verification

- `npm run db:validate`: 71 additive migrations and 58 pgTAP files validate.
- `enterprise_access_catalogue_test.sql`: 29 focused assertions cover catalogue shape, grants, fixed search path/timeout, support exclusion, minimized output, active/suspended effectiveness, live revocation, tenant isolation, and forged claims.
- Focused contracts: 5/5 tests pass; focused dashboard model/navigation: 7/7 tests pass.
- Exact-head Linux run `32957971079` at `6284412b620c2a3b65480c3638c0c46691f21d03` passed all seven jobs: the complete repository baseline, both production images, a clean 71-migration replay, all 58 pgTAP files with 3,058 assertions including all 29 focused access assertions, all 13 concurrency probes, and the minimum/current × HPOS/legacy WooCommerce matrix.
- The self-improving loop caught two deterministic defects before closure. Run `32957336128` exposed an invalid mixed record/scalar `INTO` target during clean migration replay; commit `ac218a8` replaced it with one explicit scalar projection record. Run `32957637429` then executed all 29 focused assertions successfully but failed because the file still declared a 28-test plan; commit `6284412` aligned the plan to the verified suite.

### Production-build browser review

- Real MerchantShell plus the production AccessReview component was exercised through a temporary synthetic-data route, which was removed after review.
- Desktop `1440 × 1000`: Hub sidebar, four summary cards, current permission matrix, seven role cards, trust boundary, light/dark themes, 3 px visible keyboard focus, zero horizontal overflow, and zero browser warnings/errors passed.
- Mobile `390 × 844` and narrow `320 × 720`: the collapsed drawer, active route, scrim/close behavior, 44 × 44 px icon controls, single-column cards, English-only output, and zero horizontal overflow passed.
- Review found and repaired a real narrow-screen implicit-grid row collapse that clipped the hero. The production page now uses max-content rows aligned to the start.

No production identity state changed.

## M13-S02 organization and team lifecycle

Status: complete on `codex/m13-org-lifecycle`; no production identity mutation is enabled.

- ADR-0052 selects 256-bit one-use capabilities with digest-only storage instead of email/domain matching or administrator-entered Auth UUIDs.
- Additive organization and membership revisions support exact rename, suspend, restore, close, offboard, role-change, and revoke state machines. The stable organization row serializes actor rechecks and owner quorum. Suspension blocks the shared merchant mutation role gate; offboarding retains only the initiating recovery owner.
- The accepting request's live Supabase subject becomes the membership. Revoked members fail the next team projection request even while an old JWT remains valid.
- The Hub-style Team & access workflow covers organization creation, invitation issuance/acceptance/revocation, member roles, lifecycle controls, bounded audit history, suspended-owner recovery, and a limit-declared minimized JSON identity snapshot.
- Browser QA evidence is recorded in `organization-team-browser-qa-2026-08-26.md`: desktop/mobile/narrow, light/dark, keyboard trap and restoration, inert background, reduced motion, 44-pixel controls, English-only, zero overflow, and zero diagnostics pass after deterministic repairs.
- Local verification passes focused actions 6/6, dashboard typecheck, zero-warning lint, static 72-migration/59-pgTAP validation, production build, workflow validation, secret scan, and zero-high production dependency audit.
- Exact-head Linux run `32966869787` at `e02765568b91a316953e5fa53bd0298fb72ff866` passed all seven jobs: the complete repository baseline, both production images, a clean 72-migration replay, all 59 pgTAP files with 3,128 assertions including all 70 focused lifecycle assertions, all 14 concurrency probes, and the minimum/current × HPOS/legacy WooCommerce matrix.
- The self-improving loop first rejected a non-identical invitation retry fixture in run `32966574974`: separate `statement_timestamp()` calls intentionally produced changed expiry input under one idempotency key. Commit `e027655` bound the exact-retry fixture to one transaction timestamp while retaining the changed-expiry conflict case; the corrected exact head passed.

## M13-S03 tenant federation

Status: repository candidate implemented on `codex/m13-tenant-federation`; no production identity source, secret, application, custom provider, Auth setting, entitlement, or network policy changed.

- ADR-0053 selects per-organization Authentik OIDC/SAML sources feeding one opaque downstream OIDC provider per source while Supabase continues to issue application sessions and PostgreSQL remains the tenant authority.
- OIDC and SAML metadata validation is HTTPS-only, public-address socket-pinned, redirect-free, bounded, issuer/entity exact, cryptographically constrained, and raw-document-free. New enablement repeats that validation and requires exact document, endpoint, issuer/entity, and signing-evidence continuity before reserving activation. SAML V1 accepts one current certificate and disables IdP-initiated login.
- Both OIDC hops request only `openid`. Supabase providers are email-optional with an empty claims allowlist, and the Authentik downstream provider has only the OpenID subject mapping. Existing invited members link explicitly from an authenticated session; email, domain, group, role, source, and JWT metadata grant no organization authority.
- M13-S04 replaces the still-disabled downstream subject mode with Authentik's documented `hashed_user_id`, whose opaque OIDC subject matches the default outbound SCIM `externalId`. A prior active SCIM User, the exact brokered subject, and one explicit opaque Group-to-non-owner-role mapping are all required before PostgreSQL creates or reactivates a membership. Email, username, domain, group name, and arbitrary claims remain non-authoritative.
- PostgreSQL retains additive tenant current state, immutable revisions, minimized evidence, digest-only upstream/broker secret fingerprints, exact idempotency, one-active-source serialization, public resolver minimization, owner recovery, and zero membership or ledger effects.
- The database-authoritative `enterprise.identity` entitlement blocks new creation, enablement, and rotation while preserving accepted completion, exact retries, existing login, disablement, retirement, recovery, and audit access.
- Mutating network/408/429/5xx/oversized/malformed outcomes are ambiguous, and Authentik response reads have a streaming 512 KiB ceiling. Resolver visibility is removed before disablement, Supabase enable precedes Authentik with compensation, uncertain compensation supersedes a definite rejection, and owner-only five-minute recovery converts an interrupted pending operation to immutable review evidence without guessing external state.
- The Hub-style English Team & access workflow includes OIDC/SAML configuration, write-only secrets, callback setup, local-recovery and rollout warnings, source lifecycle/reconciliation, explicit SSO linking, and organization-slug login. Production-build desktop/mobile/narrow visual and interaction evidence passes.
- Deployment preflight requires three distinct owner-only mounted files and exact Authentik/Supabase origins/selectors. Production additionally requires an Authentik egress allowlist for exact private dependencies plus denial of every other private/reserved/metadata destination; a controlled DNS-rebinding canary is mandatory.

### Local verification

- `npm run test`: all 69 dashboard files with 317 tests, 5 worker files with 108 tests, 29 contract files with 311 tests, 13 domain files with 85 tests, and the 8-test TypeScript SDK suite pass after the final adversarial additions. The focused provider/orchestration subset passes 19 cases and the enterprise-identity contract file passes 14 cases.
- Dashboard typecheck, zero-warning root lint, production build including `/auth/link/callback`, architecture/accessibility validation, workflow validation, deployment self-tests, secret scan, production audit with zero vulnerabilities, and license validation pass.
- `npm run db:validate` validates 73 additive migrations and 60 pgTAP files. `organization_tenant_federation_test.sql` declares and statically reconciles to 88 focused assertions across grants, tenancy, validation, entitlements, one-source activation, idempotency, recovery, lifecycle, minimization, membership, and ledger neutrality.
- `npm run check` on this Windows working copy stops at the repository-wide Prettier gate because 223 pre-existing files are checked out with CRLF. Every changed supported file passes targeted Prettier, and `git diff --check` passes; clean Linux CI remains the authoritative formatting gate.
- Production-build browser QA passes at `1440 × 1100`, `390 × 844`, and `320 × 720` across light/dark, reduced motion, OIDC/SAML switching, enabled/review/interrupted states, mobile navigation focus restoration, visible control targets, English-only output, inner-scroll overflow, and zero browser diagnostics. Evidence is recorded in `tenant-federation-browser-qa-2026-08-26.md`.
- Local Windows cannot run the Docker/Supabase replay. Exact 73-migration replay and all 88 focused pgTAP assertions remain pending on Linux CI; no deterministic failure is waived.

### Remaining production gate

- Mount reviewed service credentials and exact Authentik flow/key/mapping selectors without exposing them to the browser or worker.
- Prove the Authentik private/reserved egress denial and controlled DNS-rebinding test.
- Enable manual Supabase identity linking in staging, retain disabled signup, and verify exact callback allowlists.
- Run one approved enterprise OIDC or SAML tenant through disabled provisioning, explicit invited-account linking, login, forged-claim denial, stale-session revocation, IdP outage, local recovery, disable, rotation, interrupted-operation recovery, reconciliation, rollback, and log minimization.
- Retain redacted Linux CI, network, and external-canary evidence before marking M13-S03 complete.

## M13-S04 SCIM provisioning

Status: repository candidate; production remains disabled and unchanged.

- ADR-0054 requires the Authentik hashed OIDC subject to equal its outbound
  SCIM `externalId`. PostgreSQL creates or reactivates access only when that
  verified subject, one active SCIM User, and exactly one owner/admin-reviewed
  opaque Group-to-non-owner-role mapping agree.
- Additive RLS storage covers organization/source-bound endpoints, Users,
  Groups, memberships, digest-only credential revisions, and minimized audit.
  Email, username, domain, display name, token claims, browser selectors, and
  group names cannot grant authority. SCIM can never map `owner`.
- The RFC 7643/7644 profile implements discovery, Users, Groups, exact filters,
  bounded pagination, POST/PUT/PATCH/DELETE, weak ETags, immediate rotation and
  revocation, deterministic create/delete retry, tombstone reprovisioning,
  quotas, and 512 KiB/2,000-member limits. PostgreSQL independently rejects
  nested undeclared attributes.
- `active: false`, deletion, last-role removal, conflicting roles, and endpoint
  revocation reconcile the live membership in the same transaction. Existing
  sessions fail their next database-authoritative tenant-context check.
- Team & access now includes endpoint creation with one-time token handoff,
  rotation/revocation, synchronized counts, opaque group review, role mapping,
  and minimized recent activity. The operational handoff is in
  `docs/operations/TENANT_SCIM.md`.
- Exact tenant-provider authentication preserves a live invitation-created
  membership without changing its provenance; a revoked manual membership and
  mismatched SCIM provenance fail closed.

### Repository verification

- Fresh isolated `supabase/postgres:17.6.1.136` replay passed all 74 additive
  migrations as `supabase_admin`; the harness added only the minimal GoTrue
  schema fields absent from the bare database image. Production was untouched.
- `organization_scim_provisioning_test.sql` passes 60/60 assertions covering
  grants/RLS, digest-only lifecycle, discovery, resources, filtering,
  pagination, exact subject correlation, owner prohibition, deprovisioning,
  multi-role failure, invitation/SCIM separation, immutable external IDs,
  idempotent DELETE, safe tombstone reprovisioning, fresh rotation, and
  revocation.
- `verify-scim-concurrency.mjs` passes two-session exact endpoint creation and
  competing group-role mapping: one endpoint effect, one role winner, one stale
  failure, exact audits, and zero ledger transactions.
- Focused contract, database-boundary, action, callback, and SCIM route tests
  pass. Group PATCH, optimistic `If-Match`, request-size rejection, and
  plaintext-token exclusion are explicit cases.
- Adversarial review found and fixed active credential reuse, loss/reuse of a
  one-time credential across refreshed forms, silently hidden partial identity
  failures, permanent tombstones, non-idempotent DELETE retry, and a tenant-SSO
  regression that incorrectly required SCIM for an already invited member.
- Chromium browser QA passes desktop `1440 × 1100` and mobile `390 × 844`
  across light/dark, reduced motion, action-state copy, responsive grids,
  English-only output, zero overflow, and zero browser diagnostics. Evidence is
  recorded in `tenant-scim-browser-qa-2026-08-26.md`.
- Exact-head Linux run `33000243629` at
  `9a247ff8f4e04a3209e944f48252483121aefa15` passes all seven jobs: root
  checks, both production images, a clean 74-migration replay, all 61 pgTAP
  files with 3,276 assertions, all 15 concurrency probes, and the
  minimum/current × HPOS/legacy WooCommerce matrix.
- The exact-head loop exposed and fixed three integration weaknesses outside
  the focused SCIM suite: global security-function allowlists omitted the six
  reviewed SCIM/federation boundaries, the federation recovery fixture tried
  to violate its own timestamp constraint, and the organization lifecycle
  race created an invitation from an owner who could subsequently be revoked.
  The final probe creates that invitation from the serialized surviving owner.

### Remaining production gate

- An approved enterprise IdP/SCIM test tenant must synchronize a controlled
  cohort through Authentik, prove exact hashed-subject correlation, mapped and
  unmapped login, active-false/delete/stale-session revocation, token rotation,
  provider outage independence, reconciliation, rollback, and log minimization.

## M13-S05 agency, support, recovery, and offboarding

Status: repository candidate complete on `codex/m13-support-agency`; no
production organization, relationship, grant, recovery, export, credential, or
deletion state changed.

- ADR-0055 chooses bilateral client-issued, agency-accepted relationships over
  implicit agency membership. A relationship exposes only a minimized
  portfolio and grants no customer, wallet, programme, ledger, connector, SCIM,
  or tenant-command authority.
- Agency support is a separately approved, maximum-four-hour grant over exactly
  four allowlisted read-only scopes. The requester cannot approve it; every
  projection rechecks the live Auth session, agency membership, relationship,
  request, grant, scope, expiry, and revocation before appending a tenant-visible
  immutable use event.
- Break-glass is owner recovery rather than support impersonation. It requires
  a signed `aal2` claim and a boolean-only live-session check owned outside
  `loyalty_owner`; Loyalty roles receive no direct `auth.sessions` privilege.
  Every recovery projection appends immutable tenant-visible evidence and the
  capability expires after 30 minutes.
- The administration export is bounded, versioned, identifier/count based, and
  reconciles ledger entries exactly without customer PII, raw audit metadata,
  credentials, or private payloads. Deletion requires closed/offboarded state,
  exact optimistic revision, an AAL2 recovery session, and a seven-day cooling
  period before mutable organization identity is pseudonymized and the last
  membership is revoked.
- Terminal offboarding revokes every supported agency, support, federation,
  SCIM, service-account, commerce, notification, schedule, and aggregate-export
  path. Webhook retirement now replaces the live destination/origin and current
  fingerprint with terminal tombstones, clears current/previous hints and the
  previous fingerprint/overlap, and retains immutable lifecycle/delivery
  evidence. The ledger, programme history, canonical events, and audit evidence
  are never edited or deleted.

### Repository verification

- `npm run db:validate` validates 75 additive migrations and 62 pgTAP files.
  `organization_agency_support_offboarding_test.sql` passes 73 focused
  assertions covering privileges/RLS, bilateral replay, approval separation,
  exact scopes, expiry/revocation, live sessions, AAL2, use evidence, bounded
  export, cooling/cancellation, credential inventory, webhook tombstones,
  pseudonymization, immutable history, and zero ledger drift.
- `verify-agency-support-concurrency.mjs`, the sixteenth database concurrency
  probe, serializes competing bilateral acceptance, exact support approval, and
  terminal deletion completion. Each produces one accepted effect; stale or
  conflicting work fails closed and value remains unchanged.
- Focused enterprise-administration contracts pass 8/8 and dashboard
  server-action tests pass 9/9. Dashboard typecheck, lint, production build,
  migration validation, workflow validation, secret scan, production audit,
  licences, and diff checks pass through the exact Linux baseline.
- Exact-head Linux run `33013504755` at
  `8587841d9a0e41afa00a94af506e2cddf5740422` passes all seven jobs: root
  checks, both production images, a clean 75-migration replay, all 62 pgTAP
  files with 3,349 assertions, all 16 concurrency probes, and the
  minimum/current × HPOS/legacy WooCommerce matrix.
- Adversarial review repaired relationship/support/deletion serialization,
  changed-retry drift, post-approval relationship races, live Auth-session
  privilege isolation, cross-owner support projection fixtures, immutable-error
  expectations, and terminal webhook destination/fingerprint survival. No
  deterministic failure was waived.

### Production-build browser review

- Evidence is recorded in
  `agency-support-recovery-browser-qa-2026-08-26.md`. Real production
  `MerchantShell`, `AgencySupportLifecycle`, and `RecoveryLifecycle` components
  passed optimized Chromium rendering at desktop, mobile, and 320-pixel narrow
  widths in light/dark and reduced-motion states.
- All visible controls had accessible names; mobile targets were at least 44
  pixels, keyboard focus used the visible three-pixel Hub ring, drawer Escape
  restored focus, cooling-period deletion remained disabled, and every case had
  zero overflow, console/page errors, or important failed responses.

### Remaining production gate

- M13-S06 requires the approved enterprise IdP/SCIM test tenant, reviewed
  Authentik private-egress policy, a consenting client/agency pair, live support
  grant/revocation and stale-session proof, a disposable AAL2 recovery/export/
  offboarding/deletion rehearsal, exact audit and zero-ledger reconciliation,
  rollback, observation, category-floor scoring, and explicit canary approval.
