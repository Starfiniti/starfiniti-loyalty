# Observability package

This directory is the version-controlled operational contract for Starfiniti Loyalty. It does not install a monitoring system or authorize production access by itself.

## Assets

- `catalog.yaml` defines bounded signals, owner roles, routes, thresholds, runbooks, and dashboard coverage.
- `prometheus/rules.yaml` is the Prometheus-compatible projection of every catalogue alert.
- `routing-policy.yaml` defines routing behavior without storing destination identities or credentials.
- `grafana/provisioning` provides a locked, source-controlled dashboard and Prometheus data-source template.

The deployment environment must provide the named signal sources, bind receiver classes to approved destinations outside Git, run configuration validation, and prove alert delivery, acknowledgement, escalation, inhibition safety, dashboard queries, source freshness, and an independently hosted dead-man switch for loss of the monitoring plane itself. Missing time series are a failed source-coverage check; they are not interpreted as healthy zeroes.

Telemetry is never authority for loyalty value. Monitoring failure cannot block checkout, refunds, releases, promised reward redemption, customer balance/history access, exports, or reconciliation. No metric label, dashboard variable, alert annotation, or retained exercise summary may contain tenant, organization, workspace, customer, member, order, email, coupon, credential, token, payload, or correlation identifiers.

Validate the repository contract with:

```text
npm run operations:validate
```

Production activation remains blocked until `docs/plan/evidence/M15/operations.yaml` passes every source, routing, dashboard, exercise, reconciliation, and owner-approval check.
