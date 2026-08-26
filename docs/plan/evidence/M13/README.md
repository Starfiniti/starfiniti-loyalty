# M13 Evidence — Enterprise identity

Status: M13-S01 access catalogue and review is complete on draft PR #40. M13-S02 organization and team lifecycle is complete on draft PR #41. Tenant federation, SCIM, support, agency, and production identity changes remain disabled and unimplemented.

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
