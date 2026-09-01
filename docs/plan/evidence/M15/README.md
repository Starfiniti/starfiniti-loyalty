# M15 Evidence — GA Hardening

The 2026-09-01 VM 971 investigation is retained in
`backup-traffic-containment-2026-09-01.yaml`. It proves that the multi-terabyte
counter and 249.6 MB/s peak are historical 2026-08-14 evidence, while the
latest day peaks at 107 KB/s and a post-containment PostgreSQL cycle received
576,022 bytes. Host RRD and Borg's kilobyte-scale deduplicated additions confirm
that the historical amplification stayed on the internal VM-to-host path; the
later physical counter includes subsequent whole-host backups. The still-enabled
whole-host controller was configured for raw disk mode and shared the
PostgreSQL Borg boundary, so its timer was disabled/stopped as reversible
containment. Existing archives were retained; the PostgreSQL timer remained
active and created a new archive. R-004 and M15-S04/S05 remain non-passing until
the dedicated repository, monitoring, retention, transport, and isolated
restore gates close.

The 2026-09-01 read-only GitHub policy audit makes ADR-0115's external release
gap exact. `main` has no branch protection, the repository has no ruleset or
environment, no repository `RELEASE_POLICY_TOKEN` secret is configured, and the
release-security, licence, and owner approvals are absent. Release workflow
`333373957` remains `disabled_manually`, so the missing controls cannot be
bypassed by a publication attempt. The minimized
`release-policy-audit-2026-09-01.yaml` snapshot and
`npm run release-policy:audit:validate` reject false protection, ruleset,
environment, token, approval, release, or production claims. They create no
GitHub setting, secret, tag, release, deployment, or production mutation.

ADR-0112 adds the missing production-disabled deployment boundary beneath the
existing operations catalogue. Exact current image indexes bind Prometheus,
Alertmanager, Grafana, blackbox_exporter, and postgres_exporter to a hardened
central Compose plane; an exact native node_exporter archive and non-root unit
permit only aggregate textfile collection. `observability-deployment.yaml`
records 9/16 repository checks passing and keeps the clean exact-head Linux
canary plus approved environment, live targets, receivers, independent
dead-man, production activation, and full-cycle reconciliation pending.
Production still has no monitoring service or host exporter, broader
`operations.yaml` remains 14/35, and this evidence grants no receiver,
deployment, checkout, database, or loyalty-value authority.

ADR-0112 also changes the Security workflow by adding the observability canary
and requiring a credential-free exact-candidate checkout. That invalidates the
older workflow digest and every automated/triage result bound to it.
`security.yaml` therefore returns to 7/27 repository controls passing and 20
pending; the `74a37e9` artifacts remain historical evidence only. Fresh
exact-head CI, CodeQL, repository, image, SBOM, DAST, header, freshness,
WooCommerce, observability, and Medium-review evidence must be reconciled.

ADR-0110 adds an exact Authentik 2026.8 disposable runtime rehearsal to the
existing Security recovery job. Its internal-only, zero-port, zero-Docker-socket
topology can prove candidate boot, production-client OIDC/SAML reconciliation,
outbound SCIM behavior, minimization, and teardown with synthetic data. Exact
implementation `c94cc9e2181079ac80524fc3d9c9496ad6d0d6a6` replaces the broken
2026.8 management-command wait with exact provider-schedule discovery and the
permissioned schedule API. Evidence head
`e96cd18aa416c16c9523c46a49a9cdcd14cbd020` passed CI `33381604540`,
Security `33381604545`, and external CodeQL `99455421534`; all twelve PR checks
are green. Recovery job `99454991777` passed 14/14 scenarios. Artifact
`9754193837` has archive digest
`sha256:36c024a8ec3e41c9538bc6d6d8b959324e295abd21c1927635841417015e9772`
and independently parsed report SHA-256
`df528a9de5d0b7f99c1d833f6fdbf7c542c252b0ba9a4580ef5da7441803b84c`.
It does not restore private Authentik configuration, signing material, users,
sessions, or audit and therefore cannot advance M15-S04 recovery or M15-S06 GA
checks.

The Security workflow change intentionally invalidated the older exact-head
scan and Medium-triage bindings. Fresh CodeQL, repository, image, SBOM, DAST,
header, scanner-freshness, and WooCommerce evidence is now reconciled against
implementation `c94cc9e2181079ac80524fc3d9c9496ad6d0d6a6` through reviewed artifact
head `74a37e930cda44e4eedb550bd4a6237da03c75c5`. CI run `33384160196` and
Security run `33384160199` passed. `security.yaml` records 19/27 passed and
eight pending. The fresh digest-bound review reconciles all 29 Medium
reciprocal-licence occurrences to 15 exact dispositions with zero false
positives; product source is available, while 14 third-party dispositions
remain release-blocking under R-056.

M15-S01 is active with seven of 23 checks passing. `capacity.yaml` separates repository readiness from an approved production-like measured run and exact value reconciliation. ADR-0104 adds an exact digest-pinned Grafana k6 contract that must match the canonical phases, scenarios, rates, drops, contracts, thresholds, target digest, and false production authority; repository validation and Linux image inspection cannot substitute for the still-pending approved real independent run. No supported capacity is claimed while that manifest is in progress.

M15-S02 is active. `fault-injection.yaml` separates the disposable-only controller from the two approved production-like runs and independent WAL, queue, ledger, WooCommerce, checkout, and no-loss reconciliation. No production fault is authorized by repository readiness.

M15-S03 is active with 7 of 27 checks passing. The exact workflow/tool/image/DAST/release contracts remain repository-validated. Prior CI run `33384160196`, Security run `33384160199`, evidence head `74a37e9`, and its zero-false-positive Medium review are preserved but no longer count for the changed workflow. Fresh exact-head automation and triage plus release-bound corresponding-source generation under ADR-0083, a real corrected tag and package/attestation verification, approved non-destructive production review, independent penetration testing/retest, final Critical/High reconciliation, and owner approval remain gated. R-056 and R-062 stay open. Repository readiness authorizes no release, production scan, or mutation.

M15-S04 is active. `recovery.yaml` separates the digest-bound fourteen-stage full-service clean-room controller from two approved isolated recoveries, measured RPO/RTO, identity/configuration/signing/privacy/value reconciliation, independent review, and zero-residue teardown. ADR-0071 additionally supplies an undeployed dedicated PostgreSQL Borg repository/lock/cache and exact recent-retention candidate after live timing disproved shared-repository RPO. `recovery-transport.yaml` binds ADR-0073's exact candidate and pre-change rollback packages, signed authorities, URLs, checksums, metadata, OS images, passing rollback-aware exact-head internal-only disposable canary, artifact/report hashes, and false-completion boundary. Operations escrow, host-consumer compatibility, real dual-endpoint rollout, and isolated restore remain pending. Repository readiness authorizes no repository provisioning, package installation, backup, credential, retention action, identity, route, or recovery execution.

M15-S05 is active. `operations.yaml` separates the 31-signal/27-alert bounded-label catalogue, dedicated off-site archive/repository/retention evidence, required-series coverage page, exact Prometheus/Grafana projections, routing policy, runbooks, incident state machine, and validator from live source activation, receiver binding, named ownership, paging, two independent exercises, zero-difference reconciliation, and approval. Repository readiness authorizes no monitoring service, receiver, page, incident, checkout dependency, or value mutation.

M15-S06 is active with five repository controls passing. `ga-canary.yaml` separates the repository-enforced one-pilot, 720-hour/thirty-interval immutable-release plan, claims catalogue, daily/final zero-difference contracts, score floors, five minimized artifacts, and 50-check validator from every module closeout, approved release/deployment, live canary, final reconciliation, independent review, M16 handoff, and owner approval. Repository readiness authorizes no deployment, tenant enablement, public claim, approval, checkout change, or loyalty value.
