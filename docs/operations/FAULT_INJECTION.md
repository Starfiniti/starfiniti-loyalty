# Fault injection and retry-storm exercise

This exercise is destructive to a disposable environment. It is never authorized for production. Controller success proves only that faults were applied, restored, and followed by healthy public probes; it does not prove loyalty-value correctness.

## Safety boundary

- Use a dedicated Linux host or VM whose Compose project is disposable and production-like. Do not reuse the production application or database VM.
- Keep the controller local to that host. Dashboard, storefront, and Toxiproxy administration origins must be loopback HTTP origins.
- Label every controlled service with `starfiniti.disposable=true` and a non-production `starfiniti.environment` value. The controller also verifies the exact Compose project/service labels returned by Docker.
- Do not mount the Docker socket into an application or chaos container. The short-lived operator process invokes Docker locally and resolves one exact labeled container before signalling it.
- Route only the approved disposable database/provider paths through exact `starfiniti-chaos-*` Toxiproxy proxies. The controller removes only its named latency toxic or restores the exact proxy it disabled; it never calls the global Toxiproxy reset endpoint.
- Store the sandbox marker, Compose file, control file, approval, and signed HTTP fixtures in the disposable sandbox. Marker, control, approval, and fixtures must be owner-only. Do not commit them.
- Use synthetic non-personal customers, orders, addresses, and provider accounts. Never reuse production credentials, signing keys, payloads, database data, or customer identities.

## Required sandbox files

The sandbox root contains an owner-only `.starfiniti-disposable-chaos.yaml`:

```yaml
schema: starfiniti.disposable-chaos-sandbox.v1
project: starfiniti-chaos-approved-pilot
disposable: true
```

The owner-only control file uses `starfiniti.fault-control.v1` and supplies:

- the exact sandbox root;
- marker and Compose paths plus raw SHA-256 digests;
- one `starfiniti-chaos-*` Compose project;
- exact worker and database Compose service names;
- loopback dashboard, storefront, and Toxiproxy origins;
- exact database and provider proxy names;
- owner-only `duplicateDelivery` and `retryTrigger` fixture paths plus raw digests.

Each HTTP fixture uses `starfiniti.fault-http-fixture.v1`, a dashboard/storefront origin alias, `POST` or `PUT`, a query-free absolute path, bounded lowercase headers, canonical Base64 body, and one to three exact expected 2xx statuses. Generate fresh timestamped signatures immediately before the approved run. The report contains only the aggregate fixture-set digest.

The owner-only approval uses `starfiniti.fault-run-approval.v1`. It binds the exact candidate commit, canonical plan digest, raw control/marker/Compose digests, aggregate fixture-set digest, Compose project, approved UTC interval of at most 24 hours, maximum aggregate fault seconds, and maximum replay requests.

## Before execution

1. Start from the exact clean candidate commit and validate the repository.
2. Record immutable application/worker images, database and proxy versions/configuration, migration head, WordPress/WooCommerce/plugin versions, storage/network shape, and synthetic data cardinalities.
3. Verify the application really reaches the database/provider through each named proxy. A configured but bypassed proxy invalidates the exercise.
4. Start observations for application health, database pool/locks, queue depth/oldest age/leases/attempts, WAL and recovery logs, storage, proxy state, native checkout, connector commands, and driver activity.
5. Reconcile accepted source facts, canonical events, effects, ledger transactions/entries, wallet/lot projections, rewards/reservations, WooCommerce orders/coupons/refunds, provider attempts, queue state, and dead letters to a zero-difference baseline.
6. Confirm all fixtures contain only synthetic data and their credentials can be revoked after the run.

## Execute

Run from the clean repository checkout:

```text
npm run faults:run -- --plan infrastructure/testing/fault-injection/plan.yaml --control-file <absolute-owner-file> --approval-file <absolute-owner-file> --out <new-absolute-json-file>
```

The controller runs sequentially and stops after any failed scenario. It covers worker `SIGKILL`, database crash/restart, database-path latency, byte-identical duplicate delivery, provider proxy disablement, and provider disablement with a bounded fixed-arrival trigger burst. Baseline and recovery probes must pass for every scenario. During-fault probes are diagnostic and may fail.

## Reconcile and close

For worker death, prove both interruption before effect and interruption after commit/before acknowledgement. For the database restart, retain bounded PostgreSQL crash-recovery/WAL evidence. For duplicate and retry scenarios, prove exactly one effect per business input, bounded attempts/backoff/leases, tenant fairness, and no queue amplification. In every scenario prove native checkout independence and protected refunds, releases, previously promised redemption, customer access, and exports.

Run the exact plan twice against the same bound environment and fresh equivalent fixtures. Commit only minimized environment, run, and aggregate reconciliation artifacts under `docs/plan/evidence/M15/runs/`; never commit the disposable control, approval, fixture, raw logs, screenshots containing identifiers, or credentials. `npm run faults:validate` rejects completion unless both reports and the zero-difference reconciliation remain digest-bound and every manifest check passes.

After evidence capture, revoke fixture credentials and tear down only the exact disposable project through its approved environment procedure. Preserve immutable loyalty history in evidence; do not update or delete ledger rows as cleanup.
