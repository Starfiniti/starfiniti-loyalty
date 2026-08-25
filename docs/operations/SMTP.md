# Transactional SMTP Operations

Self-hosted transactional email is optional and disabled by default. It runs from the immutable worker image in `notification` mode, separately from the default loyalty-value worker.

## Configuration

Configure the application host's secret-managed environment file:

- `LOYALTY_SMTP_HOST`: SMTP hostname or explicit private test-sink address.
- `LOYALTY_SMTP_PORT`: integer 1–65535.
- `LOYALTY_SMTP_SECURITY`: `tls` for implicit TLS, `starttls` for required STARTTLS, or `plaintext` only for an explicitly isolated local test sink.
- `LOYALTY_SMTP_FROM_ADDRESS`: one controlled sender address.
- `LOYALTY_SMTP_USERNAME`: optional; must be paired with a password file.
- `LOYALTY_SMTP_PASSWORD_FILE`: container-absolute mounted secret path; must be paired with a username.

Never put the SMTP password in the environment file, Compose YAML, Git, browser configuration, support output, or shell history. For authenticated SMTP, create an owner-controlled Compose override that mounts the password file read-only into only `notification-worker` and points `LOYALTY_SMTP_PASSWORD_FILE` at that container path.

## Disabled-first rollout

1. Apply the additive migration and deploy the exact worker image without the `smtp` profile.
2. Confirm the value worker, dashboard, checkout-outage smoke, migration compatibility, and queue grants.
3. Configure a local or approved test SMTP sink. Use `plaintext` only on the isolated loopback/private test path.
4. Start only the notification worker with `docker compose --profile smtp up -d notification-worker` from the reviewed deployment assets and secret-managed environment/override files.
5. Emit one controlled transactional event for a verified Starfiniti pilot customer. Reconcile one immutable event, one delivery, one authorization attempt, one sink message, its deterministic event-derived Message-ID, and zero ledger changes.
6. Exercise withdrawal between claim/authorization, suppression, missing verified contact, feature disable/re-enable, explicit 4xx/5xx, provider outage, and worker death before and after authorization.
7. Enable a real SMTP endpoint only after the sink evidence is exact and an operator approves the sender/domain configuration.

## Template and test-delivery gate

Before a provider canary, sign in as a verified owner/admin and use the Notifications studio to:

1. Preview each of the six active English templates with fixed non-customer sample values.
2. Publish one harmless tenant version and confirm that the version increments, the system version remains present, and an earlier delivery still references its original template UUID/hash.
3. Send one test for the active version. The command must offer no recipient field; authorization must resolve only the requesting user's currently verified Supabase Auth email.
4. Reconcile one test-delivery UUID through claim, authorization, one sink message with the visible `[Starfiniti test]` subject prefix, and one immutable terminal attempt. Confirm zero normal-delivery, event, ledger, coupon, or checkout effects.
5. Repeat the same idempotency key and confirm no second message. Change the event under that key and confirm a conflict.
6. Revoke the actor role or verified email between claim and authorization and confirm `held` or `contact_unavailable` without contact disclosure or network traffic.

Do not paste a real customer address into authored content. Markup, URLs, files, remote assets, control characters, and unknown tokens are rejected independently by the contract and PostgreSQL boundary.

## Monitoring and triage

Track queue age and counts by `pending`, `retryable`, `held`, `delivered`, `suppressed`, `contact_unavailable`, `dead_letter`, and `manual_review`; attempts per delivery; pre/post-authorization lease expiry; and authorization-to-provider-acceptance latency. Alert immediately on:

- any post-authorization lease expiry or `manual_review`;
- `attempt_limit_exhausted`;
- authentication/configuration failures;
- sustained retryable growth or oldest-due age beyond the declared SLO; or
- any simultaneous degradation in the value worker or checkout smoke.

The merchant health view is a minimized aggregate, not a provider console. Operators may use its public reference UUID and canonical error code to correlate restricted evidence, but must not add contact, destination, rendered content, response bodies, secret fingerprints, signatures, or worker references to tickets or logs.

Do not manually replay a post-authorization crash or ambiguous SMTP result. First reconcile the deterministic Message-ID with the controlled receiving/provider evidence. A future reviewed recovery command may resolve manual-review rows; direct table updates are not an operational interface.

## Outage and rollback

Stop the `notification-worker` container or remove the `smtp` profile. Do not stop the default worker. A feature rollback may disable the tenant `notifications` entitlement, which prevents new SMTP projections and moves an in-flight pre-send authorization to `held` without exposing contact.

Provider-neutral events, consent/suppression history, templates, attempts, and accepted delivery evidence remain intact. Checkout, WooCommerce native coupons, ingestion, ledger effects, refunds, reconciliation, balances, and customer access continue. Re-enabling delivery rechecks current authority before held pre-authorization work can proceed; ambiguous or terminal work is never automatically reopened.

Tenant-authored template versions and the active binding are retained during rollback. Disable the `notifications` entitlement to block new publication and test work; do not delete or rewrite template versions or accepted test attempts. System fallback remains available after a reviewed forward fix.
