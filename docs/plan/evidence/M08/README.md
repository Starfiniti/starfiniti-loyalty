# M08 Evidence — Notifications

M08 is in progress. M08-S01 is complete: ADR-0031 defines strict provider-neutral English events, purpose-separated local consent, stronger trusted suppression, Auth-derived customer commands, late contact resolution, and provider-independent value processing.

## M08-S01 — Event and consent authority

- Exact head: `33e0396dd44ddf6e6c3db92ff7ba3851b8c07636` on draft PR #32.
- CI: run `32682221777` passed the complete baseline, both production images, a clean 48-migration replay, all 39 pgTAP files with 2,066 assertions, every concurrency probe, and all four minimum/current HPOS/legacy WooCommerce runtimes. The first minimum-HPOS attempt received an upstream GitHub package-download HTTP 504; rerunning only that failed cell passed without a code change.
- Focused database evidence: all 50 `notification_event_consent_test.sql` assertions passed, covering grants/RLS, exact payloads, event and preference conflicts, cross-tenant denial, stronger suppression, unsuppression requiring new consent, privacy erasure, immutability, point-expiry dual-write, and zero ledger change.
- Contract evidence: 13 notification contract tests are included in the 183-contract-test suite; all workspace unit tests, lint, typechecks, production builds, architecture validation, migration validation, workflow validation, and secret scan passed.
- Rollback: no adapter is active. Disabling future dispatch leaves immutable event/consent evidence and every checkout, ledger, refund, reconciliation, balance, and customer-access path operational.

## M08-S02 — Isolated self-hosted SMTP delivery

- Exact head: `604bbeb7d9bca3ea32e7d41d1c5299fa683bdb03` on draft PR #32.
- CI: run `32686442063` passed the complete baseline, both production images, a clean 49-migration replay, all 40 pgTAP files with 2,152 assertions, every concurrency probe, and all four minimum/current HPOS/legacy WooCommerce runtimes.
- ADR-0032 separates SMTP into an optional notification-worker process and database-owned lease state. PostgreSQL rechecks self-hosted mode, entitlement, current consent/suppression, active customer/link, verified Supabase Auth email, and exact worker lease immediately before one authorized external call.
- Six immutable English templates cover transactional points, reward, tier, and referral events. The worker verifies the template hash, renders only allowlisted tokens, disables file/URL message access and debug logging, uses a deterministic event-derived Message-ID, and never persists recipient email, rendered content, SMTP password, or raw provider response.
- Retry policy is evidence-based: explicit 4xx and proven pre-acceptance connection failures use bounded database backoff; 5xx/configuration/authentication/message failures dead-letter; unknown or post-authorization ambiguity stops in manual review. Ten authorized attempts is the hard ceiling.
- Verification evidence: 46 worker tests include 16 focused SMTP tests and a real loopback SMTP server, exact Message-ID/recipient/content assertions, template-integrity failure before send, configuration-secret handling, conservative remote error classification, and terminal handling for deterministic local message failures. Twenty focused notification contract tests, all workspace typechecks/builds, deployment/workflow validators, lint, secret scan, and diff checks also pass.
- All 86 focused `notification_smtp_delivery_test.sql` assertions pass. They cover grants/RLS, the narrow migration-administrator-owned Auth contact bridge, event-to-delivery idempotency, ephemeral verified contact, withdrawal, feature rollback, explicit retry/dead-letter/manual-review outcomes, attempt exhaustion, pre/post-authorization crash recovery, unverified contact, template/attempt immutability, and zero ledger change.
- Deployment remains disabled. No SMTP credentials are committed or active, and no production email has been sent.

M08-S03 is complete. Its test-account canary, S04 signed webhook, S05 browser/health, and S06 deployment/canary evidence remain open. No Klaviyo, webhook, SMTP, or production notification delivery is active yet.

## M08-S03 — Tenant-bound managed Klaviyo synchronization

- Exact head: `a6bbf14258cbeca0d7ac5960186ce2dd241808a2` on draft PR #32.
- CI: run `32689107286` passed the complete baseline, both production images, a clean 50-migration replay, all 41 pgTAP files with 2,219 assertions, every concurrency probe, and all four minimum/current HPOS/legacy WooCommerce runtimes.
- ADR-0033 pins stable API revision `2026-07-15` and selects one isolated worker per tenant-bound connection. Claims and authorizations verify the connection UUID and SHA-256 private-key fingerprint before resolving contact; the private key stays in an absolute mounted file and PostgreSQL stores only its fingerprint.
- Additive private schema projects provider-neutral customer events and latest marketing preference facts into bounded leases. Preparation and action authorization independently recheck managed mode, entitlement, current purpose consent, exact latest preference event, active customer/link, verified Auth email, and tenant-scoped provider profile mapping.
- Profile sync sends only verified email and opaque customer UUID. Event sync uses the immutable event UUID as Klaviyo `unique_id`; local unsubscribe is globally restrictive and safely repeatable. Subscribe first reads provider subscription/suppression state, never uses historical-import fields, imports stronger provider suppression locally, and stops ambiguous submission in manual review.
- Worker verification currently includes a real loopback HTTP sink, pinned revision/auth headers, minimized profile/event/consent bodies, provider-suppression parsing, bounded/cancelled response reads, `Retry-After`, and distinct ambiguity behavior for subscribe versus safe event/unsubscribe retries. PostgreSQL tests cover the tenant/key binding, grants/RLS, replay, late contact/consent/entitlement checks, provider suppression, supersession, profile mapping, accepted/retry/manual evidence, immutability, and zero ledger change.
- The 67 focused Klaviyo pgTAP assertions all pass. The workspace also passes 57 worker tests, 198 contract tests, all typechecks/builds, architecture/deployment/workflow validators, secret scanning, and the disabled Compose profile check.
- Production remains disabled with no connection or credential. A real Klaviyo test-account canary remains an S06 owner-input gate.
