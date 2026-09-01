-- M08-S05 isolated merchant SMTP tests. The browser cannot select the
-- recipient or sample values; authorization resolves the requesting admin's
-- current verified Supabase Auth email immediately before delivery.

create table loyalty_private.notification_smtp_test_deliveries (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  template_id bigint not null
    references loyalty_private.notification_email_template_versions(id)
    on delete restrict,
  event_type text not null,
  state text not null default 'pending' check (state in (
    'pending', 'processing', 'retryable', 'held', 'delivered',
    'contact_unavailable', 'dead_letter', 'manual_review'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  authorized_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  last_response_code integer,
  idempotency_key text not null,
  request_sha256 bytea not null check (pg_catalog.octet_length(request_sha256) = 32),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  check (event_type in (
    'loyalty.points.earned', 'loyalty.points.released',
    'loyalty.points.expiring', 'loyalty.reward.changed',
    'loyalty.tier.changed', 'loyalty.referral.changed'
  )),
  check (pg_catalog.length(idempotency_key) between 1 and 200),
  check (idempotency_key ~ '^[A-Za-z0-9:_-]+$'),
  check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (last_response_code is null or last_response_code between 200 and 599),
  check (
    (state = 'processing' and locked_by is not null and locked_at is not null
      and lease_expires_at is not null)
    or (state <> 'processing' and locked_by is null and locked_at is null
      and lease_expires_at is null and authorized_at is null)
  ),
  check (authorized_at is null or authorized_at >= locked_at),
  check ((state = 'delivered') = (delivered_at is not null)),
  check (delivered_at is null or delivered_at >= created_at),
  check (updated_at >= created_at)
);

create index notification_smtp_test_deliveries_claim_idx
  on loyalty_private.notification_smtp_test_deliveries(
    state, next_attempt_at, created_at, id
  ) where state in ('pending', 'retryable', 'held', 'processing');

create table loyalty_private.notification_smtp_test_delivery_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  delivery_id bigint not null,
  attempt_number integer,
  worker_reference text not null,
  outcome text not null check (outcome in (
    'delivered', 'retryable', 'dead_letter', 'manual_review', 'held',
    'contact_unavailable', 'lease_expired_before_authorization',
    'lease_expired_after_authorization'
  )),
  response_class text not null check (response_class in (
    'success', 'temporary_failure', 'permanent_failure', 'ambiguous',
    'policy', 'contact'
  )),
  response_code integer,
  error_code text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, delivery_id)
    references loyalty_private.notification_smtp_test_deliveries(
      organization_id, id
    ) on delete restrict,
  check (attempt_number is null or attempt_number between 1 and 10),
  check (pg_catalog.length(worker_reference) between 1 and 200),
  check (response_code is null or response_code between 200 and 599),
  check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (completed_at >= started_at)
);

create unique index notification_smtp_test_attempt_number_uidx
  on loyalty_private.notification_smtp_test_delivery_attempts(
    delivery_id, attempt_number
  ) where attempt_number is not null;

create or replace function loyalty.send_notification_test_command(
  target_workspace_public_id uuid,
  target_event_type text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  test_delivery_id uuid,
  state text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_workspace loyalty.workspaces%rowtype;
  target_template_id bigint;
  existing_delivery loyalty_private.notification_smtp_test_deliveries%rowtype;
  created_delivery loyalty_private.notification_smtp_test_deliveries%rowtype;
  entitlement record;
  request_hash bytea;
begin
  if actor_user_id is null or target_workspace_public_id is null
    or loyalty_private.notification_email_template_tokens_v1(
      target_event_type
    ) is null
    or target_idempotency_key is null
    or pg_catalog.length(target_idempotency_key) not between 1 and 200
    or target_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid notification test command';
  end if;
  select workspace.* into target_workspace
  from loyalty.workspaces as workspace
  where workspace.public_id = target_workspace_public_id
    and workspace.status = 'active'
    and loyalty_private.has_organization_role(
      workspace.organization_id, array['owner', 'admin']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'notification test command not authorized';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'version', '1', 'workspaceId', target_workspace_public_id,
      'eventType', target_event_type
    )::text, 'UTF8'
  ), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-test-command|' || target_workspace.organization_id::text ||
      '|' || target_idempotency_key,
    0
  ));
  select delivery.* into existing_delivery
  from loyalty_private.notification_smtp_test_deliveries as delivery
  where delivery.organization_id = target_workspace.organization_id
    and delivery.idempotency_key = target_idempotency_key;
  if found then
    if existing_delivery.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'notification test command idempotency conflict';
    end if;
    return query select existing_delivery.public_id,
      existing_delivery.state, 'duplicate'::text;
    return;
  end if;
  select decision.* into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    target_workspace.organization_id, 'notifications',
    'workspace:' || target_workspace.public_id::text,
    pg_catalog.statement_timestamp()
  ) as decision;
  if entitlement.deployment_mode <> 'self_hosted' or not entitlement.enabled then
    raise exception using errcode = '42501',
      message = 'self-hosted notifications are not enabled';
  end if;
  select binding.template_id into target_template_id
  from loyalty_private.notification_email_template_bindings as binding
  where binding.organization_id = target_workspace.organization_id
    and binding.event_type = target_event_type;
  if target_template_id is null then
    select version.id into strict target_template_id
    from loyalty_private.notification_email_template_versions as version
    where version.organization_id is null
      and version.event_type = target_event_type
      and version.template_version = 1;
  end if;
  insert into loyalty_private.notification_smtp_test_deliveries (
    organization_id, requested_by_user_id, template_id, event_type,
    next_attempt_at, idempotency_key, request_sha256, correlation_id
  ) values (
    target_workspace.organization_id, actor_user_id, target_template_id,
    target_event_type, pg_catalog.statement_timestamp(),
    target_idempotency_key, request_hash, target_correlation_id
  ) returning * into strict created_delivery;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_workspace.organization_id, actor_user_id,
    'notification.test.enqueue', 'notification_smtp_test',
    created_delivery.public_id,
    'notification-test:' || target_idempotency_key, request_hash,
    target_correlation_id,
    pg_catalog.jsonb_build_object('eventType', target_event_type)
  );
  return query select created_delivery.public_id,
    created_delivery.state, 'created'::text;
end;
$$;

create or replace function loyalty_private.notification_smtp_test_event_json_v1(
  target_delivery_id bigint
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'eventId', delivery.public_id,
    'organizationId', organization.public_id,
    'programmeGroupId', null,
    'locale', 'en',
    'occurredAt', delivery.created_at,
    'eventType', delivery.event_type,
    'purpose', 'loyalty_transactional',
    'subject', pg_catalog.jsonb_build_object(
      'kind', 'customer',
      'customerId', '00000000-0000-4000-8000-000000000001'::uuid
    ),
    'payload', case delivery.event_type
      when 'loyalty.points.earned' then pg_catalog.jsonb_build_object(
        'points', '100', 'pendingUntil', null
      )
      when 'loyalty.points.released' then pg_catalog.jsonb_build_object(
        'points', '100', 'availableBalance', '500'
      )
      when 'loyalty.points.expiring' then pg_catalog.jsonb_build_object(
        'points', '100',
        'expiresAt', delivery.created_at + interval '7 days',
        'daysRemaining', 7
      )
      when 'loyalty.reward.changed' then pg_catalog.jsonb_build_object(
        'rewardReservationId',
          '00000000-0000-4000-8000-000000000002'::uuid,
        'rewardCode', 'welcome_reward', 'state', 'issued'
      )
      when 'loyalty.tier.changed' then pg_catalog.jsonb_build_object(
        'fromTierCode', 'rose', 'toTierCode', 'bloom',
        'effectiveAt', delivery.created_at
      )
      when 'loyalty.referral.changed' then pg_catalog.jsonb_build_object(
        'referralId', '00000000-0000-4000-8000-000000000003'::uuid,
        'party', 'advocate', 'state', 'qualified'
      )
      else null::jsonb
    end
  )
  from loyalty_private.notification_smtp_test_deliveries as delivery
  join loyalty.organizations as organization
    on organization.id = delivery.organization_id
  where delivery.id = target_delivery_id;
$$;

create or replace function loyalty_private.claim_smtp_notification_tests_v1(
  target_worker_id text,
  target_batch_size integer default 10,
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
  claimed_at timestamptz := pg_catalog.clock_timestamp();
begin
  if target_worker_id is null or pg_catalog.length(target_worker_id) not between 1 and 200
    or target_batch_size not between 1 and 50
    or target_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023',
      message = 'invalid SMTP notification test claim';
  end if;
  with expired_candidates as materialized (
    select delivery.id, delivery.authorized_at is not null as was_authorized,
      delivery.locked_by as prior_worker_reference,
      delivery.locked_at as prior_started_at
    from loyalty_private.notification_smtp_test_deliveries as delivery
    where delivery.state = 'processing'
      and delivery.lease_expires_at <= claimed_at
    order by delivery.lease_expires_at, delivery.id
    for update of delivery skip locked
    limit target_batch_size
  ), expired as (
    update loyalty_private.notification_smtp_test_deliveries as delivery
    set state = case when candidate.was_authorized
        then 'manual_review' else 'retryable' end,
      next_attempt_at = case when candidate.was_authorized
        then null else claimed_at end,
      last_error_code = case when candidate.was_authorized
        then 'lease_expired_after_authorization'
        else 'lease_expired_before_authorization' end,
      locked_by = null, locked_at = null, lease_expires_at = null,
      authorized_at = null, updated_at = claimed_at
    from expired_candidates as candidate
    where delivery.id = candidate.id
    returning delivery.*, candidate.was_authorized,
      candidate.prior_worker_reference, candidate.prior_started_at
  )
  insert into loyalty_private.notification_smtp_test_delivery_attempts (
    organization_id, delivery_id, attempt_number, worker_reference,
    outcome, response_class, error_code, started_at, completed_at
  )
  select expired.organization_id, expired.id,
    case when expired.was_authorized then expired.attempt_count else null end,
    coalesce(expired.prior_worker_reference, 'expired-lease-recovery'),
    case when expired.was_authorized
      then 'lease_expired_after_authorization'
      else 'lease_expired_before_authorization' end,
    case when expired.was_authorized then 'ambiguous' else 'temporary_failure' end,
    case when expired.was_authorized
      then 'lease_expired_after_authorization'
      else 'lease_expired_before_authorization' end,
    coalesce(expired.prior_started_at, claimed_at), claimed_at
  from expired;
  return query
  with candidates as materialized (
    select delivery.id
    from loyalty_private.notification_smtp_test_deliveries as delivery
    cross join lateral loyalty_private.resolve_organization_entitlement(
      delivery.organization_id, 'notifications', delivery.public_id::text,
      claimed_at
    ) as entitlement
    where delivery.state in ('pending', 'retryable', 'held')
      and delivery.attempt_count < 10
      and coalesce(delivery.next_attempt_at, claimed_at) <= claimed_at
      and entitlement.deployment_mode = 'self_hosted'
      and entitlement.enabled
    order by coalesce(delivery.next_attempt_at, delivery.created_at), delivery.id
    for update of delivery skip locked
    limit target_batch_size
  ), claimed as (
    update loyalty_private.notification_smtp_test_deliveries as delivery
    set state = 'processing', locked_by = target_worker_id,
      locked_at = claimed_at,
      lease_expires_at = claimed_at + pg_catalog.make_interval(
        secs => target_lease_seconds
      ), authorized_at = null, updated_at = claimed_at
    from candidates as candidate
    where delivery.id = candidate.id
    returning delivery.public_id, delivery.lease_expires_at
  )
  select '1'::text, claimed.public_id, claimed.lease_expires_at
  from claimed order by claimed.lease_expires_at, claimed.public_id;
end;
$$;

create or replace function loyalty_private.authorize_smtp_notification_test_v1(
  target_delivery_public_id uuid,
  target_worker_id text
)
returns table (
  schema_version text,
  delivery_public_id uuid,
  outcome text,
  attempt_count integer,
  recipient_email text,
  template_code text,
  template_version integer,
  template_sha256 text,
  subject_template text,
  text_template text,
  html_template text,
  event jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery loyalty_private.notification_smtp_test_deliveries%rowtype;
  template loyalty_private.notification_email_template_versions%rowtype;
  entitlement record;
  resolved_email text;
  test_subject_template text;
  test_template_hash bytea;
  authorization_time timestamptz := pg_catalog.clock_timestamp();
begin
  if target_delivery_public_id is null or target_worker_id is null
    or pg_catalog.length(target_worker_id) not between 1 and 200 then
    raise exception using errcode = '22023',
      message = 'invalid SMTP notification test authorization';
  end if;
  select candidate.* into delivery
  from loyalty_private.notification_smtp_test_deliveries as candidate
  where candidate.public_id = target_delivery_public_id
  for update;
  if delivery.id is null or delivery.state <> 'processing'
    or delivery.locked_by <> target_worker_id
    or delivery.lease_expires_at <= authorization_time then
    raise exception using errcode = '42501',
      message = 'SMTP notification test lease not owned';
  end if;
  if delivery.authorized_at is not null then
    raise exception using errcode = '55000',
      message = 'SMTP notification test already authorized';
  end if;
  select version.* into strict template
  from loyalty_private.notification_email_template_versions as version
  where version.id = delivery.template_id
    and version.event_type = delivery.event_type;
  select resolved.* into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    delivery.organization_id, 'notifications', delivery.public_id::text,
    authorization_time
  ) as resolved;
  if entitlement.deployment_mode <> 'self_hosted' or not entitlement.enabled then
    update loyalty_private.notification_smtp_test_deliveries
    set state = 'held', next_attempt_at = null,
      last_error_code = 'feature_disabled', locked_by = null,
      locked_at = null, lease_expires_at = null, authorized_at = null,
      updated_at = authorization_time
    where id = delivery.id;
    insert into loyalty_private.notification_smtp_test_delivery_attempts (
      organization_id, delivery_id, worker_reference, outcome,
      response_class, error_code, started_at, completed_at
    ) values (
      delivery.organization_id, delivery.id, target_worker_id, 'held',
      'policy', 'feature_disabled', delivery.locked_at, authorization_time
    );
    return query select '1'::text, delivery.public_id, 'held'::text,
      null::integer, null::text, null::text, null::integer, null::text,
      null::text, null::text, null::text, null::jsonb;
    return;
  end if;
  if not exists (
    select 1 from loyalty.organization_memberships as membership
    where membership.organization_id = delivery.organization_id
      and membership.user_id = delivery.requested_by_user_id
      and membership.revoked_at is null
      and membership.role in ('owner', 'admin')
  ) then
    update loyalty_private.notification_smtp_test_deliveries
    set state = 'dead_letter', next_attempt_at = null,
      last_error_code = 'requester_not_authorized', locked_by = null,
      locked_at = null, lease_expires_at = null, authorized_at = null,
      updated_at = authorization_time
    where id = delivery.id;
    insert into loyalty_private.notification_smtp_test_delivery_attempts (
      organization_id, delivery_id, worker_reference, outcome,
      response_class, error_code, started_at, completed_at
    ) values (
      delivery.organization_id, delivery.id, target_worker_id, 'dead_letter',
      'policy', 'requester_not_authorized', delivery.locked_at,
      authorization_time
    );
    return query select '1'::text, delivery.public_id, 'dead_letter'::text,
      null::integer, null::text, null::text, null::integer, null::text,
      null::text, null::text, null::text, null::jsonb;
    return;
  end if;
  select loyalty_private.resolve_verified_auth_email_v1(
    delivery.requested_by_user_id
  ) into resolved_email;
  if resolved_email is null then
    update loyalty_private.notification_smtp_test_deliveries
    set state = 'contact_unavailable', next_attempt_at = null,
      last_error_code = 'verified_contact_unavailable', locked_by = null,
      locked_at = null, lease_expires_at = null, authorized_at = null,
      updated_at = authorization_time
    where id = delivery.id;
    insert into loyalty_private.notification_smtp_test_delivery_attempts (
      organization_id, delivery_id, worker_reference, outcome,
      response_class, error_code, started_at, completed_at
    ) values (
      delivery.organization_id, delivery.id, target_worker_id,
      'contact_unavailable', 'contact', 'verified_contact_unavailable',
      delivery.locked_at, authorization_time
    );
    return query select '1'::text, delivery.public_id,
      'contact_unavailable'::text, null::integer, null::text, null::text,
      null::integer, null::text, null::text, null::text, null::text,
      null::jsonb;
    return;
  end if;
  test_subject_template := '[Starfiniti test] ' || template.subject_template;
  if pg_catalog.length(test_subject_template) > 200 then
    test_subject_template := '[Test] ' || pg_catalog.substr(
      template.subject_template, 1, 193
    );
  end if;
  test_template_hash := loyalty_private.notification_email_template_hash_v1(
    template.template_code, template.template_version, template.event_type,
    test_subject_template, template.text_template, template.html_template
  );
  update loyalty_private.notification_smtp_test_deliveries as updated_delivery
  set attempt_count = updated_delivery.attempt_count + 1,
    authorized_at = authorization_time, updated_at = authorization_time
  where updated_delivery.id = delivery.id
  returning updated_delivery.attempt_count into delivery.attempt_count;
  return query select '1'::text, delivery.public_id, 'authorized'::text,
    delivery.attempt_count, resolved_email, template.template_code,
    template.template_version, pg_catalog.encode(test_template_hash, 'hex'),
    test_subject_template, template.text_template, template.html_template,
    loyalty_private.notification_smtp_test_event_json_v1(delivery.id);
end;
$$;

create or replace function loyalty_private.finish_smtp_notification_test_v1(
  target_delivery_public_id uuid,
  target_worker_id text,
  target_outcome text,
  target_response_code integer default null,
  target_error_code text default null
)
returns table (state text, outcome text, scheduled_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery loyalty_private.notification_smtp_test_deliveries%rowtype;
  finished_at timestamptz := pg_catalog.clock_timestamp();
  final_state text;
  final_error_code text;
  retry_at timestamptz;
  response_class text;
  retry_delay_seconds integer;
begin
  if target_delivery_public_id is null or target_worker_id is null
    or pg_catalog.length(target_worker_id) not between 1 and 200
    or target_outcome not in (
      'delivered', 'retryable', 'dead_letter', 'manual_review'
    )
    or (target_response_code is not null
      and target_response_code not between 200 and 599)
    or (target_error_code is not null
      and target_error_code !~ '^[a-z][a-z0-9_]{0,79}$') then
    raise exception using errcode = '22023',
      message = 'invalid SMTP notification test result';
  end if;
  select candidate.* into delivery
  from loyalty_private.notification_smtp_test_deliveries as candidate
  where candidate.public_id = target_delivery_public_id
  for update;
  if delivery.id is null or delivery.state <> 'processing'
    or delivery.locked_by <> target_worker_id
    or delivery.lease_expires_at <= finished_at
    or delivery.authorized_at is null then
    raise exception using errcode = '42501',
      message = 'SMTP notification test authorization not owned';
  end if;
  if target_outcome = 'delivered' then
    if target_response_code is null
      or target_response_code not between 200 and 299
      or target_error_code is not null then
      raise exception using errcode = '22023',
        message = 'invalid delivered SMTP test result';
    end if;
    final_state := 'delivered';
    final_error_code := null;
    response_class := 'success';
  elsif target_outcome = 'retryable' then
    if not (
      coalesce(target_response_code between 400 and 499, false)
      or (target_response_code is null and target_error_code in (
        'smtp_connection_unavailable', 'smtp_dns_unavailable',
        'smtp_tls_unavailable', 'smtp_timeout', 'smtp_temporary_rejection'
      ))
    ) then
      raise exception using errcode = '22023',
        message = 'invalid retryable SMTP test result';
    end if;
    if delivery.attempt_count >= 10 then
      final_state := 'manual_review';
      final_error_code := 'attempt_limit_exhausted';
    else
      final_state := 'retryable';
      final_error_code := target_error_code;
      retry_delay_seconds := least(
        3600, (30 * pg_catalog.power(2, delivery.attempt_count - 1))::integer
      );
      retry_delay_seconds := retry_delay_seconds + (
        pg_catalog.get_byte(extensions.digest(pg_catalog.convert_to(
          delivery.public_id::text || ':' || delivery.attempt_count::text,
          'UTF8'
        ), 'sha256'), 0) % greatest(1, retry_delay_seconds / 4)
      );
      retry_at := finished_at + pg_catalog.make_interval(
        secs => retry_delay_seconds
      );
    end if;
    response_class := 'temporary_failure';
  elsif target_outcome = 'dead_letter' then
    if not (
      coalesce(target_response_code between 500 and 599, false)
      or (target_response_code is null and target_error_code in (
        'smtp_authentication_failed', 'smtp_configuration_invalid',
        'smtp_envelope_invalid', 'smtp_message_invalid',
        'smtp_permanent_rejection'
      ))
    ) then
      raise exception using errcode = '22023',
        message = 'invalid permanent SMTP test result';
    end if;
    final_state := 'dead_letter';
    final_error_code := target_error_code;
    response_class := 'permanent_failure';
  else
    if target_response_code is not null
      or target_error_code is distinct from 'smtp_outcome_ambiguous' then
      raise exception using errcode = '22023',
        message = 'invalid ambiguous SMTP test result';
    end if;
    final_state := 'manual_review';
    final_error_code := target_error_code;
    response_class := 'ambiguous';
  end if;
  insert into loyalty_private.notification_smtp_test_delivery_attempts (
    organization_id, delivery_id, attempt_number, worker_reference,
    outcome, response_class, response_code, error_code,
    started_at, completed_at
  ) values (
    delivery.organization_id, delivery.id, delivery.attempt_count,
    target_worker_id, final_state, response_class, target_response_code,
    case when final_state = 'manual_review' and delivery.attempt_count >= 10
      then target_error_code else final_error_code end,
    delivery.authorized_at, finished_at
  );
  update loyalty_private.notification_smtp_test_deliveries
  set state = final_state, next_attempt_at = retry_at,
    delivered_at = case when final_state = 'delivered' then finished_at else null end,
    last_error_code = final_error_code, last_response_code = target_response_code,
    locked_by = null, locked_at = null, lease_expires_at = null,
    authorized_at = null, updated_at = finished_at
  where id = delivery.id;
  return query select final_state, final_state, retry_at;
end;
$$;

alter table loyalty_private.notification_smtp_test_deliveries owner to loyalty_owner;
alter table loyalty_private.notification_smtp_test_delivery_attempts owner to loyalty_owner;
alter function loyalty.send_notification_test_command(uuid, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty_private.notification_smtp_test_event_json_v1(bigint)
  owner to loyalty_owner;
alter function loyalty_private.claim_smtp_notification_tests_v1(
  text, integer, integer
) owner to loyalty_owner;
alter function loyalty_private.authorize_smtp_notification_test_v1(uuid, text)
  owner to loyalty_owner;
alter function loyalty_private.finish_smtp_notification_test_v1(
  uuid, text, text, integer, text
) owner to loyalty_owner;

create trigger notification_smtp_test_delivery_attempts_immutable
before update or delete
on loyalty_private.notification_smtp_test_delivery_attempts
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.notification_smtp_test_deliveries
  enable row level security;
alter table loyalty_private.notification_smtp_test_delivery_attempts
  enable row level security;

revoke all on loyalty_private.notification_smtp_test_deliveries,
  loyalty_private.notification_smtp_test_delivery_attempts
from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function
  loyalty.send_notification_test_command(uuid, text, text, uuid),
  loyalty_private.notification_smtp_test_event_json_v1(bigint),
  loyalty_private.claim_smtp_notification_tests_v1(text, integer, integer),
  loyalty_private.authorize_smtp_notification_test_v1(uuid, text),
  loyalty_private.finish_smtp_notification_test_v1(
    uuid, text, text, integer, text
  )
from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.send_notification_test_command(
  uuid, text, text, uuid
) to authenticated;
grant execute on function
  loyalty_private.claim_smtp_notification_tests_v1(text, integer, integer),
  loyalty_private.authorize_smtp_notification_test_v1(uuid, text),
  loyalty_private.finish_smtp_notification_test_v1(
    uuid, text, text, integer, text
  )
to loyalty_worker;

comment on table loyalty_private.notification_smtp_test_deliveries is
  'Private isolated SMTP test queue pinning one immutable template and resolving only the requesting admin contact at authorization.';
comment on table loyalty_private.notification_smtp_test_delivery_attempts is
  'Append-only bounded SMTP test outcome evidence without contact, message body, secret, or provider response.';
