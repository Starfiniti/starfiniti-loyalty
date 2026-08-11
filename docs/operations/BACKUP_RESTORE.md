# Backup and Restore

## Objectives

- Authoritative PostgreSQL RPO: 5 minutes or better.
- Declared full-service RTO: 60 minutes or better for the initial single-site scenario.
- No production readiness claim until a clean-room restore meets both with recorded evidence.

VM snapshots are useful recovery aids but are not authoritative database backups.

## Backup set

1. PostgreSQL physical base backup plus continuous WAL archive for PITR.
2. Daily logical schema/global-object export for portability and inspection.
3. Supabase/application pinned-version manifests and non-secret configuration.
4. Encrypted secret escrow with separate access controls and rotation records.
5. Storage-object backend backup/versioning when Storage becomes authoritative for user artifacts.
6. WooCommerce plugin configuration/outbox recovery documentation; WordPress remains the commerce source for source facts.

## Storage and security

- Backups are client-side encrypted before leaving the VM and copied to an off-host provider/failure domain.
- Encryption keys are separate from backup objects and production runtime credentials.
- Retention uses immutable/object-lock controls where available: suggested 48 hourly, 35 daily, 12 monthly copies pending capacity/legal review.
- Backup identities are write-only where practical; restore identities are separate and audited.
- Completion, WAL lag, object age, size anomaly, verification checksum, and retention deletion are monitored.
- Backup contents are Restricted/Confidential and never attached to CI or support tickets.

## Restore drill

1. Open an incident/drill record with target recovery time and point.
2. Provision an isolated Linux VM/network with no production egress or user traffic.
3. Restore pinned Supabase/Postgres configuration and required secret escrow.
4. Restore the latest valid base backup and replay WAL to the target point.
5. Run database integrity, migration history, RLS/grant, ledger balance/projection, queue, Auth, and object-reference checks.
6. Deploy the matching application image and run smoke/reconciliation tests.
7. Replay privacy deletions/pseudonymizations newer than any restored copy before exposure.
8. Record actual RPO/RTO, data gaps, checksums, versions, failures, and corrective actions.
9. Destroy or reclassify the isolated restored environment through an audited procedure.

## Verification queries/gates

- PostgreSQL accepts connections and required extensions/schemas match expected versions.
- Migration list exactly matches the release manifest.
- No candidate/exposed tenant table lacks RLS or expected grants.
- Every ledger transaction balances to zero; stored projections equal rebuilt projections.
- Inbox/outbox uniqueness constraints and pending/dead-letter counts are consistent.
- Auth login, authorized tenant read, forbidden cross-tenant read, webhook receipt, and one idempotent value command pass.

## Failure handling

- A failed or stale backup is a paging alert, not a warning-only dashboard item.
- If WAL continuity breaks, start a new verified base backup and record the expanded RPO exposure.
- If restore evidence fails, production changes that increase authoritative data volume stop until corrected.
- Suspected backup-key compromise triggers key rotation, new base backup, object access review, and incident response.

## Owner inputs deferred to deployment

The off-host provider/bucket, encryption-key custodian, retention/legal policy, and Proxmox storage layout require real infrastructure access. Templates and tests can be completed without those values; fabricated production destinations are forbidden.
