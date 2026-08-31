# M15 Evidence — GA Hardening

ADR-0110 adds an exact Authentik 2026.8 disposable runtime rehearsal to the
existing Security recovery job. Its internal-only, zero-port, zero-Docker-socket
topology can prove candidate boot, production-client OIDC/SAML reconciliation,
outbound SCIM behavior, minimization, and teardown with synthetic data. Local
contract tests pass; exact-head Linux execution is pending. It does not restore
private Authentik configuration, signing material, users, sessions, or audit and
therefore cannot advance M15-S04 recovery or M15-S06 GA checks.

The Security workflow change intentionally invalidates the older exact-head
scan and Medium-triage bindings. `security.yaml` now records 7/27 passed and 20
pending against implementation `ee5e0f5b3e823909fdaf0b20d0cc4cd3d5b2c2f8`;
fresh CI and minimized artifact reconciliation are required before those claims
can advance again.

M15-S01 is active with seven of 23 checks passing. `capacity.yaml` separates repository readiness from an approved production-like measured run and exact value reconciliation. ADR-0104 adds an exact digest-pinned Grafana k6 contract that must match the canonical phases, scenarios, rates, drops, contracts, thresholds, target digest, and false production authority; repository validation and Linux image inspection cannot substitute for the still-pending approved real independent run. No supported capacity is claimed while that manifest is in progress.

M15-S02 is active. `fault-injection.yaml` separates the disposable-only controller from the two approved production-like runs and independent WAL, queue, ledger, WooCommerce, checkout, and no-loss reconciliation. No production fault is authorized by repository readiness.

M15-S03 is active with 19 of 27 checks passing. `security.yaml` preserves the digest-bound `fe8a6ff` image/DAST/triage candidate and separately records exact WooCommerce release-integrity correction `695067c`: CI `33273056805`, Security `33273056780`, and external CodeQL `99155114588` passed all twelve PR checks after prior Security run `33272662903` exposed and rejected the initial file metadata/open race. The current correction builds and independently verifies a synthetic numeric connector package and has zero CodeQL findings. Release-bound corresponding-source generation under ADR-0083, a real corrected tag and its package/attestation verification, approved non-destructive production review, independent penetration testing/retest, final finding reconciliation, and owner approval remain gated. R-056 and R-062 stay open until those real release controls pass. Repository readiness authorizes no release, production scan, or mutation.

M15-S04 is active. `recovery.yaml` separates the digest-bound fourteen-stage full-service clean-room controller from two approved isolated recoveries, measured RPO/RTO, identity/configuration/signing/privacy/value reconciliation, independent review, and zero-residue teardown. ADR-0071 additionally supplies an undeployed dedicated PostgreSQL Borg repository/lock/cache and exact recent-retention candidate after live timing disproved shared-repository RPO. `recovery-transport.yaml` binds ADR-0073's exact candidate and pre-change rollback packages, signed authorities, URLs, checksums, metadata, OS images, passing rollback-aware exact-head internal-only disposable canary, artifact/report hashes, and false-completion boundary. Operations escrow, host-consumer compatibility, real dual-endpoint rollout, and isolated restore remain pending. Repository readiness authorizes no repository provisioning, package installation, backup, credential, retention action, identity, route, or recovery execution.

M15-S05 is active. `operations.yaml` separates the 31-signal/27-alert bounded-label catalogue, dedicated off-site archive/repository/retention evidence, required-series coverage page, exact Prometheus/Grafana projections, routing policy, runbooks, incident state machine, and validator from live source activation, receiver binding, named ownership, paging, two independent exercises, zero-difference reconciliation, and approval. Repository readiness authorizes no monitoring service, receiver, page, incident, checkout dependency, or value mutation.

M15-S06 is active with five repository controls passing. `ga-canary.yaml` separates the repository-enforced one-pilot, 720-hour/thirty-interval immutable-release plan, claims catalogue, daily/final zero-difference contracts, score floors, five minimized artifacts, and 50-check validator from every module closeout, approved release/deployment, live canary, final reconciliation, independent review, M16 handoff, and owner approval. Repository readiness authorizes no deployment, tenant enablement, public claim, approval, checkout change, or loyalty value.
