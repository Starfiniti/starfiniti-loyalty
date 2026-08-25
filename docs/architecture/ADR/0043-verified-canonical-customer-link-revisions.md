# ADR-0043: Verified canonical customer link revisions

- Status: Accepted
- Date: 2026-08-26
- Scope: M11-S02 cross-workspace customer identity and shared-wallet routing

## Context

M11-S01 makes multi-workspace programme-group scope explicit, but a shared topology does not prove that customer `7` in store A and customer `842` in store B are the same person. The existing WooCommerce claim supplies a fresh store-key HMAC proof for one registered customer and binds it to an already authenticated Supabase Auth subject. It deliberately rejects email as authority and previously allowed only one active customer record per Auth subject and organization.

A shared-wallet implementation must preserve the programme group as the value boundary, keep historical commerce and claim provenance, avoid copying ledger value, and support an audited unlink. It must also keep all existing customer and worker paths on one canonical customer without a flag-day rewrite.

Current [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) requires grants and policies as separate controls, recommends revoking unneeded client privileges, and treats tests as necessary because an overly broad policy can fail silently. Its [database-function guidance](https://supabase.com/docs/guides/database/functions) prefers invoker functions and requires an empty `search_path` for the exceptional definer boundary. PostgreSQL documents transaction-level [advisory and row locks](https://www.postgresql.org/docs/current/explicit-locking.html) as transaction-scoped serialization tools for application-defined invariants.

## Alternatives

1. **Merge by normalized email or organization membership.** It is convenient but neither signal proves identity, both can be reassigned, and organization membership is merchant authority rather than customer consent.
2. **Aggregate several independent wallets at read time.** This avoids changing identity projections, but redemption, expiry, reservations, tiers, referrals, refunds, and campaign caps would each need multi-wallet transaction semantics and could double spend during partial rollout.
3. **Transfer every secondary wallet into a canonical wallet.** Balanced ledger transfers can preserve totals, but exact lot expiry, active reservations, coupon ambiguity, later unlink allocation, and retroactive tier/campaign semantics require a separate migration product rather than an identity claim.
4. **Require a separate fresh signed proof per store, retain one stable canonical customer, and only canonicalize a secondary customer with no wallet state.** Immutable revisions retain the source identity/customer/connection/workspace proof; protected current projections keep existing readers and workers compatible; unlink restores only the source projection and never moves historical value.

## Decision

1. One active Supabase Auth subject may hold multiple independently verified store links. Each store requires its own fresh five-minute WooCommerce HMAC claim; a prior proof, email, name, address, domain, organization membership, Auth metadata, or browser-supplied tenant/customer key grants nothing.
2. Cross-workspace canonicalization occurs only inside an active `explicit-workspace-allowlist` programme group and only when both source workspaces are exact members of its latest reconciled policy.
3. A stable canonical customer is selected from the earliest already verified group link, except that an existing sole wallet owner wins. If more than one candidate owns a wallet, or the proposed secondary customer owns any wallet in the group, the shared link fails closed. This slice never merges, copies, transfers, or hides existing value.
4. `customer_user_links` retains an immutable `source_customer_id`. Its current `customer_id` and the claimed `customer_identities.customer_id` become protected canonical projections so existing customer reads, reward commands, referrals, notifications, privacy handling, and worker resolution continue using one customer and wallet.
5. Every accepted shared link or unlink appends one immutable version plus exact membership rows containing the source user link, source identity, source customer, connection, workspace, and canonical customer. The stable link-set ID and canonical customer never change.
6. Projection-changing triggers require a matching transaction-local authorization row written by a private command. Direct DML, partial updates, stale versions, cross-tenant references, and projection changes without exact immutable evidence fail closed.
7. Link-set writes serialize on organization, programme group, and Auth subject. Customer ownership also serializes on the source customer. Proof replay returns its original claim decision and creates no second version.
8. Customer unlink accepts only a public account-link selector, idempotency key, and correlation ID. PostgreSQL derives the Auth subject and all tenant/customer/channel authority. Only a non-canonical secondary link can be removed while another member remains; the exact source identity is restored and the source Auth link is revoked.
9. Ledger transactions, entries, lots, reservations, tiers, programme versions, commerce events, and WooCommerce commands are never changed by link or unlink. Value earned while linked remains attributed to its immutable commerce event and canonical wallet. Relinking after separate secondary wallet creation is rejected for migration review.
10. Raw tables have RLS enabled and all browser/runtime/worker table grants revoked. Authenticated access is through bounded minimized read/unlink functions; the signed claim remains server-runtime-only.

## Consequences

- Existing single-store customers remain unchanged and existing V1/V2 readers remain compatible.
- A customer can deliberately connect several eligible stores and see/use the same canonical wallet through each active account link.
- A secondary store with existing wallet state is not silently merged. M12 migration can later provide an explicit traceable value-consolidation workflow.
- Unlink is intentionally asymmetric: the canonical account cannot be removed while secondary links depend on it. This prevents an audited access action from orphaning shared value.
- The immutable source/customer/identity membership supports later privacy export and support review without exposing it through general browser table access.

## Security and integrity effects

- Verification is possession of two independent signed store sessions plus one live Auth session, not attribute coincidence.
- Transaction-scoped locks plus unique proof fences prevent competing claims from choosing different canonical customers.
- Current projections are reconstructable from immutable revisions and protected against unreviewed mutation.
- Exact connection/workspace membership is revalidated at write and read boundaries, so later topology drift fails closed.

## Operations and rollback

Deploy tables, triggers, readers, and the modified private claim disabled first. Reconcile every current link to its immutable source customer before enabling multi-store canonicalization. Canary with two value-free Starfiniti test identities, then exercise award, release, read, redemption, unlink, relink, privacy export, duplicate proof, concurrent proof, worker outage, and topology rollback.

Rollback disables new shared links/unlinks and retains the last canonical projection and all immutable evidence. A verified value-free secondary identity may be restored only through the audited unlink command. If any wallet state exists outside the canonical customer, stop and route it through a future M12 migration; never repair by editing ledger history.
