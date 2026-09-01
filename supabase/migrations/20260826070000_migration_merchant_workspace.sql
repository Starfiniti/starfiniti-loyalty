-- M12-S05 minimized merchant migration workspace. The projection exposes only
-- public selectors, opaque source-row references, exact text totals, and
-- immutable reconciliation evidence. It never returns uploaded source bytes or
-- canonical identity values and remains readable after the migration
-- entitlement is disabled.

create or replace function loyalty.get_migration_workspace_v1(
  target_programme_group_public_id uuid,
  target_limit integer default 20
)
returns table (workspace jsonb)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  selected record;
  entitlement_enabled boolean := false;
begin
  if actor_user_id is null or target_programme_group_public_id is null
    or target_limit not between 1 and 50 then
    raise exception using errcode = '22023',
      message = 'invalid migration workspace request';
  end if;

  select programme_group.organization_id,
    programme_group.id as programme_group_id,
    programme_group.public_id as programme_group_public_id,
    membership.role
  into selected
  from loyalty.programme_groups as programme_group
  join loyalty.organizations as organization
    on organization.id = programme_group.organization_id
   and organization.status = 'active'
  join loyalty.organization_memberships as membership
    on membership.organization_id = programme_group.organization_id
   and membership.user_id = actor_user_id
   and membership.revoked_at is null
   and membership.role in ('owner', 'admin', 'auditor')
  where programme_group.public_id = target_programme_group_public_id
    and programme_group.status = 'active';
  if not found then return; end if;

  select entitlement.enabled into entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    selected.organization_id, 'migration',
    'programme-group:' || selected.programme_group_public_id::text,
    statement_timestamp()
  ) as entitlement;

  return query
  select jsonb_build_object(
    'schemaVersion', '1',
    'programmeGroupId', selected.programme_group_public_id,
    'membershipRole', selected.role,
    'entitlementEnabled', coalesce(entitlement_enabled, false),
    'canConfigure', selected.role in ('owner', 'admin')
      and coalesce(entitlement_enabled, false),
    'canCorrect', selected.role in ('owner', 'admin'),
    'dryRuns', coalesce((
      select jsonb_agg(item.document order by item.created_at desc, item.id desc)
      from (
        select dry_run.created_at, dry_run.id, jsonb_build_object(
          'publicId', dry_run.public_id,
          'status', dry_run.status,
          'sourceSystem', dry_run.source_system,
          'sourceExportSha256', encode(dry_run.source_export_sha256, 'hex'),
          'canonicalDocumentSha256',
            encode(dry_run.canonical_document_sha256, 'hex'),
          'engineSha256', encode(dry_run.engine_sha256, 'hex'),
          'approvalSha256', encode(dry_run.approval_sha256, 'hex'),
          'rowCount', dry_run.row_count,
          'matchedCount', dry_run.matched_count,
          'createCount', dry_run.create_count,
          'unresolvedCount', dry_run.unresolved_count,
          'availablePoints', dry_run.available_points::text,
          'pendingPoints', dry_run.pending_points::text,
          'issueCounts', dry_run.issue_counts,
          'applicationBatchId', application.public_id,
          'createdAt', dry_run.created_at
        ) as document
        from loyalty.migration_dry_runs as dry_run
        left join loyalty.migration_import_batches as application
          on application.organization_id = dry_run.organization_id
         and application.dry_run_id = dry_run.id
        where dry_run.organization_id = selected.organization_id
          and dry_run.programme_group_id = selected.programme_group_id
        order by dry_run.created_at desc, dry_run.id desc
        limit target_limit
      ) as item
    ), '[]'::jsonb),
    'batches', coalesce((
      select jsonb_agg(item.document order by item.created_at desc, item.id desc)
      from (
        select batch.created_at, batch.id, jsonb_build_object(
          'publicId', batch.public_id,
          'dryRunId', dry_run.public_id,
          'sourceSystem', batch.source_system,
          'customerCount', batch.customer_count,
          'createdCustomerCount', batch.created_customer_count,
          'availablePoints', batch.available_points::text,
          'pendingPoints', batch.pending_points::text,
          'createdAt', batch.created_at,
          'reconciliation', jsonb_build_object(
            'status', case when
              item_evidence.item_count = batch.customer_count
              and item_evidence.item_available_points = batch.available_points
              and item_evidence.item_pending_points = batch.pending_points
              and lot_evidence.lot_points =
                batch.available_points + batch.pending_points
              and lot_evidence.opening_transaction_count = lot_evidence.lot_count
              and lot_evidence.opening_credit_entry_count = lot_evidence.lot_count
              then 'reconciled' else 'difference' end,
            'itemCount', item_evidence.item_count,
            'itemAvailablePoints', item_evidence.item_available_points::text,
            'itemPendingPoints', item_evidence.item_pending_points::text,
            'lotCount', lot_evidence.lot_count,
            'lotPoints', lot_evidence.lot_points::text,
            'openingTransactionCount', lot_evidence.opening_transaction_count,
            'openingCreditEntryCount', lot_evidence.opening_credit_entry_count,
            'pendingReleaseCount', lot_evidence.pending_release_count,
            'releasedPendingPoints', lot_evidence.released_pending_points::text,
            'correctedPoints', coalesce(correction.corrected_points, 0)::text
          ),
          'correction', case when correction.public_id is null then null
            else jsonb_build_object(
              'publicId', correction.public_id,
              'reason', correction.reason,
              'correctedPoints', correction.corrected_points::text,
              'createdAt', correction.created_at
            ) end,
          'items', coalesce((
            select jsonb_agg(source_item.document
              order by source_item.source_row_ref, source_item.id)
            from (
              select import_item.source_row_ref, import_item.id,
                jsonb_build_object(
                  'publicId', import_item.public_id,
                  'sourceRowRef', import_item.source_row_ref,
                  'customerId', customer.public_id,
                  'customerReference', customer.display_reference,
                  'resolutionBasis', import_item.resolution_basis,
                  'createdCustomer', import_item.created_customer,
                  'availablePoints', import_item.available_points::text,
                  'pendingPoints', import_item.pending_points::text,
                  'lotCount', coalesce(item_lots.lot_count, 0),
                  'lotPoints', coalesce(item_lots.lot_points, 0)::text,
                  'releasedPendingPoints',
                    coalesce(item_lots.released_pending_points, 0)::text
                ) as document
              from loyalty.migration_import_items as import_item
              join loyalty.customers as customer
                on customer.organization_id = import_item.organization_id
               and customer.id = import_item.customer_id
              left join lateral (
                select count(*)::integer as lot_count,
                  coalesce(sum(import_lot.points), 0)::bigint as lot_points,
                  coalesce(sum(import_lot.points) filter (
                    where release.id is not null
                  ), 0)::bigint as released_pending_points
                from loyalty.migration_import_lots as import_lot
                left join loyalty.migration_pending_lot_releases as release
                  on release.organization_id = import_lot.organization_id
                 and release.import_lot_id = import_lot.id
                where import_lot.organization_id = import_item.organization_id
                  and import_lot.item_id = import_item.id
              ) as item_lots on true
              where import_item.organization_id = batch.organization_id
                and import_item.batch_id = batch.id
              order by import_item.source_row_ref, import_item.id
              limit 50
            ) as source_item
          ), '[]'::jsonb),
          'itemsTruncated', batch.customer_count > 50
        ) as document
        from loyalty.migration_import_batches as batch
        join loyalty.migration_dry_runs as dry_run
          on dry_run.organization_id = batch.organization_id
         and dry_run.id = batch.dry_run_id
        left join lateral (
          select count(*)::integer as item_count,
            coalesce(sum(import_item.available_points), 0)::bigint
              as item_available_points,
            coalesce(sum(import_item.pending_points), 0)::bigint
              as item_pending_points
          from loyalty.migration_import_items as import_item
          where import_item.organization_id = batch.organization_id
            and import_item.batch_id = batch.id
        ) as item_evidence on true
        left join lateral (
          select
            count(import_lot.id)::integer as lot_count,
            coalesce(sum(import_lot.points), 0)::bigint as lot_points,
            count(distinct import_lot.opening_transaction_id)::integer
              as opening_transaction_count,
            count(distinct import_lot.opening_credit_entry_id)::integer
              as opening_credit_entry_count,
            count(release.id)::integer as pending_release_count,
            coalesce(sum(import_lot.points) filter (
              where release.id is not null
            ), 0)::bigint as released_pending_points
          from loyalty.migration_import_items as import_item
          join loyalty.migration_import_lots as import_lot
            on import_lot.organization_id = import_item.organization_id
           and import_lot.item_id = import_item.id
          left join loyalty.migration_pending_lot_releases as release
            on release.organization_id = import_lot.organization_id
           and release.import_lot_id = import_lot.id
          where import_item.organization_id = batch.organization_id
            and import_item.batch_id = batch.id
        ) as lot_evidence on true
        left join loyalty.migration_correction_batches as correction
          on correction.organization_id = batch.organization_id
         and correction.original_batch_id = batch.id
        where batch.organization_id = selected.organization_id
          and batch.programme_group_id = selected.programme_group_id
        order by batch.created_at desc, batch.id desc
        limit target_limit
      ) as item
    ), '[]'::jsonb)
  );
end;
$$;

alter function loyalty.get_migration_workspace_v1(uuid, integer)
  owner to loyalty_owner;
revoke all on function loyalty.get_migration_workspace_v1(uuid, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_migration_workspace_v1(uuid, integer)
  to authenticated;

comment on function loyalty.get_migration_workspace_v1(uuid, integer) is
  'Returns owner/admin/auditor migration receipts and exact reconciliation evidence without source identities or uploaded bytes; write capability derives from live role and entitlement.';
