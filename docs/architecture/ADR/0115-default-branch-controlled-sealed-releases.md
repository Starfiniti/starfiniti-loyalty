# ADR-0115: Default-branch-controlled sealed releases

- Status: Accepted
- Date: 2026-08-31
- Scope: tagged application, image, source, and WooCommerce releases

## Context

The prior workflow ran repository-controlled release code from a pushed version tag and granted write authority in the same job that checked out, built, and published that candidate. A signed tag identifies an author, but it does not prove that the workflow definition came from the protected default branch or that an independent person approved publication. A tag-created event therefore combined untrusted candidate code, mutable build steps, and release authority.

The current repository also has unresolved distribution obligations and production approval gates. The workflow must remain disabled until repository policy exists outside the candidate commit.

## Options considered

### Continue releasing on version-tag push

This is familiar, but a tag can select its own workflow and build code before external policy has checked the candidate. Job-level write permission does not separate build compromise from publication.

### Build manually and upload local artifacts

This removes the tag trigger, but weakens reproducibility, provenance, checks, and reviewer-visible custody.

### Dispatch a default-branch workflow, seal a read-only build, then approve a no-code publisher

A `repository_dispatch` event loads the workflow from the default branch. A read-only preflight verifies exact main, signed annotated tag, required checks, branch protection, tag ruleset, and release-environment policy. A read-only build produces one short-lived sealed artifact and digest. Only a separate environment-gated publisher receives write permission, downloads the sealed artifact, revalidates the tag and main, and runs no repository code or build tooling.

## Decision

Use the separated default-branch workflow.

1. Release starts only from a `repository_dispatch` event of type `release` naming an exact semantic version and 40-character candidate commit.
2. Top-level permissions are empty. Preflight and build have read-only permissions. Only the `publish` job has package, release, and attestation write permission.
3. Preflight uses a separate fine-grained `RELEASE_POLICY_TOKEN` with read-only Administration, Actions, Checks, Commit statuses, and Contents access to inspect external repository controls. The built-in workflow token is not accepted as evidence of its own authority.
4. The candidate must equal current `main`, pass every required check, and have a verified signed annotated `v*.*.*` tag resolving to that exact commit. An existing release fails closed.
5. Protected `main`, an active version-tag ruleset, and a `release` environment with an independent required reviewer, prevent-self-review, protected-branch restriction, and disabled administrator bypass are mandatory external controls. The environment REST response does not expose the administrator-bypass toggle, so that setting remains an explicit independent UI review rather than a machine-verifiable claim.
6. Build checks out only the exact candidate with persisted credentials disabled. It runs the complete gate, creates source, WooCommerce, image, SBOM, metadata, and checksum artifacts, and uploads one one-day uncompressed sealed bundle through digest-pinned actions.
7. Publish has no checkout, package install, build, or repository-script step. It verifies the GitHub artifact digest, exact closed file set, internal and release checksums, and candidate metadata before loading/pushing prebuilt images, creating attestations, and publishing the release.
8. Immediately before the first write, publish revalidates exact `main`, tag target/signature, and release absence.
9. The GitHub workflow remains manually disabled until every external prerequisite is present and independently reviewed.

## Consequences

A release is intentionally not created by pushing a tag alone. The release operator supplies two public selectors, CI verifies candidate identity, and a separate reviewer authorizes publication from the protected environment. A candidate can influence build outputs but cannot alter the already-loaded default-branch workflow or the publisher's closed verification steps.

Partial publication is still possible after the first registry write. Operations must retain the sealed bundle, inspect immutable package/release state, and forward-complete or explicitly withdraw the failed version; never retag or replace published bytes.

## Rollback implications

Keep the workflow disabled or disable it again. Revoking the policy token, removing the environment approval, or stopping before publish prevents new writes without affecting released artifacts. Never delete and recreate a signed version tag or overwrite a release asset. If the workflow contract changes materially, update the default branch and external controls first, then perform a fresh reviewed dispatch.

## Current evidence — 2026-09-01

The initial read-only audit in
`docs/plan/evidence/M15/release-policy-audit-2026-09-01.yaml` confirms that the
replacement workflow remains manually disabled and exact merged `main` has
eleven green check runs. It also proves the required external boundary is not
ready: `main` is unprotected, repository rulesets and environments are empty,
and no repository `RELEASE_POLICY_TOKEN` secret is configured. Eight gates stay
open, including the signed annotated release tag and explicit owner approval.
The audit changed no GitHub or production state. Its validator rejects any
attempt to reinterpret these absences as release authority.

The chronological successor
`docs/plan/evidence/M15/release-policy-hardening-2026-09-01.yaml` records the
repository-policy mutation without rewriting that precondition. Protected
`main` now has strict app-bound checks, verified signatures, review and
last-pusher separation, stale-review dismissal, conversation resolution,
administrator enforcement, and force-push/deletion blocks. Complementary tag
rulesets separate audited signed creation from no-bypass update/deletion denial.
Only one collaborator exists, so branch approval is deliberately unsatisfied;
the environment, independent environment reviewer, policy token, exact release
tag, security/licence closure, and owner approval remain external. Release stays
disabled, and no release or production authority was exercised.

ADR-0117 and
`docs/plan/evidence/M15/repository-security-hardening-2026-09-01.yaml` add the
next chronological external-policy layer: selected full-SHA Actions, dependency
alerts and unpaused security updates, secret scanning and push protection,
private vulnerability reporting, and zero open repository security alerts. The
release preflight now checks those controls with the expanded read-only policy
token. It also validates the two complementary tag rulesets separately. This is
required because combining creation authority and signature enforcement in one
bypassed ruleset would let the creator bypass signatures, while requiring all
four rules in one non-existent ruleset would make the hardened split impossible
to release through.

## References

- [GitHub `repository_dispatch`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch)
- [GitHub rulesets REST API](https://docs.github.com/en/rest/repos/rules)
- [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
