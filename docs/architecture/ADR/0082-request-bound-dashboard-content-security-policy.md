# ADR-0082: Request-bound dashboard Content Security Policy

- Status: Accepted
- Date: 2026-08-28
- Upstream review: official Next.js 16 Content Security Policy and response-header guidance

The implementation remains undeployed until the normal reviewed release and canary gates pass.

## Context

The exact M15 disposable DAST report at application head `e6c80ef35f37952410176969616e671260af9279` contained two Medium response-hardening findings across four document responses: no Content Security Policy and no anti-clickjacking header. These are real deployable-container defects. They are not false positives and cannot be accepted merely because the production edge may add headers.

The dashboard is a Next.js 16 App Router application. It already renders dynamically because the root layout reads request headers. It contains no third-party browser script, frame, media, or cross-origin browser API dependency. A small number of bounded React style attributes remain necessary for exact progress widths and merchant-authored theme values.

Official Next.js guidance supports a fresh nonce in Proxy, forwarding both `x-nonce` and `Content-Security-Policy` on the request so framework scripts receive the nonce, and returning the same policy on the response. Next.js also supports fixed response headers through `next.config.ts`.

## Decision

1. Generate one unpredictable base64 nonce per matched document request in `proxy.ts`. Reject malformed or unbounded nonce values before constructing a policy.
2. Forward the exact nonce and policy to rendering and return that policy on the same response. Preserve the same forwarded headers when Supabase refreshes cookies and recreates the response.
3. Permit executable script only through `'self'`, the request nonce, and `'strict-dynamic'`. Production does not permit `unsafe-inline` or `unsafe-eval` script. Development alone permits `unsafe-eval` for the React debugger.
4. Restrict browser connections, fonts, media, manifests, and forms to the same origin. Deny objects, frames, framing ancestors, and non-self base URIs. Permit only local/blob/data images and local/blob workers.
5. Keep `style-src` nonce-bound for style elements. Permit `unsafe-inline` only in the narrower `style-src-attr` directive for existing bounded React style attributes; it grants no script execution.
6. Set `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a deny-by-default browser feature policy on every response. API responses additionally receive `default-src 'none'`, no base/form/framing authority, and `sandbox`.
7. Keep TLS and HSTS at the reviewed edge. The application container must remain testable over an internal HTTP-only network, and browsers already address production through the HTTPS edge; therefore the application CSP does not upgrade internal requests.
8. Make the Security workflow inspect the isolated container's real `/login` response before ZAP. It requires a fresh nonce-shaped strict script policy, `frame-ancestors 'none'`, DENY framing, MIME sniff prevention, and no `unsafe-inline` script.

## Alternatives

### Accept edge-only headers

Rejected. Direct container scans, alternate self-hosted edges, and recovery deployments would retain the defect, while the deployable artifact would not enforce its own security boundary.

### Use one static policy with `unsafe-inline` script

Rejected. It silences a missing-header finding without materially protecting against injected script and weakens the evidence boundary.

### Enable experimental build-time SRI

Deferred. Next.js documents the App Router implementation as experimental and webpack-only, while this repository builds with Turbopack. A request nonce uses stable supported behavior and matches the application's existing dynamic rendering.

## Security and integrity effects

- A CSP regression can block application hydration, styles, or future third-party browser integrations. Every such integration must receive an explicit reviewed directive change and browser/DAST evidence.
- Per-request nonces prevent shared static HTML caching. The affected application pages were already dynamically rendered; the public loyalty cache remains a server/CDN response cache and receives a fresh policy when rendered.
- The deployable container no longer depends on an unspecified proxy for baseline framing, MIME, referrer, feature, and script controls.
- The residual inline-style allowance is narrow and visible. Removing the remaining dynamic style attributes can supersede it later.

## Operations

The isolated Security workflow starts the production image with disposable configuration on an internal no-port network. Before ZAP, it reads the real `/login` response and fails unless the CSP contains a fresh 48-character base64 nonce, strict script delegation, and denied framing; it separately requires `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`, and rejects `unsafe-inline` script. Focused Vitest coverage verifies policy construction and per-request nonce variation. Production-build browser smoke verifies framework nonce propagation, normal hydration, zero initial console/resource failure, and same-origin connection enforcement.

Operators must verify the application and edge policies together during the disabled deployment and canary. An edge may add HSTS or tighten a directive but must not remove the application CSP, framing, MIME, referrer, or permissions controls. Scanner findings remain open until exact report hashes and dispositions are recorded.

## Migration and rollback

If the policy blocks a required flow after release, disable the affected tenant canary and deploy the prior reviewed immutable dashboard image. Do not weaken the current policy in place, omit the header, or add a wildcard as an emergency bypass. Preserve browser and DAST evidence, then forward-fix the smallest exact directive with regression coverage before re-enabling the canary. Database, ledger, WooCommerce checkout, ingestion, refunds, and reconciliation are unaffected by this response-header rollback.
