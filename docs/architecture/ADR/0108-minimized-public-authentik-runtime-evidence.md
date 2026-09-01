# ADR-0108: Minimized public Authentik runtime evidence

- Status: Accepted
- Date: 2026-08-31
- Decision owner: Starfiniti engineering; independent security review remains pending
- Scope: M16 Authentik installed-runtime classification only
- Supersedes: ADR-0107's Authentik `installed-version-unknown` entry through `starfiniti.provider-impact-review.v2`; every other V1 entry remains unchanged

## Context

ADR-0107 correctly left the deployed Authentik patch unknown. The broker was
reachable, but repository evidence did not establish its served version. That
unknown kept the provider at High severity and prevented an informed current-
versus-candidate decision. Authentik is an identity boundary for workforce OIDC,
future tenant OIDC/SAML federation, SCIM deprovisioning, session revocation, and
recovery, so a guessed version or an unminimized configuration dump would both
be unacceptable.

The public login shell exposes a `versionFamily` value and versioned Authentik
stylesheet, polyfill, and flow-interface asset paths. The deployed shell and all
three independently fetched assets reported one exact patch, `2026.5.6`.
Authentik's official security policy supports the current and previous feature
release only at their latest patch. Through the evidence cutoff, `2026.5.6` is
the latest patch of the supported prior `2026.5` feature line and `2026.8.0` is
the current feature release.

Public shell evidence is not image evidence. It cannot identify a container
digest, prove every embedded component or outpost version, export private
configuration, recover signing material, or establish OIDC, SAML, SCIM,
deprovisioning, stale-session, or upgrade compatibility.

### Supported is not upgrade acceptance

Support status narrows patch risk; it does not approve the current feature line
or satisfy identity, recovery, rollout, or production gates.

## Options considered

### Keep the installed version unknown

This remains fail-closed, but discards a stable exact version signal already
served by the broker and leaves the next compatibility work poorly targeted.

### Read the container host or Authentik administration API

An approved read-only operator capture could prove image, outpost, and private
configuration state. No credentialed route was required to close the narrower
served-version unknown, however, and taking one now would expand the evidence
and access boundary. That stronger inventory remains a separate pre-upgrade and
recovery gate.

### Capture only bounded public runtime metadata

This is selected. A fixed-origin collector follows at most two relative same-
origin redirects, rejects private/reserved or mixed DNS answers, socket-pins
each TLS request, accepts identity encoding only, bounds time, headers, and
bodies, and retrieves the login shell, three uniquely selected same-version
assets, and the public live/ready endpoints. It retains only paths, status,
content type, byte count, SHA-256, version, and false-authority assertions.

## Decision

1. Add `starfiniti.authentik-runtime-capture-plan.v1` and a network-free
   adversarial self-test. A real capture requires an exact clean commit and an
   exclusive `0600` output outside the repository. Raw bodies, headers, cookies,
   DNS addresses, credentials, and private configuration are never written.
2. Bind the 3,257-byte snapshot to implementation commit
   `88c8046d5844bd3208dab7ca8bc814e0c1978fde`, plan SHA-256
   `3b7630e23ef01157f06d452f2ebdc70405cfe6f64e3839c4e795b4a34738384b`,
   and evidence SHA-256
   `4e89321c09f46bb4b3cd7e2690eed54110c9e516c0537d88b2c4424b141b5cb0`.
3. Record exact served Authentik `2026.5.6`, three same-version asset digests,
   TLS 1.3, and HTTP 200 live/ready results. Treat this as evidence of the
   served runtime patch only.
4. Reclassify Authentik from `installed-version-unknown-blocks-upgrade-decision`
   / High to `supported-prior-feature-line-current-patch` / Medium. Supported is
   not upgrade acceptance: `2026.8.0` remains an unaccepted candidate.
5. Append `starfiniti.provider-impact-review.v2` as a one-provider amendment.
   V1 remains immutable. The effective thirteen-provider digest becomes
   `3b8372a74aee6128b947e43c3ff3beba34029434b197c4340dff0d9cb3f6dfc3`
   with two Critical, four High, four Medium, and three Low entries.
6. Require an exact image/outpost inventory, private configuration and signing
   recovery export, the complete `2026.8` change/deprecation review, OIDC/SAML/
   SCIM fixtures, stale-session and deprovisioning canary, clean-room recovery,
   independent review, and owner approval before any broker upgrade.
7. Keep M16 at 77/100, the candidate at 83/100, and deployed production at
   54/100. This evidence closes no elapsed monthly, category-floor, candidate,
   recovery, review, approval, deployment, or reconciliation control.
8. Production authority remains false. The capture made public GET requests
   only and changed no broker, identity, tenant, database, release, checkout,
   connector, or loyalty value state.

## Compatibility and rollback consequences

The capture and review have no runtime contract or migration. The existing
broker remains on `2026.5.6`. No image, outpost, database, configuration,
signing material, provider, callback, session, or service was changed.

Before a future candidate rehearsal, preserve the exact container and outpost
inventory, broker database, private configuration export, signing material,
local break-glass owner path, and Supabase callback contract. A failed rehearsal
must leave `2026.5.6` running. A later contrary fact supersedes this V2 decision
with a new version and ADR; it never rewrites the V1 or V2 evidence.

## Verification

`npm run continuous-improvement:authentik-runtime:validate` validates the exact
snapshot bytes, plan binding, minimized transport and output boundary, root
redirect chain, version family and patch, all three asset digests, both health
results, official source identities, support classification, immutable V1
input, effective V2 digest and severity inventory, task and root-gate wiring,
remaining gates, and entirely false authority. It also runs the collector's
network-free attack suite.

The validator and a green repository gate do not prove the private image or
outpost inventory, identity behavior, recovery, current-feature compatibility,
upgrade acceptance, production readiness, or elapsed M16 cadence.
