# ADR-0068: Evidence-bound continuous improvement

- Status: Accepted
- Date: 2026-08-27
- Decision owners: Starfiniti product and engineering
- Scope: M16 product review, provider review, regression prevention, experiments, exercises, and backlog governance
- Related refinement: ADR-0080 defines the versioned deployed-production and integration-candidate score subjects without changing this cadence or its live-evidence requirements.

## Context

An enterprise roadmap can become stale immediately after GA. Support cases, recurring incidents, vendor breaking changes, weak experiments, and score inflation can accumulate even while the application test suite stays green. “Review monthly” is not verifiable unless the period, inputs, decisions, durable controls, and owners are retained. Equally, keeping an unranked list encourages urgent-looking feature work to outrank protected-value, recovery, tenancy, privacy, and checkout risks.

Application and provider sources reviewed on 2026-08-27:

- Supabase changelog: <https://supabase.com/changelog>
- PostgreSQL versioning policy: <https://www.postgresql.org/support/versioning/>
- WooCommerce developer changelog: <https://developer.woocommerce.com/changelog/>
- Stripe API changelog: <https://docs.stripe.com/changelog>
- authentik releases: <https://docs.goauthentik.io/releases/>
- Klaviyo API changelog and revision policy: <https://developers.klaviyo.com/en/docs/changelog_>
- Node.js release lifecycle: <https://nodejs.org/en/about/previous-releases>

Recovery platform and transport sources added after the 2026-08-28 backup-transport incident review:

- rsync NEWS: <https://download.samba.org/pub/rsync/NEWS>
- BorgBackup release changes: <https://borgbackup.readthedocs.io/en/stable/changes.html>
- OpenSSH release notes: <https://www.openssh.com/releasenotes.html>
- Debian security advisories: <https://www.debian.org/security/>
- Ubuntu security notices: <https://ubuntu.com/security/notices>
- Proxmox security advisories: <https://forum.proxmox.com/forums/security-advisories.26/>

These sources have materially different release models. PostgreSQL supports a major version for five years and recommends current minor releases; Node distinguishes Current, LTS, Maintenance, and end-of-life lines; Klaviyo revisions have bounded support; authentik publishes upgrade and breaking-change guidance; WooCommerce, Stripe, and Supabase publish product-specific change feeds. Recovery safety also depends on the exact rsync, BorgBackup, OpenSSH, guest OS, and Proxmox package lineage at both sides of a privileged transport boundary. A generic dependency bot cannot determine Starfiniti's tenant, ledger, connector, identity, billing, confinement, or restore impact.

## Options considered

### Informal owner review

Low process cost, but it cannot prove cadence, source freshness, experiment guardrails, or closure of recurring failures. Reconstructing decisions after an incident would depend on memory.

### Ticket backlog plus automated dependency updates

Useful inputs, but ticket priority is mutable and dependency automation does not understand provider behavior, production evidence, protected paths, or module score effects. It can also turn a provider release into an unsafe automatic rollout.

### Event-driven reviews only

Material incidents and releases would trigger work quickly, but quiet degradation, aging dependencies, stale scores, support patterns, and missing quarterly exercises could remain invisible.

### Fixed cadence plus event-driven escalation and immutable evidence

Monthly and quarterly minimums expose quiet drift, while Critical/High findings and material changes trigger immediate action. Exact artifacts, ranking arithmetic, official-source review, regression-control thresholds, and score history make the system independently reconstructable.

## Decision

1. Use UTC calendar-month reviews due within ten days and calendar-quarter exercises due within thirty days. Initial M16 close requires two distinct consecutive monthly reviews and one complete quarterly bundle; repository fixtures prove the gate but never substitute for elapsed evidence.
2. Review activation, errors, support, reconciliation, fraud, campaigns, churn, usability, performance, security, billing, providers, backlog, and module scores every month. Absent or stale inputs are unknown, never zero.
3. Review only canonical official provider, platform, and recovery-dependency sources. For recovery sources, record installed version/release and digest-bound provenance for every exact host/guest endpoint declared by the catalogue plus candidate version/entry and digest-bound provenance. Record impact, affected modules, owner, and durable disposition. Automated update tools may collect candidates but cannot approve an upgrade.
4. Rank backlog items by a versioned integer formula combining severity, merchant impact, customer impact, confidence, effort, and dependency penalty. The validator recomputes scores and order. External blocking stays visible and does not become completion; an incomplete Critical or High item requires a distinct accepted-risk digest and future review instant.
5. Treat the second occurrence of the same stable failure fingerprint as recurring. It must link at least one merged regression test, validator, monitor, runbook, or agent rule; a ticket alone does not close it.
6. Rescore every affected module after a material change. Retain the prior score and evidence. ADR-0080 keeps deployed-production and integration-candidate subjects distinct so candidate progress cannot be presented as live readiness. Completion remains at least 90/100 with every category at least 80% of its weight; deterministic failures cannot be averaged away.
7. Promote an experiment only when its predeclared primary metric improves and all predeclared guardrails pass. Stop on any guardrail breach.
8. Run quarterly restore, tenant-isolation, privacy, SCIM-deprovisioning, and incident exercises under their existing bounded authorities. Any unexplained protected-value, tenant, privacy, checkout, recovery, or data-loss difference fails the bundle.
9. Preserve historical reviews, scores, exercises, and decisions. Corrections append evidence; obsolete architectural decisions are superseded through ADRs.
10. Bind every closeout artifact to the governance commit and exact plan/backlog digests. The approval record binds the other four artifact digests and active future schedule dates. Keep schedule destinations and owner identities environment-owned; source control stores role requirements and evidence digests, not personal contact data or receiver destinations.

## Consequences

- GA is not the end of verification. Missed cadence or stale sources reopen the operational gate and create ranked work.
- Initial M16 completion necessarily waits for elapsed months, a quarter bundle, and owner approvals; source-controlled positive fixtures only prove that honest completion is representable.
- Critical safety work stays above convenience features, while explicit effort and dependency penalties keep the order inspectable rather than subjective.
- Provider, platform, and recovery-dependency changes receive domain impact review before rollout, reducing silent incompatibility, unsafe transport assumptions, and unsupported-version exposure.
- The repository gains more governance artifacts, but their schemas, bounds, minimization, and validator keep them small and auditable.

## Rollback implications

Historical evidence and score history are immutable and cannot be rolled back. A harmful experiment, provider upgrade, or rollout is stopped through its own bounded rollback or forward-fix procedure while protected loyalty paths remain available. Change this governance contract through a superseding ADR, preserve prior artifacts, and revalidate every affected monthly and quarterly record against the contract that governed it at creation.
