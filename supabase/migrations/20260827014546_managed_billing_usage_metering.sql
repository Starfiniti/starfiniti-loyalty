-- M14-S04 immutable source-fact usage metering. PostgreSQL remains the
-- authority; Stripe is an optional, asynchronously reconciled sink.

create table loyalty_private.managed_billing_usage_meter_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  meter_key text not null check (meter_key in (
    'orders', 'active_members', 'messages', 'api_requests'
  )),
  version integer not null check (version > 0),
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_event_name text not null check (
    provider_event_name ~ '^[a-z][a-z0-9_]{1,99}$'
  ),
  live_mode boolean not null,
  enabled boolean not null,
  effective_from timestamptz not null,
  actor_reference text not null check (
    pg_catalog.length(pg_catalog.btrim(actor_reference)) between 3 and 200
  ),
  reason text not null check (
    pg_catalog.length(pg_catalog.btrim(reason)) between 8 and 1000
  ),
  idempotency_key uuid not null unique,
  request_fingerprint bytea not null check (
    pg_catalog.octet_length(request_fingerprint) = 32
  ),
  created_at timestamptz not null default now(),
  unique (meter_key, live_mode, version)
);

create index managed_billing_usage_meter_versions_current_idx
  on loyalty_private.managed_billing_usage_meter_versions (
    meter_key, live_mode, effective_from desc, version desc, id desc
  );
create index managed_billing_usage_meter_versions_event_name_idx
  on loyalty_private.managed_billing_usage_meter_versions (
    live_mode, provider_event_name, meter_key, version desc
  );

create table loyalty_private.managed_billing_usage_facts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null
    references loyalty.organizations(id) on delete restrict,
  meter_key text not null check (meter_key in (
    'orders', 'active_members', 'messages', 'api_requests'
  )),
  source_kind text not null check (source_kind in (
    'commerce_order', 'active_member_month', 'smtp_message',
    'klaviyo_message', 'service_customer_command',
    'service_activity_command', 'correction'
  )),
  source_subject_public_id uuid not null,
  source_evidence_public_id uuid not null,
  source_reference_sha256 bytea not null check (
    pg_catalog.octet_length(source_reference_sha256) = 32
  ),
  quantity bigint not null check (quantity <> 0),
  usage_period_start timestamptz not null,
  usage_period_end timestamptz not null,
  occurred_at timestamptz not null,
  correction_of_fact_id bigint,
  idempotency_key uuid,
  actor_reference text not null check (
    pg_catalog.length(pg_catalog.btrim(actor_reference)) between 3 and 200
  ),
  reason text not null check (
    pg_catalog.length(pg_catalog.btrim(reason)) between 8 and 1000
  ),
  fact_sha256 bytea not null check (pg_catalog.octet_length(fact_sha256) = 32),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, meter_key, source_kind, source_reference_sha256),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, correction_of_fact_id)
    references loyalty_private.managed_billing_usage_facts(
      organization_id, id
    ) on delete restrict,
  check (usage_period_end > usage_period_start),
  check (
    usage_period_start = pg_catalog.date_trunc(
      'month', usage_period_start, 'UTC'
    )
  ),
  check (usage_period_end = usage_period_start + interval '1 month'),
  check (
    (source_kind = 'correction' and correction_of_fact_id is not null
      and idempotency_key is not null)
    or (source_kind <> 'correction' and correction_of_fact_id is null
      and idempotency_key is null and quantity = 1)
  )
);

create index managed_billing_usage_facts_period_idx
  on loyalty_private.managed_billing_usage_facts (
    organization_id, usage_period_start, meter_key, id
  );
create index managed_billing_usage_facts_correction_idx
  on loyalty_private.managed_billing_usage_facts (
    organization_id, correction_of_fact_id, id
  ) where correction_of_fact_id is not null;

create table loyalty_private.managed_billing_usage_dispatches (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  usage_fact_id bigint not null,
  meter_version_id bigint not null
    references loyalty_private.managed_billing_usage_meter_versions(id)
    on delete restrict,
  billing_account_version_id bigint not null
    references loyalty_private.managed_billing_account_versions(id)
    on delete restrict,
  provider_identifier text not null unique check (
    provider_identifier ~ '^m14u_[a-f0-9]{32}$'
  ),
  state text not null default 'pending' check (state in (
    'pending', 'processing', 'retryable', 'held', 'accepted',
    'ambiguous', 'rejected'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz,
  locked_by text,
  lease_token uuid,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  authorized_at timestamptz,
  accepted_at timestamptz,
  last_detail_code text check (
    last_detail_code is null
    or last_detail_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, usage_fact_id),
  foreign key (organization_id, usage_fact_id)
    references loyalty_private.managed_billing_usage_facts(
      organization_id, id
    ) on delete restrict,
  check (
    (state = 'processing' and locked_by is not null and lease_token is not null
      and locked_at is not null and lease_expires_at is not null)
    or (state <> 'processing' and locked_by is null and locked_at is null
      and lease_token is null and lease_expires_at is null
      and authorized_at is null)
  ),
  check (authorized_at is null or authorized_at >= locked_at),
  check ((state = 'accepted') = (accepted_at is not null)),
  check (accepted_at is null or accepted_at >= created_at),
  check (updated_at >= created_at)
);

create index managed_billing_usage_dispatches_claim_idx
  on loyalty_private.managed_billing_usage_dispatches (
    state, next_attempt_at, created_at, id
  ) where state in ('pending', 'processing', 'retryable', 'held');
create index managed_billing_usage_dispatches_tenant_idx
  on loyalty_private.managed_billing_usage_dispatches (
    organization_id, state, created_at desc, id desc
  );

create table loyalty_private.managed_billing_usage_dispatch_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  dispatch_id bigint not null,
  attempt_number integer not null check (attempt_number between 1 and 10),
  worker_reference text not null check (
    pg_catalog.length(worker_reference) between 3 and 120
  ),
  outcome text not null check (outcome in (
    'accepted', 'retryable', 'ambiguous', 'rejected', 'held'
  )),
  response_class text not null check (response_class in (
    'success', 'duplicate', 'temporary_failure', 'permanent_failure',
    'ambiguous', 'policy'
  )),
  response_code integer check (response_code between 200 and 599),
  error_code text check (
    error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint managed_billing_usage_dispatch_attempt_identity
    unique (dispatch_id, attempt_number),
  foreign key (organization_id, dispatch_id)
    references loyalty_private.managed_billing_usage_dispatches(
      organization_id, id
    ) on delete restrict,
  check (completed_at >= started_at)
);

alter table loyalty_private.managed_billing_usage_meter_versions
  owner to loyalty_owner;
alter table loyalty_private.managed_billing_usage_facts owner to loyalty_owner;
alter table loyalty_private.managed_billing_usage_dispatches owner to loyalty_owner;
alter table loyalty_private.managed_billing_usage_dispatch_attempts
  owner to loyalty_owner;

create trigger managed_billing_usage_meter_versions_immutable
before update or delete
on loyalty_private.managed_billing_usage_meter_versions
for each row execute function loyalty_private.reject_immutable_change();

create trigger managed_billing_usage_facts_immutable
before update or delete on loyalty_private.managed_billing_usage_facts
for each row execute function loyalty_private.reject_immutable_change();

create trigger managed_billing_usage_dispatch_attempts_immutable
before update or delete
on loyalty_private.managed_billing_usage_dispatch_attempts
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.protect_managed_billing_usage_dispatch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'managed billing usage dispatch identity is immutable';
  end if;
  if old.id <> new.id
    or old.public_id <> new.public_id
    or old.organization_id <> new.organization_id
    or old.usage_fact_id <> new.usage_fact_id
    or old.meter_version_id <> new.meter_version_id
    or old.billing_account_version_id <> new.billing_account_version_id
    or old.provider_identifier <> new.provider_identifier
    or old.created_at <> new.created_at then
    raise exception using errcode = '55000',
      message = 'managed billing usage dispatch identity is immutable';
  end if;
  return new;
end;
$$;

alter function loyalty_private.protect_managed_billing_usage_dispatch()
  owner to loyalty_owner;

create trigger managed_billing_usage_dispatch_identity
before update or delete on loyalty_private.managed_billing_usage_dispatches
for each row execute function loyalty_private.protect_managed_billing_usage_dispatch();

create or replace function loyalty_private.record_managed_billing_usage_meter_v1(
  target_meter_key text,
  target_version integer,
  target_provider_event_name text,
  target_live_mode boolean,
  target_enabled boolean,
  target_effective_from timestamptz,
  target_actor_reference text,
  target_reason text,
  target_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_deployment_mode text;
  target_fingerprint bytea;
  existing loyalty_private.managed_billing_usage_meter_versions%rowtype;
  created_public_id uuid;
begin
  select configuration.deployment_mode into target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_effective_from
  order by configuration.effective_from desc, configuration.id desc
  limit 1;

  if target_meter_key not in (
      'orders', 'active_members', 'messages', 'api_requests'
    )
    or target_version is null or target_version < 1
    or target_provider_event_name is null
    or target_provider_event_name !~ '^[a-z][a-z0-9_]{1,99}$'
    or target_live_mode is null or target_enabled is null
    or target_effective_from is null
    or target_actor_reference is null
    or pg_catalog.length(pg_catalog.btrim(target_actor_reference))
      not between 3 and 200
    or target_reason is null
    or pg_catalog.length(pg_catalog.btrim(target_reason)) not between 8 and 1000
    or target_idempotency_key is null
    or target_deployment_mode is distinct from 'managed' then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage meter request';
  end if;

  target_fingerprint := extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(
      target_meter_key, target_version, target_provider_event_name,
      target_live_mode, target_enabled, target_effective_from,
      pg_catalog.btrim(target_actor_reference), pg_catalog.btrim(target_reason)
    )::text,
    'UTF8'
  ), 'sha256');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-usage-meter:' || target_idempotency_key::text, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-usage-meter-key:' || target_live_mode::text || ':' ||
      target_meter_key,
    0
  ));

  select meter.* into existing
  from loyalty_private.managed_billing_usage_meter_versions as meter
  where meter.idempotency_key = target_idempotency_key;
  if existing.id is not null then
    if existing.request_fingerprint = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505',
      message = 'managed billing usage meter idempotency conflict';
  end if;

  if exists (
    select 1
    from loyalty_private.managed_billing_usage_meter_versions as meter
    where meter.live_mode = target_live_mode
      and meter.provider_event_name = target_provider_event_name
      and meter.meter_key <> target_meter_key
  ) then
    raise exception using errcode = '23505',
      message = 'managed billing usage event name conflict';
  end if;

  if target_version <> 1 + coalesce((
    select pg_catalog.max(meter.version)
    from loyalty_private.managed_billing_usage_meter_versions as meter
    where meter.live_mode = target_live_mode
      and meter.meter_key = target_meter_key
  ), 0) then
    raise exception using errcode = '22023',
      message = 'managed billing usage meter version sequence invalid';
  end if;

  insert into loyalty_private.managed_billing_usage_meter_versions (
    meter_key, version, provider_event_name, live_mode, enabled,
    effective_from, actor_reference, reason, idempotency_key,
    request_fingerprint
  ) values (
    target_meter_key, target_version, target_provider_event_name,
    target_live_mode, target_enabled, target_effective_from,
    pg_catalog.btrim(target_actor_reference), pg_catalog.btrim(target_reason),
    target_idempotency_key, target_fingerprint
  ) returning public_id into created_public_id;
  return created_public_id;
end;
$$;

create or replace function loyalty_private.capture_managed_billing_usage_facts_v1(
  target_limit integer default 500,
  target_observed_at timestamptz default now()
)
returns table (meter_key text, captured_count bigint)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  target_deployment_mode text;
begin
  if target_limit is null or target_limit not between 1 and 2000
    or target_observed_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage capture request';
  end if;

  select configuration.deployment_mode into strict target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_observed_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  if target_deployment_mode <> 'managed' then
    return;
  end if;

  return query
  with order_sources as (
    select distinct on (
      event.organization_id, event.connection_id, event.source_object_id
    )
      event.organization_id,
      'orders'::text as meter_key,
      'commerce_order'::text as source_kind,
      event.public_id as source_subject_public_id,
      event.public_id as source_evidence_public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:order:' || event.organization_id::text || ':' ||
          event.connection_id::text || ':' || event.source_object_id,
        'UTF8'
      ), 'sha256') as source_reference_sha256,
      event.created_at as occurred_at
    from loyalty_private.canonical_commerce_events as event
    where event.event_type in (
      'commerce.order.status_changed', 'commerce.order.refunded'
    )
      and event.created_at <= target_observed_at
    order by event.organization_id, event.connection_id,
      event.source_object_id, event.created_at, event.id
  ),
  active_member_sources as (
    select distinct on (
      transaction.organization_id, wallet.customer_id,
      pg_catalog.date_trunc('month', transaction.created_at, 'UTC')
    )
      transaction.organization_id,
      'active_members'::text as meter_key,
      'active_member_month'::text as source_kind,
      customer.public_id as source_subject_public_id,
      transaction.public_id as source_evidence_public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:active-member:' || transaction.organization_id::text || ':' ||
          customer.public_id::text || ':' ||
          pg_catalog.date_trunc('month', transaction.created_at, 'UTC')::text,
        'UTF8'
      ), 'sha256') as source_reference_sha256,
      transaction.created_at as occurred_at
    from loyalty.ledger_transactions as transaction
    join loyalty.ledger_entries as entry
      on entry.organization_id = transaction.organization_id
     and entry.transaction_id = transaction.id
    join loyalty.ledger_accounts as account
      on account.organization_id = entry.organization_id
     and account.id = entry.account_id
     and account.wallet_id is not null
    join loyalty.wallets as wallet
      on wallet.organization_id = account.organization_id
     and wallet.id = account.wallet_id
    join loyalty.customers as customer
      on customer.organization_id = wallet.organization_id
     and customer.id = wallet.customer_id
    where transaction.created_at <= target_observed_at
    order by transaction.organization_id, wallet.customer_id,
      pg_catalog.date_trunc('month', transaction.created_at, 'UTC'),
      transaction.created_at, transaction.id
  ),
  message_sources as (
    select delivery.organization_id,
      'messages'::text as meter_key,
      'smtp_message'::text as source_kind,
      event.public_id as source_subject_public_id,
      delivery.public_id as source_evidence_public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:smtp-message:' || delivery.public_id::text,
        'UTF8'
      ), 'sha256') as source_reference_sha256,
      delivery.delivered_at as occurred_at
    from loyalty_private.notification_smtp_deliveries as delivery
    join loyalty_private.notification_events as event
      on event.organization_id = delivery.organization_id
     and event.id = delivery.notification_event_id
    where delivery.state = 'delivered'
      and delivery.delivered_at <= target_observed_at
    union all
    select operation.organization_id,
      'messages'::text,
      'klaviyo_message'::text,
      event.public_id,
      operation.public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:klaviyo-message:' || operation.public_id::text,
        'UTF8'
      ), 'sha256'),
      operation.accepted_at
    from loyalty_private.notification_klaviyo_operations as operation
    join loyalty_private.notification_events as event
      on event.organization_id = operation.organization_id
     and event.id = operation.notification_event_id
    where operation.operation_kind = 'event_sync'
      and operation.state = 'completed'
      and operation.accepted_at <= target_observed_at
  ),
  api_sources as (
    select receipt.organization_id,
      'api_requests'::text as meter_key,
      'service_customer_command'::text as source_kind,
      customer.public_id as source_subject_public_id,
      receipt.public_id as source_evidence_public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:service-customer:' || receipt.public_id::text,
        'UTF8'
      ), 'sha256') as source_reference_sha256,
      receipt.created_at as occurred_at
    from loyalty_private.service_customer_command_receipts as receipt
    join loyalty.customers as customer
      on customer.organization_id = receipt.organization_id
     and customer.id = receipt.customer_id
    where receipt.created_at <= target_observed_at
    union all
    select event.organization_id,
      'api_requests'::text,
      'service_activity_command'::text,
      event.public_id,
      event.public_id,
      extensions.digest(pg_catalog.convert_to(
        'm14:v1:service-activity:' || event.public_id::text,
        'UTF8'
      ), 'sha256'),
      event.created_at
    from loyalty_private.canonical_commerce_events as event
    where event.event_type = 'commerce.activity.recorded'
      and event.source_event_id like 'service-api:%'
      and event.created_at <= target_observed_at
  ),
  all_sources as (
    select * from order_sources
    union all select * from active_member_sources
    union all select * from message_sources
    union all select * from api_sources
  ),
  missing_sources as (
    select source.*
    from all_sources as source
    cross join lateral loyalty_private.resolve_organization_entitlement(
      source.organization_id,
      'managed.billing',
      source.source_subject_public_id::text,
      source.occurred_at
    ) as entitlement
    where entitlement.deployment_mode = 'managed'
      and entitlement.enabled
      and not exists (
        select 1
        from loyalty_private.managed_billing_usage_facts as fact
        where fact.organization_id = source.organization_id
          and fact.meter_key = source.meter_key
          and fact.source_kind = source.source_kind
          and fact.source_reference_sha256 = source.source_reference_sha256
      )
    order by source.occurred_at, source.organization_id,
      source.meter_key, source.source_reference_sha256
    limit target_limit
  ),
  inserted as (
    insert into loyalty_private.managed_billing_usage_facts (
      organization_id, meter_key, source_kind, source_subject_public_id,
      source_evidence_public_id, source_reference_sha256, quantity,
      usage_period_start, usage_period_end, occurred_at,
      actor_reference, reason, fact_sha256, created_at
    )
    select source.organization_id, source.meter_key, source.source_kind,
      source.source_subject_public_id, source.source_evidence_public_id,
      source.source_reference_sha256, 1,
      pg_catalog.date_trunc('month', source.occurred_at, 'UTC'),
      pg_catalog.date_trunc('month', source.occurred_at, 'UTC') + interval '1 month',
      source.occurred_at, 'worker:billing-usage-capture',
      'Captured from one reviewed immutable product source fact',
      extensions.digest(pg_catalog.convert_to(
        pg_catalog.jsonb_build_array(
          '1', source.organization_id, source.meter_key, source.source_kind,
          pg_catalog.encode(source.source_reference_sha256, 'hex'), 1,
          pg_catalog.date_trunc('month', source.occurred_at, 'UTC'),
          source.occurred_at
        )::text,
        'UTF8'
      ), 'sha256'),
      target_observed_at
    from missing_sources as source
    -- Every non-correction insert has a generated public identity and no
    -- idempotency key. The remaining uniqueness fence is the immutable source
    -- identity, so concurrent capture workers can safely converge here without
    -- naming output-column variables in the conflict target.
    on conflict do nothing
    returning managed_billing_usage_facts.meter_key
  )
  select inserted.meter_key, pg_catalog.count(*)::bigint
  from inserted
  group by inserted.meter_key
  order by inserted.meter_key;
end;
$$;

create or replace function loyalty_private.record_managed_billing_usage_correction_v1(
  target_original_fact_public_id uuid,
  target_quantity bigint,
  target_actor_reference text,
  target_reason text,
  target_effective_at timestamptz,
  target_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  original loyalty_private.managed_billing_usage_facts%rowtype;
  existing loyalty_private.managed_billing_usage_facts%rowtype;
  target_reference_sha256 bytea;
  target_fingerprint bytea;
  corrected_total numeric;
  created_public_id uuid;
  entitlement record;
begin
  if target_original_fact_public_id is null or target_quantity is null
    or target_quantity = 0 or target_actor_reference is null
    or pg_catalog.length(pg_catalog.btrim(target_actor_reference))
      not between 3 and 200
    or target_reason is null
    or pg_catalog.length(pg_catalog.btrim(target_reason)) not between 8 and 1000
    or target_effective_at is null or target_idempotency_key is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage correction';
  end if;

  select fact.* into original
  from loyalty_private.managed_billing_usage_facts as fact
  where fact.public_id = target_original_fact_public_id
  for update;
  if original.id is null or original.source_kind = 'correction' then
    raise exception using errcode = '22023',
      message = 'managed billing usage source fact unavailable';
  end if;
  if target_effective_at < original.usage_period_start
    or target_effective_at >= original.usage_period_end then
    raise exception using errcode = '22023',
      message = 'managed billing usage correction period invalid';
  end if;

  select * into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    original.organization_id, 'managed.billing', original.public_id::text,
    target_effective_at
  );
  if entitlement.deployment_mode <> 'managed' or not entitlement.enabled then
    raise exception using errcode = '42501',
      message = 'managed billing usage correction unavailable';
  end if;

  target_reference_sha256 := extensions.digest(pg_catalog.convert_to(
    'm14:v1:usage-correction:' || original.organization_id::text || ':' ||
      original.public_id::text || ':' || target_idempotency_key::text,
    'UTF8'
  ), 'sha256');
  target_fingerprint := extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(
      '1', original.public_id, target_quantity,
      pg_catalog.btrim(target_actor_reference), pg_catalog.btrim(target_reason),
      target_effective_at, target_idempotency_key
    )::text,
    'UTF8'
  ), 'sha256');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'managed-billing-usage-correction:' || original.organization_id::text ||
      ':' || target_idempotency_key::text,
    0
  ));

  select fact.* into existing
  from loyalty_private.managed_billing_usage_facts as fact
  where fact.organization_id = original.organization_id
    and fact.idempotency_key = target_idempotency_key;
  if existing.id is not null then
    if existing.fact_sha256 = target_fingerprint then
      return existing.public_id;
    end if;
    raise exception using errcode = '23505',
      message = 'managed billing usage correction idempotency conflict';
  end if;

  select pg_catalog.sum(fact.quantity::numeric) + target_quantity::numeric
  into corrected_total
  from loyalty_private.managed_billing_usage_facts as fact
  where fact.organization_id = original.organization_id
    and (fact.id = original.id or fact.correction_of_fact_id = original.id);
  if corrected_total < 0
    or corrected_total > 9223372036854775807::numeric then
    raise exception using errcode = '22003',
      message = 'managed billing usage correction total invalid';
  end if;

  insert into loyalty_private.managed_billing_usage_facts (
    organization_id, meter_key, source_kind, source_subject_public_id,
    source_evidence_public_id, source_reference_sha256, quantity,
    usage_period_start, usage_period_end, occurred_at,
    correction_of_fact_id, idempotency_key, actor_reference, reason,
    fact_sha256, created_at
  ) values (
    original.organization_id, original.meter_key, 'correction',
    original.source_subject_public_id, original.public_id,
    target_reference_sha256, target_quantity,
    original.usage_period_start, original.usage_period_end,
    target_effective_at, original.id, target_idempotency_key,
    pg_catalog.btrim(target_actor_reference), pg_catalog.btrim(target_reason),
    target_fingerprint, target_effective_at
  ) returning public_id into created_public_id;
  return created_public_id;
end;
$$;

create or replace function loyalty_private.claim_managed_billing_usage_dispatches_v1(
  target_worker_id text,
  target_batch_size integer default 25,
  target_lease_seconds integer default 60,
  target_at timestamptz default now()
)
returns table (
  dispatch_public_id uuid,
  lease_token uuid,
  attempt_number integer
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  target_deployment_mode text;
begin
  if target_worker_id is null
    or pg_catalog.length(pg_catalog.btrim(target_worker_id)) not between 3 and 120
    or target_batch_size is null or target_batch_size not between 1 and 100
    or target_lease_seconds is null
    or target_lease_seconds not between 10 and 300
    or target_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage claim';
  end if;

  select configuration.deployment_mode into strict target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  if target_deployment_mode <> 'managed' then
    return;
  end if;

  insert into loyalty_private.managed_billing_usage_dispatch_attempts (
    organization_id, dispatch_id, attempt_number, worker_reference,
    outcome, response_class, error_code, started_at, completed_at
  )
  select dispatch.organization_id, dispatch.id, dispatch.attempt_count,
    dispatch.locked_by,
    case when dispatch.authorized_at is null then 'retryable' else 'ambiguous' end,
    case when dispatch.authorized_at is null
      then 'temporary_failure' else 'ambiguous' end,
    case when dispatch.authorized_at is null
      then 'billing_usage_lease_expired_before_authorization'
      else 'billing_usage_lease_expired_after_authorization' end,
    dispatch.locked_at, target_at
  from loyalty_private.managed_billing_usage_dispatches as dispatch
  where dispatch.state = 'processing'
    and dispatch.lease_expires_at <= target_at
  on conflict on constraint managed_billing_usage_dispatch_attempt_identity
    do nothing;

  update loyalty_private.managed_billing_usage_dispatches as dispatch
  set state = case when dispatch.authorized_at is null
      then 'retryable' else 'ambiguous' end,
    next_attempt_at = case when dispatch.authorized_at is null
      then target_at + interval '30 seconds' else null end,
    last_detail_code = case when dispatch.authorized_at is null
      then 'billing_usage_lease_expired_before_authorization'
      else 'billing_usage_lease_expired_after_authorization' end,
    locked_by = null, lease_token = null, locked_at = null,
    lease_expires_at = null, authorized_at = null, updated_at = target_at
  where dispatch.state = 'processing'
    and dispatch.lease_expires_at <= target_at;

  insert into loyalty_private.managed_billing_usage_dispatches (
    organization_id, usage_fact_id, meter_version_id,
    billing_account_version_id, provider_identifier, state,
    next_attempt_at, created_at, updated_at
  )
  select fact.organization_id, fact.id, meter.id, account.id,
    'm14u_' || pg_catalog.replace(fact.public_id::text, '-', ''),
    'pending', target_at, target_at, target_at
  from loyalty_private.managed_billing_usage_facts as fact
  left join loyalty_private.managed_billing_usage_dispatches
    as original_dispatch
    on fact.correction_of_fact_id is not null
   and original_dispatch.organization_id = fact.organization_id
   and original_dispatch.usage_fact_id = fact.correction_of_fact_id
   and original_dispatch.state = 'accepted'
  cross join lateral (
    select candidate.*
    from loyalty_private.managed_billing_account_versions as candidate
    where candidate.organization_id = fact.organization_id
      and (
        (fact.correction_of_fact_id is not null
          and candidate.id = original_dispatch.billing_account_version_id)
        or (fact.correction_of_fact_id is null
          and candidate.effective_from <= target_at
          and (candidate.effective_until is null
            or candidate.effective_until > target_at))
      )
    order by candidate.effective_from desc, candidate.id desc
    limit 1
  ) as account
  cross join lateral (
    select candidate.*
    from loyalty_private.managed_billing_usage_meter_versions as candidate
    where candidate.meter_key = fact.meter_key
      and (
        (fact.correction_of_fact_id is not null
          and candidate.id = original_dispatch.meter_version_id)
        or (fact.correction_of_fact_id is null
          and candidate.live_mode = account.live_mode
          and candidate.effective_from <= target_at)
      )
    order by candidate.effective_from desc, candidate.version desc,
      candidate.id desc
    limit 1
  ) as meter
  cross join lateral (
    select candidate.*
    from loyalty_private.managed_billing_provider_configuration_versions
      as candidate
    where candidate.effective_from <= target_at
    order by candidate.effective_from desc, candidate.id desc
    limit 1
  ) as provider_configuration
  cross join lateral loyalty_private.resolve_organization_entitlement(
    fact.organization_id, 'managed.billing', fact.public_id::text, target_at
  ) as entitlement
  where meter.enabled and provider_configuration.enabled
    and provider_configuration.live_mode = account.live_mode
    and entitlement.deployment_mode = 'managed' and entitlement.enabled
    and (fact.correction_of_fact_id is null
      or original_dispatch.id is not null)
    and (fact.correction_of_fact_id is not null
      or fact.occurred_at >= meter.effective_from)
    and not exists (
      select 1
      from loyalty_private.managed_billing_usage_dispatches as existing
      where existing.organization_id = fact.organization_id
        and existing.usage_fact_id = fact.id
    )
  order by fact.occurred_at, fact.id
  limit (target_batch_size * 4)
  -- Concurrent claimers can race on either the fact identity or its derived
  -- provider identifier. Both unique constraints describe the same immutable
  -- dispatch, so ignore either conflict and let the leasing query below select
  -- the committed row exactly once.
  on conflict do nothing;

  return query
  with candidates as (
    select dispatch.id
    from loyalty_private.managed_billing_usage_dispatches as dispatch
    where dispatch.state in ('pending', 'retryable', 'held')
      and coalesce(dispatch.next_attempt_at, target_at) <= target_at
      and dispatch.attempt_count < 10
    order by dispatch.created_at, dispatch.id
    for update skip locked
    limit target_batch_size
  )
  update loyalty_private.managed_billing_usage_dispatches as dispatch
  set state = 'processing', attempt_count = dispatch.attempt_count + 1,
    locked_by = pg_catalog.btrim(target_worker_id),
    lease_token = gen_random_uuid(), locked_at = target_at,
    lease_expires_at = target_at + pg_catalog.make_interval(
      secs => target_lease_seconds
    ),
    authorized_at = null, next_attempt_at = null,
    last_detail_code = null, updated_at = target_at
  from candidates
  where dispatch.id = candidates.id
  returning dispatch.public_id, dispatch.lease_token,
    dispatch.attempt_count;
end;
$$;

create or replace function loyalty_private.authorize_managed_billing_usage_dispatch_v1(
  target_dispatch_public_id uuid,
  target_lease_token uuid,
  target_worker_id text,
  target_at timestamptz default now()
)
returns table (
  provider_event_name text,
  provider_customer_id text,
  provider_identifier text,
  quantity text,
  occurred_at timestamptz,
  live_mode boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch loyalty_private.managed_billing_usage_dispatches%rowtype;
  fact loyalty_private.managed_billing_usage_facts%rowtype;
  bound_meter loyalty_private.managed_billing_usage_meter_versions%rowtype;
  current_meter loyalty_private.managed_billing_usage_meter_versions%rowtype;
  bound_account loyalty_private.managed_billing_account_versions%rowtype;
  current_account loyalty_private.managed_billing_account_versions%rowtype;
  original_dispatch loyalty_private.managed_billing_usage_dispatches%rowtype;
  provider_configuration
    loyalty_private.managed_billing_provider_configuration_versions%rowtype;
  target_deployment_mode text;
  target_hold_code text;
  entitlement record;
begin
  if target_dispatch_public_id is null or target_lease_token is null
    or target_worker_id is null
    or pg_catalog.length(pg_catalog.btrim(target_worker_id)) not between 3 and 120
    or target_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage authorization';
  end if;

  select candidate.* into dispatch
  from loyalty_private.managed_billing_usage_dispatches as candidate
  where candidate.public_id = target_dispatch_public_id
    and candidate.state = 'processing'
    and candidate.lease_token = target_lease_token
    and candidate.locked_by = pg_catalog.btrim(target_worker_id)
  for update;
  if dispatch.id is null or dispatch.lease_expires_at <= target_at then
    raise exception using errcode = '42501',
      message = 'managed billing usage dispatch unavailable';
  end if;

  select candidate.* into strict fact
  from loyalty_private.managed_billing_usage_facts as candidate
  where candidate.organization_id = dispatch.organization_id
    and candidate.id = dispatch.usage_fact_id;
  select candidate.* into strict bound_meter
  from loyalty_private.managed_billing_usage_meter_versions as candidate
  where candidate.id = dispatch.meter_version_id;
  select candidate.* into strict bound_account
  from loyalty_private.managed_billing_account_versions as candidate
  where candidate.organization_id = dispatch.organization_id
    and candidate.id = dispatch.billing_account_version_id;
  if fact.correction_of_fact_id is not null then
    select candidate.* into original_dispatch
    from loyalty_private.managed_billing_usage_dispatches as candidate
    where candidate.organization_id = dispatch.organization_id
      and candidate.usage_fact_id = fact.correction_of_fact_id
      and candidate.state = 'accepted';
  end if;

  select configuration.deployment_mode into strict target_deployment_mode
  from loyalty_private.deployment_configuration_versions as configuration
  where configuration.effective_from <= target_at
  order by configuration.effective_from desc, configuration.id desc
  limit 1;
  select * into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    dispatch.organization_id, 'managed.billing', dispatch.public_id::text,
    target_at
  );
  select candidate.* into provider_configuration
  from loyalty_private.managed_billing_provider_configuration_versions
    as candidate
  where candidate.effective_from <= target_at
  order by candidate.effective_from desc, candidate.id desc
  limit 1;
  select candidate.* into current_account
  from loyalty_private.managed_billing_account_versions as candidate
  where candidate.organization_id = dispatch.organization_id
    and candidate.effective_from <= target_at
    and (candidate.effective_until is null
      or candidate.effective_until > target_at)
  order by candidate.effective_from desc, candidate.id desc
  limit 1;
  select candidate.* into current_meter
  from loyalty_private.managed_billing_usage_meter_versions as candidate
  where candidate.meter_key = fact.meter_key
    and candidate.live_mode = bound_account.live_mode
    and candidate.effective_from <= target_at
  order by candidate.effective_from desc, candidate.version desc,
    candidate.id desc
  limit 1;

  if target_deployment_mode <> 'managed'
    or entitlement.deployment_mode <> 'managed' then
    target_hold_code := 'billing_usage_self_hosted';
  elsif not entitlement.enabled then
    target_hold_code := 'billing_usage_entitlement_disabled';
  elsif provider_configuration.id is null
    or not provider_configuration.enabled
    or provider_configuration.live_mode <> bound_account.live_mode then
    target_hold_code := 'billing_usage_provider_disabled';
  elsif fact.correction_of_fact_id is not null and (
      original_dispatch.id is null
      or original_dispatch.billing_account_version_id <> bound_account.id
      or original_dispatch.meter_version_id <> bound_meter.id
    ) then
    target_hold_code := 'billing_usage_correction_source_unaccepted';
  elsif fact.correction_of_fact_id is null
    and current_account.id is distinct from bound_account.id then
    target_hold_code := 'billing_usage_account_changed';
  elsif fact.correction_of_fact_id is null and (
      current_meter.id is distinct from bound_meter.id
      or not bound_meter.enabled
    ) then
    target_hold_code := 'billing_usage_meter_changed';
  elsif fact.occurred_at < target_at - interval '34 days'
    or fact.occurred_at > target_at + interval '5 minutes' then
    target_hold_code := 'billing_usage_outside_provider_window';
  end if;

  if target_hold_code is not null then
    insert into loyalty_private.managed_billing_usage_dispatch_attempts (
      organization_id, dispatch_id, attempt_number, worker_reference,
      outcome, response_class, error_code, started_at, completed_at
    ) values (
      dispatch.organization_id, dispatch.id, dispatch.attempt_count,
      pg_catalog.btrim(target_worker_id), 'held', 'policy', target_hold_code,
      dispatch.locked_at, target_at
    ) on conflict (dispatch_id, attempt_number) do nothing;
    update loyalty_private.managed_billing_usage_dispatches
    set state = 'held', next_attempt_at = target_at + interval '5 minutes',
      last_detail_code = target_hold_code, locked_by = null,
      lease_token = null, locked_at = null, lease_expires_at = null,
      authorized_at = null, updated_at = target_at
    where id = dispatch.id;
    return;
  end if;

  update loyalty_private.managed_billing_usage_dispatches
  set authorized_at = target_at, updated_at = target_at
  where id = dispatch.id;

  return query select bound_meter.provider_event_name,
    bound_account.provider_customer_id, dispatch.provider_identifier,
    fact.quantity::text, fact.occurred_at, bound_account.live_mode;
end;
$$;

create or replace function loyalty_private.finish_managed_billing_usage_dispatch_v1(
  target_dispatch_public_id uuid,
  target_lease_token uuid,
  target_worker_id text,
  target_outcome text,
  target_response_class text,
  target_response_code integer default null,
  target_error_code text default null,
  target_at timestamptz default now()
)
returns table (state text, next_attempt_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch loyalty_private.managed_billing_usage_dispatches%rowtype;
  final_state text;
  retry_at timestamptz;
  final_detail text;
begin
  if target_dispatch_public_id is null or target_lease_token is null
    or target_worker_id is null
    or pg_catalog.length(pg_catalog.btrim(target_worker_id)) not between 3 and 120
    or target_outcome is null or target_outcome not in (
      'accepted', 'retryable', 'ambiguous', 'rejected', 'held'
    )
    or target_response_class is null or target_response_class not in (
      'success', 'duplicate', 'temporary_failure', 'permanent_failure',
      'ambiguous', 'policy'
    )
    or (target_response_code is not null
      and target_response_code not between 200 and 599)
    or (target_error_code is not null
      and target_error_code !~ '^[a-z][a-z0-9_]{2,79}$')
    or target_at is null then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage result';
  end if;

  if (target_outcome = 'accepted' and (
      target_response_class not in ('success', 'duplicate')
      or target_error_code is not null
      or (target_response_class = 'success'
        and target_response_code not between 200 and 299)
    ))
    or (target_outcome = 'retryable' and (
      target_response_class <> 'temporary_failure'
      or not (
        target_response_code in (409, 429)
        or target_response_code between 500 and 599
        or (target_response_code is null and target_error_code in (
          'stripe_usage_connection_unavailable', 'stripe_usage_dns_unavailable',
          'stripe_usage_provider_unavailable'
        ))
      )
    ))
    or (target_outcome = 'ambiguous' and (
      target_response_class <> 'ambiguous' or target_response_code is not null
      or target_error_code not in (
        'stripe_usage_timeout', 'stripe_usage_response_interrupted'
      )
    ))
    or (target_outcome = 'rejected' and (
      target_response_class <> 'permanent_failure'
      or target_response_code not between 400 and 499
      or target_response_code in (409, 429)
      or target_error_code is null
    ))
    or (target_outcome = 'held' and (
      target_response_class <> 'policy' or target_response_code is not null
      or target_error_code is null
    )) then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage result classification';
  end if;

  select candidate.* into dispatch
  from loyalty_private.managed_billing_usage_dispatches as candidate
  where candidate.public_id = target_dispatch_public_id
    and candidate.state = 'processing'
    and candidate.lease_token = target_lease_token
    and candidate.locked_by = pg_catalog.btrim(target_worker_id)
    and candidate.authorized_at is not null
  for update;
  if dispatch.id is null then
    raise exception using errcode = '42501',
      message = 'managed billing usage result not owned';
  end if;

  insert into loyalty_private.managed_billing_usage_dispatch_attempts (
    organization_id, dispatch_id, attempt_number, worker_reference,
    outcome, response_class, response_code, error_code,
    started_at, completed_at
  ) values (
    dispatch.organization_id, dispatch.id, dispatch.attempt_count,
    pg_catalog.btrim(target_worker_id), target_outcome,
    target_response_class, target_response_code, target_error_code,
    dispatch.authorized_at, target_at
  );

  if target_outcome = 'accepted' then
    final_state := 'accepted';
  elsif target_outcome = 'retryable' and dispatch.attempt_count < 10 then
    final_state := 'retryable';
    retry_at := target_at + pg_catalog.make_interval(secs => least(
      3600, 30 * pg_catalog.power(2, dispatch.attempt_count - 1)::integer
    ));
  elsif target_outcome = 'retryable' then
    final_state := 'held';
    final_detail := 'billing_usage_attempt_limit_exhausted';
  elsif target_outcome = 'held' then
    final_state := 'held';
    retry_at := target_at + interval '5 minutes';
  else
    final_state := target_outcome;
  end if;

  update loyalty_private.managed_billing_usage_dispatches
  set state = final_state, next_attempt_at = retry_at,
    accepted_at = case when final_state = 'accepted' then target_at else null end,
    last_detail_code = coalesce(final_detail, target_error_code),
    locked_by = null, lease_token = null, locked_at = null,
    lease_expires_at = null, authorized_at = null, updated_at = target_at
  where id = dispatch.id;

  return query select final_state, retry_at;
end;
$$;

create or replace function loyalty.get_my_managed_billing_usage_summary_v1(
  target_organization_public_id uuid,
  target_period_start timestamptz,
  target_at timestamptz default now()
)
returns table (usage_summary jsonb)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_organization_id bigint;
  target_period_end timestamptz;
  target_dispatch_mode text := 'shadow';
  target_live_mode boolean;
  entitlement record;
begin
  if target_period_start is null or target_at is null
    or target_period_start <> pg_catalog.date_trunc(
      'month', target_period_start, 'UTC'
    )
    or target_period_start > target_at then
    raise exception using errcode = '22023',
      message = 'invalid managed billing usage period';
  end if;
  target_period_end := target_period_start + interval '1 month';

  select organization.id into target_organization_id
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
    and loyalty_private.is_organization_member(organization.id);
  if target_organization_id is null then
    return;
  end if;

  select * into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    target_organization_id, 'managed.billing',
    target_organization_public_id::text, target_at
  );

  select account.live_mode into target_live_mode
  from loyalty_private.managed_billing_account_versions as account
  where account.organization_id = target_organization_id
    and account.effective_from <= target_at
    and (account.effective_until is null or account.effective_until > target_at)
  order by account.effective_from desc, account.id desc
  limit 1;

  if entitlement.deployment_mode = 'managed' and entitlement.enabled
    and target_live_mode is not null
    and coalesce((
      select candidate.enabled
        and candidate.live_mode = target_live_mode
      from loyalty_private.managed_billing_provider_configuration_versions
        as candidate
      where candidate.effective_from <= target_at
      order by candidate.effective_from desc, candidate.id desc
      limit 1
    ), false)
    and (
    select pg_catalog.count(distinct current_meter.meter_key)
    from (
      select distinct on (meter.meter_key) meter.meter_key, meter.enabled
      from loyalty_private.managed_billing_usage_meter_versions as meter
      where meter.live_mode = target_live_mode
        and meter.effective_from <= target_at
      order by meter.meter_key, meter.effective_from desc,
        meter.version desc, meter.id desc
    ) as current_meter
    where current_meter.enabled
  ) = 4 then
    target_dispatch_mode := 'configured';
  end if;

  usage_summary := pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'organizationId', target_organization_public_id,
    'periodStart', target_period_start,
    'periodEnd', target_period_end,
    'measuredAt', target_at,
    'dispatchMode', target_dispatch_mode,
    'meters', (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'meterKey', catalogue.meter_key,
        'label', catalogue.label,
        'quantity', coalesce(summary.quantity, 0)::text,
        'dispatchedQuantity', coalesce(summary.dispatched_quantity, 0)::text,
        'factCount', coalesce(summary.fact_count, 0)::text,
        'pendingCount', coalesce(summary.pending_count, 0)::text,
        'attentionCount', coalesce(summary.attention_count, 0)::text
      ) order by catalogue.ordinal)
      from (values
        (1, 'orders'::text, 'Orders ingested'::text),
        (2, 'active_members'::text, 'Active members'::text),
        (3, 'messages'::text, 'Messages delivered'::text),
        (4, 'api_requests'::text, 'Accepted API commands'::text)
      ) as catalogue(ordinal, meter_key, label)
      left join lateral (
        select pg_catalog.sum(fact.quantity) as quantity,
          pg_catalog.sum(fact.quantity) filter (
            where dispatch.state = 'accepted'
          ) as dispatched_quantity,
          pg_catalog.count(*)::bigint as fact_count,
          pg_catalog.count(*) filter (
            where dispatch.id is null
              or dispatch.state in ('pending', 'processing', 'retryable', 'held')
          )::bigint as pending_count,
          pg_catalog.count(*) filter (
            where dispatch.state in ('ambiguous', 'rejected')
          )::bigint as attention_count
        from loyalty_private.managed_billing_usage_facts as fact
        left join loyalty_private.managed_billing_usage_dispatches as dispatch
          on dispatch.organization_id = fact.organization_id
         and dispatch.usage_fact_id = fact.id
        where fact.organization_id = target_organization_id
          and fact.meter_key = catalogue.meter_key
          and fact.usage_period_start = target_period_start
      ) as summary on true
    )
  );
  return next;
end;
$$;

alter function loyalty_private.record_managed_billing_usage_meter_v1(
  text, integer, text, boolean, boolean, timestamptz, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.capture_managed_billing_usage_facts_v1(
  integer, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.record_managed_billing_usage_correction_v1(
  uuid, bigint, text, text, timestamptz, uuid
) owner to loyalty_owner;
alter function loyalty_private.claim_managed_billing_usage_dispatches_v1(
  text, integer, integer, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.authorize_managed_billing_usage_dispatch_v1(
  uuid, uuid, text, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.finish_managed_billing_usage_dispatch_v1(
  uuid, uuid, text, text, text, integer, text, timestamptz
) owner to loyalty_owner;
alter function loyalty.get_my_managed_billing_usage_summary_v1(
  uuid, timestamptz, timestamptz
) owner to loyalty_owner;

alter table loyalty_private.managed_billing_usage_meter_versions
  enable row level security;
alter table loyalty_private.managed_billing_usage_facts enable row level security;
alter table loyalty_private.managed_billing_usage_dispatches
  enable row level security;
alter table loyalty_private.managed_billing_usage_dispatch_attempts
  enable row level security;

revoke all on loyalty_private.managed_billing_usage_meter_versions,
  loyalty_private.managed_billing_usage_facts,
  loyalty_private.managed_billing_usage_dispatches,
  loyalty_private.managed_billing_usage_dispatch_attempts
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function loyalty_private.protect_managed_billing_usage_dispatch(),
  loyalty_private.record_managed_billing_usage_meter_v1(
    text, integer, text, boolean, boolean, timestamptz, text, text, uuid
  ),
  loyalty_private.capture_managed_billing_usage_facts_v1(
    integer, timestamptz
  ),
  loyalty_private.record_managed_billing_usage_correction_v1(
    uuid, bigint, text, text, timestamptz, uuid
  ),
  loyalty_private.claim_managed_billing_usage_dispatches_v1(
    text, integer, integer, timestamptz
  ),
  loyalty_private.authorize_managed_billing_usage_dispatch_v1(
    uuid, uuid, text, timestamptz
  ),
  loyalty_private.finish_managed_billing_usage_dispatch_v1(
    uuid, uuid, text, text, text, integer, text, timestamptz
  )
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function loyalty.get_my_managed_billing_usage_summary_v1(
  uuid, timestamptz, timestamptz
) from public, anon, loyalty_runtime, loyalty_worker;

grant execute on function loyalty_private.capture_managed_billing_usage_facts_v1(
  integer, timestamptz
), loyalty_private.claim_managed_billing_usage_dispatches_v1(
  text, integer, integer, timestamptz
), loyalty_private.authorize_managed_billing_usage_dispatch_v1(
  uuid, uuid, text, timestamptz
), loyalty_private.finish_managed_billing_usage_dispatch_v1(
  uuid, uuid, text, text, text, integer, text, timestamptz
) to loyalty_worker;

grant execute on function loyalty.get_my_managed_billing_usage_summary_v1(
  uuid, timestamptz, timestamptz
) to authenticated;

comment on table loyalty_private.managed_billing_usage_meter_versions is
  'Append-only external meter-event configuration without prices or tenant authority.';
comment on table loyalty_private.managed_billing_usage_facts is
  'Immutable bigint-safe usage facts and compensating corrections derived from reviewed product evidence.';
comment on table loyalty_private.managed_billing_usage_dispatches is
  'Recoverable provider queue with one permanent local identifier per immutable usage fact.';
comment on table loyalty_private.managed_billing_usage_dispatch_attempts is
  'Immutable minimized provider attempt evidence without bodies, secrets, contact, or payment data.';
comment on function loyalty_private.capture_managed_billing_usage_facts_v1(
  integer, timestamptz
) is
  'Captures reviewed managed-only source identities; returns before source scans in self-hosted mode.';
comment on function loyalty_private.authorize_managed_billing_usage_dispatch_v1(
  uuid, uuid, text, timestamptz
) is
  'Rechecks deployment, entitlement, provider, account, meter, time window, and lease before returning provider payload.';
comment on function loyalty.get_my_managed_billing_usage_summary_v1(
  uuid, timestamptz, timestamptz
) is
  'Returns a live-member-scoped minimized UTC usage and dispatch-health summary.';
