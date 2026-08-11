# Privacy Model

## Principles

Collect the minimum data required to identify commerce facts, operate loyalty value, support customers, prevent abuse, and meet contractual/legal retention. Separate contact attributes from immutable value evidence. Never claim legal compliance without independent legal review.

## Processing inventory

| Data                       | Purpose                               | Source                 | Access                                                          | Retention design                                                                     |
| -------------------------- | ------------------------------------- | ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Auth user/session          | Merchant/customer authentication      | Supabase Auth          | Subject, authorized operators, Auth admins                      | Auth/session policy; revoke promptly                                                 |
| Channel customer/order IDs | Attribution, identity, reconciliation | WooCommerce            | Tenant operators, restricted workers, subject view where needed | While connection/value evidence is retained; pseudonymize on deletion where possible |
| Email/phone/name           | Claim/notification/support            | WooCommerce or subject | Masked, role-limited                                            | Minimized; delete/pseudonymize per request/policy                                    |
| Order monetary/line facts  | Award/refund explanation              | WooCommerce            | Authorized tenant operators/workers                             | Contractual/accounting retention; avoid unrelated product detail                     |
| Ledger/programme versions  | Value authority and audit             | Starfiniti             | Tenant roles, subject redacted history, auditors                | Immutable retention required for explanation                                         |
| Raw webhook body           | Verification/debug/replay             | WooCommerce            | Restricted worker/break-glass only                              | Short configured window, then delete after canonicalization/reconciliation           |
| Audit/support events       | Accountability/security               | Starfiniti             | Tenant owners/auditors, restricted support                      | Security/legal retention; no secrets or unnecessary PII                              |
| Exports/backups            | Portability/recovery                  | Starfiniti             | Explicitly authorized operators                                 | Time-limited exports; backup lifecycle and cryptographic deletion policy             |

## Data minimization

- Canonical events keep only loyalty-relevant fields and stable source references.
- Logs store IDs/reason codes/correlation IDs, not bodies, tokens, signatures, email, phone, addresses, coupon plaintext, or free-form secrets.
- Support views mask contact data and never expose credentials or raw webhook bodies by default.
- Analytics uses aggregates/pseudonymous IDs; no marketing enrichment is inferred from loyalty operations.

## Subject rights workflow

1. Verify subject authority through Auth and/or a channel-bound proof.
2. Resolve all organization/channel identities without email-only matching.
3. Create an idempotent, audited privacy case.
4. Export or delete/pseudonymize permitted attributes across Auth, application, Storage, queues, and connector records.
5. Retain a minimal tombstone where needed to prevent re-import/abuse and preserve ledger explanation.
6. Propagate connector action or record a documented inability/retry.
7. Produce a completion report without leaking another subject or tenant.

## Deletion semantics

Deletion never edits ledger entries or programme versions. Customer/contact rows are detached or pseudonymized, identity links revoked, notification consent removed, exports destroyed, and raw payloads purged. Wallet value handling follows the merchant/legal policy; it is never silently discarded because a contact record was deleted.

## Consent and notifications

Operational loyalty notices and marketing messages are distinct purposes. Consent records capture organization, subject, channel, purpose, source, policy version, time, and withdrawal. Downstream providers are processors/transport adapters, not consent authority.

## Exports

Exports require explicit scope, recent authorization for sensitive data, tenant/subject filtering, encrypted storage, short expiry, single-purpose download, and audit. Background export jobs use the same RLS/authorization rules and never create a cross-tenant aggregate artifact unless the caller is explicitly a platform auditor.

## Backups and erasure

Backups are encrypted and access-controlled. Individual row deletion is not rewritten through immutable backup history; restored environments immediately replay deletion/pseudonymization records before serving traffic. Retention expiration and key destruction bound residual backup copies.

## Privacy verification

Tests cover cross-tenant export, wrong-subject identity, repeat deletion, deleted user with live token, raw-body retention, log redaction, backup restore plus deletion replay, consent withdrawal, and connector outage during a privacy case.
