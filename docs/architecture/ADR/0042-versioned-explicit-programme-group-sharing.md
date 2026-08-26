# ADR-0042: Versioned explicit programme-group sharing

- Status: Accepted
- Date: 2026-08-25
- Scope: M11-S01 multi-store programme and wallet topology

## Context

A programme group is already the wallet boundary: wallets reference one programme group, while `programme_group_workspaces` determines which store workspaces participate. That projection was suitable for isolated onboarding but was mutable infrastructure state with no merchant command, optimistic revision, or immutable explanation of who approved a shared topology.

Organization membership is not enough to authorize shared loyalty value. A merchant may operate unrelated brands or legal scopes inside one organization, a connector may retain store-specific order and coupon history, and silently removing a linked workspace could strand recovery evidence. The browser must not acquire direct link-table authority.

[Supabase row-level security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) recommends RLS on exposed-schema tables and warns that service keys must never reach the browser. [Supabase database-function guidance](https://supabase.com/docs/guides/database/functions) recommends `security invoker` by default and an explicit empty `search_path` when `security definer` is required. PostgreSQL documents [row locks](https://www.postgresql.org/docs/current/explicit-locking.html) as the serialization mechanism for concurrent writers and [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) as an independent integrity boundary. [WooCommerce HPOS documentation](https://developer.woocommerce.com/docs/features/high-performance-order-storage/) reinforces treating WooCommerce as a separately persisted commerce source rather than a mutable extension of the loyalty wallet.

## Alternatives

1. **Implicitly share every workspace in one organization.** This is simple, but organization administration would silently become customer-value authority and unrelated brands could share wallets accidentally.
2. **Keep only the mutable workspace link table.** This preserves the current schema, but cannot prove the reviewed topology at a historical instant, detect projection drift, or safely reject stale concurrent saves.
3. **Create a separate wallet per workspace and copy value between stores.** This keeps isolation, but introduces transfer, expiry, reversal, and double-spend semantics that the product has not approved.
4. **Keep the programme group as the wallet boundary and require an exact, immutable, versioned workspace allowlist.** A database command derives authority, locks the group and selected workspaces, checks the expected revision, updates the current projection, and appends version/audit evidence atomically.

## Decision

1. A programme group remains the only wallet boundary. M11-S01 does not transfer, duplicate, or merge points.
2. `isolated` requires exactly one active workspace. `explicit-workspace-allowlist` requires 2–25 unique active workspaces from the same live organization.
3. Same-organization membership never implies a link. Every workspace must appear in the reviewed command.
4. The public command accepts only a programme-group UUID, sharing mode, workspace UUIDs, expected revision, idempotency key, and correlation ID. PostgreSQL derives organization, actor, role, entitlement, and internal keys from live Auth and relations.
5. Only owners/admins with the database-authoritative `ecosystem.api` entitlement may change policy. Other live members may read the minimized topology for operations.
6. The command locks the active programme group and selected active workspaces. A stale revision, duplicate selector, changed idempotency reuse, suspended/cross-tenant selector, or revoked role fails closed.
7. Each accepted command appends one immutable policy version plus its exact ordered workspace membership and one minimized audit event. It also updates `programme_groups.sharing_policy` and `programme_group_workspaces` as the current projection in the same transaction.
8. Reads reconcile the current projection against the latest immutable version and raise on drift, inactive links, zero links, or an unbounded organization workspace set. They never synthesize a plausible policy.
9. A workspace with any provisioned commerce connection tied to a programme in the group is removal-protected. Deactivation/offboarding requires a later explicit connector and customer-history workflow, not topology deletion.
10. Version tables have RLS but no browser/runtime/worker table grants. Authenticated access is only through minimized empty-search-path functions with exact grants.
11. Policy configuration writes no ledger transaction, lot, reservation, programme version, connector event, or WooCommerce command. Checkout and existing wallet access are independent of this control.

## Consequences

- Shared multi-store wallets become deliberate and reconstructable without changing point ownership semantics.
- The current link table remains available to existing readers, while immutable revisions detect unauthorized or accidental projection drift.
- A connected workspace cannot be removed in this slice. This is intentionally conservative until M11-S02 defines explicit customer linking/unlinking and offboarding evidence.
- An organization with more than 100 active workspaces receives an unavailable bounded read rather than an unbounded browser projection; pagination is a future compatible contract.
- Cross-workspace customers are not merged by email or other weak identity. Shared policy only permits a future explicit verified link; M11-S02 owns that workflow.

## Security and integrity effects

- PostgreSQL, not UI state, Auth metadata, organization membership alone, or caller-supplied internal IDs, decides value-sharing scope.
- Group row locking plus expected revisions serializes competing topology writes. Idempotency returns the original immutable version for an exact retry.
- Migration backfill records existing linked topology as revision 1 with `source_kind = migration` and no invented actor. Invalid isolated or over-limit legacy topology fails migration explicitly.
- Direct history mutation is rejected by the shared immutable trigger; compensating future policy revisions replace edits.

## Operations and rollback

Deploy the additive migration before exposing the control. Verify every migrated current link set equals immutable revision 1, then render the read-only projection. Enable owner/admin saves only for the Starfiniti tenant, exercise isolated-to-shared and exact-retry cases, and reconcile connector/workspace/wallet counts before broader rollout.

Rollback hides the control and stops new configuration calls. Keep the last current topology, immutable revisions, connector links, customer access, and loyalty value intact. If a defect is found, disable new shared effects and ship a forward-fix revision; never delete policy or ledger history.
