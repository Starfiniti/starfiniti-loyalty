# ADR-0117: Repository-native continuous security controls

- Status: Accepted
- Date: 2026-09-01
- Scope: GitHub repository security, dependency alerts, secret scanning, and release preflight

## Context

ADR-0115 moved release authority to protected default-branch code and external
repository policy. The first live policy audit then exposed a second boundary:
the public repository allowed every GitHub Action, did not require full-SHA
action references, had dependency alerts and automated security updates
disabled, had secret scanning and push protection disabled, and offered no
private vulnerability-reporting route.

Repository CI already pins every action reference and independently scans source,
images, dependencies, licences, and release artifacts. Those controls are
necessary but are still candidate-controlled. They cannot replace external
repository policy that rejects an unapproved action before it runs, scans the
entire Git history, or gives a researcher a private disclosure path.

Enabling secret scanning found two historical Stripe-format strings in one unit
test. Both locations construct deterministic synthetic fixtures from fixed
constants or repeat operations. Neither was issued by Stripe or used outside
tests, so the alerts were resolved as `used_in_tests`; no credential rotation was
claimed or required.

## Options considered

### Keep repository settings permissive and rely on CI

This avoids administration changes, but a candidate can alter its own scanners
and can introduce a new third-party action before those scanners execute. It
also leaves historical-secret discovery and coordinated private disclosure
outside the repository boundary.

### Enable only notifications

Dependency and secret alerts improve visibility, but unrestricted or unpinned
actions still permit a workflow supply-chain expansion. Release could also
proceed while an API-visible alert remains open.

### Enforce the exact action boundary and require repository-native security state

The eight action repositories currently used are allowlisted explicitly and
every action must use a full commit SHA. Neither all GitHub-owned actions nor all
verified Marketplace creators are trusted implicitly. Dependency alerts,
automated security updates, secret scanning, push protection, and private
vulnerability reporting remain enabled. The default-branch release preflight
independently rechecks these settings and requires zero open Dependabot,
code-scanning, or secret-scanning alerts before publication.

## Decision

Adopt the exact external repository boundary.

1. GitHub Actions remains enabled with `allowed_actions=selected` and
   `sha_pinning_required=true`.
2. GitHub-owned and Marketplace-wide verified-creator access are both denied by
   default. The eight current action repositories are the complete allowlist:
   `actions/attest-build-provenance@*`, `actions/checkout@*`,
   `actions/download-artifact@*`, `actions/setup-node@*`,
   `actions/upload-artifact@*`, `anchore/sbom-action@*`,
   `aquasecurity/trivy-action@*`, and `github/codeql-action@*`. Full-SHA pinning
   still applies to every action reference, including CodeQL sub-actions.
3. Default workflow permissions remain read-only and workflows cannot approve
   pull-request reviews.
4. Dependency vulnerability alerts and Dependabot security updates remain
   enabled and unpaused.
5. Secret scanning and push protection remain enabled. Non-provider pattern
   scanning and validity checks were still reported disabled after the supported
   update request, so they are not claimed as active or made release gates.
6. Private vulnerability reporting remains enabled for coordinated disclosure.
7. The release-policy token adds read-only Code scanning alerts, Dependabot
   alerts, and Secret scanning alerts permissions. Release preflight retains its
   existing read-only Administration, Actions, Checks, Commit statuses, and
   Contents permissions.
8. Release preflight requires the exact branch check/app set, signed commits,
   last-push approval, the two distinct tag rulesets from ADR-0115, the exact
   Actions allowlist, enabled repository security features, and zero open alerts.
9. Alert triage records only alert number, type, path, line, commit, disposition,
   and rationale. Secret values never enter Git, logs, pull requests, or evidence.

## Consequences

A newly added action fails before execution unless repository administration
expands the allowlist and the workflow pins a full commit SHA. A release also
fails closed when dependency, code-scanning, or secret-scanning alerts are open,
even if candidate CI is green. Dependabot may open security pull requests, but
normal branch protection and independent review still apply.

Repository security settings are not production deployment authority. The
Release workflow remains disabled, the protected environment and policy token
are absent, PR #58 still needs an independent reviewer, and production remains
unchanged.

## Rollback implications

The prior repository settings can be restored through the exact endpoints in
`repository-security-hardening-2026-09-01.yaml`: restore unrestricted Actions
and disable vulnerability alerts, automated security fixes, secret scanning,
push protection, and private vulnerability reporting. That rollback materially
weakens the release boundary and requires a new ADR and independent security
review.

Alert-resolution comments are append-only audit evidence. Reopening a verified
test fixture is not a policy rollback and requires a separately reviewed reason.

## Evidence

- `docs/plan/evidence/M15/repository-security-hardening-2026-09-01.yaml`
- `scripts/validate-release-policy-audit.mjs`
- `.github/workflows/release.yml`
- `docs/operations/RELEASE.md`

## References

- [GitHub repository security and analysis settings](https://docs.github.com/en/rest/repos/repos)
- [GitHub Actions permissions](https://docs.github.com/en/rest/actions/permissions)
- [GitHub secret-scanning alerts](https://docs.github.com/en/rest/secret-scanning/secret-scanning)
- [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)
