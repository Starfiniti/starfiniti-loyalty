-- M05 minimized merchant and customer progression projections. Qualification
-- metrics remain separate from wallet balances and are rebuilt from immutable
-- event-time facts under the currently published advanced policy.

create or replace function loyalty_private.tier_milestone_progress_v1(
  target_organization_id bigint,
  target_programme_version_id bigint,
  target_tier_code text,
  target_threshold_kind text,
  target_operator text,
  target_metrics jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_tier loyalty.programme_tiers%rowtype;
  target_thresholds jsonb;
  target_total integer;
  target_matched integer;
begin
  if target_threshold_kind not in ('entry', 'retention', 'reentry')
    or target_operator not in ('all', 'any') then
    raise exception using errcode = '22023',
      message = 'invalid tier milestone projection request';
  end if;
  select tier.* into strict target_tier
  from loyalty.programme_tiers as tier
  where tier.organization_id = target_organization_id
    and tier.programme_version_id = target_programme_version_id
    and tier.code = target_tier_code;
  select coalesce(jsonb_agg(jsonb_build_object(
      'metric', threshold.metric,
      'activityCodes', to_jsonb(threshold.activity_codes),
      'actual', actual.value::text,
      'minimum', threshold.minimum_value::text,
      'remaining', greatest(threshold.minimum_value - actual.value, 0)::text,
      'matched', actual.value >= threshold.minimum_value
    ) order by threshold.ordinal), '[]'::jsonb),
    count(*)::integer,
    count(*) filter (where actual.value >= threshold.minimum_value)::integer
  into target_thresholds, target_total, target_matched
  from loyalty.programme_tier_thresholds as threshold
  cross join lateral (
    select loyalty_private.tier_threshold_actual_v2(
      target_metrics, threshold.metric, threshold.activity_codes
    ) as value
  ) as actual
  where threshold.organization_id = target_organization_id
    and threshold.programme_version_id = target_programme_version_id
    and threshold.tier_code = target_tier_code
    and threshold.threshold_kind = target_threshold_kind;
  if target_total = 0 then
    raise exception using errcode = '23514',
      message = 'tier milestone has no authoritative thresholds';
  end if;
  return jsonb_build_object(
    'tier', jsonb_build_object('code', target_tier.code, 'name', target_tier.name),
    'thresholdKind', target_threshold_kind,
    'operator', target_operator,
    'matched', case target_operator
      when 'all' then target_matched = target_total
      else target_matched > 0
    end,
    'thresholds', target_thresholds
  );
end;
$$;

create or replace function loyalty_private.build_customer_tier_progress_v1(
  target_organization_id bigint,
  target_programme_group_id bigint,
  target_programme_version_id bigint,
  target_customer_id bigint,
  target_wallet_id bigint,
  target_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_version_public_id uuid;
  snapshot record;
  current_membership loyalty.tier_memberships%rowtype;
  current_decision loyalty.tier_decisions%rowtype;
  current_tier_code text;
  automatic_tier_code text;
  qualified_tier_code text;
  current_ordinal integer := 1;
  current_effective_from timestamptz;
  previously_held text[] := array[]::text[];
  next_level loyalty.programme_tier_policy_levels%rowtype;
  current_level loyalty.programme_tier_policy_levels%rowtype;
  next_kind text;
  next_operator text;
  retention_progress jsonb;
  next_progress jsonb;
  history_items jsonb := '[]'::jsonb;
  current_tier jsonb;
  automatic_tier jsonb;
  qualified_tier jsonb;
  active_override_until timestamptz;
begin
  if target_as_of is null then
    raise exception using errcode = '22023',
      message = 'invalid tier progress instant';
  end if;
  select version.public_id into strict target_version_public_id
  from loyalty.programme_versions as version
  join loyalty.programme_tier_policies as policy
    on policy.organization_id = version.organization_id
   and policy.programme_version_id = version.id
  where version.organization_id = target_organization_id
    and version.programme_group_id = target_programme_group_id
    and version.id = target_programme_version_id
    and version.status = 'published';
  select * into strict snapshot
  from loyalty_private.calculate_tier_metric_snapshot_v2(
    target_organization_id, target_programme_group_id,
    target_programme_version_id, target_customer_id, target_as_of
  );
  if target_wallet_id is not null then
    select membership.* into current_membership
    from loyalty.tier_memberships as membership
    where membership.organization_id = target_organization_id
      and membership.programme_group_id = target_programme_group_id
      and membership.wallet_id = target_wallet_id
      and membership.effective_until is null;
    if found then
      current_tier_code := current_membership.tier_code;
      current_effective_from := current_membership.effective_from;
      select decision.* into strict current_decision
      from loyalty.tier_decisions as decision
      where decision.organization_id = current_membership.organization_id
        and decision.id = current_membership.decision_id;
      qualified_tier_code := current_decision.qualified_tier_code;
      automatic_tier_code := case
        when current_decision.transition = 'manual'
          then coalesce(
            current_decision.explanation ->> 'effectiveTierCode',
            current_membership.tier_code
          )
        else current_membership.tier_code
      end;
    end if;
    select coalesce(array_agg(history.tier_code order by history.tier_code),
      array[]::text[]) into previously_held
    from (
      select distinct membership.tier_code
      from loyalty.tier_memberships as membership
      where membership.organization_id = target_organization_id
        and membership.programme_group_id = target_programme_group_id
        and membership.wallet_id = target_wallet_id
    ) as history;
    select coalesce(jsonb_agg(jsonb_build_object(
      'membershipId', history.public_id,
      'tier', jsonb_build_object('code', history.tier_code, 'name', history.tier_name),
      'transition', history.transition,
      'qualifiedTierCode', history.qualified_tier_code,
      'effectiveFrom', history.effective_from,
      'effectiveUntil', history.effective_until
    ) order by history.effective_from desc, history.id desc), '[]'::jsonb)
    into history_items
    from (
      select membership.id, membership.public_id, membership.tier_code,
        tier.name as tier_name, decision.transition,
        decision.qualified_tier_code, membership.effective_from,
        membership.effective_until
      from loyalty.tier_memberships as membership
      join loyalty.tier_decisions as decision
        on decision.organization_id = membership.organization_id
       and decision.id = membership.decision_id
      join loyalty.programme_tiers as tier
        on tier.organization_id = membership.organization_id
       and tier.programme_version_id = membership.programme_version_id
       and tier.code = membership.tier_code
      where membership.organization_id = target_organization_id
        and membership.programme_group_id = target_programme_group_id
        and membership.wallet_id = target_wallet_id
      order by membership.effective_from desc, membership.id desc
      limit 20
    ) as history;
    select override.expires_at into active_override_until
    from loyalty.tier_manual_overrides as override
    where override.organization_id = target_organization_id
      and override.wallet_id = target_wallet_id
      and override.starts_at <= target_as_of
      and override.expires_at > target_as_of
      and not exists (
        select 1 from loyalty.tier_manual_override_resolutions as resolution
        where resolution.organization_id = override.organization_id
          and resolution.override_id = override.id
      )
    order by override.starts_at desc, override.id desc limit 1;
  end if;
  select level.* into current_level
  from loyalty.programme_tier_policy_levels as level
  where level.organization_id = target_organization_id
    and level.programme_version_id = target_programme_version_id
    and level.tier_code = current_tier_code;
  if found then current_ordinal := current_level.ordinal; end if;
  select level.* into next_level
  from loyalty.programme_tier_policy_levels as level
  where level.organization_id = target_organization_id
    and level.programme_version_id = target_programme_version_id
    and level.ordinal > current_ordinal
  order by level.ordinal limit 1;
  if found then
    next_kind := case when next_level.tier_code = any(previously_held)
      then 'reentry' else 'entry' end;
    next_operator := case next_kind when 'reentry'
      then next_level.reentry_operator else next_level.entry_operator end;
    next_progress := loyalty_private.tier_milestone_progress_v1(
      target_organization_id, target_programme_version_id,
      next_level.tier_code, next_kind, next_operator, snapshot.metrics
    );
  end if;
  if current_level.id is not null and current_level.ordinal > 1 then
    retention_progress := loyalty_private.tier_milestone_progress_v1(
      target_organization_id, target_programme_version_id,
      current_level.tier_code, 'retention',
      current_level.retention_operator, snapshot.metrics
    );
  end if;
  select jsonb_build_object('code', tier.code, 'name', tier.name)
  into current_tier
  from loyalty.programme_tiers as tier
  where tier.organization_id = target_organization_id
    and tier.programme_version_id = target_programme_version_id
    and tier.code = current_tier_code;
  select jsonb_build_object('code', tier.code, 'name', tier.name)
  into automatic_tier
  from loyalty.programme_tiers as tier
  where tier.organization_id = target_organization_id
    and tier.programme_version_id = target_programme_version_id
    and tier.code = automatic_tier_code;
  select jsonb_build_object('code', tier.code, 'name', tier.name)
  into qualified_tier
  from loyalty.programme_tiers as tier
  where tier.organization_id = target_organization_id
    and tier.programme_version_id = target_programme_version_id
    and tier.code = qualified_tier_code;
  return jsonb_build_object(
    'version', '1',
    'programmeVersionId', target_version_public_id,
    'currentTier', current_tier,
    'automaticTier', automatic_tier,
    'qualifiedTier', qualified_tier,
    'transition', current_decision.transition,
    'effectiveFrom', current_effective_from,
    'window', jsonb_build_object(
      'kind', snapshot.window_kind,
      'startsAt', snapshot.window_starts_at,
      'endsAt', snapshot.window_ends_at
    ),
    'metrics', snapshot.metrics,
    'nextMilestone', next_progress,
    'retention', retention_progress,
    'graceUntil', current_decision.grace_until,
    'activeOverrideUntil', active_override_until,
    'history', history_items
  );
end;
$$;

create or replace function loyalty.get_customer_tier_progress_v1(
  target_customer_public_id uuid,
  target_programme_group_public_id uuid,
  target_as_of timestamptz default now()
)
returns table (customer_id uuid, tier_progress jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_customer loyalty.customers%rowtype;
  target_group loyalty.programme_groups%rowtype;
  target_version_id bigint;
  target_wallet_id bigint;
begin
  if target_customer_public_id is null
    or target_programme_group_public_id is null or target_as_of is null then
    raise exception using errcode = '22023',
      message = 'invalid customer tier progress request';
  end if;
  select customer.* into target_customer
  from loyalty.customers as customer
  where customer.public_id = target_customer_public_id
    and customer.status = 'active'
    and loyalty_private.is_organization_member(customer.organization_id);
  if not found then return; end if;
  select programme_group.* into target_group
  from loyalty.programme_groups as programme_group
  where programme_group.organization_id = target_customer.organization_id
    and programme_group.public_id = target_programme_group_public_id
    and programme_group.status = 'active';
  if not found then return; end if;
  select version.id into target_version_id
  from loyalty.programme_versions as version
  join loyalty.programme_tier_policies as policy
    on policy.organization_id = version.organization_id
   and policy.programme_version_id = version.id
  where version.organization_id = target_customer.organization_id
    and version.programme_group_id = target_group.id
    and version.status = 'published'
  order by version.version_number desc, version.id desc limit 1;
  if target_version_id is null then return; end if;
  select wallet.id into target_wallet_id
  from loyalty.wallets as wallet
  where wallet.organization_id = target_customer.organization_id
    and wallet.programme_group_id = target_group.id
    and wallet.customer_id = target_customer.id;
  return query select target_customer.public_id,
    loyalty_private.build_customer_tier_progress_v1(
      target_customer.organization_id, target_group.id, target_version_id,
      target_customer.id, target_wallet_id, target_as_of
    );
end;
$$;

create or replace function loyalty.get_my_tier_progress_v1(
  target_as_of timestamptz default now()
)
returns table (account_id uuid, tier_progress jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := loyalty_private.request_user_id();
begin
  if request_user_id is null then return; end if;
  if target_as_of is null then
    raise exception using errcode = '22023',
      message = 'invalid customer tier progress instant';
  end if;
  return query
  select link.public_id,
    loyalty_private.build_customer_tier_progress_v1(
      link.organization_id, programme.programme_group_id, version.id,
      customer.id, wallet.id, target_as_of
    )
  from loyalty.customer_user_links as link
  join loyalty.customers as customer
    on customer.organization_id = link.organization_id
   and customer.id = link.customer_id and customer.status = 'active'
  join loyalty.commerce_connections as connection
    on connection.organization_id = link.organization_id
   and connection.id = link.source_connection_id
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id and programme.status = 'active'
  join lateral (
    select candidate.id
    from loyalty.programme_versions as candidate
    join loyalty.programme_tier_policies as policy
      on policy.organization_id = candidate.organization_id
     and policy.programme_version_id = candidate.id
    where candidate.organization_id = programme.organization_id
      and candidate.programme_id = programme.id
      and candidate.status = 'published'
    order by candidate.version_number desc, candidate.id desc limit 1
  ) as version on true
  left join loyalty.wallets as wallet
    on wallet.organization_id = link.organization_id
   and wallet.programme_group_id = programme.programme_group_id
   and wallet.customer_id = customer.id
  where link.auth_user_id = request_user_id and link.revoked_at is null;
end;
$$;

create or replace function loyalty.get_programme_tier_performance_v1(
  target_programme_public_id uuid,
  target_as_of timestamptz default now()
)
returns table (tier_performance jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_programme loyalty.programmes%rowtype;
  target_version loyalty.programme_versions%rowtype;
  total_members bigint;
  members_with_tier bigint;
  grace_members bigint;
  manual_members bigint;
  entries bigint;
  upgrades bigint;
  reentries bigint;
  downgrades bigint;
  tier_items jsonb;
begin
  if target_programme_public_id is null or target_as_of is null then
    raise exception using errcode = '22023',
      message = 'invalid tier performance request';
  end if;
  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and programme.status = 'active'
    and loyalty_private.is_organization_member(programme.organization_id);
  if not found then return; end if;
  select version.* into target_version
  from loyalty.programme_versions as version
  where version.organization_id = target_programme.organization_id
    and version.programme_id = target_programme.id
    and version.status = 'published'
  order by version.version_number desc, version.id desc limit 1;
  select count(*)::bigint,
    count(*) filter (where membership.id is not null)::bigint,
    count(*) filter (where decision.transition = 'grace'
      and decision.grace_until > target_as_of)::bigint
  into total_members, members_with_tier, grace_members
  from loyalty.wallets as wallet
  join loyalty.customers as customer
    on customer.organization_id = wallet.organization_id
   and customer.id = wallet.customer_id and customer.status = 'active'
  left join loyalty.tier_memberships as membership
    on membership.organization_id = wallet.organization_id
   and membership.wallet_id = wallet.id and membership.effective_until is null
  left join loyalty.tier_decisions as decision
    on decision.organization_id = membership.organization_id
   and decision.id = membership.decision_id
  where wallet.organization_id = target_programme.organization_id
    and wallet.programme_group_id = target_programme.programme_group_id;
  select count(*)::bigint into manual_members
  from loyalty.tier_manual_overrides as override
  where override.organization_id = target_programme.organization_id
    and override.programme_group_id = target_programme.programme_group_id
    and override.starts_at <= target_as_of and override.expires_at > target_as_of
    and not exists (
      select 1 from loyalty.tier_manual_override_resolutions as resolution
      where resolution.organization_id = override.organization_id
        and resolution.override_id = override.id
    );
  select count(*) filter (where transition = 'entry')::bigint,
    count(*) filter (where transition = 'upgrade')::bigint,
    count(*) filter (where transition = 'reentry')::bigint,
    count(*) filter (where transition = 'downgrade')::bigint
  into entries, upgrades, reentries, downgrades
  from loyalty.tier_decisions as decision
  where decision.organization_id = target_programme.organization_id
    and decision.programme_group_id = target_programme.programme_group_id
    and decision.effective_at > target_as_of - interval '30 days'
    and decision.effective_at <= target_as_of;
  if target_version.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'tier', jsonb_build_object('code', tier.code, 'name', tier.name),
      'ordinal', tier.ordinal,
      'memberCount', coalesce(member.count, 0)::text
    ) order by tier.ordinal), '[]'::jsonb) into tier_items
    from loyalty.programme_tiers as tier
    left join lateral (
      select count(*)::bigint as count
      from loyalty.tier_memberships as membership
      where membership.organization_id = target_programme.organization_id
        and membership.programme_group_id = target_programme.programme_group_id
        and membership.effective_until is null
        and membership.tier_code = tier.code
    ) as member on true
    where tier.organization_id = target_programme.organization_id
      and tier.programme_version_id = target_version.id;
  else tier_items := '[]'::jsonb; end if;
  return query select jsonb_build_object(
    'version', '1', 'asOf', target_as_of,
    'programmeVersionId', target_version.public_id,
    'totalMembers', coalesce(total_members, 0)::text,
    'membersWithTier', coalesce(members_with_tier, 0)::text,
    'inGrace', coalesce(grace_members, 0)::text,
    'activeManualOverrides', coalesce(manual_members, 0)::text,
    'transitions30Days', jsonb_build_object(
      'entries', coalesce(entries, 0)::text,
      'upgrades', coalesce(upgrades, 0)::text,
      'reentries', coalesce(reentries, 0)::text,
      'downgrades', coalesce(downgrades, 0)::text
    ),
    'tiers', tier_items
  );
end;
$$;

alter function loyalty_private.tier_milestone_progress_v1(
  bigint, bigint, text, text, text, jsonb
) owner to loyalty_owner;
alter function loyalty_private.build_customer_tier_progress_v1(
  bigint, bigint, bigint, bigint, bigint, timestamptz
) owner to loyalty_owner;
alter function loyalty.get_customer_tier_progress_v1(uuid, uuid, timestamptz)
  owner to loyalty_owner;
alter function loyalty.get_my_tier_progress_v1(timestamptz)
  owner to loyalty_owner;
alter function loyalty.get_programme_tier_performance_v1(uuid, timestamptz)
  owner to loyalty_owner;

revoke all on function
  loyalty_private.tier_milestone_progress_v1(
    bigint, bigint, text, text, text, jsonb
  ),
  loyalty_private.build_customer_tier_progress_v1(
    bigint, bigint, bigint, bigint, bigint, timestamptz
  ),
  loyalty.get_customer_tier_progress_v1(uuid, uuid, timestamptz),
  loyalty.get_my_tier_progress_v1(timestamptz),
  loyalty.get_programme_tier_performance_v1(uuid, timestamptz)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function
  loyalty.get_customer_tier_progress_v1(uuid, uuid, timestamptz),
  loyalty.get_my_tier_progress_v1(timestamptz),
  loyalty.get_programme_tier_performance_v1(uuid, timestamptz)
  to authenticated;

comment on function loyalty.get_customer_tier_progress_v1(uuid, uuid, timestamptz)
  is 'Returns tenant-authorized exact qualification progress and bounded immutable membership history without private facts or decision evidence.';
comment on function loyalty.get_my_tier_progress_v1(timestamptz)
  is 'Derives customer progression solely from active Auth links and returns no caller-selected tenant or customer scope.';
comment on function loyalty.get_programme_tier_performance_v1(uuid, timestamptz)
  is 'Returns tenant-authorized aggregate tier distribution and movement without customer identities.';
