# Capacity and load verification

The supported capacity is not a VM size or a peak request count. It is the highest exact mixed workload that passes the versioned thresholds, keeps the driver healthy, recovers after the burst, and reconciles every accepted value-bearing event.

## Safety boundary

- Never run mutating scenarios against production. Use an approved disposable staging environment with production-like application, database, proxy, storage, and worker resources.
- Put the canonical HTTPS origin in one owner-only regular file. Put the service token, customer cookie, and WooCommerce connection package in three separate owner-only files. Do not put credentials in environment variables or command arguments.
- The approval file must be short lived and bind the exact clean driver commit, origin digest, workload digest, target class, maximum aggregate rate, and maximum duration. The runner rejects drift or a dirty worktree.
- Observe the load generator independently. Driver CPU above 70%, memory above 1,024 MiB, event-loop p95 above 25 ms, or any dropped schedule invalidates the run.
- Stop immediately for checkout latency/error regression, queue age beyond the event-to-ledger target, database saturation without recovery, replication/WAL risk, unexplained balance difference, or cross-tenant/privacy evidence.

## Credential directory

`customer-cookie.txt` contains only the complete `Cookie` header value for a dedicated synthetic customer session. `service-api.token` contains one scoped `customers:write` bearer token without the `Bearer` prefix. `woocommerce.json` contains exactly `connectionId`, `keyVersion`, and `signingKey`; the key is canonical base64 with at least 32 decoded bytes. Use a dedicated load-test tenant and revoke all three credentials after the run.

The origin, credential directory, approval, and report paths must be absolute. On POSIX systems the runner rejects group/other-readable credential and approval files. It never prints their paths or contents.

## Run

```text
npm run capacity:run -- --config infrastructure/testing/capacity/workload.yaml --origin-file <absolute-file> --credential-dir <absolute-directory> --approval-file <absolute-file> --out <absolute-file>
```

The command exits nonzero when a measured threshold fails. The aggregate report is still written for diagnosis. Copy only a reviewed, minimized report digest and aggregate results into `docs/plan/evidence/M15/capacity.yaml`; never copy raw request logs.

Capacity closeout stores reviewed aggregate files below `docs/plan/evidence/M15/runs/`. The gate verifies the runner reports as `starfiniti.capacity-run.v1`, the independent normalized report as `starfiniti.capacity-independent-run.v1`, the exact environment inventory as `starfiniti.capacity-environment.v1`, and zero-difference reconciliation as `starfiniti.capacity-reconciliation.v1`. Paths and raw-file digests are bound in `capacity.yaml`; missing, changed, sensitive, failed, saturated, cross-environment, or incomplete evidence fails closed.

## Required closeout evidence

1. Record exact candidate image/commit, migrations, WordPress/WooCommerce/PHP versions, application/database/proxy/worker resources, storage and network class, dataset sizes, tenant/member/order/ledger/cardinality shape, and the isolated driver resources.
2. Capture warmup, sustained, burst, and recovery monitoring for Next.js, PostgreSQL, connection pools, workers, queues, WAL/replication, storage latency, proxy, and checkout.
3. Reconcile emitted requests to HTTP acceptance, canonical events, processed effects, ledger transactions/entries, wallets/lots, connector commands, coupons, and dead letters. Duplicate/replayed input must have one business effect.
4. Measure event occurrence/acceptance to committed ledger effect; p95 must remain below 10 seconds. Confirm customer wallet reads remain below 300 ms p95.
5. Repeat the same exact workload and environment. Throughput and latency variance must remain within the approved bound before publishing the envelope.
6. Cross-check the passing boundary with a mature independent fixed-arrival driver. Reconcile its schedule, rates, thresholds, and results to the repository runner.
7. Record the first failed higher workload separately. It is a limit-finding result, not supported capacity.

The repository validation command checks the workload, evidence contract, false-pass cases, and an in-process signed-request runner self-test without contacting production:

```text
npm run capacity:validate
```
