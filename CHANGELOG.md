# Changelog

## Unreleased

- Bootstrapped the Starfiniti Loyalty repository from the approved design-only handoff.
- Scoped the current product to self-hosted Supabase on Proxmox, Next.js, and WooCommerce; deferred Shopify implementation.
- Added repository operating documents, ADRs, task ledger, baseline CI, and environment templates.
- Added a responsive, production-built Next.js Overview route with working date-range, publish-review, and mobile-navigation interactions.
- Added typed integer value primitives, versioned commerce-event contracts, four unit tests, and a Supabase-generated foundation migration.
- Added the WooCommerce HPOS-compatible plugin scaffold and Proxmox/Supabase deployment contract.
- Fixed standalone packaging so HTML, CSS, and JavaScript assets are served by the production server.
- Added a Docker-backed Supabase CI job that replays migrations/seed and runs pgTAP security checks.
- Added durable guards for schema grants, RLS coverage, security-definer placement, pinned CI actions, and exact Supabase CLI versions.
- Added clear container-runtime preflight diagnostics and database-testing documentation.
- Created the private GitHub repository and verified the full baseline plus migration/seed/pgTAP database gate on GitHub Actions.
- Completed Phase 0 and opened ADR-0004 for explicit loyalty value-semantics approval.
- Accepted ADR-0004 with the owner-approved Rosy Rewards v1 semantics and resolved the prototype/master-plan tier conflict in favor of live Rose/Bloom/Icon tiers.
- Added versioned programme configuration plus pure integer award, release, expiry, refund-reversal, negative-balance, redemption-lot, and tier-review helpers with 16 domain tests.
- Licensed the hosted platform under AGPL-3.0-or-later while retaining GPL-2.0-or-later for the WooCommerce plugin.
- Completed the Phase 1 product-model gate for the active WooCommerce scope; Shopify remains deferred.
- Merged the verified Phase 0/1 work and published `Starfiniti/starfiniti-loyalty` as a public AGPL repository.
- Completed Phase 2 with reviewable architecture, data, identity, event, threat, privacy, recovery, deployment, and SLO models.
- Accepted ADR-0005 through ADR-0007 for database authorization boundaries, an immutable double-entry points ledger, and transactional inbox/outbox processing.
- Added a deterministic Phase 2 architecture validator to the complete repository gate.
- Completed the Phase 3 tenancy foundation with no-login roles, explicit grants, composite tenant keys, live membership RLS, and scoped support access.
- Added 41 adversarial tenancy assertions; exact-head Docker/Supabase CI now passes 49 total pgTAP checks across migration replay and reset.
