# ADR-0066: Bounded observability and independent incident evidence

- Status: Accepted
- Date: 2026-08-27
- Decision owners: Starfiniti product and engineering
- Scope: M15-S05 signals, alerts, dashboards, routing, incident response, and operational evidence

## Context

Production exposes application readiness and backup service state, but the Proxmox host has no active Prometheus, Alertmanager, Grafana, Loki, Promtail, or node-exporter unit. The VM 971 transmit counter is approximately 3.60 TB because it survives for the VM uptime and includes the contained full-stream backup incident; the latest read-only one-minute RRD samples are quiet at hundreds to low-thousands of bytes per second. Cumulative counters therefore cannot establish that an incident is currently active, while absence of a monitoring system cannot establish that services are healthy.

The loyalty system also has safety properties that ordinary availability monitoring misses. A green readiness route can coexist with a stuck queue, ambiguous native coupon outcome, ledger difference, tenant-boundary failure, stale WAL, failed privacy replay, or a WooCommerce checkout dependency. Conversely, telemetry must never become a new synchronous dependency or value authority. Tenant, customer, commerce, coupon, credential, payload, and correlation identifiers cannot be metric labels because they expose data and create unbounded series.

Primary guidance reviewed on 2026-08-27:

- Prometheus alerting rules, pending `for` intervals and `keep_firing_for`: <https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/>
- Alertmanager routing, grouping, receiver configuration, intervals, and safe reload behavior: <https://prometheus.io/docs/alerting/latest/configuration/>
- Grafana source-controlled data-source and dashboard provisioning: <https://grafana.com/docs/grafana/latest/administration/provisioning/>

## Decision

1. Make `infrastructure/observability/catalog.yaml` the canonical versioned operational contract. Every signal declares one aggregate metric, bounded source, type, unit, and allowlisted labels. Every alert declares exact signal inputs, severity, owner role, route class, runbook, dashboard, duration, expression, and summary.
2. Use a closed operational label allowlist and a maximum of 500 series per signal. Tenant, organization, workspace, customer, member, order, email, coupon, credential, token, payload, and correlation labels are forbidden. Missing or stale series mean source coverage failed; they are never converted to a healthy zero.
3. Project the catalogue exactly into Prometheus-compatible rules and validate expression, duration, severity, owner, route, runbook, dashboard, and summary parity. Critical ledger, tenant, privacy, checkout, WAL-RPO, security, and ambiguous-value alerts have no pending interval. Their route is independent of deployment mode, subscription, billing, and entitlement state.
4. Provision one immutable Grafana operations dashboard from source with no tenant selector or UI editing. It covers availability, event-to-ledger latency, ledger and tenant correctness, checkout independence, WAL, queues/workers, database headroom, backup transfer amplification, and evidence freshness. Environment-specific Prometheus origin is injected at deployment; receiver destinations and credentials remain outside Git.
5. Keep routing vendor-neutral in source. Four route classes define grouping, acknowledgement, escalation, repetition, and billing independence. Environment-owned Alertmanager configuration binds page routes to independently controlled destinations and preserves the last known-good configuration after validation/reload failure. The monitoring plane also sends a continuous heartbeat to an independently hosted dead-man switch, so Prometheus or Alertmanager loss can page without depending on the failed system. Symptom inhibition may never suppress protected alerts.
6. Treat the prior backup incident as a permanent guardrail. The amplification alert requires both more than four times changed bytes and more than one GiB transferred. The runbook compares current guest transmit, bridge receive, physical uplink, disk, changed-byte, and transferred-byte evidence. A cumulative VM counter alone is never interpreted as an active rate.
7. Use a monotonic incident state machine: detected, declared, contained, mitigated, recovered, monitoring, closed. Service readiness cannot close an incident. Closure requires exact release/configuration/observability fingerprints; ledger, queue, WooCommerce, tenant, privacy, checkout, and recovery decisions; zero unexplained difference; a postmortem; durable regression controls; and independent review for critical integrity failures.
8. Prove operations through five distinct digest-bound artifacts: a source inventory, route test, two independently reviewed incident exercises, and final reconciliation. The two exercises use distinct incident, restricted-evidence, review, and postmortem digests. At least one safely exercises backup amplification through synthetic metrics, never by transmitting production data.
9. Retain raw incident evidence, destinations, credentials, identities, payloads, queries, and sensitive topology in a separately authorized operator store. Repository evidence contains only bounded operational state, timestamps, decisions, aggregate zero-difference results, opaque content digests, and role approvals.
10. Add an explicit monitoring-plane completeness ratio and alert when it is absent or below one. Exporter/rule drift must page instead of disappearing silently. Keep the production claim disabled until all 34 checks pass. Repository validation can prove contract consistency and reject false completion; it cannot prove live source freshness, page delivery, human acknowledgement, escalation, dashboard results, fault behavior, or incident ownership.

## Alternatives

### Install a bundled Prometheus/Grafana stack immediately on the Proxmox host

Rejected for this slice. The host has limited free memory and no approved monitoring network, retention, receiver destinations, credentials, or owner roster. Installing mutable infrastructure before defining sources, safety labels, paging, and evidence would create operational state without a trustworthy acceptance gate.

### Depend only on external uptime checks

Rejected. Uptime probes do not prove event-to-ledger latency, queues, immutable value, tenant isolation, privacy replay, checkout independence, WAL RPO, backup amplification, or ambiguous provider outcomes.

### Add tenant/workspace labels to every metric for easier debugging

Rejected. These labels create sensitive high-cardinality telemetry and invite monitoring to become a tenant data path. General alerts remain aggregate. Restricted case investigation uses separately authorized database/application evidence.

### Close incidents automatically when alerts resolve

Rejected. A resolved symptom does not prove idempotent queue recovery, native coupon outcome, ledger reconciliation, privacy replay, tenant authorization, checkout behavior, or recovery integrity.

## Security and integrity effects

- Metrics and dashboards are evidence only and grant no tenant, value, owner, routing, or closure authority.
- Browser, WordPress, tenant, billing, and entitlement inputs cannot suppress or reroute protected alerts.
- Paging credentials, destination identities, named rosters, customer data, and raw incident evidence stay outside Git.
- Incident recovery never edits immutable ledger history. Projection repair and value compensation remain distinct authorized workflows.
- Monitoring, Alertmanager, Grafana, and incident-system outages cannot block WooCommerce checkout or protected loyalty operations.

## Operations

- `npm run operations:validate` validates 34 evidence checks, 24 signals, 23 alerts, exact Prometheus projection, routing and dashboard controls, runbook coverage, task binding, false-completion cases, artifact paths/digests, distinct exercises, zero differences, and owner approvals.
- Production operators deploy signal producers and monitoring infrastructure in an approved network, bind exact asset digests, validate targets/rules/dashboard/routes, test every destination and escalation, then run two approved exercises.
- Failed alerts and exercises remain retained evidence. A known false positive changes through a reviewed catalogue revision with before/after evidence; it is not silenced ad hoc.

## Migration and rollback

This slice adds no database migration, production route, monitoring daemon, secret, receiver, external message, checkout code, or value behavior. Rollback stops new source/rule/dashboard deployment and restores the last known-good validated monitoring configuration while preserving alert, incident, postmortem, and exercise history. Never weaken a critical threshold, delete a failed exercise, or suppress a protected route to restore a green state.
