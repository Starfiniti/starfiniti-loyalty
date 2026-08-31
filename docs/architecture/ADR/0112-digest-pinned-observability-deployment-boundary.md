# ADR-0112: Digest-pinned observability deployment boundary

- Status: Accepted
- Date: 2026-08-31
- Decision owners: Starfiniti product and engineering
- Scope: M15-S05 deployable monitoring plane and host-side aggregate metric collection

## Context

ADR-0066 defined the signal, alert, routing, dashboard, incident, and evidence contracts before permitting infrastructure installation. That sequencing was correct, but production still has no Prometheus, Alertmanager, Grafana, or node_exporter plane. On 2026-08-31 a whole-VM operation again starved the shared PostgreSQL Borg repository and created a measured 1 hour 34 minute 36 second off-site archive gap without paging. Repository rules alone cannot detect that failure.

The next boundary must be deployable and reproducible without embedding production topology, receiver destinations, credentials, tenant identifiers, or customer evidence. It must also keep monitoring asynchronous to WooCommerce checkout and loyalty value. The Proxmox host needs only the already-produced aggregate textfile metrics; it must not gain a central monitoring container runtime or database authority.

Primary sources reviewed on 2026-08-31:

- Prometheus 3.14.0 release and configuration/file discovery: <https://github.com/prometheus/prometheus/releases/tag/v3.14.0> and <https://prometheus.io/docs/prometheus/latest/configuration/configuration/>
- Alertmanager 0.34.0 release, configuration validation, and management API: <https://github.com/prometheus/alertmanager/releases/tag/v0.34.0>, <https://prometheus.io/docs/alerting/latest/configuration/>, and <https://prometheus.io/docs/alerting/latest/management_api/>
- Grafana 13.2.0 release, Docker deployment, and file provisioning: <https://github.com/grafana/grafana/releases/tag/v13.2.0>, <https://grafana.com/docs/grafana/latest/setup-grafana/installation/docker/>, and <https://grafana.com/docs/grafana/latest/administration/provisioning/>
- node_exporter 1.12.1 release: <https://github.com/prometheus/node_exporter/releases/tag/v1.12.1>
- blackbox_exporter 0.28.0 release and multi-target pattern: <https://github.com/prometheus/blackbox_exporter/releases/tag/v0.28.0> and <https://github.com/prometheus/blackbox_exporter/blob/master/README.md>
- postgres_exporter 0.20.1 release and auth-module configuration: <https://github.com/prometheus-community/postgres_exporter/releases/tag/v0.20.1> and <https://github.com/prometheus-community/postgres_exporter/blob/master/README.md>
- Supabase changelog reviewed through 2026-08-31. Its 2026-07-29 metrics-collection panic, 2026-08-12 skipped-backup fix, and self-hosted observability changes reinforce missing/stale-series failure; they do not authorize a hosted-only dependency or a Supabase upgrade.

## Decision

1. Add one central Docker Compose bundle containing Prometheus, Alertmanager, Grafana, blackbox_exporter, and postgres_exporter. Every image is selected by a reviewed stable release and pinned to the exact multi-architecture manifest digest; the governance record also binds the Linux/amd64 manifest, upstream tag object or commit, release URL, and licence.
2. Run node_exporter separately as a native, unprivileged systemd service on each approved source host. The reviewed first profile enables only the textfile collector and reads `/var/lib/node_exporter/textfile_collector`; it does not inspect processes, containers, filesystems, network namespaces, or the Docker socket. The binary is bound to the exact official 1.12.1 Linux/amd64 archive size and SHA-256.
3. Bind Prometheus, Alertmanager, and Grafana administration ports to loopback only. Exporters publish no host port. The central services share an internal control network; only Prometheus, Alertmanager, blackbox_exporter, and postgres_exporter join a separately named egress/scrape network. The approved host firewall remains the authority for exact scrape and receiver destinations.
4. Keep all production targets, database auth modules, receiver destinations, receiver credentials, Grafana admin credentials, host addresses, and named rosters outside Git in owner-controlled files. Compose refuses to render without explicit operator paths; the production runbook additionally requires those paths to be absolute. Checked-in example files use reserved `.invalid` names and a notification-free Alertmanager receiver.
5. Use Prometheus file-based service discovery so operator target changes are atomic and do not require repository edits. Target relabeling replaces address/URL-bearing `instance` labels with bounded service classes, removes temporary auth-module labels, and applies closed metric/label filters before samples enter the TSDB.
6. Keep Prometheus lifecycle/admin APIs disabled. Operators validate with `promtool` and reload with SIGHUP only after a passing configuration check. Alertmanager configuration is validated with `amtool`; a failed validation never replaces the mounted last-known-good file.
7. Harden every central container with read-only roots, all Linux capabilities dropped, `no-new-privileges`, bounded PIDs/memory/CPU, local log rotation, and only its required data/config mounts. No service receives privileged mode, host networking, host PID/IPC, a Docker socket, production database superuser credentials, or a writable repository checkout.
8. Add a Linux disposable canary that validates the exact Compose projection and component-native configurations, starts the five-service plane with synthetic owner-only files, verifies loopback health/readiness and exact versions, proves no externally published exporter port, records only aggregate component results and digests, and always removes containers, networks, volumes, and temporary secrets.
9. Require a value-silent production environment preflight immediately before Compose rendering. It accepts one canonical owner-only environment file, permits only the closed deployment variables, requires loopback and distinct ports plus an approved HTTPS Grafana hostname, and rejects linked, missing, in-repository, overbroad, shared, permission-unsafe, or target-exposed mounted paths without printing their values.
10. Keep the production claim disabled. This repository slice proves deployability and configuration safety only. Approved monitoring hosts/network/retention, exact live source inventory, receiver binding, two destinations for protected pages, dead-man delivery, exercises, observation, reconciliation, and owner approval remain M15-S05 gates.

## Alternatives considered

### Native distribution packages for the complete central plane

Rejected. Debian/Ubuntu package cadences would mix independently aged Prometheus, Alertmanager, Grafana, and exporter versions and make the exact tested runtime harder to reconstruct. Host package installation would also widen the rollback and dependency surface.

### Central containers plus containerized node_exporter on Proxmox

Rejected. The backup host does not need Docker access for aggregate textfile publication. A native unprivileged exporter with defaults disabled is smaller, easier to firewall, and cannot inspect the container runtime.

### External uptime monitoring only

Rejected by ADR-0066. Uptime cannot prove WAL/archive age, repository isolation, queue lag, ledger difference, privacy replay, or ambiguous reward outcomes.

## Security and integrity effects

- Monitoring remains evidence, never tenant, value, release, incident-closure, or billing authority.
- Git contains no receiver destination, credential, topology, database DSN, tenant/customer/order/coupon identity, or raw incident evidence.
- Address-bearing discovery labels are temporary and removed before storage; bounded operational labels remain enforced by the catalogue validator.
- Checkout, accepted refunds/releases/redemptions, account access, exports, and reconciliation continue when the entire monitoring plane is absent.
- The native exporter reads aggregate text files only and has no backup, Borg, rsync, PostgreSQL, Docker, or loyalty mutation capability.

## Operations

Validate the repository boundary with `npm run observability:deployment:validate`. Run the disposable Linux proof with `npm run observability:deployment:run -- --out <new-json-file>`. Production activation follows `docs/operations/OBSERVABILITY_DEPLOYMENT.md` only after an approved host/network/receiver window and exact target inventory exist.

## Migration and rollback

This decision adds no database migration and changes no production service. Rollback removes the central Compose bundle and native exporter units, restores the last-known-good validated monitoring configuration, and preserves alerts, incident evidence, postmortems, and aggregate metric files. Removing monitoring must never stop backup, restore, checkout, or loyalty processing. A failed production activation leaves M15-S05 open and is not converted into passing evidence.
