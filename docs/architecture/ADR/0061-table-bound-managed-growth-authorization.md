# ADR-0061: Table-bound managed growth authorization

- Status: Accepted
- Date: 2026-08-27
- Module: M14-S05B

## Context

ADR-0060 deliberately separated commercial policy from the general entitlement resolver. The next boundary must ensure every current merchant growth/configuration command applies that decision without adding a delinquency dependency to value processing, customer access, exports, connector recovery, checkout, or in-flight external recovery.

Three approaches were compared:

1. Replace the general entitlement resolver with the commercial decision. This has low implementation cost but would also affect workers, reads, protected value paths, and older code. It violates the protected-path guarantee and is rejected.
2. Copy or dynamically rename every existing security-definer command and add a wrapper. This makes the check visible in each function but duplicates large, security-sensitive bodies, makes signatures and grants easy to drift, and does not stop a future command from writing the same configuration root without a wrapper.
3. Register every reviewed merchant mutation root in an immutable private catalogue and attach one fail-closed trigger guard to each root. Commands remain backward-compatible, all paths to a registered root receive the same PostgreSQL decision, and operational relations remain structurally absent.

The third approach is selected. The catalogue is the explicit command boundary: it records the exact relation, capability, operations, command names, and narrowly reviewed risk-reducing states.

## Decision

- PostgreSQL owns an immutable, RLS-enabled `managed_growth_configuration_boundaries` inventory. It currently maps 23 authoring roots to `programme.v2`, `vip.advanced`, `campaigns`, `notifications`, `storefront.experience`, `analytics`, `ecosystem.api`, `enterprise.identity`, or `migration`.
- Each registered relation has exactly one `BEFORE` trigger invoking `enforce_managed_growth_boundary_v1`. The trigger derives `organization_id` from the row and never accepts tenant, commercial state, entitlement, or actor authority from a browser parameter.
- The trigger delegates to `evaluate_managed_growth_boundary_v1`, which calls the separate ADR-0060 growth authorization for `managed.billing` using a stable non-personal subject. Commercial enforcement activates only when the managed tenant's explicit `managed.billing` canary entitlement is enabled; while that server-side flag is disabled, established domain commands and contract triggers retain their ordinary product-entitlement authority. The inventory's product capability documents ownership and coverage but is not re-applied at a table that can hold multiple compatible contract versions. A malformed boundary, organization, or operation fails closed; once the canary is enabled, missing commercial allowance fails closed as well.
- Authenticated browser requests require a current Auth subject. Bypass classification derives only from PostgreSQL's active role or session user and never from JWT claims or metadata. The database owner and isolated worker bypass before request metadata is considered, so a stale subject on a reused privileged session cannot commercialize lifecycle or recovery work. The dashboard runtime is still commercially evaluated and may be subjectless only because its private merchant commands separately derive and validate an explicit actor. Worker-driven protected/operational tables are not registered. Migration administration and the database owner retain an explicit subjectless deployment path.
- Self-hosted mode remains locally controlled. Managed `trialing`, `active`, `grace`, and current `contract_managed` states permit entitled configuration. `unconfigured`, grace-expired `suspended`, provider `suspended`, and `cancelled` states deny new nonprotected effects.
- Exact command retries that find prior immutable audit/effect evidence before another mutation remain readable while restricted. Changed or new requests reach the guarded root and fail.
- Risk-reducing actions remain available: campaign pause/cancel, webhook disable/retire and disabled rotation, analytics schedule pause, service credential revocation, isolated sharing, disabled currency policy, federation disable/retire/validation/recovery/completion, and existing SCIM credential rotation/revocation. In-flight external identity completion is not stranded after an earlier accepted command.
- SCIM endpoint creation is guarded, but existing endpoint updates and provisioning are not. This preserves immediate deprovisioning, quota processing, credential recovery, and account access in every commercial state.
- Programme, experience, VIP override, audience/campaign, notification authoring/test, analytics schedule, sharing/currency, service-account issuance, federation/SCIM creation, and migration dry-run/import roots are guarded. Descendant version/materialization tables need no second decision when their atomic root is already guarded.
- Ledger, wallet, lot, reward reservation, commerce connection/event, customer link, notification delivery, analytics export, migration correction, organization membership/access, and checkout relations are absent from the catalogue.
- The private inventory/evaluator/trigger have no browser, general runtime, or worker execute/select grants. No denial record contains customer, payment, provider, secret, contact, or request payload data.

## Verification

The pgTAP state matrix executes every registered root through self-hosted, managed-canary-disabled, managed-unconfigured, active, grace, suspended, cancelled, recovered, and manual-contract decisions. Structural assertions prove exact relation/trigger/command coverage, nonprotected catalogue keys, private grants, immutable inventory, and the absence of the commercial authorization function from protected and operational function definitions. The commercial triggers sort after existing contract validators so a malformed or separately unentitled definition retains its established deterministic error before commercial policy is considered.

A live command integration appends cancelled, active, suspended, and recovered provider evidence around the existing programme creation command. It proves that new commands are denied only while restricted, exact prior retries remain readable, recovery reopens new authoring, denied transactions leave no partial programme/audit effect, provider history remains append-only, and no ledger row is created.

## Consequences

The database now protects current and future callers of the same configuration roots, including server-runtime proxies, without duplicating command bodies. A newly introduced authoring relation or command must be added to the inventory and state matrix before it can satisfy the M14 gate. Safe states are intentionally conservative and require an ADR/test change to expand.

The trigger decision adds local PostgreSQL reads to merchant authoring only. It adds no network request and no cost to checkout or routine value processing. Denial errors are intentionally generic; the separately minimized billing summary explains the current state to an authorized merchant.

## Rollback

Disable the server-side commercial feature flag or remove the new triggers in a forward migration while retaining the immutable boundary catalogue and all commercial/provider history. Reopen an organization through newer active/grace evidence or an approved bounded manual contract. Never edit an old provider event, policy, contract, command audit row, or loyalty transaction.
