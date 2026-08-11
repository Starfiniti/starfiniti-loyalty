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
