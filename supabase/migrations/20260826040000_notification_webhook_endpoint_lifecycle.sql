-- M11-S05 merchant webhook lifecycle and endpoint-level health. Existing M08
-- delivery signatures, leases, retry behavior, and immutable attempt evidence
-- remain authoritative. Raw signing material never enters PostgreSQL.

alter table loyalty_private.notification_webhook_endpoints
  drop constraint notification_webhook_endpoints_state_check;
alter table loyalty_private.notification_webhook_endpoints
  add constraint notification_webhook_endpoints_state_check
  check (state in ('disabled', 'active', 'retired'));

alter table loyalty_private.notification_webhook_endpoints
  add column label text not null default 'Webhook endpoint',
  add column current_secret_hint text,
  add column previous_secret_hint text,
  add column created_by_user_id uuid references auth.users(id) on delete restrict,
  add column updated_by_user_id uuid references auth.users(id) on delete restrict,
  add column retired_at timestamptz,
  add column last_change_reason text;

alter table loyalty_private.notification_webhook_endpoints
  add constraint notification_webhook_endpoint_label_check check (
    pg_catalog.length(label) between 1 and 120
    and label = pg_catalog.btrim(label)
    and label !~ '[[:cntrl:]]'
  ),
  add constraint notification_webhook_endpoint_secret_hints_check check (
    (current_secret_hint is null
      or current_secret_hint ~ '^[A-Za-z0-9_-]{6}$')
    and (previous_secret_hint is null
      or previous_secret_hint ~ '^[A-Za-z0-9_-]{6}$')
  ),
  add constraint notification_webhook_endpoint_retirement_check check (
    (state = 'retired' and retired_at is not null)
    or (state <> 'retired' and retired_at is null)
  ),
  add constraint notification_webhook_endpoint_reason_check check (
    last_change_reason is null or (
      pg_catalog.length(last_change_reason) between 1 and 200
      and last_change_reason = pg_catalog.btrim(last_change_reason)
      and last_change_reason !~ '[[:cntrl:]]'
    )
  );

create table loyalty_private.notification_webhook_endpoint_revisions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  endpoint_id bigint not null,
  revision_number integer not null check (revision_number > 0),
  action text not null check (action in (
    'created', 'updated', 'activated', 'disabled', 'rotated', 'retired'
  )),
  endpoint_state text not null check (
    endpoint_state in ('disabled', 'active', 'retired')
  ),
  destination_sha256 bytea not null
    check (pg_catalog.octet_length(destination_sha256) = 32),
  event_types text[] not null,
  rate_limit_per_minute integer not null
    check (rate_limit_per_minute between 1 and 600),
  current_secret_hint text,
  previous_secret_hint text,
  previous_secret_expires_at timestamptz,
  reason text,
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (endpoint_id, revision_number),
  foreign key (organization_id, endpoint_id)
    references loyalty_private.notification_webhook_endpoints(
      organization_id, id
    ) on delete restrict,
  check (pg_catalog.cardinality(event_types) between 1 and 9),
  check (current_secret_hint is null
    or current_secret_hint ~ '^[A-Za-z0-9_-]{6}$'),
  check (previous_secret_hint is null
    or previous_secret_hint ~ '^[A-Za-z0-9_-]{6}$')
);

create index notification_webhook_endpoint_revisions_history_idx
  on loyalty_private.notification_webhook_endpoint_revisions(
    endpoint_id, revision_number desc
  );

alter table loyalty_private.notification_webhook_endpoint_revisions
  owner to loyalty_owner;
alter table loyalty_private.notification_webhook_endpoint_revisions
  enable row level security;

create trigger notification_webhook_endpoint_revisions_immutable
before update or delete
on loyalty_private.notification_webhook_endpoint_revisions
for each row execute function loyalty_private.reject_immutable_change();

insert into loyalty_private.notification_webhook_endpoint_revisions (
  organization_id, endpoint_id, revision_number, action, endpoint_state,
  destination_sha256, event_types, rate_limit_per_minute,
  current_secret_hint, previous_secret_hint, previous_secret_expires_at,
  reason, actor_user_id, created_at
)
select endpoint.organization_id, endpoint.id, 1, 'created', endpoint.state,
  extensions.digest(pg_catalog.convert_to(endpoint.destination_url, 'UTF8'), 'sha256'),
  endpoint.event_types, endpoint.rate_limit_per_minute,
  endpoint.current_secret_hint, endpoint.previous_secret_hint,
  endpoint.previous_secret_expires_at, 'legacy endpoint adopted', null,
  endpoint.created_at
from loyalty_private.notification_webhook_endpoints as endpoint;

create or replace function loyalty_private.protect_notification_webhook_endpoint_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_types <> (
    select pg_catalog.array_agg(distinct event_type order by event_type)
    from pg_catalog.unnest(new.event_types) as event_type
  ) then
    raise exception using errcode = '22023',
      message = 'webhook event subscriptions must be unique and ordered';
  end if;
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id
      or new.public_id <> old.public_id
      or new.created_at <> old.created_at then
      raise exception using errcode = '23514',
        message = 'webhook endpoint identity is immutable';
    end if;
    if old.state = 'retired' and new is distinct from old then
      raise exception using errcode = '23514',
        message = 'retired webhook endpoint is immutable';
    end if;
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$$;

create or replace function
  loyalty_private.record_notification_webhook_endpoint_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_revision integer;
  revision_action text;
begin
  if tg_op = 'UPDATE' and new.destination_url is not distinct from old.destination_url
    and new.event_types is not distinct from old.event_types
    and new.rate_limit_per_minute is not distinct from old.rate_limit_per_minute
    and new.current_secret_sha256 is not distinct from old.current_secret_sha256
    and new.previous_secret_sha256 is not distinct from old.previous_secret_sha256
    and new.previous_secret_expires_at is not distinct from old.previous_secret_expires_at
    and new.state is not distinct from old.state then
    return new;
  end if;
  select coalesce(pg_catalog.max(revision.revision_number), 0) + 1
    into next_revision
  from loyalty_private.notification_webhook_endpoint_revisions as revision
  where revision.endpoint_id = new.id;
  revision_action := case
    when tg_op = 'INSERT' then 'created'
    when new.state = 'retired' and old.state <> 'retired' then 'retired'
    when new.current_secret_sha256 is distinct from old.current_secret_sha256
      then 'rotated'
    when new.state = 'active' and old.state <> 'active' then 'activated'
    when new.state = 'disabled' and old.state <> 'disabled' then 'disabled'
    else 'updated'
  end;
  insert into loyalty_private.notification_webhook_endpoint_revisions (
    organization_id, endpoint_id, revision_number, action, endpoint_state,
    destination_sha256, event_types, rate_limit_per_minute,
    current_secret_hint, previous_secret_hint, previous_secret_expires_at,
    reason, actor_user_id, created_at
  ) values (
    new.organization_id, new.id, next_revision, revision_action, new.state,
    extensions.digest(pg_catalog.convert_to(new.destination_url, 'UTF8'), 'sha256'),
    new.event_types, new.rate_limit_per_minute,
    new.current_secret_hint, new.previous_secret_hint,
    new.previous_secret_expires_at,
    case
      when tg_op = 'INSERT' then new.last_change_reason
      when old.state = 'active'
        and new.state = 'disabled'
        and new.last_change_reason is not distinct from old.last_change_reason
        and new.updated_by_user_id is not distinct from old.updated_by_user_id
        then 'receiver returned 410'
      else new.last_change_reason
    end,
    case
      when tg_op = 'INSERT' then new.created_by_user_id
      when old.state = 'active' and new.state = 'disabled'
        and new.last_change_reason is not distinct from old.last_change_reason
        and new.updated_by_user_id is not distinct from old.updated_by_user_id
        then null
      else new.updated_by_user_id
    end,
    new.updated_at
  );
  return new;
end;
$$;

create trigger notification_webhook_endpoint_revisions_append
after insert or update on loyalty_private.notification_webhook_endpoints
for each row execute function
  loyalty_private.record_notification_webhook_endpoint_revision_v1();

create trigger notification_webhook_endpoints_no_delete
before delete on loyalty_private.notification_webhook_endpoints
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.create_notification_webhook_endpoint_v1(
  target_actor_user_id uuid,
  target_workspace_public_id uuid,
  target_label text,
  target_destination_url text,
  target_current_secret_sha256 bytea,
  target_current_secret_hint text,
  target_event_types text[],
  target_rate_limit_per_minute integer,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  endpoint_public_id uuid,
  endpoint_state text,
  outcome text,
  prior_secret_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_workspace loyalty.workspaces%rowtype;
  target_organization_public_id uuid;
  entitlement_enabled boolean;
  target_allowed_origin text;
  request_hash bytea;
  existing_audit loyalty.admin_audit_events%rowtype;
  created_endpoint loyalty_private.notification_webhook_endpoints%rowtype;
  command_time timestamptz := pg_catalog.clock_timestamp();
begin
  if target_actor_user_id is null or target_workspace_public_id is null
    or target_label is null or target_label <> pg_catalog.btrim(target_label)
    or pg_catalog.length(target_label) not between 1 and 120
    or target_label ~ '[[:cntrl:]]'
    or target_destination_url is null
    or pg_catalog.length(target_destination_url) not between 12 and 2048
    or target_destination_url !~ '^https://([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(:443)?/.+$'
    or target_destination_url ~ '[?#[:space:]]'
    or target_current_secret_sha256 is null
    or pg_catalog.octet_length(target_current_secret_sha256) <> 32
    or target_current_secret_hint !~ '^[A-Za-z0-9_-]{6}$'
    or target_event_types is null
    or pg_catalog.cardinality(target_event_types) not between 1 and 9
    or exists (
      select 1 from pg_catalog.unnest(target_event_types) as event_type
      where event_type is null or event_type not in (
        'loyalty.points.earned', 'loyalty.points.released',
        'loyalty.points.expiring', 'loyalty.reward.changed',
        'loyalty.tier.changed', 'loyalty.referral.changed',
        'loyalty.campaign.effect', 'loyalty.connector.health',
        'loyalty.billing.changed'
      )
    )
    or target_event_types <> (
      select pg_catalog.array_agg(distinct event_type order by event_type)
      from pg_catalog.unnest(target_event_types) as event_type
    )
    or target_rate_limit_per_minute not between 1 and 600
    or target_idempotency_key is null
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or pg_catalog.length(target_idempotency_key) not between 1 and 200
    or target_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid notification webhook endpoint command';
  end if;
  target_allowed_origin := pg_catalog.substring(
    target_destination_url from '^(https://[^/]+)'
  );
  select workspace.* into target_workspace
  from loyalty.workspaces as workspace
  where workspace.public_id = target_workspace_public_id
    and workspace.status = 'active'
    and exists (
      select 1 from loyalty.organization_memberships as membership
      where membership.organization_id = workspace.organization_id
        and membership.user_id = target_actor_user_id
        and membership.role in ('owner', 'admin')
        and membership.revoked_at is null
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'notification webhook endpoint command not authorized';
  end if;
  select organization.public_id into strict target_organization_public_id
  from loyalty.organizations as organization
  where organization.id = target_workspace.organization_id
    and organization.status = 'active';
  select entitlement.enabled into entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_workspace.organization_id, 'notifications',
    'workspace:' || target_workspace.public_id::text, command_time
  ) as entitlement;
  if not coalesce(entitlement_enabled, false) then
    raise exception using errcode = '42501',
      message = 'notifications are not enabled for this organization';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'version', '1', 'workspaceId', target_workspace.public_id,
      'label', target_label, 'destinationUrl', target_destination_url,
      'eventTypes', target_event_types,
      'rateLimitPerMinute', target_rate_limit_per_minute
    )::text, 'UTF8'
  ), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-webhook-command|' || target_workspace.organization_id::text ||
      '|' || target_idempotency_key, 0
  ));
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_workspace.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'notification.webhook.create'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'notification webhook command idempotency conflict';
    end if;
    return query select endpoint.public_id, endpoint.state,
      'duplicate'::text, endpoint.previous_secret_expires_at
    from loyalty_private.notification_webhook_endpoints as endpoint
    where endpoint.organization_id = target_workspace.organization_id
      and endpoint.public_id = existing_audit.resource_public_id;
    return;
  end if;
  if (
    select pg_catalog.count(*)
    from loyalty_private.notification_webhook_endpoints as endpoint
    where endpoint.organization_id = target_workspace.organization_id
      and endpoint.state <> 'retired'
  ) >= 20 then
    raise exception using errcode = '23514',
      message = 'notification webhook endpoint limit reached';
  end if;
  insert into loyalty_private.notification_webhook_endpoints (
    organization_id, destination_url, allowed_origin,
    current_secret_sha256, event_types, rate_limit_per_minute, state,
    label, current_secret_hint, created_by_user_id, updated_by_user_id,
    last_change_reason, created_at, updated_at
  ) values (
    target_workspace.organization_id, target_destination_url,
    target_allowed_origin, target_current_secret_sha256, target_event_types,
    target_rate_limit_per_minute, 'disabled', target_label,
    target_current_secret_hint, target_actor_user_id, target_actor_user_id,
    'created awaiting reviewed worker deployment', command_time, command_time
  ) returning * into strict created_endpoint;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata, created_at
  ) values (
    created_endpoint.organization_id, target_actor_user_id,
    'notification.webhook.create', 'notification_webhook_endpoint',
    created_endpoint.public_id, target_idempotency_key, request_hash,
    target_correlation_id, pg_catalog.jsonb_build_object(
      'workspaceId', target_workspace.public_id,
      'label', target_label,
      'destinationSha256', pg_catalog.encode(extensions.digest(
        pg_catalog.convert_to(target_destination_url, 'UTF8'), 'sha256'
      ), 'hex'),
      'eventTypes', target_event_types,
      'rateLimitPerMinute', target_rate_limit_per_minute,
      'secretHint', target_current_secret_hint,
      'state', 'disabled'
    ), command_time
  );
  return query select created_endpoint.public_id, created_endpoint.state,
    'created'::text, null::timestamptz;
end;
$$;

create or replace function loyalty_private.rotate_notification_webhook_endpoint_v1(
  target_actor_user_id uuid,
  target_endpoint_public_id uuid,
  target_current_secret_sha256 bytea,
  target_current_secret_hint text,
  target_overlap_seconds integer,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  endpoint_public_id uuid,
  endpoint_state text,
  outcome text,
  prior_secret_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_endpoint loyalty_private.notification_webhook_endpoints%rowtype;
  target_organization_public_id uuid;
  entitlement_enabled boolean;
  request_hash bytea;
  existing_audit loyalty.admin_audit_events%rowtype;
  prior_expiry timestamptz;
  command_time timestamptz := pg_catalog.clock_timestamp();
begin
  if target_actor_user_id is null or target_endpoint_public_id is null
    or target_current_secret_sha256 is null
    or pg_catalog.octet_length(target_current_secret_sha256) <> 32
    or target_current_secret_hint !~ '^[A-Za-z0-9_-]{6}$'
    or target_overlap_seconds not between 0 and 86400
    or target_idempotency_key is null
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or pg_catalog.length(target_idempotency_key) not between 1 and 200
    or target_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid notification webhook rotation command';
  end if;
  select endpoint.* into target_endpoint
  from loyalty_private.notification_webhook_endpoints as endpoint
  where endpoint.public_id = target_endpoint_public_id
    and exists (
      select 1 from loyalty.organization_memberships as membership
      where membership.organization_id = endpoint.organization_id
        and membership.user_id = target_actor_user_id
        and membership.role in ('owner', 'admin')
        and membership.revoked_at is null
    )
  for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'notification webhook rotation not authorized';
  end if;
  if target_endpoint.state <> 'disabled' then
    raise exception using errcode = '23514',
      message = 'disable the webhook endpoint before rotating it';
  end if;
  if target_endpoint.current_secret_sha256 = target_current_secret_sha256 then
    raise exception using errcode = '23514',
      message = 'webhook rotation secret must be new';
  end if;
  select organization.public_id into strict target_organization_public_id
  from loyalty.organizations as organization
  where organization.id = target_endpoint.organization_id
    and organization.status = 'active';
  select entitlement.enabled into entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_endpoint.organization_id, 'notifications',
    target_endpoint.public_id::text, command_time
  ) as entitlement;
  if not coalesce(entitlement_enabled, false) then
    raise exception using errcode = '42501',
      message = 'notifications are not enabled for this organization';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'notification-webhook.rotate|' || target_endpoint.public_id::text || '|' ||
      target_overlap_seconds::text, 'UTF8'
  ), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-webhook-command|' || target_endpoint.organization_id::text ||
      '|' || target_idempotency_key, 0
  ));
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_endpoint.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'notification.webhook.rotate'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'notification webhook rotation idempotency conflict';
    end if;
    return query select endpoint.public_id, endpoint.state,
      'duplicate'::text, endpoint.previous_secret_expires_at
    from loyalty_private.notification_webhook_endpoints as endpoint
    where endpoint.organization_id = target_endpoint.organization_id
      and endpoint.public_id = existing_audit.resource_public_id;
    return;
  end if;
  prior_expiry := case when target_overlap_seconds = 0 then command_time
    else command_time + pg_catalog.make_interval(secs => target_overlap_seconds)
  end;
  update loyalty_private.notification_webhook_endpoints
  set previous_secret_sha256 = case when target_overlap_seconds = 0
        then null else target_endpoint.current_secret_sha256 end,
      previous_secret_hint = case when target_overlap_seconds = 0
        then null else target_endpoint.current_secret_hint end,
      previous_secret_expires_at = case when target_overlap_seconds = 0
        then null else prior_expiry end,
      current_secret_sha256 = target_current_secret_sha256,
      current_secret_hint = target_current_secret_hint,
      updated_by_user_id = target_actor_user_id,
      last_change_reason = 'signing secret rotated while disabled'
  where id = target_endpoint.id
  returning * into strict target_endpoint;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata, created_at
  ) values (
    target_endpoint.organization_id, target_actor_user_id,
    'notification.webhook.rotate', 'notification_webhook_endpoint',
    target_endpoint.public_id, target_idempotency_key, request_hash,
    target_correlation_id, pg_catalog.jsonb_build_object(
      'secretHint', target_current_secret_hint,
      'overlapSeconds', target_overlap_seconds,
      'priorSecretExpiresAt', prior_expiry,
      'state', target_endpoint.state
    ), command_time
  );
  return query select target_endpoint.public_id, target_endpoint.state,
    'rotated'::text, prior_expiry;
end;
$$;

create or replace function loyalty_private.change_notification_webhook_endpoint_state_v1(
  target_actor_user_id uuid,
  target_endpoint_public_id uuid,
  target_action text,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  endpoint_public_id uuid,
  endpoint_state text,
  outcome text,
  prior_secret_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_endpoint loyalty_private.notification_webhook_endpoints%rowtype;
  request_hash bytea;
  existing_audit loyalty.admin_audit_events%rowtype;
  command_outcome text;
  command_time timestamptz := pg_catalog.clock_timestamp();
begin
  if target_actor_user_id is null or target_endpoint_public_id is null
    or target_action not in ('disable', 'retire')
    or target_reason is null or target_reason <> pg_catalog.btrim(target_reason)
    or pg_catalog.length(target_reason) not between 1 and 200
    or target_reason ~ '[[:cntrl:]]'
    or target_idempotency_key is null
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or pg_catalog.length(target_idempotency_key) not between 1 and 200
    or target_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid notification webhook lifecycle command';
  end if;
  select endpoint.* into target_endpoint
  from loyalty_private.notification_webhook_endpoints as endpoint
  where endpoint.public_id = target_endpoint_public_id
    and exists (
      select 1 from loyalty.organization_memberships as membership
      where membership.organization_id = endpoint.organization_id
        and membership.user_id = target_actor_user_id
        and membership.role in ('owner', 'admin')
        and membership.revoked_at is null
    )
  for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'notification webhook lifecycle not authorized';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'notification-webhook.' || target_action || '|' ||
      target_endpoint.public_id::text || '|' || target_reason, 'UTF8'
  ), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-webhook-command|' || target_endpoint.organization_id::text ||
      '|' || target_idempotency_key, 0
  ));
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_endpoint.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'notification.webhook.' || target_action
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'notification webhook lifecycle idempotency conflict';
    end if;
    return query select endpoint.public_id, endpoint.state,
      'duplicate'::text, endpoint.previous_secret_expires_at
    from loyalty_private.notification_webhook_endpoints as endpoint
    where endpoint.organization_id = target_endpoint.organization_id
      and endpoint.public_id = existing_audit.resource_public_id;
    return;
  end if;
  if target_action = 'disable' then
    command_outcome := case
      when target_endpoint.state = 'retired' then 'already_retired'
      when target_endpoint.state = 'disabled' then 'already_disabled'
      else 'disabled'
    end;
    if target_endpoint.state = 'active' then
      update loyalty_private.notification_webhook_endpoints
      set state = 'disabled', updated_by_user_id = target_actor_user_id,
        last_change_reason = target_reason
      where id = target_endpoint.id
      returning * into strict target_endpoint;
    end if;
  else
    if target_endpoint.state = 'active' then
      raise exception using errcode = '23514',
        message = 'disable the webhook endpoint before retiring it';
    end if;
    command_outcome := case when target_endpoint.state = 'retired'
      then 'already_retired' else 'retired' end;
    if target_endpoint.state <> 'retired' then
      update loyalty_private.notification_webhook_endpoints
      set state = 'retired',
        destination_url = 'https://retired.invalid/webhook/' || public_id::text,
        allowed_origin = 'https://retired.invalid',
        current_secret_sha256 = extensions.digest(pg_catalog.convert_to(
          'retired|' || public_id::text || '|' || command_time::text, 'UTF8'
        ), 'sha256'),
        current_secret_hint = null,
        previous_secret_sha256 = null,
        previous_secret_hint = null,
        previous_secret_expires_at = null,
        retired_at = command_time,
        updated_by_user_id = target_actor_user_id,
        last_change_reason = target_reason
      where id = target_endpoint.id
      returning * into strict target_endpoint;
    end if;
  end if;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata, created_at
  ) values (
    target_endpoint.organization_id, target_actor_user_id,
    'notification.webhook.' || target_action,
    'notification_webhook_endpoint', target_endpoint.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    pg_catalog.jsonb_build_object(
      'reason', target_reason, 'outcome', command_outcome,
      'state', target_endpoint.state
    ), command_time
  );
  return query select target_endpoint.public_id, target_endpoint.state,
    command_outcome, target_endpoint.previous_secret_expires_at;
end;
$$;

create or replace function loyalty.get_notification_webhook_endpoints_v1(
  target_workspace_public_id uuid
)
returns table (document jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_workspace loyalty.workspaces%rowtype;
  actor_role text;
  generated_at timestamptz := pg_catalog.statement_timestamp();
  endpoints jsonb;
begin
  if actor_user_id is null or target_workspace_public_id is null then
    raise exception using errcode = '22023',
      message = 'invalid notification webhook endpoint read';
  end if;
  select workspace.* into target_workspace
  from loyalty.workspaces as workspace
  where workspace.public_id = target_workspace_public_id
    and workspace.status = 'active'
    and exists (
      select 1 from loyalty.organization_memberships as membership
      where membership.organization_id = workspace.organization_id
        and membership.user_id = actor_user_id
        and membership.role in (
          'owner', 'admin', 'operator', 'analyst', 'auditor'
        )
        and membership.revoked_at is null
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'notification webhook endpoint read not authorized';
  end if;
  select membership.role into strict actor_role
  from loyalty.organization_memberships as membership
  where membership.organization_id = target_workspace.organization_id
    and membership.user_id = actor_user_id
    and membership.revoked_at is null;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'schemaVersion', '1',
      'endpointId', endpoint.public_id,
      'label', endpoint.label,
      'state', endpoint.state,
      'destinationUrl', case when endpoint.state = 'retired'
        then null else endpoint.destination_url end,
      'eventTypes', pg_catalog.to_jsonb(endpoint.event_types),
      'rateLimitPerMinute', endpoint.rate_limit_per_minute,
      'currentSecretHint', endpoint.current_secret_hint,
      'previousSecretHint', case
        when endpoint.previous_secret_expires_at > generated_at
          then endpoint.previous_secret_hint else null end,
      'previousSecretExpiresAt', case
        when endpoint.previous_secret_expires_at > generated_at
          then endpoint.previous_secret_expires_at else null end,
      'counts', pg_catalog.jsonb_build_object(
        'pending', counts.pending,
        'processing', counts.processing,
        'retryable', counts.retryable,
        'held', counts.held,
        'completed', counts.completed,
        'suppressed', counts.suppressed,
        'deadLetter', counts.dead_letter,
        'manualReview', counts.manual_review
      ),
      'lastAttemptAt', attempts.last_attempt_at,
      'lastErrorCode', latest.last_error_code,
      'createdAt', endpoint.created_at,
      'updatedAt', endpoint.updated_at,
      'retiredAt', endpoint.retired_at
    ) order by endpoint.created_at desc, endpoint.id desc
  ), '[]'::jsonb) into endpoints
  from (
    select candidate.*
    from loyalty_private.notification_webhook_endpoints as candidate
    where candidate.organization_id = target_workspace.organization_id
    order by candidate.created_at desc, candidate.id desc
    limit 50
  ) as endpoint
  cross join lateral (
    select
      pg_catalog.count(*) filter (where delivery.state = 'pending')::text
        as pending,
      pg_catalog.count(*) filter (where delivery.state = 'processing')::text
        as processing,
      pg_catalog.count(*) filter (where delivery.state = 'retryable')::text
        as retryable,
      pg_catalog.count(*) filter (where delivery.state = 'held')::text
        as held,
      pg_catalog.count(*) filter (where delivery.state = 'completed')::text
        as completed,
      pg_catalog.count(*) filter (where delivery.state = 'suppressed')::text
        as suppressed,
      pg_catalog.count(*) filter (where delivery.state = 'dead_letter')::text
        as dead_letter,
      pg_catalog.count(*) filter (where delivery.state = 'manual_review')::text
        as manual_review
    from loyalty_private.notification_webhook_deliveries as delivery
    where delivery.endpoint_id = endpoint.id
  ) as counts
  cross join lateral (
    select pg_catalog.max(attempt.completed_at) as last_attempt_at
    from loyalty_private.notification_webhook_attempts as attempt
    join loyalty_private.notification_webhook_deliveries as delivery
      on delivery.organization_id = attempt.organization_id
     and delivery.id = attempt.delivery_id
    where delivery.endpoint_id = endpoint.id
  ) as attempts
  left join lateral (
    select delivery.last_error_code
    from loyalty_private.notification_webhook_deliveries as delivery
    where delivery.endpoint_id = endpoint.id
      and delivery.last_error_code is not null
    order by delivery.updated_at desc, delivery.id desc
    limit 1
  ) as latest on true;
  return query select pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'generatedAt', generated_at,
    'canManage', actor_role in ('owner', 'admin'),
    'endpoints', endpoints
  );
end;
$$;

alter function loyalty_private.protect_notification_webhook_endpoint_v1()
  owner to loyalty_owner;
alter function loyalty_private.record_notification_webhook_endpoint_revision_v1()
  owner to loyalty_owner;
alter function loyalty_private.create_notification_webhook_endpoint_v1(
  uuid, uuid, text, text, bytea, text, text[], integer, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.rotate_notification_webhook_endpoint_v1(
  uuid, uuid, bytea, text, integer, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.change_notification_webhook_endpoint_state_v1(
  uuid, uuid, text, text, text, uuid
) owner to loyalty_owner;
alter function loyalty.get_notification_webhook_endpoints_v1(uuid)
  owner to loyalty_owner;

revoke all on loyalty_private.notification_webhook_endpoint_revisions
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function
  loyalty_private.record_notification_webhook_endpoint_revision_v1(),
  loyalty_private.create_notification_webhook_endpoint_v1(
    uuid, uuid, text, text, bytea, text, text[], integer, text, uuid
  ),
  loyalty_private.rotate_notification_webhook_endpoint_v1(
    uuid, uuid, bytea, text, integer, text, uuid
  ),
  loyalty_private.change_notification_webhook_endpoint_state_v1(
    uuid, uuid, text, text, text, uuid
  ) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_notification_webhook_endpoints_v1(uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty_private.create_notification_webhook_endpoint_v1(
    uuid, uuid, text, text, bytea, text, text[], integer, text, uuid
  ),
  loyalty_private.rotate_notification_webhook_endpoint_v1(
    uuid, uuid, bytea, text, integer, text, uuid
  ),
  loyalty_private.change_notification_webhook_endpoint_state_v1(
    uuid, uuid, text, text, text, uuid
  ) to loyalty_runtime;
grant execute on function loyalty.get_notification_webhook_endpoints_v1(uuid)
  to authenticated;

comment on table loyalty_private.notification_webhook_endpoint_revisions is
  'Append-only non-secret endpoint lifecycle evidence retaining state, subscriptions, destination digest, and bounded hints without a reusable secret or live retired destination.';
comment on function loyalty_private.create_notification_webhook_endpoint_v1(
  uuid, uuid, text, text, bytea, text, text[], integer, text, uuid
) is 'Creates one disabled tenant-derived webhook endpoint from a server-generated secret fingerprint; raw signing material never enters PostgreSQL.';
comment on function loyalty_private.rotate_notification_webhook_endpoint_v1(
  uuid, uuid, bytea, text, integer, text, uuid
) is 'Rotates one disabled endpoint to a new fingerprint with a bounded optional prior-key overlap and immutable audit evidence.';
comment on function loyalty_private.change_notification_webhook_endpoint_state_v1(
  uuid, uuid, text, text, text, uuid
) is 'Immediately disables or terminally retires one endpoint; retirement removes the live destination and signing fingerprints without deleting delivery evidence.';
comment on function loyalty.get_notification_webhook_endpoints_v1(uuid) is
  'Returns a bounded Auth-scoped endpoint/data-flow health document without fingerprints, payloads, contacts, response bodies, signatures, or worker identities.';
