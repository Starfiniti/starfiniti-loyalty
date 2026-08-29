# Continuous improvement operations

This runbook governs M16. It makes product learning, operational follow-up, and vendor change review reconstructable without pretending that elapsed cadence exists before it does. Times and review periods use UTC.

## Authority and safety

- The source-controlled plan defines cadence, ranking, score floors, artifacts, and deterministic failures. It does not grant production, tenant, value, provider, billing, security, or approval authority.
- Evidence is minimized, immutable after review, digest-bound, and stored under `docs/plan/evidence/M16/runs/`. Do not put names, email addresses, tokens, cookies, tenant identifiers, customer data, coupon plaintext, raw provider payloads, or incident secrets in Git.
- A missing source is unknown. Never coerce missing metrics, provider checks, exercise output, or owner review into a healthy zero.
- Historical evidence is never edited to improve a result. Corrections are new records. Architecture decisions are superseded through a later ADR.

## Official-source provenance capture

The provider-source collector creates a bounded pre-review input; it does not perform the monthly review. Validate its deterministic, network-free contract first:

```sh
npm run continuous-improvement:sources:validate
```

From a clean exact Git `HEAD`, select an absent absolute `.json` path and capture the thirteen canonical sources:

```sh
npm run continuous-improvement:sources:capture -- --out /absolute/path/provider-source-snapshot.json
npm run continuous-improvement:sources:verify -- --in /absolute/path/provider-source-snapshot.json
```

The collector resolves and pins a public socket address independently for every HTTPS hop, permits only same-host redirects plus the explicit OpenSSH `.com` to `.org` transition, requires identity encoding and one of three textual content types, and hashes at most 4,000,000 streamed bytes per source. It retains no provider body. Before any request, the absolute output parent must already be a regular non-symlink directory. Exclusive no-follow output binds the clean candidate commit and the exact governance-plan digest; mode `0600` is enforced on POSIX and requested but not asserted as an equivalent Windows ACL.

After collection, a reviewer must still inspect current official changes, dependency pins, and every required installed host/guest endpoint; classify breaking, security, and support impact; identify affected modules and an owner; and record the disposition. A snapshot never changes `provider_review`, `dependency_pins`, installed evidence, approval, or monthly-close status. A failed source remains unknown; do not bypass the collector's DNS, redirect, TLS, type, encoding, size, timeout, or output controls.

## Recovery installed-state capture

The installed-state helper validates evidence supplied through an independently
approved read-only operator route. It contains no SSH client, endpoint address,
credential, route selection, or production command. Validate its network-free
contract first:

```sh
npm run continuous-improvement:installed:validate
```

Create one exact `starfiniti.recovery-endpoint-facts.v1` JSON object in memory for
each opaque endpoint. Record only the UTC observation instant, the fixed
`approved-read-only-ssh` capture method, `productionMutation: false`, public OS
release facts, the closed package/version/architecture set, exact executable
SHA-256 values, and the Proxmox version/kernel facts required by the policy. Do
not include a hostname, address, username, route, key, command output, arbitrary
package, provider body, application data, or contact. Canonical-base64 encode each
UTF-8 object and capture from a clean exact commit:

```sh
npm run continuous-improvement:installed:capture -- \
  --source /absolute/repository/path/docs/plan/evidence/M16/runs/provider-source-snapshot-....json \
  --host-facts-base64 "$STARFINITI_HOST_FACTS_B64" \
  --guest-facts-base64 "$STARFINITI_GUEST_FACTS_B64" \
  --out /absolute/new/recovery-dependency-snapshot.json
npm run continuous-improvement:installed:verify -- \
  --in /absolute/new/recovery-dependency-snapshot.json
```

The helper derives exactly six installed provider projections, binds them to the
official-source artifact and the exact rsync candidate plan, and writes through an
exclusive no-follow descriptor. `installedCaptureComplete` covers only this closed
installed catalogue. ADR-0091 separately selects a digest-bound BorgBackup
candidate and compatibility contract without rewriting this historical artifact.
ADR-0092 selects a client-only OpenSSH architecture. Bootstrap Security run
`33240398639` discovered the stripped executable digest; digest-locked candidate
`275c9e8` then passed exact-plan Security run `33241151463` job `99070606112`,
with independently bound report and artifact-archive digests. Synthetic OpenSSH
compatibility therefore passes, while Debian, Ubuntu, and Proxmox candidate evidence
remains incomplete. The exact-head Borg canary also passes and is digest-bound;
operations escrow,
real-provider compatibility, review, ownership, approval, package installation,
and production mutation all remain false. The artifact is a monthly
review input, not remote attestation or an upgrade gate. Independent verification
loads every governance/source/candidate binding from the artifact's exact candidate
commit, so later working-tree or policy changes cannot silently reinterpret the
historical evidence.

## Monthly review

### Private recovery artifact escrow preparation

ADR-0093 makes the original BorgBackup and OpenSSH escrow byte inventory
executable. ADR-0094 preserves that accepted thirty-entry V1 proof and the
historical sixty-four-entry V2 package-candidate bundle. ADR-0096 hash-binds
both histories, excludes the superseded cross-suite rsync candidate from
activation, and makes the current seventy-four-entry V3 bundle include the two
endpoint-native executables, shared wrapper, signed source, rollback packages,
endpoint dependency inventories, canary report, runtime controls, verifier, and
governance boundary without giving the repository a production route or custody authority. Validate
the contract with `npm run recovery-artifact-escrow:validate`. Operations then
stages the exact closed catalogue outside the repository, copies the exact policy
as `escrow-policy.yaml`, and runs the inventory and verification commands in the
provider runbooks. The tool has no network or artifact-copy path and writes only
the private manifest plus an external minimized report.

Do not commit the private manifest, paths, operator identities, endpoints, or
custody details. A passing byte inventory leaves signing-fingerprint,
source-signature, dependency, native-build, package-authority,
consumer/selector-compatibility, offline-copy, second-review, isolated-recovery, rollout, and
`operationsEscrowComplete` false. Those are independent monthly-review inputs,
not booleans supplied by the inventory operator.

Close each calendar month within ten days. The initial M16 gate requires two distinct consecutive months; one review copied twice does not qualify.

1. Bind the period, exact repository/release identities, source digests, reviewer, and observation time.
2. Review activation, errors, support, reconciliation, fraud, campaigns, churn, usability, performance, security, and billing. Each section records source freshness, the baseline, observed result, target, interpretation, and linked action or explicit no-action rationale.
3. Review every official provider, platform, and recovery-dependency source in the canonical catalogue. Record the installed version/release and digest-bound provenance for every exact endpoint declared by the catalogue, the candidate version/entry and digest-bound provenance, breaking/security/support impact, affected modules, an owner, and the resulting task, ADR, test, upgrade plan, or explicit no-impact rationale. Recovery review covers both ends of privileged transport boundaries; a host-only or guest-only version check is incomplete and fails validation.
4. Recompute the evidence-ranked backlog. Verify the arithmetic and exact order. Critical work is due within two days and High work within fourteen days unless a distinct approved-risk digest, external dependency, and future review instant exist; `blocked_external` is not “done.”
5. Rescore every module changed materially in the period. Preserve the prior score and evidence; record category weights, new evidence, and the reason for each change. Keep deployed-production and integration-candidate subjects distinct under ADR-0080; a candidate score is not elapsed production evidence.
6. Review failures and incidents by stable fingerprint. At the second occurrence, link at least one merged regression test, validator, monitor, runbook, or agent rule. A ticket or promise alone is not a durable control.
7. Review experiments. Promotion requires a predeclared primary metric, baseline, target, guardrails, measured improvement, and every guardrail passing. Stop an experiment immediately on guardrail breach.
8. Sign and checksum the completed monthly artifact. Do not overwrite it after review.

## Quarterly exercises

Within thirty days after each calendar quarter, execute and reconcile all five exercises against the approved release and environment:

- full-service restore with measured database/WAL/Auth/application/configuration/signing/connector RPO and RTO;
- adversarial tenant-isolation and revoked-membership checks;
- privacy consent, suppression, export, deletion, pseudonymization, and retained-evidence checks;
- SCIM deprovisioning with stale-session denial and forged domain/group/metadata failures;
- incident detection, primary/secondary notification, acknowledgement, escalation, protected-path continuity, postmortem, and regression follow-up.

Each exercise binds its approval, environment, exact inputs, start/end, outcome, source coverage, unexplained differences, open findings, owner, and a separate report digest. Restore or fault exercises follow their dedicated safe controllers; M16 never expands their authority. Any unexplained protected-value, tenant, privacy, recovery, checkout, or data-loss difference fails the bundle.

## Evidence closeout

M16 initial close requires five distinct digest-bound artifacts: two consecutive monthly reviews, one quarterly exercise bundle, one final reconciliation, and one approval record. Reviews and exercises bind the candidate governance commit plus exact plan/backlog digests; the final approval cryptographically binds the other four artifact digests and future active review dates. The reconciliation proves:

- no due review or exercise is missing;
- all thirteen canonical provider, platform, and recovery-dependency sources plus dependency pins are current through the review cutoff;
- ranking arithmetic and order are exact, with no overdue unaccepted Critical or High item;
- every recurring failure has a durable control;
- every materially affected module was rescored and retained its historical score;
- promoted experiments improved their declared metric and passed all guardrails;
- all quarterly exercises passed with zero unexplained protected difference;
- the roadmap, task graph, status, risks, scorecard, iteration log, and evidence index agree;
- the M16 score is at least 90/100 and every category reaches 80% of its weight.

An independent reviewer checks artifact digests, chronology, source freshness, backlog arithmetic, score history, regression links, experiment decisions, and exercise separation. Product, engineering, security, operations, and the owner approve the final record. The recurring schedule continues after initial close; a later missed cadence reopens the operational gate and creates a ranked backlog item.

Run `npm run product-score:validate` and `npm run continuous-improvement:validate` before review. The first command verifies score arithmetic, subject identity, category floors, automatic failures, exact evidence and commit bindings, preserved history, and the human scorecard marker. The second verifies the elapsed-cadence and closeout contract. Both must pass; neither creates missing live evidence.

## Rollback and stop conditions

Continuous-improvement history is append-only, so it is not rolled back. Stop or pause the affected experiment, provider upgrade, rollout, or exercise when a guardrail fails. Preserve accepted commerce events, ledger value, customer access, refunds, reconciliation, exports, promised rewards, and native checkout. Correct the condition through a forward fix, compensating value transaction where required, new evidence, and an ADR when the decision changes.
