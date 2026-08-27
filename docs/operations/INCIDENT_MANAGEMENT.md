# Incident management

## Severity

| Severity | Definition                                                                                                                                       | Declare           | Update cadence | Owner approval to close                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | -------------- | ------------------------------------------------------------------------ |
| SEV0     | Confirmed tenant isolation, material privacy, immutable ledger, broad protected-value, destructive recovery, or active compromise                | Immediate         | 15 minutes     | Product owner, security owner, value-integrity owner, incident commander |
| SEV1     | Production outage, checkout dependency, breached RPO, ambiguous native value, material queue backlog, identity outage, or likely customer impact | Within 5 minutes  | 30 minutes     | Incident commander and accountable owner                                 |
| SEV2     | Degraded performance, stale evidence, bounded connector/provider failure, or operational risk with no confirmed protected-value loss             | Within 30 minutes | 60 minutes     | Accountable owner                                                        |

The highest evidenced impact wins. Billing state, tenant plan, message volume, or commercial importance never lowers severity for ledger, tenancy, privacy, recovery, checkout, refund, release, or promised-value failures.

## State machine

`detected → declared → contained → mitigated → recovered → monitoring → closed`

- **Detected:** retain the first signal instant and alert fingerprint; automation may create a case but cannot close it.
- **Declared:** appoint incident commander, operations lead, communications lead, scribe, and accountable domain owner. One person may fill multiple roles only when the roster says so.
- **Contained:** stop amplification or exposure while preserving checkout and protected operations where safe. Record the exact control and rollback.
- **Mitigated:** customer impact is reduced, but authority and value may still need reconciliation.
- **Recovered:** service, authorization, queues, providers, backup/WAL, and protected paths meet runbook checks.
- **Monitoring:** observe for at least the alert `keep_firing_for` interval and complete independent reconciliation.
- **Closed:** approvals, customer/privacy decision, postmortem owner, regression work, and durable evidence are recorded. A monitoring alert cannot close an incident.

State transitions are monotonic. Reoccurrence moves to a new incident or back to `declared` with retained history; no transition erases earlier evidence.

## Roles and handoff

- The **incident commander** owns severity, scope, decisions, cadence, handoffs, and closure—not implementation details.
- The **operations lead** executes verified runbooks and records commands/change fingerprints.
- The **domain owner** proves ledger, tenancy, privacy, recovery, provider, or checkout integrity.
- The **communications lead** issues timestamped internal/customer updates and records the next update time.
- The **scribe** maintains the minimized decision/timeline record and links restricted evidence by opaque reference.

Every handoff states current severity/state, impact, active safeguards, last/next update, pending decision, rollback, and evidence owner. Unacknowledged SEV0/SEV1 pages escalate through the catalogue route; protected-value and security routes require an independently controlled secondary destination.

## Communication

The first message states what is known, what is not known, customer/value/privacy/checkout impact, containment, and next update time. Do not speculate about cause or claim no data/value impact before reconciliation. Customer communication separates availability, delayed loyalty processing, native checkout, balances/history, rewards/coupons, privacy, and recovery status. Regulatory and contractual notification decisions belong to the authorized owner and counsel, not monitoring automation.

General channels and repository evidence contain no customer, tenant, order, coupon, email, token, secret, credential, raw payload, query text, or unrestricted topology. Incident identifiers are random non-customer strings. Restricted evidence has explicit approver, access record, retention, and deletion policy.

## Evidence and closure

Closure requires:

1. Exact release, image, migration, configuration, alert-rule, dashboard, and routing-policy fingerprints.
2. A monotonic timeline from detection through monitoring and measured acknowledgement, containment, recovery, and reconciliation.
3. Explicit tenant, ledger, privacy, checkout, RPO/RTO, queue, provider, and customer-impact decisions, marking non-applicable cases with rationale.
4. Zero unexplained ledger/coupon/queue difference and one-effect replay proof where value processing was involved.
5. A completed postmortem using `POSTMORTEM_TEMPLATE.md`, an owner and due date for every action, and at least one durable regression control for a control failure.
6. Independent review for SEV0 and Critical/High security, tenancy, ledger, privacy, recovery, or data-loss impact.

## Exercises

Monthly test alerts cover every route, primary/secondary delivery, acknowledgement, escalation, durable ticketing, handoff, and independent dead-man detection when the monitoring-plane heartbeat stops. Quarterly incident exercises cover worker death, database delay/restart, duplicate delivery, provider outage, retry storm, checkout outage independence, ledger/queue/WooCommerce reconciliation, privacy replay, and recovery evidence. Two independently reviewed exercises are required for the M15-S05 production gate; one must exercise the backup-transfer-amplification alert without sending a full database stream.

Exercise output is a minimized summary bound by digest to the exact catalogue, rules, dashboard, routing policy, release, source inventory, and restricted raw evidence. A missed page, missing source, stale rule, unexplained value difference, checkout dependency, failed teardown, or absent regression action fails the exercise.
