# Observability deployment

This runbook packages the M15 monitoring candidate without granting it production authority. Production activation remains disabled until an approved monitoring environment, minimized live-target inventory, environment-owned receiver configuration, independent dead-man route, and owner-approved activation window are recorded in `docs/plan/evidence/M15/observability-deployment.yaml` and `docs/plan/evidence/M15/operations.yaml`.

## Security boundary

- Prometheus and Alertmanager publish only to `127.0.0.1`. Grafana publishes no host port and remains on the internal control network; an approved HTTPS reverse proxy outside this bundle must join that network before remote administration is activated.
- Blackbox and PostgreSQL exporters publish no host port. No service receives the Docker socket, a host namespace, Linux capabilities, a writable root, or a production credential from Git.
- Target files, Alertmanager receiver configuration, the Grafana administrator password file, and PostgreSQL exporter authentication modules are operator-owned absolute paths. Never copy their contents into Git, CI artifacts, logs, or incident evidence.
- Discovery labels are bounded operational classes. Tenant, organization, workspace, customer, member, order, email, coupon, token, payload, correlation, private topology, and raw target identity are forbidden.
- Monitoring is never authority for checkout, ledger effects, refunds, reconciliation, promised rewards, exports, or customer balance/history access.

## Repository and disposable checks

Run the deterministic repository guard first:

```text
npm run observability:deployment:validate
```

On a clean Linux amd64 exact commit with Docker Compose, run the disposable canary with a new output filename:

```text
npm run observability:deployment:run -- --out dist/observability-deployment/operator-review.json
```

The canary runs `promtool check config`, `amtool check-config`, pulls the five exact image indexes, confirms their exact runtime versions and hardening, binds published administration to loopback, verifies Grafana through its internal build-info metric, proves Grafana and both exporters publish no host port, and removes every container, network, and volume before writing a minimized report. It uses only safe empty provider configuration and `.example.invalid` targets. A canary report is not production evidence.

## Prepare an approved environment

1. Bind the candidate to a dedicated Linux amd64 monitoring host with restricted administrator access, synchronized time, encrypted storage, defined retention, backup, and rollback ownership. Record the host class and approvals outside public evidence.
2. Copy `infrastructure/observability/deployment/.env.example` to an operator-owned environment file outside the checkout. Keep the bind address at `127.0.0.1`.
3. Create an owner-only target directory. Add only reviewed file-discovery JSON matching the four examples under `infrastructure/observability/deployment/examples`; use bounded service classes and keep raw target addresses out of retained evidence.
4. Create an owner-only Alertmanager configuration outside Git. Bind route classes to approved destinations, preserve protected-value inhibition rules, and validate it with the exact Alertmanager image and `amtool` before reload.
5. Create an owner-only Grafana administrator password file. Use a long random value and mode `0600`. Grafana consumes this file only while bootstrapping an empty data volume; later rotation must use the authenticated Grafana administration path, atomically update the owner file to match, verify a fresh login, and only then revoke the prior credential. Restarting with a changed bootstrap file is not a rotation procedure.
6. Create an owner-only PostgreSQL exporter configuration outside Git. Use a dedicated read-only database role restricted to approved aggregate monitoring views; never grant service-role, DDL, RLS-bypass, customer, order, ledger-row, or secret access.
7. Validate the rendered Compose model, Prometheus configuration with `promtool`, Alertmanager configuration with `amtool`, exact image indexes, target inventory digest, and rollback procedure before any start.

The environment file and every mounted path must pass the owner/type/mode,
canonical-path, outside-repository, target/secret separation, loopback, distinct
port, and HTTPS checks without printing values:

```text
npm run observability:environment:validate -- --env /absolute/owner/path/observability.env
```

Run that check immediately before rendering Compose. A passing result is a
preflight only; it grants no production, target, receiver, or paging authority.

## Host textfile agent candidate

The host agent is deliberately separate from Compose. Download `node_exporter-1.12.1.linux-amd64.tar.gz` only from the recorded official release, require exactly 12,168,577 bytes and SHA-256 `b51d8a76aa2a9156a55d501aca6276fae09e262259a5e4e831d2c2222f084e63`, and install the binary as `/opt/starfiniti/monitoring/node_exporter` only during an approved window.

Use a locked non-login `starfiniti-node-exporter` account and the reviewed `infrastructure/observability/node-exporter/starfiniti-node-exporter.service`. The unit disables all default collectors and enables only the textfile collector at `/var/lib/node_exporter/textfile_collector`. Bind its listener to an approved private monitoring address in an environment-owned override; never expose it publicly. The backup scripts atomically publish only bounded aggregate `*.prom` files.

Install the exact `starfiniti-backup-network-counters` script plus its service
and timer under the same approved monitoring change. Copy
`backup-network-counters.env.example` to the owner-controlled
`/etc/starfiniti/backup-network-counters.env`, replace both placeholders with
the independently verified guest-observation `rx_bytes` and physical-uplink
`tx_bytes` sysfs files, make the file root-owned and readable by only the
`starfiniti-node-exporter` group, and validate that the two paths differ. The
private names never become metric labels or retained public evidence. The
collector cannot create IP sockets or send IP traffic, has no Linux capability, and publishes only two
monotonic counters plus capture time through atomic textfile replacement.

Before enabling the timer, compare a bounded direct counter delta with the
published values, prove the capture-age alert on a disposable fixture, and
exercise the high-internal-stream rule with synthetic counters rather than
production traffic. The alert threshold is 100 MiB/s, more than four times the
physical-uplink rate, sustained for one minute. It signals an internal flow
requiring attribution; it does not establish exfiltration or authorize process
termination. Production activation remains disabled until the normal
activation gate below is approved.

## Activation gate

Do not start the production candidate until every deployment evidence check through `dead_man_delivery` has passed. Start disabled from paging where the provider supports it, confirm all exact targets and rules, query every dashboard panel, prove missing-series alerts, then exercise primary and secondary delivery plus the independently hosted dead-man route. Only an explicit owner-approved activation may set production monitoring and routing claims true.

Observe at least one complete operational and backup cycle. Reconcile target freshness, alert state, routing, transfer-amplification signals, archive identity/age, ledger/queue invariants, checkout independence, privacy, and zero unexpected label identity. Preserve minimized digests and timings, not raw targets or credentials.

## Rollback

Stop the exact Compose project, retain or export approved monitoring data according to the environment policy, and remove its containers and networks. Disable and remove the native node exporter unit and binary only after confirming no other approved monitor consumes it; retain aggregate textfile evidence according to recovery policy. Restore the previous environment-owned receiver and target files if a configuration reload fails. Monitoring rollback must never change application, database, WooCommerce, backup, ledger, or customer-value state.
