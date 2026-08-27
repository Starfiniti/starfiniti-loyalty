# Identity Model

## Separate identity domains

Starfiniti keeps four concepts separate:

1. **Auth user:** a Supabase Auth principal that can sign in.
2. **Organization membership:** live authorization to operate a tenant and role.
3. **Customer:** an organization-scoped loyalty subject/wallet owner.
4. **Channel identity:** an immutable commerce-system identity such as `(connection_id, Woo customer ID)` or a scoped guest-order identity.

Email, phone, name, cookie, IP address, and shipping/billing details are attributes and matching evidence. None is merge authority.

## Merchant authorization

- Supabase Auth establishes the user ID and session.
- Starfiniti workforce users enter through Authentik as the Supabase custom OIDC provider `custom:starfiniti-sso`. Supabase remains the session broker, so the OIDC-linked Auth UUID is still the `auth.uid()` subject used by RLS.
- Authentik application entitlement (`app-loyalty-admin`) permits central sign-in but grants no organization or role. OIDC groups, email domain, and user metadata are never tenant authority.
- Organization roles come from `organization_memberships`, not `raw_user_meta_data`, email domain, or client-supplied organization ID.
- The first production membership is created only after the Auth principal exists and a real Authentik SSO session has linked and verified its custom identity, through the deployment-only `loyalty_private.bootstrap_initial_tenant` boundary. Its direct PostgreSQL operator must assume `loyalty_owner`; browser, authenticated Data API, dashboard runtime, and worker roles have no execute privilege.
- RLS helpers query live membership rows. Sensitive writes recheck membership inside the database command.
- Revocation sets `revoked_at` immediately. Because access tokens may remain valid after Auth deletion/revocation, live membership checks fail closed; high-risk operations may additionally validate the Auth session ID.
- `app_metadata` may carry non-authoritative UI hints, never the sole tenant authorization decision.
- MFA and recent-auth requirements apply to owner changes, credential rotation, exports, support grants, and manual value adjustments once those flows are implemented.

Workforce and customer authentication remain distinct presentation and lifecycle paths. Customer password login and purpose-bound customer-export password reauthentication are not replaced by workforce SSO.

## Customer identity keys

- Registered WooCommerce customers: unique `(commerce_connection_id, external_customer_id)`.
- Guest orders: unique `(commerce_connection_id, external_order_id, guest_subject_version)` until verified claim.
- Auth-linked customers: unique active `(organization_id, auth_user_id)` in `customer_user_links`, subject to explicit programme-group sharing policy.
- Cross-brand sharing exists only inside an approved programme group and never crosses organizations.

An external ID can be re-used only if the source platform contract proves reuse semantics and the original identity is explicitly retired; otherwise conflicts quarantine for review.

## Referral identity

A referral advocate code is a random UUID identifier bound to one existing customer and programme group. It is not authentication, does not reveal an external customer ID, and never grants tenant, wallet, reward, or ledger authority. Customers obtain it only through an active Auth/customer link; PostgreSQL derives the store origin and programme scope and returns a URL containing only `stf_ref=<opaque UUID>`.

The referred friend is resolved from the signed canonical WooCommerce order's exact connection-scoped registered or guest identity. Email, domain, cookie, IP address, device, payment, and shipping similarity never merge customers or select an advocate. A database lock and unique first-attribution constraint make the first eligible advocate authoritative for that friend/programme group; later codes become immutable conflict evidence rather than rewriting identity.

## Channel claim flow

```mermaid
sequenceDiagram
  participant G as Guest/customer
  participant H as Hosted loyalty UI
  participant A as Supabase Auth
  participant DB as Loyalty database
  participant WC as WooCommerce

  G->>WC: Open Loyalty rewards while signed in
  WC-->>G: Five-minute signed customer capability
  G->>H: Open capability and authenticate
  H->>A: Verify existing Auth session
  H->>G: Show exact store and request confirmation
  G->>H: Explicitly confirm link
  H->>DB: Consume hashed nonce/proof and create decision
  DB->>DB: Check no conflicting active link; append audit; link identity
  DB-->>H: Claimed wallet/customer result
```

Email possession alone is insufficient. The implemented registered-customer proof binds the WooCommerce connection UUID, numeric customer ID, issue time, nonce, and active key version into a purpose-specific HMAC. It expires after five minutes, is consumed only by explicit POST confirmation under a verified Supabase Auth session, and stores SHA-256 evidence rather than the raw nonce/signature. Guest-order claim remains a later extension and must use a separately purpose-bound proof.

Locale is presentation and navigation state only. WooCommerce may append the allowlisted active locale to the claim URL, but locale is excluded from the signed identity message and never participates in connection, customer, nonce, Auth-subject, or tenant resolution. Hosted authentication may recover locale only from an explicit supported value or a validated local continuation path.

## Link, merge, and split rules

- Deterministic same-channel IDs link automatically only within the same connection and organization.
- A verified claim may link an Auth user to an existing customer.
- Potential duplicates detected by email/phone/name are suggestions for authorized review, never automatic merges.
- A merge is an append-only `identity_link_decision` that selects a surviving customer and reassigns future resolution. Wallet/ledger history remains attributable; it is not rewritten.
- An incorrect merge is repaired by a split/compensating link decision and, if value moved, compensating ledger transactions.
- Every manual decision records actor, reason, evidence class, affected organization/programme group, and correlation ID.

## Customer self-access

Hosted customer views use `customer_user_links` plus programme-group policy. They may read their own wallet, tier, expiry, reward, and redacted history. They cannot see internal fraud flags, other channel identities, merchant notes, raw events, or unrelated brands.

Customer-facing commands such as reward redemption accept only the linked account public ID, published reward code, and request UUID after explicit confirmation. PostgreSQL derives the Auth-linked customer and all tenant, connector, programme-version, and wallet authority, then atomically writes the reservation, immutable ledger effect, transition, and private connector command. A browser never supplies an external customer ID, receives a coupon code, or writes ledger rows.

## Support access

Support cannot impersonate by changing a session claim. A support grant requires target organization, reason, scope, approver, short expiry, and revocation. Each use is visible in the tenant audit log. Restricted secrets, raw webhook bodies, and contact values remain masked unless a separately authorized break-glass procedure applies.

## Privacy lifecycle

- Customer contact data is minimized and separately classed from immutable value/audit evidence.
- Export requires verified subject/merchant authority and produces a time-limited audited artifact.
- Deletion removes or pseudonymizes contact attributes and revokes identity links where law/policy allows.
- Ledger entries, transaction IDs, tax/accounting evidence, and fraud-prevention tombstones retain pseudonymous references when deletion would destroy integrity.
- Commerce deletion events are idempotent and do not silently delete balances.

WooCommerce-originated deletion is implemented as a signed minimized event. Its leased worker effect replaces the reusable registered channel ID with an opaque erasure reference, revokes active hosted links, clears display data, scrubs raw/canonical event identifiers, and retains a private connection-keyed suppression tombstone. Wallet and ledger authority remain unchanged and attributable to the pseudonymous customer.

## Identity threat controls

| Threat                              | Control                                                           |
| ----------------------------------- | ----------------------------------------------------------------- |
| Email takeover links another wallet | Channel-bound verified claim; no email-only merge                 |
| Forged organization ID              | Live membership/RLS and composite tenant foreign keys             |
| Stale JWT after membership removal  | Database membership check on every tenant path                    |
| Cross-brand leakage                 | Programme-group allowlist plus organization boundary              |
| Support impersonation               | Expiring scoped grant, approval, visible audit                    |
| Account-link race                   | Unique active links, row locks, idempotent claim token            |
| Erasure destroys ledger explanation | Pseudonymize identity attributes; retain immutable value evidence |

Phase 9 tests prove channel/tenant isolation, one-use replay conflict, active-link races, revocation, no-email authority, minimized customer self-access, and absent Auth subject all fail closed. Redemption tests additionally prove live-link derivation, exact retry identity, changed-request conflict, native-config bounds, insufficient-balance rollback, private outbox visibility, immutable ledger attribution, and coupon/result minimization.
