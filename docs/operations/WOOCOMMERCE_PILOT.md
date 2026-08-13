# Real WooCommerce Pilot Runbook

Last reviewed: 2026-08-13

This runbook closes M01 without risking an arbitrary customer store or weakening checkout independence. `docs/plan/evidence/M01/pilot.yaml` is the machine-validated source of gate state; repository evidence never contains personal data, source order IDs, coupon plaintext, signing material, or credentials.

Official behavior reviewed for this runbook:

- [WooCommerce HPOS compatibility](https://developer.woocommerce.com/docs/features/orders/high-performance-order-storage/recipe-book/)
- [Cart and Checkout extensibility](https://developer.woocommerce.com/docs/block-development/extensible-blocks/cart-and-checkout-blocks/)
- [WooCommerce webhook behavior and logs](https://developer.woocommerce.com/docs/apis/rest-api/v2/webhooks)
- [WooCommerce orders](https://woocommerce.com/document/managing-orders/), [refunds](https://woocommerce.com/document/woocommerce-refunds/), and [coupons](https://woocommerce.com/document/coupon-management/)

The Starfiniti connector uses its own signed durable outbox rather than native WooCommerce webhooks. Native webhook documentation is a comparison boundary: native webhooks disable after repeated failures and retain only bounded logs, so they are not authoritative recovery evidence for this product.

## Store selection and authorization

Two approaches were compared:

1. An existing merchant production store gives the most representative plugins, payment, traffic, and order lifecycle but creates avoidable customer/value risk.
2. A dedicated Starfiniti-controlled WooCommerce store uses real WordPress, WooCommerce, checkout, cron, storage, and networking while allowing controlled products, payments, customers, outages, and restoration.

Prefer option 2 for the first gate. An existing merchant store is acceptable only with explicit merchant authorization, an isolated test product/customer/payment method, a current restorable backup, and written maintenance/abort scope. SSH reachability alone is never approval.

## Preconditions

- Record change owner, store origin, authorization, window, abort contact, plugin/WordPress/WooCommerce/PHP versions, HPOS state, classic/Blocks checkout state, other checkout/coupon/cache/security plugins, timezone/currency, payment mode, and store backup reference in the restricted change record.
- Use a non-production payment method or manual/test payment. Never make a real customer charge for this drill.
- Verify a current store restore point and local outbox/plugin configuration backup. Do not log its contents.
- Verify production dashboard/login health, unsigned-route rejection, all app/Supabase containers, worker stability, WAL archive, base backup, off-host database archive, signing-pool ownership, and available pool capacity.
- Confirm production database baseline aggregates and all queue states. If any unexplained value already exists, stop and reconcile before provisioning.
- Use the released WooCommerce ZIP and checksum matching the deployed application commit. Do not install a working-tree plugin on the pilot.

## Provision and publish

1. Sign in through Authentik and publish a controlled English programme with an explicitly short but valid release/expiry policy suitable for the approved window, one fixed native reward, and no unsupported percentage cap.
2. In Operations, create the first WooCommerce connection once and copy the one-result setup package directly into the approved store. Do not persist the package in tickets, screenshots, shell history, or repository evidence.
3. Install/activate the checksum-verified plugin, import the package, and verify encrypted local key storage, Action Scheduler, queue diagnostics, HPOS declaration, My Account surface, and zero render-time hub calls.
4. Create one dedicated test customer through the store, open the locally signed five-minute claim link, authenticate, and explicitly confirm the account link. Email matching is not a linkage method.

## Controlled value sequence

Use one restricted correlation record to map sensitive source identifiers to public/minimized evidence. Perform each step only after its predecessor reconciles:

1. Complete one eligible order and prove one local delivery, one accepted inbox row, one canonical event, one evaluation, one immutable balanced award transaction, and the expected pending balance/explanation.
2. Prove the pending award releases once at the policy boundary and creates the expected expiring FIFO lot.
3. Redeem one fixed reward; prove atomic reservation, private command, exactly one native coupon, issued transition, and unchanged secrecy boundary.
4. Apply the native coupon to a controlled order and prove one captured reservation/spend effect and correct WooCommerce usage state.
5. Partially refund the earning order by line item, then complete the full refund. Prove cumulative original-attribution reversal, exact available/pending/negative behavior, and no rewritten transaction.
6. Expire only pilot points under the approved short policy or repeat the expiry portion in an isolated clock-controlled environment. Never alter production wall clock or backdate evidence with direct SQL.
7. Request source reconciliation and prove stable re-emission creates no duplicate value.
8. Rotate the connection key with an explicit overlap, verify one signed event and command on the new version, then revoke the old version and prove it fails closed.

## Outage and recovery sequence

- **Hub outage:** stop only the dashboard container during a prepared checkout. Complete checkout, confirm the local outbox retains the event, restore the exact image, drain once, and reconcile. Do not stop the reverse proxy, database, or store.
- **Worker outage:** stop only the worker, complete another checkout, verify checkout latency/success and queued hub work, restore the exact image, allow lease recovery, and reconcile once.
- **Network failure:** block only the store-to-hub destination for a bounded window, verify Action Scheduler retry and local diagnostics, restore the rule, and drain once. Record the exact rule and its removal in the restricted change record.
- **Plugin recovery:** restore the approved store backup/configuration into an isolated copy, verify encrypted key/outbox recovery, and reconcile rather than replaying arbitrary historic hooks.
- **Application/Auth/signing recovery:** restore the first completed encrypted whole-VM archive into an isolated, non-routed VM; verify pinned images, Auth redirect/session issuance, RLS tenant read/cross-tenant denial, every active signing reference, signed event/command, and readiness. Never attach the recovered VM to production addressing.
- **Database recovery:** retain the completed Borg base/WAL proof, then repeat RLS/ledger/queue/Auth/application smoke against the isolated restored database and matching application secrets.

## Reconciliation and abort rules

For every accepted source event compare delivery, canonical event, business-effect fence, evaluation, ledger transaction/entries, wallet/lot projections, reservation transitions, outbox command, native coupon, plugin outbox, and audit evidence. Counts alone are insufficient; the restricted record maps each test correlation while repository evidence stores only minimized pass/fail summaries and checksums.

Abort immediately on duplicate/missing value, imbalance, unexplained coupon, tenant/auth failure, checkout dependency, lost local outbox, ambiguous native outcome followed by point release, secret/PII logging, failed backup, or missing alert. Disable the connection and new pilot value, preserve all evidence, keep refunds/reconciliation available, and compensate only through approved immutable commands.

M01 closes only after all 22 checks in `pilot.yaml` pass, final aggregate and per-correlation reconciliation has zero unexplained difference, the module scores at least 90/100 with every category at least 80%, and the Starfiniti owner accepts the minimized evidence.
