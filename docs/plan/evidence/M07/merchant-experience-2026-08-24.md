# M07-S05 Merchant Experience and Results Evidence

## Outcome

The campaign command center is complete at the repository and production-build browser gates. It replaces the deferred Campaigns navigation item with a real Hub-style route for audience construction, immutable campaign authoring, calendar/lifecycle operations, liability confirmation, and exact results. It activates no production entitlement, schedule, or value.

## Authority and failure boundaries

- Browser submissions contain public selectors, strict versioned definitions, exact hashes, idempotency keys, and correlation IDs. PostgreSQL derives tenant, actor, internal programme, audience membership, budgets, assignments, and value authority.
- Owner/admin roles author, publish, approve, and cancel. Operator additionally has the existing snapshot, preview, and pause boundary. Analyst/auditor roles inspect only.
- Rollout disablement blocks new authoring, snapshots, previews, and approvals but leaves catalogue history, accepted schedules, pause/cancel controls, results, manual-review health, reversals, and reconciliation visible.
- Catalogue and protected result reads fail independently. The UI reports unavailable evidence instead of fabricating zeros.
- `get_campaign_results_v1` returns only bounded exact programme aggregates. Private assignments, identities, source references, evidence, errors, salts, actors, and coupon material remain inaccessible.
- Directly attributed outcomes are labelled influenced. The contract fixes `incrementalityState` to `not_measured`; causal lift requires a future versioned experimental metric definition.

## Browser evidence

A temporary isolated production-build fixture rendered the real `MerchantShell`, command center components, realistic immutable campaign data, and canonical result aggregates. The fixture and its proxy exception were removed before commit.

Desktop `1440 x 1000`:

- response `200`, network idle reached, one focusable main landmark, eight headings, ten buttons, eleven links, and no horizontal overflow;
- skip link moved focus to the main landmark;
- adding a condition changed the builder from one to two conditions;
- a valid audience enabled draft save, and loading an immutable campaign template enabled campaign save;
- five visible metric definitions matched the displayed result measures;
- dark mode applied through the real merchant theme control;
- results, operations, and 3,917-pixel internal command-center scroll remained contained within the shell.

Mobile `390 x 844`:

- response `200`, network idle reached, one main landmark, eight headings, twelve buttons, eleven links, and no horizontal overflow;
- mobile navigation opened with Campaigns active and remained keyboard operable;
- builders, cards, calendar, results, and five metric definitions reflowed within the 390-pixel viewport;
- the page produced no console error, page error, or failed application response.

The browser review also exercised disabled controls, dynamic condition creation, immutable-template loading, dark-mode persistence, skip navigation, desktop/sidebar containment, and mobile menu behavior.

## Verification

- Changed-file Prettier check: passed.
- ESLint and all workspace typechecks: passed.
- Unit/contract suites: 139 dashboard, 25 worker, 170 contracts, and 57 domain tests passed.
- Static database validation: 46 migrations and 38 pgTAP files passed.
- Architecture/accessibility/deployment/entitlement/WooCommerce validators: passed.
- Dashboard and worker production builds: passed.
- Exact-head CI [`32671197966`](https://github.com/Starfiniti/starfiniti-loyalty/actions/runs/32671197966): passed at `fcb1f3c` with both images, clean migration replay, 1,975 pgTAP assertions including 123 focused campaign assertions, all five concurrency probes, and all four WooCommerce runtime cells.

The initial exact-head run `32670992786` failed deterministically because the projection schema-qualified PostgreSQL's special `coalesce` expression and the repository's two security-definer allowlists had not yet accepted the reviewed function. The forward fix removed the invalid qualification and added the exact signature/name to both allowlists. No test count, authorization check, or product assertion was reduced.

## Remaining gate

M07-S06 still requires reviewed stacked merge, disabled deployment, a fresh recovery point, Starfiniti-only entitlement canary, end-to-end schedule/value/refund/reversal/manual-review/result reconciliation, rollback smoke, and a module score of at least 90. Until then, no production campaign schedule, entitlement, or customer value is claimed.
