# ADR-0063: Disposable fault control with independent value reconciliation

- Status: Accepted
- Date: 2026-08-27
- Module: M15-S02

## Context

The product already has focused retry, lease, idempotency, outage, and worker-death tests, but it has not yet demonstrated whole-system recovery under a common, reproducible fault plan. A useful exercise must prove both operational recovery and loyalty-value invariants without turning a convenient chaos command into production authority.

Three approaches were compared:

1. Run ad hoc `docker compose kill`, network, and replay commands. This can reproduce a symptom quickly, but target selection, duration, cleanup, evidence, and retry bounds are not deterministic.
2. Give a permanent in-cluster chaos service access to the Docker socket or orchestrator API. This simplifies remote execution but creates a standing high-privilege control plane next to production and expands compromise impact.
3. Run a short-lived repository controller locally on an approved disposable host. Resolve containers by exact Compose labels, manipulate only loopback Toxiproxy proxies, replay owner-file fixtures at a bounded fixed arrival rate, restore in `finally`, and require separate database/WooCommerce reconciliation before completion.

The third approach is selected. Docker documents that Compose kill sends `SIGKILL`; PostgreSQL documents that an immediate stop exercises crash recovery on restart. Toxiproxy provides explicit latency, timeout, and proxy-disable controls. The repository controller uses those primitives only inside a marked disposable sandbox.

## Decision

- The canonical plan covers worker `SIGKILL`, database crash/restart, database-path latency, exact duplicate HTTP delivery, provider outage, and a bounded provider-outage retry burst.
- A real run requires a clean repository, a short-lived approval, an exact candidate commit, and digests for the plan, control file, sandbox marker, Compose file, and fixture set.
- The Compose project name must use the `starfiniti-chaos-` prefix. Every controlled container must carry the exact Compose project label and `starfiniti.disposable=true`; any production environment label fails before a signal is sent.
- Application, storefront, and Toxiproxy administration origins must resolve to loopback. No remote shell, Docker socket mount, production Compose asset, or arbitrary command is accepted by the runner.
- Request fixtures are owner-only files under the disposable sandbox. Their contents can carry signed test requests, but only their aggregate digest enters the approval and report.
- Every injected fault has bounded duration, replay count, rate, concurrency, response size, and recovery time. The controller never creates an unbounded retry loop.
- Baseline and recovery probes must pass. During-fault probes are diagnostic because failure is expected for some scenarios. Every applied service or proxy fault is restored in `finally`; a restore failure fails the run and requires operator containment.
- Controller success proves only fault application, restoration, and public-path recovery. Separate immutable-ledger, accepted-event, effect, queue, WooCommerce coupon, checkout, WAL, and provider-attempt reconciliation remains mandatory.

## Consequences

There is no new production runtime, privileged daemon, database migration, or external package. A production-like exercise requires an isolated local Compose project routed through named Toxiproxy proxies and fresh signed fixtures. The controller cannot prove value correctness by itself, which avoids treating HTTP recovery as ledger recovery.

## Rollback

Stop the controller, restore the exact labeled containers, remove only the controller-created named toxic or re-enable its named proxy, revoke fixture credentials, and preserve the minimized report. If automated restoration fails, isolate the disposable project and follow its approved teardown. Never point the runner at production and never delete immutable loyalty history to clean a test.
