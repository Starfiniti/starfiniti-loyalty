# Service Objectives

## Initial objectives

| SLI                           | Objective                                | Measurement                                              | Alert/guardrail                               |
| ----------------------------- | ---------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| Central API availability      | 99.9% monthly                            | Valid non-destructive synthetic request at edge          | Fast/slow burn error-budget alerts            |
| Valid webhook acknowledgement | p95 < 2 s                                | Edge receipt to persisted accepted response              | p95 2 s; p99 5 s; error rate                  |
| Event-to-ledger latency       | p95 < 10 s                               | Accepted delivery timestamp to committed business effect | Queue-age and latency alerts                  |
| Customer wallet read          | p95 < 300 ms                             | Edge request to complete authorized response             | Endpoint/tenant-safe latency histogram        |
| Authoritative data RPO        | <= 5 min                                 | Latest restorable WAL point vs incident                  | WAL archive lag > 3 min warning, > 5 min page |
| Declared recovery RTO         | <= 60 min                                | Incident/drill start to verified service                 | Drill failure blocks production claim         |
| Checkout dependency           | 0 synchronous hard dependency            | Woo outage test and plugin telemetry                     | Any hub-caused checkout failure is critical   |
| Ledger/tenant correctness     | Zero unexplained or cross-tenant effects | Invariants, reconciliation, security incidents           | Immediate page/release stop                   |

## Measurement rules

- Percentiles name environment, capacity envelope, route, and time window.
- Retries are not hidden; first-attempt and final success are both measured.
- Availability excludes only documented, contractually permitted maintenance.
- Synthetic probes never create value and use dedicated identities/tenants.
- Metrics/log labels cannot include customer identifiers or unbounded tenant IDs.
- Error-budget exhaustion stops feature rollout and prioritizes reliability work.
- A missing required time series is unknown/unhealthy source coverage, never a healthy zero.
- The canonical signal/alert/owner/route contract is `infrastructure/observability/catalog.yaml`; Prometheus rules and the provisioned Grafana dashboard are validated projections of that contract.
- Alert delivery, acknowledgement, escalation, handoff, and source freshness are operational SLIs and require monthly evidence.
- Billing state and entitlements cannot inhibit ledger, tenancy, privacy, recovery, checkout, refund, release, reconciliation, or promised-value alerts.

## Capacity envelope to prove

Before production, define concurrent dashboard users, connected stores, orders/refunds per minute, wallet count, ledger rows/day, queue burst, and export size. Load tests cover normal, burst, dependency delay, worker loss, and restore/rebuild scenarios. Targets remain objectives until the environment and measurements are recorded.
