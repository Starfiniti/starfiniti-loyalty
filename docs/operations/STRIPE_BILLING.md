# Managed Stripe billing operations

## Current boundary

M14-S05 completes the local deterministic delinquency/manual-contract policy, table-bound managed-growth enforcement, and authority-aware merchant recovery experience around the disabled immutable usage capture, owner-only Checkout/Portal flow, managed-only webhook receiver, and isolated billing worker. Prices, meter definitions, event names, delinquency terms, and contracts remain externally approved private evidence. Production remains `self_hosted`, all three Stripe secret paths remain empty, and the optional worker profile remains stopped.

Endpoint:

`POST /api/v1/billing/stripe/webhooks`

The endpoint accepts only Stripe-signed JSON up to 256 KiB. A successful new or exact duplicate event returns `202`; an authenticated but unsupported Stripe event returns `204`. Safe `4xx` responses identify malformed, stale, conflicting, disabled, or unsupported input without echoing provider data. Transient configuration/database failure returns `503` with a bounded retry hint.

## Disabled default

- Leave `LOYALTY_STRIPE_WEBHOOK_SECRET_PATH`, `LOYALTY_STRIPE_API_KEY_PATH`, and `LOYALTY_STRIPE_USAGE_API_KEY_PATH` empty for self-hosted and unapproved managed deployments. Compose mounts `/dev/null`; each runtime reader rejects it because it is not a regular secret file.
- Do not start the `billing` Compose profile.
- Keep the global deployment mode `self_hosted`, or keep `managed.billing` disabled for every account. The database authoring guard treats this tenant entitlement as the commercial-enforcement canary switch, so managed feature tests and pre-canary tenants retain ordinary entitlement behavior.
- The self-hosted database reservation returns before API-key access or provider construction and requires no Stripe configuration.

The database gate runs before body or secret access. Self-hosted usage capture returns before reading source tables, claim returns no dispatch, and no usage-key file or provider client is touched.

## Commercial policy administration

- Configure no delinquency or manual-contract record until its policy, approver, effective interval, and rollback have been approved. The repository seeds none.
- Append policy only through `record_managed_billing_delinquency_policy_v1` and contract decisions only through `record_managed_billing_manual_contract_v1` on a privileged operator connection. Browser, runtime, and worker roles have no execute or table access.
- Use separate bounded actor and approver references; do not put names, email addresses, provider identifiers, contract documents, prices, or secrets in either reference or reason.
- One effective instant accepts one semantic decision. An exact retry, including one with a different caller key, converges; a conflicting same-instant decision fails closed.
- A current `allow_growth` contract overrides delayed provider state. Append open-ended `defer_to_provider` to end local precedence early; otherwise a bounded contract falls through when its term ends. Never update or delete history.
- Delinquency grace is bound to policy already recorded at provider occurrence. Backdating a later policy cannot alter an old event. Provider `past_due` remains restricted when no approved policy existed.
- Commercial recovery changes only new growth/configuration authorization. Verify all six protected paths and normal ingestion/release/reversal/redemption/reconciliation/export/checkout processing independently before and after every change.
- Treat `managed_growth_configuration_boundaries` as a security inventory, not a merchant configuration table. Adding a mutable authoring root requires its capability, operations, command names, trigger, risk-reducing states, full commercial-state matrix, and protected-function structural check in one change.
- Do not add ledger, wallet, lot, reward-reservation, commerce, customer-access, analytics-export, migration-correction, membership, SCIM-provisioning, or checkout relations to the inventory. Those paths must remain usable in every commercial state.
- A restricted merchant must still be able to pause/cancel campaigns, disable/retire webhooks, pause report schedules, revoke service credentials, isolate sharing, disable currency conversion, disable/retire/recover federation, rotate/revoke an existing SCIM credential, export data, and complete already-started external recovery.
- Test exact retries separately from new requests. A retry that resolves immutable prior evidence should remain readable; a changed or new request must reach the guarded root and fail atomically.

## Sandbox enablement

Only after an approved M14 canary:

1. Create reviewed Stripe sandbox Prices, four sum-aggregation raw-ingestion meters, and a webhook endpoint at the canonical HTTPS URL. Subscribe only to the event allowlist documented in `docs/api/BILLING.md`. Record meter event names externally; never commit a Price or meter ID.
2. Place the session API key, meter-event restricted key, and endpoint signing secret in three separate root-managed files outside the repository. The dashboard runs as UID/GID `1001`; expose each file read-only with the minimum ownership/mode required. Never place a value in `.env`, a command line, logs, evidence, or support output.
3. Configure the private append-only provider mode, plan versions, and meter event-name versions through a privileged operator connection. Confirm each key's test/live mode matches the database provider mode.
4. Set all three absolute host secret paths, recreate the dashboard container, create the explicit tenant `managed.billing` canary entitlement, and keep every other tenant disabled.
5. Start only the isolated worker with `docker compose --profile billing up -d billing-worker`. It receives the least-privilege worker database URL and only the meter-event key; webhook normalization still performs no provider request.
6. As the canary organization owner, create Checkout and Portal sessions. Confirm an admin, revoked owner, and other-tenant owner fail; browser requests cannot select a customer, Price, mode, or return URL; and provider failure records a bounded rejected or ambiguous attempt.
7. Complete official sandbox and test-clock subscription create/update/delete/pause/resume plus invoice paid/payment-failed/payment-action-required cases. A clock advance is asynchronous: wait for the clock's ready state through its event or bounded polling before reconciling subscription and invoice evidence. Exercise duplicate, delayed, changed-replay, out-of-order, stale-signature, worker-stop, lease-expiry, entitlement-revocation, cancelled return, and lost browser-return cases.
8. In shadow mode, reconcile all four local source totals before enabling meter versions. Then exercise exact meter replay, negative compensation, HTTP `409`/`429`/`5xx`, timeout, malformed response, expired provider window, worker loss before/after authorization, key removal, and meter/account version changes.
9. Reconcile each operation, provider event, account, session, receipt, job, usage fact, permanent meter identifier, provider aggregate, attempt, and normalized state revision. Stripe meter processing is asynchronous, so poll bounded meter summaries until they converge before comparing invoice quantities. Confirm the return page and provider aggregate change nothing, no redirect URL or payment/contact/source data is stored, zero loyalty ledger changes occur, and checkout remains independent.

Exact sandbox credentials, approved test Prices, and a real Stripe endpoint remain owner inputs for the M14 production canary. Local deterministic fixtures are repository evidence, not a claim that the external endpoint has passed.

Official behavior reviewed for the gate:

- [Stripe test clocks and simulations](https://docs.stripe.com/billing/testing/test-clocks)
- [Stripe test-clock API and asynchronous advancement](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage)
- [Stripe usage-based billing and asynchronous meter summaries](https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide)
- [Stripe subscription webhook and invoice behavior](https://docs.stripe.com/billing/subscriptions/webhooks)

## Canary evidence gate

`npm run billing:canary:validate` validates `docs/plan/evidence/M14/canary.yaml` during every root repository check. The manifest has 48 exact checks, fixed seven-category score arithmetic, a 90/100 target, an 80% floor in every category, minimized-evidence scanning, and deterministic false-completion self-tests.

The gate remains `in_progress` until every repository, approval, recovery, disabled-deployment, self-hosted no-call, Stripe sandbox, test-clock lifecycle, usage, invoice, protected-path, outage, rollback, observation, and final-reconciliation check passes. A 90/100 total cannot compensate for a category below its floor; the initial 3/10 operability score deliberately blocks completion.

Do not put keys, webhook signatures, contact or payment data, raw provider bodies, or provider resource identifiers in the manifest. Store restricted source evidence only in the approved operator evidence location and record a minimized result here.

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
