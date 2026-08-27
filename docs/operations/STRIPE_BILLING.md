# Managed Stripe billing operations

## Current boundary

M14-S03 adds disabled owner-only Stripe Checkout and Customer Portal session creation to the managed-only webhook receiver and isolated normalization worker. Prices remain externally configured private database evidence; usage, invoice presentation, and payment enforcement remain outside this slice. Production remains `self_hosted`, both Stripe secret paths remain empty, and the optional worker profile remains stopped.

Endpoint:

`POST /api/v1/billing/stripe/webhooks`

The endpoint accepts only Stripe-signed JSON up to 256 KiB. A successful new or exact duplicate event returns `202`; an authenticated but unsupported Stripe event returns `204`. Safe `4xx` responses identify malformed, stale, conflicting, disabled, or unsupported input without echoing provider data. Transient configuration/database failure returns `503` with a bounded retry hint.

## Disabled default

- Leave `LOYALTY_STRIPE_WEBHOOK_SECRET_PATH` and `LOYALTY_STRIPE_API_KEY_PATH` empty for self-hosted and unapproved managed deployments. Compose mounts `/dev/null`; each runtime reader rejects it because it is not a regular secret file.
- Do not start the `billing` Compose profile.
- Keep the global deployment mode `self_hosted`, or keep `managed.billing` disabled for every account.
- The self-hosted database reservation returns before API-key access or provider construction and requires no Stripe configuration.

The database gate runs before body or secret access. A self-hosted request therefore needs no Stripe configuration and creates no receipt.

## Sandbox enablement

Only after an approved M14 canary:

1. Create reviewed Stripe sandbox Prices and a webhook endpoint at the canonical HTTPS URL. Subscribe only to the event allowlist documented in `docs/api/BILLING.md`.
2. Place the restricted sandbox API key and endpoint signing secret in separate root-managed files outside the repository. The dashboard runs as UID/GID `1001`; expose each file read-only with the minimum ownership/mode required. Never place either value in `.env`, a command line, logs, evidence, or support output.
3. Configure the private append-only provider mode and plan versions through a privileged operator connection. Confirm the API key test/live mode matches the database provider mode; never commit a Price ID.
4. Set both absolute host secret paths, recreate the dashboard container, create the explicit tenant `managed.billing` canary entitlement, and keep every other tenant disabled.
5. Start only the isolated worker with `docker compose --profile billing up -d billing-worker`. It receives the least-privilege worker database URL and no Stripe secret or provider network client.
6. As the canary organization owner, create Checkout and Portal sessions. Confirm an admin, revoked owner, and other-tenant owner fail; browser requests cannot select a customer, Price, mode, or return URL; and provider failure records a bounded rejected or ambiguous attempt.
7. Complete official sandbox and test-clock subscription create/update/delete/pause/resume plus invoice paid/payment-failed/payment-action-required cases. Exercise duplicate, delayed, changed-replay, out-of-order, stale-signature, worker-stop, lease-expiry, entitlement-revocation, cancelled return, and lost browser-return cases.
8. Reconcile each operation, provider event ID, account, session, receipt, job, attempt, and normalized state revision. Confirm the return page changes nothing, no redirect URL or payment/contact data is stored, zero loyalty ledger changes occur, and checkout remains independent.

Exact sandbox credentials, approved test Prices, and a real Stripe endpoint remain owner inputs for the M14 production canary. Local deterministic fixtures are repository evidence, not a claim that the external endpoint has passed.

## Observation and recovery

Monitor aggregate receipt/job/attempt counts through a privileged operator connection without selecting raw provider identifiers into logs. Alert on `retryable`, `held`, `dead_letter`, expired leases, changed-event conflicts, and sustained `503` responses. The receipt body digest is evidence, not a recoverable payload.

If intake is healthy but processing is stopped, keep the endpoint available and restart the isolated worker; pending receipts remain durable. If a lease expires, the next claim records `lease_expired` and retries up to ten total attempts. If entitlement changes after claim, the job is held with `billing_webhook_disabled` and creates no state revision.

For an ambiguous provider outcome, stop new intake if necessary, retain every receipt and attempt, and reconcile by event ID using a separately approved provider-read tool. Never edit a receipt, attempt, or normalized state row. Forward-correct commercial state with a new reviewed event or later manual-contract evidence.

## Rollback

1. Disable the tenant canary entitlement or return the deployment to `self_hosted`.
2. Stop the optional `billing-worker` service.
3. Remove both Stripe secret-path settings and recreate the dashboard container.
4. Verify that balance reads, refunds, reconciliation, exports, promised reward redemption, account access, and WooCommerce checkout remain available.
5. Retain and reconcile all accepted receipt and normalized-state evidence.
