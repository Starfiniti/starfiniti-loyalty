# Release operations

## Current state

The GitHub `Release` workflow is manually disabled. Production remains `v0.1.11`. Do not enable or dispatch the replacement workflow until every prerequisite below is present and independently reviewed.

### Hardened state — 2026-09-01

Protected `main` now requires the twelve exact current checks with their GitHub
App identities, strict current-base evaluation, verified signatures, one
approval, stale-review dismissal, last-pusher separation, resolved conversations,
and administrator enforcement. Force pushes and branch deletion are disabled.
Two active rulesets cover `refs/tags/v*.*.*`: the first restricts creation to
the explicitly recorded owner through audited non-exempt bypass. The second has
no bypass and independently requires a signature while denying update and
deletion, so creation authority cannot bypass signature or immutability.

Repository-native security is also fail-closed. GitHub Actions accepts only
the eight action repositories currently used by repository workflows, denies
implicit GitHub-owned and verified-creator trust, and requires every action
reference to use a full commit SHA.
Dependency alerts, unpaused Dependabot security updates, secret scanning, push
protection, and private vulnerability reporting are enabled. The two alerts
found during enablement were deterministic Stripe-format unit-test fixtures;
they were resolved as `used_in_tests`, no external credential was involved, and
the current Dependabot, code-scanning, and secret-scanning open-alert counts are
zero. Non-provider pattern scanning and validity checks remain reported disabled
and are not claimed as release controls.

Only one administrator/collaborator currently exists, so the required branch
approval is not satisfiable yet. This is intentionally fail-closed. Add an
eligible independent collaborator and obtain that person's approval; do not
weaken the rule to merge. The protected `release` environment, independent
environment reviewer, policy token, exact signed annotated tag,
security/licence closure, and explicit release approval also remain absent.

`release-policy-hardening-2026-09-01.yaml` records exact rule identities and
rollback endpoints. `npm run release-policy:audit:validate` validates it against
the immutable precondition snapshot. The chronological successor
`repository-security-hardening-2026-09-01.yaml` records the Actions, dependency,
secret-scanning, alert-triage, and private-reporting state plus exact rollback
endpoints.

### Pre-hardening audited state — 2026-09-01

A read-only live audit found eleven successful check runs on exact merged `main`,
but no branch protection on `main`, zero repository rulesets, zero repository
environments, and no repository `RELEASE_POLICY_TOKEN` secret. The workflow was
still `disabled_manually`; no tag or release was created and no production
mutation occurred. The API cannot prove whether a secret with the same name is
inherited, so inheritance is recorded as unknown rather than accepted.

The minimized source record is
`docs/plan/evidence/M15/release-policy-audit-2026-09-01.yaml`. Run
`npm run release-policy:audit:validate` before relying on it. It is absence
evidence and a fail-closed checklist, not release approval.

## Required external controls

- Keep the current `main` protection exact. Add an eligible independent reviewer and obtain one approval; never remove checks, signature enforcement, last-pusher separation, conversation resolution, force-push/deletion blocks, or administrator enforcement to bypass the missing reviewer.
- Keep both active `refs/tags/v*.*.*` rulesets. Creation authority must remain limited to the explicit audited non-exempt actor; the separate no-bypass ruleset must continue enforcing signatures and blocking update/deletion.
- Keep Actions restricted to the exact selected-action policy and full-SHA references. Keep vulnerability alerts, unpaused Dependabot security updates, secret scanning, push protection, and private vulnerability reporting enabled; resolve or remediate every open repository security alert before release.
- Create a `release` environment restricted to protected branches. Add an independent required reviewer, enable prevent-self-review, and disable administrator bypass.
- Create a fine-grained `RELEASE_POLICY_TOKEN` secret with repository Administration, Actions, Checks, Code scanning alerts, Commit statuses, Contents, Dependabot alerts, and Secret scanning alerts permissions set to read only. It must not write contents, tags, packages, releases, alerts, actions, environments, or any other repository resource.
- Close the release-security and licence obligations tracked in `RISKS.md`, and obtain the explicit release/production approvals required by the enterprise task graph.

The preflight checks every API-visible control again. GitHub's environment read response does not expose the administrator-bypass toggle, so the independent release owner must verify that setting in the environment UI before each enablement window. A green preflight is evidence, not permission to weaken any control.

## Prepare the candidate

1. Merge only an approved clean candidate to protected `main` after exact CI and security checks pass.
2. Create a signed annotated semantic-version tag at the exact current `main` commit. Never move or recreate a version tag.
3. Verify the tag locally and on GitHub, then wait for every required check on the exact commit.
4. Record the exact 40-character candidate SHA and version without the `v` prefix.

## Dispatch

After the workflow has been explicitly re-enabled and the release owner has approved this exact candidate:

```powershell
gh api repos/Starfiniti/starfiniti-loyalty/dispatches `
  --method POST `
  -f event_type=release `
  -F 'client_payload[tag]=v0.1.12' `
  -F 'client_payload[candidate_sha]=0123456789abcdef0123456789abcdef01234567'
```

Replace both example values. Dispatching a tag name or abbreviated SHA is invalid.

## Observe and approve

1. Confirm preflight verified exact main, tag signature and target, required checks, branch protection, active tag ruleset, release environment, and release absence.
2. Confirm the build checked out the exact SHA and completed the full repository, database, image, WooCommerce, security, licence, and packaging gates.
3. Review the uploaded sealed artifact's GitHub digest, internal checksums, source archive, plugin ZIP, image metadata, SBOMs, and release metadata before environment approval.
4. The required reviewer must be independent of the dispatcher and candidate author where policy requires separation. Do not approve an unexplained warning or a candidate different from the recorded SHA.
5. After publish, reconcile GHCR digests, attestations, release assets/checksums, signed tag, source archive, WooCommerce version, and production rollout evidence.

## Failure and rollback

- Before publish, reject the environment approval or cancel the run. No release/package write should exist.
- After any registry or release write, treat the version as immutable. Do not force a tag, replace an asset, or overwrite an image tag.
- Retain the sealed artifact and logs. Determine the exact last successful write, then either forward-complete the same verified bytes or withdraw the release through an explicitly reviewed incident decision.
- Production deployment is separate. A successful release does not authorize deployment, migration, tenant enablement, or data change.
- If an external control drifts, disable the workflow again before investigating.

See [ADR-0115](../architecture/ADR/0115-default-branch-controlled-sealed-releases.md) for the authority model.
