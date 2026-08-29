# ADR-0106: Refresh the bounded notification and federation dependency patch set

- Status: Accepted
- Date: 2026-08-30
- Owners: Engineering
- Affected modules: M08, M13, M16

## Context

The repository review on 2026-08-30 found three compatible patch releases on
the exact major/minor lines already in use:

- `fast-xml-parser` 5.11.1 replaces a quadratic regular-expression path in its
  XML validator with a single-pass attribute scanner. Starfiniti parses
  tenant-supplied SAML metadata through this package only after a 256 KiB
  transport limit, declaration rejection, and the separate bounded
  `fast-xml-validator` syntax gate. The package-level fix is still relevant
  defence in depth and keeps the parser line current.
- Nodemailer 9.0.6 hardens copies of caller-supplied keys and URL fetching and
  repairs angle-address parsing. Starfiniti already sets
  `disableFileAccess: true` and `disableUrlAccess: true` on both the SMTP
  transport and each message; the patch strengthens the dependency beneath
  that fail-closed application policy.
- `smtp-server` 3.19.4 aligns the isolated SMTP test sink with Nodemailer 9.0.6,
  avoiding a test/runtime dependency skew.

The candidate runtime dependency graph changes by these three exact patch
versions, while the currently deployed immutable production images remain
unchanged. The review also found unrelated minor and major updates. Combining them with
the untrusted-input patch set would enlarge the behavioral surface without a
shared failure boundary. This slice changes repository packages only. It does
not change a tenant contract, notification event, SAML policy, database,
ledger, WooCommerce checkout, release, or production runtime.

## Considered approaches

### Keep the existing package set

Rejected. It leaves reviewed upstream hardening unapplied even though the
candidate versions remain on the existing compatible lines and the relevant
federation and notification regression suites already exist.

### Upgrade every currently outdated package together

Rejected. TypeScript, ESLint, Node type definitions, Zod, and Lucide updates
have separate compiler, contract, or interface risk. Their validation and
rollback boundaries do not belong in the notification/federation patch.

### Apply only the reviewed compatible patch set with exact manifest pins

Accepted. Exact manifest versions and npm integrity values bind the three
packages. The existing SAML, SMTP, notification, tenancy, secret, build, image,
and WooCommerce gates verify the resulting candidate as one unit. A dedicated
network-free validator rejects source, package, lockfile, task, decision, and
production-authority drift.

## Decision

1. Pin `fast-xml-parser` 5.11.1, Nodemailer 9.0.6, and `smtp-server` 3.19.4
   exactly in their owning workspaces.
2. Bind each official GitHub comparison, tag commit, npm tarball, and npm
   integrity in `infrastructure/governance/dependency-patch-review.yaml`.
3. Retain Starfiniti's independent 256 KiB SAML document bound, declaration
   rejection, syntax validation, entity-expansion limits, public-endpoint
   validation, and certificate checks.
4. Retain transport-level and message-level file/URL access denial for SMTP;
   dependency hardening never replaces the application policy.
5. Keep unrelated minor and major dependency changes outside this slice.
6. Record the candidate runtime dependency change separately from the absence
   of any live production mutation.
7. Keep merge, release, deployment, production access, mutation, and
   reconciliation authority false.

## Security and data-integrity effects

The selected versions narrow dependency behavior around untrusted XML and
message construction. They do not authorize tenant input, remote file access,
or remote URL access. No value-changing or tenant-authority code changes, and
there is no migration or stored-data transformation.

## Operational effects

The dashboard and worker images must be rebuilt before any future deployment.
The worker SMTP lifecycle and dashboard federation tests must pass, followed by
the full image, supply-chain, DAST, CodeQL, database, and WooCommerce matrix.
Production continues to run the immutable released image until separately
approved merge, release, and deployment gates.

## Compatibility and rollback consequences

The selected updates are patch releases on existing lines and retain the
repository's Node 24 runtime. If a regression appears, revert the three manifest
pins and `package-lock.json` together, rebuild both images, and repeat the same
verification. Rollback does not permit weakening the SAML size/syntax/entity
controls or SMTP file/URL denial. No production rollback is performed by this
decision because production is unchanged.

## Verification

Run `npm run continuous-improvement:dependency-patches:validate`, the focused
federation and SMTP tests, `npm run audit:prod`, and the complete
`npm run check` gate. Exact-head CI, Security, external CodeQL, and the four
WooCommerce runtime cells remain required before handoff. This ADR records
repository candidate authority only; it is not merge, release, deployment, or
production approval.
