# Risk Register

| ID    | Risk                                                                  | Impact   | Mitigation                                                                           | Status                |
| ----- | --------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ | --------------------- |
| R-001 | Tenant data crosses organization boundaries                           | Critical | RLS on every exposed tenant table plus adversarial tests                             | Open                  |
| R-002 | Duplicate/out-of-order WooCommerce events alter balances twice        | Critical | Signed inbox, unique source IDs, transactional idempotency, reconciliation           | Open                  |
| R-003 | Self-hosted Supabase upgrades break gateway/auth routing              | High     | Pin self-hosted releases; Envoy-first config; staged upgrade/rollback tests          | Mitigated by ADR-0002 |
| R-004 | Proxmox host failure causes authoritative data loss                   | Critical | Off-host encrypted backups, PITR, scheduled restore drills                           | Open                  |
| R-005 | Central outage breaks merchant checkout                               | Critical | Thin async plugin, local outbox, Action Scheduler, fail-open display behavior        | Open                  |
| R-006 | Repository license does not match open-source business intent         | High     | AGPL-3.0-or-later approved for platform; WooCommerce plugin remains GPL-2.0-or-later | Mitigated             |
| R-007 | Design prototype localStorage rules are mistaken for production truth | High     | Treat prototype as UX spec only; encode behavior through approved domain decisions   | Mitigated             |
