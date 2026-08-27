# Incident postmortem — `INC-YYYY-NNN`

## Review metadata

- Severity:
- State: closed
- Incident commander role:
- Accountable owner role:
- Started/contained/recovered/closed UTC:
- Exact release, image, migration, configuration, catalogue, rule, dashboard, and routing-policy fingerprints:
- Restricted evidence reference and approver (no sensitive contents):

## Customer and system impact

- Availability:
- Loyalty processing and immutable value:
- Native WooCommerce checkout and coupons:
- Tenant isolation and authorization:
- Privacy and notification obligations:
- RPO/RTO and recovery integrity:
- Providers and communications:
- What remains unknown:

## Timeline and decisions

Record UTC instant, incident state, evidence, decision, owner role, rollback, and next verification. Do not include identities, payloads, credentials, secrets, raw queries, or personal data.

## Detection and response performance

- Time to detect / declare / acknowledge / contain / mitigate / recover / reconcile / close:
- Alert delivered, acknowledged, escalated, and kept firing as designed:
- Runbooks used and deviations:
- Handoffs and update cadence:

## Root cause and contributing conditions

Describe the technical and organizational control chain. Distinguish trigger, root cause, amplification, failed safeguards, and detection gaps. Avoid individual blame and unsupported certainty.

## Integrity reconciliation

- Canonical facts, effects, ledger transactions/entries, wallets/lots:
- WooCommerce orders, refunds, commands, coupons, dead letters:
- Queues, leases, retries, provider ambiguity:
- Auth/session/membership/RLS and privacy actions:
- Backup/WAL/source marker and clean-room evidence:
- Exact unexplained difference: must be zero before closure.

## What worked and what failed

- Preventive controls:
- Detection/routing/ownership:
- Containment and rollback:
- Recovery/reconciliation:
- Communication:

## Durable actions

| Action | Type (test/validator/monitor/runbook/product/process) | Owner role | Due UTC | Verification | Status  |
| ------ | ----------------------------------------------------- | ---------- | ------- | ------------ | ------- |
|        |                                                       |            |         |              | planned |

At least one durable action is required for every failed or missing safeguard. Follow-up closure is verified independently; it is not inferred from a code change or ticket state.
