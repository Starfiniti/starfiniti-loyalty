-- M08-S03 managed Klaviyo projection. Contacts are resolved only inside an
-- exact tenant/connection/key-fingerprint lease and are never persisted here.

create table loyalty_private.notification_klaviyo_connections (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  provider text not null default 'klaviyo' check (provider = 'klaviyo'),
  api_revision text not null default '2026-07-15'
    check (api_revision = '2026-07-15'),
  credential_sha256 bytea not null
    check (pg_catalog.octet_length(credential_sha256) = 32),
  list_id text,
  state text not null default 'disabled'
    check (state in ('disabled', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider),
  unique (organization_id, id),
  check (list_id is null or list_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  check (updated_at >= created_at)
);

create table loyalty_private.notification_klaviyo_profiles (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  connection_id bigint not null,
  customer_id bigint not null,
  provider_profile_id text not null
    check (provider_profile_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, customer_id),
  unique (connection_id, provider_profile_id),
  unique (organization_id, id),
  foreign key (organization_id, connection_id)
    references loyalty_private.notification_klaviyo_connections(
      organization_id, id
    ) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  check (updated_at >= created_at)
);

create table loyalty_private.notification_klaviyo_operations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  connection_id bigint not null,
  customer_id bigint not null,
  operation_kind text not null
    check (operation_kind in ('event_sync', 'consent_sync')),
  notification_event_id bigint,
  preference_event_id bigint,
  state text not null default 'pending' check (state in (
    'pending', 'processing', 'retryable', 'held', 'completed',
    'suppressed', 'superseded', 'contact_unavailable', 'dead_letter',
    'manual_review'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  prepared_at timestamptz,
  action_authorized_at timestamptz,
  accepted_at timestamptz,
  last_error_code text,
  last_response_code integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, connection_id)
    references loyalty_private.notification_klaviyo_connections(
      organization_id, id
    ) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, notification_event_id)
    references loyalty_private.notification_events(organization_id, id)
    on delete restrict,
  foreign key (organization_id, preference_event_id)
    references loyalty_private.notification_preference_events(
      organization_id, id
    ) on delete restrict,
  check (
    (operation_kind = 'event_sync' and notification_event_id is not null
      and preference_event_id is null)
    or (operation_kind = 'consent_sync' and preference_event_id is not null
      and notification_event_id is null)
  ),
  check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (last_response_code is null or last_response_code between 200 and 599),
  check (
    (state = 'processing' and locked_by is not null and locked_at is not null
      and lease_expires_at is not null)
    or (state <> 'processing' and locked_by is null and locked_at is null
      and lease_expires_at is null and prepared_at is null
      and action_authorized_at is null)
  ),
  check (prepared_at is null or prepared_at >= locked_at),
  check (action_authorized_at is null or (
    prepared_at is not null and action_authorized_at >= prepared_at
  )),
  check ((state = 'completed') = (accepted_at is not null)),
  check (accepted_at is null or accepted_at >= created_at),
  check (updated_at >= created_at)
);

create unique index notification_klaviyo_event_operation_uidx
  on loyalty_private.notification_klaviyo_operations(
    connection_id, notification_event_id
  ) where notification_event_id is not null;
create unique index notification_klaviyo_preference_operation_uidx
  on loyalty_private.notification_klaviyo_operations(
    connection_id, preference_event_id
  ) where preference_event_id is not null;
create index notification_klaviyo_operations_claim_idx
  on loyalty_private.notification_klaviyo_operations(
    connection_id, state, next_attempt_at, created_at, id
  ) where state in ('pending', 'retryable', 'held', 'processing');

create table loyalty_private.notification_klaviyo_operation_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  operation_id bigint not null,
  attempt_number integer,
  phase text not null check (phase in (
    'preparation', 'profile', 'provider_check', 'event',
    'subscribe', 'unsubscribe'
  )),
  worker_reference text not null,
  outcome text not null check (outcome in (
    'profile_synced', 'accepted', 'retryable', 'dead_letter',
    'manual_review', 'held', 'suppressed', 'superseded',
    'contact_unavailable', 'lease_expired_before_action',
    'lease_expired_after_action'
  )),
  response_class text not null check (response_class in (
    'success', 'temporary_failure', 'permanent_failure', 'ambiguous',
    'policy', 'contact'
  )),
  response_code integer,
  retry_after_seconds integer,
  error_code text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, operation_id)
    references loyalty_private.notification_klaviyo_operations(
      organization_id, id
    ) on delete restrict,
  check (attempt_number is null or attempt_number between 1 and 10),
  check (pg_catalog.length(worker_reference) between 1 and 200),
  check (response_code is null or response_code between 200 and 599),
  check (retry_after_seconds is null or retry_after_seconds between 1 and 86400),
  check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (completed_at >= started_at)
);

create unique index notification_klaviyo_attempt_phase_uidx
  on loyalty_private.notification_klaviyo_operation_attempts(
    operation_id, attempt_number, phase
  ) where attempt_number is not null;

create or replace function loyalty_private.enqueue_managed_klaviyo_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_connection_id bigint;
  target_mode text;
  target_enabled boolean;
  checked_at timestamptz := pg_catalog.statement_timestamp();
begin
  if new.customer_id is null then return new; end if;
  select connection.id into target_connection_id
  from loyalty_private.notification_klaviyo_connections as connection
  where connection.organization_id = new.organization_id
    and connection.state = 'active';
  if target_connection_id is null then return new; end if;
  select entitlement.deployment_mode, entitlement.enabled
    into target_mode, target_enabled
  from loyalty_private.resolve_organization_entitlement(
    new.organization_id, 'notifications', new.public_id::text, checked_at
  ) as entitlement;
  if target_mode <> 'managed' or not target_enabled then return new; end if;
  insert into loyalty_private.notification_klaviyo_operations(
    organization_id, connection_id, customer_id, operation_kind,
    notification_event_id, next_attempt_at
  ) values (
    new.organization_id, target_connection_id, new.customer_id, 'event_sync',
    new.id, new.created_at
  ) on conflict (connection_id, notification_event_id)
    where notification_event_id is not null do nothing;
  return new;
end;
$$;

create or replace function loyalty_private.enqueue_managed_klaviyo_consent_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_connection_id bigint;
  target_mode text;
  target_enabled boolean;
  checked_at timestamptz := pg_catalog.statement_timestamp();
begin
  if new.channel <> 'email' or new.purpose <> 'loyalty_marketing' then
    return new;
  end if;
  select connection.id into target_connection_id
  from loyalty_private.notification_klaviyo_connections as connection
  where connection.organization_id = new.organization_id
    and connection.state = 'active';
  if target_connection_id is null then return new; end if;
  select entitlement.deployment_mode, entitlement.enabled
    into target_mode, target_enabled
  from loyalty_private.resolve_organization_entitlement(
    new.organization_id, 'notifications', new.public_id::text, checked_at
  ) as entitlement;
  if target_mode <> 'managed' or not target_enabled then return new; end if;
  insert into loyalty_private.notification_klaviyo_operations(
    organization_id, connection_id, customer_id, operation_kind,
    preference_event_id, next_attempt_at
  ) values (
    new.organization_id, target_connection_id, new.customer_id, 'consent_sync',
    new.id, new.created_at
  ) on conflict (connection_id, preference_event_id)
    where preference_event_id is not null do nothing;
  return new;
end;
$$;

create trigger notification_events_enqueue_managed_klaviyo
after insert on loyalty_private.notification_events
for each row execute function
  loyalty_private.enqueue_managed_klaviyo_event_v1();
create trigger notification_preferences_enqueue_managed_klaviyo
after insert on loyalty_private.notification_preference_events
for each row execute function
  loyalty_private.enqueue_managed_klaviyo_consent_v1();

create or replace function loyalty_private.claim_klaviyo_notification_operations_v1(
  target_connection_public_id uuid,
  target_credential_sha256 text,
  target_worker_id text,
  target_batch_size integer default 10,
  target_lease_seconds integer default 60
)
returns table (
  schema_version text,
  operation_public_id uuid,
  operation_kind text,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_connection loyalty_private.notification_klaviyo_connections%rowtype;
  claimed_at timestamptz := pg_catalog.clock_timestamp();
begin
  if target_connection_public_id is null
    or target_credential_sha256 !~ '^[a-f0-9]{64}$'
    or target_worker_id is null
    or pg_catalog.length(target_worker_id) not between 1 and 200
    or target_batch_size not between 1 and 50
    or target_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023',
      message = 'invalid Klaviyo notification claim';
  end if;
  select connection.* into target_connection
  from loyalty_private.notification_klaviyo_connections as connection
  where connection.public_id = target_connection_public_id
    and connection.state = 'active'
    and connection.credential_sha256 = pg_catalog.decode(
      target_credential_sha256, 'hex'
    );
  if target_connection.id is null then
    raise exception using errcode = '42501',
      message = 'Klaviyo connection not authorized';
  end if;

  with expired_candidates as materialized (
    select operation.id, operation.prepared_at is not null as had_prepared,
      operation.action_authorized_at is not null as had_action,
      operation.operation_kind, preference.to_state,
      operation.locked_by as prior_worker, operation.locked_at as prior_started
    from loyalty_private.notification_klaviyo_operations as operation
    left join loyalty_private.notification_preference_events as preference
      on preference.organization_id = operation.organization_id
     and preference.id = operation.preference_event_id
    where operation.connection_id = target_connection.id
      and operation.state = 'processing'
      and operation.lease_expires_at <= claimed_at
    order by operation.lease_expires_at, operation.id
    for update of operation skip locked
    limit target_batch_size
  ), expired as (
    update loyalty_private.notification_klaviyo_operations as operation
    set state = case
        when candidate.had_action and candidate.operation_kind = 'consent_sync'
          and candidate.to_state = 'subscribed' then 'manual_review'
        else 'retryable' end,
      next_attempt_at = case
        when candidate.had_action and candidate.operation_kind = 'consent_sync'
          and candidate.to_state = 'subscribed' then null
        else claimed_at end,
      last_error_code = case when candidate.had_action
        then 'lease_expired_after_action' else 'lease_expired_before_action' end,
      locked_by = null, locked_at = null, lease_expires_at = null,
      prepared_at = null, action_authorized_at = null, updated_at = claimed_at
    from expired_candidates as candidate
    where operation.id = candidate.id
    returning operation.*, candidate.had_prepared, candidate.had_action,
      candidate.prior_worker, candidate.prior_started
  )
  insert into loyalty_private.notification_klaviyo_operation_attempts(
    organization_id, operation_id, attempt_number, phase, worker_reference,
    outcome, response_class, error_code, started_at, completed_at
  )
  select expired.organization_id, expired.id,
    case when expired.had_prepared then expired.attempt_count else null end,
    'preparation', coalesce(expired.prior_worker, 'expired-lease-recovery'),
    case when expired.had_action then 'lease_expired_after_action'
      else 'lease_expired_before_action' end,
    case when expired.had_action then 'ambiguous' else 'temporary_failure' end,
    case when expired.had_action then 'lease_expired_after_action'
      else 'lease_expired_before_action' end,
    coalesce(expired.prior_started, claimed_at), claimed_at
  from expired;

  return query
  with candidates as materialized (
    select operation.id
    from loyalty_private.notification_klaviyo_operations as operation
    cross join lateral loyalty_private.resolve_organization_entitlement(
      operation.organization_id, 'notifications', operation.public_id::text,
      claimed_at
    ) as entitlement
    where operation.connection_id = target_connection.id
      and operation.state in ('pending', 'retryable', 'held')
      and operation.attempt_count < 10
      and coalesce(operation.next_attempt_at, claimed_at) <= claimed_at
      and entitlement.deployment_mode = 'managed' and entitlement.enabled
    order by coalesce(operation.next_attempt_at, operation.created_at), operation.id
    for update of operation skip locked
    limit target_batch_size
  ), claimed as (
    update loyalty_private.notification_klaviyo_operations as operation
    set state = 'processing', locked_by = target_worker_id, locked_at = claimed_at,
      lease_expires_at = claimed_at + pg_catalog.make_interval(
        secs => target_lease_seconds
      ), prepared_at = null, action_authorized_at = null,
      updated_at = claimed_at
    from candidates as candidate
    where operation.id = candidate.id
    returning operation.public_id, operation.operation_kind,
      operation.lease_expires_at
  )
  select '1'::text, claimed.public_id, claimed.operation_kind,
    claimed.lease_expires_at
  from claimed order by claimed.lease_expires_at, claimed.public_id;
end;
$$;

create or replace function loyalty_private.prepare_klaviyo_notification_operation_v1(
  target_connection_public_id uuid,
  target_credential_sha256 text,
  target_operation_public_id uuid,
  target_worker_id text
)
returns table (
  schema_version text,
  operation_public_id uuid,
  outcome text,
  operation_kind text,
  attempt_count integer,
  recipient_email text,
  external_customer_public_id uuid,
  provider_profile_id text,
  api_revision text,
  list_id text,
  preference_event_public_id uuid,
  desired_state text,
  effective_at timestamptz,
  event jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection loyalty_private.notification_klaviyo_connections%rowtype;
  operation loyalty_private.notification_klaviyo_operations%rowtype;
  source_event loyalty_private.notification_events%rowtype;
  preference_event loyalty_private.notification_preference_events%rowtype;
  current_preference loyalty_private.notification_preferences%rowtype;
  entitlement record;
  customer_public_id uuid;
  resolved_email text;
  mapped_profile_id text;
  authorization_time timestamptz := pg_catalog.clock_timestamp();
  terminal_outcome text;
  terminal_error text;
begin
  if target_connection_public_id is null
    or target_credential_sha256 !~ '^[a-f0-9]{64}$'
    or target_operation_public_id is null or target_worker_id is null
    or pg_catalog.length(target_worker_id) not between 1 and 200 then
    raise exception using errcode = '22023',
      message = 'invalid Klaviyo notification preparation';
  end if;
  select candidate.* into connection
  from loyalty_private.notification_klaviyo_connections as candidate
  where candidate.public_id = target_connection_public_id
    and candidate.state = 'active'
    and candidate.credential_sha256 = pg_catalog.decode(
      target_credential_sha256, 'hex'
    );
  if connection.id is null then
    raise exception using errcode = '42501',
      message = 'Klaviyo connection not authorized';
  end if;
  select candidate.* into operation
  from loyalty_private.notification_klaviyo_operations as candidate
  where candidate.public_id = target_operation_public_id
    and candidate.connection_id = connection.id
  for update;
  if operation.id is null or operation.state <> 'processing'
    or operation.locked_by <> target_worker_id
    or operation.lease_expires_at <= authorization_time
    or operation.prepared_at is not null then
    raise exception using errcode = '42501',
      message = 'Klaviyo notification lease not owned';
  end if;
  select resolved.* into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    operation.organization_id, 'notifications', operation.public_id::text,
    authorization_time
  ) as resolved;
  if entitlement.deployment_mode <> 'managed' or not entitlement.enabled then
    terminal_outcome := 'held'; terminal_error := 'feature_disabled';
  elsif operation.operation_kind = 'event_sync' then
    select source.* into strict source_event
    from loyalty_private.notification_events as source
    where source.organization_id = operation.organization_id
      and source.id = operation.notification_event_id
      and source.customer_id = operation.customer_id;
    select preference.* into current_preference
    from loyalty_private.notification_preferences as preference
    where preference.organization_id = operation.organization_id
      and preference.customer_id = operation.customer_id
      and preference.channel = 'email'
      and preference.purpose = source_event.purpose;
    if coalesce(current_preference.state, case
      when source_event.purpose = 'loyalty_transactional'
        then 'subscribed' else 'unsubscribed' end) <> 'subscribed' then
      terminal_outcome := 'suppressed'; terminal_error := 'consent_not_subscribed';
    end if;
  else
    select source.* into strict preference_event
    from loyalty_private.notification_preference_events as source
    where source.organization_id = operation.organization_id
      and source.id = operation.preference_event_id
      and source.customer_id = operation.customer_id
      and source.channel = 'email' and source.purpose = 'loyalty_marketing';
    select preference.* into current_preference
    from loyalty_private.notification_preferences as preference
    where preference.organization_id = operation.organization_id
      and preference.customer_id = operation.customer_id
      and preference.channel = 'email'
      and preference.purpose = 'loyalty_marketing';
    if current_preference.last_event_id is distinct from preference_event.id then
      terminal_outcome := 'superseded'; terminal_error := 'preference_superseded';
    elsif current_preference.state = 'suppressed' then
      terminal_outcome := 'suppressed'; terminal_error := 'provider_suppressed';
    end if;
  end if;

  if terminal_outcome is null then
    select customer.public_id,
      loyalty_private.resolve_verified_auth_email_v1(link.auth_user_id)
      into customer_public_id, resolved_email
    from loyalty.customers as customer
    join loyalty.customer_user_links as link
      on link.organization_id = customer.organization_id
     and link.customer_id = customer.id and link.revoked_at is null
    where customer.organization_id = operation.organization_id
      and customer.id = operation.customer_id and customer.status = 'active'
    order by link.linked_at desc, link.id desc
    limit 1;
    if resolved_email is null then
      terminal_outcome := 'contact_unavailable';
      terminal_error := 'verified_contact_unavailable';
    end if;
  end if;

  if terminal_outcome is not null then
    update loyalty_private.notification_klaviyo_operations
    set state = terminal_outcome, next_attempt_at = null,
      last_error_code = terminal_error, locked_by = null, locked_at = null,
      lease_expires_at = null, prepared_at = null,
      action_authorized_at = null, updated_at = authorization_time
    where id = operation.id;
    insert into loyalty_private.notification_klaviyo_operation_attempts(
      organization_id, operation_id, phase, worker_reference, outcome,
      response_class, error_code, started_at, completed_at
    ) values (
      operation.organization_id, operation.id, 'preparation', target_worker_id,
      terminal_outcome,
      case when terminal_outcome = 'contact_unavailable'
        then 'contact' else 'policy' end,
      terminal_error, operation.locked_at, authorization_time
    );
    return query select '1'::text, operation.public_id, terminal_outcome,
      null::text, null::integer, null::text, null::uuid, null::text,
      null::text, null::text, null::uuid, null::text, null::timestamptz,
      null::jsonb;
    return;
  end if;

  select profile.provider_profile_id into mapped_profile_id
  from loyalty_private.notification_klaviyo_profiles as profile
  where profile.connection_id = connection.id
    and profile.customer_id = operation.customer_id;
  update loyalty_private.notification_klaviyo_operations as updated_operation
  set attempt_count = updated_operation.attempt_count + 1,
    prepared_at = authorization_time, updated_at = authorization_time
  where updated_operation.id = operation.id
  returning updated_operation.attempt_count into operation.attempt_count;
  return query select '1'::text, operation.public_id, 'authorized'::text,
    operation.operation_kind, operation.attempt_count, resolved_email,
    customer_public_id, mapped_profile_id, connection.api_revision,
    connection.list_id,
    case when operation.operation_kind = 'consent_sync'
      then preference_event.public_id else null end,
    case when operation.operation_kind = 'consent_sync'
      then preference_event.to_state else null end,
    case when operation.operation_kind = 'consent_sync'
      then preference_event.effective_at else null end,
    case when operation.operation_kind = 'event_sync'
      then loyalty_private.notification_event_json_v1(source_event.id)
      else null end;
end;
$$;

create or replace function loyalty_private.record_klaviyo_profile_v1(
  target_connection_public_id uuid,
  target_credential_sha256 text,
  target_operation_public_id uuid,
  target_worker_id text,
  target_provider_profile_id text,
  target_response_code integer
)
returns table (state text, provider_profile_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection loyalty_private.notification_klaviyo_connections%rowtype;
  operation loyalty_private.notification_klaviyo_operations%rowtype;
  existing_profile loyalty_private.notification_klaviyo_profiles%rowtype;
  conflicting_customer_id bigint;
  recorded_at timestamptz := pg_catalog.clock_timestamp();
begin
  if target_credential_sha256 !~ '^[a-f0-9]{64}$'
    or target_provider_profile_id !~ '^[A-Za-z0-9_-]{1,100}$'
    or target_response_code not in (200, 201) then
    raise exception using errcode = '22023',
      message = 'invalid Klaviyo profile result';
  end if;
  select candidate.* into connection
  from loyalty_private.notification_klaviyo_connections as candidate
  where candidate.public_id = target_connection_public_id
    and candidate.state = 'active'
    and candidate.credential_sha256 = pg_catalog.decode(
      target_credential_sha256, 'hex'
    );
  select candidate.* into operation
  from loyalty_private.notification_klaviyo_operations as candidate
  where candidate.public_id = target_operation_public_id
    and candidate.connection_id = connection.id
  for update;
  if connection.id is null or operation.id is null
    or operation.state <> 'processing' or operation.locked_by <> target_worker_id
    or operation.lease_expires_at <= recorded_at
    or operation.prepared_at is null
    or operation.action_authorized_at is not null then
    raise exception using errcode = '42501',
      message = 'Klaviyo profile lease not owned';
  end if;
  select profile.* into existing_profile
  from loyalty_private.notification_klaviyo_profiles as profile
  where profile.connection_id = connection.id
    and profile.customer_id = operation.customer_id
  for update;
  select profile.customer_id into conflicting_customer_id
  from loyalty_private.notification_klaviyo_profiles as profile
  where profile.connection_id = connection.id
    and profile.provider_profile_id = target_provider_profile_id
    and profile.customer_id <> operation.customer_id;
  if (existing_profile.id is not null
      and existing_profile.provider_profile_id <> target_provider_profile_id)
    or conflicting_customer_id is not null then
    update loyalty_private.notification_klaviyo_operations
    set state = 'manual_review', next_attempt_at = null,
      last_error_code = 'profile_mapping_conflict', locked_by = null,
      locked_at = null, lease_expires_at = null, prepared_at = null,
      action_authorized_at = null, updated_at = recorded_at
    where id = operation.id;
    insert into loyalty_private.notification_klaviyo_operation_attempts(
      organization_id, operation_id, attempt_number, phase, worker_reference,
      outcome, response_class, error_code, started_at, completed_at
    ) values (
      operation.organization_id, operation.id, operation.attempt_count,
      'profile', target_worker_id, 'manual_review', 'ambiguous',
      'profile_mapping_conflict', operation.prepared_at, recorded_at
    );
    return query select 'manual_review'::text, null::text;
    return;
  end if;
  if existing_profile.id is null then
    insert into loyalty_private.notification_klaviyo_profiles(
      organization_id, connection_id, customer_id, provider_profile_id
    ) values (
      operation.organization_id, connection.id, operation.customer_id,
      target_provider_profile_id
    );
  end if;
  insert into loyalty_private.notification_klaviyo_operation_attempts(
    organization_id, operation_id, attempt_number, phase, worker_reference,
    outcome, response_class, response_code, started_at, completed_at
  ) values (
    operation.organization_id, operation.id, operation.attempt_count,
    'profile', target_worker_id, 'profile_synced', 'success',
    target_response_code,
    operation.prepared_at, recorded_at
  );
  return query select 'processing'::text, target_provider_profile_id;
end;
$$;

create or replace function loyalty_private.authorize_klaviyo_provider_action_v1(
  target_connection_public_id uuid,
  target_credential_sha256 text,
  target_operation_public_id uuid,
  target_worker_id text
)
returns table (
  schema_version text,
  operation_public_id uuid,
  outcome text,
  action text,
  provider_profile_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection loyalty_private.notification_klaviyo_connections%rowtype;
  operation loyalty_private.notification_klaviyo_operations%rowtype;
  source_event loyalty_private.notification_events%rowtype;
  preference_event loyalty_private.notification_preference_events%rowtype;
  current_preference loyalty_private.notification_preferences%rowtype;
  entitlement record;
  mapped_profile_id text;
  target_action text;
  terminal_outcome text;
  terminal_error text;
  authorized_at timestamptz := pg_catalog.clock_timestamp();
begin
  if target_credential_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023',
      message = 'invalid Klaviyo action authorization';
  end if;
  select candidate.* into connection
  from loyalty_private.notification_klaviyo_connections as candidate
  where candidate.public_id = target_connection_public_id
    and candidate.state = 'active'
    and candidate.credential_sha256 = pg_catalog.decode(
      target_credential_sha256, 'hex'
    );
  select candidate.* into operation
  from loyalty_private.notification_klaviyo_operations as candidate
  where candidate.public_id = target_operation_public_id
    and candidate.connection_id = connection.id
  for update;
  if connection.id is null or operation.id is null
    or operation.state <> 'processing' or operation.locked_by <> target_worker_id
    or operation.lease_expires_at <= authorized_at
    or operation.prepared_at is null
    or operation.action_authorized_at is not null then
    raise exception using errcode = '42501',
      message = 'Klaviyo action lease not owned';
  end if;
  select resolved.* into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    operation.organization_id, 'notifications', operation.public_id::text,
    authorized_at
  ) as resolved;
  if entitlement.deployment_mode <> 'managed' or not entitlement.enabled then
    terminal_outcome := 'held'; terminal_error := 'feature_disabled';
  elsif operation.operation_kind = 'event_sync' then
    select source.* into strict source_event
    from loyalty_private.notification_events as source
    where source.organization_id = operation.organization_id
      and source.id = operation.notification_event_id;
    select preference.* into current_preference
    from loyalty_private.notification_preferences as preference
    where preference.organization_id = operation.organization_id
      and preference.customer_id = operation.customer_id
      and preference.channel = 'email'
      and preference.purpose = source_event.purpose;
    if coalesce(current_preference.state, case
      when source_event.purpose = 'loyalty_transactional'
        then 'subscribed' else 'unsubscribed' end) <> 'subscribed' then
      terminal_outcome := 'suppressed'; terminal_error := 'consent_not_subscribed';
    else target_action := 'event'; end if;
  else
    select source.* into strict preference_event
    from loyalty_private.notification_preference_events as source
    where source.organization_id = operation.organization_id
      and source.id = operation.preference_event_id;
    select preference.* into strict current_preference
    from loyalty_private.notification_preferences as preference
    where preference.organization_id = operation.organization_id
      and preference.customer_id = operation.customer_id
      and preference.channel = 'email'
      and preference.purpose = 'loyalty_marketing';
    if current_preference.last_event_id <> preference_event.id then
      terminal_outcome := 'superseded'; terminal_error := 'preference_superseded';
    elsif current_preference.state = 'suppressed' then
      terminal_outcome := 'suppressed'; terminal_error := 'provider_suppressed';
    else target_action := case when current_preference.state = 'subscribed'
      then 'subscribe' else 'unsubscribe' end;
    end if;
  end if;
  select profile.provider_profile_id into mapped_profile_id
  from loyalty_private.notification_klaviyo_profiles as profile
  where profile.connection_id = connection.id
    and profile.customer_id = operation.customer_id;
  if terminal_outcome is null and mapped_profile_id is null then
    raise exception using errcode = '55000',
      message = 'Klaviyo profile not recorded';
  end if;
  if terminal_outcome is not null then
    update loyalty_private.notification_klaviyo_operations
    set state = terminal_outcome, next_attempt_at = null,
      last_error_code = terminal_error, locked_by = null, locked_at = null,
      lease_expires_at = null, prepared_at = null,
      action_authorized_at = null, updated_at = authorized_at
    where id = operation.id;
    insert into loyalty_private.notification_klaviyo_operation_attempts(
      organization_id, operation_id, attempt_number, phase, worker_reference,
      outcome, response_class, error_code, started_at, completed_at
    ) values (
      operation.organization_id, operation.id, operation.attempt_count,
      'preparation', target_worker_id, terminal_outcome, 'policy',
      terminal_error, operation.prepared_at, authorized_at
    );
    return query select '1'::text, operation.public_id, terminal_outcome,
      null::text, null::text;
    return;
  end if;
  update loyalty_private.notification_klaviyo_operations
  set action_authorized_at = authorized_at, updated_at = authorized_at
  where id = operation.id;
  return query select '1'::text, operation.public_id, 'authorized'::text,
    target_action, mapped_profile_id;
end;
$$;

create or replace function loyalty_private.record_klaviyo_provider_suppression_v1(
  target_connection_public_id uuid,
  target_credential_sha256 text,
  target_operation_public_id uuid,
  target_worker_id text,
  target_reason_code text
)
returns table (state text, preference_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection loyalty_private.notification_klaviyo_connections%rowtype;
  operation loyalty_private.notification_klaviyo_operations%rowtype;
  suppression_result record;
  recorded_at timestamptz := pg_catalog.clock_timestamp();
begin
  if target_credential_sha256 !~ '^[a-f0-9]{64}$'
    or target_reason_code not in (
      'provider_unsubscribe', 'hard_bounce', 'spam_complaint', 'invalid_contact'
    ) then
    raise exception using errcode = '22023',
      message = 'invalid Klaviyo provider suppression';
  end if;
  select candidate.* into connection
  from loyalty_private.notification_klaviyo_connections as candidate
  where candidate.public_id = target_connection_public_id
    and candidate.state = 'active'
    and candidate.credential_sha256 = pg_catalog.decode(
      target_credential_sha256, 'hex'
    );
  select candidate.* into operation
  from loyalty_private.notification_klaviyo_operations as candidate
  where candidate.public_id = target_operation_public_id
    and candidate.connection_id = connection.id
  for update;
  if connection.id is null or operation.id is null
    or operation.operation_kind <> 'consent_sync'
    or operation.state <> 'processing' or operation.locked_by <> target_worker_id
    or operation.lease_expires_at <= recorded_at
    or operation.prepared_at is null or operation.action_authorized_at is not null then
    raise exception using errcode = '42501',
      message = 'Klaviyo suppression lease not owned';
  end if;
  select result.* into strict suppression_result
  from loyalty_private.record_notification_suppression_v1(
    operation.organization_id, operation.customer_id, 'loyalty_marketing',
    true, 'provider', target_reason_code,
    'klaviyo:' || connection.public_id::text || ':' || operation.public_id::text ||
      ':' || target_reason_code,
    recorded_at
  ) as result;
  update loyalty_private.notification_klaviyo_operations
  set state = 'suppressed', next_attempt_at = null,
    last_error_code = 'provider_suppressed', locked_by = null, locked_at = null,
    lease_expires_at = null, prepared_at = null,
    action_authorized_at = null, updated_at = recorded_at
  where id = operation.id;
  insert into loyalty_private.notification_klaviyo_operation_attempts(
    organization_id, operation_id, attempt_number, phase, worker_reference,
    outcome, response_class, error_code, started_at, completed_at
  ) values (
    operation.organization_id, operation.id, operation.attempt_count,
    'provider_check', target_worker_id, 'suppressed', 'policy',
    'provider_suppressed', operation.prepared_at, recorded_at
  );
  return query select 'suppressed'::text,
    suppression_result.preference_state::text;
end;
$$;

create or replace function loyalty_private.finish_klaviyo_notification_operation_v1(
  target_connection_public_id uuid,
  target_credential_sha256 text,
  target_operation_public_id uuid,
  target_worker_id text,
  target_phase text,
  target_outcome text,
  target_response_code integer default null,
  target_error_code text default null,
  target_retry_after_seconds integer default null
)
returns table (state text, outcome text, scheduled_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection loyalty_private.notification_klaviyo_connections%rowtype;
  operation loyalty_private.notification_klaviyo_operations%rowtype;
  preference_state text;
  expected_phase text;
  final_state text;
  final_error text;
  response_class text;
  retry_at timestamptz;
  retry_delay integer;
  finished_at timestamptz := pg_catalog.clock_timestamp();
begin
  if target_credential_sha256 !~ '^[a-f0-9]{64}$'
    or target_phase not in (
      'profile', 'provider_check', 'event', 'subscribe', 'unsubscribe'
    )
    or target_outcome not in (
      'completed', 'retryable', 'dead_letter', 'manual_review'
    )
    or (target_response_code is not null
      and target_response_code not between 200 and 599)
    or (target_error_code is not null
      and target_error_code !~ '^[a-z][a-z0-9_]{0,79}$')
    or (target_retry_after_seconds is not null
      and target_retry_after_seconds not between 1 and 86400) then
    raise exception using errcode = '22023',
      message = 'invalid Klaviyo notification result';
  end if;
  select candidate.* into connection
  from loyalty_private.notification_klaviyo_connections as candidate
  where candidate.public_id = target_connection_public_id
    and candidate.credential_sha256 = pg_catalog.decode(
      target_credential_sha256, 'hex'
    );
  select candidate.* into operation
  from loyalty_private.notification_klaviyo_operations as candidate
  where candidate.public_id = target_operation_public_id
    and candidate.connection_id = connection.id
  for update;
  if connection.id is null or operation.id is null
    or operation.state <> 'processing' or operation.locked_by <> target_worker_id
    or operation.lease_expires_at <= finished_at
    or operation.prepared_at is null then
    raise exception using errcode = '42501',
      message = 'Klaviyo notification result not owned';
  end if;
  if operation.operation_kind = 'event_sync' then expected_phase := 'event';
  else
    select preference.to_state into preference_state
    from loyalty_private.notification_preference_events as preference
    where preference.organization_id = operation.organization_id
      and preference.id = operation.preference_event_id;
    expected_phase := case when preference_state = 'subscribed'
      then 'subscribe' else 'unsubscribe' end;
  end if;
  if target_phase in ('profile', 'provider_check') then
    if operation.action_authorized_at is not null then
      raise exception using errcode = '22023',
        message = 'invalid Klaviyo result phase';
    end if;
    if target_phase = 'provider_check'
      and (operation.operation_kind <> 'consent_sync'
        or preference_state <> 'subscribed') then
      raise exception using errcode = '22023',
        message = 'invalid Klaviyo result phase';
    end if;
  elsif target_phase <> expected_phase or operation.action_authorized_at is null then
    raise exception using errcode = '22023',
      message = 'invalid Klaviyo result phase';
  end if;

  if target_outcome = 'completed' then
    if target_phase = 'profile' or target_response_code <> 202
      or target_error_code is not null or target_retry_after_seconds is not null then
      raise exception using errcode = '22023',
        message = 'invalid accepted Klaviyo result';
    end if;
    final_state := 'completed'; final_error := null; response_class := 'success';
  elsif target_outcome = 'retryable' then
    if not (
      target_response_code = 429
      or target_response_code between 500 and 599
      or (target_response_code is null and target_error_code in (
        'klaviyo_connection_unavailable', 'klaviyo_dns_unavailable',
        'klaviyo_timeout', 'klaviyo_provider_unavailable'
      ))
    ) or (target_response_code = 429 and target_retry_after_seconds is null)
      or (target_phase = 'subscribe' and target_response_code is null) then
      raise exception using errcode = '22023',
        message = 'invalid retryable Klaviyo result';
    end if;
    if operation.attempt_count >= 10 then
      final_state := 'manual_review'; final_error := 'attempt_limit_exhausted';
    else
      final_state := 'retryable'; final_error := target_error_code;
      retry_delay := least(
        3600, (30 * pg_catalog.power(2, operation.attempt_count - 1))::integer
      );
      retry_delay := retry_delay + (
        pg_catalog.get_byte(extensions.digest(pg_catalog.convert_to(
          operation.public_id::text || ':' || operation.attempt_count::text,
          'UTF8'
        ), 'sha256'), 0) % greatest(1, retry_delay / 4)
      );
      retry_delay := greatest(retry_delay, coalesce(target_retry_after_seconds, 0));
      retry_at := finished_at + pg_catalog.make_interval(secs => retry_delay);
    end if;
    response_class := 'temporary_failure';
  elsif target_outcome = 'dead_letter' then
    if not (
      coalesce(target_response_code between 400 and 499
        and target_response_code <> 429, false)
      or (target_response_code is null and target_error_code in (
        'klaviyo_configuration_invalid', 'klaviyo_profile_response_invalid',
        'klaviyo_subscription_response_invalid', 'klaviyo_request_invalid'
      ))
    ) then
      raise exception using errcode = '22023',
        message = 'invalid permanent Klaviyo result';
    end if;
    final_state := 'dead_letter'; final_error := target_error_code;
    response_class := 'permanent_failure';
  else
    if target_phase <> 'subscribe' or target_response_code is not null
      or target_error_code <> 'klaviyo_subscribe_outcome_ambiguous'
      or target_retry_after_seconds is not null then
      raise exception using errcode = '22023',
        message = 'invalid ambiguous Klaviyo result';
    end if;
    final_state := 'manual_review'; final_error := target_error_code;
    response_class := 'ambiguous';
  end if;

  insert into loyalty_private.notification_klaviyo_operation_attempts(
    organization_id, operation_id, attempt_number, phase, worker_reference,
    outcome, response_class, response_code, retry_after_seconds, error_code,
    started_at, completed_at
  ) values (
    operation.organization_id, operation.id, operation.attempt_count,
    target_phase, target_worker_id,
    case when final_state = 'completed' then 'accepted' else final_state end,
    response_class, target_response_code, target_retry_after_seconds,
    final_error,
    coalesce(operation.action_authorized_at, operation.prepared_at), finished_at
  );
  update loyalty_private.notification_klaviyo_operations
  set state = final_state, next_attempt_at = retry_at,
    accepted_at = case when final_state = 'completed' then finished_at else null end,
    last_error_code = final_error, last_response_code = target_response_code,
    locked_by = null, locked_at = null, lease_expires_at = null,
    prepared_at = null, action_authorized_at = null, updated_at = finished_at
  where id = operation.id;
  return query select final_state, final_state, retry_at;
end;
$$;

alter table loyalty_private.notification_klaviyo_connections owner to loyalty_owner;
alter table loyalty_private.notification_klaviyo_profiles owner to loyalty_owner;
alter table loyalty_private.notification_klaviyo_operations owner to loyalty_owner;
alter table loyalty_private.notification_klaviyo_operation_attempts owner to loyalty_owner;
alter function loyalty_private.enqueue_managed_klaviyo_event_v1()
  owner to loyalty_owner;
alter function loyalty_private.enqueue_managed_klaviyo_consent_v1()
  owner to loyalty_owner;
alter function loyalty_private.claim_klaviyo_notification_operations_v1(
  uuid, text, text, integer, integer
) owner to loyalty_owner;
alter function loyalty_private.prepare_klaviyo_notification_operation_v1(
  uuid, text, uuid, text
) owner to loyalty_owner;
alter function loyalty_private.record_klaviyo_profile_v1(
  uuid, text, uuid, text, text, integer
) owner to loyalty_owner;
alter function loyalty_private.authorize_klaviyo_provider_action_v1(
  uuid, text, uuid, text
) owner to loyalty_owner;
alter function loyalty_private.record_klaviyo_provider_suppression_v1(
  uuid, text, uuid, text, text
) owner to loyalty_owner;
alter function loyalty_private.finish_klaviyo_notification_operation_v1(
  uuid, text, uuid, text, text, text, integer, text, integer
) owner to loyalty_owner;

create trigger notification_klaviyo_operation_attempts_immutable
before update or delete on loyalty_private.notification_klaviyo_operation_attempts
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.notification_klaviyo_connections enable row level security;
alter table loyalty_private.notification_klaviyo_profiles enable row level security;
alter table loyalty_private.notification_klaviyo_operations enable row level security;
alter table loyalty_private.notification_klaviyo_operation_attempts enable row level security;

revoke all on loyalty_private.notification_klaviyo_connections,
  loyalty_private.notification_klaviyo_profiles,
  loyalty_private.notification_klaviyo_operations,
  loyalty_private.notification_klaviyo_operation_attempts
from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function
  loyalty_private.enqueue_managed_klaviyo_event_v1(),
  loyalty_private.enqueue_managed_klaviyo_consent_v1(),
  loyalty_private.claim_klaviyo_notification_operations_v1(
    uuid, text, text, integer, integer
  ),
  loyalty_private.prepare_klaviyo_notification_operation_v1(
    uuid, text, uuid, text
  ),
  loyalty_private.record_klaviyo_profile_v1(
    uuid, text, uuid, text, text, integer
  ),
  loyalty_private.authorize_klaviyo_provider_action_v1(
    uuid, text, uuid, text
  ),
  loyalty_private.record_klaviyo_provider_suppression_v1(
    uuid, text, uuid, text, text
  ),
  loyalty_private.finish_klaviyo_notification_operation_v1(
    uuid, text, uuid, text, text, text, integer, text, integer
  )
from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty_private.claim_klaviyo_notification_operations_v1(
    uuid, text, text, integer, integer
  ),
  loyalty_private.prepare_klaviyo_notification_operation_v1(
    uuid, text, uuid, text
  ),
  loyalty_private.record_klaviyo_profile_v1(
    uuid, text, uuid, text, text, integer
  ),
  loyalty_private.authorize_klaviyo_provider_action_v1(
    uuid, text, uuid, text
  ),
  loyalty_private.record_klaviyo_provider_suppression_v1(
    uuid, text, uuid, text, text
  ),
  loyalty_private.finish_klaviyo_notification_operation_v1(
    uuid, text, uuid, text, text, text, integer, text, integer
  ) to loyalty_worker;

comment on table loyalty_private.notification_klaviyo_connections is
  'Private managed-tenant connection binding containing a one-way API-key fingerprint, never the private key.';
comment on table loyalty_private.notification_klaviyo_profiles is
  'Tenant-scoped Klaviyo profile-ID projection; verified email remains ephemeral.';
comment on table loyalty_private.notification_klaviyo_operations is
  'Mutable provider-operation lease projection; provider-neutral event and consent facts stay authoritative.';
comment on table loyalty_private.notification_klaviyo_operation_attempts is
  'Append-only bounded Klaviyo evidence with no contact, payload, secret, or raw provider response.';
comment on function loyalty_private.prepare_klaviyo_notification_operation_v1(
  uuid, text, uuid, text
) is
  'Verifies tenant/key binding, managed entitlement, current consent, active identity, and verified contact immediately before profile sync.';
comment on function loyalty_private.authorize_klaviyo_provider_action_v1(
  uuid, text, uuid, text
) is
  'Rechecks managed authority immediately before event or consent submission and marks the ambiguity boundary.';
