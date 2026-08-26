# Managed Stripe billing operations

## Current boundary

M14-S02 provides a disabled managed-only Stripe webhook receiver and an isolated normalization worker. It does not create Checkout or Portal sessions, call Stripe, configure prices, send usage, expose invoices, or enforce payment. Production remains `self_hosted` and the optional worker profile remains stopped.

Endpoint:

`POST /api/v1/billing/stripe/webhooks`

The endpoint accepts only Stripe-signed JSON up to 256 KiB. A successful new or exact duplicate event returns `202`; an authenticated but unsupported Stripe event returns `204`. Safe `4xx` responses identify malformed, stale, conflicting, disabled, or unsupported input without echoing provider data. Transient configuration/database failure returns `503` with a bounded retry hint.

## Disabled default

- Leave `LOYALTY_STRIPE_WEBHOOK_SECRET_PATH` empty for self-hosted and ordinary managed deployments. Compose mounts `/dev/null`; the runtime rejects it because it is not a regular secret file.
- Do not start the `billing` Compose profile.
- Keep the global deployment mode `self_hosted`, or keep `managed.billing` disabled for every account.
- No Stripe API key is used or accepted by this slice.

The database gate runs before body or secret access. A self-hosted request therefore needs no Stripe configuration and creates no receipt.

## Sandbox enablement

Only after an approved M14 canary:

1. Create a Stripe sandbox webhook endpoint at the canonical HTTPS URL and subscribe only to the event allowlist documented in `docs/api/BILLING.md`.
2. Place the endpoint signing secret in a root-managed file outside the repository. The dashboard container runs as UID/GID `1001`; expose the file read-only with the minimum ownership/mode needed by that runtime. Never place the value in `.env`, a command line, logs, evidence, or support output.
3. Set `LOYALTY_STRIPE_WEBHOOK_SECRET_PATH` to the absolute host path and recreate the dashboard container.
4. Create the reviewed private billing-account binding and explicit tenant `managed.billing` canary entitlement. A provider customer ID never grants tenant access by itself.
5. Start only the isolated worker with `docker compose --profile billing up -d billing-worker`. It receives the least-privilege worker database URL and no Stripe secret or network credential.
6. Send official sandbox fixtures for subscription create/update/delete/pause/resume and invoice paid/payment-failed/payment-action-required. Exercise duplicate, delayed, changed-replay, out-of-order, stale-signature, worker-stop, lease-expiry, and entitlement-revocation cases.
7. Reconcile each provider event ID to one immutable receipt, one terminal or held job, immutable attempt history, and at most one normalized subscription revision. Confirm zero loyalty ledger changes and no checkout dependency.

Exact sandbox signing material and a real Stripe endpoint remain owner inputs for the M14 production canary. Local deterministic fixtures are repository evidence, not a claim that the external endpoint has passed.

## Observation and recovery

Monitor aggregate receipt/job/attempt counts through a privileged operator connection without selecting raw provider identifiers into logs. Alert on `retryable`, `held`, `dead_letter`, expired leases, changed-event conflicts, and sustained `503` responses. The receipt body digest is evidence, not a recoverable payload.

If intake is healthy but processing is stopped, keep the endpoint available and restart the isolated worker; pending receipts remain durable. If a lease expires, the next claim records `lease_expired` and retries up to ten total attempts. If entitlement changes after claim, the job is held with `billing_webhook_disabled` and creates no state revision.

For an ambiguous provider outcome, stop new intake if necessary, retain every receipt and attempt, and reconcile by event ID using a separately approved provider-read tool. Never edit a receipt, attempt, or normalized state row. Forward-correct commercial state with a new reviewed event or later manual-contract evidence.

## Rollback

1. Disable the tenant canary entitlement or return the deployment to `self_hosted`.
2. Stop the optional `billing-worker` service.
3. Remove the secret-path setting and recreate the dashboard container.
4. Verify that balance reads, refunds, reconciliation, exports, promised reward redemption, account access, and WooCommerce checkout remain available.
5. Retain and reconcile all accepted receipt and normalized-state evidence.
