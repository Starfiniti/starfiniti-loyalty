# ADR-0041: Bounded aggregate exports and isolated report scheduling

- Status: Accepted
- Date: 2026-08-25
- Scope: M10-S04 analytics exports and scheduled reports

## Context

M10 now exposes four independently degradable, tenant-authorized reports. Merchants also need a portable evidence bundle and recurring report generation without turning long analytical reads into interactive requests, disclosing row-level identities, or allowing reporting load and provider failure to delay loyalty value processing or WooCommerce checkout.

The existing hosted customer export proves a stronger delivery pattern than a reusable URL: PostgreSQL stores only a capability digest, binds it to one verified Auth subject and Supabase session, consumes it atomically once, and records payload-free immutable audit evidence. The reporting worker image already supports isolated process modes and database-owned leases.

Current [Supabase private Storage documentation](https://supabase.com/docs/guides/storage/serving/downloads) says signed URLs remain valid until expiry and are not invalidated by Auth signing-key rotation. That is useful for large objects, but weaker than the one-use, session-bound requirement for the bounded aggregate bundle. [Supabase Cron](https://supabase.com/docs/guides/cron) uses `pg_cron` and is suitable for database jobs, but making each tenant schedule a database cron job would add extension/configuration state and an operational scheduler separate from the application's existing worker leases. PostgreSQL documents `SKIP LOCKED` as appropriate for queue-like multi-consumer access, while warning that it is not a general-purpose consistent read; this exactly fits job claiming and not report calculation.

## Alternatives

1. **Private Supabase Storage objects with signed URLs.** This scales to large files and uses Storage RLS, but a bearer URL can be replayed until expiry, current signed URLs are not immediately revocable, self-hosting adds object-service recovery/configuration, and CDN/object lifecycle becomes another privacy boundary.
2. **Synchronous browser-request export generation.** This avoids persisted output, but holds an interactive request across four analytical statements, has poor retry semantics, and makes schedule execution depend on a browser session.
3. **`pg_cron` job per merchant schedule.** This keeps scheduling in PostgreSQL, but creates mutable extension-owned job configuration per tenant and couples tenant lifecycle to database administration.
4. **One bounded private aggregate payload plus an isolated leased reporting worker.** One database schedule table materializes idempotent jobs; a reporting-only worker claims and generates them; a five-minute capability bound to the live Auth subject/session consumes a ready payload once.

## Decision

1. Export only the four privacy-minimized aggregate M10 reports. The export contains no customer, wallet, order, assignment, contact, coupon, device, network, payment, fraud, or ledger-row identity.
2. The versioned JSON bundle includes Dictionary V4 in full plus the exact report/dictionary versions, request instant, range, IANA timezone, generated instant, source SHA-256, and all four strict report contracts. This makes formulas, sources, exclusions, currency policy, and causal classification portable with the values.
3. Limit requests to 7, 30, or 90 days and JSON V1. A later CSV or larger export is a new version with explicit size, quoting, spreadsheet-injection, and streaming evidence.
4. Only live owner, admin, analyst, or auditor memberships may create manual exports. Only owners and admins may create, pause, or resume recurring schedules. PostgreSQL derives organization, workspace, programme group, actor, and entitlement from public selectors and Auth state.
5. Recurring schedules support daily, weekly, and monthly cadence in one validated IANA timezone, one local hour, and either a weekday or day 1–28. PostgreSQL calculates the next instant from local calendar intent; DST changes never duplicate a schedule occurrence because `(schedule, due_at)` is unique.
6. A separate `reporting-worker` process materializes due schedules, claims jobs with bounded `FOR UPDATE SKIP LOCKED` leases, and generates one private aggregate source payload. It has no loyalty-value primitive, connector, notification-provider, or checkout responsibility.
7. Request creation and schedule materialization are idempotent. Retries use bounded attempt counts, lease expiry, deterministic failure codes, and the same job identity. A retry never creates another report effect for the same manual key or schedule due instant.
8. Generated private payloads expire after 24 hours. PostgreSQL stores the source payload, its digest, and byte count only in a private RLS-enabled table with no browser or worker table grants. Expiry cleanup removes payload content while retaining immutable minimized request/transition/audit facts.
9. Download authorization stores only a SHA-256 capability digest, expires after five minutes, and binds to one export, verified Auth subject, and Supabase session. Consumption rechecks live role, organization/scope, ready state, payload expiry, and capability under row locks, then marks the export consumed once.
10. The trusted Next.js route validates every raw report through existing strict contracts, adds the exact Dictionary V4, validates the final bundle, records the delivered SHA-256/byte count in the same transaction, and returns a private no-store attachment. A validation failure rolls back capability consumption.
11. Schedule pause is the suppression boundary. Paused schedules create no new jobs; already generated ready exports remain downloadable until expiry. Entitlement or membership revocation prevents generation and download without deleting evidence.
12. No report job writes ledger, wallet, lot, reward, coupon, commerce, campaign effect, notification event, or provider-delivery state. Reporting process failure can make only reporting stale or unavailable.

## Consequences

- Aggregate exports have strong one-use delivery and exact portable definitions without an object-store dependency.
- PostgreSQL temporarily stores bounded privacy-minimized JSON. The 90-day/four-report cap, byte accounting, 24-hour expiry, cleanup, and load tests are therefore mandatory.
- A failed browser download after successful database consumption requires a new export. This preserves strict one-use semantics instead of silently allowing bearer replay.
- The first scheduled delivery appears in the analytics command center rather than sending email. Email attachments or links require a new provider-neutral reporting event, current recipient authority, purpose policy, and delivery-specific threat review.
- JSON V1 is machine-readable and lossless for exact integers. CSV remains intentionally unavailable until a safe normalized row contract exists.

## Security and integrity effects

- Public selectors and schedule parameters never grant scope. Live PostgreSQL membership, role, active-resource linkage, and entitlement checks are authoritative at request, generation, authorization, and consumption.
- The reporting worker can execute only narrow schedule materialization, claim, generation, failure, and cleanup functions. It cannot select payload tables or call customer/value commands.
- Payload and authorization tables have RLS enabled, no policies, empty-search-path security-definer functions, exact role grants, bounded statements, and adversarial replay/revocation/cross-tenant tests.
- Source and delivered digests are evidence, not authentication credentials. Raw capabilities, session tokens, payloads, and report contents never enter logs or audit metadata.

## Operations and rollback

Deploy additive schema and the reporting-capable image with the reporting service stopped. Enable the process only after clean replay, exact-head CI, payload-size observation, and a Starfiniti-only disabled/canary review. Observe pending age, attempts, lease recovery, generation latency, byte size, expiry cleanup, and download outcomes independently of the value worker.

Rollback stops only `reporting-worker` and hides export/schedule controls. Pending jobs and schedules remain inert; ready outputs expire normally; immutable request and transition evidence remains. Do not delete or rewrite ledger, source analytics, schedules, or audit history. A forward fix may resume unexpired jobs after rechecking live authority.
