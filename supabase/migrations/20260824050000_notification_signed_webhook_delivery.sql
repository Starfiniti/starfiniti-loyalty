-- M08-S04 provider-neutral outbound webhooks. PostgreSQL owns endpoint, lease,
-- consent, rate, and retry authority while signing material stays mounted only
-- in the endpoint-isolated worker.

create table loyalty_private.notification_webhook_endpoints (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  destination_url text not null,
  allowed_origin text not null,
  current_secret_sha256 bytea not null
    check (pg_catalog.octet_length(current_secret_sha256) = 32),
  previous_secret_sha256 bytea,
  previous_secret_expires_at timestamptz,
  event_types text[] not null,
  rate_limit_per_minute integer not null default 60
    check (rate_limit_per_minute between 1 and 600),
  state text not null default 'disabled'
    check (state in ('disabled', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (pg_catalog.length(destination_url) between 12 and 2048),
  check (pg_catalog.length(allowed_origin) between 12 and 255),
  check (destination_url !~ '[?#[:space:]]'),
  check (allowed_origin !~ '[/?#[:space:]]$'),
  check (destination_url like allowed_origin || '/%'),
  check (
    allowed_origin ~ '^https://([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(:443)?$'
  ),
  check (pg_catalog.cardinality(event_types) between 1 and 9),
  check (event_types <@ array[
    'loyalty.points.earned', 'loyalty.points.released',
    'loyalty.points.expiring', 'loyalty.reward.changed',
    'loyalty.tier.changed', 'loyalty.referral.changed',
    'loyalty.campaign.effect', 'loyalty.connector.health',
    'loyalty.billing.changed'
  ]::text[]),
  check (
    (previous_secret_sha256 is null and previous_secret_expires_at is null)
    or (pg_catalog.octet_length(previous_secret_sha256) = 32
      and previous_secret_expires_at is not null)
  ),
  check (updated_at >= created_at)
);

create table loyalty_private.notification_webhook_deliveries (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  endpoint_id bigint not null,
  notification_event_id bigint not null,
  state text not null default 'pending' check (state in (
    'pending', 'processing', 'retryable', 'held', 'completed', 'suppressed',
    'dead_letter', 'manual_review'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  dispatch_authorized_at timestamptz,
  accepted_at timestamptz,
  last_error_code text,
  last_response_code integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (endpoint_id, notification_event_id),
  foreign key (organization_id, endpoint_id)
    references loyalty_private.notification_webhook_endpoints(
      organization_id, id
    ) on delete restrict,
  foreign key (organization_id, notification_event_id)
    references loyalty_private.notification_events(organization_id, id)
    on delete restrict,
  check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (last_response_code is null or last_response_code between 200 and 599),
  check (
    (state = 'processing' and locked_by is not null and locked_at is not null
      and lease_expires_at is not null)
    or (state <> 'processing' and locked_by is null and locked_at is null
      and lease_expires_at is null and dispatch_authorized_at is null)
  ),
  check (dispatch_authorized_at is null
    or dispatch_authorized_at >= locked_at),
  check ((state = 'completed') = (accepted_at is not null)),
  check (accepted_at is null or accepted_at >= created_at),
  check (updated_at >= created_at)
);

create index notification_webhook_deliveries_claim_idx
  on loyalty_private.notification_webhook_deliveries(
    endpoint_id, state, next_attempt_at, created_at, id
  ) where state in ('pending', 'retryable', 'held', 'processing');

create table loyalty_private.notification_webhook_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  delivery_id bigint not null,
  attempt_number integer,
  phase text not null check (phase in ('authorization', 'dispatch')),
  worker_reference text not null,
  outcome text not null check (outcome in (
    'delivered', 'retryable', 'dead_letter', 'manual_review', 'held',
    'suppressed', 'lease_expired'
  )),
  response_class text not null check (response_class in (
    'success', 'temporary_failure', 'permanent_failure', 'policy', 'consent',
    'ambiguous'
  )),
  response_code integer,
  retry_after_seconds integer,
  error_code text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, delivery_id)
    references loyalty_private.notification_webhook_deliveries(
      organization_id, id
    ) on delete restrict,
  check (attempt_number is null or attempt_number between 1 and 10),
  check (pg_catalog.length(worker_reference) between 1 and 200),
  check (response_code is null or response_code between 200 and 599),
  check (retry_after_seconds is null or retry_after_seconds between 1 and 86400),
  check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (completed_at >= started_at)
);

create unique index notification_webhook_attempt_phase_uidx
  on loyalty_private.notification_webhook_attempts(
    delivery_id, attempt_number, phase
  ) where attempt_number is not null;

create table loyalty_private.notification_webhook_rate_windows (
  organization_id bigint not null,
  endpoint_id bigint not null,
  window_started_at timestamptz not null,
  claimed_attempts integer not null default 0 check (claimed_attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (endpoint_id),
  foreign key (organization_id, endpoint_id)
    references loyalty_private.notification_webhook_endpoints(
      organization_id, id
    ) on delete restrict,
  check (updated_at >= window_started_at)
);

alter table loyalty_private.notification_webhook_endpoints
  owner to loyalty_owner;
alter table loyalty_private.notification_webhook_deliveries
  owner to loyalty_owner;
alter table loyalty_private.notification_webhook_attempts
  owner to loyalty_owner;
alter table loyalty_private.notification_webhook_rate_windows
  owner to loyalty_owner;

create trigger notification_webhook_attempts_immutable
before update or delete on loyalty_private.notification_webhook_attempts
for each row execute function loyalty_private.reject_immutable_change();

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
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger notification_webhook_endpoint_guard
before insert or update on loyalty_private.notification_webhook_endpoints
for each row execute function
  loyalty_private.protect_notification_webhook_endpoint_v1();

create or replace function loyalty_private.notification_webhook_event_json_v1(
  target_event_id bigint
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'schemaVersion', event.schema_version,
    'eventId', event.public_id,
    'organizationId', organization.public_id,
    'programmeGroupId', programme_group.public_id,
    'locale', event.locale,
    'occurredAt', event.occurred_at,
    'eventType', event.event_type,
    'purpose', event.purpose,
    'subject', case when event.customer_id is null
      then pg_catalog.jsonb_build_object('kind', 'merchant')
      else pg_catalog.jsonb_build_object(
        'kind', 'customer', 'customerId', customer.public_id
      ) end,
    'payload', event.payload
  )
  from loyalty_private.notification_events as event
  join loyalty.organizations as organization
    on organization.id = event.organization_id
  left join loyalty.programme_groups as programme_group
    on programme_group.organization_id = event.organization_id
   and programme_group.id = event.programme_group_id
  left join loyalty.customers as customer
    on customer.organization_id = event.organization_id
   and customer.id = event.customer_id
  where event.id = target_event_id;
$$;

create or replace function loyalty_private.enqueue_notification_webhook_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into loyalty_private.notification_webhook_deliveries(
    organization_id, endpoint_id, notification_event_id, next_attempt_at
  )
  select new.organization_id, endpoint.id, new.id, new.created_at
  from loyalty_private.notification_webhook_endpoints as endpoint
  where endpoint.organization_id = new.organization_id
    and endpoint.state = 'active'
    and new.event_type = any(endpoint.event_types)
  on conflict (endpoint_id, notification_event_id) do nothing;
  return new;
end;
$$;

create trigger notification_events_enqueue_signed_webhook
after insert on loyalty_private.notification_events
for each row execute function loyalty_private.enqueue_notification_webhook_v1();

create or replace function loyalty_private.claim_notification_webhook_deliveries_v1(
  target_endpoint_public_id uuid,
  target_current_secret_sha256 text,
  target_previous_secret_sha256 text,
  target_worker_id text,
  target_limit integer default 10,
  target_lease_seconds integer default 60
)
returns table (
  schema_version text,
  delivery_public_id uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint loyalty_private.notification_webhook_endpoints%rowtype;
  rate_window loyalty_private.notification_webhook_rate_windows%rowtype;
  candidate record;
  claimed_count integer := 0;
  remaining integer;
  checked_at timestamptz := pg_catalog.clock_timestamp();
  minute_start timestamptz := pg_catalog.date_trunc('minute', checked_at);
begin
  if target_endpoint_public_id is null
    or target_current_secret_sha256 !~ '^[a-f0-9]{64}$'
    or (target_previous_secret_sha256 is not null
      and target_previous_secret_sha256 !~ '^[a-f0-9]{64}$')
    or target_worker_id is null
    or pg_catalog.length(target_worker_id) not between 1 and 200
    or target_limit not between 1 and 20
    or target_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023',
      message = 'invalid webhook delivery claim';
  end if;

  select candidate_endpoint.* into endpoint
  from loyalty_private.notification_webhook_endpoints as candidate_endpoint
  where candidate_endpoint.public_id = target_endpoint_public_id
    and candidate_endpoint.state = 'active'
    and candidate_endpoint.current_secret_sha256 = pg_catalog.decode(
      target_current_secret_sha256, 'hex'
    )
    and (
      (candidate_endpoint.previous_secret_sha256 is null
        and target_previous_secret_sha256 is null)
      or (candidate_endpoint.previous_secret_sha256 is not null
        and candidate_endpoint.previous_secret_expires_at > checked_at
        and candidate_endpoint.previous_secret_sha256 = pg_catalog.decode(
          target_previous_secret_sha256, 'hex'
        ))
    )
  for update;
  if endpoint.id is null then
    raise exception using errcode = '42501',
      message = 'webhook endpoint not authorized';
  end if;

  for candidate in
    select delivery.*
    from loyalty_private.notification_webhook_deliveries as delivery
    where delivery.endpoint_id = endpoint.id
      and delivery.state = 'processing'
      and delivery.lease_expires_at <= checked_at
    order by delivery.id
    for update
  loop
    insert into loyalty_private.notification_webhook_attempts(
      organization_id, delivery_id, attempt_number, phase,
      worker_reference, outcome, response_class, error_code,
      started_at, completed_at
    ) values (
      candidate.organization_id, candidate.id,
      case when candidate.attempt_count > 0
        then candidate.attempt_count else null end,
      'dispatch', candidate.locked_by, 'lease_expired', 'ambiguous',
      'webhook_lease_expired', candidate.locked_at, checked_at
    ) on conflict (delivery_id, attempt_number, phase)
      where attempt_number is not null do nothing;
    update loyalty_private.notification_webhook_deliveries
    set state = case when candidate.attempt_count >= 10
        then 'manual_review' else 'retryable' end,
      next_attempt_at = case when candidate.attempt_count >= 10
        then null else checked_at end,
      last_error_code = case when candidate.attempt_count >= 10
        then 'attempt_limit_exhausted' else 'webhook_lease_expired' end,
      locked_by = null, locked_at = null, lease_expires_at = null,
      dispatch_authorized_at = null, updated_at = checked_at
    where id = candidate.id;
  end loop;

  insert into loyalty_private.notification_webhook_rate_windows(
    organization_id, endpoint_id, window_started_at, claimed_attempts,
    updated_at
  ) values (
    endpoint.organization_id, endpoint.id, minute_start, 0, checked_at
  ) on conflict (endpoint_id) do update
    set window_started_at = case
          when loyalty_private.notification_webhook_rate_windows.window_started_at
            < excluded.window_started_at
          then excluded.window_started_at
          else loyalty_private.notification_webhook_rate_windows.window_started_at
        end,
        claimed_attempts = case
          when loyalty_private.notification_webhook_rate_windows.window_started_at
            < excluded.window_started_at
          then 0
          else loyalty_private.notification_webhook_rate_windows.claimed_attempts
        end,
        updated_at = excluded.updated_at;
  select window.* into strict rate_window
  from loyalty_private.notification_webhook_rate_windows as window
  where window.endpoint_id = endpoint.id
  for update;
  remaining := pg_catalog.greatest(
    0, endpoint.rate_limit_per_minute - rate_window.claimed_attempts
  );
  if remaining = 0 then return; end if;

  for candidate in
    select delivery.id, delivery.public_id
    from loyalty_private.notification_webhook_deliveries as delivery
    where delivery.endpoint_id = endpoint.id
      and delivery.state in ('pending', 'retryable', 'held')
      and coalesce(delivery.next_attempt_at, delivery.created_at) <= checked_at
      and delivery.attempt_count < 10
    order by coalesce(delivery.next_attempt_at, delivery.created_at), delivery.id
    for update skip locked
    limit least(target_limit, remaining)
  loop
    update loyalty_private.notification_webhook_deliveries
    set state = 'processing', next_attempt_at = null,
      locked_by = target_worker_id, locked_at = checked_at,
      lease_expires_at = checked_at
        + pg_catalog.make_interval(secs => target_lease_seconds),
      dispatch_authorized_at = null, updated_at = checked_at
    where id = candidate.id;
    claimed_count := claimed_count + 1;
    schema_version := '1';
    delivery_public_id := candidate.public_id;
    lease_expires_at := checked_at
      + pg_catalog.make_interval(secs => target_lease_seconds);
    return next;
  end loop;
  update loyalty_private.notification_webhook_rate_windows
  set claimed_attempts = claimed_attempts + claimed_count,
    updated_at = checked_at
  where endpoint_id = endpoint.id;
end;
$$;

create or replace function loyalty_private.authorize_notification_webhook_dispatch_v1(
  target_endpoint_public_id uuid,
  target_current_secret_sha256 text,
  target_previous_secret_sha256 text,
  target_delivery_public_id uuid,
  target_worker_id text
)
returns table (
  schema_version text,
  delivery_public_id uuid,
  outcome text,
  attempt_count integer,
  destination_url text,
  event jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint loyalty_private.notification_webhook_endpoints%rowtype;
  delivery loyalty_private.notification_webhook_deliveries%rowtype;
  source_event loyalty_private.notification_events%rowtype;
  current_preference loyalty_private.notification_preferences%rowtype;
  entitlement record;
  projected_event jsonb;
  terminal_outcome text;
  terminal_error text;
  authorized_at timestamptz := pg_catalog.clock_timestamp();
begin
  if target_current_secret_sha256 !~ '^[a-f0-9]{64}$'
    or (target_previous_secret_sha256 is not null
      and target_previous_secret_sha256 !~ '^[a-f0-9]{64}$')
    or target_worker_id is null
    or pg_catalog.length(target_worker_id) not between 1 and 200 then
    raise exception using errcode = '22023',
      message = 'invalid webhook dispatch authorization';
  end if;
  select candidate.* into endpoint
  from loyalty_private.notification_webhook_endpoints as candidate
  where candidate.public_id = target_endpoint_public_id
    and candidate.current_secret_sha256 = pg_catalog.decode(
      target_current_secret_sha256, 'hex'
    )
    and (
      (candidate.previous_secret_sha256 is null
        and target_previous_secret_sha256 is null)
      or (candidate.previous_secret_sha256 is not null
        and candidate.previous_secret_expires_at > authorized_at
        and candidate.previous_secret_sha256 = pg_catalog.decode(
          target_previous_secret_sha256, 'hex'
        ))
    );
  if endpoint.id is null then
    raise exception using errcode = '42501',
      message = 'webhook endpoint not authorized';
  end if;
  select candidate.* into delivery
  from loyalty_private.notification_webhook_deliveries as candidate
  where candidate.public_id = target_delivery_public_id
    and candidate.endpoint_id = endpoint.id
  for update;
  if delivery.id is null or delivery.state <> 'processing'
    or delivery.locked_by <> target_worker_id
    or delivery.lease_expires_at <= authorized_at
    or delivery.dispatch_authorized_at is not null then
    raise exception using errcode = '42501',
      message = 'webhook delivery lease not owned';
  end if;
  select event_row.* into strict source_event
  from loyalty_private.notification_events as event_row
  where event_row.organization_id = delivery.organization_id
    and event_row.id = delivery.notification_event_id;
  select resolved.* into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    delivery.organization_id, 'notifications', delivery.public_id::text,
    authorized_at
  ) as resolved;
  if endpoint.state <> 'active' or not entitlement.enabled then
    terminal_outcome := 'held';
    terminal_error := 'feature_or_endpoint_disabled';
  elsif not (source_event.event_type = any(endpoint.event_types)) then
    terminal_outcome := 'held';
    terminal_error := 'event_subscription_removed';
  elsif source_event.customer_id is not null then
    select preference.* into current_preference
    from loyalty_private.notification_preferences as preference
    where preference.organization_id = source_event.organization_id
      and preference.customer_id = source_event.customer_id
      and preference.channel = 'email'
      and preference.purpose = source_event.purpose;
    if coalesce(current_preference.state, case
      when source_event.purpose = 'loyalty_transactional'
        then 'subscribed' else 'unsubscribed' end) <> 'subscribed' then
      terminal_outcome := 'suppressed';
      terminal_error := 'consent_not_subscribed';
    end if;
  end if;
  if terminal_outcome is null then
    projected_event :=
      loyalty_private.notification_webhook_event_json_v1(source_event.id);
    if projected_event is null
      or pg_catalog.octet_length(
        pg_catalog.convert_to(projected_event::text, 'UTF8')
      ) > 20480 then
      terminal_outcome := 'dead_letter';
      terminal_error := 'webhook_payload_invalid';
    end if;
  end if;

  if terminal_outcome is not null then
    update loyalty_private.notification_webhook_deliveries
    set state = terminal_outcome, next_attempt_at = null,
      last_error_code = terminal_error, locked_by = null, locked_at = null,
      lease_expires_at = null, dispatch_authorized_at = null,
      updated_at = authorized_at
    where id = delivery.id;
    insert into loyalty_private.notification_webhook_attempts(
      organization_id, delivery_id, phase, worker_reference, outcome,
      response_class, error_code, started_at, completed_at
    ) values (
      delivery.organization_id, delivery.id, 'authorization', target_worker_id,
      terminal_outcome,
      case when terminal_outcome = 'suppressed' then 'consent'
        when terminal_outcome = 'dead_letter' then 'permanent_failure'
        else 'policy' end,
      terminal_error, delivery.locked_at, authorized_at
    );
    return query select '1'::text, delivery.public_id, terminal_outcome,
      null::integer, null::text, null::jsonb;
    return;
  end if;

  update loyalty_private.notification_webhook_deliveries as updated_delivery
  set attempt_count = updated_delivery.attempt_count + 1,
    dispatch_authorized_at = authorized_at, updated_at = authorized_at
  where updated_delivery.id = delivery.id
  returning updated_delivery.attempt_count into delivery.attempt_count;
  return query select '1'::text, delivery.public_id, 'authorized'::text,
    delivery.attempt_count, endpoint.destination_url, projected_event;
end;
$$;

create or replace function loyalty_private.finish_notification_webhook_delivery_v1(
  target_endpoint_public_id uuid,
  target_current_secret_sha256 text,
  target_previous_secret_sha256 text,
  target_delivery_public_id uuid,
  target_worker_id text,
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
  endpoint loyalty_private.notification_webhook_endpoints%rowtype;
  delivery loyalty_private.notification_webhook_deliveries%rowtype;
  final_state text;
  final_error text;
  response_class text;
  retry_at timestamptz;
  retry_delay integer;
  finished_at timestamptz := pg_catalog.clock_timestamp();
begin
  if target_current_secret_sha256 !~ '^[a-f0-9]{64}$'
    or (target_previous_secret_sha256 is not null
      and target_previous_secret_sha256 !~ '^[a-f0-9]{64}$')
    or target_outcome not in ('delivered', 'retryable', 'dead_letter')
    or (target_response_code is not null
      and target_response_code not between 200 and 599)
    or (target_error_code is not null
      and target_error_code !~ '^[a-z][a-z0-9_]{0,79}$')
    or (target_retry_after_seconds is not null
      and target_retry_after_seconds not between 1 and 86400) then
    raise exception using errcode = '22023',
      message = 'invalid webhook delivery result';
  end if;
  select candidate.* into endpoint
  from loyalty_private.notification_webhook_endpoints as candidate
  where candidate.public_id = target_endpoint_public_id
    and candidate.current_secret_sha256 = pg_catalog.decode(
      target_current_secret_sha256, 'hex'
    )
    and (
      (candidate.previous_secret_sha256 is null
        and target_previous_secret_sha256 is null)
      or (candidate.previous_secret_sha256 is not null
        and candidate.previous_secret_expires_at > finished_at
        and candidate.previous_secret_sha256 = pg_catalog.decode(
          target_previous_secret_sha256, 'hex'
        ))
    );
  select candidate.* into delivery
  from loyalty_private.notification_webhook_deliveries as candidate
  where candidate.public_id = target_delivery_public_id
    and candidate.endpoint_id = endpoint.id
  for update;
  if endpoint.id is null or delivery.id is null
    or delivery.state <> 'processing'
    or delivery.locked_by <> target_worker_id
    or delivery.lease_expires_at <= finished_at
    or delivery.dispatch_authorized_at is null then
    raise exception using errcode = '42501',
      message = 'webhook delivery result not owned';
  end if;

  if target_outcome = 'delivered' then
    if target_response_code is null
      or target_response_code not between 200 and 299
      or target_error_code is not null
      or target_retry_after_seconds is not null then
      raise exception using errcode = '22023',
        message = 'invalid successful webhook result';
    end if;
    final_state := 'completed';
    response_class := 'success';
  elsif target_outcome = 'retryable' then
    if not (
      target_response_code in (408, 425, 429)
      or target_response_code between 500 and 599
      or (target_response_code is null and target_error_code in (
        'webhook_dns_unavailable', 'webhook_connection_unavailable',
        'webhook_timeout', 'webhook_connection_ambiguous'
      ))
    ) or (target_response_code = 429
      and target_retry_after_seconds is null) then
      raise exception using errcode = '22023',
        message = 'invalid retryable webhook result';
    end if;
    if delivery.attempt_count >= 10 then
      final_state := 'manual_review';
      final_error := 'attempt_limit_exhausted';
    else
      final_state := 'retryable';
      final_error := target_error_code;
      retry_delay := least(
        86400, (5 * pg_catalog.power(2, delivery.attempt_count - 1))::integer
      );
      retry_delay := retry_delay + (
        pg_catalog.get_byte(extensions.digest(pg_catalog.convert_to(
          delivery.public_id::text || ':' || delivery.attempt_count::text,
          'UTF8'
        ), 'sha256'), 0) % greatest(1, retry_delay / 4)
      );
      retry_delay := greatest(
        retry_delay, coalesce(target_retry_after_seconds, 0)
      );
      retry_at := finished_at + pg_catalog.make_interval(secs => retry_delay);
    end if;
    response_class := case when target_response_code is null
      then 'ambiguous' else 'temporary_failure' end;
  else
    if not (
      coalesce(target_response_code between 300 and 499
        and target_response_code not in (408, 425, 429), false)
      or (target_response_code is null and target_error_code in (
        'webhook_destination_forbidden', 'webhook_response_too_large',
        'webhook_request_invalid'
      ))
    ) then
      raise exception using errcode = '22023',
        message = 'invalid terminal webhook result';
    end if;
    final_state := 'dead_letter';
    final_error := target_error_code;
    response_class := 'permanent_failure';
  end if;

  if target_response_code = 410 then
    update loyalty_private.notification_webhook_endpoints
    set state = 'disabled', updated_at = finished_at
    where id = endpoint.id;
    final_error := 'webhook_endpoint_gone';
  end if;
  update loyalty_private.notification_webhook_deliveries
  set state = final_state, next_attempt_at = retry_at,
    accepted_at = case when final_state = 'completed'
      then finished_at else null end,
    last_error_code = final_error,
    last_response_code = target_response_code,
    locked_by = null, locked_at = null, lease_expires_at = null,
    dispatch_authorized_at = null, updated_at = finished_at
  where id = delivery.id;
  insert into loyalty_private.notification_webhook_attempts(
    organization_id, delivery_id, attempt_number, phase, worker_reference,
    outcome, response_class, response_code, retry_after_seconds, error_code,
    started_at, completed_at
  ) values (
    delivery.organization_id, delivery.id, delivery.attempt_count, 'dispatch',
    target_worker_id,
    case when final_state = 'completed' then 'delivered'
      when final_state = 'manual_review' then 'manual_review'
      else final_state end,
    response_class, target_response_code, target_retry_after_seconds,
    final_error, delivery.locked_at, finished_at
  );
  return query select final_state, case
      when final_state = 'completed' then 'delivered'
      when final_state = 'manual_review' then 'manual_review'
      else final_state end,
    retry_at;
end;
$$;

alter table loyalty_private.notification_webhook_endpoints
  enable row level security;
alter table loyalty_private.notification_webhook_deliveries
  enable row level security;
alter table loyalty_private.notification_webhook_attempts
  enable row level security;
alter table loyalty_private.notification_webhook_rate_windows
  enable row level security;

alter function loyalty_private.protect_notification_webhook_endpoint_v1()
  owner to loyalty_owner;
alter function loyalty_private.notification_webhook_event_json_v1(bigint)
  owner to loyalty_owner;
alter function loyalty_private.enqueue_notification_webhook_v1()
  owner to loyalty_owner;
alter function loyalty_private.claim_notification_webhook_deliveries_v1(
  uuid, text, text, text, integer, integer
) owner to loyalty_owner;
alter function loyalty_private.authorize_notification_webhook_dispatch_v1(
  uuid, text, text, uuid, text
) owner to loyalty_owner;
alter function loyalty_private.finish_notification_webhook_delivery_v1(
  uuid, text, text, uuid, text, text, integer, text, integer
) owner to loyalty_owner;

revoke all on loyalty_private.notification_webhook_endpoints,
  loyalty_private.notification_webhook_deliveries,
  loyalty_private.notification_webhook_attempts,
  loyalty_private.notification_webhook_rate_windows
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function
  loyalty_private.protect_notification_webhook_endpoint_v1(),
  loyalty_private.notification_webhook_event_json_v1(bigint),
  loyalty_private.enqueue_notification_webhook_v1(),
  loyalty_private.claim_notification_webhook_deliveries_v1(
    uuid, text, text, text, integer, integer
  ),
  loyalty_private.authorize_notification_webhook_dispatch_v1(
    uuid, text, text, uuid, text
  ),
  loyalty_private.finish_notification_webhook_delivery_v1(
    uuid, text, text, uuid, text, text, integer, text, integer
  ) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty_private.claim_notification_webhook_deliveries_v1(
    uuid, text, text, text, integer, integer
  ),
  loyalty_private.authorize_notification_webhook_dispatch_v1(
    uuid, text, text, uuid, text
  ),
  loyalty_private.finish_notification_webhook_delivery_v1(
    uuid, text, text, uuid, text, text, integer, text, integer
  ) to loyalty_worker;

comment on table loyalty_private.notification_webhook_endpoints is
  'Private tenant-owned outbound webhook destinations and non-secret current/rotation fingerprints; signing keys remain outside PostgreSQL.';
comment on table loyalty_private.notification_webhook_attempts is
  'Append-only minimized outbound webhook delivery evidence without destination, payload, response body, signature, secret, or contact.';
comment on function
  loyalty_private.authorize_notification_webhook_dispatch_v1(
    uuid, text, text, uuid, text
  ) is
  'Rechecks endpoint/key binding, notification entitlement, subscription, purpose consent, lease, and 20 KiB event projection immediately before one signed webhook call.';
