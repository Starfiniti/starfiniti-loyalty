# M11-S05 webhook operations browser QA — 2026-08-26

## Scope

- The production `MerchantShell` and `WebhookEndpointsPanel` rendered from a temporary public local fixture against a production Next.js build. The fixture was removed and the production application rebuilt afterwards; no test route, Auth bypass, fixture data, or navigation exception remains.
- Chromium rendered 1440 × 1000 desktop and 390 × 844 mobile viewports. Mobile verification emulated `prefers-reduced-motion: reduce`.
- Reviewed states included active delivery, a disabled endpoint with outstanding and failed work, a retired endpoint with its destination and key hint removed, owner lifecycle controls, the expanded create/rotation reviews, and a fail-closed analyst view.
- Fixture values were synthetic and contained no production credential, contact, customer, tenant authority, payload, or worker identity.

## Passed evidence

- The active, disabled, and retired cards expose state, subscriptions, database rate limit, completed/outstanding/attention counts, last attempt, safe error code, and an explicit next action without exposing fingerprints, delivery bodies, contact data, or worker references.
- Owners can reach create, disable, rotate, and retire reviews. Creation and rotation require explicit confirmation, and the final actions are 40 pixels high. Confirmation inputs render at 16 × 16 pixels with their full label.
- Analysts receive the exact owner/admin note and zero create, rotate, disable, or retire controls.
- Retirement renders `Live destination removed` and `Current key ···removed`; historical counts remain visible.
- Desktop light and dark themes preserve readable hierarchy and lifecycle status. Cards stack to one 306-pixel column at 390 pixels with zero document or main-scroller horizontal overflow.
- Mobile navigation opens and closes, reports the analyst role, and keeps the current Notifications item visible.
- Reduced-motion media matched. English was the only rendered language and no language switcher was present.
- Every non-hidden input and button had an accessible label, element IDs were unique, and keyboard focus produced a visible 3-pixel ring.
- Browser console warnings/errors and page exceptions: `0`.

The exact one-time secret is intentionally absent from captures. Contract/action tests prove the server returns it only on the successful create/rotate response; the UI implements the bounded copy-once notice, and PostgreSQL retains only the SHA-256 fingerprint plus six-character hint.

## Captures

- [Desktop endpoint lifecycle and health](m11-webhooks-desktop-2026-08-26.png)
- [Desktop dark create review](m11-webhooks-desktop-dark-create-2026-08-26.png)
- [Mobile rotation, degraded state, and retirement](m11-webhooks-mobile-actions-2026-08-26.png)
- [Mobile fail-closed analyst view](m11-webhooks-mobile-readonly-2026-08-26.png)

Result: pass. Production endpoint creation, isolated worker secret mount, activation, live delivery/replay, rotation, retirement, reconciliation, rollback, and observation remain disabled Starfiniti canary gates under M11-S06.
