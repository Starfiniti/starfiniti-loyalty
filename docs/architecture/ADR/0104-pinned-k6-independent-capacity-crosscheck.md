# ADR-0104: Pinned k6 independent capacity cross-check

- Status: Accepted
- Date: 2026-08-29
- Module: M15-S01

## Context

ADR-0062 requires a mature independent fixed-arrival driver before Starfiniti publishes a supported capacity envelope. The initial evidence schema did not enforce that requirement: any non-primary tool name plus `passed: true` for sustained, burst, and recovery could satisfy the independent-report function. It did not prove tool provenance, workload parity, exact schedule counts, dropped work, contract-valid responses, threshold calculations, minimized output, or absence of production authority.

The decision was rechecked against current official documentation on 2026-08-29. Grafana k6 2.2.0 was released on 2026-08-10. Its constant-arrival-rate executor is an open workload model with explicit integer rate, time unit, preallocated VUs, maximum VUs, and `dropped_iterations`; tagged thresholds can fail the process; system tags can exclude raw URL and error strings; and `handleSummary()` can emit a selected aggregate document. The official OCI index is fixed at `sha256:9bd01d6941fca969cb61bb57d2da5ee9b385fe2aa8881df3798c196564d6ace6`, with reviewed Linux/amd64 manifest `sha256:a070982921f37e1b891f8ed9fb2b507520c83228614c14640f7e28f635f4281b` and Linux/arm64 manifest `sha256:ea746c18a0af5530f5501dbe50d2cda34a37376639c524ca3172da61394869ef`.

Four approaches were compared:

1. Retain the generic normalized report. This is operationally flexible but cannot prove driver independence or workload equivalence and permits a trivial false pass.
2. Use Artillery 2.0.34. It is mature and supports arrival phases, but exact per-scenario fractional rates require more normalization or custom logic, while endpoint breakdown adds another plugin boundary.
3. Use Autocannon or another closed-loop HTTP driver. This is small and fast but lets slower responses reduce offered load, recreating coordinated omission at the exact boundary the cross-check must challenge.
4. Pin Grafana k6 2.2.0 by official OCI digest and translate every canonical phase and scenario to a constant-arrival-rate executor. This preserves the independently implemented scheduler while allowing exact integer-rate/time-unit representations such as five arrivals per two seconds for 2.5 requests per second.

The fourth approach is selected. k6 is maintained in the public Grafana repository under AGPL-3.0, which is compatible with this repository's AGPL distribution. It remains verification tooling and is not added to product runtime images or application dependencies.

## Decision

- `infrastructure/testing/capacity/k6-plan.yaml` binds the exact k6 release, OCI index, Linux/amd64 manifest, canonical workload digest, reviewed script digest, executor, minimized tag set, official documentation, and false live-authority assertions.
- The runner accepts the same clean exact commit, owner-only origin and credential files, short-lived approval, workload digest, rate/duration ceiling, and disposable-staging classification as the repository driver. Known production origins are refused, and the independent workload cannot use the read-only canary target class because two scenarios mutate.
- Each canonical phase runs separately. Every domain scenario uses k6 `constant-arrival-rate` with an exact rational rate, a closed preallocated/maximum VU bound, explicit request timeout, zero tolerated dropped iterations, exact scheduled iterations, error-rate and latency thresholds, and the same contract-aware readiness, authenticated-wallet, Service API, and signed WooCommerce behavior as the primary runner.
- Authority is opened through no-follow stable descriptors only below non-symlink parents; POSIX files and credential directories must be caller-owned and private, and authority parents cannot be group/other writable. Its exact bytes and the reviewed k6 script are then sealed into one private temporary snapshot before read-only container mounts. Linux runs map the container to the calling UID/GID so the official image can read and write only those owner files without widening mode `0600`/`0700`; other host execution is refused. The source paths are not reopened after validation, and the clean repository commit is checked again before report publication. Authority is never placed in a command argument, report, environment variable, or retained raw HTTP output. Cloud output and usage reporting are disabled. URL, name, free-form error, network-address, customer, selector, and credential tags are excluded.
- k6 writes one selected aggregate summary per phase. The controller normalizes it, rejects impossible duration/VU or non-monotonic latency aggregates, deletes the raw temporary file, stops after the first failed phase, and retains only exact hashes, tool/image identity, safe phase/scenario tokens, counts, classified failures, latency, and threshold decisions. Final publication is exclusive below a non-symlink, non-group/other-writable parent whose identity is rechecked after the write.
- Capacity closeout recomputes workload rates, schedules, classifications, error rates, thresholds, VU bounds, and all decisions. It requires exact k6 provenance, the same target-origin digest as the primary run, zero drops, every canonical phase/scenario, and explicit false production authority. A tool name and phase booleans are no longer evidence.
- Repository validation uses synthetic corruption cases without a target. Linux CI additionally pulls the digest-pinned image with no network available to the container and runs `k6 inspect` over the mounted script and fixture inputs. This proves the exact image can parse the script but does not claim a live capacity result.
- `independent_driver_contract` records repository readiness separately from `independent_driver_crosscheck`. The latter remains pending until an approved disposable production-like run is reconciled. No capacity number or production mutation is authorized by this ADR.

## Security and data-integrity effects

The runner cannot turn repository state into production authority, and its report cannot contain raw target or request authority. Digest-pinned tool and script provenance reduce supply-chain ambiguity. Contract-invalid 2xx responses count as errors. Dropped iterations, incomplete classifications, missing scenarios, changed rates, failed thresholds, cloud output, and production flags fail closed. HTTP acceptance remains non-authoritative; ledger, tenant, queue, coupon, and checkout reconciliation are still separately mandatory.

The independent driver deliberately reuses public application contracts but not the repository scheduler. It therefore cross-checks offered-load behavior without bypassing authorization, signature, idempotency, or bounded-parser boundaries.

## Operational effects

The live cross-check requires Docker, an approved disposable production-like target, dedicated synthetic identities, short-lived credentials, and independent target/driver monitoring. The digest-pinned image is approximately 35 MB and is pulled only in verification environments. The controller runs phases sequentially and removes its named container and private temporary directory even after a failure.

The repository-owned driver remains the primary diagnostic tool because it records schedule lag and Node driver CPU/memory/event-loop health. k6 contributes independent fixed-arrival scheduling and dropped-iteration evidence; neither report can close capacity without exact environment, monitoring, repeatability, first-failed-boundary, and zero-difference product reconciliation.

## Migration and rollback

There is no application migration. To roll back the tooling, stop and remove only the generated `starfiniti-k6-<random>` container, revoke the dedicated load credentials, delete its private temporary files, and retain any already reviewed minimized aggregate as historical evidence. Reverting the repository files reopens `independent_driver_contract`; it must never preserve a completed capacity claim that depended on this cross-check. No ledger or customer history is deleted during cleanup.

## References

- [Grafana k6 2.2.0 release](https://github.com/grafana/k6/releases/tag/v2.2.0)
- [Constant arrival rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/)
- [Arrival-rate VU allocation](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)
- [Thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/)
- [System tags](https://grafana.com/docs/k6/latest/using-k6/tags-and-groups/)
- [Custom end-of-test summary](https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/)
- [Base64 decoding for the WooCommerce HMAC key](https://grafana.com/docs/k6/latest/javascript-api/k6-encoding/b64decode/)
