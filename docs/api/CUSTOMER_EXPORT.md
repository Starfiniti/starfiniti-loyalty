# Customer Data Export

## Endpoint

`GET /account/loyalty/export?lang=<locale>` returns one versioned JSON attachment for the currently authenticated customer. It is a hosted Next.js route, not a public Supabase Data API endpoint.

The route accepts no organization, customer, connection, programme, or wallet selector. Unsupported locale input falls back to English and changes presentation only, never authorization or document scope.

## Authorization flow

1. The authenticated member selects **Download my data**.
2. `/login?reauth=customer-export` requires the member's email and password again through Supabase Auth.
3. The server verifies the refreshed claims and extracts the Auth subject and Supabase session ID.
4. A trusted runtime function issues a random UUID capability with a five-minute expiry. PostgreSQL retains only its SHA-256 digest and subject/session binding.
5. An HttpOnly, SameSite=Strict cookie scoped to `/account/loyalty/export` carries the capability to the download route.
6. One private transaction locks and consumes the capability, rechecks active subject/session/link/tenant scope, builds the document, and appends payload-free immutable audit evidence.

The capability is invalid after one successful use, after expiry, for a different Auth subject or session, or when any included link, customer, workspace, connection, or programme scope is no longer active. A response-contract failure rolls back both consumption and audit so a malformed partial document cannot commit.

## Document contract

The root `schemaVersion` is currently `starfiniti.customer-data-export.v1`. The document contains:

- generation and export IDs;
- the verified Auth subject ID and email;
- every active linked account with workspace, store/channel, customer, and programme-group identity;
- wallet IDs and exact text-form pending, available, reserved, spent, expired, and reversed balances;
- tier memberships and effective intervals;
- active reward reservations; and
- the complete wallet-side immutable ledger-entry history with transaction identity, kind, bucket, exact text-form points, effective time, and creation time.

It excludes signing references, coupon plaintext, webhook bodies, raw commerce payloads, request/idempotency hashes, actor IDs, private metadata, decision explanations, and unrelated customer identities.

## Response handling

Successful responses use `application/json; charset=utf-8` and an attachment filename derived from the UTC generation date. They set `Cache-Control: private, no-store`, `Vary: Cookie`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Robots-Tag: noindex, nofollow`, and `Content-Security-Policy: default-src 'none'; sandbox`.

The JSON content is assembled inside the authorized transaction and returned directly over TLS. It is not written to PostgreSQL, Supabase Storage, a background queue, application logs, or browser-readable storage. Audit rows identify the export, included customer, subject/session, timestamp, and schema version only.
