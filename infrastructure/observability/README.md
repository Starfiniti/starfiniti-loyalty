# Observability package

This directory is the version-controlled operational contract for Starfiniti Loyalty. It does not install a monitoring system or authorize production access by itself.

## Assets

- `catalog.yaml` defines bounded signals, owner roles, routes, thresholds, runbooks, and dashboard coverage.
- `prometheus/rules.yaml` is the Prometheus-compatible projection of every catalogue alert.
- `routing-policy.yaml` defines routing behavior without storing destination identities or credentials.
- `grafana/provisioning` provides a locked, source-controlled dashboard and Prometheus data-source template.

The deployment environment must provide the named signal sources, bind receiver classes to approved destinations outside Git, run configuration validation, and prove alert delivery, acknowledgement, escalation, inhibition safety, dashboard queries, source freshness, and an independently hosted dead-man switch for loss of the monitoring plane itself. Missing time series are a failed source-coverage check; they are not interpreted as healthy zeroes.

The Proxmox PostgreSQL archive and maintenance scripts atomically publish aggregate `*.prom` files for node_exporter's textfile collector. Configure node_exporter with `--collector.textfile.directory=/var/lib/node_exporter/textfile_collector` and verify the directory is scraped before enabling the four dedicated-recovery alerts. The files contain only the bounded environment/service labels plus completion time, completed-attempt status, repository-isolation status, recent archive count, and maximum retained interval. Repository selectors, canonical IDs, paths, archive names, credentials, and backup contents never enter metrics. The alert rules treat absent series as failure; repository metrics do not authorize or block backup, restore, checkout, or loyalty value operations.

Telemetry is never authority for loyalty value. Monitoring failure cannot block checkout, refunds, releases, promised reward redemption, customer balance/history access, exports, or reconciliation. No metric label, dashboard variable, alert annotation, or retained exercise summary may contain tenant, organization, workspace, customer, member, order, email, coupon, credential, token, payload, or correlation identifiers.

Validate the repository contract with:

```text
npm run operations:validate
```

Production activation remains blocked until `docs/plan/evidence/M15/operations.yaml` passes every source, routing, dashboard, exercise, reconciliation, and owner-approval check.
