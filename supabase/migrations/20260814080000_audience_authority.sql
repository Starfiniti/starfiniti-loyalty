-- M07 allowlisted audience authority. Definitions are immutable versions;
-- membership snapshots are database-timed, tenant-derived, and private.

create table loyalty.audiences (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  code text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  unique (organization_id, programme_group_id, code),
  foreign key (organization_id, programme_group_id)
    references loyalty.programme_groups(organization_id, id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_-]{0,79}$')
);

create table loyalty.audience_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  audience_id bigint not null,
  version_number integer not null check (version_number > 0),
  status text not null check (status in ('draft', 'published', 'superseded')),
  definition jsonb not null,
  definition_sha256 bytea not null check (octet_length(definition_sha256) = 32),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  unique (organization_id, audience_id, version_number),
  foreign key (organization_id, programme_group_id, audience_id)
    references loyalty.audiences(organization_id, programme_group_id, id)
    on delete restrict,
  check (
    (status = 'draft' and published_at is null and approved_by_user_id is null)
    or (status in ('published', 'superseded')
      and published_at is not null and approved_by_user_id is not null)
  )
);

create unique index audience_versions_one_published_uidx
  on loyalty.audience_versions (organization_id, audience_id)
  where status = 'published';
create index audience_versions_history_idx
  on loyalty.audience_versions (
    organization_id, programme_group_id, audience_id, version_number desc
  );

create table loyalty.audience_snapshots (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  audience_version_id bigint not null,
  state text not null check (state in ('building', 'complete')),
  snapshot_at timestamptz not null,
  member_count bigint not null default 0 check (member_count >= 0),
  definition_sha256 bytea not null check (octet_length(definition_sha256) = 32),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_group_id, id),
  foreign key (organization_id, programme_group_id, audience_version_id)
    references loyalty.audience_versions(organization_id, programme_group_id, id)
    on delete restrict,
  check (
    (state = 'building' and completed_at is null and member_count = 0)
    or (state = 'complete' and completed_at is not null)
  )
);

create index audience_snapshots_version_history_idx
  on loyalty.audience_snapshots (
    organization_id, audience_version_id, snapshot_at desc, id desc
  );

create table loyalty_private.audience_snapshot_members (
  id bigint generated always as identity primary key,
  organization_id bigint not null,
  programme_group_id bigint not null,
  audience_snapshot_id bigint not null,
  customer_id bigint not null,
  wallet_id bigint not null,
  evaluation jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, audience_snapshot_id, customer_id),
  unique (organization_id, audience_snapshot_id, wallet_id),
  foreign key (organization_id, programme_group_id, audience_snapshot_id)
    references loyalty.audience_snapshots(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id)
    on delete restrict,
  check (jsonb_typeof(evaluation) = 'object')
);

create index audience_snapshot_members_customer_idx
  on loyalty_private.audience_snapshot_members (
    organization_id, programme_group_id, customer_id, audience_snapshot_id
  );

alter table loyalty.audiences owner to loyalty_owner;
alter table loyalty.audience_versions owner to loyalty_owner;
alter table loyalty.audience_snapshots owner to loyalty_owner;
alter table loyalty_private.audience_snapshot_members owner to loyalty_owner;

create trigger audiences_immutable
before update or delete on loyalty.audiences
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.protect_audience_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'audience versions are immutable';
  end if;
  if new.id <> old.id
    or new.public_id <> old.public_id
    or new.organization_id <> old.organization_id
    or new.programme_group_id <> old.programme_group_id
    or new.audience_id <> old.audience_id
    or new.version_number <> old.version_number
    or new.definition <> old.definition
    or new.definition_sha256 <> old.definition_sha256
    or new.created_by_user_id <> old.created_by_user_id
    or new.created_at <> old.created_at then
    raise exception using errcode = '55000',
      message = 'audience definition history is immutable';
  end if;
  if old.status = 'draft' and new.status = 'published'
    and old.published_at is null and new.published_at is not null
    and old.approved_by_user_id is null and new.approved_by_user_id is not null then
    return new;
  end if;
  if old.status = 'published' and new.status = 'superseded'
    and new.published_at = old.published_at
    and new.approved_by_user_id = old.approved_by_user_id then
    return new;
  end if;
  raise exception using errcode = '55000',
    message = 'invalid audience version transition';
end;
$$;

create trigger audience_versions_protect_history
before update or delete on loyalty.audience_versions
for each row execute function loyalty_private.protect_audience_version();

create or replace function loyalty_private.protect_audience_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'audience snapshots are immutable';
  end if;
  if old.state = 'building' and new.state = 'complete'
    and old.completed_at is null and new.completed_at is not null
    and new.completed_at >= old.snapshot_at
    and new.id = old.id
    and new.public_id = old.public_id
    and new.organization_id = old.organization_id
    and new.programme_group_id = old.programme_group_id
    and new.audience_version_id = old.audience_version_id
    and new.snapshot_at = old.snapshot_at
    and new.definition_sha256 = old.definition_sha256
    and new.created_by_user_id = old.created_by_user_id
    and new.created_at = old.created_at then
    return new;
  end if;
  raise exception using errcode = '55000',
    message = 'audience snapshots are immutable after completion';
end;
$$;

create trigger audience_snapshots_protect_history
before update or delete on loyalty.audience_snapshots
for each row execute function loyalty_private.protect_audience_snapshot();

create trigger audience_snapshot_members_immutable
before update or delete on loyalty_private.audience_snapshot_members
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.validate_audience_definition_v1(
  target_definition jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  condition_value jsonb;
  window_value jsonb;
  metric_name text;
  operator_name text;
  minimum_value text;
  maximum_value text;
  window_required boolean;
begin
  if target_definition is null
    or pg_column_size(target_definition) > 65536
    or jsonb_typeof(target_definition) <> 'object'
    or not (target_definition ?& array[
      'schemaVersion', 'code', 'name', 'description', 'match', 'conditions'
    ])
    or target_definition - array[
      'schemaVersion', 'code', 'name', 'description', 'match', 'conditions'
    ] <> '{}'::jsonb
    or jsonb_typeof(target_definition -> 'schemaVersion') <> 'string'
    or jsonb_typeof(target_definition -> 'code') <> 'string'
    or jsonb_typeof(target_definition -> 'name') <> 'string'
    or jsonb_typeof(target_definition -> 'description') <> 'string'
    or jsonb_typeof(target_definition -> 'match') <> 'string'
    or target_definition ->> 'schemaVersion' <> '1'
    or coalesce(target_definition ->> 'code', '') !~ '^[a-z][a-z0-9_-]{0,79}$'
    or length(coalesce(target_definition ->> 'name', '')) not between 1 and 120
    or target_definition ->> 'name' <> btrim(target_definition ->> 'name')
    or length(coalesce(target_definition ->> 'description', '')) > 500
    or target_definition ->> 'description' <> btrim(target_definition ->> 'description')
    or coalesce(target_definition ->> 'match', '') not in ('all', 'any')
    or jsonb_typeof(target_definition -> 'conditions') <> 'array'
    or jsonb_array_length(target_definition -> 'conditions') not between 1 and 20 then
    raise exception using errcode = '22023',
      message = 'invalid AudienceDefinitionV1';
  end if;

  for condition_value in
    select value from jsonb_array_elements(target_definition -> 'conditions')
  loop
    if jsonb_typeof(condition_value) <> 'object' then
      raise exception using errcode = '22023',
        message = 'invalid audience condition';
    end if;
    if condition_value ->> 'kind' = 'tier' then
      if not (condition_value ?& array['kind', 'operator', 'tierCodes'])
        or condition_value - array['kind', 'operator', 'tierCodes'] <> '{}'::jsonb
        or coalesce(condition_value ->> 'operator', '') not in ('in', 'not_in')
        or not loyalty_private.is_reward_code_array(
          condition_value -> 'tierCodes'
        )
        or jsonb_array_length(condition_value -> 'tierCodes') not between 1 and 15
        or (
          select count(*) <> count(distinct code)
          from jsonb_array_elements_text(
            condition_value -> 'tierCodes'
          ) as tier(code)
        ) then
        raise exception using errcode = '22023',
          message = 'invalid audience tier condition';
      end if;
      continue;
    end if;

    if condition_value ->> 'kind' <> 'metric'
      or not (condition_value ?& array[
        'kind', 'metric', 'operator', 'minimum', 'maximum', 'window',
        'activityCodes'
      ])
      or condition_value - array[
        'kind', 'metric', 'operator', 'minimum', 'maximum', 'window',
        'activityCodes'
      ] <> '{}'::jsonb then
      raise exception using errcode = '22023',
        message = 'invalid audience condition';
    end if;

    metric_name := condition_value ->> 'metric';
    operator_name := condition_value ->> 'operator';
    minimum_value := condition_value ->> 'minimum';
    maximum_value := condition_value ->> 'maximum';
    window_value := condition_value -> 'window';
    window_required := metric_name in (
      'eligible_spend', 'earned_points', 'order_count', 'referral_count',
      'verified_action_count'
    );
    if metric_name not in (
      'available_points', 'pending_points', 'eligible_spend', 'earned_points',
      'order_count', 'referral_count', 'verified_action_count',
      'customer_age_days', 'days_since_last_paid_order'
    )
      or operator_name not in ('at_least', 'at_most', 'between')
      or jsonb_typeof(condition_value -> 'minimum') <> 'string'
      or jsonb_typeof(condition_value -> 'maximum')
        not in ('string', 'null')
      or not loyalty_private.is_bounded_bigint_text(minimum_value, true)
      or (operator_name = 'between') <> (maximum_value is not null)
      or (maximum_value is not null and (
        not loyalty_private.is_bounded_bigint_text(maximum_value, true)
        or maximum_value::numeric < minimum_value::numeric
      ))
      or not loyalty_private.is_reward_code_array(
        condition_value -> 'activityCodes'
      )
      or (
        select count(*) <> count(distinct code)
        from jsonb_array_elements_text(
          condition_value -> 'activityCodes'
        ) as activity(code)
      )
      or (metric_name <> 'verified_action_count'
        and jsonb_array_length(condition_value -> 'activityCodes') > 0)
      or window_required <> (window_value <> 'null'::jsonb) then
      raise exception using errcode = '22023',
        message = 'invalid audience metric condition';
    end if;
    if window_required then
      if jsonb_typeof(window_value) <> 'object'
        or window_value ->> 'kind' not in ('lifetime', 'rolling_days')
        or (
          window_value ->> 'kind' = 'lifetime'
          and window_value <> '{"kind":"lifetime"}'::jsonb
        )
        or (
          window_value ->> 'kind' = 'rolling_days'
          and (
            not (window_value ?& array['kind', 'days'])
            or window_value - array['kind', 'days'] <> '{}'::jsonb
            or jsonb_typeof(window_value -> 'days') <> 'number'
            or coalesce(window_value ->> 'days', '') !~ '^[1-9][0-9]{0,3}$'
            or (window_value ->> 'days')::integer > 3650
          )
        ) then
        raise exception using errcode = '22023',
          message = 'invalid audience metric window';
      end if;
    end if;
  end loop;
end;
$$;

create or replace function loyalty_private.enforce_audience_version_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_audience loyalty.audiences%rowtype;
  entitlement_enabled boolean;
begin
  select audience.* into strict target_audience
  from loyalty.audiences as audience
  where audience.organization_id = new.organization_id
    and audience.programme_group_id = new.programme_group_id
    and audience.id = new.audience_id;
  perform loyalty_private.validate_audience_definition_v1(new.definition);
  if new.definition_sha256 <> extensions.digest(
    convert_to(new.definition::text, 'UTF8'), 'sha256'
  ) then
    raise exception using errcode = '23514',
      message = 'audience definition hash mismatch';
  end if;
  if new.status <> 'draft'
    or new.definition ->> 'code' <> target_audience.code then
    raise exception using errcode = '23514',
      message = 'audience version does not match its stable identity';
  end if;
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    new.organization_id, 'campaigns',
    'audience:' || target_audience.public_id::text, now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'campaigns are not enabled for this organization';
  end if;
  return new;
end;
$$;

create trigger audience_versions_contract
before insert on loyalty.audience_versions
for each row execute function loyalty_private.enforce_audience_version_contract();

create or replace function loyalty_private.calculate_audience_metric_v1(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_customer_id bigint,
  target_wallet_id bigint,
  target_metric text,
  target_window jsonb,
  target_activity_codes text[],
  target_snapshot_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  metric_value bigint;
  window_starts_at timestamptz;
  last_paid_at timestamptz;
begin
  if not exists (
    select 1
    from loyalty.wallets as wallet
    join loyalty.customers as customer
      on customer.organization_id = wallet.organization_id
     and customer.id = wallet.customer_id
    where wallet.organization_id = target_organization_id
      and wallet.programme_group_id = target_programme_group_id
      and wallet.id = target_wallet_id
      and wallet.customer_id = target_customer_id
      and wallet.status = 'active'
      and customer.status = 'active'
      and wallet.created_at <= target_snapshot_at
      and customer.created_at <= target_snapshot_at
  ) then
    raise exception using errcode = '22023',
      message = 'unknown audience member context';
  end if;

  if target_metric in ('available_points', 'pending_points') then
    select coalesce(sum(balance.points) filter (
      where balance.account_kind = case target_metric
        when 'available_points' then 'available' else 'pending' end
    ), 0)::bigint into metric_value
    from loyalty.wallet_balances as balance
    where balance.organization_id = target_organization_id
      and balance.programme_group_id = target_programme_group_id
      and balance.wallet_id = target_wallet_id;
    return metric_value;
  end if;

  if target_metric = 'customer_age_days' then
    select floor(extract(epoch from (
      target_snapshot_at - customer.created_at
    )) / 86400)::bigint into strict metric_value
    from loyalty.customers as customer
    where customer.organization_id = target_organization_id
      and customer.id = target_customer_id;
    return metric_value;
  end if;

  if target_metric = 'days_since_last_paid_order' then
    select max(purchase.effective_at) into last_paid_at
    from loyalty_private.tier_qualification_facts as purchase
    where purchase.organization_id = target_organization_id
      and purchase.programme_group_id = target_programme_group_id
      and purchase.customer_id = target_customer_id
      and purchase.fact_kind = 'purchase'
      and purchase.effective_at <= target_snapshot_at
      and purchase.recorded_at <= target_snapshot_at
      and purchase.order_count_delta + coalesce((
        select sum(refund.order_count_delta)
        from loyalty_private.tier_qualification_facts as refund
        where refund.organization_id = purchase.organization_id
          and refund.origin_fact_id = purchase.id
          and refund.recorded_at <= target_snapshot_at
      ), 0) > 0;
    if last_paid_at is null then
      return null;
    end if;
    return floor(extract(epoch from (
      target_snapshot_at - last_paid_at
    )) / 86400)::bigint;
  end if;

  if target_metric not in (
    'eligible_spend', 'earned_points', 'order_count', 'referral_count',
    'verified_action_count'
  ) or jsonb_typeof(target_window) <> 'object' then
    raise exception using errcode = '22023',
      message = 'invalid audience metric request';
  end if;
  window_starts_at := case target_window ->> 'kind'
    when 'rolling_days' then target_snapshot_at - make_interval(
      days => (target_window ->> 'days')::integer
    )
    else null
  end;

  select coalesce(sum(case target_metric
    when 'eligible_spend' then fact.eligible_spend_minor_delta
    when 'earned_points' then fact.earned_points_delta
    when 'order_count' then fact.order_count_delta
    when 'referral_count' then fact.referral_count_delta
    else fact.verified_action_count_delta
  end), 0)::bigint into metric_value
  from loyalty_private.tier_qualification_facts as fact
  where fact.organization_id = target_organization_id
    and fact.programme_group_id = target_programme_group_id
    and fact.customer_id = target_customer_id
    and fact.effective_at <= target_snapshot_at
    and fact.recorded_at <= target_snapshot_at
    and (window_starts_at is null or fact.effective_at >= window_starts_at)
    and (
      target_metric <> 'verified_action_count'
      or cardinality(target_activity_codes) = 0
      or fact.activity_code = any(target_activity_codes)
    );
  if metric_value < 0 then
    raise exception using errcode = '23514',
      message = 'canonical facts produce a negative audience metric';
  end if;
  return metric_value;
end;
$$;

create or replace function loyalty_private.evaluate_audience_member_v1(
  target_definition jsonb,
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_customer_id bigint,
  target_wallet_id bigint,
  target_snapshot_at timestamptz
)
returns table (included boolean, evaluation jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  condition_value jsonb;
  condition_index integer := 0;
  condition_match boolean;
  match_count integer := 0;
  metric_observed bigint;
  activity_codes text[];
  current_tier_code text;
  customer_public_id uuid;
  results jsonb := '[]'::jsonb;
begin
  perform loyalty_private.validate_audience_definition_v1(target_definition);
  select customer.public_id into strict customer_public_id
  from loyalty.customers as customer
  where customer.organization_id = target_organization_id
    and customer.id = target_customer_id;
  select membership.tier_code into current_tier_code
  from loyalty.tier_memberships as membership
  where membership.organization_id = target_organization_id
    and membership.wallet_id = target_wallet_id
    and membership.effective_from <= target_snapshot_at
    and (
      membership.effective_until is null
      or membership.effective_until > target_snapshot_at
    )
  order by membership.effective_from desc, membership.id desc
  limit 1;

  for condition_value in
    select value from jsonb_array_elements(target_definition -> 'conditions')
  loop
    metric_observed := null;
    if condition_value ->> 'kind' = 'tier' then
      condition_match := exists (
        select 1
        from jsonb_array_elements_text(
          condition_value -> 'tierCodes'
        ) as selected(code)
        where selected.code = current_tier_code
      );
      if condition_value ->> 'operator' = 'not_in' then
        condition_match := not condition_match;
      end if;
    else
      select coalesce(array_agg(activity.code order by activity.code), array[]::text[])
      into activity_codes
      from jsonb_array_elements_text(
        condition_value -> 'activityCodes'
      ) as activity(code);
      metric_observed := loyalty_private.calculate_audience_metric_v1(
        target_organization_id, target_programme_group_id,
        target_customer_id, target_wallet_id,
        condition_value ->> 'metric', condition_value -> 'window',
        activity_codes, target_snapshot_at
      );
      condition_match := metric_observed is not null and case
        when condition_value ->> 'operator' = 'at_least'
          then metric_observed >= (condition_value ->> 'minimum')::bigint
        when condition_value ->> 'operator' = 'at_most'
          then metric_observed <= (condition_value ->> 'minimum')::bigint
        else metric_observed between
          (condition_value ->> 'minimum')::bigint
          and (condition_value ->> 'maximum')::bigint
      end;
    end if;
    if condition_match then
      match_count := match_count + 1;
    end if;
    results := results || jsonb_build_array(jsonb_build_object(
      'conditionIndex', condition_index,
      'matched', condition_match,
      'observedValue', case when metric_observed is null
        then null else metric_observed::text end
    ));
    condition_index := condition_index + 1;
  end loop;

  included := case target_definition ->> 'match'
    when 'all' then match_count = condition_index
    else match_count > 0
  end;
  evaluation := jsonb_build_object(
    'schemaVersion', '1',
    'audienceCode', target_definition ->> 'code',
    'subjectReference', 'customer:' || customer_public_id::text,
    'evaluatedAt', target_snapshot_at,
    'included', included,
    'results', results
  );
  return next;
end;
$$;

create or replace function loyalty.create_audience_draft_command(
  target_programme_public_id uuid,
  target_definition jsonb,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  resource_public_id uuid,
  outcome text,
  definition_sha256 text,
  version_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_programme loyalty.programmes%rowtype;
  target_audience loyalty.audiences%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  entitlement_enabled boolean;
  request_hash bytea;
  definition_hash bytea;
  created_public_id uuid;
  created_version_number integer;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501',
      message = 'audience command not authorized';
  end if;
  perform loyalty_private.validate_audience_definition_v1(target_definition);
  if pg_column_size(target_definition) > 65536
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid audience command identity';
  end if;

  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and programme.status in ('draft', 'active')
    and loyalty_private.has_organization_role(
      programme.organization_id, array['owner', 'admin']::text[]
    )
  for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'audience command not authorized';
  end if;
  definition_hash := extensions.digest(
    convert_to(target_definition::text, 'UTF8'), 'sha256'
  );
  request_hash := extensions.digest(convert_to(
    'audience.draft.create|' || target_programme.public_id::text || '|' ||
    encode(definition_hash, 'hex'), 'UTF8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_programme.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'audience.draft.create'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'audience command idempotency conflict';
    end if;
    return query
    select version.public_id, 'duplicate'::text,
      encode(version.definition_sha256, 'hex'), version.version_number
    from loyalty.audience_versions as version
    where version.organization_id = target_programme.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;

  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_programme.organization_id, 'campaigns',
    'programme:' || target_programme.public_id::text, now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'campaigns are not enabled for this organization';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'audience|' || target_programme.organization_id::text || '|' ||
    target_programme.programme_group_id::text || '|' ||
    (target_definition ->> 'code'), 0
  ));
  select audience.* into target_audience
  from loyalty.audiences as audience
  where audience.organization_id = target_programme.organization_id
    and audience.programme_group_id = target_programme.programme_group_id
    and audience.code = target_definition ->> 'code';
  if not found then
    insert into loyalty.audiences (
      organization_id, programme_group_id, code, created_by_user_id
    ) values (
      target_programme.organization_id, target_programme.programme_group_id,
      target_definition ->> 'code', actor_user_id
    ) returning * into strict target_audience;
  end if;
  select coalesce(max(version.version_number), 0) + 1
  into created_version_number
  from loyalty.audience_versions as version
  where version.organization_id = target_audience.organization_id
    and version.audience_id = target_audience.id;
  insert into loyalty.audience_versions (
    organization_id, programme_group_id, audience_id, version_number,
    status, definition, definition_sha256, created_by_user_id
  ) values (
    target_audience.organization_id, target_audience.programme_group_id,
    target_audience.id, created_version_number, 'draft', target_definition,
    definition_hash, actor_user_id
  ) returning public_id into created_public_id;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_audience.organization_id, actor_user_id,
    'audience.draft.create', 'audience_version', created_public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'programmePublicId', target_programme.public_id,
      'audienceCode', target_audience.code,
      'versionNumber', created_version_number,
      'definitionSha256', encode(definition_hash, 'hex')
    )
  );
  return query select created_public_id, 'created'::text,
    encode(definition_hash, 'hex'), created_version_number;
end;
$$;

create or replace function loyalty.publish_audience_version_command(
  target_version_public_id uuid,
  target_expected_definition_sha256 text,
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
  target_version loyalty.audience_versions%rowtype;
  target_audience loyalty.audiences%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  entitlement_enabled boolean;
  request_hash bytea;
  publication_time timestamptz;
begin
  if actor_user_id is null
    or target_expected_definition_sha256 is null
    or target_expected_definition_sha256 !~ '^[a-f0-9]{64}$'
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid audience publication identity';
  end if;
  select audience.* into target_audience
  from loyalty.audiences as audience
  join loyalty.audience_versions as version
    on version.organization_id = audience.organization_id
   and version.audience_id = audience.id
  where version.public_id = target_version_public_id
    and loyalty_private.has_organization_role(
      audience.organization_id, array['owner', 'admin']::text[]
    )
  for update of audience;
  if not found then
    raise exception using errcode = '42501',
      message = 'audience command not authorized';
  end if;
  select version.* into strict target_version
  from loyalty.audience_versions as version
  where version.organization_id = target_audience.organization_id
    and version.public_id = target_version_public_id;

  request_hash := extensions.digest(convert_to(
    'audience.version.publish|' || target_version.public_id::text || '|' ||
    target_expected_definition_sha256, 'UTF8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_version.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'audience.version.publish'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'audience command idempotency conflict';
    end if;
    return query
    select version.public_id, 'duplicate'::text, version.published_at
    from loyalty.audience_versions as version
    where version.organization_id = target_version.organization_id
      and version.public_id = existing_audit.resource_public_id;
    return;
  end if;

  if target_version.status <> 'draft'
    or encode(target_version.definition_sha256, 'hex')
      <> target_expected_definition_sha256 then
    raise exception using errcode = '23514',
      message = 'audience publication precondition failed';
  end if;
  perform loyalty_private.validate_audience_definition_v1(
    target_version.definition
  );
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_version.organization_id, 'campaigns',
    'audience:' || target_audience.public_id::text, now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'campaigns are not enabled for this organization';
  end if;

  publication_time := clock_timestamp();
  update loyalty.audience_versions as version
  set status = 'superseded'
  where version.organization_id = target_version.organization_id
    and version.audience_id = target_version.audience_id
    and version.status = 'published';
  update loyalty.audience_versions as version
  set status = 'published', approved_by_user_id = actor_user_id,
    published_at = publication_time
  where version.organization_id = target_version.organization_id
    and version.id = target_version.id;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_version.organization_id, actor_user_id,
    'audience.version.publish', 'audience_version', target_version.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'audiencePublicId', target_audience.public_id,
      'audienceCode', target_audience.code,
      'versionNumber', target_version.version_number,
      'definitionSha256', target_expected_definition_sha256
    )
  );
  return query select target_version.public_id, 'created'::text,
    publication_time;
end;
$$;

create or replace function loyalty.create_audience_snapshot_command(
  target_version_public_id uuid,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  resource_public_id uuid,
  outcome text,
  snapshot_at timestamptz,
  member_count text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_version loyalty.audience_versions%rowtype;
  target_audience loyalty.audiences%rowtype;
  target_snapshot loyalty.audience_snapshots%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  entitlement_enabled boolean;
  request_hash bytea;
  snapshot_time timestamptz;
  candidate_count bigint;
  processed_count bigint := 0;
  included_count bigint := 0;
  candidate record;
  member_decision record;
begin
  if actor_user_id is null
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid audience snapshot identity';
  end if;
  select audience.* into target_audience
  from loyalty.audiences as audience
  join loyalty.audience_versions as version
    on version.organization_id = audience.organization_id
   and version.audience_id = audience.id
  where version.public_id = target_version_public_id
    and loyalty_private.has_organization_role(
      audience.organization_id, array['owner', 'admin', 'operator']::text[]
    )
  for update of audience;
  if not found then
    raise exception using errcode = '42501',
      message = 'audience command not authorized';
  end if;
  select version.* into strict target_version
  from loyalty.audience_versions as version
  where version.organization_id = target_audience.organization_id
    and version.public_id = target_version_public_id;
  request_hash := extensions.digest(convert_to(
    'audience.snapshot.create|' || target_version.public_id::text,
    'UTF8'
  ), 'sha256');
  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_version.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'audience.snapshot.create'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'audience command idempotency conflict';
    end if;
    return query
    select snapshot.public_id, 'duplicate'::text, snapshot.snapshot_at,
      snapshot.member_count::text
    from loyalty.audience_snapshots as snapshot
    where snapshot.organization_id = target_version.organization_id
      and snapshot.public_id = existing_audit.resource_public_id;
    return;
  end if;

  if target_version.status <> 'published' then
    raise exception using errcode = '23514',
      message = 'only the published audience can be snapshotted';
  end if;
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    target_version.organization_id, 'campaigns',
    'audience:' || target_audience.public_id::text, now()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'campaigns are not enabled for this organization';
  end if;

  snapshot_time := clock_timestamp();
  select count(*)::bigint into candidate_count
  from loyalty.wallets as wallet
  join loyalty.customers as customer
    on customer.organization_id = wallet.organization_id
   and customer.id = wallet.customer_id
  where wallet.organization_id = target_version.organization_id
    and wallet.programme_group_id = target_version.programme_group_id
    and wallet.status = 'active'
    and customer.status = 'active'
    and wallet.created_at <= snapshot_time
    and customer.created_at <= snapshot_time;
  if candidate_count > 100000 then
    raise exception using errcode = '54000',
      message = 'audience snapshot exceeds the synchronous candidate limit';
  end if;
  insert into loyalty.audience_snapshots (
    organization_id, programme_group_id, audience_version_id, state,
    snapshot_at, definition_sha256, created_by_user_id
  ) values (
    target_version.organization_id, target_version.programme_group_id,
    target_version.id, 'building', snapshot_time,
    target_version.definition_sha256, actor_user_id
  ) returning * into strict target_snapshot;

  for candidate in
    select customer.id as customer_id, wallet.id as wallet_id
    from loyalty.wallets as wallet
    join loyalty.customers as customer
      on customer.organization_id = wallet.organization_id
     and customer.id = wallet.customer_id
    where wallet.organization_id = target_version.organization_id
      and wallet.programme_group_id = target_version.programme_group_id
      and wallet.status = 'active'
      and customer.status = 'active'
      and wallet.created_at <= snapshot_time
      and customer.created_at <= snapshot_time
    order by wallet.id
  loop
    processed_count := processed_count + 1;
    if processed_count > 100000 then
      raise exception using errcode = '54000',
        message = 'audience snapshot exceeds the synchronous candidate limit';
    end if;
    select evaluated.included, evaluated.evaluation
    into strict member_decision
    from loyalty_private.evaluate_audience_member_v1(
      target_version.definition, target_version.organization_id,
      target_version.programme_group_id, candidate.customer_id,
      candidate.wallet_id, snapshot_time
    ) as evaluated;
    if member_decision.included then
      insert into loyalty_private.audience_snapshot_members (
        organization_id, programme_group_id, audience_snapshot_id,
        customer_id, wallet_id, evaluation
      ) values (
        target_version.organization_id, target_version.programme_group_id,
        target_snapshot.id, candidate.customer_id, candidate.wallet_id,
        member_decision.evaluation
      );
      included_count := included_count + 1;
    end if;
  end loop;
  candidate_count := processed_count;
  update loyalty.audience_snapshots as snapshot
  set state = 'complete', member_count = included_count,
    completed_at = clock_timestamp()
  where snapshot.organization_id = target_snapshot.organization_id
    and snapshot.id = target_snapshot.id
  returning * into strict target_snapshot;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_snapshot.organization_id, actor_user_id,
    'audience.snapshot.create', 'audience_snapshot', target_snapshot.public_id,
    target_idempotency_key, request_hash, target_correlation_id,
    jsonb_build_object(
      'audiencePublicId', target_audience.public_id,
      'audienceVersionPublicId', target_version.public_id,
      'definitionSha256', encode(target_version.definition_sha256, 'hex'),
      'candidateCount', candidate_count::text,
      'memberCount', included_count::text,
      'snapshotAt', snapshot_time
    )
  );
  return query select target_snapshot.public_id, 'created'::text,
    target_snapshot.snapshot_at, target_snapshot.member_count::text;
end;
$$;

alter function loyalty_private.protect_audience_version() owner to loyalty_owner;
alter function loyalty_private.protect_audience_snapshot() owner to loyalty_owner;
alter function loyalty_private.validate_audience_definition_v1(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.enforce_audience_version_contract()
  owner to loyalty_owner;
alter function loyalty_private.calculate_audience_metric_v1(
  bigint, bigint, bigint, bigint, text, jsonb, text[], timestamptz
) owner to loyalty_owner;
alter function loyalty_private.evaluate_audience_member_v1(
  jsonb, bigint, bigint, bigint, bigint, timestamptz
) owner to loyalty_owner;
alter function loyalty.create_audience_draft_command(uuid, jsonb, text, uuid)
  owner to loyalty_owner;
alter function loyalty.publish_audience_version_command(uuid, text, text, uuid)
  owner to loyalty_owner;
alter function loyalty.create_audience_snapshot_command(uuid, text, uuid)
  owner to loyalty_owner;

alter table loyalty.audiences enable row level security;
alter table loyalty.audience_versions enable row level security;
alter table loyalty.audience_snapshots enable row level security;
alter table loyalty_private.audience_snapshot_members enable row level security;

create policy audiences_member_select on loyalty.audiences
  for select to authenticated using (
    (select loyalty_private.is_organization_member(organization_id))
  );
create policy audience_versions_member_select on loyalty.audience_versions
  for select to authenticated using (
    (select loyalty_private.is_organization_member(organization_id))
  );
create policy audience_snapshots_member_select on loyalty.audience_snapshots
  for select to authenticated using (
    (select loyalty_private.is_organization_member(organization_id))
  );

revoke all on loyalty.audiences, loyalty.audience_versions,
  loyalty.audience_snapshots, loyalty_private.audience_snapshot_members
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant select on loyalty.audiences, loyalty.audience_versions,
  loyalty.audience_snapshots to authenticated;

revoke all on function
  loyalty_private.protect_audience_version(),
  loyalty_private.protect_audience_snapshot(),
  loyalty_private.validate_audience_definition_v1(jsonb),
  loyalty_private.enforce_audience_version_contract(),
  loyalty_private.calculate_audience_metric_v1(
    bigint, bigint, bigint, bigint, text, jsonb, text[], timestamptz
  ),
  loyalty_private.evaluate_audience_member_v1(
    jsonb, bigint, bigint, bigint, bigint, timestamptz
  ),
  loyalty.create_audience_draft_command(uuid, jsonb, text, uuid),
  loyalty.publish_audience_version_command(uuid, text, text, uuid),
  loyalty.create_audience_snapshot_command(uuid, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty.create_audience_draft_command(uuid, jsonb, text, uuid),
  loyalty.publish_audience_version_command(uuid, text, text, uuid),
  loyalty.create_audience_snapshot_command(uuid, text, uuid)
  to authenticated;

comment on table loyalty.audiences is
  'Stable tenant-scoped audience identities; definitions live in immutable versions.';
comment on table loyalty.audience_versions is
  'Strict allowlisted audience definitions with one current published version.';
comment on table loyalty.audience_snapshots is
  'Database-timed immutable aggregate evidence for one published audience version.';
comment on table loyalty_private.audience_snapshot_members is
  'Private included-customer keys and exact condition evidence for campaign authority.';
comment on function loyalty.create_audience_snapshot_command(uuid, text, uuid) is
  'Builds one bounded database-timed audience snapshot without caller-supplied member or time authority.';
