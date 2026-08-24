-- M08-S02 self-hosted transactional SMTP delivery. The mutable lease row is
-- operational projection only; the event, template, and attempt evidence stay
-- append-only and no contact address is persisted outside Supabase Auth.

create or replace function loyalty_private.notification_email_template_hash_v1(
  target_template_code text,
  target_template_version integer,
  target_event_type text,
  target_subject_template text,
  target_text_template text,
  target_html_template text
)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(pg_catalog.convert_to(
    target_template_code || '|' || target_template_version::text || '|' ||
    target_event_type || '|' || target_subject_template || '|' ||
    target_text_template || '|' || target_html_template,
    'UTF8'
  ), 'sha256');
$$;

create table loyalty_private.notification_email_template_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  template_code text not null,
  template_version integer not null,
  event_type text not null,
  locale text not null default 'en' check (locale = 'en'),
  subject_template text not null,
  text_template text not null,
  html_template text not null,
  template_sha256 bytea generated always as (
    loyalty_private.notification_email_template_hash_v1(
      template_code, template_version, event_type, subject_template,
      text_template, html_template
    )
  ) stored,
  created_at timestamptz not null default now(),
  unique (template_code, template_version),
  unique (event_type, template_version),
  check (template_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (template_version > 0),
  check (event_type in (
    'loyalty.points.earned', 'loyalty.points.released',
    'loyalty.points.expiring', 'loyalty.reward.changed',
    'loyalty.tier.changed', 'loyalty.referral.changed'
  )),
  check (pg_catalog.length(subject_template) between 1 and 200),
  check (pg_catalog.length(text_template) between 1 and 4000),
  check (pg_catalog.length(html_template) between 1 and 8000)
);

create table loyalty_private.notification_smtp_deliveries (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  notification_event_id bigint not null,
  template_id bigint not null
    references loyalty_private.notification_email_template_versions(id)
    on delete restrict,
  provider text not null default 'smtp' check (provider = 'smtp'),
  channel text not null default 'email' check (channel = 'email'),
  state text not null default 'pending' check (state in (
    'pending', 'processing', 'retryable', 'held', 'delivered',
    'suppressed', 'contact_unavailable', 'dead_letter', 'manual_review'
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (notification_event_id, provider, channel),
  foreign key (organization_id, notification_event_id)
    references loyalty_private.notification_events(organization_id, id)
    on delete restrict,
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

create index notification_smtp_deliveries_claim_idx
  on loyalty_private.notification_smtp_deliveries (
    state, next_attempt_at, created_at, id
  ) where state in ('pending', 'retryable', 'held', 'processing');

create table loyalty_private.notification_smtp_delivery_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  delivery_id bigint not null,
  attempt_number integer,
  worker_reference text not null,
  outcome text not null check (outcome in (
    'delivered', 'retryable', 'dead_letter', 'manual_review', 'held',
    'suppressed', 'contact_unavailable',
    'lease_expired_before_authorization',
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
    references loyalty_private.notification_smtp_deliveries(organization_id, id)
    on delete restrict,
  check (attempt_number is null or attempt_number between 1 and 10),
  check (pg_catalog.length(worker_reference) between 1 and 200),
  check (response_code is null or response_code between 200 and 599),
  check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  check (completed_at >= started_at)
);

create unique index notification_smtp_delivery_attempt_number_uidx
  on loyalty_private.notification_smtp_delivery_attempts (
    delivery_id, attempt_number
  ) where attempt_number is not null;
create index notification_smtp_delivery_attempt_history_idx
  on loyalty_private.notification_smtp_delivery_attempts (
    organization_id, delivery_id, completed_at desc, id desc
  );

insert into loyalty_private.notification_email_template_versions (
  template_code, template_version, event_type,
  subject_template, text_template, html_template
)
values
  (
    'points_earned', 1, 'loyalty.points.earned',
    'You earned {{points}} points',
    'You earned {{points}} points. Pending release: {{pendingUntil}}.',
    '<p>You earned <strong>{{points}}</strong> points.</p><p>Pending release: {{pendingUntil}}.</p>'
  ),
  (
    'points_released', 1, 'loyalty.points.released',
    '{{points}} points are now available',
    '{{points}} points are now available. Your available balance is {{availableBalance}} points.',
    '<p><strong>{{points}}</strong> points are now available.</p><p>Your available balance is {{availableBalance}} points.</p>'
  ),
  (
    'points_expiring', 1, 'loyalty.points.expiring',
    '{{points}} points expire in {{daysRemaining}} days',
    '{{points}} points expire on {{expiresAt}}. Use them within {{daysRemaining}} days.',
    '<p><strong>{{points}}</strong> points expire on {{expiresAt}}.</p><p>Use them within {{daysRemaining}} days.</p>'
  ),
  (
    'reward_changed', 1, 'loyalty.reward.changed',
    'Your {{rewardCode}} reward is {{state}}',
    'Your {{rewardCode}} reward is now {{state}}. Reward reference: {{rewardReservationId}}.',
    '<p>Your <strong>{{rewardCode}}</strong> reward is now {{state}}.</p><p>Reward reference: {{rewardReservationId}}.</p>'
  ),
  (
    'tier_changed', 1, 'loyalty.tier.changed',
    'Your loyalty tier is now {{toTierCode}}',
    'Your loyalty tier changed from {{fromTierCode}} to {{toTierCode}} on {{effectiveAt}}.',
    '<p>Your loyalty tier changed from {{fromTierCode}} to <strong>{{toTierCode}}</strong> on {{effectiveAt}}.</p>'
  ),
  (
    'referral_changed', 1, 'loyalty.referral.changed',
    'Your referral is {{state}}',
    'Your {{party}} referral is now {{state}}. Referral reference: {{referralId}}.',
    '<p>Your {{party}} referral is now <strong>{{state}}</strong>.</p><p>Referral reference: {{referralId}}.</p>'
  );

create or replace function loyalty_private.enqueue_self_hosted_smtp_notification_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_deployment_mode text;
  target_enabled boolean;
  target_template_id bigint;
begin
  if new.purpose <> 'loyalty_transactional' then
    return new;
  end if;
  select entitlement.deployment_mode, entitlement.enabled
    into target_deployment_mode, target_enabled
  from loyalty_private.resolve_organization_entitlement(
    new.organization_id, 'notifications', new.public_id::text, new.created_at
  ) as entitlement;
  if target_deployment_mode <> 'self_hosted' or not target_enabled then
    return new;
  end if;
  select template.id into strict target_template_id
  from loyalty_private.notification_email_template_versions as template
  where template.event_type = new.event_type and template.template_version = 1;
  insert into loyalty_private.notification_smtp_deliveries (
    organization_id, notification_event_id, template_id, next_attempt_at
  ) values (
    new.organization_id, new.id, target_template_id, new.created_at
  ) on conflict (notification_event_id, provider, channel) do nothing;
  return new;
end;
$$;

create trigger notification_events_enqueue_self_hosted_smtp
after insert on loyalty_private.notification_events
for each row execute function
  loyalty_private.enqueue_self_hosted_smtp_notification_v1();

insert into loyalty_private.notification_smtp_deliveries (
  organization_id, notification_event_id, template_id, next_attempt_at
)
select event.organization_id, event.id, template.id, event.created_at
from loyalty_private.notification_events as event
join loyalty_private.notification_email_template_versions as template
  on template.event_type = event.event_type and template.template_version = 1
cross join lateral loyalty_private.resolve_organization_entitlement(
  event.organization_id, 'notifications', event.public_id::text, event.created_at
) as entitlement
where event.purpose = 'loyalty_transactional'
  and entitlement.deployment_mode = 'self_hosted' and entitlement.enabled
on conflict (notification_event_id, provider, channel) do nothing;

create or replace function loyalty_private.notification_event_json_v1(
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
    'subject', pg_catalog.jsonb_build_object(
      'kind', 'customer', 'customerId', customer.public_id
    ),
    'payload', event.payload
  )
  from loyalty_private.notification_events as event
  join loyalty.organizations as organization on organization.id = event.organization_id
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = event.organization_id
   and programme_group.id = event.programme_group_id
  join loyalty.customers as customer
    on customer.organization_id = event.organization_id
   and customer.id = event.customer_id
  where event.id = target_event_id and event.purpose = 'loyalty_transactional';
$$;

create or replace function loyalty_private.resolve_verified_auth_email_v1(
  target_auth_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select auth_user.email
  from auth.users as auth_user
  where auth_user.id = target_auth_user_id
    and auth_user.email_confirmed_at is not null
    and auth_user.deleted_at is null
    and pg_catalog.length(auth_user.email) between 3 and 320
    and auth_user.email ~ '^[^[:cntrl:][:space:]@]+@[^[:cntrl:][:space:]@]+$';
$$;

create or replace function loyalty_private.claim_smtp_notification_deliveries_v1(
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
      message = 'invalid SMTP notification claim';
  end if;

  with expired_candidates as materialized (
    select delivery.id, delivery.authorized_at is not null as was_authorized,
      delivery.locked_by as prior_worker_reference,
      delivery.locked_at as prior_started_at
    from loyalty_private.notification_smtp_deliveries as delivery
    where delivery.state = 'processing'
      and delivery.lease_expires_at <= claimed_at
    order by delivery.lease_expires_at, delivery.id
    for update of delivery skip locked
    limit target_batch_size
  ), expired as (
    update loyalty_private.notification_smtp_deliveries as delivery
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
  insert into loyalty_private.notification_smtp_delivery_attempts (
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
    from loyalty_private.notification_smtp_deliveries as delivery
    cross join lateral loyalty_private.resolve_organization_entitlement(
      delivery.organization_id, 'notifications', delivery.public_id::text,
      claimed_at
    ) as entitlement
    where delivery.state in ('pending', 'retryable', 'held')
      and delivery.attempt_count < 10
      and coalesce(delivery.next_attempt_at, claimed_at) <= claimed_at
      and entitlement.deployment_mode = 'self_hosted' and entitlement.enabled
    order by coalesce(delivery.next_attempt_at, delivery.created_at), delivery.id
    for update of delivery skip locked
    limit target_batch_size
  ), claimed as (
    update loyalty_private.notification_smtp_deliveries as delivery
    set state = 'processing', locked_by = target_worker_id, locked_at = claimed_at,
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

create or replace function loyalty_private.authorize_smtp_notification_delivery_v1(
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
  delivery loyalty_private.notification_smtp_deliveries%rowtype;
  source_event loyalty_private.notification_events%rowtype;
  template loyalty_private.notification_email_template_versions%rowtype;
  entitlement record;
  preference_state text;
  resolved_email text;
  authorization_time timestamptz := pg_catalog.clock_timestamp();
begin
  if target_delivery_public_id is null or target_worker_id is null
    or pg_catalog.length(target_worker_id) not between 1 and 200 then
    raise exception using errcode = '22023',
      message = 'invalid SMTP notification authorization';
  end if;
  select candidate.* into delivery
  from loyalty_private.notification_smtp_deliveries as candidate
  where candidate.public_id = target_delivery_public_id
  for update;
  if delivery.id is null or delivery.state <> 'processing'
    or delivery.locked_by <> target_worker_id
    or delivery.lease_expires_at <= authorization_time then
    raise exception using errcode = '42501',
      message = 'SMTP notification lease not owned';
  end if;
  if delivery.authorized_at is not null then
    raise exception using errcode = '55000',
      message = 'SMTP notification already authorized';
  end if;
  select source.* into strict source_event
  from loyalty_private.notification_events as source
  where source.organization_id = delivery.organization_id
    and source.id = delivery.notification_event_id;
  select version.* into strict template
  from loyalty_private.notification_email_template_versions as version
  where version.id = delivery.template_id and version.event_type = source_event.event_type;
  select resolved.* into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    delivery.organization_id, 'notifications', delivery.public_id::text,
    authorization_time
  ) as resolved;
  if entitlement.deployment_mode <> 'self_hosted' or not entitlement.enabled then
    update loyalty_private.notification_smtp_deliveries
    set state = 'held', next_attempt_at = null, last_error_code = 'feature_disabled',
      locked_by = null, locked_at = null, lease_expires_at = null,
      authorized_at = null, updated_at = authorization_time
    where id = delivery.id;
    insert into loyalty_private.notification_smtp_delivery_attempts (
      organization_id, delivery_id, worker_reference, outcome, response_class,
      error_code, started_at, completed_at
    ) values (
      delivery.organization_id, delivery.id, target_worker_id, 'held', 'policy',
      'feature_disabled', delivery.locked_at, authorization_time
    );
    return query select '1'::text, delivery.public_id, 'held'::text,
      null::integer, null::text, null::text, null::integer, null::text,
      null::text, null::text, null::text, null::jsonb;
    return;
  end if;

  select preference.state into preference_state
  from loyalty_private.notification_preferences as preference
  where preference.organization_id = delivery.organization_id
    and preference.customer_id = source_event.customer_id
    and preference.channel = 'email'
    and preference.purpose = source_event.purpose;
  preference_state := coalesce(preference_state, 'subscribed');
  if preference_state <> 'subscribed' then
    update loyalty_private.notification_smtp_deliveries
    set state = 'suppressed', next_attempt_at = null,
      last_error_code = 'consent_not_subscribed', locked_by = null,
      locked_at = null, lease_expires_at = null, authorized_at = null,
      updated_at = authorization_time
    where id = delivery.id;
    insert into loyalty_private.notification_smtp_delivery_attempts (
      organization_id, delivery_id, worker_reference, outcome, response_class,
      error_code, started_at, completed_at
    ) values (
      delivery.organization_id, delivery.id, target_worker_id, 'suppressed',
      'policy', 'consent_not_subscribed', delivery.locked_at, authorization_time
    );
    return query select '1'::text, delivery.public_id, 'suppressed'::text,
      null::integer, null::text, null::text, null::integer, null::text,
      null::text, null::text, null::text, null::jsonb;
    return;
  end if;

  select loyalty_private.resolve_verified_auth_email_v1(link.auth_user_id)
    into resolved_email
  from loyalty.customers as customer
  join loyalty.customer_user_links as link
    on link.organization_id = customer.organization_id
   and link.customer_id = customer.id and link.revoked_at is null
  where customer.organization_id = delivery.organization_id
    and customer.id = source_event.customer_id and customer.status = 'active'
  order by link.linked_at desc, link.id desc
  limit 1;
  if resolved_email is null then
    update loyalty_private.notification_smtp_deliveries
    set state = 'contact_unavailable', next_attempt_at = null,
      last_error_code = 'verified_contact_unavailable', locked_by = null,
      locked_at = null, lease_expires_at = null, authorized_at = null,
      updated_at = authorization_time
    where id = delivery.id;
    insert into loyalty_private.notification_smtp_delivery_attempts (
      organization_id, delivery_id, worker_reference, outcome, response_class,
      error_code, started_at, completed_at
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

  update loyalty_private.notification_smtp_deliveries as updated_delivery
  set attempt_count = updated_delivery.attempt_count + 1,
    authorized_at = authorization_time,
    updated_at = authorization_time
  where updated_delivery.id = delivery.id
  returning updated_delivery.attempt_count into delivery.attempt_count;
  return query select '1'::text, delivery.public_id, 'authorized'::text,
    delivery.attempt_count, resolved_email, template.template_code,
    template.template_version, pg_catalog.encode(template.template_sha256, 'hex'),
    template.subject_template, template.text_template, template.html_template,
    loyalty_private.notification_event_json_v1(source_event.id);
end;
$$;

create or replace function loyalty_private.finish_smtp_notification_delivery_v1(
  target_delivery_public_id uuid,
  target_worker_id text,
  target_outcome text,
  target_response_code integer default null,
  target_error_code text default null
)
returns table (
  state text,
  outcome text,
  scheduled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery loyalty_private.notification_smtp_deliveries%rowtype;
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
      message = 'invalid SMTP notification result';
  end if;
  select candidate.* into delivery
  from loyalty_private.notification_smtp_deliveries as candidate
  where candidate.public_id = target_delivery_public_id
  for update;
  if delivery.id is null or delivery.state <> 'processing'
    or delivery.locked_by <> target_worker_id
    or delivery.lease_expires_at <= finished_at
    or delivery.authorized_at is null then
    raise exception using errcode = '42501',
      message = 'SMTP notification authorization not owned';
  end if;

  if target_outcome = 'delivered' then
    if target_response_code is null
      or target_response_code not between 200 and 299
      or target_error_code is not null then
      raise exception using errcode = '22023',
        message = 'invalid delivered SMTP result';
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
        message = 'invalid retryable SMTP result';
    end if;
    if delivery.attempt_count >= 10 then
      final_state := 'manual_review';
      final_error_code := 'attempt_limit_exhausted';
    else
      final_state := 'retryable';
      final_error_code := target_error_code;
      retry_delay_seconds := pg_catalog.least(
        3600, (30 * pg_catalog.power(2, delivery.attempt_count - 1))::integer
      );
      retry_delay_seconds := retry_delay_seconds + (
        pg_catalog.get_byte(extensions.digest(pg_catalog.convert_to(
          delivery.public_id::text || ':' || delivery.attempt_count::text,
          'UTF8'
        ), 'sha256'), 0) % pg_catalog.greatest(1, retry_delay_seconds / 4)
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
        message = 'invalid permanent SMTP result';
    end if;
    final_state := 'dead_letter';
    final_error_code := target_error_code;
    response_class := 'permanent_failure';
  else
    if target_response_code is not null
      or target_error_code is distinct from 'smtp_outcome_ambiguous' then
      raise exception using errcode = '22023',
        message = 'invalid ambiguous SMTP result';
    end if;
    final_state := 'manual_review';
    final_error_code := target_error_code;
    response_class := 'ambiguous';
  end if;

  insert into loyalty_private.notification_smtp_delivery_attempts (
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
  update loyalty_private.notification_smtp_deliveries
  set state = final_state, next_attempt_at = retry_at,
    delivered_at = case when final_state = 'delivered' then finished_at else null end,
    last_error_code = final_error_code, last_response_code = target_response_code,
    locked_by = null, locked_at = null, lease_expires_at = null,
    authorized_at = null, updated_at = finished_at
  where id = delivery.id;
  return query select final_state, final_state, retry_at;
end;
$$;

alter table loyalty_private.notification_email_template_versions owner to loyalty_owner;
alter table loyalty_private.notification_smtp_deliveries owner to loyalty_owner;
alter table loyalty_private.notification_smtp_delivery_attempts owner to loyalty_owner;
alter function loyalty_private.notification_email_template_hash_v1(
  text, integer, text, text, text, text
) owner to loyalty_owner;
alter function loyalty_private.enqueue_self_hosted_smtp_notification_v1()
  owner to loyalty_owner;
alter function loyalty_private.notification_event_json_v1(bigint)
  owner to loyalty_owner;
-- Supabase Auth can restore its schema ACL after application migrations. Keep
-- the verified-contact read in one Auth-owned function instead of granting the
-- loyalty owner direct access to auth.users.
grant usage, create on schema loyalty_private to supabase_auth_admin;
alter function loyalty_private.resolve_verified_auth_email_v1(uuid)
  owner to supabase_auth_admin;
revoke usage, create on schema loyalty_private from supabase_auth_admin;
alter function loyalty_private.claim_smtp_notification_deliveries_v1(
  text, integer, integer
) owner to loyalty_owner;
alter function loyalty_private.authorize_smtp_notification_delivery_v1(uuid, text)
  owner to loyalty_owner;
alter function loyalty_private.finish_smtp_notification_delivery_v1(
  uuid, text, text, integer, text
) owner to loyalty_owner;

create trigger notification_email_template_versions_immutable
before update or delete on loyalty_private.notification_email_template_versions
for each row execute function loyalty_private.reject_immutable_change();
create trigger notification_smtp_delivery_attempts_immutable
before update or delete on loyalty_private.notification_smtp_delivery_attempts
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.notification_email_template_versions enable row level security;
alter table loyalty_private.notification_smtp_deliveries enable row level security;
alter table loyalty_private.notification_smtp_delivery_attempts enable row level security;

revoke all on loyalty_private.notification_email_template_versions,
  loyalty_private.notification_smtp_deliveries,
  loyalty_private.notification_smtp_delivery_attempts
from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.notification_email_template_hash_v1(
  text, integer, text, text, text, text
), loyalty_private.enqueue_self_hosted_smtp_notification_v1(),
  loyalty_private.notification_event_json_v1(bigint),
  loyalty_private.resolve_verified_auth_email_v1(uuid),
  loyalty_private.claim_smtp_notification_deliveries_v1(text, integer, integer),
  loyalty_private.authorize_smtp_notification_delivery_v1(uuid, text),
  loyalty_private.finish_smtp_notification_delivery_v1(
    uuid, text, text, integer, text
  )
from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.resolve_verified_auth_email_v1(uuid)
  to loyalty_owner;
grant execute on function loyalty_private.claim_smtp_notification_deliveries_v1(
  text, integer, integer
), loyalty_private.authorize_smtp_notification_delivery_v1(uuid, text),
  loyalty_private.finish_smtp_notification_delivery_v1(
    uuid, text, text, integer, text
  ) to loyalty_worker;

comment on table loyalty_private.notification_email_template_versions is
  'Immutable English SMTP template versions; rendered contact is never persisted.';
comment on table loyalty_private.notification_smtp_deliveries is
  'Private mutable SMTP lease projection with bounded attempts and conservative ambiguity handling.';
comment on table loyalty_private.notification_smtp_delivery_attempts is
  'Append-only SMTP outcome evidence containing bounded codes and no contact, body, secret, or raw provider response.';
comment on function loyalty_private.authorize_smtp_notification_delivery_v1(uuid, text) is
  'Linearizes self-hosted entitlement, consent, suppression, active identity, and verified Auth email immediately before one SMTP attempt.';
comment on function loyalty_private.resolve_verified_auth_email_v1(uuid) is
  'Auth-owned narrow bridge returning one confirmed non-deleted email; callable only by the NOLOGIN loyalty function owner.';
comment on function loyalty_private.finish_smtp_notification_delivery_v1(
  uuid, text, text, integer, text
) is
  'Records one bounded SMTP result; explicit temporary failures retry while ambiguous outcomes stop for manual review.';
