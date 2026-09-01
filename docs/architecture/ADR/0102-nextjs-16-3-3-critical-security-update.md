# ADR-0102: Patch the Next.js 16.3 Critical RCE advisories

- Status: Accepted
- Date: 2026-08-29
- Owners: Engineering and security
- Affected modules: M15, M16

## Context

Official Next.js release `v16.3.3` fixes two Critical unauthenticated remote-code-execution advisories. `GHSA-2xp9-vwfh-vxw4` affects Next.js versions below 16.3.3 when AVIF input reaches the Image Optimization API. `GHSA-p293-qw3h-jr36` / `CVE-2026-75604` affects Next.js 16.0 through 16.3.2 on Windows-hosted Pages or App Router servers without Cache Components.

Released Starfiniti `v0.1.11` and the integration candidate both declared Next.js 16.3.0. Production is Linux, so the Windows-specific precondition does not describe the deployed host, but the released configuration left image optimization enabled and is within the AVIF advisory range. The candidate disables image optimization as defence in depth, yet configuration mitigations do not make a vulnerable package an acceptable reusable or self-hosted artifact. `npm audit` returning zero cannot override newer authoritative upstream advisories.

## Considered approaches

### Keep 16.3.0 and rely on deployment preconditions

Rejected. Linux and `images.unoptimized` reduce present exposure but do not repair the dependency, cover every future self-hosted deployment, or provide a safe rollback artifact.

### Record a temporary risk acceptance until the next feature upgrade

Rejected. Both advisories are Critical, a compatible patch exists, and the change does not require a contract or database migration.

### Pin 16.3.3 and rebuild every deployable artifact

Accepted. The dashboard pins `next` and the matching `eslint-config-next` to exact 16.3.3 package bytes. A network-free validator binds the official advisories, release, npm tarballs, lockfile integrity, application configuration, task, risk, backlog, and false production authority. Exact-head CI must rebuild and scan the dashboard image and rerun application, database, WooCommerce, CodeQL, DAST, SBOM, Trivy, audit, and licence gates.

## Decision

1. Next.js 16.3.3 is the minimum accepted 16.x runtime for a Starfiniti dashboard artifact.
2. `eslint-config-next` stays on the exact matching version.
3. Image optimization remains disabled in the candidate as defence in depth; this is not represented as the security fix.
4. A deployable rollback to 16.3.0 is prohibited. If 16.3.3 regresses, withdraw or disable the candidate and forward-fix or rebuild the previous application source against a patched dependency.
5. Repository completion grants no merge, release, deployment, production-access, or reconciliation authority. Released production remains affected until an explicitly approved patched release is deployed and reconciled.

## Compatibility and rollback consequences

This is a patch-level application dependency change. It has no database, API, event, WooCommerce, entitlement, ledger, or customer-value contract change. V1/V2 programme evaluation and historical effects are unchanged.

Rollback means application release withdrawal or a forward rebuild, not restoration of Next.js 16.3.0. Production rollout must retain the existing immutable release for forensic comparison only, never as a deployable recovery target, and must prove dashboard health, authentication, customer access, checkout independence, protected-value reconciliation, and security-image evidence after deployment.

## Verification

Exact implementation `c3b29542035772ddcbc48d92e2b159ac605dd80f` passed
CI `33261152926`, Security `33261152934`, and external CodeQL check
`99123424225` with all twelve required checks green. The immutable 5,199-byte
evidence file
`docs/plan/evidence/M16/runs/next-runtime-c3b2954-2026-08-29T155152Z.json`
has SHA-256
`d90150e1ec818f1fa092df6cf6a91137c1333cf5b97b4eafb4bcfe3b4ec205ca`.
It binds the rebuilt image identities, SBOMs, repository and image Trivy scans,
zero-result CodeQL, DAST, application tests, database replay/pgTAP/concurrency,
all four WooCommerce runtime jobs, audit, secret scan, licence validation, and
false production authority. Merge, release, deployment, observation, and
protected-value reconciliation remain separate approvals.
