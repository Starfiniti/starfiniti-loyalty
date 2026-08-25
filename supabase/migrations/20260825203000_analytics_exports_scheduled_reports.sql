-- M10-S04: bounded privacy-minimized analytics exports and recurring report
-- schedules. Reporting runs behind an isolated worker lease and cannot mutate
-- loyalty value, checkout, connector, or notification-provider state.

create table loyalty.analytics_report_schedules (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  workspace_id bigint not null,
  programme_group_id bigint not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  format text not null default 'json_v1' check (format = 'json_v1'),
  range_days integer not null check (range_days in (7, 30, 90)),
  time_zone text not null check (length(time_zone) between 1 and 64),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  local_hour integer not null check (local_hour between 0 and 23),
  day_of_week integer check (day_of_week between 0 and 6),
  day_of_month integer check (day_of_month between 1 and 28),
  state text not null default 'active' check (state in ('active', 'paused')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  idempotency_key uuid not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, created_by_user_id, idempotency_key),
  foreign key (organization_id, workspace_id)
    references loyalty.workspaces(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  check (
    (frequency = 'daily' and day_of_week is null and day_of_month is null)
    or (frequency = 'weekly' and day_of_week is not null and day_of_month is null)
    or (frequency = 'monthly' and day_of_week is null and day_of_month is not null)
  ),
  check ((state = 'active') = (next_run_at is not null)),
  check (last_run_at is null or last_run_at <= updated_at),
  check (updated_at >= created_at)
);

create index analytics_report_schedules_due_idx
  on loyalty.analytics_report_schedules (next_run_at, id)
  where state = 'active';
create index analytics_report_schedules_scope_idx
  on loyalty.analytics_report_schedules (
    organization_id, workspace_id, programme_group_id, created_at desc, id desc
  );

create table loyalty.analytics_export_requests (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  workspace_id bigint not null,
  programme_group_id bigint not null,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  source_kind text not null check (source_kind in ('manual', 'schedule')),
  schedule_id bigint,
  format text not null default 'json_v1' check (format = 'json_v1'),
  range_days integer not null check (range_days in (7, 30, 90)),
  time_zone text not null check (length(time_zone) between 1 and 64),
  requested_as_of timestamptz not null,
  state text not null default 'pending'
    check (state in (
      'pending', 'processing', 'retry', 'ready', 'failed', 'expired', 'consumed'
    )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  failure_code text check (
    failure_code is null or failure_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  generated_at timestamptz,
  expires_at timestamptz,
  consumed_at timestamptz,
  source_sha256 bytea check (
    source_sha256 is null or octet_length(source_sha256) = 32
  ),
  payload_bytes bigint check (payload_bytes is null or payload_bytes between 2 and 5242880),
  idempotency_key uuid not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, requested_by_user_id, idempotency_key),
  foreign key (organization_id, workspace_id)
    references loyalty.workspaces(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  foreign key (organization_id, schedule_id)
    references loyalty.analytics_report_schedules(organization_id, id) on delete restrict,
  check ((source_kind = 'schedule') = (schedule_id is not null)),
  check ((state = 'processing') = (lease_owner is not null and lease_expires_at is not null)),
  check (lease_owner is null or length(lease_owner) between 1 and 200),
  check (
    (state in ('pending', 'retry') and next_attempt_at is not null)
    or (state not in ('pending', 'retry') and next_attempt_at is null)
  ),
  check (
    (state in ('ready', 'expired', 'consumed')) =
      (generated_at is not null and expires_at is not null
       and source_sha256 is not null and payload_bytes is not null)
  ),
  check ((state = 'consumed') = (consumed_at is not null)),
  check (expires_at is null or (generated_at is not null and expires_at > generated_at)),
  check (consumed_at is null or (generated_at is not null and consumed_at >= generated_at)),
  check (updated_at >= created_at)
);

create unique index analytics_export_requests_schedule_due_uidx
  on loyalty.analytics_export_requests (schedule_id, requested_as_of)
  where schedule_id is not null;
create index analytics_export_requests_claim_idx
  on loyalty.analytics_export_requests (next_attempt_at, id)
  where state in ('pending', 'retry');
create index analytics_export_requests_lease_idx
  on loyalty.analytics_export_requests (lease_expires_at, id)
  where state = 'processing';
create index analytics_export_requests_scope_idx
  on loyalty.analytics_export_requests (
    organization_id, workspace_id, programme_group_id, created_at desc, id desc
  );

create table loyalty_private.analytics_export_payloads (
  request_id bigint primary key references loyalty.analytics_export_requests(id) on delete cascade,
  organization_id bigint not null,
  source_payload jsonb not null check (jsonb_typeof(source_payload) = 'object'),
  source_sha256 bytea not null check (octet_length(source_sha256) = 32),
  payload_bytes bigint not null check (payload_bytes between 2 and 5242880),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, request_id)
    references loyalty.analytics_export_requests(organization_id, id) on delete cascade,
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create index analytics_export_payloads_expiry_idx
  on loyalty_private.analytics_export_payloads (expires_at, request_id);

create table loyalty_private.analytics_export_authorizations (
  id bigint generated always as identity primary key,
  request_id bigint not null references loyalty.analytics_export_requests(id) on delete cascade,
  token_sha256 bytea not null unique check (octet_length(token_sha256) = 32),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at)
);

create index analytics_export_authorizations_subject_idx
  on loyalty_private.analytics_export_authorizations (
    request_id, auth_user_id, session_id, expires_at desc, id desc
  ) where used_at is null;

create table loyalty_private.analytics_export_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  request_id bigint references loyalty.analytics_export_requests(id) on delete restrict,
  schedule_id bigint references loyalty.analytics_report_schedules(id) on delete restrict,
  event_type text not null check (
    event_type in (
      'request.created', 'request.claimed', 'request.retry', 'request.failed',
      'request.generated', 'request.expired', 'request.downloaded',
      'schedule.created', 'schedule.paused', 'schedule.resumed',
      'schedule.materialized', 'schedule.auto_paused'
    )
  ),
  actor_user_id uuid references auth.users(id) on delete restrict,
  worker_reference text check (
    worker_reference is null or length(worker_reference) between 1 and 200
  ),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, request_id)
    references loyalty.analytics_export_requests(organization_id, id) on delete restrict,
  foreign key (organization_id, schedule_id)
    references loyalty.analytics_report_schedules(organization_id, id) on delete restrict,
  check ((request_id is not null)::integer + (schedule_id is not null)::integer = 1)
);

create index analytics_export_events_request_idx
  on loyalty_private.analytics_export_events (request_id, created_at, id)
  where request_id is not null;
create index analytics_export_events_schedule_idx
  on loyalty_private.analytics_export_events (schedule_id, created_at, id)
  where schedule_id is not null;
create unique index analytics_export_events_terminal_uidx
  on loyalty_private.analytics_export_events (request_id, event_type)
  where event_type in (
    'request.created', 'request.generated', 'request.expired', 'request.downloaded'
  );

create trigger analytics_export_events_immutable
before update or delete on loyalty_private.analytics_export_events
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.guard_analytics_schedule_update_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'analytics schedule is immutable';
  end if;
  if new.id <> old.id or new.public_id <> old.public_id
    or new.organization_id <> old.organization_id
    or new.workspace_id <> old.workspace_id
    or new.programme_group_id <> old.programme_group_id
    or new.created_by_user_id <> old.created_by_user_id
    or new.format <> old.format or new.range_days <> old.range_days
    or new.time_zone <> old.time_zone or new.frequency <> old.frequency
    or new.local_hour <> old.local_hour
    or new.day_of_week is distinct from old.day_of_week
    or new.day_of_month is distinct from old.day_of_month
    or new.idempotency_key <> old.idempotency_key
    or new.request_sha256 <> old.request_sha256
    or new.created_at <> old.created_at then
    raise exception using errcode = '55000', message = 'analytics schedule identity is immutable';
  end if;
  if new.updated_at < old.updated_at then
    raise exception using errcode = '55000', message = 'analytics schedule time cannot move backwards';
  end if;
  return new;
end;
$$;

create trigger analytics_report_schedules_guard
before update or delete on loyalty.analytics_report_schedules
for each row execute function loyalty_private.guard_analytics_schedule_update_v1();

create or replace function loyalty_private.guard_analytics_export_request_update_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'analytics export request is immutable';
  end if;
  if new.id <> old.id or new.public_id <> old.public_id
    or new.organization_id <> old.organization_id
    or new.workspace_id <> old.workspace_id
    or new.programme_group_id <> old.programme_group_id
    or new.requested_by_user_id <> old.requested_by_user_id
    or new.source_kind <> old.source_kind
    or new.schedule_id is distinct from old.schedule_id
    or new.format <> old.format or new.range_days <> old.range_days
    or new.time_zone <> old.time_zone
    or new.requested_as_of <> old.requested_as_of
    or new.idempotency_key <> old.idempotency_key
    or new.request_sha256 <> old.request_sha256
    or new.created_at <> old.created_at then
    raise exception using errcode = '55000', message = 'analytics export identity is immutable';
  end if;
  if (old.generated_at is not null and (
      new.generated_at <> old.generated_at
      or new.expires_at <> old.expires_at
      or new.source_sha256 <> old.source_sha256
      or new.payload_bytes <> old.payload_bytes
    ))
    or (old.consumed_at is not null and new.consumed_at <> old.consumed_at) then
    raise exception using errcode = '55000', message = 'analytics export result is immutable';
  end if;
  if new.attempt_count < old.attempt_count or new.updated_at < old.updated_at then
    raise exception using errcode = '55000', message = 'analytics export evidence cannot move backwards';
  end if;
  if new.state <> old.state and not (
    (old.state in ('pending', 'retry') and new.state in ('processing', 'failed', 'expired'))
    or (old.state = 'processing' and new.state in ('retry', 'ready', 'failed'))
    or (old.state = 'ready' and new.state in ('consumed', 'expired'))
  ) then
    raise exception using errcode = '55000', message = 'invalid analytics export transition';
  end if;
  return new;
end;
$$;

create trigger analytics_export_requests_guard
before update or delete on loyalty.analytics_export_requests
for each row execute function loyalty_private.guard_analytics_export_request_update_v1();

create or replace function loyalty_private.guard_analytics_export_payload_update_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  if new.request_id <> old.request_id
    or new.organization_id <> old.organization_id
    or new.source_payload <> old.source_payload
    or new.source_sha256 <> old.source_sha256
    or new.payload_bytes <> old.payload_bytes
    or new.expires_at <> old.expires_at
    or new.created_at <> old.created_at
    or (old.consumed_at is not null and new.consumed_at <> old.consumed_at) then
    raise exception using errcode = '55000', message = 'analytics export payload is immutable';
  end if;
  return new;
end;
$$;

create trigger analytics_export_payloads_guard
before update or delete on loyalty_private.analytics_export_payloads
for each row execute function loyalty_private.guard_analytics_export_payload_update_v1();

create or replace function loyalty_private.next_analytics_schedule_at_v1(
  target_frequency text,
  target_time_zone text,
  target_local_hour integer,
  target_day_of_week integer,
  target_day_of_month integer,
  target_after timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  local_start date;
  candidate_date date;
  candidate_at timestamptz;
  day_offset integer;
begin
  if target_frequency not in ('daily', 'weekly', 'monthly')
    or target_time_zone is null or length(target_time_zone) not between 1 and 64
    or target_local_hour not between 0 and 23
    or target_after is null or not pg_catalog.isfinite(target_after)
    or not exists (
      select 1 from pg_catalog.pg_timezone_names as zone
      where zone.name = target_time_zone
    )
    or not (
      (target_frequency = 'daily' and target_day_of_week is null and target_day_of_month is null)
      or (target_frequency = 'weekly' and target_day_of_week between 0 and 6 and target_day_of_month is null)
      or (target_frequency = 'monthly' and target_day_of_week is null and target_day_of_month between 1 and 28)
    ) then
    raise exception using errcode = '22023', message = 'invalid analytics schedule';
  end if;
  local_start := (target_after at time zone target_time_zone)::date;
  for day_offset in 0..370 loop
    candidate_date := local_start + day_offset;
    if target_frequency = 'daily'
      or (target_frequency = 'weekly'
        and extract(dow from candidate_date)::integer = target_day_of_week)
      or (target_frequency = 'monthly'
        and extract(day from candidate_date)::integer = target_day_of_month) then
      candidate_at := (candidate_date + pg_catalog.make_interval(hours => target_local_hour))
        at time zone target_time_zone;
      if candidate_at > target_after then return candidate_at; end if;
    end if;
  end loop;
  raise exception using errcode = '22023', message = 'analytics schedule has no next occurrence';
end;
$$;

create or replace function loyalty.create_analytics_export_command(
  target_organization_public_id uuid,
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_format text,
  target_range_days integer,
  target_time_zone text,
  target_idempotency_key uuid,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  selected record;
  analytics_enabled boolean;
  request_hash bytea;
  existing_request loyalty.analytics_export_requests%rowtype;
  created_request loyalty.analytics_export_requests%rowtype;
  requested_at timestamptz := statement_timestamp();
begin
  if actor_user_id is null or target_organization_public_id is null
    or target_workspace_public_id is null or target_programme_group_public_id is null
    or target_format <> 'json_v1' or target_range_days not in (7, 30, 90)
    or target_time_zone is null or length(target_time_zone) not between 1 and 64
    or target_idempotency_key is null or target_correlation_id is null
    or not exists (
      select 1 from pg_catalog.pg_timezone_names as zone where zone.name = target_time_zone
    ) then
    raise exception using errcode = '22023', message = 'invalid analytics export command';
  end if;
  select organization.id as organization_id, workspace.id as workspace_id,
    programme_group.id as programme_group_id, membership.role
  into selected
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.user_id = actor_user_id and membership.revoked_at is null
   and membership.role in ('owner', 'admin', 'analyst', 'auditor')
  join loyalty.workspaces as workspace
    on workspace.organization_id = organization.id
   and workspace.public_id = target_workspace_public_id and workspace.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = organization.id
   and programme_group.public_id = target_programme_group_public_id
   and programme_group.status = 'active'
  join loyalty.programme_group_workspaces as link
    on link.organization_id = organization.id
   and link.workspace_id = workspace.id
   and link.programme_group_id = programme_group.id
  where organization.public_id = target_organization_public_id
    and organization.status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'analytics export not authorized';
  end if;
  select entitlement.enabled into analytics_enabled
  from loyalty_private.resolve_organization_entitlement(
    selected.organization_id, 'analytics', target_idempotency_key::text, requested_at
  ) as entitlement;
  if not coalesce(analytics_enabled, false) then
    raise exception using errcode = '42501', message = 'analytics capability disabled';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'analytics.export.create|' || target_organization_public_id::text || '|'
    || target_workspace_public_id::text || '|' || target_programme_group_public_id::text
    || '|' || target_format || '|' || target_range_days::text || '|' || target_time_zone,
    'utf8'
  ), 'sha256');
  select request.* into existing_request
  from loyalty.analytics_export_requests as request
  where request.organization_id = selected.organization_id
    and request.requested_by_user_id = actor_user_id
    and request.idempotency_key = target_idempotency_key;
  if found then
    if existing_request.source_kind <> 'manual'
      or existing_request.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'analytics export idempotency conflict';
    end if;
    return query select existing_request.public_id, 'duplicate'::text, existing_request.state;
    return;
  end if;
  insert into loyalty.analytics_export_requests (
    organization_id, workspace_id, programme_group_id, requested_by_user_id,
    source_kind, format, range_days, time_zone, requested_as_of, state,
    next_attempt_at, idempotency_key, request_sha256, created_at, updated_at
  ) values (
    selected.organization_id, selected.workspace_id, selected.programme_group_id,
    actor_user_id, 'manual', target_format, target_range_days, target_time_zone,
    requested_at, 'pending', requested_at, target_idempotency_key, request_hash,
    requested_at, requested_at
  ) returning * into created_request;
  insert into loyalty_private.analytics_export_events (
    organization_id, request_id, event_type, actor_user_id, metadata, created_at
  ) values (
    created_request.organization_id, created_request.id, 'request.created',
    actor_user_id, jsonb_build_object(
      'source', 'manual', 'format', target_format, 'rangeDays', target_range_days,
      'timeZone', target_time_zone
    ), requested_at
  );
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type, resource_public_id,
    idempotency_key, request_sha256, correlation_id, metadata, created_at
  ) values (
    created_request.organization_id, actor_user_id, 'analytics.export.create',
    'analytics_export', created_request.public_id,
    'analytics:export:' || target_idempotency_key::text, request_hash,
    target_correlation_id, jsonb_build_object(
      'format', target_format, 'rangeDays', target_range_days, 'timeZone', target_time_zone
    ), requested_at
  );
  return query select created_request.public_id, 'created'::text, created_request.state;
end;
$$;

create or replace function loyalty.create_analytics_report_schedule_command(
  target_organization_public_id uuid,
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_format text,
  target_range_days integer,
  target_time_zone text,
  target_frequency text,
  target_local_hour integer,
  target_day_of_week integer,
  target_day_of_month integer,
  target_idempotency_key uuid,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, state text, next_run_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  selected record;
  analytics_enabled boolean;
  request_hash bytea;
  existing_schedule loyalty.analytics_report_schedules%rowtype;
  created_schedule loyalty.analytics_report_schedules%rowtype;
  created_at timestamptz := statement_timestamp();
  first_run_at timestamptz;
begin
  if actor_user_id is null or target_organization_public_id is null
    or target_workspace_public_id is null or target_programme_group_public_id is null
    or target_format <> 'json_v1' or target_range_days not in (7, 30, 90)
    or target_idempotency_key is null or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid analytics schedule command';
  end if;
  first_run_at := loyalty_private.next_analytics_schedule_at_v1(
    target_frequency, target_time_zone, target_local_hour,
    target_day_of_week, target_day_of_month, created_at
  );
  select organization.id as organization_id, workspace.id as workspace_id,
    programme_group.id as programme_group_id
  into selected
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.user_id = actor_user_id and membership.revoked_at is null
   and membership.role in ('owner', 'admin')
  join loyalty.workspaces as workspace
    on workspace.organization_id = organization.id
   and workspace.public_id = target_workspace_public_id and workspace.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = organization.id
   and programme_group.public_id = target_programme_group_public_id
   and programme_group.status = 'active'
  join loyalty.programme_group_workspaces as link
    on link.organization_id = organization.id and link.workspace_id = workspace.id
   and link.programme_group_id = programme_group.id
  where organization.public_id = target_organization_public_id
    and organization.status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'analytics schedule not authorized';
  end if;
  select entitlement.enabled into analytics_enabled
  from loyalty_private.resolve_organization_entitlement(
    selected.organization_id, 'analytics', target_idempotency_key::text, created_at
  ) as entitlement;
  if not coalesce(analytics_enabled, false) then
    raise exception using errcode = '42501', message = 'analytics capability disabled';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'analytics.schedule.create|' || target_organization_public_id::text || '|'
    || target_workspace_public_id::text || '|' || target_programme_group_public_id::text
    || '|' || target_format || '|' || target_range_days::text || '|' || target_time_zone
    || '|' || target_frequency || '|' || target_local_hour::text || '|'
    || coalesce(target_day_of_week::text, '-') || '|'
    || coalesce(target_day_of_month::text, '-'), 'utf8'
  ), 'sha256');
  select schedule.* into existing_schedule
  from loyalty.analytics_report_schedules as schedule
  where schedule.organization_id = selected.organization_id
    and schedule.created_by_user_id = actor_user_id
    and schedule.idempotency_key = target_idempotency_key;
  if found then
    if existing_schedule.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'analytics schedule idempotency conflict';
    end if;
    return query select existing_schedule.public_id, 'duplicate'::text,
      existing_schedule.state, existing_schedule.next_run_at;
    return;
  end if;
  insert into loyalty.analytics_report_schedules (
    organization_id, workspace_id, programme_group_id, created_by_user_id,
    format, range_days, time_zone, frequency, local_hour, day_of_week,
    day_of_month, state, next_run_at, idempotency_key, request_sha256,
    created_at, updated_at
  ) values (
    selected.organization_id, selected.workspace_id, selected.programme_group_id,
    actor_user_id, target_format, target_range_days, target_time_zone,
    target_frequency, target_local_hour, target_day_of_week, target_day_of_month,
    'active', first_run_at, target_idempotency_key, request_hash, created_at, created_at
  ) returning * into created_schedule;
  insert into loyalty_private.analytics_export_events (
    organization_id, schedule_id, event_type, actor_user_id, metadata, created_at
  ) values (
    created_schedule.organization_id, created_schedule.id, 'schedule.created',
    actor_user_id, jsonb_build_object(
      'format', target_format, 'rangeDays', target_range_days,
      'timeZone', target_time_zone, 'frequency', target_frequency,
      'localHour', target_local_hour, 'dayOfWeek', target_day_of_week,
      'dayOfMonth', target_day_of_month, 'nextRunAt', first_run_at
    ), created_at
  );
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type, resource_public_id,
    idempotency_key, request_sha256, correlation_id, metadata, created_at
  ) values (
    created_schedule.organization_id, actor_user_id, 'analytics.schedule.create',
    'analytics_schedule', created_schedule.public_id,
    'analytics:schedule:' || target_idempotency_key::text, request_hash,
    target_correlation_id, jsonb_build_object(
      'frequency', target_frequency, 'timeZone', target_time_zone,
      'rangeDays', target_range_days, 'nextRunAt', first_run_at
    ), created_at
  );
  return query select created_schedule.public_id, 'created'::text,
    created_schedule.state, created_schedule.next_run_at;
end;
$$;

create or replace function loyalty.set_analytics_report_schedule_state_command(
  target_schedule_public_id uuid,
  target_state text,
  target_idempotency_key uuid,
  target_correlation_id uuid
)
returns table (resource_public_id uuid, outcome text, state text, next_run_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_schedule loyalty.analytics_report_schedules%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  request_hash bytea;
  changed_at timestamptz := statement_timestamp();
  computed_next_run timestamptz;
begin
  if actor_user_id is null or target_schedule_public_id is null
    or target_state not in ('active', 'paused')
    or target_idempotency_key is null or target_correlation_id is null then
    raise exception using errcode = '22023', message = 'invalid analytics schedule state command';
  end if;
  select schedule.* into target_schedule
  from loyalty.analytics_report_schedules as schedule
  where schedule.public_id = target_schedule_public_id
    and loyalty_private.has_organization_role(
      schedule.organization_id, array['owner', 'admin']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'analytics schedule not authorized';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'analytics.schedule.state|' || target_schedule_public_id::text || '|' || target_state,
    'utf8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_schedule.organization_id
    and audit.idempotency_key = 'analytics:schedule-state:' || target_idempotency_key::text;
  if found then
    if existing_audit.action <> 'analytics.schedule.state'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'analytics schedule state idempotency conflict';
    end if;
    select schedule.* into target_schedule
    from loyalty.analytics_report_schedules as schedule
    where schedule.public_id = existing_audit.resource_public_id;
    return query select target_schedule.public_id, 'duplicate'::text,
      target_schedule.state, target_schedule.next_run_at;
    return;
  end if;
  if target_state = 'active' then
    computed_next_run := loyalty_private.next_analytics_schedule_at_v1(
      target_schedule.frequency, target_schedule.time_zone, target_schedule.local_hour,
      target_schedule.day_of_week, target_schedule.day_of_month, changed_at
    );
  end if;
  update loyalty.analytics_report_schedules as schedule
  set state = target_state, next_run_at = computed_next_run, updated_at = changed_at
  where schedule.id = target_schedule.id
  returning * into target_schedule;
  insert into loyalty_private.analytics_export_events (
    organization_id, schedule_id, event_type, actor_user_id, metadata, created_at
  ) values (
    target_schedule.organization_id, target_schedule.id,
    case when target_state = 'active' then 'schedule.resumed' else 'schedule.paused' end,
    actor_user_id, jsonb_build_object('state', target_state, 'nextRunAt', computed_next_run),
    changed_at
  );
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type, resource_public_id,
    idempotency_key, request_sha256, correlation_id, metadata, created_at
  ) values (
    target_schedule.organization_id, actor_user_id, 'analytics.schedule.state',
    'analytics_schedule', target_schedule.public_id,
    'analytics:schedule-state:' || target_idempotency_key::text,
    request_hash, target_correlation_id,
    jsonb_build_object('state', target_state, 'nextRunAt', computed_next_run), changed_at
  );
  return query select target_schedule.public_id, 'updated'::text,
    target_schedule.state, target_schedule.next_run_at;
end;
$$;

create or replace function loyalty.get_analytics_export_workspace_v1(
  target_organization_public_id uuid,
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_limit integer default 20
)
returns table (workspace jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  selected record;
  can_create boolean;
  can_manage boolean;
begin
  if actor_user_id is null or target_organization_public_id is null
    or target_workspace_public_id is null or target_programme_group_public_id is null
    or target_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid analytics export workspace request';
  end if;
  select organization.id as organization_id, workspace.id as workspace_id,
    programme_group.id as programme_group_id, membership.role
  into selected
  from loyalty.organizations as organization
  join loyalty.organization_memberships as membership
    on membership.organization_id = organization.id
   and membership.user_id = actor_user_id and membership.revoked_at is null
  join loyalty.workspaces as workspace
    on workspace.organization_id = organization.id
   and workspace.public_id = target_workspace_public_id and workspace.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = organization.id
   and programme_group.public_id = target_programme_group_public_id
   and programme_group.status = 'active'
  join loyalty.programme_group_workspaces as link
    on link.organization_id = organization.id and link.workspace_id = workspace.id
   and link.programme_group_id = programme_group.id
  where organization.public_id = target_organization_public_id
    and organization.status = 'active';
  if not found then return; end if;
  can_create := selected.role in ('owner', 'admin', 'analyst', 'auditor');
  can_manage := selected.role in ('owner', 'admin');
  return query
  select jsonb_build_object(
    'schemaVersion', '1', 'canCreateExport', can_create,
    'canManageSchedules', can_manage,
    'exports', case when can_create then coalesce((
      select jsonb_agg(item.document order by item.created_at desc, item.id desc)
      from (
        select request.created_at, request.id, jsonb_build_object(
          'publicId', request.public_id, 'source', request.source_kind,
          'schedulePublicId', schedule.public_id, 'format', request.format,
          'rangeDays', request.range_days, 'timeZone', request.time_zone,
          'state', case when request.state = 'ready' and request.expires_at <= statement_timestamp()
            then 'expired' else request.state end,
          'attemptCount', request.attempt_count,
          'requestedAsOf', request.requested_as_of,
          'requestedAt', request.created_at, 'generatedAt', request.generated_at,
          'expiresAt', request.expires_at, 'consumedAt', request.consumed_at,
          'failureCode', request.failure_code,
          'sourceSha256', case when request.source_sha256 is null then null
            else encode(request.source_sha256, 'hex') end,
          'payloadBytes', request.payload_bytes::text
        ) as document
        from loyalty.analytics_export_requests as request
        left join loyalty.analytics_report_schedules as schedule
          on schedule.organization_id = request.organization_id
         and schedule.id = request.schedule_id
        where request.organization_id = selected.organization_id
          and request.workspace_id = selected.workspace_id
          and request.programme_group_id = selected.programme_group_id
          and (can_manage or request.requested_by_user_id = actor_user_id)
        order by request.created_at desc, request.id desc limit target_limit
      ) as item
    ), '[]'::jsonb) else '[]'::jsonb end,
    'schedules', case when can_manage then coalesce((
      select jsonb_agg(item.document order by item.created_at desc, item.id desc)
      from (
        select schedule.created_at, schedule.id, jsonb_build_object(
          'publicId', schedule.public_id, 'format', schedule.format,
          'rangeDays', schedule.range_days, 'timeZone', schedule.time_zone,
          'frequency', schedule.frequency, 'localHour', schedule.local_hour,
          'dayOfWeek', schedule.day_of_week, 'dayOfMonth', schedule.day_of_month,
          'state', schedule.state, 'nextRunAt', schedule.next_run_at,
          'lastRunAt', schedule.last_run_at, 'createdAt', schedule.created_at,
          'updatedAt', schedule.updated_at
        ) as document
        from loyalty.analytics_report_schedules as schedule
        where schedule.organization_id = selected.organization_id
          and schedule.workspace_id = selected.workspace_id
          and schedule.programme_group_id = selected.programme_group_id
        order by schedule.created_at desc, schedule.id desc limit 20
      ) as item
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function loyalty_private.materialize_due_analytics_exports_v1(
  target_as_of timestamptz default now(),
  target_limit integer default 20
)
returns table (materialized integer, auto_paused integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule loyalty.analytics_report_schedules%rowtype;
  created_request loyalty.analytics_export_requests%rowtype;
  created_count integer := 0;
  paused_count integer := 0;
  next_at timestamptz;
  request_hash bytea;
  schedule_idempotency uuid;
begin
  if target_as_of is null or not pg_catalog.isfinite(target_as_of)
    or target_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid analytics schedule materialization';
  end if;
  for schedule in
    select candidate.* from loyalty.analytics_report_schedules as candidate
    where candidate.state = 'active' and candidate.next_run_at <= target_as_of
    order by candidate.next_run_at, candidate.id
    for update skip locked limit target_limit
  loop
    if not exists (
      select 1 from loyalty.organization_memberships as membership
      join loyalty.organizations as organization
        on organization.id = membership.organization_id and organization.status = 'active'
      where membership.organization_id = schedule.organization_id
        and membership.user_id = schedule.created_by_user_id
        and membership.revoked_at is null and membership.role in ('owner', 'admin')
    ) then
      update loyalty.analytics_report_schedules
      set state = 'paused', next_run_at = null, updated_at = target_as_of
      where id = schedule.id;
      insert into loyalty_private.analytics_export_events (
        organization_id, schedule_id, event_type, metadata, created_at
      ) values (
        schedule.organization_id, schedule.id, 'schedule.auto_paused',
        jsonb_build_object('reason', 'creator_not_authorized'), target_as_of
      );
      paused_count := paused_count + 1;
      continue;
    end if;
    schedule_idempotency := extensions.gen_random_uuid();
    request_hash := extensions.digest(pg_catalog.convert_to(
      'analytics.export.schedule|' || schedule.public_id::text || '|'
      || schedule.next_run_at::text, 'utf8'
    ), 'sha256');
    insert into loyalty.analytics_export_requests (
      organization_id, workspace_id, programme_group_id, requested_by_user_id,
      source_kind, schedule_id, format, range_days, time_zone, requested_as_of,
      state, next_attempt_at, idempotency_key, request_sha256, created_at, updated_at
    ) values (
      schedule.organization_id, schedule.workspace_id, schedule.programme_group_id,
      schedule.created_by_user_id, 'schedule', schedule.id, schedule.format,
      schedule.range_days, schedule.time_zone, schedule.next_run_at, 'pending',
      target_as_of, schedule_idempotency, request_hash, target_as_of, target_as_of
    ) on conflict (schedule_id, requested_as_of) where schedule_id is not null do nothing
    returning * into created_request;
    next_at := loyalty_private.next_analytics_schedule_at_v1(
      schedule.frequency, schedule.time_zone, schedule.local_hour,
      schedule.day_of_week, schedule.day_of_month, schedule.next_run_at
    );
    update loyalty.analytics_report_schedules
    set last_run_at = schedule.next_run_at, next_run_at = next_at, updated_at = target_as_of
    where id = schedule.id;
    if created_request.id is not null then
      insert into loyalty_private.analytics_export_events (
        organization_id, request_id, event_type, actor_user_id, metadata, created_at
      ) values (
        schedule.organization_id, created_request.id, 'request.created',
        schedule.created_by_user_id, jsonb_build_object(
          'source', 'schedule', 'schedulePublicId', schedule.public_id,
          'dueAt', schedule.next_run_at
        ), target_as_of
      );
      insert into loyalty_private.analytics_export_events (
        organization_id, schedule_id, event_type, actor_user_id, metadata, created_at
      ) values (
        schedule.organization_id, schedule.id, 'schedule.materialized',
        schedule.created_by_user_id, jsonb_build_object(
          'exportPublicId', created_request.public_id, 'dueAt', schedule.next_run_at,
          'nextRunAt', next_at
        ), target_as_of
      );
      created_count := created_count + 1;
    end if;
    created_request := null;
  end loop;
  return query select created_count, paused_count;
end;
$$;

create or replace function loyalty_private.claim_analytics_export_jobs_v1(
  target_worker_id text,
  target_batch_size integer default 5,
  target_lease_seconds integer default 120
)
returns table (schema_version text, export_public_id uuid, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_at timestamptz := clock_timestamp();
  candidate record;
begin
  if target_worker_id is null or length(target_worker_id) not between 1 and 200
    or target_batch_size not between 1 and 20
    or target_lease_seconds not between 60 and 600 then
    raise exception using errcode = '22023', message = 'invalid analytics export claim';
  end if;
  for candidate in
    select request.* from loyalty.analytics_export_requests as request
    where request.state = 'processing' and request.lease_expires_at <= checked_at
    order by request.lease_expires_at, request.id
    for update skip locked limit target_batch_size
  loop
    update loyalty.analytics_export_requests
    set state = case when candidate.attempt_count >= 5 then 'failed' else 'retry' end,
      next_attempt_at = case when candidate.attempt_count >= 5 then null else checked_at end,
      failure_code = case when candidate.attempt_count >= 5
        then 'lease_attempts_exhausted' else 'lease_expired' end,
      lease_owner = null, lease_expires_at = null, updated_at = checked_at
    where id = candidate.id;
    insert into loyalty_private.analytics_export_events (
      organization_id, request_id, event_type, worker_reference, metadata, created_at
    ) values (
      candidate.organization_id, candidate.id,
      case when candidate.attempt_count >= 5 then 'request.failed' else 'request.retry' end,
      candidate.lease_owner, jsonb_build_object('reason', 'lease_expired'), checked_at
    );
  end loop;
  return query
  with candidates as materialized (
    select request.id
    from loyalty.analytics_export_requests as request
    where request.state in ('pending', 'retry')
      and request.attempt_count < 5 and request.next_attempt_at <= checked_at
    order by request.next_attempt_at, request.id
    for update skip locked limit target_batch_size
  ), claimed as (
    update loyalty.analytics_export_requests as request
    set state = 'processing', attempt_count = request.attempt_count + 1,
      next_attempt_at = null, failure_code = null, lease_owner = target_worker_id,
      lease_expires_at = checked_at + make_interval(secs => target_lease_seconds),
      updated_at = checked_at
    from candidates as selected where request.id = selected.id
    returning request.id, request.organization_id, request.public_id, request.lease_expires_at
  ), events as (
    insert into loyalty_private.analytics_export_events (
      organization_id, request_id, event_type, worker_reference, metadata, created_at
    ) select claimed.organization_id, claimed.id, 'request.claimed', target_worker_id,
      '{}'::jsonb, checked_at from claimed returning request_id
  )
  select '1'::text, claimed.public_id, claimed.lease_expires_at
  from claimed join events on events.request_id = claimed.id
  order by claimed.lease_expires_at, claimed.public_id;
end;
$$;

create or replace function loyalty_private.generate_analytics_export_job_v1(
  target_export_public_id uuid,
  target_worker_id text
)
returns table (state text, source_sha256 text, payload_bytes bigint, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '45s'
as $$
declare
  request loyalty.analytics_export_requests%rowtype;
  organization_public_id uuid;
  workspace_public_id uuid;
  programme_group_public_id uuid;
  analytics_enabled boolean;
  value_report jsonb;
  commerce_report jsonb;
  outcome_report jsonb;
  cohort_report jsonb;
  source_document jsonb;
  source_hash bytea;
  source_bytes bigint;
  generated_time timestamptz := clock_timestamp();
  payload_expires_at timestamptz;
  previous_subject text;
begin
  if target_export_public_id is null or target_worker_id is null
    or length(target_worker_id) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid analytics export generation';
  end if;
  select candidate.* into request
  from loyalty.analytics_export_requests as candidate
  where candidate.public_id = target_export_public_id for update;
  if request.id is null or request.state <> 'processing'
    or request.lease_owner <> target_worker_id
    or request.lease_expires_at <= generated_time then
    raise exception using errcode = '42501', message = 'analytics export lease not owned';
  end if;
  if not exists (
    select 1 from loyalty.organization_memberships as membership
    where membership.organization_id = request.organization_id
      and membership.user_id = request.requested_by_user_id
      and membership.revoked_at is null
      and membership.role = any(case when request.source_kind = 'schedule'
        then array['owner', 'admin']::text[]
        else array['owner', 'admin', 'analyst', 'auditor']::text[] end)
  ) then
    raise exception using errcode = '42501', message = 'analytics export actor revoked';
  end if;
  select organization.public_id, workspace.public_id, programme_group.public_id
  into organization_public_id, workspace_public_id, programme_group_public_id
  from loyalty.organizations as organization
  join loyalty.workspaces as workspace
    on workspace.organization_id = organization.id and workspace.id = request.workspace_id
   and workspace.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = organization.id
   and programme_group.id = request.programme_group_id and programme_group.status = 'active'
  join loyalty.programme_group_workspaces as link
    on link.organization_id = organization.id and link.workspace_id = workspace.id
   and link.programme_group_id = programme_group.id
  where organization.id = request.organization_id and organization.status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'analytics export scope unavailable';
  end if;
  select entitlement.enabled into analytics_enabled
  from loyalty_private.resolve_organization_entitlement(
    request.organization_id, 'analytics', request.public_id::text, generated_time
  ) as entitlement;
  if not coalesce(analytics_enabled, false) then
    raise exception using errcode = '42501', message = 'analytics capability disabled';
  end if;
  previous_subject := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', request.requested_by_user_id::text, true);
  select to_jsonb(source) into value_report
  from loyalty.get_analytics_value_truth_v1(
    organization_public_id, workspace_public_id, programme_group_public_id,
    request.range_days, request.requested_as_of
  ) as source;
  select to_jsonb(source) into commerce_report
  from loyalty.get_analytics_commerce_performance_v1(
    organization_public_id, workspace_public_id, programme_group_public_id,
    request.range_days, request.requested_as_of
  ) as source;
  select to_jsonb(source) into outcome_report
  from loyalty.get_analytics_programme_outcomes_v1(
    organization_public_id, workspace_public_id, programme_group_public_id,
    request.range_days, request.requested_as_of
  ) as source;
  select source.report into cohort_report
  from loyalty.get_analytics_cohort_retention_v1(
    organization_public_id, workspace_public_id, programme_group_public_id,
    request.range_days, request.time_zone, request.requested_as_of
  ) as source;
  perform set_config('request.jwt.claim.sub', coalesce(previous_subject, ''), true);
  if value_report is null or commerce_report is null
    or outcome_report is null or cohort_report is null then
    raise exception using errcode = '42501', message = 'analytics export source unavailable';
  end if;
  source_document := jsonb_build_object(
    'schemaVersion', 'starfiniti.analytics-export-source.v1',
    'exportId', request.public_id, 'generatedAt', generated_time,
    'requestedAsOf', request.requested_as_of, 'rangeDays', request.range_days,
    'requestedTimeZone', request.time_zone,
    'reports', jsonb_build_object(
      'valueTruthRow', value_report, 'commercePerformanceRow', commerce_report,
      'programmeOutcomeRow', outcome_report, 'cohortRetention', cohort_report
    )
  );
  source_bytes := octet_length(convert_to(source_document::text, 'utf8'));
  if source_bytes > 5242880 then
    raise exception using errcode = '54000', message = 'analytics export payload too large';
  end if;
  source_hash := extensions.digest(convert_to(source_document::text, 'utf8'), 'sha256');
  payload_expires_at := generated_time + interval '24 hours';
  insert into loyalty_private.analytics_export_payloads (
    request_id, organization_id, source_payload, source_sha256,
    payload_bytes, expires_at, created_at
  ) values (
    request.id, request.organization_id, source_document, source_hash,
    source_bytes, payload_expires_at, generated_time
  );
  update loyalty.analytics_export_requests
  set state = 'ready', generated_at = generated_time, expires_at = payload_expires_at,
    source_sha256 = source_hash, payload_bytes = source_bytes,
    lease_owner = null, lease_expires_at = null, updated_at = generated_time
  where id = request.id;
  insert into loyalty_private.analytics_export_events (
    organization_id, request_id, event_type, worker_reference, metadata, created_at
  ) values (
    request.organization_id, request.id, 'request.generated', target_worker_id,
    jsonb_build_object('sourceSha256', encode(source_hash, 'hex'),
      'payloadBytes', source_bytes::text, 'expiresAt', payload_expires_at),
    generated_time
  );
  return query select 'ready'::text, encode(source_hash, 'hex'),
    source_bytes, payload_expires_at;
end;
$$;

create or replace function loyalty_private.fail_analytics_export_job_v1(
  target_export_public_id uuid,
  target_worker_id text,
  target_error_code text
)
returns table (state text, next_attempt_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request loyalty.analytics_export_requests%rowtype;
  failed_at timestamptz := clock_timestamp();
  final_state text;
  retry_at timestamptz;
begin
  if target_export_public_id is null or target_worker_id is null
    or length(target_worker_id) not between 1 and 200
    or target_error_code is null
    or target_error_code !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'invalid analytics export failure';
  end if;
  select candidate.* into request
  from loyalty.analytics_export_requests as candidate
  where candidate.public_id = target_export_public_id for update;
  if request.id is null or request.state <> 'processing'
    or request.lease_owner <> target_worker_id then
    raise exception using errcode = '42501', message = 'analytics export lease not owned';
  end if;
  if request.attempt_count >= 5
    or target_error_code in ('actor_revoked', 'scope_unavailable', 'feature_disabled', 'payload_too_large') then
    final_state := 'failed';
  else
    final_state := 'retry';
    retry_at := failed_at + make_interval(secs => least(
      1800, 30 * (power(2, request.attempt_count - 1))::integer
    ));
  end if;
  update loyalty.analytics_export_requests
  set state = final_state, next_attempt_at = retry_at, failure_code = target_error_code,
    lease_owner = null, lease_expires_at = null, updated_at = failed_at
  where id = request.id;
  insert into loyalty_private.analytics_export_events (
    organization_id, request_id, event_type, worker_reference, metadata, created_at
  ) values (
    request.organization_id, request.id,
    case when final_state = 'failed' then 'request.failed' else 'request.retry' end,
    target_worker_id, jsonb_build_object(
      'errorCode', target_error_code, 'attemptCount', request.attempt_count,
      'nextAttemptAt', retry_at
    ), failed_at
  );
  return query select final_state, retry_at;
end;
$$;

create or replace function loyalty_private.expire_analytics_exports_v1(
  target_as_of timestamptz default now(),
  target_limit integer default 100
)
returns table (expired integer, authorizations_removed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
  authorization_count integer := 0;
begin
  if target_as_of is null or not isfinite(target_as_of)
    or target_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid analytics export expiry';
  end if;
  with candidates as materialized (
    select request.id, request.organization_id
    from loyalty.analytics_export_requests as request
    where request.state = 'ready' and request.expires_at <= target_as_of
    order by request.expires_at, request.id for update skip locked limit target_limit
  ), expired_rows as (
    update loyalty.analytics_export_requests as request
    set state = 'expired', updated_at = target_as_of
    from candidates where request.id = candidates.id
    returning request.id, request.organization_id
  ), events as (
    insert into loyalty_private.analytics_export_events (
      organization_id, request_id, event_type, metadata, created_at
    ) select expired_rows.organization_id, expired_rows.id, 'request.expired',
      '{}'::jsonb, target_as_of from expired_rows returning request_id
  ) select count(*)::integer into expired_count from events;
  delete from loyalty_private.analytics_export_payloads as payload
  where payload.request_id in (
    select request.id from loyalty.analytics_export_requests as request
    where request.state = 'expired' and request.expires_at <= target_as_of
  );
  delete from loyalty_private.analytics_export_authorizations as authz
  where authz.expires_at <= target_as_of
     or authz.request_id in (
       select request.id from loyalty.analytics_export_requests as request
       where request.state in ('expired', 'consumed', 'failed')
     );
  get diagnostics authorization_count = row_count;
  return query select expired_count, authorization_count;
end;
$$;

create or replace function loyalty_private.issue_analytics_export_authorization_v1(
  target_export_public_id uuid,
  target_auth_user_id uuid,
  target_session_id uuid
)
returns table (authorization_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request loyalty.analytics_export_requests%rowtype;
  issued_at timestamptz := clock_timestamp();
  created_token uuid := extensions.gen_random_uuid();
  capability_expires_at timestamptz := issued_at + interval '5 minutes';
begin
  if target_export_public_id is null or target_auth_user_id is null
    or target_session_id is null then
    raise exception using errcode = '22023', message = 'invalid analytics export authorization';
  end if;
  select candidate.* into request
  from loyalty.analytics_export_requests as candidate
  join loyalty.organizations as organization
    on organization.id = candidate.organization_id and organization.status = 'active'
  join loyalty.workspaces as workspace
    on workspace.organization_id = candidate.organization_id
   and workspace.id = candidate.workspace_id and workspace.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = candidate.organization_id
   and programme_group.id = candidate.programme_group_id and programme_group.status = 'active'
  join loyalty.organization_memberships as membership
    on membership.organization_id = candidate.organization_id
   and membership.user_id = target_auth_user_id and membership.revoked_at is null
   and membership.role in ('owner', 'admin', 'analyst', 'auditor')
  where candidate.public_id = target_export_public_id
    and candidate.state = 'ready' and candidate.expires_at > issued_at
    and (membership.role in ('owner', 'admin')
      or candidate.requested_by_user_id = target_auth_user_id)
  for update of candidate;
  if not found then
    raise exception using errcode = '42501', message = 'analytics export authorization denied';
  end if;
  delete from loyalty_private.analytics_export_authorizations as authz
  where authz.request_id = request.id
    and authz.auth_user_id = target_auth_user_id
    and authz.session_id = target_session_id
    and authz.used_at is null;
  insert into loyalty_private.analytics_export_authorizations (
    request_id, token_sha256, auth_user_id, session_id, expires_at, created_at
  ) values (
    request.id,
    extensions.digest(convert_to(created_token::text, 'utf8'), 'sha256'),
    target_auth_user_id, target_session_id, capability_expires_at, issued_at
  );
  return query select created_token::text, capability_expires_at;
end;
$$;

create or replace function loyalty_private.consume_analytics_export_v1(
  target_export_public_id uuid,
  target_authorization_token text,
  target_auth_user_id uuid,
  target_session_id uuid
)
returns table (
  export_id uuid,
  generated_at timestamptz,
  expires_at timestamptz,
  source_sha256 text,
  source_payload jsonb
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  export_authorization loyalty_private.analytics_export_authorizations%rowtype;
  request loyalty.analytics_export_requests%rowtype;
  payload loyalty_private.analytics_export_payloads%rowtype;
  consumed_time timestamptz := clock_timestamp();
begin
  if target_export_public_id is null or target_authorization_token is null
    or length(target_authorization_token) > 100 or target_auth_user_id is null
    or target_session_id is null then
    raise exception using errcode = '22023', message = 'invalid analytics export consumption';
  end if;
  select candidate.* into export_authorization
  from loyalty_private.analytics_export_authorizations as candidate
  join loyalty.analytics_export_requests as export on export.id = candidate.request_id
  where export.public_id = target_export_public_id
    and candidate.token_sha256 = extensions.digest(
      convert_to(target_authorization_token, 'utf8'), 'sha256'
    )
    and candidate.auth_user_id = target_auth_user_id
    and candidate.session_id = target_session_id
  for update of candidate;
  if export_authorization.id is null or export_authorization.used_at is not null
    or export_authorization.expires_at <= consumed_time then
    raise exception using errcode = '42501', message = 'analytics export capability invalid';
  end if;
  select candidate.* into request
  from loyalty.analytics_export_requests as candidate
  join loyalty.organization_memberships as membership
    on membership.organization_id = candidate.organization_id
   and membership.user_id = target_auth_user_id and membership.revoked_at is null
   and membership.role in ('owner', 'admin', 'analyst', 'auditor')
  where candidate.id = export_authorization.request_id
    and candidate.state = 'ready' and candidate.expires_at > consumed_time
    and (membership.role in ('owner', 'admin')
      or candidate.requested_by_user_id = target_auth_user_id)
  for update of candidate;
  if not found then
    raise exception using errcode = '42501', message = 'analytics export no longer authorized';
  end if;
  select candidate.* into strict payload
  from loyalty_private.analytics_export_payloads as candidate
  where candidate.request_id = request.id and candidate.expires_at > consumed_time
  for update;
  update loyalty_private.analytics_export_authorizations
  set used_at = consumed_time where id = export_authorization.id;
  update loyalty.analytics_export_requests
  set state = 'consumed', consumed_at = consumed_time, updated_at = consumed_time
  where id = request.id;
  update loyalty_private.analytics_export_payloads
  set consumed_at = consumed_time where request_id = request.id;
  return query select request.public_id, request.generated_at, request.expires_at,
    encode(payload.source_sha256, 'hex'), payload.source_payload;
end;
$$;

create or replace function loyalty_private.record_analytics_export_download_v1(
  target_export_public_id uuid,
  target_auth_user_id uuid,
  target_session_id uuid,
  target_response_sha256 text,
  target_response_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request loyalty.analytics_export_requests%rowtype;
begin
  if target_export_public_id is null or target_auth_user_id is null
    or target_session_id is null or target_response_sha256 !~ '^[a-f0-9]{64}$'
    or target_response_bytes not between 2 and 10485760 then
    raise exception using errcode = '22023', message = 'invalid analytics export download evidence';
  end if;
  select candidate.* into request
  from loyalty.analytics_export_requests as candidate
  where candidate.public_id = target_export_public_id
    and candidate.state = 'consumed'
    and exists (
      select 1 from loyalty_private.analytics_export_authorizations as authz
      where authz.request_id = candidate.id
        and authz.auth_user_id = target_auth_user_id
        and authz.session_id = target_session_id
        and authz.used_at = candidate.consumed_at
    );
  if not found then
    raise exception using errcode = '42501', message = 'analytics export download not authorized';
  end if;
  insert into loyalty_private.analytics_export_events (
    organization_id, request_id, event_type, actor_user_id, metadata, created_at
  ) values (
    request.organization_id, request.id, 'request.downloaded', target_auth_user_id,
    jsonb_build_object('responseSha256', target_response_sha256,
      'responseBytes', target_response_bytes::text), request.consumed_at
  );
  delete from loyalty_private.analytics_export_payloads
  where request_id = request.id;
end;
$$;

alter table loyalty.analytics_report_schedules owner to loyalty_owner;
alter table loyalty.analytics_export_requests owner to loyalty_owner;
alter table loyalty_private.analytics_export_payloads owner to loyalty_owner;
alter table loyalty_private.analytics_export_authorizations owner to loyalty_owner;
alter table loyalty_private.analytics_export_events owner to loyalty_owner;
alter table loyalty.analytics_report_schedules enable row level security;
alter table loyalty.analytics_export_requests enable row level security;
alter table loyalty_private.analytics_export_payloads enable row level security;
alter table loyalty_private.analytics_export_authorizations enable row level security;
alter table loyalty_private.analytics_export_events enable row level security;

alter function loyalty_private.guard_analytics_schedule_update_v1() owner to loyalty_owner;
alter function loyalty_private.guard_analytics_export_request_update_v1() owner to loyalty_owner;
alter function loyalty_private.guard_analytics_export_payload_update_v1() owner to loyalty_owner;
alter function loyalty_private.next_analytics_schedule_at_v1(text, text, integer, integer, integer, timestamptz) owner to loyalty_owner;
alter function loyalty.create_analytics_export_command(uuid, uuid, uuid, text, integer, text, uuid, uuid) owner to loyalty_owner;
alter function loyalty.create_analytics_report_schedule_command(uuid, uuid, uuid, text, integer, text, text, integer, integer, integer, uuid, uuid) owner to loyalty_owner;
alter function loyalty.set_analytics_report_schedule_state_command(uuid, text, uuid, uuid) owner to loyalty_owner;
alter function loyalty.get_analytics_export_workspace_v1(uuid, uuid, uuid, integer) owner to loyalty_owner;
alter function loyalty_private.materialize_due_analytics_exports_v1(timestamptz, integer) owner to loyalty_owner;
alter function loyalty_private.claim_analytics_export_jobs_v1(text, integer, integer) owner to loyalty_owner;
alter function loyalty_private.generate_analytics_export_job_v1(uuid, text) owner to loyalty_owner;
alter function loyalty_private.fail_analytics_export_job_v1(uuid, text, text) owner to loyalty_owner;
alter function loyalty_private.expire_analytics_exports_v1(timestamptz, integer) owner to loyalty_owner;
alter function loyalty_private.issue_analytics_export_authorization_v1(uuid, uuid, uuid) owner to loyalty_owner;
alter function loyalty_private.consume_analytics_export_v1(uuid, text, uuid, uuid) owner to loyalty_owner;
alter function loyalty_private.record_analytics_export_download_v1(uuid, uuid, uuid, text, bigint) owner to loyalty_owner;

revoke all on loyalty.analytics_report_schedules, loyalty.analytics_export_requests,
  loyalty_private.analytics_export_payloads,
  loyalty_private.analytics_export_authorizations,
  loyalty_private.analytics_export_events
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function
  loyalty.create_analytics_export_command(uuid, uuid, uuid, text, integer, text, uuid, uuid),
  loyalty.create_analytics_report_schedule_command(uuid, uuid, uuid, text, integer, text, text, integer, integer, integer, uuid, uuid),
  loyalty.set_analytics_report_schedule_state_command(uuid, text, uuid, uuid),
  loyalty.get_analytics_export_workspace_v1(uuid, uuid, uuid, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty.create_analytics_export_command(uuid, uuid, uuid, text, integer, text, uuid, uuid),
  loyalty.create_analytics_report_schedule_command(uuid, uuid, uuid, text, integer, text, text, integer, integer, integer, uuid, uuid),
  loyalty.set_analytics_report_schedule_state_command(uuid, text, uuid, uuid),
  loyalty.get_analytics_export_workspace_v1(uuid, uuid, uuid, integer)
  to authenticated;

revoke all on function
  loyalty_private.guard_analytics_schedule_update_v1(),
  loyalty_private.guard_analytics_export_request_update_v1(),
  loyalty_private.guard_analytics_export_payload_update_v1(),
  loyalty_private.next_analytics_schedule_at_v1(text, text, integer, integer, integer, timestamptz),
  loyalty_private.materialize_due_analytics_exports_v1(timestamptz, integer),
  loyalty_private.claim_analytics_export_jobs_v1(text, integer, integer),
  loyalty_private.generate_analytics_export_job_v1(uuid, text),
  loyalty_private.fail_analytics_export_job_v1(uuid, text, text),
  loyalty_private.expire_analytics_exports_v1(timestamptz, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty_private.materialize_due_analytics_exports_v1(timestamptz, integer),
  loyalty_private.claim_analytics_export_jobs_v1(text, integer, integer),
  loyalty_private.generate_analytics_export_job_v1(uuid, text),
  loyalty_private.fail_analytics_export_job_v1(uuid, text, text),
  loyalty_private.expire_analytics_exports_v1(timestamptz, integer)
  to loyalty_worker;

revoke all on function
  loyalty_private.issue_analytics_export_authorization_v1(uuid, uuid, uuid),
  loyalty_private.consume_analytics_export_v1(uuid, text, uuid, uuid),
  loyalty_private.record_analytics_export_download_v1(uuid, uuid, uuid, text, bigint)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty_private.issue_analytics_export_authorization_v1(uuid, uuid, uuid),
  loyalty_private.consume_analytics_export_v1(uuid, text, uuid, uuid),
  loyalty_private.record_analytics_export_download_v1(uuid, uuid, uuid, text, bigint)
  to loyalty_runtime;

comment on table loyalty.analytics_report_schedules is
  'Immutable-cadence tenant report schedules; pause/resume and next/last run are controlled projections.';
comment on table loyalty.analytics_export_requests is
  'Tenant-scoped bounded aggregate export jobs with idempotency, lease, retry, expiry, and digest evidence.';
comment on table loyalty_private.analytics_export_payloads is
  'Private 24-hour aggregate source payloads; no browser or worker table access and no row-level identity.';
comment on function loyalty_private.generate_analytics_export_job_v1(uuid, text) is
  'Generates one four-report aggregate source bundle under a verified job lease without any loyalty-value mutation.';
