-- Phase 9 authenticated merchant programme commands and immutable audit evidence.
-- The Data API exposes only these narrow SECURITY DEFINER wrappers. Actor and
-- tenant authority come from the live Auth request, never caller-supplied IDs.

create table loyalty.admin_audit_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  resource_type text not null,
  resource_public_id uuid not null,
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  correlation_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  check (action ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  check (resource_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  check (length(idempotency_key) between 1 and 255),
  check (jsonb_typeof(metadata) = 'object')
);

create index admin_audit_events_tenant_history_idx
  on loyalty.admin_audit_events (organization_id, created_at desc, id desc);
create index admin_audit_events_resource_idx
  on loyalty.admin_audit_events (
    organization_id, resource_type, resource_public_id, created_at desc
  );

alter table loyalty.admin_audit_events owner to loyalty_owner;

create trigger admin_audit_events_immutable
before update or delete on loyalty.admin_audit_events
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.request_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

alter function loyalty_private.request_user_id() owner to loyalty_owner;
revoke all on function loyalty_private.request_user_id()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create or replace function loyalty.create_programme_draft_command(
  target_programme_public_id uuid,
  target_configuration jsonb,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  resource_public_id uuid,
  outcome text,
  configuration_sha256 text,
  version_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_programme loyalty.programmes%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  configuration_hash bytea;
  created_public_id uuid;
  created_version_number integer;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'programme command not authorized';
  end if;
  if target_configuration is null or jsonb_typeof(target_configuration) <> 'object' then
    raise exception using errcode = '22023', message = 'programme configuration must be an object';
  end if;
  if pg_column_size(target_configuration) > 262144 then
    raise exception using errcode = '22023', message = 'programme configuration is too large';
  end if;
  if target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid programme command identity';
  end if;

  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and programme.status in ('draft', 'active')
    and loyalty_private.has_organization_role(
      programme.organization_id,
      array['owner', 'admin']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'programme command not authorized';
  end if;

  configuration_hash := extensions.digest(
    convert_to(target_configuration::text, 'UTF8'),
    'sha256'
  );
  request_hash := extensions.digest(
    convert_to(
      'programme.draft.create|' || target_programme.public_id::text || '|' ||
      encode(configuration_hash, 'hex'),
      'UTF8'
    ),
    'sha256'
  );

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_programme.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'programme.draft.create'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'programme command idempotency conflict';
    end if;
    return query
    select version.public_id, 'duplicate'::text,
      encode(version.configuration_sha256, 'hex'), version.version_number
    from loyalty.programme_versions as version
    where version.organization_id = target_programme.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;

  select draft.programme_version_public_id, draft.version_number
  into created_public_id, created_version_number
  from loyalty_private.create_programme_draft(
    target_programme.organization_id,
    target_programme.id,
    target_configuration,
    configuration_hash,
    actor_user_id
  ) as draft;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_programme.organization_id, actor_user_id,
    'programme.draft.create', 'programme_version', created_public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'programmePublicId', target_programme.public_id,
      'versionNumber', created_version_number,
      'configurationSha256', encode(configuration_hash, 'hex')
    )
  );

  return query select created_public_id, 'created'::text,
    encode(configuration_hash, 'hex'), created_version_number;
end;
$$;

create or replace function loyalty.publish_programme_version_command(
  target_version_public_id uuid,
  target_expected_configuration_sha256 text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, published_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_programme loyalty.programmes%rowtype;
  target_version loyalty.programme_versions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  publication_time timestamptz;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'programme command not authorized';
  end if;
  if target_expected_configuration_sha256 is null
    or target_expected_configuration_sha256 !~ '^[a-f0-9]{64}$'
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid programme command identity';
  end if;

  select programme.* into target_programme
  from loyalty.programmes as programme
  join loyalty.programme_versions as version
    on version.organization_id = programme.organization_id
    and version.programme_id = programme.id
  where version.public_id = target_version_public_id
    and loyalty_private.has_organization_role(
      programme.organization_id,
      array['owner', 'admin']::text[]
    )
  for update of programme;
  if not found then
    raise exception using errcode = '42501', message = 'programme command not authorized';
  end if;

  select version.* into target_version
  from loyalty.programme_versions as version
  where version.organization_id = target_programme.organization_id
    and version.public_id = target_version_public_id;

  request_hash := extensions.digest(
    convert_to(
      'programme.version.publish|' || target_version.public_id::text || '|' ||
      target_expected_configuration_sha256,
      'UTF8'
    ),
    'sha256'
  );

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_programme.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'programme.version.publish'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'programme command idempotency conflict';
    end if;
    return query
    select version.public_id, 'duplicate'::text, version.published_at
    from loyalty.programme_versions as version
    where version.organization_id = target_programme.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;

  publication_time := clock_timestamp();
  perform loyalty_private.publish_programme_version(
    target_version.public_id,
    decode(target_expected_configuration_sha256, 'hex'),
    actor_user_id,
    publication_time
  );

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_programme.organization_id, actor_user_id,
    'programme.version.publish', 'programme_version', target_version.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'programmePublicId', target_programme.public_id,
      'versionNumber', target_version.version_number,
      'configurationSha256', target_expected_configuration_sha256
    )
  );

  return query select target_version.public_id, 'created'::text, publication_time;
end;
$$;

create or replace function loyalty.schedule_programme_version_command(
  target_version_public_id uuid,
  target_expected_configuration_sha256 text,
  target_scheduled_for timestamptz,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_programme loyalty.programmes%rowtype;
  target_version loyalty.programme_versions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'programme command not authorized';
  end if;
  if target_expected_configuration_sha256 is null
    or target_expected_configuration_sha256 !~ '^[a-f0-9]{64}$'
    or target_scheduled_for is null
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid programme command identity';
  end if;

  select programme.* into target_programme
  from loyalty.programmes as programme
  join loyalty.programme_versions as version
    on version.organization_id = programme.organization_id
    and version.programme_id = programme.id
  where version.public_id = target_version_public_id
    and loyalty_private.has_organization_role(
      programme.organization_id,
      array['owner', 'admin']::text[]
    )
  for update of programme;
  if not found then
    raise exception using errcode = '42501', message = 'programme command not authorized';
  end if;

  select version.* into target_version
  from loyalty.programme_versions as version
  where version.organization_id = target_programme.organization_id
    and version.public_id = target_version_public_id;

  request_hash := extensions.digest(
    convert_to(
      'programme.version.schedule|' || target_version.public_id::text || '|' ||
      target_expected_configuration_sha256 || '|' ||
      extract(epoch from target_scheduled_for)::text,
      'UTF8'
    ),
    'sha256'
  );

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_programme.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'programme.version.schedule'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'programme command idempotency conflict';
    end if;
    return query
    select version.public_id, 'duplicate'::text, version.scheduled_for
    from loyalty.programme_versions as version
    where version.organization_id = target_programme.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;

  perform loyalty_private.schedule_programme_version(
    target_version.public_id,
    decode(target_expected_configuration_sha256, 'hex'),
    actor_user_id,
    target_scheduled_for
  );

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_programme.organization_id, actor_user_id,
    'programme.version.schedule', 'programme_version', target_version.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'programmePublicId', target_programme.public_id,
      'versionNumber', target_version.version_number,
      'configurationSha256', target_expected_configuration_sha256,
      'scheduledFor', target_scheduled_for
    )
  );

  return query select target_version.public_id, 'created'::text, target_scheduled_for;
end;
$$;

alter function loyalty.create_programme_draft_command(uuid, jsonb, text, uuid)
  owner to loyalty_owner;
alter function loyalty.publish_programme_version_command(uuid, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.schedule_programme_version_command(uuid, text, timestamptz, text, uuid)
  owner to loyalty_owner;

revoke all on function loyalty.create_programme_draft_command(uuid, jsonb, text, uuid),
  loyalty.publish_programme_version_command(uuid, text, text, uuid),
  loyalty.schedule_programme_version_command(uuid, text, timestamptz, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.create_programme_draft_command(uuid, jsonb, text, uuid),
  loyalty.publish_programme_version_command(uuid, text, text, uuid),
  loyalty.schedule_programme_version_command(uuid, text, timestamptz, text, uuid)
  to authenticated;

alter table loyalty.admin_audit_events enable row level security;
create policy admin_audit_events_privileged_select
  on loyalty.admin_audit_events
  for select to authenticated
  using (
    (select loyalty_private.has_organization_role(
      organization_id,
      array['owner', 'admin', 'auditor']::text[]
    ))
  );

revoke all on loyalty.admin_audit_events
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.admin_audit_events to authenticated;

comment on table loyalty.admin_audit_events is
  'Immutable, tenant-scoped evidence for authorized merchant administration commands.';
comment on function loyalty.create_programme_draft_command(uuid, jsonb, text, uuid) is
  'Creates one canonical-hash programme draft for a live owner/admin and records immutable audit evidence.';
comment on function loyalty.publish_programme_version_command(uuid, text, text, uuid) is
  'Publishes a matching draft for a live owner/admin and records immutable audit evidence.';
comment on function loyalty.schedule_programme_version_command(uuid, text, timestamptz, text, uuid) is
  'Schedules a matching draft for a live owner/admin and records immutable audit evidence.';
