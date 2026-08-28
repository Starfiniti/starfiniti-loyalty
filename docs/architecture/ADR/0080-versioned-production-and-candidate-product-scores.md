# ADR-0080: Separate deployed-production and integration-candidate product scores

- Status: Accepted
- Date: 2026-08-28
- Decision owners: Starfiniti product and engineering
- Scope: M00 product evidence, M15 GA scoring, and M16 material-change rescoring

## Context

The original whole-product score was evaluated for production `v0.1.11` after M03.
M04 through M14 were then implemented on the unmerged enterprise integration branch,
but `product-score.json` still described those capabilities as absent. The human
scorecard separately reported 51/100 while the machine-readable file summed to
54/100. Neither number represented the full repository candidate, and replacing the
production score with a higher candidate number would falsely imply that unmerged,
disabled, or uncanaried behavior was live.

M16 requires material changes to rescore affected evidence without rewriting score
history. M15 also requires a whole-product score of at least 90 with category floors,
but scoring can never substitute for the real-store pilot, recovery, module canaries,
security review, observation, reconciliation, or approval.

## Alternatives

### Keep one production-only V1 score until GA

This preserves deployed truth but leaves product breadth and usability evidence
stale throughout development. It violates the material-change rescoring rule and
encourages contradictory prose scores.

### Replace the production score with the integration-candidate score

This makes repository progress visible but conflates implemented code with deployed
and observed customer value. It could turn a high candidate score into a false
production-readiness claim.

### Maintain separate versioned production and candidate subjects

Preserve the original V1 production score by exact digest. Evaluate deployed
production and the integration candidate independently under the same weights,
targets, automatic failures, and category floors. Select the candidate only for
development prioritization; retain production as the runtime truth.

## Decision

Use separate versioned subjects.

`product-score.json` V2 contains one deployed `production` subject and one
`candidate` subject. Each binds an exact ancestor commit, category evidence paths,
the fixed 100-point weight catalogue, automatic-failure states, and its remaining
gate. The candidate is the development-prioritization subject; deployed production
is the only completion subject. The original V1 file, release identity, and known
SHA-256 are preserved byte-for-byte and fixed in the validator and V2 history.

The candidate score is 83/100: repository breadth, merchant usability, customer
experience, reliability, operations contracts, and enterprise/commercial behavior
are represented, while activation remains 3/10 because no approved real-store
customer has completed the value and outage sequence. The deployed production score
remains 54/100. Both are ineligible. The active missing-live-evidence failure and the
candidate activation category below its 80% floor independently prevent completion.

One validator recomputes weights, totals, category floors, prioritization and
completion-subject selection, exact automatic-failure definitions and states,
bounded no-link evidence-path reads, historical identity/digest binding, commit
ancestry, task-graph authority, and the scorecard marker. Corruption fixtures must
reject schema drift, arithmetic inflation, evidence removal, history rewriting, and
candidate-based false completion.

## Security and integrity effects

- Scores never grant tenant, billing, programme, customer, connector, or value
  authority.
- A candidate score cannot be presented as deployed production evidence.
- Automatic failures remain deterministic and cannot be averaged away.
- Historical score bytes and digest remain independently reconstructable.
- Evidence paths contain only repository-safe minimized material; secrets, personal
  data, production payloads, and approval identities remain outside the score.

## Operations

Run `npm run product-score:validate` after every material module change and as part
of `npm run check`. Update both subjects only when their exact evidence changes.
Production changes require a released/deployed source commit and the applicable live
artifacts; candidate changes require an exact reviewed implementation commit.

M15 final reconciliation still owns the release-specific score at GA. M16 elapsed
monthly reviews must retain prior and current subjects, review every affected module,
and cannot reuse this repository rescore as an elapsed production review.

## Migration and rollback

The schema change is documentation and validation only. No PostgreSQL, Supabase,
Auth, WooCommerce, programme, ledger, customer, billing, or production runtime state
changes.

Rollback by restoring V1 as the active file while retaining the V2 file and this ADR
as historical evidence. Do not delete or modify the digest-bound V1 snapshot to make
a lower or higher score disappear. A future score model must supersede this decision
and preserve both subjects and their evidence.
