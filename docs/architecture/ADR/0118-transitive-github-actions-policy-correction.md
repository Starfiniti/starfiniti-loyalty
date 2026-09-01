# ADR-0118: Transitive GitHub Actions policy correction

- Status: Accepted
- Date: 2026-09-01
- Scope: GitHub Actions allowlist matching and composite-action dependencies

## Context

ADR-0117 deliberately disabled implicit trust for all GitHub-owned and all
verified-creator actions. Its first policy used documented repository-level
patterns for eight action repositories referenced directly by repository
workflows. Pull-request Security run `33499712113` then failed before creating a
job. Replacing the CodeQL repository pattern with the two exact public
sub-action references allowed CodeQL to initialize in manual run `33499821641`.

The same manual run failed its supply-chain job during setup. GitHub's minimized
check annotation identified two full-SHA transitive actions used by the pinned
`aquasecurity/trivy-action`: `aquasecurity/setup-trivy` and `actions/cache`.
They were not visible in the repository workflow source, so a direct-reference
inventory alone was not a complete executable action inventory.

The first retry failed closed on `actions/cache/restore`. Read-only inspection
of `aquasecurity/setup-trivy/action.yaml` at the exact reported commit proved
three nested references: `actions/cache/restore`, `actions/checkout`, and
`actions/cache/save`, all full-SHA pinned. The checkout pattern was already
present; the two cache sub-actions were added before a third attempt.

## Options considered

### Re-enable every GitHub-owned action

This would immediately admit `actions/cache`, but it would also restore implicit
trust for unrelated GitHub-owned actions. Full-SHA pinning limits ref mutability,
but an unreviewed workflow could still add any GitHub-owned action without a
repository-policy change.

### Replace the Trivy composite action

Calling a downloaded scanner directly could remove the transitive action
dependencies. That is a larger security-workflow redesign requiring new tool,
download, signature, cache, and artifact evidence. It is not required to repair
the current fail-closed policy.

### Enumerate direct and observed transitive action references

Keep implicit GitHub-owned and verified-creator trust disabled. Allow the nine
direct action references plus only the four newly required transitive patterns
that GitHub setup failures and exact pinned source exposed. Continue requiring
every resolved action ref, including composite-action dependencies, to be a full
commit SHA.

## Decision

Adopt the explicit thirteen-pattern allowlist:

1. `actions/attest-build-provenance@*`
2. `actions/cache@*`
3. `actions/cache/restore@*`
4. `actions/cache/save@*`
5. `actions/checkout@*`
6. `actions/download-artifact@*`
7. `actions/setup-node@*`
8. `actions/upload-artifact@*`
9. `anchore/sbom-action@*`
10. `aquasecurity/setup-trivy@*`
11. `aquasecurity/trivy-action@*`
12. `github/codeql-action/analyze@*`
13. `github/codeql-action/init@*`

The wildcard applies only to the ref portion. Repository-level
`sha_pinning_required=true` still rejects tags, branches, and abbreviated SHAs.
The two CodeQL sub-actions remain separate because the repository-level pattern
did not admit their public subdirectory action references in the observed run.

The disabled release preflight requires this exact policy and zero implicit
GitHub-owned or verified-creator trust. A future action or a changed transitive
dependency must fail setup until its exact owner/repository or public sub-action
pattern, resolved SHA, purpose, and rollback consequence are reviewed.

## Consequences

The policy remains narrower than enabling all GitHub-owned or all verified
Marketplace actions. Composite-action dependencies are now part of the reviewed
supply-chain boundary rather than assumed to inherit their parent's approval.
Updates to Trivy can legitimately require a repository-policy revision even when
the top-level `uses:` line is unchanged.

The failed startup and setup runs are retained as negative evidence. They are
not accepted as Security proof. Fresh exact-head CI and Security runs plus new
digest-bound artifacts remain required for M15-S03, which stays at 7/27.

## Rollback implications

Reapplying ADR-0117's direct-only patterns is a safe fail-closed rollback but
will prevent the current Security workflow from completing. Restoring
unrestricted Actions would weaken R-065 and requires a superseding ADR and
independent security review. Release remains disabled in either case.

## Evidence

- `docs/plan/evidence/M15/repository-actions-policy-correction-2026-09-01.yaml`
- `.github/workflows/release.yml`
- `scripts/validate-release-policy-audit.mjs`
- `docs/operations/RELEASE.md`

## References

- [GitHub Actions permission patterns](https://docs.github.com/en/rest/actions/permissions)
- [GitHub workflow syntax for public subdirectory actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
