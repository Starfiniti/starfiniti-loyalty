-- M05 executable tier benefits and independently verified earning multipliers.

create or replace function loyalty_private.validate_tier_benefit_execution_v2(
  target_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_policy jsonb := target_configuration -> 'tierPolicy';
  level_value jsonb;
  reward_code text;
  reward_value jsonb;
begin
  if coalesce(target_configuration ->> 'version', '') <> '2'
    or target_policy is null then
    return;
  end if;
  for level_value in
    select value from pg_catalog.jsonb_array_elements(target_policy -> 'levels')
  loop
    for reward_code in
      select value from pg_catalog.jsonb_array_elements_text(
        level_value -> 'benefits' -> 'rewardCodes'
      )
    loop
      select reward.value into strict reward_value
      from pg_catalog.jsonb_array_elements(target_configuration -> 'rewards')
        as reward(value)
      where reward.value ->> 'code' = reward_code;
      if reward_value -> 'configuration' ->> 'version' <> '2'
        or not coalesce((
          reward_value -> 'configuration' -> 'availability' -> 'tierCodes'
            @> pg_catalog.jsonb_build_array(level_value ->> 'tierCode')
        ), false) then
        raise exception using errcode = '23514',
          message = 'tier benefit reward must be V2 and available to its tier';
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function loyalty_private.enforce_tier_benefit_execution_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform loyalty_private.validate_tier_benefit_execution_v2(new.configuration);
  return new;
end;
$$;

create trigger programme_versions_tier_benefit_execution
before insert or update of status on loyalty.programme_versions
for each row execute function loyalty_private.enforce_tier_benefit_execution_v2();

alter function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) rename to commit_programme_v2_award_live_core;

create or replace function loyalty_private.commit_programme_v2_award(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_canonical_event_id bigint,
  target_customer_id bigint,
  target_subject_reference text,
  target_evaluation_idempotency_key text,
  target_award_idempotency_key text,
  target_input_sha256 bytea,
  target_result_sha256 bytea,
  target_result jsonb,
  target_explanation jsonb,
  target_occurred_at timestamptz,
  target_evaluated_at timestamptz default now()
)
returns table (
  evaluation_public_id uuid,
  transaction_public_id uuid,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_tier_code text;
  expected_multiplier integer := 10000;
  supplied_multiplier text;
  advanced_policy_exists boolean;
  committed record;
begin
  select membership.tier_code into expected_tier_code
  from loyalty.wallets as wallet
  join loyalty.tier_memberships as membership
    on membership.organization_id = wallet.organization_id
   and membership.wallet_id = wallet.id
   and membership.effective_until is null
  where wallet.organization_id = target_organization_id
    and wallet.programme_group_id = target_programme_group_id
    and wallet.customer_id = target_customer_id
    and wallet.status = 'active';
  if expected_tier_code is null then
    select tier.code into strict expected_tier_code
    from loyalty.programme_tiers as tier
    where tier.organization_id = target_organization_id
      and tier.programme_version_id = target_programme_version_id
    order by tier.ordinal
    limit 1;
  end if;
  if target_result ->> 'tierCodeSnapshot' <> expected_tier_code then
    raise exception using errcode = '23514',
      message = 'V2 award tier snapshot does not match current membership';
  end if;
  select exists (
    select 1 from loyalty.programme_tier_policies as policy
    where policy.organization_id = target_organization_id
      and policy.programme_version_id = target_programme_version_id
  ) into advanced_policy_exists;
  supplied_multiplier := target_explanation ->> 'tierMultiplierBasisPoints';
  if supplied_multiplier is null and not advanced_policy_exists then
    supplied_multiplier := '10000';
  end if;
  if coalesce(supplied_multiplier, '') !~ '^[1-9][0-9]{4,5}$' then
    raise exception using errcode = '22023',
      message = 'invalid tier earning multiplier evidence';
  end if;
  if target_result ->> 'source' = 'purchase' then
    select level.earning_multiplier_basis_points into expected_multiplier
    from loyalty.programme_tier_policy_levels as level
    where level.organization_id = target_organization_id
      and level.programme_version_id = target_programme_version_id
      and level.tier_code = expected_tier_code;
    expected_multiplier := coalesce(expected_multiplier, 10000);
  end if;
  if supplied_multiplier::integer <> expected_multiplier then
    raise exception using errcode = '23514',
      message = 'tier earning multiplier does not match published benefit';
  end if;
  select * into strict committed
  from loyalty_private.commit_programme_v2_award_live_core(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_canonical_event_id,
    target_customer_id, target_subject_reference,
    target_evaluation_idempotency_key, target_award_idempotency_key,
    target_input_sha256, target_result_sha256, target_result,
    target_explanation, target_occurred_at, target_evaluated_at
  );
  evaluation_public_id := committed.evaluation_public_id;
  transaction_public_id := committed.transaction_public_id;
  outcome := committed.outcome;
  return next;
end;
$$;

alter function loyalty_private.validate_tier_benefit_execution_v2(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.enforce_tier_benefit_execution_v2()
  owner to loyalty_owner;
alter function loyalty_private.commit_programme_v2_award_live_core(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) owner to loyalty_owner;

revoke all on function
  loyalty_private.validate_tier_benefit_execution_v2(jsonb),
  loyalty_private.enforce_tier_benefit_execution_v2(),
  loyalty_private.commit_programme_v2_award_live_core(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, timestamptz, timestamptz
  ),
  loyalty_private.commit_programme_v2_award(
    bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
    jsonb, jsonb, timestamptz, timestamptz
  ) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) to loyalty_worker;

comment on function loyalty_private.commit_programme_v2_award(
  bigint, bigint, bigint, bigint, bigint, text, text, text, bytea, bytea,
  jsonb, jsonb, timestamptz, timestamptz
) is 'Commits one V2 effect only after the tier snapshot and applied purchase multiplier match the current published policy.';

create table loyalty.tier_manual_overrides (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  customer_id bigint not null,
  wallet_id bigint not null,
  tier_code text not null,
  previous_tier_code text not null,
  decision_id bigint not null,
  actor_user_id uuid not null,
  reason text not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  idempotency_key text not null,
  request_sha256 bytea not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  unique (organization_id, decision_id),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(
      organization_id, programme_group_id, id
    ) on delete restrict,
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, programme_group_id, wallet_id)
    references loyalty.wallets(
      organization_id, programme_group_id, id
    ) on delete restrict,
  foreign key (organization_id, programme_version_id, tier_code)
    references loyalty.programme_tiers(
      organization_id, programme_version_id, code
    ) on delete restrict,
  foreign key (organization_id, programme_version_id, previous_tier_code)
    references loyalty.programme_tiers(
      organization_id, programme_version_id, code
    ) on delete restrict,
  foreign key (organization_id, decision_id)
    references loyalty.tier_decisions(organization_id, id) on delete restrict,
  check (length(reason) between 8 and 500 and reason !~ '[[:cntrl:]]'),
  check (length(idempotency_key) between 1 and 255),
  check (octet_length(request_sha256) = 32),
  check (expires_at > starts_at and expires_at <= starts_at + interval '365 days')
);

create table loyalty.tier_manual_override_resolutions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  override_id bigint not null,
  decision_id bigint not null,
  resolution text not null check (resolution in ('expired', 'revoked')),
  resolved_at timestamptz not null,
  actor_reference text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, override_id),
  foreign key (organization_id, override_id)
    references loyalty.tier_manual_overrides(organization_id, id) on delete restrict,
  foreign key (organization_id, decision_id)
    references loyalty.tier_decisions(organization_id, id) on delete restrict,
  check (length(actor_reference) between 1 and 255),
  check (length(reason) between 8 and 500 and reason !~ '[[:cntrl:]]')
);

create index tier_manual_overrides_due_idx
  on loyalty.tier_manual_overrides (expires_at, organization_id, id);
create index tier_manual_overrides_wallet_idx
  on loyalty.tier_manual_overrides (organization_id, wallet_id, starts_at desc, id desc);

alter table loyalty.tier_manual_overrides owner to loyalty_owner;
alter table loyalty.tier_manual_override_resolutions owner to loyalty_owner;
create trigger tier_manual_overrides_immutable
before update or delete on loyalty.tier_manual_overrides
for each row execute function loyalty_private.reject_immutable_change();
create trigger tier_manual_override_resolutions_immutable
before update or delete on loyalty.tier_manual_override_resolutions
for each row execute function loyalty_private.reject_immutable_change();

alter function loyalty_private.get_tier_qualification_context_v2(
  bigint, bigint, bigint, bigint, timestamptz
) rename to get_tier_qualification_context_v2_live_core;

create or replace function loyalty_private.get_tier_qualification_context_v2(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_customer_id bigint,
  target_evaluated_at timestamptz
)
returns table (
  metrics jsonb,
  current_tier_code text,
  previously_held_tier_codes text[],
  below_threshold_since timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_context record;
  target_wallet_id bigint;
  unresolved_override loyalty.tier_manual_overrides%rowtype;
begin
  select * into strict base_context
  from loyalty_private.get_tier_qualification_context_v2_live_core(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_customer_id, target_evaluated_at
  );
  metrics := base_context.metrics;
  current_tier_code := base_context.current_tier_code;
  previously_held_tier_codes := base_context.previously_held_tier_codes;
  below_threshold_since := base_context.below_threshold_since;

  select wallet.id into target_wallet_id
  from loyalty.wallets as wallet
  where wallet.organization_id = target_organization_id
    and wallet.programme_group_id = target_programme_group_id
    and wallet.customer_id = target_customer_id
    and wallet.status = 'active';
  if target_wallet_id is null then
    return next;
    return;
  end if;

  select override.* into unresolved_override
  from loyalty.tier_manual_overrides as override
  where override.organization_id = target_organization_id
    and override.wallet_id = target_wallet_id
    and override.starts_at <= target_evaluated_at
    and not exists (
      select 1 from loyalty.tier_manual_override_resolutions as resolution
      where resolution.organization_id = override.organization_id
        and resolution.override_id = override.id
        and resolution.resolved_at <= target_evaluated_at
    )
  order by override.starts_at desc, override.id desc
  limit 1;
  if not found then
    return next;
    return;
  end if;

  select coalesce(
      decision.explanation ->> 'effectiveTierCode',
      decision.qualified_tier_code
    ), decision.below_threshold_since
  into current_tier_code, below_threshold_since
  from loyalty.tier_decisions as decision
  where decision.organization_id = target_organization_id
    and decision.wallet_id = target_wallet_id
    and decision.id > unresolved_override.decision_id
    and decision.effective_at <= target_evaluated_at
    and decision.explanation ->> 'version' = '2'
  order by decision.effective_at desc, decision.id desc
  limit 1;
  current_tier_code := coalesce(
    current_tier_code, unresolved_override.previous_tier_code
  );
  if not found then
    select decision.below_threshold_since into below_threshold_since
    from loyalty.tier_decisions as decision
    where decision.organization_id = target_organization_id
      and decision.wallet_id = target_wallet_id
      and decision.id < unresolved_override.decision_id
    order by decision.effective_at desc, decision.id desc
    limit 1;
  end if;
  select coalesce(
    pg_catalog.array_agg(history.tier_code order by history.tier_code),
    array[]::text[]
  ) into previously_held_tier_codes
  from (
    select distinct membership.tier_code
    from loyalty.tier_memberships as membership
    where membership.organization_id = target_organization_id
      and membership.wallet_id = target_wallet_id
      and membership.effective_from < unresolved_override.starts_at
    union
    select distinct coalesce(
      decision.explanation ->> 'effectiveTierCode',
      decision.qualified_tier_code
    )
    from loyalty.tier_decisions as decision
    where decision.organization_id = target_organization_id
      and decision.wallet_id = target_wallet_id
      and decision.explanation ->> 'version' = '2'
      and decision.effective_at <= target_evaluated_at
  ) as history;
  return next;
end;
$$;

alter function loyalty_private.record_tier_decision(
  bigint, bigint, bigint, bigint, text, text, text, bigint,
  timestamptz, timestamptz, timestamptz, text, bytea, jsonb
) rename to record_tier_decision_core;

create or replace function loyalty_private.record_tier_decision(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_wallet_id bigint,
  target_tier_code text,
  target_qualified_tier_code text,
  target_transition text,
  target_rolling_eligible_spend_minor bigint,
  target_below_threshold_since timestamptz,
  target_grace_until timestamptz,
  target_effective_at timestamptz,
  target_idempotency_key text,
  target_request_sha256 bytea,
  target_explanation jsonb
)
returns table (tier_decision_public_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_override loyalty.tier_manual_overrides%rowtype;
  recorded record;
begin
  if target_transition <> 'manual' then
    select override.* into active_override
    from loyalty.tier_manual_overrides as override
    where override.organization_id = target_organization_id
      and override.wallet_id = target_wallet_id
      and override.starts_at <= target_effective_at
      and override.expires_at > target_effective_at
      and not exists (
        select 1 from loyalty.tier_manual_override_resolutions as resolution
        where resolution.organization_id = override.organization_id
          and resolution.override_id = override.id
          and resolution.resolved_at <= target_effective_at
      )
    order by override.starts_at desc, override.id desc
    limit 1;
    if found then
      target_tier_code := active_override.tier_code;
      target_transition := 'manual';
      target_explanation := target_explanation || pg_catalog.jsonb_build_object(
        'activeOverrideId', active_override.public_id,
        'activeOverrideExpiresAt', active_override.expires_at
      );
    end if;
  end if;
  select * into strict recorded
  from loyalty_private.record_tier_decision_core(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_wallet_id, target_tier_code,
    target_qualified_tier_code, target_transition,
    target_rolling_eligible_spend_minor, target_below_threshold_since,
    target_grace_until, target_effective_at, target_idempotency_key,
    target_request_sha256, target_explanation
  );
  return query select recorded.tier_decision_public_id, recorded.outcome;
end;
$$;

create or replace function loyalty.set_customer_tier_override_command(
  target_customer_public_id uuid,
  target_programme_group_public_id uuid,
  target_programme_version_public_id uuid,
  target_tier_code text,
  target_expires_at timestamptz,
  target_reason text,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  override_public_id uuid,
  tier_decision_public_id uuid,
  outcome text,
  effective_tier_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_customer loyalty.customers%rowtype;
  target_group loyalty.programme_groups%rowtype;
  target_version loyalty.programme_versions%rowtype;
  target_wallet_id bigint;
  current_tier_code text;
  qualified_tier_code text;
  current_spend bigint := 0;
  target_now timestamptz := pg_catalog.clock_timestamp();
  normalized_reason text := pg_catalog.btrim(target_reason);
  request_hash bytea;
  existing_override loyalty.tier_manual_overrides%rowtype;
  recorded record;
  target_decision_id bigint;
  created_override_public_id uuid;
begin
  if actor_user_id is null
    or target_customer_public_id is null
    or target_programme_group_public_id is null
    or target_programme_version_public_id is null
    or coalesce(target_tier_code, '') !~ '^[a-z][a-z0-9_-]{0,79}$'
    or target_expires_at is null
    or target_expires_at <= target_now
    or target_expires_at > target_now + interval '365 days'
    or target_reason is null or target_reason <> normalized_reason
    or length(normalized_reason) not between 8 and 500
    or normalized_reason ~ '[[:cntrl:]]'
    or target_idempotency_key is null
    or target_idempotency_key <> pg_catalog.btrim(target_idempotency_key)
    or length(target_idempotency_key) not between 1 and 255
    or target_correlation_id is null then
    raise exception using errcode = '22023',
      message = 'invalid manual tier override command';
  end if;
  select customer.* into target_customer
  from loyalty.customers as customer
  where customer.public_id = target_customer_public_id
    and customer.status = 'active'
    and loyalty_private.has_organization_role(
      customer.organization_id, array['owner', 'admin']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'manual tier override not authorized';
  end if;
  select programme_group.* into strict target_group
  from loyalty.programme_groups as programme_group
  where programme_group.organization_id = target_customer.organization_id
    and programme_group.public_id = target_programme_group_public_id
    and programme_group.status = 'active';
  select version.* into target_version
  from loyalty.programme_versions as version
  where version.organization_id = target_customer.organization_id
    and version.programme_group_id = target_group.id
    and version.public_id = target_programme_version_public_id
    and version.status = 'published'
    and version.configuration ->> 'version' = '2'
    and exists (
      select 1 from loyalty.programme_tier_policy_levels as level
      where level.organization_id = version.organization_id
        and level.programme_version_id = version.id
        and level.tier_code = target_tier_code
    );
  if not found then
    raise exception using errcode = '22023',
      message = 'manual override requires a published advanced tier';
  end if;
  target_wallet_id := loyalty_private.ensure_wallet_accounts(
    target_customer.organization_id, target_group.id, target_customer.id
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tier:' || target_group.id::text || ':' || target_customer.id::text,
      target_customer.organization_id
    )
  );
  request_hash := extensions.digest(pg_catalog.convert_to(
    'tier.override|' || target_customer_public_id::text || '|' ||
    target_programme_group_public_id::text || '|' ||
    target_version.public_id::text || '|' || target_tier_code || '|' ||
    extract(epoch from target_expires_at)::text || '|' || normalized_reason,
    'utf8'
  ), 'sha256');
  select override.* into existing_override
  from loyalty.tier_manual_overrides as override
  where override.organization_id = target_customer.organization_id
    and override.idempotency_key = target_idempotency_key;
  if found then
    if existing_override.request_sha256 <> request_hash then
      raise exception using errcode = '23514',
        message = 'manual tier override idempotency conflict';
    end if;
    select decision.public_id into strict tier_decision_public_id
    from loyalty.tier_decisions as decision
    where decision.organization_id = existing_override.organization_id
      and decision.id = existing_override.decision_id;
    return query select existing_override.public_id,
      tier_decision_public_id, 'duplicate'::text,
      existing_override.tier_code, existing_override.expires_at;
    return;
  end if;
  if exists (
    select 1 from loyalty.tier_manual_overrides as override
    where override.organization_id = target_customer.organization_id
      and override.wallet_id = target_wallet_id
      and not exists (
        select 1 from loyalty.tier_manual_override_resolutions as resolution
        where resolution.organization_id = override.organization_id
          and resolution.override_id = override.id
      )
  ) then
    raise exception using errcode = '23514',
      message = 'customer already has an unresolved tier override';
  end if;
  select membership.tier_code into current_tier_code
  from loyalty.tier_memberships as membership
  where membership.organization_id = target_customer.organization_id
    and membership.wallet_id = target_wallet_id
    and membership.effective_until is null;
  if current_tier_code is null then
    select tier.code into strict current_tier_code
    from loyalty.programme_tiers as tier
    where tier.organization_id = target_customer.organization_id
      and tier.programme_version_id = target_version.id
    order by tier.ordinal limit 1;
  end if;
  select decision.qualified_tier_code,
    decision.rolling_eligible_spend_minor
  into qualified_tier_code, current_spend
  from loyalty.tier_decisions as decision
  where decision.organization_id = target_customer.organization_id
    and decision.wallet_id = target_wallet_id
  order by decision.effective_at desc, decision.id desc limit 1;
  qualified_tier_code := coalesce(qualified_tier_code, current_tier_code);
  select * into strict recorded
  from loyalty_private.record_tier_decision(
    target_customer.organization_id, target_group.id, target_version.id,
    target_wallet_id, target_tier_code, qualified_tier_code, 'manual',
    coalesce(current_spend, 0), null, null, target_now,
    'tier:override:decision:' || target_idempotency_key, request_hash,
    pg_catalog.jsonb_build_object(
      'version', '1', 'kind', 'manual_override',
      'reason', normalized_reason, 'expiresAt', target_expires_at
    )
  );
  select decision.id into strict target_decision_id
  from loyalty.tier_decisions as decision
  where decision.organization_id = target_customer.organization_id
    and decision.public_id = recorded.tier_decision_public_id;
  insert into loyalty.tier_manual_overrides (
    organization_id, programme_group_id, programme_version_id,
    customer_id, wallet_id, tier_code, previous_tier_code, decision_id,
    actor_user_id, reason, starts_at, expires_at, idempotency_key,
    request_sha256, correlation_id
  ) values (
    target_customer.organization_id, target_group.id, target_version.id,
    target_customer.id, target_wallet_id, target_tier_code,
    current_tier_code, target_decision_id, actor_user_id,
    normalized_reason, target_now, target_expires_at,
    target_idempotency_key, request_hash, target_correlation_id
  ) returning public_id into created_override_public_id;
  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256,
    correlation_id, metadata
  ) values (
    target_customer.organization_id, actor_user_id,
    'customer.tier.override', 'tier_manual_override',
    created_override_public_id, target_idempotency_key, request_hash,
    target_correlation_id, pg_catalog.jsonb_build_object(
      'customerPublicId', target_customer_public_id,
      'programmeGroupPublicId', target_programme_group_public_id,
      'programmeVersionPublicId', target_version.public_id,
      'tierCode', target_tier_code, 'expiresAt', target_expires_at,
      'reason', normalized_reason
    )
  );
  return query select created_override_public_id,
    recorded.tier_decision_public_id, 'created'::text,
    target_tier_code, target_expires_at;
end;
$$;

create or replace function loyalty_private.expire_due_tier_overrides_v1(
  target_as_of timestamptz default now(),
  target_limit integer default 50
)
returns table (expired_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_override loyalty.tier_manual_overrides%rowtype;
  target_tier_code text;
  target_qualified_tier_code text;
  target_spend bigint;
  current_membership loyalty.tier_memberships%rowtype;
  recorded record;
  target_decision_id bigint;
  request_hash bytea;
  completed integer := 0;
begin
  if target_as_of is null or target_limit is null
    or target_limit not between 1 and 200 then
    raise exception using errcode = '22023',
      message = 'invalid tier override expiry sweep';
  end if;
  for target_override in
    select override.* from loyalty.tier_manual_overrides as override
    where override.expires_at <= target_as_of
      and not exists (
        select 1 from loyalty.tier_manual_override_resolutions as resolution
        where resolution.organization_id = override.organization_id
          and resolution.override_id = override.id
      )
    order by override.expires_at, override.id
    for update skip locked limit target_limit
  loop
    select membership.* into current_membership
    from loyalty.tier_memberships as membership
    where membership.organization_id = target_override.organization_id
      and membership.wallet_id = target_override.wallet_id
      and membership.effective_until is null for update;
    select coalesce(
        decision.explanation ->> 'effectiveTierCode',
        decision.qualified_tier_code
      ), decision.qualified_tier_code,
      decision.rolling_eligible_spend_minor
    into target_tier_code, target_qualified_tier_code, target_spend
    from loyalty.tier_decisions as decision
    where decision.organization_id = target_override.organization_id
      and decision.wallet_id = target_override.wallet_id
      and decision.id > target_override.decision_id
      and decision.effective_at <= target_as_of
      and decision.explanation ->> 'version' = '2'
    order by decision.effective_at desc, decision.id desc limit 1;
    target_tier_code := coalesce(
      target_tier_code, target_override.previous_tier_code
    );
    target_qualified_tier_code := coalesce(
      target_qualified_tier_code, target_tier_code
    );
    request_hash := extensions.digest(pg_catalog.convert_to(
      'tier.override.expire|' || target_override.public_id::text || '|' ||
      extract(epoch from target_override.expires_at)::text || '|' ||
      target_tier_code,
      'utf8'
    ), 'sha256');
    if current_membership.tier_code = target_override.tier_code then
      select * into strict recorded
      from loyalty_private.record_tier_decision(
        target_override.organization_id, target_override.programme_group_id,
        target_override.programme_version_id, target_override.wallet_id,
        target_tier_code, target_qualified_tier_code, 'manual',
        coalesce(target_spend, 0), null, null,
        greatest(target_as_of, current_membership.effective_from + interval '1 microsecond'),
        'tier:override:expire:' || target_override.public_id::text,
        request_hash, pg_catalog.jsonb_build_object(
          'version', '1', 'kind', 'manual_override_expired',
          'overrideId', target_override.public_id
        )
      );
      select decision.id into strict target_decision_id
      from loyalty.tier_decisions as decision
      where decision.organization_id = target_override.organization_id
        and decision.public_id = recorded.tier_decision_public_id;
    else
      target_decision_id := current_membership.decision_id;
    end if;
    insert into loyalty.tier_manual_override_resolutions (
      organization_id, override_id, decision_id, resolution,
      resolved_at, actor_reference, reason
    ) values (
      target_override.organization_id, target_override.id,
      target_decision_id, 'expired', target_as_of,
      'worker:tier-override-expiry', 'Scheduled tier override expiry'
    );
    completed := completed + 1;
  end loop;
  return query select completed;
end;
$$;

alter function loyalty_private.record_tier_decision_core(
  bigint, bigint, bigint, bigint, text, text, text, bigint,
  timestamptz, timestamptz, timestamptz, text, bytea, jsonb
) owner to loyalty_owner;
alter function loyalty_private.get_tier_qualification_context_v2_live_core(
  bigint, bigint, bigint, bigint, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.get_tier_qualification_context_v2(
  bigint, bigint, bigint, bigint, timestamptz
) owner to loyalty_owner;
alter function loyalty_private.record_tier_decision(
  bigint, bigint, bigint, bigint, text, text, text, bigint,
  timestamptz, timestamptz, timestamptz, text, bytea, jsonb
) owner to loyalty_owner;
alter function loyalty.set_customer_tier_override_command(
  uuid, uuid, uuid, text, timestamptz, text, text, uuid
) owner to loyalty_owner;
alter function loyalty_private.expire_due_tier_overrides_v1(timestamptz, integer)
  owner to loyalty_owner;

alter table loyalty.tier_manual_overrides enable row level security;
alter table loyalty.tier_manual_override_resolutions enable row level security;
create policy tier_manual_overrides_member_select
  on loyalty.tier_manual_overrides for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));
create policy tier_manual_override_resolutions_member_select
  on loyalty.tier_manual_override_resolutions for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));
grant select on loyalty.tier_manual_overrides,
  loyalty.tier_manual_override_resolutions to authenticated;

revoke all on function loyalty_private.record_tier_decision_core(
    bigint, bigint, bigint, bigint, text, text, text, bigint,
    timestamptz, timestamptz, timestamptz, text, bytea, jsonb
  ),
  loyalty_private.record_tier_decision(
    bigint, bigint, bigint, bigint, text, text, text, bigint,
    timestamptz, timestamptz, timestamptz, text, bytea, jsonb
  ),
  loyalty_private.get_tier_qualification_context_v2_live_core(
    bigint, bigint, bigint, bigint, timestamptz
  ),
  loyalty_private.get_tier_qualification_context_v2(
    bigint, bigint, bigint, bigint, timestamptz
  ),
  loyalty.set_customer_tier_override_command(
    uuid, uuid, uuid, text, timestamptz, text, text, uuid
  ),
  loyalty_private.expire_due_tier_overrides_v1(timestamptz, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.set_customer_tier_override_command(
  uuid, uuid, uuid, text, timestamptz, text, text, uuid
) to authenticated;
grant execute on function loyalty_private.get_tier_qualification_context_v2(
  bigint, bigint, bigint, bigint, timestamptz
) to loyalty_worker;
grant execute on function loyalty_private.expire_due_tier_overrides_v1(
  timestamptz, integer
) to loyalty_worker;

comment on table loyalty.tier_manual_overrides is
  'Immutable owner/admin grants that pin only effective tier membership until a bounded expiry.';
comment on function loyalty.set_customer_tier_override_command(
  uuid, uuid, uuid, text, timestamptz, text, text, uuid
) is 'Creates one future-expiring reason-bound tier override while deriving tenant customer wallet and published tier authority.';
