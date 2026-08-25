# Analytics reports operations

## Boundary

The reporting worker generates bounded tenant aggregate JSON reports. It does not send email, expose raw rows, mutate loyalty value, or participate in WooCommerce checkout. Manual and scheduled requests remain visible in `/analytics`; ready payloads expire after 24 hours and download capabilities expire after five minutes and work once for the issuing Auth subject/session.

The default deployment keeps the Compose `reporting` profile stopped. Apply the additive migration and deploy the exact dashboard/worker image before starting that profile.

## Pre-enable checks

1. Confirm the release's complete CI and clean database replay passed, including `analytics_exports_schedules_test.sql` and `verify-analytics-export-concurrency.mjs`.
2. Confirm the dashboard runtime uses the restricted `loyalty_runtime` database role and the worker URL uses `loyalty_worker`; neither may be a migration administrator.
3. Confirm the old dashboard can still read after the additive migration and the new dashboard is healthy while `reporting-worker` is stopped.
4. As the Starfiniti owner, request one 7-day UTC manual report. Confirm it remains `pending` while the profile is stopped and that ledger/refund/reconciliation and WooCommerce health do not change.
5. Start only one reporting instance for the pilot: `docker compose --profile reporting up -d reporting-worker` from the release environment.

## Canary acceptance

- The request progresses `pending → processing → ready` with one attempt and no unbounded error text.
- The private source is at most 5 MiB; the final validated JSON response is at most 10 MiB.
- The download uses an attachment response with `private, no-store`, contains `starfiniti.analytics-report-export.v1`, Dictionary V4, and exactly four reports, and contains no row-level identity.
- Reusing the download, moving its cookie to another session, revoking membership, or waiting past expiry returns no content.
- A daily, weekly, and monthly test schedule each calculate a future occurrence in the configured IANA timezone. Repeated materialization of one due instant creates one request.
- Killing the reporting worker after claim allows lease recovery and a bounded retry; five attempts or a permanent actor/scope/entitlement/payload failure ends safely.
- Ledger transaction/entry counts and WooCommerce checkout/value-worker latency remain unchanged except for unrelated live business work.

## Monitoring

Monitor request counts grouped by `state` and canonical `failure_code`, oldest pending/retry age, expired processing leases, ready payload age/bytes, and schedule `next_run_at`/`last_run_at`. Alert on any processing lease beyond its expiry, any ready payload beyond 24 hours, repeated `generation_failed`, payload-limit failure, or a schedule whose next run no longer advances.

Never log or include `source_payload`, capability tokens, cookie values, report JSON, database URLs, contact data, or raw database exceptions in alerts or support bundles.

## Rollback

Stop only `reporting-worker` with the reporting profile. Hide the export controls only by rolling back the application image or the server-side analytics entitlement; do not reverse the additive migration. Pending jobs and schedules become inert, ready payloads remain subject to expiry cleanup when the worker resumes, and request/audit evidence remains intact. Balances, refunds, reconciliation, existing reports, notifications, connectors, and checkout continue independently.
