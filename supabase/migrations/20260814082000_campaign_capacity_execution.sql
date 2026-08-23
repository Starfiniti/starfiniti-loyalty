-- M07 atomic campaign capacity and purchase execution. Accepted campaign
-- definitions remain immutable; mutable counters are transactionally
-- reconciled to private effect/allocation evidence before any value moves.

create table loyalty_private.campaign_capacity_counters (
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_version_id bigint not null,
  reserved_effects bigint not null default 0 check (reserved_effects >= 0),
  committed_effects bigint not null default 0 check (committed_effects >= 0),
  reserved_points bigint not null default 0 check (reserved_points >= 0),
  committed_points bigint not null default 0 check (committed_points >= 0),
  reserved_liability_minor bigint not null default 0
    check (reserved_liability_minor >= 0),
  committed_liability_minor bigint not null default 0
    check (committed_liability_minor >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, campaign_version_id),
  foreign key (organization_id, programme_group_id, campaign_version_id)
    references loyalty.campaign_versions(organization_id, programme_group_id, id)
    on delete restrict
);

create table loyalty_private.campaign_execution_batches (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  programme_evaluation_id bigint not null,
  programme_transaction_id bigint,
  canonical_event_id bigint not null,
  customer_id bigint not null,
  wallet_id bigint not null,
  operation_key text not null,
  input_sha256 bytea not null check (octet_length(input_sha256) = 32),
  result_sha256 bytea not null check (octet_length(result_sha256) = 32),
  campaign_context jsonb not null,
  baseline_result jsonb not null,
  campaign_evaluation jsonb not null,
  occurred_at timestamptz not null,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, operation_key),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, programme_evaluation_id)
    references loyalty_private.programme_evaluations(organization_id, id)
    on delete restrict,
  foreign key (organization_id, programme_transaction_id)
    references loyalty.ledger_transactions(organization_id, id)
    on delete restrict,
  foreign key (organization_id, canonical_event_id)
    references loyalty_private.canonical_commerce_events(organization_id, id)
    on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id)
    on delete restrict,
  check (length(operation_key) between 1 and 255),
  check (evaluated_at >= occurred_at)
);

create table loyalty_private.campaign_effects (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_version_id bigint not null,
  execution_batch_id bigint not null,
  customer_id bigint not null,
  wallet_id bigint not null,
  assignment text not null check (assignment in ('treatment', 'control')),
  effect_kind text not null check (
    effect_kind in ('bonus_points', 'purchase_multiplier')
  ),
  decision_outcome text not null check (
    decision_outcome in (
      'awarded', 'control', 'capacity_exhausted', 'suppressed'
    )
  ),
  matched_rule_codes jsonb not null,
  points bigint not null check (points >= 0),
  state text not null check (state in ('recorded', 'committed', 'reversed')),
  award_transaction_id bigint,
  award_origin_entry_id bigint,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, execution_batch_id, campaign_version_id),
  foreign key (organization_id, programme_group_id, campaign_version_id)
    references loyalty.campaign_versions(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, execution_batch_id)
    references loyalty_private.campaign_execution_batches(organization_id, id)
    on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, award_transaction_id)
    references loyalty.ledger_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, award_origin_entry_id)
    references loyalty.ledger_entries(organization_id, id) on delete restrict,
  check (
    (decision_outcome = 'awarded' and points > 0 and state in ('committed', 'reversed')
      and award_transaction_id is not null and award_origin_entry_id is not null)
    or (decision_outcome <> 'awarded' and points = 0 and state = 'recorded'
      and award_transaction_id is null and award_origin_entry_id is null)
  )
);

create index campaign_effects_version_member_idx
  on loyalty_private.campaign_effects (
    organization_id, campaign_version_id, wallet_id, id
  );

create table loyalty_private.campaign_capacity_allocations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  campaign_version_id bigint not null,
  customer_id bigint not null,
  wallet_id bigint not null,
  source_reference text not null,
  idempotency_key text not null,
  request_sha256 bytea not null check (octet_length(request_sha256) = 32),
  effect_kind text not null check (effect_kind in (
    'milestone', 'win_back', 'tier', 'referral', 'limited_quantity'
  )),
  points bigint not null default 0 check (points >= 0),
  liability_minor bigint not null default 0 check (liability_minor >= 0),
  state text not null default 'reserved' check (
    state in ('reserved', 'committed', 'released')
  ),
  completion_reference text,
  occurred_at timestamptz not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, programme_group_id, campaign_version_id)
    references loyalty.campaign_versions(organization_id, programme_group_id, id)
    on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(organization_id, programme_group_id, id)
    on delete restrict,
  check (length(source_reference) between 1 and 500),
  check (length(idempotency_key) between 1 and 255),
  check ((points > 0) <> (liability_minor > 0)),
  check (
    (state = 'reserved' and completion_reference is null)
    or (state in ('committed', 'released')
      and length(completion_reference) between 1 and 500)
  ),
  check (updated_at >= created_at)
);

create index campaign_capacity_allocations_member_idx
  on loyalty_private.campaign_capacity_allocations (
    organization_id, campaign_version_id, wallet_id, state, id
  );

alter table loyalty_private.campaign_capacity_counters owner to loyalty_owner;
alter table loyalty_private.campaign_execution_batches owner to loyalty_owner;
alter table loyalty_private.campaign_effects owner to loyalty_owner;
alter table loyalty_private.campaign_capacity_allocations owner to loyalty_owner;

create trigger campaign_execution_batches_immutable
before update or delete on loyalty_private.campaign_execution_batches
for each row execute function loyalty_private.reject_immutable_change();

create trigger campaign_effects_immutable
before update or delete on loyalty_private.campaign_effects
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.campaign_open_at_v1(
  target_campaign_version_id bigint,
  target_occurred_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select version.approved_at <= target_occurred_at
      and version.starts_at <= target_occurred_at
      and version.ends_at > target_occurred_at
      and not exists (
        select 1
        from loyalty.admin_audit_events as audit
        where audit.organization_id = version.organization_id
          and audit.resource_type = 'campaign_version'
          and audit.resource_public_id = version.public_id
          and audit.action in ('campaign.version.pause', 'campaign.version.cancel')
          and (audit.metadata ->> 'changedAt')::timestamptz <= target_occurred_at
      )
    from loyalty.campaign_versions as version
    where version.id = target_campaign_version_id
      and version.status <> 'draft'
  ), false);
$$;

create or replace function loyalty_private.campaign_matching_rule_codes_v1(
  target_behavior jsonb,
  target_baseline_result jsonb
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(rule_code.value order by rule_code.value),
    array[]::text[])
  from pg_catalog.jsonb_array_elements_text(
    target_behavior -> 'earningRuleCodes'
  ) as rule_code(value)
  where exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      target_baseline_result -> 'contributions'
    ) as contribution(value)
    where contribution.value ->> 'ruleCode' = rule_code.value
      and contribution.value ->> 'uncappedNumerator' ~ '^[1-9][0-9]{0,99}$'
  );
$$;

create or replace function loyalty_private.get_purchase_campaign_context_v1(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_customer_id bigint,
  target_occurred_at timestamptz,
  target_operation_key text
)
returns table (
  campaign_version_public_id uuid,
  campaign_code text,
  assignment text,
  behavior jsonb,
  remaining_global_effects text,
  remaining_member_effects text,
  remaining_points text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_wallet_id bigint;
  candidate_version_id bigint;
  existing_batch loyalty_private.campaign_execution_batches%rowtype;
begin
  if target_occurred_at is null
    or target_operation_key is null
    or pg_catalog.length(target_operation_key) not between 1 and 255
    or target_operation_key <> pg_catalog.btrim(target_operation_key) then
    raise exception using errcode = '22023',
      message = 'invalid campaign execution context';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-operation|' || target_organization_id::text || '|' ||
      target_operation_key,
    0
  ));
  select batch.* into existing_batch
  from loyalty_private.campaign_execution_batches as batch
  where batch.organization_id = target_organization_id
    and batch.operation_key = target_operation_key;
  if found then
    if existing_batch.programme_group_id <> target_programme_group_id
      or existing_batch.customer_id <> target_customer_id then
      raise exception using errcode = '23514',
        message = 'campaign execution operation conflict';
    end if;
    return query
    select item."campaignVersionId", item."campaignCode", item.assignment,
      item.behavior, item."remainingGlobalEffects",
      item."remainingMemberEffects", item."remainingPoints"
    from pg_catalog.jsonb_to_recordset(existing_batch.campaign_context) as item(
      "schemaVersion" text,
      "campaignVersionId" uuid,
      "campaignCode" text,
      assignment text,
      behavior jsonb,
      "remainingGlobalEffects" text,
      "remainingMemberEffects" text,
      "remainingPoints" text
    )
    order by item."campaignCode", item."campaignVersionId";
    return;
  end if;
  select wallet.id into target_wallet_id
  from loyalty.wallets as wallet
  where wallet.organization_id = target_organization_id
    and wallet.programme_group_id = target_programme_group_id
    and wallet.customer_id = target_customer_id
    and wallet.status = 'active';
  if not found then
    raise exception using errcode = '22023',
      message = 'unknown campaign member context';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-member|' || target_organization_id::text || '|' ||
      target_programme_group_id::text || '|' || target_customer_id::text,
    0
  ));
  for candidate_version_id in
    select version.id
    from loyalty.campaign_versions as version
    join loyalty_private.campaign_assignments as assigned
      on assigned.organization_id = version.organization_id
     and assigned.campaign_version_id = version.id
     and assigned.wallet_id = target_wallet_id
    where version.organization_id = target_organization_id
      and version.programme_group_id = target_programme_group_id
      and version.definition #>> '{behavior,kind}' in (
        'bonus_points', 'purchase_multiplier'
      )
      and loyalty_private.campaign_open_at_v1(
        version.id, target_occurred_at
      )
    order by version.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'campaign-capacity|' || target_organization_id::text || '|' ||
        candidate_version_id::text,
      0
    ));
    insert into loyalty_private.campaign_capacity_counters (
      organization_id, programme_group_id, campaign_version_id
    ) values (
      target_organization_id, target_programme_group_id, candidate_version_id
    ) on conflict (organization_id, campaign_version_id) do nothing;
  end loop;

  return query
  select version.public_id, campaign.code, assigned.assignment,
    version.definition -> 'behavior',
    greatest(version.global_effect_limit -
      (counter.reserved_effects + counter.committed_effects), 0)::text,
    greatest(version.per_member_effect_limit::bigint - (
      (select pg_catalog.count(*)
       from loyalty_private.campaign_effects as effect
       where effect.organization_id = version.organization_id
         and effect.campaign_version_id = version.id
         and effect.wallet_id = target_wallet_id
         and effect.decision_outcome = 'awarded')
      + (select pg_catalog.count(*)
         from loyalty_private.campaign_capacity_allocations as allocation
         where allocation.organization_id = version.organization_id
           and allocation.campaign_version_id = version.id
           and allocation.wallet_id = target_wallet_id
           and allocation.state in ('reserved', 'committed'))
    ), 0)::text,
    greatest(coalesce(version.maximum_points, 0) -
      (counter.reserved_points + counter.committed_points), 0)::text
  from loyalty.campaign_versions as version
  join loyalty.campaigns as campaign
    on campaign.organization_id = version.organization_id
   and campaign.id = version.campaign_id
  join loyalty_private.campaign_assignments as assigned
    on assigned.organization_id = version.organization_id
   and assigned.campaign_version_id = version.id
   and assigned.wallet_id = target_wallet_id
  join loyalty_private.campaign_capacity_counters as counter
    on counter.organization_id = version.organization_id
   and counter.campaign_version_id = version.id
  where version.organization_id = target_organization_id
    and version.programme_group_id = target_programme_group_id
    and version.definition #>> '{behavior,kind}' in (
      'bonus_points', 'purchase_multiplier'
    )
    and loyalty_private.campaign_open_at_v1(version.id, target_occurred_at)
  order by campaign.code, version.id;
end;
$$;

create or replace function loyalty_private.campaign_multiplier_points_v1(
  target_baseline_result jsonb,
  target_multiplier_basis_points integer
)
returns bigint
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  base_contribution jsonb;
  base_numerator numeric;
  base_denominator numeric;
  multiplied numeric;
  baseline numeric;
begin
  if target_multiplier_basis_points not between 10001 and 100000
    or pg_catalog.jsonb_typeof(target_baseline_result -> 'contributions')
      <> 'array' then
    raise exception using errcode = '22023',
      message = 'invalid campaign multiplier evidence';
  end if;
  select contribution.value into base_contribution
  from pg_catalog.jsonb_array_elements(
    target_baseline_result -> 'contributions'
  ) as contribution(value)
  where contribution.value ->> 'effectKind' = 'base_rate';
  if not found
    or (
      select pg_catalog.count(*) <> 1
      from pg_catalog.jsonb_array_elements(
        target_baseline_result -> 'contributions'
      ) as duplicate(value)
      where duplicate.value ->> 'effectKind' = 'base_rate'
    )
    or coalesce(base_contribution ->> 'uncappedNumerator', '')
      !~ '^(0|[1-9][0-9]{0,99})$'
    or coalesce(base_contribution ->> 'denominator', '')
      !~ '^[1-9][0-9]{0,18}$' then
    raise exception using errcode = '22023',
      message = 'invalid campaign base contribution';
  end if;
  base_numerator := (base_contribution ->> 'uncappedNumerator')::numeric;
  base_denominator := (base_contribution ->> 'denominator')::numeric;
  multiplied := pg_catalog.floor(
    base_numerator * target_multiplier_basis_points::numeric /
      (base_denominator * 10000::numeric)
  );
  baseline := pg_catalog.floor(base_numerator / base_denominator);
  if multiplied <= baseline then
    return 0;
  end if;
  if multiplied - baseline > 9223372036854775807::numeric then
    raise exception using errcode = '22003',
      message = 'campaign multiplier points exceed bigint';
  end if;
  return (multiplied - baseline)::bigint;
end;
$$;

create or replace function loyalty_private.protect_campaign_capacity_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'campaign capacity history cannot be deleted';
  end if;
  if new.organization_id <> old.organization_id
    or new.programme_group_id <> old.programme_group_id
    or new.campaign_version_id <> old.campaign_version_id
    or new.updated_at < old.updated_at then
    raise exception using errcode = '55000',
      message = 'campaign capacity identity is immutable';
  end if;
  return new;
end;
$$;

create or replace function loyalty_private.protect_campaign_capacity_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'campaign allocation history cannot be deleted';
  end if;
  if new.id <> old.id
    or new.public_id <> old.public_id
    or new.organization_id <> old.organization_id
    or new.programme_group_id <> old.programme_group_id
    or new.campaign_version_id <> old.campaign_version_id
    or new.customer_id <> old.customer_id
    or new.wallet_id <> old.wallet_id
    or new.source_reference <> old.source_reference
    or new.idempotency_key <> old.idempotency_key
    or new.request_sha256 <> old.request_sha256
    or new.effect_kind <> old.effect_kind
    or new.points <> old.points
    or new.liability_minor <> old.liability_minor
    or new.occurred_at <> old.occurred_at
    or new.created_at <> old.created_at
    or new.updated_at < old.updated_at then
    raise exception using errcode = '55000',
      message = 'campaign allocation identity is immutable';
  end if;
  if old.state = 'reserved'
    and new.state in ('committed', 'released')
    and old.completion_reference is null
    and new.completion_reference is not null then
    return new;
  end if;
  raise exception using errcode = '55000',
    message = 'invalid campaign allocation transition';
end;
$$;

create trigger campaign_capacity_counters_protect
before update or delete on loyalty_private.campaign_capacity_counters
for each row execute function loyalty_private.protect_campaign_capacity_counter();

create trigger campaign_capacity_allocations_protect
before update or delete on loyalty_private.campaign_capacity_allocations
for each row execute function loyalty_private.protect_campaign_capacity_allocation();

create or replace function loyalty_private.reserve_campaign_capacity_v1(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_campaign_version_public_id uuid,
  target_customer_id bigint,
  target_source_reference text,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_occurred_at timestamptz
)
returns table (
  allocation_public_id uuid,
  state text,
  points text,
  liability_minor text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_allocation loyalty_private.campaign_capacity_allocations%rowtype;
  target_version loyalty.campaign_versions%rowtype;
  target_wallet_id bigint;
  target_assignment text;
  target_kind text;
  target_points bigint := 0;
  target_liability bigint := 0;
  member_effects bigint;
  updated_counter loyalty_private.campaign_capacity_counters%rowtype;
  created_allocation loyalty_private.campaign_capacity_allocations%rowtype;
begin
  if target_campaign_version_public_id is null
    or target_customer_id is null
    or target_source_reference is null
    or pg_catalog.length(target_source_reference) not between 1 and 500
    or target_source_reference <> pg_catalog.btrim(target_source_reference)
    or target_idempotency_key is null
    or pg_catalog.length(target_idempotency_key) not between 1 and 255
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or pg_catalog.octet_length(target_request_sha256) is distinct from 32
    or target_occurred_at is null then
    raise exception using errcode = '22023',
      message = 'invalid campaign capacity reservation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-allocation|' || target_organization_id::text || '|' ||
      target_idempotency_key,
    0
  ));
  select allocation.* into existing_allocation
  from loyalty_private.campaign_capacity_allocations as allocation
  where allocation.organization_id = target_organization_id
    and allocation.idempotency_key = target_idempotency_key;
  if found then
    if existing_allocation.request_sha256 <> target_request_sha256
      or existing_allocation.programme_group_id <> target_programme_group_id
      or existing_allocation.customer_id <> target_customer_id then
      raise exception using errcode = '23514',
        message = 'campaign allocation idempotency conflict';
    end if;
    return query select existing_allocation.public_id,
      existing_allocation.state, existing_allocation.points::text,
      existing_allocation.liability_minor::text, 'duplicate'::text;
    return;
  end if;
  select wallet.id into target_wallet_id
  from loyalty.wallets as wallet
  where wallet.organization_id = target_organization_id
    and wallet.programme_group_id = target_programme_group_id
    and wallet.customer_id = target_customer_id
    and wallet.status = 'active';
  if not found then
    raise exception using errcode = '22023',
      message = 'unknown campaign capacity member';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-member|' || target_organization_id::text || '|' ||
      target_programme_group_id::text || '|' || target_customer_id::text,
    0
  ));
  select version.* into target_version
  from loyalty.campaign_versions as version
  where version.organization_id = target_organization_id
    and version.programme_group_id = target_programme_group_id
    and version.public_id = target_campaign_version_public_id;
  if not found then
    raise exception using errcode = '23514',
      message = 'campaign capacity reservation is not eligible';
  end if;
  select assigned.assignment into target_assignment
  from loyalty_private.campaign_assignments as assigned
  where assigned.organization_id = target_organization_id
    and assigned.campaign_version_id = target_version.id
    and assigned.wallet_id = target_wallet_id;
  if not found or target_assignment <> 'treatment'
    or not loyalty_private.campaign_open_at_v1(
      target_version.id, target_occurred_at
    ) then
    raise exception using errcode = '23514',
      message = 'campaign capacity reservation is not eligible';
  end if;
  target_kind := target_version.definition #>> '{behavior,kind}';
  if target_kind not in (
    'milestone', 'win_back', 'tier', 'referral', 'limited_quantity'
  ) then
    raise exception using errcode = '22023',
      message = 'campaign behavior does not use reserved capacity';
  end if;
  if target_version.definition #>> '{behavior,reward,kind}' = 'points' then
    target_points :=
      (target_version.definition #>> '{behavior,reward,points}')::bigint;
  elsif target_version.definition #>> '{behavior,reward,kind}'
      = 'programme_reward' then
    target_liability := target_version.liability_minor_per_effect;
  else
    raise exception using errcode = '23514',
      message = 'campaign reward capacity is unavailable';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-capacity|' || target_organization_id::text || '|' ||
      target_version.id::text,
    0
  ));
  insert into loyalty_private.campaign_capacity_counters (
    organization_id, programme_group_id, campaign_version_id
  ) values (
    target_organization_id, target_programme_group_id, target_version.id
  ) on conflict (organization_id, campaign_version_id) do nothing;
  select pg_catalog.count(*)::bigint into member_effects
  from loyalty_private.campaign_capacity_allocations as allocation
  where allocation.organization_id = target_organization_id
    and allocation.campaign_version_id = target_version.id
    and allocation.wallet_id = target_wallet_id
    and allocation.state in ('reserved', 'committed');
  if member_effects >= target_version.per_member_effect_limit then
    return query select null::uuid, 'unavailable'::text, '0'::text,
      '0'::text, 'capacity_exhausted'::text;
    return;
  end if;
  update loyalty_private.campaign_capacity_counters as counter
  set reserved_effects = counter.reserved_effects + 1,
      reserved_points = counter.reserved_points + target_points,
      reserved_liability_minor =
        counter.reserved_liability_minor + target_liability,
      updated_at = pg_catalog.clock_timestamp()
  where counter.organization_id = target_organization_id
    and counter.campaign_version_id = target_version.id
    and counter.reserved_effects + counter.committed_effects
      < target_version.global_effect_limit
    and (target_version.maximum_points is null
      or counter.reserved_points + counter.committed_points + target_points
        <= target_version.maximum_points)
    and (target_version.maximum_liability_minor is null
      or counter.reserved_liability_minor +
        counter.committed_liability_minor + target_liability
        <= target_version.maximum_liability_minor)
  returning counter.* into updated_counter;
  if not found then
    return query select null::uuid, 'unavailable'::text, '0'::text,
      '0'::text, 'capacity_exhausted'::text;
    return;
  end if;
  insert into loyalty_private.campaign_capacity_allocations (
    organization_id, programme_group_id, campaign_version_id, customer_id,
    wallet_id, source_reference, idempotency_key, request_sha256,
    effect_kind, points, liability_minor, occurred_at
  ) values (
    target_organization_id, target_programme_group_id, target_version.id,
    target_customer_id, target_wallet_id, target_source_reference,
    target_idempotency_key, target_request_sha256, target_kind,
    target_points, target_liability, target_occurred_at
  ) returning * into created_allocation;
  return query select created_allocation.public_id,
    created_allocation.state, created_allocation.points::text,
    created_allocation.liability_minor::text, 'created'::text;
end;
$$;

create or replace function loyalty_private.finish_campaign_capacity_v1(
  target_allocation_public_id uuid,
  target_state text,
  target_completion_reference text
)
returns table (
  allocation_public_id uuid,
  state text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_allocation loyalty_private.campaign_capacity_allocations%rowtype;
begin
  if target_allocation_public_id is null
    or target_state not in ('committed', 'released')
    or target_completion_reference is null
    or pg_catalog.length(target_completion_reference) not between 1 and 500
    or target_completion_reference <> pg_catalog.btrim(target_completion_reference) then
    raise exception using errcode = '22023',
      message = 'invalid campaign capacity completion';
  end if;
  select allocation.* into target_allocation
  from loyalty_private.campaign_capacity_allocations as allocation
  where allocation.public_id = target_allocation_public_id;
  if not found then
    raise exception using errcode = '22023',
      message = 'unknown campaign capacity allocation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-allocation|' || target_allocation.organization_id::text || '|' ||
      target_allocation.idempotency_key,
    0
  ));
  select allocation.* into strict target_allocation
  from loyalty_private.campaign_capacity_allocations as allocation
  where allocation.organization_id = target_allocation.organization_id
    and allocation.id = target_allocation.id
  for update;
  if target_allocation.state <> 'reserved' then
    if target_allocation.state = target_state
      and target_allocation.completion_reference = target_completion_reference then
      return query select target_allocation.public_id,
        target_allocation.state, 'duplicate'::text;
      return;
    end if;
    raise exception using errcode = '23514',
      message = 'campaign capacity completion conflict';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-member|' || target_allocation.organization_id::text || '|' ||
      target_allocation.programme_group_id::text || '|' ||
      target_allocation.customer_id::text,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-capacity|' || target_allocation.organization_id::text || '|' ||
      target_allocation.campaign_version_id::text,
    0
  ));
  update loyalty_private.campaign_capacity_counters as counter
  set reserved_effects = counter.reserved_effects - 1,
      committed_effects = counter.committed_effects +
        case when target_state = 'committed' then 1 else 0 end,
      reserved_points = counter.reserved_points - target_allocation.points,
      committed_points = counter.committed_points +
        case when target_state = 'committed'
          then target_allocation.points else 0 end,
      reserved_liability_minor = counter.reserved_liability_minor -
        target_allocation.liability_minor,
      committed_liability_minor = counter.committed_liability_minor +
        case when target_state = 'committed'
          then target_allocation.liability_minor else 0 end,
      updated_at = pg_catalog.clock_timestamp()
  where counter.organization_id = target_allocation.organization_id
    and counter.campaign_version_id = target_allocation.campaign_version_id
    and counter.reserved_effects >= 1
    and counter.reserved_points >= target_allocation.points
    and counter.reserved_liability_minor >= target_allocation.liability_minor;
  if not found then
    raise exception using errcode = '23514',
      message = 'campaign capacity counters do not reconcile';
  end if;
  update loyalty_private.campaign_capacity_allocations as allocation
  set state = target_state, completion_reference = target_completion_reference,
      updated_at = pg_catalog.clock_timestamp()
  where allocation.organization_id = target_allocation.organization_id
    and allocation.id = target_allocation.id
  returning * into target_allocation;
  return query select target_allocation.public_id,
    target_allocation.state, 'created'::text;
end;
$$;

create or replace function loyalty_private.commit_purchase_campaign_execution_v1(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_canonical_event_id bigint,
  target_customer_id bigint,
  target_subject_reference text,
  target_evaluation_idempotency_key text,
  target_award_idempotency_key text,
  target_programme_input_sha256 bytea,
  target_programme_result_sha256 bytea,
  target_programme_result jsonb,
  target_programme_explanation jsonb,
  target_operation_key text,
  target_campaign_input_sha256 bytea,
  target_campaign_result_sha256 bytea,
  target_campaign_context jsonb,
  target_baseline_result jsonb,
  target_campaign_evaluation jsonb,
  target_occurred_at timestamptz,
  target_evaluated_at timestamptz default now()
)
returns table (
  evaluation_public_id uuid,
  transaction_public_id uuid,
  campaign_batch_public_id uuid,
  campaign_points text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_batch loyalty_private.campaign_execution_batches%rowtype;
  target_wallet_id bigint;
  expected_context jsonb;
  context_item jsonb;
  expected_decisions jsonb := '[]'::jsonb;
  expected_evaluation jsonb;
  matching_codes text[];
  behavior_kind text;
  assignment_value text;
  expected_points bigint;
  expected_outcome text;
  remaining_global bigint;
  remaining_member bigint;
  remaining_points bigint;
  selected_campaign_public_id uuid;
  selected_campaign_priority integer;
  baseline_multiplier_code text;
  baseline_multiplier_priority integer;
  final_contributions jsonb;
  baseline_non_multiplier_contributions jsonb;
  total_campaign_points bigint := 0;
  target_version loyalty.campaign_versions%rowtype;
  committed_programme record;
  target_evaluation loyalty_private.programme_evaluations%rowtype;
  programme_transaction_id bigint;
  created_batch loyalty_private.campaign_execution_batches%rowtype;
  decision jsonb;
  posted record;
  campaign_transaction_id bigint;
  campaign_origin_entry_id bigint;
begin
  if target_operation_key is null
    or pg_catalog.length(target_operation_key) not between 1 and 255
    or target_operation_key <> pg_catalog.btrim(target_operation_key)
    or pg_catalog.octet_length(target_campaign_input_sha256) is distinct from 32
    or pg_catalog.octet_length(target_campaign_result_sha256) is distinct from 32
    or pg_catalog.jsonb_typeof(target_campaign_context) <> 'array'
    or pg_catalog.jsonb_array_length(target_campaign_context) > 100
    or pg_catalog.jsonb_typeof(target_baseline_result) <> 'object'
    or pg_catalog.jsonb_typeof(target_campaign_evaluation) <> 'object'
    or target_campaign_evaluation ->> 'schemaVersion' <> '1'
    or pg_catalog.jsonb_typeof(target_campaign_evaluation -> 'decisions')
      <> 'array'
    or pg_catalog.jsonb_array_length(
      target_campaign_evaluation -> 'decisions'
    ) > 100
    or target_occurred_at is null
    or target_evaluated_at is null
    or target_evaluated_at < target_occurred_at then
    raise exception using errcode = '22023',
      message = 'invalid campaign execution evidence';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'campaign-operation|' || target_organization_id::text || '|' ||
      target_operation_key,
    0
  ));
  select batch.* into existing_batch
  from loyalty_private.campaign_execution_batches as batch
  where batch.organization_id = target_organization_id
    and batch.operation_key = target_operation_key;
  if found then
    if existing_batch.programme_group_id <> target_programme_group_id
      or existing_batch.programme_version_id <> target_programme_version_id
      or existing_batch.canonical_event_id <> target_canonical_event_id
      or existing_batch.customer_id <> target_customer_id
      or existing_batch.input_sha256 <> target_campaign_input_sha256
      or existing_batch.result_sha256 <> target_campaign_result_sha256 then
      raise exception using errcode = '23514',
        message = 'campaign execution idempotency conflict';
    end if;
    select transaction.public_id into transaction_public_id
    from loyalty.ledger_transactions as transaction
    where transaction.organization_id = existing_batch.organization_id
      and transaction.id = existing_batch.programme_transaction_id;
    evaluation_public_id := (
      select evaluation.public_id
      from loyalty_private.programme_evaluations as evaluation
      where evaluation.organization_id = existing_batch.organization_id
        and evaluation.id = existing_batch.programme_evaluation_id
    );
    campaign_batch_public_id := existing_batch.public_id;
    campaign_points :=
      (existing_batch.campaign_evaluation ->> 'totalCampaignPoints');
    outcome := 'duplicate';
    return next;
    return;
  end if;

  select wallet.id into target_wallet_id
  from loyalty.wallets as wallet
  where wallet.organization_id = target_organization_id
    and wallet.programme_group_id = target_programme_group_id
    and wallet.customer_id = target_customer_id
    and wallet.status = 'active';
  if not found then
    raise exception using errcode = '22023',
      message = 'unknown campaign execution member';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'campaignVersionId', context.campaign_version_public_id,
    'campaignCode', context.campaign_code,
    'assignment', context.assignment,
    'behavior', context.behavior,
    'remainingGlobalEffects', context.remaining_global_effects,
    'remainingMemberEffects', context.remaining_member_effects,
    'remainingPoints', context.remaining_points
  ) order by context.campaign_code, context.campaign_version_public_id),
  '[]'::jsonb) into expected_context
  from loyalty_private.get_purchase_campaign_context_v1(
    target_organization_id, target_programme_group_id, target_customer_id,
    target_occurred_at, target_operation_key
  ) as context;
  if expected_context <> target_campaign_context then
    raise exception using errcode = '23514',
      message = 'campaign execution context does not match capacity';
  end if;
  if target_baseline_result ->> 'version' <> '2'
    or target_baseline_result ->> 'source' <> 'purchase'
    or target_programme_result ->> 'version' <> '2'
    or target_programme_result ->> 'source' <> 'purchase'
    or pg_catalog.jsonb_typeof(target_baseline_result -> 'contributions')
      <> 'array'
    or pg_catalog.jsonb_typeof(target_programme_result -> 'contributions')
      <> 'array'
    or target_baseline_result - array[
      'awardedPoints', 'selectedMultiplierRuleCode', 'contributions'
    ] <> target_programme_result - array[
      'awardedPoints', 'selectedMultiplierRuleCode', 'contributions'
    ] then
    raise exception using errcode = '23514',
      message = 'campaign programme evidence does not share one purchase fact';
  end if;

  baseline_multiplier_code :=
    target_baseline_result ->> 'selectedMultiplierRuleCode';
  if baseline_multiplier_code is not null then
    select rule.priority into baseline_multiplier_priority
    from loyalty.programme_earning_rules as rule
    where rule.organization_id = target_organization_id
      and rule.programme_group_id = target_programme_group_id
      and rule.programme_version_id = target_programme_version_id
      and rule.code = baseline_multiplier_code
      and rule.enabled
      and rule.effect_kind = 'multiplier';
    if not found then
      raise exception using errcode = '23514',
        message = 'campaign baseline multiplier is unavailable';
    end if;
  end if;

  select (candidate.value ->> 'campaignVersionId')::uuid,
    (candidate.value #>> '{behavior,priority}')::integer
  into selected_campaign_public_id, selected_campaign_priority
  from pg_catalog.jsonb_array_elements(target_campaign_context)
    as candidate(value)
  where candidate.value #>> '{behavior,kind}' = 'purchase_multiplier'
    and candidate.value ->> 'assignment' = 'treatment'
    and (candidate.value ->> 'remainingGlobalEffects')::bigint > 0
    and (candidate.value ->> 'remainingMemberEffects')::bigint > 0
    and pg_catalog.cardinality(
      loyalty_private.campaign_matching_rule_codes_v1(
        candidate.value -> 'behavior', target_baseline_result
      )
    ) > 0
    and loyalty_private.campaign_multiplier_points_v1(
      target_baseline_result,
      (candidate.value #>> '{behavior,multiplierBasisPoints}')::integer
    ) > 0
    and loyalty_private.campaign_multiplier_points_v1(
      target_baseline_result,
      (candidate.value #>> '{behavior,multiplierBasisPoints}')::integer
    ) <= (candidate.value ->> 'remainingPoints')::bigint
  order by (candidate.value #>> '{behavior,priority}')::integer desc,
    candidate.value ->> 'campaignCode',
    candidate.value ->> 'campaignVersionId'
  limit 1;
  if selected_campaign_public_id is not null
    and baseline_multiplier_priority is not null
    and baseline_multiplier_priority > selected_campaign_priority then
    selected_campaign_public_id := null;
    selected_campaign_priority := null;
  end if;

  for context_item in
    select candidate.value
    from pg_catalog.jsonb_array_elements(target_campaign_context)
      as candidate(value)
    order by candidate.value ->> 'campaignCode',
      candidate.value ->> 'campaignVersionId'
  loop
    matching_codes := loyalty_private.campaign_matching_rule_codes_v1(
      context_item -> 'behavior', target_baseline_result
    );
    if pg_catalog.cardinality(matching_codes) = 0 then
      continue;
    end if;
    behavior_kind := context_item #>> '{behavior,kind}';
    assignment_value := context_item ->> 'assignment';
    remaining_global :=
      (context_item ->> 'remainingGlobalEffects')::bigint;
    remaining_member :=
      (context_item ->> 'remainingMemberEffects')::bigint;
    remaining_points := (context_item ->> 'remainingPoints')::bigint;
    if behavior_kind = 'bonus_points' then
      expected_points :=
        (context_item #>> '{behavior,reward,points}')::bigint;
    elsif behavior_kind = 'purchase_multiplier' then
      expected_points := loyalty_private.campaign_multiplier_points_v1(
        target_baseline_result,
        (context_item #>> '{behavior,multiplierBasisPoints}')::integer
      );
    else
      raise exception using errcode = '23514',
        message = 'unsupported purchase campaign behavior';
    end if;
    if assignment_value = 'control' then
      expected_outcome := 'control';
    elsif expected_points = 0
      or remaining_global = 0
      or remaining_member = 0
      or remaining_points < expected_points then
      expected_outcome := 'capacity_exhausted';
    elsif behavior_kind = 'purchase_multiplier'
      and (context_item ->> 'campaignVersionId')::uuid
        <> selected_campaign_public_id then
      expected_outcome := 'suppressed';
    else
      expected_outcome := 'awarded';
    end if;
    expected_decisions := expected_decisions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'campaignVersionId', context_item ->> 'campaignVersionId',
        'campaignCode', context_item ->> 'campaignCode',
        'assignment', assignment_value,
        'effectKind', behavior_kind,
        'matchedRuleCodes', pg_catalog.to_jsonb(matching_codes),
        'priority', case when behavior_kind = 'purchase_multiplier'
          then (context_item #>> '{behavior,priority}')::integer else null end,
        'points', case when expected_outcome = 'awarded'
          then expected_points::text else '0' end,
        'outcome', expected_outcome
      )
    );
    if expected_outcome = 'awarded' then
      total_campaign_points := total_campaign_points + expected_points;
    end if;
  end loop;
  expected_evaluation := pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'selectedCampaignMultiplierVersionId', selected_campaign_public_id,
    'suppressedProgrammeMultiplierRuleCode',
      case when selected_campaign_public_id is null
        then null else baseline_multiplier_code end,
    'totalCampaignPoints', total_campaign_points::text,
    'decisions', expected_decisions
  );
  if target_campaign_evaluation <> expected_evaluation then
    raise exception using errcode = '23514',
      message = 'campaign evaluation does not match immutable policy and capacity';
  end if;

  if selected_campaign_public_id is null then
    if target_programme_result <> target_baseline_result then
      raise exception using errcode = '23514',
        message = 'programme result changed without a selected campaign multiplier';
    end if;
  else
    if target_programme_result -> 'selectedMultiplierRuleCode' <> 'null'::jsonb
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          target_programme_result -> 'contributions'
        ) as contribution(value)
        where contribution.value ->> 'effectKind' = 'multiplier'
      ) then
      raise exception using errcode = '23514',
        message = 'selected campaign multiplier did not suppress programme multiplier';
    end if;
    select coalesce(pg_catalog.jsonb_agg(
      contribution.value - 'awardedPoints' order by contribution.ordinal
    ), '[]'::jsonb) into final_contributions
    from pg_catalog.jsonb_array_elements(
      target_programme_result -> 'contributions'
    ) with ordinality as contribution(value, ordinal);
    select coalesce(pg_catalog.jsonb_agg(
      contribution.value - 'awardedPoints' order by contribution.ordinal
    ), '[]'::jsonb) into baseline_non_multiplier_contributions
    from pg_catalog.jsonb_array_elements(
      target_baseline_result -> 'contributions'
    ) with ordinality as contribution(value, ordinal)
    where contribution.value ->> 'effectKind' <> 'multiplier';
    if final_contributions <> baseline_non_multiplier_contributions then
      raise exception using errcode = '23514',
        message = 'campaign multiplier changed non-multiplier evidence';
    end if;
  end if;

  for decision in
    select item.value
    from pg_catalog.jsonb_array_elements(expected_decisions) as item(value)
    where item.value ->> 'outcome' = 'awarded'
    order by item.value ->> 'campaignCode',
      item.value ->> 'campaignVersionId'
  loop
    select version.* into strict target_version
    from loyalty.campaign_versions as version
    where version.organization_id = target_organization_id
      and version.programme_group_id = target_programme_group_id
      and version.public_id =
        (decision ->> 'campaignVersionId')::uuid;
    expected_points := (decision ->> 'points')::bigint;
    update loyalty_private.campaign_capacity_counters as counter
    set reserved_effects = counter.reserved_effects + 1,
        reserved_points = counter.reserved_points + expected_points,
        updated_at = pg_catalog.clock_timestamp()
    where counter.organization_id = target_organization_id
      and counter.campaign_version_id = target_version.id
      and counter.reserved_effects + counter.committed_effects
        < target_version.global_effect_limit
      and counter.reserved_points + counter.committed_points + expected_points
        <= target_version.maximum_points;
    if not found then
      raise exception using errcode = '40001',
        message = 'campaign capacity changed during execution';
    end if;
  end loop;

  select * into strict committed_programme
  from loyalty_private.commit_programme_v2_award(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_canonical_event_id,
    target_customer_id, target_subject_reference,
    target_evaluation_idempotency_key, target_award_idempotency_key,
    target_programme_input_sha256, target_programme_result_sha256,
    target_programme_result, target_programme_explanation,
    target_occurred_at, target_evaluated_at
  );
  select evaluation.* into strict target_evaluation
  from loyalty_private.programme_evaluations as evaluation
  where evaluation.organization_id = target_organization_id
    and evaluation.public_id = committed_programme.evaluation_public_id;
  programme_transaction_id := null;
  if committed_programme.transaction_public_id is not null then
    select transaction.id into strict programme_transaction_id
    from loyalty.ledger_transactions as transaction
    where transaction.organization_id = target_organization_id
      and transaction.public_id = committed_programme.transaction_public_id;
  end if;
  insert into loyalty_private.campaign_execution_batches (
    organization_id, programme_group_id, programme_version_id,
    programme_evaluation_id, programme_transaction_id, canonical_event_id,
    customer_id, wallet_id, operation_key, input_sha256, result_sha256,
    campaign_context, baseline_result, campaign_evaluation, occurred_at,
    evaluated_at
  ) values (
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_evaluation.id,
    programme_transaction_id, target_canonical_event_id, target_customer_id,
    target_wallet_id, target_operation_key, target_campaign_input_sha256,
    target_campaign_result_sha256, target_campaign_context,
    target_baseline_result, target_campaign_evaluation, target_occurred_at,
    target_evaluated_at
  ) returning * into created_batch;

  for decision in
    select item.value
    from pg_catalog.jsonb_array_elements(expected_decisions) as item(value)
    order by item.value ->> 'campaignCode',
      item.value ->> 'campaignVersionId'
  loop
    select version.* into strict target_version
    from loyalty.campaign_versions as version
    where version.organization_id = target_organization_id
      and version.programme_group_id = target_programme_group_id
      and version.public_id =
        (decision ->> 'campaignVersionId')::uuid;
    campaign_transaction_id := null;
    campaign_origin_entry_id := null;
    if decision ->> 'outcome' = 'awarded' then
      expected_points := (decision ->> 'points')::bigint;
      select * into strict posted
      from loyalty_private.award_points(
        target_organization_id, target_programme_group_id,
        target_programme_version_id, target_customer_id, expected_points,
        'campaign:award:' || pg_catalog.encode(extensions.digest(
          pg_catalog.convert_to(
            target_organization_id::text || '|' || target_operation_key || '|' ||
              target_version.public_id::text,
            'UTF8'
          ), 'sha256'
        ), 'hex'),
        extensions.digest(
          pg_catalog.convert_to(decision::text, 'UTF8'), 'sha256'
        ),
        target_canonical_event_id, target_subject_reference,
        target_occurred_at
      );
      select transaction.id into strict campaign_transaction_id
      from loyalty.ledger_transactions as transaction
      where transaction.organization_id = target_organization_id
        and transaction.public_id = posted.transaction_public_id;
      select entry.id into strict campaign_origin_entry_id
      from loyalty.ledger_entries as entry
      join loyalty.ledger_accounts as account
        on account.organization_id = entry.organization_id
       and account.id = entry.account_id
       and account.account_kind = 'pending'
      where entry.organization_id = target_organization_id
        and entry.transaction_id = campaign_transaction_id
        and entry.points = expected_points;
      update loyalty_private.campaign_capacity_counters as counter
      set reserved_effects = counter.reserved_effects - 1,
          committed_effects = counter.committed_effects + 1,
          reserved_points = counter.reserved_points - expected_points,
          committed_points = counter.committed_points + expected_points,
          updated_at = pg_catalog.clock_timestamp()
      where counter.organization_id = target_organization_id
        and counter.campaign_version_id = target_version.id
        and counter.reserved_effects >= 1
        and counter.reserved_points >= expected_points;
      if not found then
        raise exception using errcode = '23514',
          message = 'campaign committed counters do not reconcile';
      end if;
    end if;
    insert into loyalty_private.campaign_effects (
      organization_id, programme_group_id, campaign_version_id,
      execution_batch_id, customer_id, wallet_id, assignment, effect_kind,
      decision_outcome, matched_rule_codes, points, state,
      award_transaction_id, award_origin_entry_id
    ) values (
      target_organization_id, target_programme_group_id, target_version.id,
      created_batch.id, target_customer_id, target_wallet_id,
      decision ->> 'assignment', decision ->> 'effectKind',
      decision ->> 'outcome', decision -> 'matchedRuleCodes',
      (decision ->> 'points')::bigint,
      case when decision ->> 'outcome' = 'awarded'
        then 'committed' else 'recorded' end,
      campaign_transaction_id, campaign_origin_entry_id
    );
  end loop;
  evaluation_public_id := committed_programme.evaluation_public_id;
  transaction_public_id := committed_programme.transaction_public_id;
  campaign_batch_public_id := created_batch.public_id;
  campaign_points := total_campaign_points::text;
  outcome := 'created';
  return next;
end;
$$;

alter table loyalty_private.campaign_capacity_counters enable row level security;
alter table loyalty_private.campaign_execution_batches enable row level security;
alter table loyalty_private.campaign_effects enable row level security;
alter table loyalty_private.campaign_capacity_allocations enable row level security;

alter function loyalty_private.campaign_open_at_v1(bigint, timestamptz)
  owner to loyalty_owner;
alter function loyalty_private.campaign_matching_rule_codes_v1(jsonb, jsonb)
  owner to loyalty_owner;
alter function loyalty_private.get_purchase_campaign_context_v1(
  bigint, bigint, bigint, timestamptz, text
) owner to loyalty_owner;
alter function loyalty_private.campaign_multiplier_points_v1(jsonb, integer)
  owner to loyalty_owner;
alter function loyalty_private.protect_campaign_capacity_counter()
  owner to loyalty_owner;
alter function loyalty_private.protect_campaign_capacity_allocation()
  owner to loyalty_owner;
alter function loyalty_private.reserve_campaign_capacity_v1(
  bigint, bigint, uuid, bigint, text, text, bytea, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.finish_campaign_capacity_v1(uuid, text, text)
  owner to loyalty_owner;
alter function loyalty_private.commit_purchase_campaign_execution_v1(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, text, bytea, bytea, jsonb, jsonb, jsonb,
  timestamptz, timestamptz
) owner to loyalty_owner;

revoke all on loyalty_private.campaign_capacity_counters,
  loyalty_private.campaign_execution_batches,
  loyalty_private.campaign_effects,
  loyalty_private.campaign_capacity_allocations
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function
  loyalty_private.campaign_open_at_v1(bigint, timestamptz),
  loyalty_private.campaign_matching_rule_codes_v1(jsonb, jsonb),
  loyalty_private.get_purchase_campaign_context_v1(
    bigint, bigint, bigint, timestamptz, text
  ),
  loyalty_private.campaign_multiplier_points_v1(jsonb, integer),
  loyalty_private.protect_campaign_capacity_counter(),
  loyalty_private.protect_campaign_capacity_allocation(),
  loyalty_private.reserve_campaign_capacity_v1(
    bigint, bigint, uuid, bigint, text, text, bytea, timestamptz
  ),
  loyalty_private.finish_campaign_capacity_v1(uuid, text, text),
  loyalty_private.commit_purchase_campaign_execution_v1(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, text, bytea, bytea, jsonb, jsonb, jsonb,
    timestamptz, timestamptz
  ) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function
  loyalty_private.get_purchase_campaign_context_v1(
    bigint, bigint, bigint, timestamptz, text
  ),
  loyalty_private.reserve_campaign_capacity_v1(
    bigint, bigint, uuid, bigint, text, text, bytea, timestamptz
  ),
  loyalty_private.finish_campaign_capacity_v1(uuid, text, text),
  loyalty_private.commit_purchase_campaign_execution_v1(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, text, bytea, bytea, jsonb, jsonb, jsonb,
    timestamptz, timestamptz
  ) to loyalty_worker;

comment on table loyalty_private.campaign_capacity_counters is
  'Private serialized campaign effect, points, and liability capacity.';
comment on table loyalty_private.campaign_execution_batches is
  'Immutable purchase campaign context and evaluation replay evidence.';
comment on table loyalty_private.campaign_effects is
  'Immutable campaign decision and campaign-attributed ledger evidence.';
comment on table loyalty_private.campaign_capacity_allocations is
  'Reservation evidence for non-purchase campaign value before fulfilment.';
comment on function loyalty_private.commit_purchase_campaign_execution_v1(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, text, bytea, bytea, jsonb, jsonb, jsonb,
  timestamptz, timestamptz
) is 'Reserves campaign capacity, commits programme and campaign awards atomically, and returns the original result on exact retry.';
