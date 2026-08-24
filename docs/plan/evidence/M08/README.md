# M08 Evidence — Notifications

M08 is in progress. M08-S01 is complete: ADR-0031 defines strict provider-neutral English events, purpose-separated local consent, stronger trusted suppression, Auth-derived customer commands, late contact resolution, and provider-independent value processing.

## M08-S01 — Event and consent authority

- Exact head: `33e0396dd44ddf6e6c3db92ff7ba3851b8c07636` on draft PR #32.
- CI: run `32682221777` passed the complete baseline, both production images, a clean 48-migration replay, all 39 pgTAP files with 2,066 assertions, every concurrency probe, and all four minimum/current HPOS/legacy WooCommerce runtimes. The first minimum-HPOS attempt received an upstream GitHub package-download HTTP 504; rerunning only that failed cell passed without a code change.
- Focused database evidence: all 50 `notification_event_consent_test.sql` assertions passed, covering grants/RLS, exact payloads, event and preference conflicts, cross-tenant denial, stronger suppression, unsuppression requiring new consent, privacy erasure, immutability, point-expiry dual-write, and zero ledger change.
- Contract evidence: 13 notification contract tests are included in the 183-contract-test suite; all workspace unit tests, lint, typechecks, production builds, architecture validation, migration validation, workflow validation, and secret scan passed.
- Rollback: no adapter is active. Disabling future dispatch leaves immutable event/consent evidence and every checkout, ledger, refund, reconciliation, balance, and customer-access path operational.

## M08-S02 — Isolated self-hosted SMTP delivery

- Repository checkpoint: `1fce7a6` on draft PR #32; exact-head Linux CI is pending, so S02 remains in progress.
- ADR-0032 separates SMTP into an optional notification-worker process and database-owned lease state. PostgreSQL rechecks self-hosted mode, entitlement, current consent/suppression, active customer/link, verified Supabase Auth email, and exact worker lease immediately before one authorized external call.
- Six immutable English templates cover transactional points, reward, tier, and referral events. The worker verifies the template hash, renders only allowlisted tokens, disables file/URL message access and debug logging, uses a deterministic event-derived Message-ID, and never persists recipient email, rendered content, SMTP password, or raw provider response.
- Retry policy is evidence-based: explicit 4xx and proven pre-acceptance connection failures use bounded database backoff; 5xx/configuration/authentication/message failures dead-letter; unknown or post-authorization ambiguity stops in manual review. Ten authorized attempts is the hard ceiling.
- Local evidence: all workspace typechecks, worker build, 45 worker tests, 20 focused notification contract tests, static validation of 49 migrations/40 pgTAP files, deployment/workflow validators, lint, secret scan, and diff checks pass. Fifteen SMTP worker tests include a real loopback SMTP server, exact Message-ID/recipient/content assertions, template-integrity failure before send, configuration-secret handling, and conservative error classification.
- Pending authority: the new clean 49-migration replay and 84 focused `notification_smtp_delivery_test.sql` assertions must pass on Linux CI before S02 is marked complete. Those assertions cover grants/RLS, the narrow Auth-owned contact bridge, event-to-delivery idempotency, ephemeral verified contact, withdrawal, feature rollback, explicit retry/dead-letter/manual-review outcomes, attempt exhaustion, pre/post-authorization crash recovery, unverified contact, template/attempt immutability, and zero ledger change.
- Deployment remains disabled. No SMTP credentials are committed or active, and no production email has been sent.

M08-S03 Klaviyo test account, S04 signed webhook, S05 browser/health, and S06 deployment/canary evidence remain open. No Klaviyo, webhook, or production notification delivery is active yet.
