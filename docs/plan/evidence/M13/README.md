# M13 Evidence — Enterprise identity

Status: M13-S01 access catalogue and review is in progress on `codex/m13-enterprise-identity`. Tenant federation, SCIM, support, agency, and production identity changes remain disabled and unimplemented.

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
- Full exact-head Linux replay and image/runtime matrix are pending the branch CI run; S01 stays in progress until that deterministic gate passes.

### Production-build browser review

- Real MerchantShell plus the production AccessReview component was exercised through a temporary synthetic-data route, which was removed after review.
- Desktop `1440 × 1000`: Hub sidebar, four summary cards, current permission matrix, seven role cards, trust boundary, light/dark themes, 3 px visible keyboard focus, zero horizontal overflow, and zero browser warnings/errors passed.
- Mobile `390 × 844` and narrow `320 × 720`: the collapsed drawer, active route, scrim/close behavior, 44 × 44 px icon controls, single-column cards, English-only output, and zero horizontal overflow passed.
- Review found and repaired a real narrow-screen implicit-grid row collapse that clipped the hero. The production page now uses max-content rows aligned to the start.

No production identity state changed.
