# M08 Evidence — Notifications

M08 is in progress. M08-S01 is complete: ADR-0031 defines strict provider-neutral English events, purpose-separated local consent, stronger trusted suppression, Auth-derived customer commands, late contact resolution, and provider-independent value processing.

## M08-S01 — Event and consent authority

- Exact head: `33e0396dd44ddf6e6c3db92ff7ba3851b8c07636` on draft PR #32.
- CI: run `32682221777` passed the complete baseline, both production images, a clean 48-migration replay, all 39 pgTAP files with 2,066 assertions, every concurrency probe, and all four minimum/current HPOS/legacy WooCommerce runtimes. The first minimum-HPOS attempt received an upstream GitHub package-download HTTP 504; rerunning only that failed cell passed without a code change.
- Focused database evidence: all 50 `notification_event_consent_test.sql` assertions passed, covering grants/RLS, exact payloads, event and preference conflicts, cross-tenant denial, stronger suppression, unsuppression requiring new consent, privacy erasure, immutability, point-expiry dual-write, and zero ledger change.
- Contract evidence: 13 notification contract tests are included in the 183-contract-test suite; all workspace unit tests, lint, typechecks, production builds, architecture validation, migration validation, workflow validation, and secret scan passed.
- Rollback: no adapter is active. Disabling future dispatch leaves immutable event/consent evidence and every checkout, ledger, refund, reconciliation, balance, and customer-access path operational.

M08-S02 SMTP sink, S03 Klaviyo test account, S04 signed webhook, S05 browser/health, and S06 deployment/canary evidence remain open. No SMTP, Klaviyo, webhook, contact copy, or production notification delivery is active yet.
