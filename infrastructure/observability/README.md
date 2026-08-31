# Observability package

This directory is the version-controlled operational contract and production-disabled deployment candidate for Starfiniti Loyalty. It does not install a monitoring system or authorize production access by itself.

## Assets

- `catalog.yaml` defines bounded signals, owner roles, routes, thresholds, runbooks, and dashboard coverage.
- `prometheus/rules.yaml` is the Prometheus-compatible projection of every catalogue alert.
- `routing-policy.yaml` defines routing behavior without storing destination identities or credentials.
- `grafana/provisioning` provides a locked, source-controlled dashboard and Prometheus data-source template.
- `deployment/plan.yaml` binds official releases, exact image indexes, the native node exporter archive, false production authority, and the disposable canary contract.
- `compose.yml` packages the central monitoring plane with loopback-only administration, unpublished exporters, read-only roots, dropped capabilities, resource limits, isolated control traffic, and environment-owned target/secret mounts.
- `prometheus/prometheus.yml`, `alertmanager/safe-default.yml`, `blackbox/blackbox.yml`, and `postgres-exporter/safe-default.yml` provide a safe no-receiver/no-live-target starting boundary.
- `node-exporter/starfiniti-node-exporter.service` permits only aggregate textfile collection under a non-root system account.

The deployment environment must provide the named signal sources, bind receiver classes to approved destinations outside Git, run configuration validation, and prove alert delivery, acknowledgement, escalation, inhibition safety, dashboard queries, source freshness, and an independently hosted dead-man switch for loss of the monitoring plane itself. Missing time series are a failed source-coverage check; they are not interpreted as healthy zeroes.

The Proxmox PostgreSQL archive and maintenance scripts atomically publish aggregate `*.prom` files for node_exporter's textfile collector. Configure node_exporter with `--collector.textfile.directory=/var/lib/node_exporter/textfile_collector` and verify the directory is scraped before enabling the four dedicated-recovery alerts. The files contain only the bounded environment/service labels plus completion time, completed-attempt status, repository-isolation status, recent archive count, and maximum retained interval. Repository selectors, canonical IDs, paths, archive names, credentials, and backup contents never enter metrics. The alert rules treat absent series as failure; repository metrics do not authorize or block backup, restore, checkout, or loyalty value operations.

Telemetry is never authority for loyalty value. Monitoring failure cannot block checkout, refunds, releases, promised reward redemption, customer balance/history access, exports, or reconciliation. No metric label, dashboard variable, alert annotation, or retained exercise summary may contain tenant, organization, workspace, customer, member, order, email, coupon, credential, token, payload, or correlation identifiers.

Validate the repository contract with:

```text
npm run operations:validate
```

Run the isolated exact-version Linux canary with:

```text
npm run observability:deployment:run -- --out dist/observability-deployment/operator-review.json
```

See `docs/operations/OBSERVABILITY_DEPLOYMENT.md` for environment preparation, activation, observation, and rollback. The canary uses no production route, credential, or target and removes its containers, networks, and volumes before publishing a minimized report.

Production activation remains blocked until `docs/plan/evidence/M15/observability-deployment.yaml` and `docs/plan/evidence/M15/operations.yaml` pass every environment, source, routing, dashboard, dead-man, exercise, reconciliation, and owner-approval check.
