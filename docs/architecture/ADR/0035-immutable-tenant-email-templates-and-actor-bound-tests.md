# ADR-0035: Immutable tenant email templates and actor-bound tests

- Status: Accepted
- Date: 2026-08-25
- Module: M08-S05

## Context

M08-S02 ships six immutable system-owned English SMTP templates and pins every accepted delivery to one exact template row. Merchants still need to customize those messages, verify a message through the real transport, and inspect consent, suppression, retry, dead-letter, and manual-review health. This must not make the dashboard an SMTP client, copy customer contact into operational rows, rewrite content for an accepted delivery, or expose private provider queues.

Current official guidance was reviewed on 2026-08-25. Supabase recommends invoker rights by default and requires an empty `search_path`, fully qualified objects, and explicit execute grants when a `security definer` function is necessary. Its API security guidance also notes that RLS does not protect functions, so exposed commands need explicit grants and internal authorization. Next.js treats Server Actions as public endpoints that must repeat authorization, and recommends server-side schema validation and pending/error states for forms.

## Decision

1. Keep the six system template versions immutable and global. Add tenant-owned immutable English template versions plus a private current binding per organization and event type. Publishing creates and activates a new version atomically; it never updates prior content. Existing accepted deliveries retain their exact system or tenant template reference.
2. Owner/admin publication is an Auth-derived, idempotent PostgreSQL command. It independently validates entitlement, event type, bounds, allowed tokens, exact request hash, live role, and immutable audit evidence. No browser-supplied organization, actor, version number, template hash, or active binding is authoritative.
3. Merchant-authored content consists of a bounded subject and plain-text body. PostgreSQL deterministically escapes that body into the HTML alternative. Arbitrary HTML, scripts, styles, URLs, remote assets, files, and template-engine expressions are not authorable. Only the event type's allowlisted `{{token}}` names can be stored.
4. A test send uses a separate private SMTP test-delivery queue. The command accepts only a public workspace selector, event type, and idempotency/correlation identifiers. PostgreSQL derives the organization from the workspace and live membership. At dispatch authorization it rechecks self-hosted notification entitlement and the requester's live owner/admin membership, resolves only that requester's currently verified Supabase Auth email, and constructs database-owned sample values. Recipient address and sample customer/value facts are never browser inputs or persisted evidence.
5. The existing isolated SMTP worker processes tests through the same mounted secret, renderer, transport, response bounds, conservative ambiguity policy, and ten-attempt ceiling. A test subject is visibly prefixed. Failure or outage cannot affect normal notification, checkout, ledger, refund, or reconciliation processing.
6. One Auth-derived merchant read command returns only exact active template content/version, allowed tokens, aggregate consent/suppression counts, provider queue totals, and a bounded recent canonical issue list. It excludes contact, customer identity, payload, subject/body render, destination URL, provider identifier/body, secret/signature/fingerprint, worker identifier, and arbitrary error text. Malformed Data API containers fail closed in the server data boundary.
7. Disabling the feature blocks new template publication and test sends while preserving historical versions, active bindings, accepted delivery state, health inspection, consent access, and value operations. Provider workers retain their existing provider-specific rollback behavior.

## Alternatives

### Mutable tenant template rows

Rejected. A mutable row would make an old delivery render different content after retry and erase the explanation for what was accepted or sent.

### Merchant-authored HTML sanitized in the dashboard

Rejected for this slice. Browser sanitization is not an authority boundary, and independently reproducing a complete HTML/CSS/URL sanitizer in PostgreSQL would be fragile. Deterministic escaped text preserves useful customization without executable markup or tracking assets; controlled branded email blocks can be versioned later.

### Synchronous test email from a Next.js Server Action

Rejected. That would place SMTP credentials and network behavior in the dashboard process, couple request latency to a provider, and bypass the database lease/audit/retry boundary.

## Security and integrity effects

- Tenant customization and rollback remain explainable because every version and activation is attributable and old accepted deliveries never drift.
- Test delivery proves the real configured SMTP path without an arbitrary-recipient capability.
- The initial editor intentionally offers safe text customization rather than arbitrary email HTML design. Branding breadth remains a later controlled-template concern.
- Read health is diagnostic, not provider or consent authority; canonical database facts remain authoritative.

## Operations

Deploy the private schema and merchant read surface with template publication and test enqueue disabled by entitlement. Verify publication, active-version pinning, test resolution to the requesting merchant, real local SMTP delivery, canonical health aggregation, and browser accessibility before any tenant activation. Monitor pending/retryable age, dead-letter/manual-review counts, test outcomes, and suppression changes without contact or payload logging.

## Migration and rollback

Use additive private version, binding, test-delivery, attempt, and projection objects. Existing system-template deliveries remain valid and unchanged. Disable template publication and test enqueue, then stop claiming test deliveries. Retain immutable versions, active bindings, audits, test attempts, normal deliveries, and health evidence. Existing system templates remain the fallback for organizations without a tenant binding. No rollback edits or releases loyalty value.

## References

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js forms and Server Actions](https://nextjs.org/docs/app/guides/forms)
- [Next.js authentication and authorization](https://nextjs.org/docs/app/guides/authentication)
