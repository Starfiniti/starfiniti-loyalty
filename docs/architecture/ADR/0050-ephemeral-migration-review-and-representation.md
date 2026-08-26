# ADR-0050: Ephemeral migration review and exact source re-presentation

- Status: Accepted
- Date: 2026-08-26
- Scope: M12-S05 merchant upload, identity mapping, authoritative dry run, application, history, reconciliation, and correction

## Context

A merchant must see the identities in their own export to choose whether each source row creates a customer or targets an existing public customer. Persisting the upload, canonical document, email, or arbitrary error value would create a new personal-data store and turn operational history into a privacy liability. Sending an approved canonical document back in a hidden browser field would avoid server storage but would make the browser a durable value carrier and expand tampering and logging risk.

The existing M12-S01 receipt stores only hashes, exact totals, counts, and bounded issue counts. M12-S02 applies value only when the exact canonical document and resolutions are re-presented and independently match that receipt. The merchant workflow must preserve those boundaries while remaining usable for files up to the reviewed 5 MiB limit.

## Alternatives

1. **Persist uploads and mappings as resumable drafts.** This improves refresh recovery, but creates a high-risk source-identity store, retention/deletion workflow, encryption boundary, and broader operator access.
2. **Return a signed canonical document to the browser and apply it later.** This avoids database persistence, but makes the browser carry all canonical identities and values and complicates safe error reporting and stale review.
3. **Keep one file in browser memory and re-present it for each server action.** Parse with the pinned adapter on every step, return source rows only for the transient authenticated review, persist only the minimized receipt, and re-present the same file and mappings for application.

## Decision

1. The merchant workflow has three explicit steps: transient inspection, authoritative receipt creation, and exact receipt-bound application.
2. Inspection requires a live owner/admin membership, active migration entitlement, active programme group, and published programme version before source bytes reach the adapter. It returns the identities and values from the merchant's current upload only to that authenticated action response. It performs no database write.
3. The browser keeps the selected `File` in component memory. It does not place raw bytes, canonical rows, identities, or values in URLs, cookies, local storage, analytics, logs, or hidden durable state.
4. Identity decisions are versioned mappings containing only opaque `sourceRowId`, `decision`, and an optional existing customer public ID. Email never creates an automatic match. The server fingerprints the identity from the newly parsed source and constructs the strict resolution; the browser never supplies an identity hash or resolution basis.
5. The authoritative dry run re-parses the source with the exact registry-selected adapter, reconstructs mappings, computes the canonical hashes and result, and records only the existing minimized receipt. Invalid identity resolution may be recorded for audit and remediation but can never be applied.
6. Application requires explicit confirmation and re-presents the file, mappings, public store selector when required, receipt public ID, and approval digest. The server re-parses and recomputes first. PostgreSQL then independently verifies the canonical document, resolutions, tenant, actor, programme, customers, wallets, entitlement, and approval before appending value.
7. File uploads are capped at 5 MiB by the adapter. Next.js Server Actions allow 6 MiB solely for multipart overhead. This does not change the parser limit.
8. `get_migration_workspace_v1` is the only merchant history projection. It accepts one public programme-group selector, derives tenant membership, and returns exact bigint totals as text, public IDs, opaque row references, counts, reconciliation, and correction evidence. It never returns source identities or uploaded bytes.
9. Owners/admins can read and start new imports when entitled. Auditors can read. Owners/admins retain compensating-correction access after entitlement disable because correction protects value already created. Operators, analysts, anonymous callers, revoked members, and other tenants receive no workspace row. Disabling the entitlement preserves read access, batches, customer value, and correction evidence.
10. Corrections append the existing compensating ledger state machine. They never edit or delete a batch, receipt, lot, transaction, or source-row fence.

## Security and operational effects

- A source file exists only in the browser-selected file object and the request-local Server Action buffer. Errors are fixed messages or fixed enum/count evidence; arbitrary parser exceptions and source values are not logged or persisted.
- Refreshing or losing the selected file requires the merchant to choose it again and repeat the dry run. This deliberate friction avoids a new sensitive staging store.
- Existing-customer mapping uses an explicit customer public ID selected by a privileged merchant. A matching email is display context only and never authorization.
- WooCommerce identity creation requires an active public connection selector; PostgreSQL validates the connection and identity at application time.
- The history projection checks batch customer totals against source items, item totals against the batch, lot totals against both buckets, and opening transaction/credit-entry counts against lots. Any mismatch is visible as `difference`; it is never rounded or hidden.

## Rollout and rollback

Deploy the additive projection and UI with migration writes disabled. Validate migration replay and pgTAP first, then enable one pilot tenant and run a small reversible batch. Rollback disables the migration entitlement or removes the route/actions. Existing receipts, batches, ledger value, pending releases, history, and compensating corrections remain readable and operational. No rollback deletes uploaded data because no upload is retained.
