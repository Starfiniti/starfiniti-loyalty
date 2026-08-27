# Managed Stripe billing operations

## Current boundary

M14-S04 adds disabled immutable usage capture and Stripe meter-event dispatch to the owner-only Checkout/Portal flow, managed-only webhook receiver, and isolated billing worker. Prices, meter definitions, and event names remain externally configured private evidence. Invoice presentation and payment enforcement remain outside this slice. Production remains `self_hosted`, all three Stripe secret paths remain empty, and the optional worker profile remains stopped.

Endpoint:

`POST /api/v1/billing/stripe/webhooks`

The endpoint accepts only Stripe-signed JSON up to 256 KiB. A successful new or exact duplicate event returns `202`; an authenticated but unsupported Stripe event returns `204`. Safe `4xx` responses identify malformed, stale, conflicting, disabled, or unsupported input without echoing provider data. Transient configuration/database failure returns `503` with a bounded retry hint.

## Disabled default

- Leave `LOYALTY_STRIPE_WEBHOOK_SECRET_PATH`, `LOYALTY_STRIPE_API_KEY_PATH`, and `LOYALTY_STRIPE_USAGE_API_KEY_PATH` empty for self-hosted and unapproved managed deployments. Compose mounts `/dev/null`; each runtime reader rejects it because it is not a regular secret file.
- Do not start the `billing` Compose profile.
- Keep the global deployment mode `self_hosted`, or keep `managed.billing` disabled for every account.
- The self-hosted database reservation returns before API-key access or provider construction and requires no Stripe configuration.

The database gate runs before body or secret access. Self-hosted usage capture returns before reading source tables, claim returns no dispatch, and no usage-key file or provider client is touched.

## Sandbox enablement

Only after an approved M14 canary:

1. Create reviewed Stripe sandbox Prices, four sum-aggregation raw-ingestion meters, and a webhook endpoint at the canonical HTTPS URL. Subscribe only to the event allowlist documented in `docs/api/BILLING.md`. Record meter event names externally; never commit a Price or meter ID.
2. Place the session API key, meter-event restricted key, and endpoint signing secret in three separate root-managed files outside the repository. The dashboard runs as UID/GID `1001`; expose each file read-only with the minimum ownership/mode required. Never place a value in `.env`, a command line, logs, evidence, or support output.
3. Configure the private append-only provider mode, plan versions, and meter event-name versions through a privileged operator connection. Confirm each key's test/live mode matches the database provider mode.
4. Set all three absolute host secret paths, recreate the dashboard container, create the explicit tenant `managed.billing` canary entitlement, and keep every other tenant disabled.
5. Start only the isolated worker with `docker compose --profile billing up -d billing-worker`. It receives the least-privilege worker database URL and only the meter-event key; webhook normalization still performs no provider request.
6. As the canary organization owner, create Checkout and Portal sessions. Confirm an admin, revoked owner, and other-tenant owner fail; browser requests cannot select a customer, Price, mode, or return URL; and provider failure records a bounded rejected or ambiguous attempt.
7. Complete official sandbox and test-clock subscription create/update/delete/pause/resume plus invoice paid/payment-failed/payment-action-required cases. Exercise duplicate, delayed, changed-replay, out-of-order, stale-signature, worker-stop, lease-expiry, entitlement-revocation, cancelled return, and lost browser-return cases.
8. In shadow mode, reconcile all four local source totals before enabling meter versions. Then exercise exact meter replay, negative compensation, HTTP `409`/`429`/`5xx`, timeout, malformed response, expired provider window, worker loss before/after authorization, key removal, and meter/account version changes.
9. Reconcile each operation, provider event ID, account, session, receipt, job, usage fact, permanent meter identifier, provider aggregate, attempt, and normalized state revision. Confirm the return page and provider aggregate change nothing, no redirect URL or payment/contact/source data is stored, zero loyalty ledger changes occur, and checkout remains independent.

Exact sandbox credentials, approved test Prices, and a real Stripe endpoint remain owner inputs for the M14 production canary. Local deterministic fixtures are repository evidence, not a claim that the external endpoint has passed.

## Observation and recovery

Monitor aggregate receipt/job/attempt and usage pending/attention counts without selecting raw provider identifiers into logs. Alert on `retryable`, `held`, `ambiguous`, `rejected`, `dead_letter`, expired leases, changed-event conflicts, sustained `503` responses, and provider/local aggregate drift. The receipt body digest and usage source digest are evidence, not recoverable payloads.

If intake is healthy but processing is stopped, keep the endpoint available and restart the isolated worker; pending receipts remain durable. If a lease expires, the next claim records `lease_expired` and retries up to ten total attempts. If entitlement changes after claim, the job is held with `billing_webhook_disabled` and creates no state revision.

For an ambiguous provider outcome, stop new intake if necessary, retain every receipt and attempt, and reconcile by event ID using a separately approved provider-read tool. Never edit a receipt, attempt, or normalized state row. Forward-correct commercial state with a new reviewed event or later manual-contract evidence.

## Rollback

1. Disable the tenant canary entitlement or return the deployment to `self_hosted`.
2. Stop the optional `billing-worker` service.
3. Remove all three Stripe secret-path settings and recreate the dashboard and billing-worker containers.
4. Verify that balance reads, refunds, reconciliation, exports, promised reward redemption, account access, and WooCommerce checkout remain available.
5. Retain and reconcile all accepted receipt and normalized-state evidence.
