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
| Referral risk fingerprints | Abuse equality/velocity review        | WooCommerce keyed HMAC | Restricted worker only                                          | Configured 1–720 hour purpose window, then bounded purge                             |
| Exports/backups            | Portability/recovery                  | Starfiniti             | Reauthenticated subject or explicitly authorized operators      | Direct non-persisted subject export; backup lifecycle and cryptographic deletion     |

## Data minimization

- Canonical events keep only loyalty-relevant fields and stable source references.
- Logs store IDs/reason codes/correlation IDs, not bodies, tokens, signatures, email, phone, addresses, coupon plaintext, or free-form secrets.
- Support views mask contact data and never expose credentials or raw webhook bodies by default.
- Analytics uses aggregates/pseudonymous IDs; no marketing enrichment is inferred from loyalty operations.
- Referral events send an opaque advocate UUID plus purpose-separated HMAC fingerprints. Raw IP, forwarding headers, user agent, payment tokens, shipping address, email, and name remain in WooCommerce. Only allowlisted decision reason codes survive fingerprint expiry.

## Subject rights workflow

1. Verify subject authority through Auth and/or a channel-bound proof.
2. Resolve all organization/channel identities without email-only matching.
3. Create an idempotent, audited privacy case.
4. Export or delete/pseudonymize permitted attributes across Auth, application, Storage, queues, and connector records.
5. Retain a minimal tombstone where needed to prevent re-import/abuse and preserve ledger explanation.
6. Propagate connector action or record a documented inability/retry.
7. Produce a completion report without leaking another subject or tenant.

The implemented WooCommerce-originated erasure path covers steps 2–6 for a verified signed channel event. WordPress writes one opaque deduplicated local event with only the numeric channel subject. The worker requires the event lease and exact tenant/connection/payload, creates an immutable private HMAC tombstone under a separate 256-bit per-connection pepper, revokes hosted access, pseudonymizes the source identity/customer display state, and scrubs the raw and canonical deletion event to an opaque case ID. A tombstone created before identity import also suppresses later resolution.

## Deletion semantics

Deletion never edits ledger entries or programme versions. Customer/contact rows are detached or pseudonymized, identity links revoked, notification consent removed, persisted exports destroyed, and raw payloads purged. Wallet value handling follows the merchant/legal policy; it is never silently discarded because a contact record was deleted. The current WooCommerce flow preserves the wallet and ledger, removes the reusable channel ID, and blocks its automatic re-import; notification-consent workflows remain a separate release slice. The hosted customer export has no stored content to destroy.

## Consent and notifications

Operational loyalty notices and marketing messages are distinct purposes. Consent records capture organization, subject, channel, purpose, source, policy version, time, and withdrawal. Downstream providers are processors/transport adapters, not consent authority.

## Exports

The implemented hosted customer export requires password reauthentication and issues a random five-minute, one-use capability bound to the verified Auth subject and Supabase session. PostgreSQL stores only its SHA-256 digest, accepts no caller-supplied tenant/customer selectors, rechecks every active link and tenant boundary at consumption, and records immutable per-customer audit evidence without the document content. The versioned JSON is returned directly over TLS with private/no-store, attachment, no-sniff, no-referrer, sandboxed content-security, and no-index controls; it is never persisted in PostgreSQL, object storage, logs, or a background queue.

Any future background or operator export must use the same tenant/subject authorization rules, encrypted storage, short expiry, single-purpose download, and immutable audit. It must never create a cross-tenant aggregate artifact unless the caller is explicitly authorized as a platform auditor.

## Backups and erasure

Backups are encrypted and access-controlled. Individual row deletion is not rewritten through immutable backup history; restored environments immediately replay deletion/pseudonymization records before serving traffic. Retention expiration and key destruction bound residual backup copies.

## Privacy verification

Implemented tests cover exact grants/search paths, tenant and lease binding, PII-free deletion payloads, immutable private cases and peppers, repeat and pre-import deletion, live-link revocation, channel/customer pseudonymization, raw/canonical event scrubbing, import suppression, and zero ledger effects. Forty-three hosted-export assertions additionally cover private privileges, hashed one-use authorization, subject/session binding, expiry, tenant minimization, complete exact ledger output, active-scope failure, immutable payload-free audit, and no value effects. Backup restore plus deletion replay, consent withdrawal, and prolonged connector outage remain required before their respective release gates close.
