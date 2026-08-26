-- M12-S01 canonical migration dry-run receipts. The application validates raw
-- vendor exports transiently; PostgreSQL retains only fingerprints, counts,
-- totals, and bounded issue counts. This slice is deliberately value-free.

create table loyalty.migration_dry_runs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('valid', 'invalid')),
  source_system text not null check (
    source_system in (
      'generic_csv', 'wployalty', 'yith_points_and_rewards', 'woorewards'
    )
  ),
  source_export_sha256 bytea not null
    check (octet_length(source_export_sha256) = 32),
  canonical_document_sha256 bytea not null
    check (octet_length(canonical_document_sha256) = 32),
  resolution_sha256 bytea not null
    check (octet_length(resolution_sha256) = 32),
  engine_sha256 bytea not null check (octet_length(engine_sha256) = 32),
  approval_sha256 bytea not null check (octet_length(approval_sha256) = 32),
  row_count integer not null check (row_count between 1 and 500),
  matched_count integer not null check (matched_count between 0 and 500),
  create_count integer not null check (create_count between 0 and 500),
  unresolved_count integer not null check (unresolved_count between 0 and 500),
  available_points bigint not null check (available_points >= 0),
  pending_points bigint not null check (pending_points >= 0),
  issue_counts jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  correlation_id uuid not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  unique (organization_id, approval_sha256),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_version_id)
    references loyalty.programme_versions(organization_id, id) on delete restrict,
  check (matched_count + create_count + unresolved_count = row_count),
  check (jsonb_typeof(issue_counts) = 'object'),
  check ((status = 'valid') = (issue_counts = '{}'::jsonb)),
  check (status <> 'valid' or unresolved_count = 0),
  check (
    length(idempotency_key) between 1 and 160
    and idempotency_key = btrim(idempotency_key)
    and idempotency_key !~ '[[:cntrl:]]'
  )
);

create index migration_dry_runs_tenant_history_idx
  on loyalty.migration_dry_runs (organization_id, created_at desc, id desc);
create index migration_dry_runs_programme_status_idx
  on loyalty.migration_dry_runs (
    organization_id, programme_group_id, status, created_at desc, id desc
  );

alter table loyalty.migration_dry_runs owner to loyalty_owner;
alter table loyalty.migration_dry_runs enable row level security;

create policy migration_dry_runs_privileged_select
  on loyalty.migration_dry_runs for select to authenticated
  using ((select loyalty_private.has_organization_role(
    organization_id, array['owner', 'admin', 'auditor']::text[]
  )));

revoke all on loyalty.migration_dry_runs
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.migration_dry_runs to authenticated;

create trigger migration_dry_runs_immutable
before update or delete on loyalty.migration_dry_runs
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty.record_migration_dry_run_v1(
  target_programme_group_public_id uuid,
  target_programme_version_public_id uuid,
  target_status text,
  target_source_system text,
  target_source_export_sha256 text,
  target_canonical_document_sha256 text,
  target_resolution_sha256 text,
  target_engine_sha256 text,
  target_row_count integer,
  target_matched_count integer,
  target_create_count integer,
  target_unresolved_count integer,
  target_available_points bigint,
  target_pending_points bigint,
  target_issue_counts jsonb,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  dry_run_public_id uuid,
  outcome text,
  dry_run_status text,
  approval_sha256 text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_group loyalty.programme_groups%rowtype;
  target_version loyalty.programme_versions%rowtype;
  entitlement_enabled boolean;
  existing_audit loyalty.admin_audit_events%rowtype;
  existing_dry_run loyalty.migration_dry_runs%rowtype;
  created_dry_run loyalty.migration_dry_runs%rowtype;
  request_hash bytea;
  database_approval_sha256 bytea;
  command_time timestamptz := clock_timestamp();
begin
  if actor_user_id is null
    or target_programme_group_public_id is null
    or target_programme_version_public_id is null
    or target_status is null or target_status not in ('valid', 'invalid')
    or target_source_system is null or target_source_system not in (
      'generic_csv', 'wployalty', 'yith_points_and_rewards', 'woorewards'
    )
    or target_source_export_sha256 is null
    or target_source_export_sha256 !~ '^[0-9a-f]{64}$'
    or target_canonical_document_sha256 is null
    or target_canonical_document_sha256 !~ '^[0-9a-f]{64}$'
    or target_resolution_sha256 is null
    or target_resolution_sha256 !~ '^[0-9a-f]{64}$'
    or target_engine_sha256 is null
    or target_engine_sha256 !~ '^[0-9a-f]{64}$'
    or target_row_count is null or target_row_count not between 1 and 500
    or target_matched_count is null
    or target_matched_count not between 0 and 500
    or target_create_count is null or target_create_count not between 0 and 500
    or target_unresolved_count is null
    or target_unresolved_count not between 0 and 500
    or target_matched_count + target_create_count + target_unresolved_count
      <> target_row_count
    or target_available_points is null or target_available_points < 0
    or target_pending_points is null or target_pending_points < 0
    or target_issue_counts is null
    or jsonb_typeof(target_issue_counts) <> 'object'
    or (target_status = 'valid') <> (target_issue_counts = '{}'::jsonb)
    or (target_status = 'valid' and target_unresolved_count <> 0)
    or target_idempotency_key is null
    or target_idempotency_key <> btrim(target_idempotency_key)
    or length(target_idempotency_key) not between 1 and 160
    or target_idempotency_key ~ '[[:cntrl:]]'
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid migration dry-run receipt';
  end if;
  if pg_column_size(target_issue_counts) > 2048
    or (select count(*) from jsonb_object_keys(target_issue_counts)) > 7
    or exists (
      select 1
      from jsonb_each(target_issue_counts) as issue(key, value)
      where issue.key not in (
        'missing_resolution', 'unknown_source_row',
        'identity_fingerprint_mismatch', 'duplicate_source_identity',
        'duplicate_target_customer', 'unresolved_identity',
        'ambiguous_identity'
      )
        or jsonb_typeof(issue.value) <> 'number'
        or issue.value::text !~ '^[1-9][0-9]{0,3}$'
        or (issue.value::text)::integer > 1000
    ) then
    raise exception using errcode = '22023',
      message = 'invalid migration dry-run receipt';
  end if;

  select programme_group.* into target_group
  from loyalty.programme_groups as programme_group
  where programme_group.public_id = target_programme_group_public_id
    and programme_group.status = 'active'
    and loyalty_private.has_organization_role(
      programme_group.organization_id, array['owner', 'admin']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'migration dry run not authorized';
  end if;

  select version.* into target_version
  from loyalty.programme_versions as version
  where version.public_id = target_programme_version_public_id
    and version.organization_id = target_group.organization_id
    and version.programme_group_id = target_group.id
    and version.status = 'published';
  if not found then
    raise exception using errcode = '22023',
      message = 'migration requires a published programme version';
  end if;

  select entitlement.enabled into entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_group.organization_id, 'migration',
    'programme-group:' || target_group.public_id::text, command_time
  ) as entitlement;
  if not coalesce(entitlement_enabled, false) then
    raise exception using errcode = '42501',
      message = 'migration is not enabled for this organization';
  end if;

  request_hash := extensions.digest(convert_to(jsonb_build_object(
    'version', '1',
    'programmeGroupId', target_group.public_id,
    'programmeVersionId', target_version.public_id,
    'status', target_status,
    'sourceSystem', target_source_system,
    'sourceExportSha256', target_source_export_sha256,
    'canonicalDocumentSha256', target_canonical_document_sha256,
    'resolutionSha256', target_resolution_sha256,
    'engineSha256', target_engine_sha256,
    'rowCount', target_row_count,
    'matchedCount', target_matched_count,
    'createCount', target_create_count,
    'unresolvedCount', target_unresolved_count,
    'availablePoints', target_available_points::text,
    'pendingPoints', target_pending_points::text,
    'issueCounts', target_issue_counts
  )::text, 'UTF8'), 'sha256');

  database_approval_sha256 := extensions.digest(convert_to(
    'migration-dry-run-v1|' || target_group.public_id::text || '|' ||
    target_version.public_id::text || '|' || target_engine_sha256 || '|' ||
    encode(request_hash, 'hex'), 'UTF8'
  ), 'sha256');

  perform pg_advisory_xact_lock(hashtextextended(
    'migration-dry-run|' || target_group.organization_id::text || '|' ||
      target_idempotency_key,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'migration-dry-run-content|' || target_group.organization_id::text ||
      '|' || encode(database_approval_sha256, 'hex'),
    0
  ));

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_group.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'migration.dry_run.record'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'migration dry-run idempotency conflict';
    end if;
    return query
    select dry_run.public_id, 'duplicate'::text, dry_run.status,
      encode(dry_run.approval_sha256, 'hex')
    from loyalty.migration_dry_runs as dry_run
    where dry_run.organization_id = target_group.organization_id
      and dry_run.public_id = existing_audit.resource_public_id;
    return;
  end if;

  select dry_run.* into existing_dry_run
  from loyalty.migration_dry_runs as dry_run
  where dry_run.organization_id = target_group.organization_id
    and dry_run.approval_sha256 = database_approval_sha256;

  if found then
    insert into loyalty.admin_audit_events (
      organization_id, actor_user_id, action, resource_type,
      resource_public_id, idempotency_key, request_sha256, correlation_id,
      metadata
    ) values (
      target_group.organization_id, actor_user_id,
      'migration.dry_run.record', 'migration_dry_run',
      existing_dry_run.public_id, target_idempotency_key, request_hash,
      target_correlation_id,
      jsonb_build_object(
        'status', existing_dry_run.status,
        'rowCount', existing_dry_run.row_count,
        'availablePoints', existing_dry_run.available_points::text,
        'pendingPoints', existing_dry_run.pending_points::text,
        'approvalSha256', encode(existing_dry_run.approval_sha256, 'hex'),
        'outcome', 'duplicate'
      )
    );
    return query select existing_dry_run.public_id, 'duplicate'::text,
      existing_dry_run.status,
      encode(existing_dry_run.approval_sha256, 'hex');
    return;
  end if;

  insert into loyalty.migration_dry_runs (
    organization_id, programme_group_id, programme_version_id, actor_user_id,
    status, source_system, source_export_sha256,
    canonical_document_sha256, resolution_sha256, engine_sha256,
    approval_sha256, row_count, matched_count, create_count,
    unresolved_count, available_points, pending_points, issue_counts,
    idempotency_key, correlation_id, request_sha256
  ) values (
    target_group.organization_id, target_group.id, target_version.id,
    actor_user_id, target_status, target_source_system,
    decode(target_source_export_sha256, 'hex'),
    decode(target_canonical_document_sha256, 'hex'),
    decode(target_resolution_sha256, 'hex'),
    decode(target_engine_sha256, 'hex'), database_approval_sha256,
    target_row_count, target_matched_count, target_create_count,
    target_unresolved_count, target_available_points, target_pending_points,
    target_issue_counts, target_idempotency_key, target_correlation_id,
    request_hash
  ) returning * into created_dry_run;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_group.organization_id, actor_user_id,
    'migration.dry_run.record', 'migration_dry_run',
    created_dry_run.public_id, target_idempotency_key, request_hash,
    target_correlation_id,
    jsonb_build_object(
      'status', created_dry_run.status,
      'sourceSystem', created_dry_run.source_system,
      'sourceExportSha256', encode(created_dry_run.source_export_sha256, 'hex'),
      'canonicalDocumentSha256',
        encode(created_dry_run.canonical_document_sha256, 'hex'),
      'resolutionSha256', encode(created_dry_run.resolution_sha256, 'hex'),
      'engineSha256', encode(created_dry_run.engine_sha256, 'hex'),
      'rowCount', created_dry_run.row_count,
      'matchedCount', created_dry_run.matched_count,
      'createCount', created_dry_run.create_count,
      'unresolvedCount', created_dry_run.unresolved_count,
      'availablePoints', created_dry_run.available_points::text,
      'pendingPoints', created_dry_run.pending_points::text,
      'issueCounts', created_dry_run.issue_counts,
      'approvalSha256', encode(created_dry_run.approval_sha256, 'hex'),
      'outcome', 'created'
    )
  );

  return query select created_dry_run.public_id, 'created'::text,
    created_dry_run.status, encode(created_dry_run.approval_sha256, 'hex');
end;
$$;

alter function loyalty.record_migration_dry_run_v1(
  uuid, uuid, text, text, text, text, text, text,
  integer, integer, integer, integer, bigint, bigint, jsonb, text, uuid
) owner to loyalty_owner;

revoke all on function loyalty.record_migration_dry_run_v1(
  uuid, uuid, text, text, text, text, text, text,
  integer, integer, integer, integer, bigint, bigint, jsonb, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.record_migration_dry_run_v1(
  uuid, uuid, text, text, text, text, text, text,
  integer, integer, integer, integer, bigint, bigint, jsonb, text, uuid
) to authenticated;

comment on table loyalty.migration_dry_runs is
  'Immutable value-free migration validation receipts; raw exports, source identities, and row payloads are never retained.';
comment on function loyalty.record_migration_dry_run_v1(
  uuid, uuid, text, text, text, text, text, text,
  integer, integer, integer, integer, bigint, bigint, jsonb, text, uuid
) is
  'Records a minimized content-addressed migration dry run after deriving live tenant, actor, programme, and entitlement authority; it cannot create loyalty value.';
