# Privacy Model

## Principles

Collect the minimum data required to identify commerce facts, operate loyalty value, support customers, prevent abuse, and meet contractual/legal retention. Separate contact attributes from immutable value evidence. Never claim legal compliance without independent legal review.

## Processing inventory

| Data                            | Purpose                                      | Source                                   | Access                                                          | Retention design                                                                                                           |
| ------------------------------- | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Auth user/session               | Merchant/customer authentication             | Supabase Auth                            | Subject, authorized operators, Auth admins                      | Auth/session policy; revoke promptly                                                                                       |
| Channel customer/order IDs      | Attribution, identity, reconciliation        | WooCommerce                              | Tenant operators, restricted workers, subject view where needed | While connection/value evidence is retained; pseudonymize on deletion where possible                                       |
| Email/phone/name                | Claim/notification/support                   | WooCommerce or subject                   | Masked, role-limited                                            | Minimized; delete/pseudonymize per request/policy                                                                          |
| Order monetary/line facts       | Award/refund explanation                     | WooCommerce                              | Authorized tenant operators/workers                             | Contractual/accounting retention; avoid unrelated product detail                                                           |
| Ledger/programme versions       | Value authority and audit                    | Starfiniti                               | Tenant roles, subject redacted history, auditors                | Immutable retention required for explanation                                                                               |
| Raw webhook body                | Verification/debug/replay                    | WooCommerce                              | Restricted worker/break-glass only                              | Short configured window, then delete after canonicalization/reconciliation                                                 |
| Audit/support events            | Accountability/security                      | Starfiniti                               | Tenant owners/auditors, restricted support                      | Security/legal retention; no secrets or unnecessary PII                                                                    |
| Referral risk fingerprints      | Abuse equality/velocity review               | WooCommerce keyed HMAC                   | Restricted worker only                                          | Configured 1–720 hour purpose window, then bounded purge                                                                   |
| Referral qualification evidence | Paid-status/minimum/first-order decision     | Canonical order plus immutable programme | Restricted worker; later minimized tenant/customer projection   | Immutable decision/hash evidence; excludes raw identity and risk fingerprints                                              |
| Exports/backups                 | Portability/recovery and aggregate reporting | Starfiniti                               | Reauthenticated subject or role-authorized tenant analysts      | Direct non-persisted subject export; aggregate reports expire within 24 hours; backup lifecycle and cryptographic deletion |

## Data minimization

- Canonical events keep only loyalty-relevant fields and stable source references.
- Logs store IDs/reason codes/correlation IDs, not bodies, tokens, signatures, email, phone, addresses, coupon plaintext, or free-form secrets.
- Support views mask contact data and never expose credentials or raw webhook bodies by default.
- Analytics uses aggregates/pseudonymous IDs; no marketing enrichment is inferred from loyalty operations.
- Referral events send an opaque advocate UUID plus purpose-separated HMAC fingerprints. Raw IP, forwarding headers, user agent, payment tokens, shipping address, email, and name remain in WooCommerce. Only allowlisted decision reason codes survive fingerprint expiry.
- Referral qualification stores canonical event/programme references, exact eligible spend, a first-paid-order boolean, decision, and cooling times. It does not copy customer contact data, raw order payloads, or risk fingerprints into the qualification fact.

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

M08-S01 implements this authority without storing contact data. Transactional loyalty email defaults enabled until withdrawal or trusted suppression; marketing defaults disabled until explicit consent. Every decision is append-only, the current projection is private, customer commands derive their subject from an active Auth link, and provider/system suppression cannot be cleared by a customer session. Trusted unsuppression returns marketing to unsubscribed rather than restoring an earlier grant. Customer pseudonymization or closure suppresses both purposes. Strict notification events reject arbitrary properties and therefore cannot contain email, phone, name, address, coupon plaintext, raw provider responses, secrets, tokens, or ledger metadata.

M08-S02 resolves one verified email ephemerally from the active Supabase Auth link only after a worker owns a bounded lease and PostgreSQL rechecks current consent, suppression, customer state, deployment mode, and entitlement. The address and rendered subject/body are returned for that one authorization but never written to event, delivery, template, or attempt tables. Attempts retain only allowlisted outcome/error codes, response class/code, worker reference, and timestamps. SMTP debug logging is disabled, message templates cannot load files or URLs, and the password is accepted only from a container-mounted absolute file. A crash or transport failure after authorization is treated as ambiguous manual review, never a blind retry.

M08-S03 applies the same late-authority boundary to managed Klaviyo delivery. One tenant connection and API-key fingerprint must match before verified contact is resolved. Profile synchronization sends only verified email plus an opaque customer UUID; event synchronization uses the immutable event UUID and strict provider-neutral properties. Provider suppression can tighten local eligibility but never grant consent. Contacts, API keys, provider bodies, and error text are not retained in delivery evidence or logs.

M08-S04 generic webhooks never resolve or send email, phone, name, address, coupon plaintext, ledger metadata, or arbitrary properties. PostgreSQL produces one strict minimized event projection only after rechecking the current endpoint subscription, deployment entitlement, purpose consent, suppression, customer/link state, and lease. Delivery payloads exist transiently in worker memory and on the wire; immutable attempts retain only public IDs, bounded canonical outcome codes, response class/code, byte count, secret fingerprint, and timestamps. Endpoint HMAC secrets exist only in mounted files, signatures are never persisted or logged, and production destinations must resolve exclusively to public socket-pinned addresses.

M08-S05 tenant template publication accepts only bounded English subject and plain text with exact event-specific tokens. PostgreSQL generates escaped HTML and stores immutable content versions, but audit and health projections never copy the authored content. A test command accepts no address and may resolve only the requesting owner/admin's current verified Auth email after a last-moment role, entitlement, lease, and template-integrity check. The merchant health projection contains aggregate consent/provider counts and canonical issue references only; it excludes customer/contact identity, event payload, rendered content, destination, secret or fingerprint, signature, worker/lease identity, raw response, and arbitrary provider text.

## Exports

The implemented hosted customer export requires password reauthentication and issues a random five-minute, one-use capability bound to the verified Auth subject and Supabase session. PostgreSQL stores only its SHA-256 digest, accepts no caller-supplied tenant/customer selectors, rechecks every active link and tenant boundary at consumption, and records immutable per-customer audit evidence without the document content. The versioned JSON is returned directly over TLS with private/no-store, attachment, no-sniff, no-referrer, sandboxed content-security, and no-index controls; it is never persisted in PostgreSQL, object storage, logs, or a background queue.

M10 aggregate analytics exports are separate from subject portability. Owner, admin, analyst, and auditor requests accept only active public tenant scope and bounded period/timezone selectors; PostgreSQL re-derives live membership and entitlement at request, generation, authorization, and consumption. The private source contains four strict aggregate reports and Dictionary V4, never row-level identity. It expires within 24 hours. A random five-minute capability is stored only as a hash, bound to the current Auth subject and Supabase session, carried in an exact-path HttpOnly SameSite-strict cookie, and atomically consumed once. The trusted runtime validates the final contract, records only SHA-256/byte evidence, deletes the payload, and returns private/no-store attachment bytes. Worker errors and audit metadata retain canonical codes and counts, not source content or tokens. Cross-tenant aggregate artifacts remain prohibited.

## Backups and erasure

Backups are encrypted and access-controlled. Individual row deletion is not rewritten through immutable backup history; restored environments immediately replay deletion/pseudonymization records before serving traffic. Retention expiration and key destruction bound residual backup copies.

## Privacy verification

Implemented tests cover exact grants/search paths, tenant and lease binding, PII-free deletion payloads, immutable private cases and peppers, repeat and pre-import deletion, live-link revocation, channel/customer pseudonymization, raw/canonical event scrubbing, import suppression, and zero ledger effects. Forty-three hosted-export assertions additionally cover private privileges, hashed one-use authorization, subject/session binding, expiry, tenant minimization, complete exact ledger output, active-scope failure, immutable payload-free audit, and no value effects. Backup restore plus deletion replay, consent withdrawal, and prolonged connector outage remain required before their respective release gates close.
