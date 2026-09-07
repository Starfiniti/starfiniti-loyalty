# Working-store release

Owner direction, 2026-09-07: finish a usable WooCommerce loyalty product without
expanding the enterprise programme. This is the immediate delivery scope;
ENTERPRISE_ROADMAP.md remains the longer-term backlog, not the pilot finish gate.

## Done means demonstrated

- [ ] Deploy a tested application, worker, database migration set, and matching plugin.
- [ ] Sign in through Starfiniti SSO and configure earning, rewards, and VIP.
- [ ] Connect one isolated Starfiniti-controlled WooCommerce store with test products
      and a manual/test payment method. Do not use unrelated customer stores.
- [ ] A linked customer earns points once from a paid order, sees pending and
      available balances, redeems a reward, and uses the resulting native coupon.
- [ ] Partial/full refunds, duplicate events, expiry, and credential rotation behave
      correctly; orders, points, reservations, and coupons reconcile exactly.
- [ ] Checkout works during a hub/worker outage and queued work recovers once.
- [ ] A current backup restores successfully in isolation; rollback is recorded.
- [ ] Merchant and customer flows work at mobile and desktop widths without
      dead-end navigation, misleading controls, or broken auth redirects.

Use existing tests and operational commands. Record actual release SHA, test
results, and limitations here; do not build another score or approval framework.
Existing automated checks remain in force. A failed value, isolation, recovery,
or checkout test must be fixed, not scored away.

## Not blocking this release

Further Stripe billing, SCIM/federation, agency administration, advanced analytics,
multi-currency, migration adapters, and additional governance are deferred.
Existing implementations are preserved; optional services stay disabled until used
and verified. Referrals, campaigns, and communications follow in small usable
releases. Shopify, other languages, and cash-like stored value remain excluded.

The owner is operating solo. Do not require an unavailable independent reviewer
to finish this pilot or call an agent review independent. External penetration
testing and explicit enterprise GA approval remain separate from pilot readiness.
Monthly maintenance and a 30-day enterprise canary are not prerequisites for a
working-store demonstration. This release makes no enterprise GA claim.

## Current evidence

- 2026-09-07: finished the interrupted PR #61 rebase onto main `7458237`, retaining
  the pre-rebase archive branch. Notification controls now await rebased verification.
- Both VMs 970 and 971 are running and accessible by SSH. Production dashboard and
  worker still use image commit `0ced4b666a55d836bd3d4927337fe057a71bb4ba`.
- VM 970 has approximately 28 GB free disk and 3 GB available RAM. An isolated,
  resource-limited pilot store can use this VM; no additional VM is needed.
- VM 971 has approximately 82 GB free disk; the base-backup service reports success.
  This is not proof of an off-host restore or evidence that the entire backup chain
  is healthy. Verify those before applying production migrations.
- Nothing has been deployed or marked pilot-complete by these observations.

### Private store prepared — 2026-09-07

The isolated Docker project `starfiniti-loyalty-pilot` now runs on VM 970 at
loopback port 8088, with dedicated volumes and memory/CPU limits. WordPress 7.1,
WooCommerce 11.0.1, and the candidate plugin (development version 0.0.0) are active.
The home page returns HTTP 200. `pilot-setup.php` creates one EUR 20 virtual test
product idempotently and enables a clearly labelled offline test payment.
The hub is not connected; no loyalty points or real payments have been created.

Files are in `/opt/starfiniti-loyalty-pilot` on VM 970. Credentials remain in its
root-only `secrets` directory. WP-CLI echoed the initial test-admin password during
installation; it was immediately replaced via a private file-backed reset that
does not print the replacement. Do not use interactive WP-CLI password prompts.
The production hub, database, domains, and customers are unchanged.

Rollback: stop only this Compose project with `docker compose -f
/opt/starfiniti-loyalty-pilot/compose.yml stop`. Retain both named volumes and the
secret directory; do not use `down --volumes` as a routine stop operation.

### Verification and current integration issue

Full local `npm run check` passed with 1,010 tests and both builds at `7813f02`.
Exact-head CI `34100760238` passed, including database replay and all four
WooCommerce runtime cells. Security `34100760217` passed all except the historical
OpenSSH compatibility build: Ubuntu removed package `1:9.6p1-3ubuntu13.18` from the
moving archive. This is a fixture reproducibility failure, not a failed loyalty
transaction. The fix uses the [official Ubuntu snapshot service](https://snapshot.ubuntu.com/)
at 20260902T000000Z while retaining signed indexes, package hashes, metadata, and
executable hash checks. Those checks pass on VM 970; its legacy Docker builder
cannot execute the later BuildKit-only COPY flag, so full runtime verification
remains with CI. This does not upgrade or downgrade production SSH.

## Next work

1. Verify and integrate the existing notification correction; take only additional
   fixes needed for the release, not the entire historical stack of open PRs.
2. Prepare the release and isolated store using the existing Docker deployment.
3. Execute the checklist above, fixing demonstrated failures as they occur.
4. Hand over the working URLs, plugin artifact, tested behavior, and a short list
   of genuine remaining owner inputs. Do not substitute repository scores for use.
