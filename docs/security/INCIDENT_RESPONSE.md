# Security incident response

Security incidents use the severity, roles, state machine, communication cadence, evidence controls, and exercise gate in `docs/operations/INCIDENT_MANAGEMENT.md`, plus the applicable `OPS-010`, `OPS-012`, `OPS-013`, `OPS-014`, or `OPS-015` runbook.

Contain affected credentials, sessions, tenant routes, and provider access without changing evidence or ledger history. Live PostgreSQL membership, RLS, and explicit service scopes remain authorization authority; email, domain, OIDC/SAML group claims, and JWT metadata never grant tenant access. Preserve a minimized timeline and exact release/configuration fingerprints in general incident systems. Customer identities, payloads, credentials, keys, raw requests, database contents, and penetration-test details remain in a separately authorized restricted evidence store.

Every security incident assesses tenant isolation, identity/session revocation, privacy obligations, immutable ledger and protected-value impact, WooCommerce checkout independence, backup/recovery integrity, and provider exposure. Recovery requires adversarial regression tests and independent review for any Critical/High issue. Corrections compensate; history and failed evidence are never rewritten or deleted.
