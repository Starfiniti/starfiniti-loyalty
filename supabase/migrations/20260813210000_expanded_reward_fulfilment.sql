-- M04 expanded WooCommerce-native reward fulfilment. Version 2 rewards are
-- validated and entitled at the database boundary; capacity is allocated
-- atomically before points move, and connector payloads are capability gated.

create table loyalty_private.reward_capacity_counters (
  organization_id bigint not null,
  reward_id bigint not null,
  allocated_quantity bigint not null default 0 check (allocated_quantity >= 0),
  consumed_quantity bigint not null default 0 check (consumed_quantity >= 0),
  allocated_points bigint not null default 0 check (allocated_points >= 0),
  consumed_points bigint not null default 0 check (consumed_points >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, reward_id),
  foreign key (organization_id, reward_id)
    references loyalty.programme_rewards(organization_id, id) on delete restrict
);

create table loyalty_private.reward_capacity_allocations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  reward_id bigint not null,
  reservation_id bigint not null,
  wallet_id bigint not null,
  quantity bigint not null default 1 check (quantity = 1),
  points bigint not null check (points > 0),
  state text not null default 'allocated' check (
    state in ('allocated', 'consumed', 'released')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, reservation_id),
  foreign key (organization_id, reward_id)
    references loyalty.programme_rewards(organization_id, id) on delete restrict,
  foreign key (organization_id, reservation_id)
    references loyalty.reward_reservations(organization_id, id) on delete restrict,
  foreign key (organization_id, wallet_id)
    references loyalty.wallets(organization_id, id) on delete restrict,
  check (updated_at >= created_at)
);

create index reward_capacity_allocations_member_idx
  on loyalty_private.reward_capacity_allocations (
    organization_id, reward_id, wallet_id, state, id
  );

alter table loyalty_private.reward_capacity_counters owner to loyalty_owner;
alter table loyalty_private.reward_capacity_allocations owner to loyalty_owner;

create or replace function loyalty_private.is_bounded_bigint_text(
  target_value text,
  allow_zero boolean default false
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when target_value is null then false
    when allow_zero and target_value = '0' then true
    when target_value !~ '^[1-9][0-9]{0,18}$' then false
    when length(target_value) < 19 then true
    else target_value <= '9223372036854775807'
  end;
$$;

create or replace function loyalty_private.is_reward_code_array(
  target_value jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_typeof(target_value) = 'array'
    and pg_catalog.jsonb_array_length(target_value) <= 100
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(target_value) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'string'
        or item.value #>> '{}' !~ '^[a-z][a-z0-9_-]{0,79}$'
    ),
    false
  );
$$;

create or replace function loyalty_private.is_woocommerce_id_array(
  target_value jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_typeof(target_value) = 'array'
    and pg_catalog.jsonb_array_length(target_value) <= 100
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(target_value) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'string'
        or item.value #>> '{}' !~ '^[1-9][0-9]{0,19}$'
    ),
    false
  );
$$;

create or replace function loyalty_private.validate_reward_availability_v2(
  target_availability jsonb,
  target_cost_points bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  starts_at timestamptz;
  ends_at timestamptz;
  points_budget bigint;
begin
  if pg_catalog.jsonb_typeof(target_availability) <> 'object'
    or not (target_availability ?& array[
      'startsAt', 'endsAt', 'tierCodes', 'segmentCodes',
      'perCustomerLimit', 'globalQuantity', 'pointsBudget'
    ])
    or target_availability - array[
      'startsAt', 'endsAt', 'tierCodes', 'segmentCodes',
      'perCustomerLimit', 'globalQuantity', 'pointsBudget'
    ] <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(target_availability -> 'startsAt') not in ('string', 'null')
    or pg_catalog.jsonb_typeof(target_availability -> 'endsAt') not in ('string', 'null')
    or not loyalty_private.is_reward_code_array(target_availability -> 'tierCodes')
    or not loyalty_private.is_reward_code_array(target_availability -> 'segmentCodes')
    or pg_catalog.jsonb_array_length(target_availability -> 'segmentCodes') > 0
    or pg_catalog.jsonb_typeof(target_availability -> 'perCustomerLimit') not in ('number', 'null')
    or pg_catalog.jsonb_typeof(target_availability -> 'globalQuantity') not in ('string', 'null')
    or pg_catalog.jsonb_typeof(target_availability -> 'pointsBudget') not in ('string', 'null') then
    raise exception using errcode = '22023',
      message = 'invalid RewardDefinitionV2 availability';
  end if;
  if target_availability -> 'perCustomerLimit' <> 'null'::jsonb
    and (
      target_availability ->> 'perCustomerLimit' !~ '^[1-9][0-9]{0,3}$'
      or (target_availability ->> 'perCustomerLimit')::integer > 1000
    ) then
    raise exception using errcode = '22023',
      message = 'invalid RewardDefinitionV2 member limit';
  end if;
  if target_availability -> 'globalQuantity' <> 'null'::jsonb
    and not loyalty_private.is_bounded_bigint_text(
      target_availability ->> 'globalQuantity'
    ) then
    raise exception using errcode = '22023',
      message = 'invalid RewardDefinitionV2 global quantity';
  end if;
  if target_availability -> 'pointsBudget' <> 'null'::jsonb then
    if not loyalty_private.is_bounded_bigint_text(
      target_availability ->> 'pointsBudget'
    ) then
      raise exception using errcode = '22023',
        message = 'invalid RewardDefinitionV2 points budget';
    end if;
    points_budget := (target_availability ->> 'pointsBudget')::bigint;
    if points_budget < target_cost_points then
      raise exception using errcode = '22023',
        message = 'reward points budget cannot fund one redemption';
    end if;
  end if;
  begin
    starts_at := case when target_availability -> 'startsAt' = 'null'::jsonb
      then null else (target_availability ->> 'startsAt')::timestamptz end;
    ends_at := case when target_availability -> 'endsAt' = 'null'::jsonb
      then null else (target_availability ->> 'endsAt')::timestamptz end;
  exception when others then
    raise exception using errcode = '22023',
      message = 'invalid RewardDefinitionV2 availability timestamp';
  end;
  if starts_at is not null and ends_at is not null and starts_at >= ends_at then
    raise exception using errcode = '22023',
      message = 'reward availability end must follow start';
  end if;
end;
$$;

create or replace function loyalty_private.validate_coupon_restrictions_v2(
  target_restrictions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(target_restrictions) <> 'object'
    or not (target_restrictions ?& array[
      'minimumSpendMinor', 'productIds', 'excludedProductIds', 'categoryIds',
      'excludedCategoryIds', 'excludeSaleItems', 'stacking'
    ])
    or target_restrictions - array[
      'minimumSpendMinor', 'productIds', 'excludedProductIds', 'categoryIds',
      'excludedCategoryIds', 'excludeSaleItems', 'stacking'
    ] <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(target_restrictions -> 'minimumSpendMinor') not in ('string', 'null')
    or not loyalty_private.is_woocommerce_id_array(target_restrictions -> 'productIds')
    or not loyalty_private.is_woocommerce_id_array(target_restrictions -> 'excludedProductIds')
    or not loyalty_private.is_woocommerce_id_array(target_restrictions -> 'categoryIds')
    or not loyalty_private.is_woocommerce_id_array(target_restrictions -> 'excludedCategoryIds')
    or pg_catalog.jsonb_typeof(target_restrictions -> 'excludeSaleItems') <> 'boolean'
    or coalesce(target_restrictions ->> 'stacking', '') not in ('exclusive', 'combinable') then
    raise exception using errcode = '22023',
      message = 'invalid RewardDefinitionV2 coupon restrictions';
  end if;
  if target_restrictions -> 'minimumSpendMinor' <> 'null'::jsonb
    and not loyalty_private.is_bounded_bigint_text(
      target_restrictions ->> 'minimumSpendMinor', true
    ) then
    raise exception using errcode = '22023',
      message = 'invalid RewardDefinitionV2 minimum spend';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(
      target_restrictions -> 'productIds'
    ) as included(value)
    where included.value in (
      select excluded.value
      from pg_catalog.jsonb_array_elements_text(
        target_restrictions -> 'excludedProductIds'
      ) as excluded(value)
    )
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(
      target_restrictions -> 'categoryIds'
    ) as included(value)
    where included.value in (
      select excluded.value
      from pg_catalog.jsonb_array_elements_text(
        target_restrictions -> 'excludedCategoryIds'
      ) as excluded(value)
    )
  ) then
    raise exception using errcode = '22023',
      message = 'reward coupon selector cannot be included and excluded';
  end if;
end;
$$;

create or replace function loyalty_private.validate_reward_definition_v2(
  target_reward jsonb,
  target_programme_currency_minor_unit_digits smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_kind text;
  target_cost_points bigint;
  target_configuration jsonb;
  target_availability jsonb;
  target_restrictions jsonb;
begin
  if pg_catalog.jsonb_typeof(target_reward) <> 'object'
    or not (target_reward ?& array['code', 'name', 'kind', 'costPoints', 'configuration'])
    or target_reward - array['code', 'name', 'kind', 'costPoints', 'configuration'] <> '{}'::jsonb
    or coalesce(target_reward ->> 'code', '') !~ '^[a-z][a-z0-9_-]{0,79}$'
    or length(btrim(coalesce(target_reward ->> 'name', ''))) not between 1 and 200
    or not loyalty_private.is_bounded_bigint_text(target_reward ->> 'costPoints')
    or pg_catalog.jsonb_typeof(target_reward -> 'configuration') <> 'object' then
    raise exception using errcode = '22023',
      message = 'invalid RewardDefinitionV2 identity';
  end if;
  target_kind := target_reward ->> 'kind';
  target_cost_points := (target_reward ->> 'costPoints')::bigint;
  target_configuration := target_reward -> 'configuration';
  target_availability := target_configuration -> 'availability';
  if not (target_configuration ? 'version') then
    if target_kind not in (
      'fixed_discount', 'percentage_discount', 'free_shipping'
    )
      or coalesce(target_configuration ->> 'validityDays', '') !~ '^[1-9][0-9]{0,2}$'
      or (target_configuration ->> 'validityDays')::integer > 365 then
      raise exception using errcode = '22023',
        message = 'unsupported or invalid legacy reward configuration';
    end if;
    if target_kind = 'fixed_discount' then
      if not loyalty_private.is_bounded_bigint_text(
        target_configuration ->> 'amountMinor'
      )
        or coalesce(target_configuration ->> 'currencyMinorUnitDigits', '') !~ '^[0-6]$'
        or (target_configuration ->> 'currencyMinorUnitDigits')::smallint
          <> target_programme_currency_minor_unit_digits then
        raise exception using errcode = '22023',
          message = 'invalid legacy fixed-discount reward configuration';
      end if;
    elsif target_kind = 'percentage_discount' then
      if coalesce(target_configuration ->> 'percentageBasisPoints', '') !~ '^[1-9][0-9]*$'
        or (target_configuration ->> 'percentageBasisPoints')::integer > 10000
        or not (target_configuration ? 'maximumDiscountMinor')
        or target_configuration -> 'maximumDiscountMinor' <> 'null'::jsonb
        or coalesce(target_configuration ->> 'currencyMinorUnitDigits', '') !~ '^[0-6]$'
        or (target_configuration ->> 'currencyMinorUnitDigits')::smallint
          <> target_programme_currency_minor_unit_digits then
        raise exception using errcode = '22023',
          message = 'invalid legacy percentage-discount reward configuration';
      end if;
    end if;
    return;
  end if;
  if target_configuration -> 'version' <> '"2"'::jsonb then
    raise exception using errcode = '22023',
      message = 'invalid reward configuration version';
  end if;
  if target_kind not in (
    'fixed_discount', 'percentage_discount', 'free_shipping',
    'free_product', 'exclusive_access', 'custom'
  ) then
    raise exception using errcode = '22023',
      message = 'unsupported RewardDefinitionV2 kind';
  end if;
  perform loyalty_private.validate_reward_availability_v2(
    target_availability, target_cost_points
  );

  if target_kind in ('exclusive_access', 'custom') then
    if target_configuration - array[
      'version', 'fulfilmentMode', 'availability',
      'fulfilmentInstructions', 'fulfilmentSlaDays'
    ] <> '{}'::jsonb
      or not (target_configuration ?& array[
        'version', 'fulfilmentMode', 'availability',
        'fulfilmentInstructions', 'fulfilmentSlaDays'
      ])
      or target_configuration ->> 'fulfilmentMode' <> 'manual'
      or length(btrim(coalesce(
        target_configuration ->> 'fulfilmentInstructions', ''
      ))) not between 1 and 2000
      or coalesce(target_configuration ->> 'fulfilmentSlaDays', '') !~ '^[1-9][0-9]*$'
      or (target_configuration ->> 'fulfilmentSlaDays')::integer > 90 then
      raise exception using errcode = '22023',
        message = 'invalid manual RewardDefinitionV2 configuration';
    end if;
    return;
  end if;

  if target_configuration ->> 'fulfilmentMode' <> 'woocommerce_coupon'
    or coalesce(target_configuration ->> 'validityDays', '') !~ '^[1-9][0-9]{0,2}$'
    or (target_configuration ->> 'validityDays')::integer > 365 then
    raise exception using errcode = '22023',
      message = 'invalid native RewardDefinitionV2 lifecycle';
  end if;
  target_restrictions := target_configuration -> 'restrictions';
  perform loyalty_private.validate_coupon_restrictions_v2(target_restrictions);

  if target_kind = 'fixed_discount' then
    if target_configuration - array[
      'version', 'fulfilmentMode', 'validityDays', 'availability',
      'restrictions', 'amountMinor', 'currencyMinorUnitDigits'
    ] <> '{}'::jsonb
      or not (target_configuration ?& array[
        'version', 'fulfilmentMode', 'validityDays', 'availability',
        'restrictions', 'amountMinor', 'currencyMinorUnitDigits'
      ])
      or not loyalty_private.is_bounded_bigint_text(
        target_configuration ->> 'amountMinor'
      )
      or coalesce(target_configuration ->> 'currencyMinorUnitDigits', '') !~ '^[0-6]$'
      or (target_configuration ->> 'currencyMinorUnitDigits')::smallint
        <> target_programme_currency_minor_unit_digits then
      raise exception using errcode = '22023',
        message = 'invalid fixed-discount RewardDefinitionV2';
    end if;
  elsif target_kind = 'percentage_discount' then
    if target_configuration - array[
      'version', 'fulfilmentMode', 'validityDays', 'availability',
      'restrictions', 'percentageBasisPoints', 'maximumDiscountMinor',
      'currencyMinorUnitDigits'
    ] <> '{}'::jsonb
      or not (target_configuration ?& array[
        'version', 'fulfilmentMode', 'validityDays', 'availability',
        'restrictions', 'percentageBasisPoints', 'maximumDiscountMinor',
        'currencyMinorUnitDigits'
      ])
      or coalesce(target_configuration ->> 'percentageBasisPoints', '') !~ '^[1-9][0-9]*$'
      or (target_configuration ->> 'percentageBasisPoints')::integer > 10000
      or target_configuration -> 'maximumDiscountMinor' <> 'null'::jsonb
      or coalesce(target_configuration ->> 'currencyMinorUnitDigits', '') !~ '^[0-6]$'
      or (target_configuration ->> 'currencyMinorUnitDigits')::smallint
        <> target_programme_currency_minor_unit_digits then
      raise exception using errcode = '22023',
        message = 'invalid percentage-discount RewardDefinitionV2';
    end if;
  elsif target_kind = 'free_shipping' then
    if target_configuration - array[
      'version', 'fulfilmentMode', 'validityDays', 'availability', 'restrictions'
    ] <> '{}'::jsonb
      or not (target_configuration ?& array[
        'version', 'fulfilmentMode', 'validityDays', 'availability', 'restrictions'
      ]) then
      raise exception using errcode = '22023',
        message = 'invalid free-shipping RewardDefinitionV2';
    end if;
  else
    if target_configuration - array[
      'version', 'fulfilmentMode', 'validityDays', 'availability',
      'restrictions', 'productId', 'quantity'
    ] <> '{}'::jsonb
      or not (target_configuration ?& array[
        'version', 'fulfilmentMode', 'validityDays', 'availability',
        'restrictions', 'productId', 'quantity'
      ])
      or coalesce(target_configuration ->> 'productId', '') !~ '^[1-9][0-9]{0,19}$'
      or coalesce(target_configuration ->> 'quantity', '') !~ '^[1-9][0-9]*$'
      or (target_configuration ->> 'quantity')::integer > 10
      or pg_catalog.jsonb_array_length(target_restrictions -> 'productIds') > 0
      or pg_catalog.jsonb_array_length(target_restrictions -> 'excludedProductIds') > 0
      or pg_catalog.jsonb_array_length(target_restrictions -> 'categoryIds') > 0
      or pg_catalog.jsonb_array_length(target_restrictions -> 'excludedCategoryIds') > 0 then
      raise exception using errcode = '22023',
        message = 'invalid free-product RewardDefinitionV2';
    end if;
  end if;
end;
$$;

create or replace function loyalty_private.enforce_expanded_reward_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_reward jsonb;
  expanded_reward_present boolean := false;
  entitlement_enabled boolean;
  target_minor_unit_digits smallint;
begin
  if coalesce(new.configuration ->> 'version', '') <> '2' then
    return new;
  end if;
  target_minor_unit_digits := (new.configuration ->> 'currencyMinorUnitDigits')::smallint;
  for target_reward in
    select value
    from pg_catalog.jsonb_array_elements(new.configuration -> 'rewards')
  loop
    perform loyalty_private.validate_reward_definition_v2(
      target_reward, target_minor_unit_digits
    );
    if target_reward -> 'configuration' ->> 'version' = '2' then
      expanded_reward_present := true;
    end if;
  end loop;
  if expanded_reward_present then
    select decision.enabled into strict entitlement_enabled
    from loyalty_private.resolve_organization_entitlement(
      new.organization_id,
      'rewards.expanded',
      'programme:' || new.programme_id::text,
      now()
    ) as decision;
    if not entitlement_enabled then
      raise exception using errcode = '42501',
        message = 'expanded rewards are not enabled for this organization';
    end if;
  end if;
  return new;
end;
$$;

create trigger programme_versions_expanded_reward_contract
before insert or update of status on loyalty.programme_versions
for each row execute function loyalty_private.enforce_expanded_reward_contract();

create or replace function loyalty_private.allocate_reward_capacity_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_reward loyalty.programme_rewards%rowtype;
  target_availability jsonb;
  per_customer_limit integer;
  global_quantity bigint;
  points_budget bigint;
  member_allocations bigint;
  target_counter loyalty_private.reward_capacity_counters%rowtype;
  entitlement_enabled boolean;
begin
  select reward.* into target_reward
  from loyalty.programme_rewards as reward
  where reward.organization_id = new.organization_id
    and reward.id = new.reward_id;
  if not found or target_reward.configuration ->> 'version' <> '2' then
    return new;
  end if;
  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    new.organization_id,
    'rewards.expanded',
    'reward:' || target_reward.id::text,
    pg_catalog.transaction_timestamp()
  ) as decision;
  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'expanded rewards are not enabled for this organization';
  end if;
  target_availability := target_reward.configuration -> 'availability';
  if target_availability -> 'startsAt' <> 'null'::jsonb
    and (target_availability ->> 'startsAt')::timestamptz
      > pg_catalog.transaction_timestamp() then
    raise exception using errcode = '22023', message = 'reward is not yet available';
  end if;
  if target_availability -> 'endsAt' <> 'null'::jsonb
    and (target_availability ->> 'endsAt')::timestamptz
      <= pg_catalog.transaction_timestamp() then
    raise exception using errcode = '22023', message = 'reward is no longer available';
  end if;
  if pg_catalog.jsonb_array_length(target_availability -> 'segmentCodes') > 0 then
    raise exception using errcode = '55000',
      message = 'reward segments are unavailable until the audience authority is enabled';
  end if;
  if pg_catalog.jsonb_array_length(target_availability -> 'tierCodes') > 0
    and not exists (
      select 1
      from loyalty.tier_memberships as membership
      where membership.organization_id = new.organization_id
        and membership.wallet_id = new.wallet_id
        and membership.effective_until is null
        and membership.tier_code in (
          select code.value
          from pg_catalog.jsonb_array_elements_text(
            target_availability -> 'tierCodes'
          ) as code(value)
        )
    ) then
    raise exception using errcode = '42501',
      message = 'reward is not available to the current member tier';
  end if;

  insert into loyalty_private.reward_capacity_counters (
    organization_id, reward_id
  ) values (new.organization_id, new.reward_id)
  on conflict (organization_id, reward_id) do nothing;
  select counter.* into strict target_counter
  from loyalty_private.reward_capacity_counters as counter
  where counter.organization_id = new.organization_id
    and counter.reward_id = new.reward_id
  for update;

  per_customer_limit := case
    when target_availability -> 'perCustomerLimit' = 'null'::jsonb then null
    else (target_availability ->> 'perCustomerLimit')::integer
  end;
  if per_customer_limit is not null then
    select count(*)::bigint into member_allocations
    from loyalty_private.reward_capacity_allocations as allocation
    where allocation.organization_id = new.organization_id
      and allocation.reward_id = new.reward_id
      and allocation.wallet_id = new.wallet_id
      and allocation.state in ('allocated', 'consumed');
    if member_allocations >= per_customer_limit then
      raise exception using errcode = '23514',
        message = 'reward per-customer limit reached';
    end if;
  end if;
  global_quantity := case
    when target_availability -> 'globalQuantity' = 'null'::jsonb then null
    else (target_availability ->> 'globalQuantity')::bigint
  end;
  if global_quantity is not null
    and target_counter.allocated_quantity + target_counter.consumed_quantity
      >= global_quantity then
    raise exception using errcode = '23514',
      message = 'reward global quantity exhausted';
  end if;
  points_budget := case
    when target_availability -> 'pointsBudget' = 'null'::jsonb then null
    else (target_availability ->> 'pointsBudget')::bigint
  end;
  if points_budget is not null
    and target_counter.allocated_points + target_counter.consumed_points
      > points_budget - new.cost_points then
    raise exception using errcode = '23514',
      message = 'reward points budget exhausted';
  end if;

  insert into loyalty_private.reward_capacity_allocations (
    organization_id, reward_id, reservation_id, wallet_id, points
  ) values (
    new.organization_id, new.reward_id, new.id, new.wallet_id, new.cost_points
  );
  update loyalty_private.reward_capacity_counters
  set allocated_quantity = allocated_quantity + 1,
      allocated_points = allocated_points + new.cost_points,
      updated_at = clock_timestamp()
  where organization_id = new.organization_id and reward_id = new.reward_id;
  return new;
end;
$$;

create trigger reward_reservations_allocate_capacity_v2
after insert on loyalty.reward_reservations
for each row execute function loyalty_private.allocate_reward_capacity_v2();

create or replace function loyalty_private.resolve_reward_capacity_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_allocation loyalty_private.reward_capacity_allocations%rowtype;
  target_state text;
begin
  if old.state = new.state then
    return new;
  end if;
  select allocation.* into target_allocation
  from loyalty_private.reward_capacity_allocations as allocation
  where allocation.organization_id = new.organization_id
    and allocation.reservation_id = new.id
  for update;
  if not found or target_allocation.state <> 'allocated' then
    return new;
  end if;
  if new.state = 'captured' then
    target_state := 'consumed';
  elsif new.state = 'released' then
    target_state := 'released';
  else
    return new;
  end if;
  update loyalty_private.reward_capacity_allocations
  set state = target_state, updated_at = clock_timestamp()
  where id = target_allocation.id;
  update loyalty_private.reward_capacity_counters
  set allocated_quantity = allocated_quantity - target_allocation.quantity,
      allocated_points = allocated_points - target_allocation.points,
      consumed_quantity = consumed_quantity + case
        when target_state = 'consumed' then target_allocation.quantity else 0 end,
      consumed_points = consumed_points + case
        when target_state = 'consumed' then target_allocation.points else 0 end,
      updated_at = clock_timestamp()
  where organization_id = target_allocation.organization_id
    and reward_id = target_allocation.reward_id;
  return new;
end;
$$;

create trigger reward_reservations_resolve_capacity_v2
after update of state on loyalty.reward_reservations
for each row execute function loyalty_private.resolve_reward_capacity_v2();

create or replace function loyalty_private.enqueue_woocommerce_coupon_issue_v2(
  target_reservation_public_id uuid,
  target_connection_public_id uuid,
  target_currency_minor_unit_digits smallint
)
returns table (command_id uuid, coupon_code text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_reservation loyalty.reward_reservations%rowtype;
  target_connection loyalty.commerce_connections%rowtype;
  target_reward loyalty.programme_rewards%rowtype;
  external_customer_id text;
  created_command_id uuid;
  created_coupon_code text;
  target_restrictions jsonb;
  command_restrictions jsonb;
  reward_payload jsonb;
begin
  if target_currency_minor_unit_digits not between 0 and 6 then
    raise exception using errcode = '22023', message = 'invalid currency minor unit digits';
  end if;
  select reservation.* into target_reservation
  from loyalty.reward_reservations as reservation
  where reservation.public_id = target_reservation_public_id
  for update;
  if not found or target_reservation.state <> 'reserved' then
    raise exception using errcode = '22023', message = 'unknown reserved reward';
  end if;
  select connection.* into target_connection
  from loyalty.commerce_connections as connection
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.programme_group_id = target_reservation.programme_group_id
  where connection.public_id = target_connection_public_id
    and connection.organization_id = target_reservation.organization_id
    and connection.status in ('active', 'rotating');
  if not found then
    raise exception using errcode = '22023',
      message = 'connection is not bound to reward programme';
  end if;
  select reward.* into target_reward
  from loyalty.programme_rewards as reward
  where reward.id = target_reservation.reward_id
    and reward.organization_id = target_reservation.organization_id
    and reward.programme_version_id = target_reservation.programme_version_id;
  if not found
    or target_reward.configuration ->> 'version' <> '2'
    or target_reward.configuration ->> 'fulfilmentMode' <> 'woocommerce_coupon'
    or target_reward.reward_kind not in (
      'fixed_discount', 'percentage_discount', 'free_shipping', 'free_product'
    ) then
    raise exception using errcode = '22023',
      message = 'reward is not a V2 native WooCommerce coupon';
  end if;
  if target_reward.reward_kind in ('fixed_discount', 'percentage_discount')
    and (target_reward.configuration ->> 'currencyMinorUnitDigits')::smallint
      <> target_currency_minor_unit_digits then
    raise exception using errcode = '22023',
      message = 'reward currency precision mismatch';
  end if;
  select pg_catalog.substr(identity.external_customer_id, 12)
  into external_customer_id
  from loyalty.wallets as wallet
  join loyalty.customer_identities as identity
    on identity.organization_id = wallet.organization_id
   and identity.customer_id = wallet.customer_id
   and identity.commerce_connection_id = target_connection.id
   and identity.identity_kind = 'registered'
   and identity.external_customer_id like 'registered:%'
  where wallet.id = target_reservation.wallet_id
    and wallet.organization_id = target_reservation.organization_id
  limit 1;
  if external_customer_id is null or external_customer_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception using errcode = '22023',
      message = 'registered WooCommerce identity required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_reservation.public_id::text || ':woocommerce-coupon',
      target_reservation.organization_id
    )
  );
  select outbox.command_id, outbox.payload ->> 'code'
  into created_command_id, created_coupon_code
  from loyalty_private.transactional_outbox as outbox
  where outbox.organization_id = target_reservation.organization_id
    and outbox.topic = 'woocommerce.coupon.issue'
    and outbox.payload ->> 'reservationId' = target_reservation.public_id::text;
  if found then
    return query select created_command_id, created_coupon_code, 'duplicate'::text;
    return;
  end if;

  target_restrictions := target_reward.configuration -> 'restrictions';
  command_restrictions := target_restrictions || pg_catalog.jsonb_build_object(
    'currencyMinorUnitDigits', target_currency_minor_unit_digits
  );
  reward_payload := case target_reward.reward_kind
    when 'fixed_discount' then pg_catalog.jsonb_build_object(
      'kind', 'fixed_discount',
      'amountMinor', target_reward.configuration ->> 'amountMinor',
      'currencyMinorUnitDigits', target_currency_minor_unit_digits,
      'restrictions', command_restrictions
    )
    when 'percentage_discount' then pg_catalog.jsonb_build_object(
      'kind', 'percentage_discount',
      'percentageBasisPoints',
        (target_reward.configuration ->> 'percentageBasisPoints')::integer,
      'maximumDiscountMinor', null,
      'currencyMinorUnitDigits', target_currency_minor_unit_digits,
      'restrictions', command_restrictions
    )
    when 'free_product' then pg_catalog.jsonb_build_object(
      'kind', 'free_product',
      'productId', target_reward.configuration ->> 'productId',
      'quantity', (target_reward.configuration ->> 'quantity')::integer,
      'restrictions', command_restrictions
    )
    else pg_catalog.jsonb_build_object(
      'kind', 'free_shipping', 'restrictions', command_restrictions
    )
  end;
  created_coupon_code := 'SF' || pg_catalog.upper(
    pg_catalog.encode(extensions.gen_random_bytes(16), 'hex')
  );
  insert into loyalty_private.transactional_outbox (
    organization_id, connection_id, topic, payload_version, payload
  ) values (
    target_reservation.organization_id,
    target_connection.id,
    'woocommerce.coupon.issue',
    'v2',
    pg_catalog.jsonb_build_object(
      'kind', 'issue_coupon',
      'reservationId', target_reservation.public_id,
      'code', created_coupon_code,
      'externalCustomerId', external_customer_id,
      'expiresAt', target_reservation.expires_at,
      'reward', reward_payload
    )
  ) returning transactional_outbox.command_id into created_command_id;
  return query select created_command_id, created_coupon_code, 'created'::text;
end;
$$;

drop function loyalty_private.claim_woocommerce_commands(uuid, integer, integer);

create or replace function loyalty_private.claim_woocommerce_commands(
  target_connection_public_id uuid,
  target_batch_size integer,
  target_lease_seconds integer,
  target_capabilities text[]
)
returns table (
  outbox_id bigint,
  command_id uuid,
  connection_id uuid,
  topic text,
  payload_version text,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_connection_id bigint;
begin
  if target_batch_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid batch size';
  end if;
  if target_lease_seconds not between 10 and 300 then
    raise exception using errcode = '22023', message = 'invalid lease duration';
  end if;
  if coalesce(pg_catalog.array_length(target_capabilities, 1), 0) > 16
    or exists (
      select 1 from unnest(target_capabilities) as capability(value)
      where capability.value <> 'coupon.issue.v2'
    ) then
    raise exception using errcode = '22023', message = 'unsupported connector capability';
  end if;
  select connection.id into target_connection_id
  from loyalty.commerce_connections as connection
  where connection.public_id = target_connection_public_id
    and connection.status in ('active', 'rotating');
  if not found then
    raise exception using errcode = '22023', message = 'unknown commerce connection';
  end if;

  update loyalty_private.transactional_outbox as exhausted
  set state = 'manual_review', lease_owner = null, lease_expires_at = null,
      last_error_code = coalesce(
        exhausted.last_error_code, 'command_attempts_exhausted'
      )
  where exhausted.connection_id = target_connection_id
    and exhausted.topic in (
      'woocommerce.coupon.issue', 'woocommerce.coupon.cancel',
      'woocommerce.order.reconcile'
    )
    and exhausted.attempt_count >= 10
    and (
      exhausted.state = 'retryable'
      or (
        exhausted.state = 'processing'
        and exhausted.lease_expires_at <= clock_timestamp()
      )
    );

  return query
  with candidates as (
    select outbox.id
    from loyalty_private.transactional_outbox as outbox
    where outbox.connection_id = target_connection_id
      and outbox.topic in (
        'woocommerce.coupon.issue', 'woocommerce.coupon.cancel',
        'woocommerce.order.reconcile'
      )
      and (
        outbox.payload_version = 'v1'
        or (
          outbox.topic = 'woocommerce.coupon.issue'
          and outbox.payload_version = 'v2'
          and 'coupon.issue.v2' = any(target_capabilities)
        )
      )
      and outbox.attempt_count < 10
      and (
        (outbox.state in ('pending', 'retryable')
          and outbox.available_at <= clock_timestamp())
        or (outbox.state = 'processing'
          and outbox.lease_expires_at <= clock_timestamp())
      )
    order by outbox.available_at, outbox.id
    for update skip locked
    limit target_batch_size
  ), claimed as (
    update loyalty_private.transactional_outbox as outbox
    set state = 'processing',
        attempt_count = outbox.attempt_count + 1,
        lease_owner = 'woocommerce:' || target_connection_public_id::text,
        lease_expires_at = clock_timestamp()
          + pg_catalog.make_interval(secs => target_lease_seconds),
        last_error_code = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select claimed.id, claimed.command_id, target_connection_public_id,
    claimed.topic, claimed.payload_version, claimed.payload,
    claimed.attempt_count
  from claimed
  order by claimed.id;
end;
$$;

create or replace function loyalty_private.claim_woocommerce_commands(
  target_connection_public_id uuid,
  target_batch_size integer default 25,
  target_lease_seconds integer default 60
)
returns table (
  outbox_id bigint,
  command_id uuid,
  connection_id uuid,
  topic text,
  payload_version text,
  payload jsonb,
  attempt_count integer
)
language sql
security definer
set search_path = ''
as $$
  select *
  from loyalty_private.claim_woocommerce_commands(
    target_connection_public_id,
    target_batch_size,
    target_lease_seconds,
    array[]::text[]
  );
$$;

create or replace function loyalty.redeem_my_reward(
  target_account_public_id uuid,
  target_reward_code text,
  target_request_id uuid
)
returns table (
  reservation_id uuid,
  state text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  customer_scope record;
  target_reward loyalty.programme_rewards%rowtype;
  existing_reservation loyalty.reward_reservations%rowtype;
  request_hash bytea;
  operation_key text;
  reservation_result record;
  ledger_result record;
  transition_result record;
  coupon_result record;
  currency_minor_unit_digits smallint;
  validity_days integer;
  is_v2_native boolean;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501',
      message = 'reward redemption not authorized';
  end if;
  if target_account_public_id is null
    or target_request_id is null
    or target_reward_code is null
    or target_reward_code !~ '^[a-z][a-z0-9_-]{0,79}$' then
    raise exception using errcode = '22023',
      message = 'invalid reward redemption request';
  end if;

  select link.organization_id, link.customer_id,
    connection.public_id as connection_public_id,
    programme_group.id as programme_group_id,
    version.id as programme_version_id,
    wallet.id as wallet_id, wallet.public_id as wallet_public_id,
    (version.configuration ->> 'currencyMinorUnitDigits')::smallint
      as programme_currency_minor_unit_digits
  into customer_scope
  from loyalty.customer_user_links as link
  join loyalty.customers as customer
    on customer.organization_id = link.organization_id
   and customer.id = link.customer_id
   and customer.status = 'active'
  join loyalty.organizations as organization
    on organization.id = link.organization_id
   and organization.status = 'active'
  join loyalty.commerce_connections as connection
    on connection.organization_id = link.organization_id
   and connection.id = link.source_connection_id
   and connection.status in ('active', 'rotating')
  join loyalty.workspaces as workspace
    on workspace.organization_id = connection.organization_id
   and workspace.id = connection.workspace_id
   and workspace.status = 'active'
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = programme.organization_id
   and programme_group.id = programme.programme_group_id
   and programme_group.status = 'active'
  join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = programme_group.organization_id
   and group_workspace.programme_group_id = programme_group.id
   and group_workspace.workspace_id = workspace.id
  join loyalty.programme_versions as version
    on version.organization_id = programme.organization_id
   and version.programme_id = programme.id
   and version.status = 'published'
  join loyalty.wallets as wallet
    on wallet.organization_id = link.organization_id
   and wallet.programme_group_id = programme_group.id
   and wallet.customer_id = customer.id
   and wallet.status = 'active'
  where link.public_id = target_account_public_id
    and link.auth_user_id = actor_user_id
    and link.revoked_at is null;
  if not found then
    raise exception using errcode = '42501',
      message = 'reward redemption not authorized';
  end if;

  request_hash := extensions.digest(
    pg_catalog.convert_to(
      'customer.reward.redeem.v1|' || actor_user_id::text || '|' ||
      target_account_public_id::text || '|' || target_reward_code,
      'UTF8'
    ),
    'sha256'
  );
  operation_key := 'customer-reward:' || target_request_id::text;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(operation_key, customer_scope.organization_id)
  );
  select reservation.* into existing_reservation
  from loyalty.reward_reservations as reservation
  join loyalty.programme_rewards as reward
    on reward.organization_id = reservation.organization_id
   and reward.id = reservation.reward_id
  where reservation.organization_id = customer_scope.organization_id
    and reservation.idempotency_key = operation_key;
  if found then
    if existing_reservation.wallet_id <> customer_scope.wallet_id
      or existing_reservation.request_sha256 <> request_hash
      or not exists (
        select 1 from loyalty.programme_rewards as reward
        where reward.organization_id = existing_reservation.organization_id
          and reward.id = existing_reservation.reward_id
          and reward.code = target_reward_code
      ) then
      raise exception using errcode = '23514',
        message = 'reward redemption request conflict';
    end if;
    return query select existing_reservation.public_id,
      existing_reservation.state, 'duplicate'::text;
    return;
  end if;

  select reward.* into target_reward
  from loyalty.programme_rewards as reward
  where reward.organization_id = customer_scope.organization_id
    and reward.programme_version_id = customer_scope.programme_version_id
    and reward.programme_group_id = customer_scope.programme_group_id
    and reward.code = target_reward_code
    and reward.reward_kind in (
      'fixed_discount', 'percentage_discount', 'free_shipping', 'free_product'
    )
    and (
      reward.configuration ->> 'version' is distinct from '2'
      or reward.configuration ->> 'fulfilmentMode' = 'woocommerce_coupon'
    );
  if not found then
    raise exception using errcode = '22023',
      message = 'reward is not available for self-service redemption';
  end if;
  is_v2_native := target_reward.configuration ->> 'version' = '2';
  if not is_v2_native and target_reward.reward_kind = 'free_product' then
    raise exception using errcode = '22023',
      message = 'reward is not available for self-service redemption';
  end if;
  if target_reward.reward_kind = 'percentage_discount'
    and target_reward.configuration ->> 'maximumDiscountMinor' is not null then
    if not loyalty_private.is_bounded_bigint_text(
      target_reward.configuration ->> 'maximumDiscountMinor'
    ) then
      raise exception using errcode = '22023',
        message = 'invalid reward coupon configuration';
    end if;
    raise exception using errcode = '22023',
      message = 'percentage discount maximum is unsupported';
  end if;

  if is_v2_native then
    currency_minor_unit_digits := customer_scope.programme_currency_minor_unit_digits;
  else
    if coalesce(
      target_reward.configuration ->> 'currencyMinorUnitDigits', '2'
    ) !~ '^[0-6]$' then
      raise exception using errcode = '22023',
        message = 'invalid reward currency configuration';
    end if;
    currency_minor_unit_digits := coalesce(
      (target_reward.configuration ->> 'currencyMinorUnitDigits')::smallint,
      2::smallint
    );
  end if;
  if coalesce(
    target_reward.configuration ->> 'validityDays', '30'
  ) !~ '^[1-9][0-9]{0,2}$'
    or coalesce(
      (target_reward.configuration ->> 'validityDays')::integer, 30
    ) > 365 then
    raise exception using errcode = '22023',
      message = 'invalid reward validity configuration';
  end if;
  validity_days := coalesce(
    (target_reward.configuration ->> 'validityDays')::integer, 30
  );

  select * into reservation_result
  from loyalty_private.create_reward_reservation(
    customer_scope.organization_id,
    customer_scope.programme_group_id,
    customer_scope.programme_version_id,
    customer_scope.wallet_id,
    target_reward.id,
    target_reward.cost_points,
    pg_catalog.transaction_timestamp()
      + pg_catalog.make_interval(days => validity_days),
    operation_key,
    request_hash
  );
  select * into ledger_result
  from loyalty_private.reserve_points(
    customer_scope.organization_id,
    customer_scope.programme_group_id,
    customer_scope.programme_version_id,
    customer_scope.wallet_public_id,
    target_reward.cost_points,
    operation_key || ':ledger',
    request_hash,
    pg_catalog.transaction_timestamp()
  );
  select * into transition_result
  from loyalty_private.transition_reward_reservation(
    reservation_result.reservation_public_id,
    'reserved',
    operation_key || ':reserved',
    request_hash,
    'customer:' || actor_user_id::text,
    null,
    ledger_result.transaction_public_id,
    null
  );
  if is_v2_native then
    select * into coupon_result
    from loyalty_private.enqueue_woocommerce_coupon_issue_v2(
      reservation_result.reservation_public_id,
      customer_scope.connection_public_id,
      currency_minor_unit_digits
    );
  else
    select * into coupon_result
    from loyalty_private.enqueue_woocommerce_coupon_issue(
      reservation_result.reservation_public_id,
      customer_scope.connection_public_id,
      currency_minor_unit_digits
    );
  end if;

  return query select reservation_result.reservation_public_id,
    transition_result.state,
    case
      when reservation_result.outcome = 'created'
        or ledger_result.outcome = 'created'
        or transition_result.outcome = 'created'
        or coupon_result.outcome = 'created'
      then 'created'::text
      else 'duplicate'::text
    end;
end;
$$;

alter function loyalty_private.is_bounded_bigint_text(text, boolean)
  owner to loyalty_owner;
alter function loyalty_private.is_reward_code_array(jsonb) owner to loyalty_owner;
alter function loyalty_private.is_woocommerce_id_array(jsonb) owner to loyalty_owner;
alter function loyalty_private.validate_reward_availability_v2(jsonb, bigint)
  owner to loyalty_owner;
alter function loyalty_private.validate_coupon_restrictions_v2(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.validate_reward_definition_v2(jsonb, smallint)
  owner to loyalty_owner;
alter function loyalty_private.enforce_expanded_reward_contract()
  owner to loyalty_owner;
alter function loyalty_private.allocate_reward_capacity_v2()
  owner to loyalty_owner;
alter function loyalty_private.resolve_reward_capacity_v2()
  owner to loyalty_owner;
alter function loyalty_private.enqueue_woocommerce_coupon_issue_v2(uuid, uuid, smallint)
  owner to loyalty_owner;
alter function loyalty_private.claim_woocommerce_commands(uuid, integer, integer, text[])
  owner to loyalty_owner;
alter function loyalty_private.claim_woocommerce_commands(uuid, integer, integer)
  owner to loyalty_owner;
alter function loyalty.redeem_my_reward(uuid, text, uuid) owner to loyalty_owner;

alter table loyalty_private.reward_capacity_counters enable row level security;
alter table loyalty_private.reward_capacity_allocations enable row level security;

revoke all on loyalty_private.reward_capacity_counters,
  loyalty_private.reward_capacity_allocations
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

revoke all on function
  loyalty_private.is_bounded_bigint_text(text, boolean),
  loyalty_private.is_reward_code_array(jsonb),
  loyalty_private.is_woocommerce_id_array(jsonb),
  loyalty_private.validate_reward_availability_v2(jsonb, bigint),
  loyalty_private.validate_coupon_restrictions_v2(jsonb),
  loyalty_private.validate_reward_definition_v2(jsonb, smallint),
  loyalty_private.enforce_expanded_reward_contract(),
  loyalty_private.allocate_reward_capacity_v2(),
  loyalty_private.resolve_reward_capacity_v2(),
  loyalty_private.enqueue_woocommerce_coupon_issue_v2(uuid, uuid, smallint),
  loyalty_private.claim_woocommerce_commands(uuid, integer, integer, text[]),
  loyalty_private.claim_woocommerce_commands(uuid, integer, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty_private.claim_woocommerce_commands(uuid, integer, integer, text[]),
  loyalty_private.claim_woocommerce_commands(uuid, integer, integer)
  to loyalty_runtime;

revoke all on function loyalty.redeem_my_reward(uuid, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.redeem_my_reward(uuid, text, uuid)
  to authenticated;

comment on table loyalty_private.reward_capacity_allocations is
  'One immutable reservation-scoped allocation record whose state resolves capacity without releasing ambiguous native benefits.';
comment on function loyalty_private.enforce_expanded_reward_contract() is
  'Fail-closed RewardDefinitionV2 validation and database-authoritative rewards.expanded entitlement enforcement.';
comment on function loyalty_private.claim_woocommerce_commands(uuid, integer, integer, text[]) is
  'Leases bounded connector commands only when the polling plugin declares every required payload capability.';
comment on function loyalty_private.enqueue_woocommerce_coupon_issue_v2(uuid, uuid, smallint) is
  'Creates one customer-bound, restricted V2 WooCommerce coupon command after an atomic points and capacity reservation.';
