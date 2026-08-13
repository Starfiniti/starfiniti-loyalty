# M03 production rollout — 2026-08-13

## Release and recovery prerequisite

- PR #26 merged the complete M03 vertical slice. Exact-head run `31736396618` passed all seven CI jobs.
- PR #27 versioned the snapshot-safe PostgreSQL backup exporter and retained-base WAL cleanup. Exact-head run `31738022350` passed all seven CI jobs.
- Before migration, production created and validated physical base `base-20260813T194243Z.tar.gz`; a forced WAL switch during a full 11.3 GB export passed, and the next timer-driven encrypted archive completed with status zero.
- Release `v0.1.11` run `31738294379` passed the full release gate and published artifacts from commit `0ced4b666a55d836bd3d4927337fe057a71bb4ba`.

## Database rollout

Migration `20260813200000_programme_v2_earning_rules.sql` had reviewed SHA-256 `287b69776990bee73c2e6fb36ec702360a18708cb2e6deb9f2913cef37a75988`. Production verified that hash, applied the migration and migration-ledger registration in one `ON_ERROR_STOP` transaction, then removed the temporary copy.

Post-deploy checks proved:

- migration `20260813200000:programme_v2_earning_rules` is registered once;
- `loyalty.programme_earning_rules` exists with RLS enabled;
- `programme.v2` resolves `true:tenant_override` for the Starfiniti tenant;
- ledger transaction, wallet, and delivery-inbox counts remain `0,0,0`;
- the WAL archiver reported 698 successful archives and zero failures immediately after migration.
- the next post-migration off-host timer created `loyalty-postgres-20260813T200657Z` with status zero.

## Application rollout and rollback

The release published these immutable images:

- dashboard manifest digest `sha256:f98c4f81cd9c8c8eb5e192245bb0a3005b8838e1097b88390155a50b7efdff4a`;
- worker manifest digest `sha256:24e6959b77f3614df37195f61d3cbd66a5e67eeeb274f3711cb8287395d5dc8c`.

The first guarded environment substitution failed before container replacement because the shell expanded an end-of-line expression. Its error trap restored the previous selectors and both `v0.1.10` containers remained healthy. The corrected literal substitution retained another owner-only environment backup, validated the Compose model, recreated both services, and waited for readiness. Dashboard and worker then reported the exact `0ced4b666a55d836bd3d4927337fe057a71bb4ba` image selectors; dashboard health was healthy and recent application logs contained no error, exception, fatal, or panic entry.

Rollback remains value-preserving: restore the retained environment selector file and run the same Compose readiness command. The additive V2 reader/materialization schema remains in place, while new V2 authoring or source provisioning can be disabled through the existing tenant entitlement.

## Public and authenticated canary

- `https://loyalty.starfiniti.com/api/healthz` returned 200.
- `https://loyalty.starfiniti.com/login` returned 200.
- An unsigned POST to the WooCommerce events endpoint returned 401.
- An existing production owner session opened `/programme/earning-rules`, rendered the Starfiniti tenant Hub shell, seven source templates, source-safe conditions/caps, conflict review, and deterministic simulator.
- The production simulator rendered `EUR 150.00 → 750 points` from the one base purchase rule.
- At 1744 pixels and 390 pixels, document scroll width equalled client width; the mobile navigation control appeared at 390 pixels; no browser warning or error was recorded.

No form was submitted and no programme was published. The existing V1 version has different tier rates, so automatic publication would change live value behavior. The canary deliberately proves gated production authoring and exact simulation while M05 retains ownership of an equivalent Rose/Bloom/Icon migration.
