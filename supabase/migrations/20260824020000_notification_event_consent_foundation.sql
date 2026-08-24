-- M08 provider-neutral notification events and local consent authority.
-- Contact resolution and provider delivery are deliberately deferred: immutable
-- event evidence never contains email, phone, coupon material, or raw provider data.

create or replace function loyalty_private.notification_json_keys_exact_v1(
  target_value jsonb,
  target_keys text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_typeof(target_value) = 'object'
    and (
      select pg_catalog.count(*) = pg_catalog.cardinality(target_keys)
        and pg_catalog.coalesce(pg_catalog.bool_and(key = any(target_keys)), true)
      from pg_catalog.jsonb_object_keys(target_value) as keys(key)
    );
$$;

create or replace function loyalty_private.notification_bigint_text_valid_v1(
  target_value text,
  target_positive boolean default false
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when target_value ~ '^(0|[1-9][0-9]{0,18})$'
      then target_value::numeric <= 9223372036854775807
        and (not target_positive or target_value <> '0')
    else false
  end;
$$;

create or replace function loyalty_private.notification_code_valid_v1(
  target_value text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select target_value ~ '^[a-z][a-z0-9_-]{0,79}$';
$$;

create or replace function loyalty_private.notification_uuid_valid_v1(
  target_value text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select target_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;

create or replace function loyalty_private.notification_instant_valid_v1(
  target_value text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if target_value is null
    or target_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$' then
    return false;
  end if;
  perform target_value::timestamptz;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function loyalty_private.notification_payload_valid_v1(
  target_event_type text,
  target_payload jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if target_payload is null
    or pg_catalog.octet_length(
      pg_catalog.convert_to(target_payload::text, 'UTF8')
    ) > 16384 then
    return false;
  end if;

  case target_event_type
    when 'loyalty.points.earned' then
      return loyalty_private.notification_json_keys_exact_v1(
          target_payload, array['points', 'pendingUntil']::text[]
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'points') = 'string'
        and loyalty_private.notification_bigint_text_valid_v1(
          target_payload ->> 'points', true
        )
        and (
          target_payload -> 'pendingUntil' = 'null'::jsonb
          or (
            pg_catalog.jsonb_typeof(target_payload -> 'pendingUntil') = 'string'
            and loyalty_private.notification_instant_valid_v1(
              target_payload ->> 'pendingUntil'
            )
          )
        );
    when 'loyalty.points.released' then
      return loyalty_private.notification_json_keys_exact_v1(
          target_payload, array['points', 'availableBalance']::text[]
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'points') = 'string'
        and pg_catalog.jsonb_typeof(target_payload -> 'availableBalance') = 'string'
        and loyalty_private.notification_bigint_text_valid_v1(
          target_payload ->> 'points', true
        )
        and loyalty_private.notification_bigint_text_valid_v1(
          target_payload ->> 'availableBalance', false
        );
    when 'loyalty.points.expiring' then
      return loyalty_private.notification_json_keys_exact_v1(
          target_payload, array['points', 'expiresAt', 'daysRemaining']::text[]
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'points') = 'string'
        and pg_catalog.jsonb_typeof(target_payload -> 'expiresAt') = 'string'
        and pg_catalog.jsonb_typeof(target_payload -> 'daysRemaining') = 'number'
        and loyalty_private.notification_bigint_text_valid_v1(
          target_payload ->> 'points', true
        )
        and loyalty_private.notification_instant_valid_v1(
          target_payload ->> 'expiresAt'
        )
        and case
          when (target_payload ->> 'daysRemaining') ~ '^[1-9][0-9]{0,3}$'
            then (target_payload ->> 'daysRemaining')::integer between 1 and 3650
          else false
        end;
    when 'loyalty.reward.changed' then
      return loyalty_private.notification_json_keys_exact_v1(
          target_payload,
          array['rewardReservationId', 'rewardCode', 'state']::text[]
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'rewardReservationId') = 'string'
        and pg_catalog.jsonb_typeof(target_payload -> 'rewardCode') = 'string'
        and pg_catalog.jsonb_typeof(target_payload -> 'state') = 'string'
        and loyalty_private.notification_uuid_valid_v1(
          target_payload ->> 'rewardReservationId'
        )
        and loyalty_private.notification_code_valid_v1(
          target_payload ->> 'rewardCode'
        )
        and target_payload ->> 'state' in (
          'reserved', 'issued', 'redeemed', 'expired', 'cancelled', 'failed',
          'manual_review'
        );
    when 'loyalty.tier.changed' then
      return loyalty_private.notification_json_keys_exact_v1(
          target_payload,
          array['fromTierCode', 'toTierCode', 'effectiveAt']::text[]
        )
        and (
          target_payload -> 'fromTierCode' = 'null'::jsonb
          or (
            pg_catalog.jsonb_typeof(target_payload -> 'fromTierCode') = 'string'
            and loyalty_private.notification_code_valid_v1(
              target_payload ->> 'fromTierCode'
            )
          )
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'toTierCode') = 'string'
        and loyalty_private.notification_code_valid_v1(
          target_payload ->> 'toTierCode'
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'effectiveAt') = 'string'
        and loyalty_private.notification_instant_valid_v1(
          target_payload ->> 'effectiveAt'
        );
    when 'loyalty.referral.changed' then
      return loyalty_private.notification_json_keys_exact_v1(
          target_payload, array['referralId', 'party', 'state']::text[]
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'referralId') = 'string'
        and loyalty_private.notification_uuid_valid_v1(
          target_payload ->> 'referralId'
        )
        and target_payload ->> 'party' in ('advocate', 'friend')
        and target_payload ->> 'state' in (
          'captured', 'pending_review', 'cooling', 'qualified', 'blocked',
          'rejected', 'reversed'
        );
    when 'loyalty.campaign.effect' then
      return loyalty_private.notification_json_keys_exact_v1(
          target_payload, array['campaignVersionId', 'outcome', 'points']::text[]
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'campaignVersionId') = 'string'
        and loyalty_private.notification_uuid_valid_v1(
          target_payload ->> 'campaignVersionId'
        )
        and target_payload ->> 'outcome' in (
          'points_awarded', 'reward_reserved', 'control',
          'capacity_exhausted', 'suppressed'
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'points') = 'string'
        and loyalty_private.notification_bigint_text_valid_v1(
          target_payload ->> 'points', false
        );
    when 'loyalty.connector.health' then
      return loyalty_private.notification_json_keys_exact_v1(
          target_payload, array['connectionId', 'state', 'errorCode']::text[]
        )
        and pg_catalog.jsonb_typeof(target_payload -> 'connectionId') = 'string'
        and loyalty_private.notification_uuid_valid_v1(
          target_payload ->> 'connectionId'
        )
        and target_payload ->> 'state' in (
          'healthy', 'degraded', 'offline', 'action_required'
        )
        and (
          target_payload -> 'errorCode' = 'null'::jsonb
          or (
            pg_catalog.jsonb_typeof(target_payload -> 'errorCode') = 'string'
            and loyalty_private.notification_code_valid_v1(
              target_payload ->> 'errorCode'
            )
          )
        );
    when 'loyalty.billing.changed' then
      return loyalty_private.notification_json_keys_exact_v1(
          target_payload, array['state']::text[]
        )
        and target_payload ->> 'state' in (
          'trial', 'active', 'past_due', 'grace', 'suspended', 'cancelled',
          'contract_managed'
        );
    else
      return false;
  end case;
end;
$$;

create table loyalty_private.notification_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete cascade,
  programme_group_id bigint,
  customer_id bigint,
  schema_version text not null default '1' check (schema_version = '1'),
  event_type text not null,
  purpose text not null check (
    purpose in (
      'loyalty_transactional', 'loyalty_marketing', 'merchant_operational'
    )
  ),
  locale text not null default 'en' check (locale = 'en'),
  source_kind text not null,
  source_reference text not null,
  deduplication_key text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  event_sha256 bytea not null check (pg_catalog.octet_length(event_sha256) = 32),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, deduplication_key),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  check (source_kind ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  check (pg_catalog.length(source_reference) between 1 and 500),
  check (pg_catalog.length(deduplication_key) between 1 and 255),
  check (loyalty_private.notification_payload_valid_v1(event_type, payload)),
  check (
    (event_type in (
      'loyalty.points.earned', 'loyalty.points.released',
      'loyalty.points.expiring', 'loyalty.reward.changed',
      'loyalty.tier.changed', 'loyalty.referral.changed'
    ) and purpose = 'loyalty_transactional'
      and customer_id is not null and programme_group_id is not null)
    or (event_type = 'loyalty.campaign.effect'
      and purpose = 'loyalty_marketing'
      and customer_id is not null and programme_group_id is not null)
    or (event_type in ('loyalty.connector.health', 'loyalty.billing.changed')
      and purpose = 'merchant_operational' and customer_id is null)
  )
);

create index notification_events_subject_idx
  on loyalty_private.notification_events (
    organization_id, customer_id, occurred_at desc, id desc
  ) where customer_id is not null;
create index notification_events_type_idx
  on loyalty_private.notification_events (
    organization_id, event_type, occurred_at desc, id desc
  );

create table loyalty_private.notification_preference_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  customer_id bigint not null,
  account_link_id bigint,
  actor_user_id uuid,
  channel text not null check (channel = 'email'),
  purpose text not null check (
    purpose in ('loyalty_transactional', 'loyalty_marketing')
  ),
  from_state text not null check (
    from_state in ('subscribed', 'unsubscribed', 'suppressed')
  ),
  to_state text not null check (
    to_state in ('subscribed', 'unsubscribed', 'suppressed')
  ),
  source text not null check (source in ('customer', 'provider', 'system')),
  policy_version text not null,
  reason_code text,
  idempotency_key text not null,
  request_sha256 bytea not null check (pg_catalog.octet_length(request_sha256) = 32),
  correlation_id uuid,
  effective_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, account_link_id)
    references loyalty.customer_user_links(organization_id, id) on delete restrict,
  check (policy_version ~ '^[a-z][a-z0-9_-]{0,79}$'),
  check (pg_catalog.length(idempotency_key) between 1 and 255),
  check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_-]{0,79}$'),
  check (
    (source = 'customer' and account_link_id is not null
      and actor_user_id is not null and reason_code is null
      and correlation_id is not null)
    or (source in ('provider', 'system') and account_link_id is null
      and actor_user_id is null and reason_code is not null)
  )
);

create index notification_preference_events_subject_idx
  on loyalty_private.notification_preference_events (
    organization_id, customer_id, channel, purpose, effective_at desc, id desc
  );

create table loyalty_private.notification_preferences (
  organization_id bigint not null,
  customer_id bigint not null,
  channel text not null check (channel = 'email'),
  purpose text not null check (
    purpose in ('loyalty_transactional', 'loyalty_marketing')
  ),
  state text not null check (
    state in ('subscribed', 'unsubscribed', 'suppressed')
  ),
  source text not null check (source in ('customer', 'provider', 'system')),
  policy_version text not null,
  effective_at timestamptz not null,
  last_event_id bigint not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, customer_id, channel, purpose),
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, last_event_id)
    references loyalty_private.notification_preference_events(
      organization_id, id
    ) on delete restrict,
  check (policy_version ~ '^[a-z][a-z0-9_-]{0,79}$'),
  check (updated_at >= effective_at)
);

create or replace function loyalty_private.emit_notification_event_v1(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_customer_id bigint,
  target_event_type text,
  target_source_kind text,
  target_source_reference text,
  target_deduplication_key text,
  target_occurred_at timestamptz,
  target_payload jsonb
)
returns table (
  event_public_id uuid,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_purpose text;
  request_hash bytea;
  existing_event loyalty_private.notification_events%rowtype;
  created_event loyalty_private.notification_events%rowtype;
begin
  target_purpose := case
    when target_event_type in (
      'loyalty.points.earned', 'loyalty.points.released',
      'loyalty.points.expiring', 'loyalty.reward.changed',
      'loyalty.tier.changed', 'loyalty.referral.changed'
    ) then 'loyalty_transactional'
    when target_event_type = 'loyalty.campaign.effect'
      then 'loyalty_marketing'
    when target_event_type in (
      'loyalty.connector.health', 'loyalty.billing.changed'
    ) then 'merchant_operational'
    else null
  end;
  if target_organization_id is null or target_purpose is null
    or target_source_kind !~ '^[a-z][a-z0-9_.-]{0,79}$'
    or pg_catalog.length(target_source_reference) not between 1 and 500
    or pg_catalog.length(target_deduplication_key) not between 1 and 255
    or target_occurred_at is null
    or not loyalty_private.notification_payload_valid_v1(
      target_event_type, target_payload
    ) then
    raise exception using errcode = '22023',
      message = 'invalid notification event';
  end if;
  if target_purpose = 'merchant_operational' then
    if target_customer_id is not null then
      raise exception using errcode = '22023',
        message = 'invalid notification subject';
    end if;
    perform 1 from loyalty.organizations as organization
    where organization.id = target_organization_id;
  else
    if target_customer_id is null or target_programme_group_id is null then
      raise exception using errcode = '22023',
        message = 'invalid notification subject';
    end if;
    perform 1
    from loyalty.customers as customer
    join loyalty.programme_groups as programme_group
      on programme_group.organization_id = customer.organization_id
     and programme_group.id = target_programme_group_id
    where customer.organization_id = target_organization_id
      and customer.id = target_customer_id;
  end if;
  if not found then
    raise exception using errcode = '23503',
      message = 'notification subject not found';
  end if;

  request_hash := extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'organizationId', target_organization_id::text,
      'programmeGroupId', target_programme_group_id::text,
      'customerId', target_customer_id::text,
      'eventType', target_event_type,
      'sourceKind', target_source_kind,
      'sourceReference', target_source_reference,
      'occurredAt', target_occurred_at,
      'payload', target_payload
    )::text, 'UTF8'
  ), 'sha256');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-event|' || target_organization_id::text || '|' ||
    target_deduplication_key, 0
  ));
  select event.* into existing_event
  from loyalty_private.notification_events as event
  where event.organization_id = target_organization_id
    and event.deduplication_key = target_deduplication_key;
  if found then
    if existing_event.event_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'notification event idempotency conflict';
    end if;
    return query select existing_event.public_id, 'duplicate'::text;
    return;
  end if;

  insert into loyalty_private.notification_events (
    organization_id, programme_group_id, customer_id, event_type, purpose,
    source_kind, source_reference, deduplication_key, occurred_at, payload,
    event_sha256
  ) values (
    target_organization_id, target_programme_group_id, target_customer_id,
    target_event_type, target_purpose, target_source_kind,
    target_source_reference, target_deduplication_key, target_occurred_at,
    target_payload, request_hash
  ) returning * into strict created_event;
  return query select created_event.public_id, 'created'::text;
end;
$$;

create or replace function loyalty.get_my_notification_preferences_v1()
returns table (
  account_id uuid,
  purpose text,
  state text,
  policy_version text,
  effective_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select link.public_id,
    defaults.purpose,
    pg_catalog.coalesce(preference.state, defaults.default_state),
    pg_catalog.coalesce(preference.policy_version, 'default-v1'),
    preference.effective_at
  from loyalty.customer_user_links as link
  join loyalty.customers as customer
    on customer.organization_id = link.organization_id
   and customer.id = link.customer_id
   and customer.status = 'active'
  join loyalty.organizations as organization
    on organization.id = link.organization_id
   and organization.status = 'active'
  cross join (values
    ('loyalty_transactional'::text, 'subscribed'::text),
    ('loyalty_marketing'::text, 'unsubscribed'::text)
  ) as defaults(purpose, default_state)
  left join loyalty_private.notification_preferences as preference
    on preference.organization_id = link.organization_id
   and preference.customer_id = link.customer_id
   and preference.channel = 'email'
   and preference.purpose = defaults.purpose
  where link.auth_user_id = loyalty_private.request_user_id()
    and link.revoked_at is null
  order by link.id, defaults.purpose;
$$;

create or replace function loyalty.set_my_notification_preference_v1(
  target_account_id uuid,
  target_purpose text,
  target_state text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  preference_state text,
  outcome text,
  effective_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_link loyalty.customer_user_links%rowtype;
  current_preference loyalty_private.notification_preferences%rowtype;
  existing_event loyalty_private.notification_preference_events%rowtype;
  created_event loyalty_private.notification_preference_events%rowtype;
  default_state text;
  prior_state text;
  applied_state text;
  request_hash bytea;
  decision_at timestamptz := pg_catalog.statement_timestamp();
begin
  if actor_user_id is null or target_account_id is null
    or target_purpose not in ('loyalty_transactional', 'loyalty_marketing')
    or target_state not in ('subscribed', 'unsubscribed')
    or pg_catalog.length(target_idempotency_key) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid notification preference command';
  end if;
  select link.* into target_link
  from loyalty.customer_user_links as link
  join loyalty.customers as customer
    on customer.organization_id = link.organization_id
   and customer.id = link.customer_id and customer.status = 'active'
  join loyalty.organizations as organization
    on organization.id = link.organization_id and organization.status = 'active'
  where link.public_id = target_account_id
    and link.auth_user_id = actor_user_id and link.revoked_at is null;
  if not found then
    raise exception using errcode = '42501',
      message = 'notification preference not authorized';
  end if;

  request_hash := extensions.digest(pg_catalog.convert_to(
    'notification.preference.set|' || target_link.public_id::text || '|' ||
    target_purpose || '|' || target_state, 'UTF8'
  ), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-preference|' || target_link.organization_id::text || '|' ||
    target_link.customer_id::text || '|email|' || target_purpose, 0
  ));
  select event.* into existing_event
  from loyalty_private.notification_preference_events as event
  where event.organization_id = target_link.organization_id
    and event.idempotency_key = target_idempotency_key;
  if found then
    if existing_event.request_sha256 <> request_hash
      or existing_event.actor_user_id <> actor_user_id then
      raise exception using errcode = '23514',
        message = 'notification preference idempotency conflict';
    end if;
    return query select existing_event.to_state, 'duplicate'::text,
      existing_event.effective_at;
    return;
  end if;

  select preference.* into current_preference
  from loyalty_private.notification_preferences as preference
  where preference.organization_id = target_link.organization_id
    and preference.customer_id = target_link.customer_id
    and preference.channel = 'email' and preference.purpose = target_purpose
  for update;
  default_state := case when target_purpose = 'loyalty_transactional'
    then 'subscribed' else 'unsubscribed' end;
  prior_state := pg_catalog.coalesce(current_preference.state, default_state);
  if prior_state = 'suppressed' and target_state = 'subscribed' then
    raise exception using errcode = '42501',
      message = 'notification preference is suppressed';
  end if;
  applied_state := case when prior_state = 'suppressed'
    then 'suppressed' else target_state end;

  insert into loyalty_private.notification_preference_events (
    organization_id, customer_id, account_link_id, actor_user_id, channel,
    purpose, from_state, to_state, source, policy_version, idempotency_key,
    request_sha256, correlation_id, effective_at
  ) values (
    target_link.organization_id, target_link.customer_id, target_link.id,
    actor_user_id, 'email', target_purpose, prior_state, applied_state,
    'customer', 'notifications-v1', target_idempotency_key, request_hash,
    target_correlation_id, decision_at
  ) returning * into strict created_event;
  insert into loyalty_private.notification_preferences (
    organization_id, customer_id, channel, purpose, state, source,
    policy_version, effective_at, last_event_id, updated_at
  ) values (
    target_link.organization_id, target_link.customer_id, 'email',
    target_purpose, applied_state, 'customer', 'notifications-v1', decision_at,
    created_event.id, decision_at
  ) on conflict (organization_id, customer_id, channel, purpose) do update
    set state = excluded.state, source = excluded.source,
      policy_version = excluded.policy_version,
      effective_at = excluded.effective_at,
      last_event_id = excluded.last_event_id,
      updated_at = excluded.updated_at;
  return query select applied_state, 'updated'::text, decision_at;
end;
$$;

create or replace function loyalty_private.record_notification_suppression_v1(
  target_organization_id bigint,
  target_customer_id bigint,
  target_purpose text,
  target_suppressed boolean,
  target_source text,
  target_reason_code text,
  target_idempotency_key text,
  target_effective_at timestamptz
)
returns table (
  preference_state text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_preference loyalty_private.notification_preferences%rowtype;
  existing_event loyalty_private.notification_preference_events%rowtype;
  created_event loyalty_private.notification_preference_events%rowtype;
  default_state text;
  prior_state text;
  applied_state text;
  request_hash bytea;
begin
  if target_organization_id is null or target_customer_id is null
    or target_purpose not in ('loyalty_transactional', 'loyalty_marketing')
    or target_suppressed is null or target_source not in ('provider', 'system')
    or target_reason_code not in (
      'provider_unsubscribe', 'hard_bounce', 'spam_complaint',
      'invalid_contact', 'privacy_erasure', 'provider_unsuppressed',
      'system_recovery'
    )
    or pg_catalog.length(target_idempotency_key) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or target_effective_at is null then
    raise exception using errcode = '22023',
      message = 'invalid notification suppression command';
  end if;
  perform 1 from loyalty.customers as customer
  where customer.organization_id = target_organization_id
    and customer.id = target_customer_id;
  if not found then
    raise exception using errcode = '23503',
      message = 'notification customer not found';
  end if;
  request_hash := extensions.digest(pg_catalog.convert_to(
    'notification.suppression.record|' || target_organization_id::text || '|' ||
    target_customer_id::text || '|' || target_purpose || '|' ||
    target_suppressed::text || '|' || target_source || '|' ||
    target_reason_code || '|' || target_effective_at::text, 'UTF8'
  ), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'notification-preference|' || target_organization_id::text || '|' ||
    target_customer_id::text || '|email|' || target_purpose, 0
  ));
  select event.* into existing_event
  from loyalty_private.notification_preference_events as event
  where event.organization_id = target_organization_id
    and event.idempotency_key = target_idempotency_key;
  if found then
    if existing_event.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'notification suppression idempotency conflict';
    end if;
    return query select existing_event.to_state, 'duplicate'::text;
    return;
  end if;

  select preference.* into current_preference
  from loyalty_private.notification_preferences as preference
  where preference.organization_id = target_organization_id
    and preference.customer_id = target_customer_id
    and preference.channel = 'email' and preference.purpose = target_purpose
  for update;
  default_state := case when target_purpose = 'loyalty_transactional'
    then 'subscribed' else 'unsubscribed' end;
  prior_state := pg_catalog.coalesce(current_preference.state, default_state);
  applied_state := case when target_suppressed
    then 'suppressed' else 'unsubscribed' end;
  if target_effective_at < pg_catalog.coalesce(
    current_preference.effective_at, '-infinity'::timestamptz
  ) then
    raise exception using errcode = '23514',
      message = 'notification preference moved backwards';
  end if;

  insert into loyalty_private.notification_preference_events (
    organization_id, customer_id, channel, purpose, from_state, to_state,
    source, policy_version, reason_code, idempotency_key, request_sha256,
    effective_at
  ) values (
    target_organization_id, target_customer_id, 'email', target_purpose,
    prior_state, applied_state, target_source, 'notifications-v1',
    target_reason_code, target_idempotency_key, request_hash,
    target_effective_at
  ) returning * into strict created_event;
  insert into loyalty_private.notification_preferences (
    organization_id, customer_id, channel, purpose, state, source,
    policy_version, effective_at, last_event_id, updated_at
  ) values (
    target_organization_id, target_customer_id, 'email', target_purpose,
    applied_state, target_source, 'notifications-v1', target_effective_at,
    created_event.id, pg_catalog.clock_timestamp()
  ) on conflict (organization_id, customer_id, channel, purpose) do update
    set state = excluded.state, source = excluded.source,
      policy_version = excluded.policy_version,
      effective_at = excluded.effective_at,
      last_event_id = excluded.last_event_id,
      updated_at = excluded.updated_at;
  return query select applied_state, 'updated'::text;
end;
$$;

create or replace function loyalty_private.emit_point_expiry_notification_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_wallet loyalty.wallets%rowtype;
  target_lot loyalty.point_lots%rowtype;
begin
  select wallet.* into strict target_wallet
  from loyalty.wallets as wallet
  where wallet.organization_id = new.organization_id
    and wallet.id = new.wallet_id;
  select lot.* into strict target_lot
  from loyalty.point_lots as lot
  where lot.organization_id = new.organization_id and lot.id = new.lot_id;
  perform * from loyalty_private.emit_notification_event_v1(
    new.organization_id, target_lot.programme_group_id,
    target_wallet.customer_id, 'loyalty.points.expiring',
    'point_expiry_notification', new.public_id::text,
    'point-expiry:' || new.public_id::text, new.created_at,
    pg_catalog.jsonb_build_object(
      'points', new.points_snapshot::text,
      'expiresAt', new.expires_at,
      'daysRemaining', new.notify_before_days
    )
  );
  return new;
end;
$$;

create trigger point_expiry_notifications_emit_event
after insert on loyalty_private.point_expiry_notifications
for each row execute function
  loyalty_private.emit_point_expiry_notification_event_v1();

create or replace function loyalty_private.suppress_customer_notifications_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = new.status or new.status not in ('pseudonymized', 'closed') then
    return new;
  end if;
  perform * from loyalty_private.record_notification_suppression_v1(
    new.organization_id, new.id, 'loyalty_transactional', true, 'system',
    'privacy_erasure',
    'customer-status:' || new.public_id::text || ':loyalty-transactional:' ||
      new.status,
    pg_catalog.clock_timestamp()
  );
  perform * from loyalty_private.record_notification_suppression_v1(
    new.organization_id, new.id, 'loyalty_marketing', true, 'system',
    'privacy_erasure',
    'customer-status:' || new.public_id::text || ':loyalty-marketing:' ||
      new.status,
    pg_catalog.clock_timestamp()
  );
  return new;
end;
$$;

create trigger customers_suppress_notifications
after update of status on loyalty.customers
for each row execute function loyalty_private.suppress_customer_notifications_v1();

alter table loyalty_private.notification_events owner to loyalty_owner;
alter table loyalty_private.notification_preference_events owner to loyalty_owner;
alter table loyalty_private.notification_preferences owner to loyalty_owner;
alter function loyalty_private.notification_json_keys_exact_v1(jsonb, text[])
  owner to loyalty_owner;
alter function loyalty_private.notification_bigint_text_valid_v1(text, boolean)
  owner to loyalty_owner;
alter function loyalty_private.notification_code_valid_v1(text)
  owner to loyalty_owner;
alter function loyalty_private.notification_uuid_valid_v1(text)
  owner to loyalty_owner;
alter function loyalty_private.notification_instant_valid_v1(text)
  owner to loyalty_owner;
alter function loyalty_private.notification_payload_valid_v1(text, jsonb)
  owner to loyalty_owner;
alter function loyalty_private.emit_notification_event_v1(
  bigint, bigint, bigint, text, text, text, text, timestamptz, jsonb
) owner to loyalty_owner;
alter function loyalty.get_my_notification_preferences_v1()
  owner to loyalty_owner;
alter function loyalty.set_my_notification_preference_v1(
  uuid, text, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.record_notification_suppression_v1(
  bigint, bigint, text, boolean, text, text, text, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.emit_point_expiry_notification_event_v1()
  owner to loyalty_owner;
alter function loyalty_private.suppress_customer_notifications_v1()
  owner to loyalty_owner;

create trigger notification_events_immutable
before update or delete on loyalty_private.notification_events
for each row execute function loyalty_private.reject_immutable_change();
create trigger notification_preference_events_immutable
before update or delete on loyalty_private.notification_preference_events
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.notification_events enable row level security;
alter table loyalty_private.notification_preference_events enable row level security;
alter table loyalty_private.notification_preferences enable row level security;

revoke all on loyalty_private.notification_events,
  loyalty_private.notification_preference_events,
  loyalty_private.notification_preferences
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function
  loyalty_private.notification_json_keys_exact_v1(jsonb, text[]),
  loyalty_private.notification_bigint_text_valid_v1(text, boolean),
  loyalty_private.notification_code_valid_v1(text),
  loyalty_private.notification_uuid_valid_v1(text),
  loyalty_private.notification_instant_valid_v1(text),
  loyalty_private.notification_payload_valid_v1(text, jsonb),
  loyalty_private.emit_notification_event_v1(
    bigint, bigint, bigint, text, text, text, text, timestamptz, jsonb
  ),
  loyalty_private.record_notification_suppression_v1(
    bigint, bigint, text, boolean, text, text, text, timestamptz
  ),
  loyalty_private.emit_point_expiry_notification_event_v1(),
  loyalty_private.suppress_customer_notifications_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function
  loyalty.get_my_notification_preferences_v1(),
  loyalty.set_my_notification_preference_v1(uuid, text, text, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty.get_my_notification_preferences_v1(),
  loyalty.set_my_notification_preference_v1(uuid, text, text, text, uuid)
  to authenticated;
grant execute on function
  loyalty_private.emit_notification_event_v1(
    bigint, bigint, bigint, text, text, text, text, timestamptz, jsonb
  ),
  loyalty_private.record_notification_suppression_v1(
    bigint, bigint, text, boolean, text, text, text, timestamptz
  ) to loyalty_worker;

comment on table loyalty_private.notification_events is
  'Immutable provider-neutral notification facts with strict PII-free versioned payloads.';
comment on table loyalty_private.notification_preference_events is
  'Append-only customer consent and trusted suppression decisions; no contact data is stored.';
comment on table loyalty_private.notification_preferences is
  'Current purpose-separated email eligibility projection updated only by protected commands.';
comment on function loyalty.get_my_notification_preferences_v1() is
  'Returns minimized default-or-explicit preferences for active Auth-derived customer links.';
comment on function loyalty.set_my_notification_preference_v1(
  uuid, text, text, text, uuid
) is
  'Records an idempotent Auth-derived customer consent decision without accepting tenant, customer, channel, provider, or contact authority.';
