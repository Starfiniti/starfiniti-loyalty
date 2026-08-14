-- M06 customer referral experience and fact-sourced merchant reporting.

create or replace function loyalty.get_my_referral_experiences_v1()
returns table (
  account_id uuid,
  sharing_state text,
  share_url text,
  advocate_reward_points text,
  friend_reward_points text,
  minimum_eligible_spend_minor text,
  currency_code text,
  currency_minor_unit_digits smallint,
  qualification_status text,
  cooling_days smallint,
  total_count text,
  pending_count text,
  qualified_count text,
  rejected_count text,
  reversed_count text,
  history jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
begin
  if actor_user_id is null then
    return;
  end if;

  return query
  select link.public_id,
    case
      when connection.status not in ('active', 'rotating')
        or not entitlement.enabled then 'paused'
      when advocate.status = 'disabled' then 'disabled'
      when advocate.id is null then 'available'
      else 'active'
    end,
    case
      when connection.status in ('active', 'rotating')
        and entitlement.enabled and advocate.status = 'active'
        then connection.external_store_id || '/?stf_ref=' || advocate.public_id::text
      else null
    end,
    policy.advocate_reward_points::text,
    policy.friend_reward_points::text,
    policy.minimum_eligible_spend_minor::text,
    policy.currency_code,
    policy.currency_minor_unit_digits,
    policy.qualification_status,
    policy.cooling_days,
    coalesce(referral_counts.total_count, 0)::text,
    coalesce(referral_counts.pending_count, 0)::text,
    coalesce(referral_counts.qualified_count, 0)::text,
    coalesce(referral_counts.rejected_count, 0)::text,
    coalesce(referral_counts.reversed_count, 0)::text,
    coalesce(referral_history.items, '[]'::jsonb)
  from loyalty.customer_user_links as link
  join loyalty.customers as customer
    on customer.organization_id = link.organization_id
   and customer.id = link.customer_id
   and customer.status = 'active'
  join loyalty.commerce_connections as connection
    on connection.organization_id = link.organization_id
   and connection.id = link.source_connection_id
  join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = programme.organization_id
   and programme_group.id = programme.programme_group_id
   and programme_group.status = 'active'
  join lateral (
    select referral_policy.*,
      coalesce(version.configuration ->> 'currencyCode', 'EUR')
        as currency_code,
      coalesce((version.configuration ->> 'currencyMinorUnitDigits')::smallint, 2)
        as currency_minor_unit_digits
    from loyalty.programme_versions as version
    join loyalty.programme_referral_policies as referral_policy
      on referral_policy.organization_id = version.organization_id
     and referral_policy.programme_group_id = version.programme_group_id
     and referral_policy.programme_version_id = version.id
    where version.organization_id = programme.organization_id
      and version.programme_id = programme.id
      and version.status = 'published'
    order by version.version_number desc, version.id desc
    limit 1
  ) as policy on true
  join lateral loyalty_private.resolve_organization_entitlement(
    link.organization_id,
    'referrals',
    'programme:' || programme.id::text,
    pg_catalog.transaction_timestamp()
  ) as entitlement on true
  left join loyalty.referral_advocates as advocate
    on advocate.organization_id = link.organization_id
   and advocate.programme_group_id = programme_group.id
   and advocate.customer_id = customer.id
  left join lateral (
    select count(*)::bigint as total_count,
      count(*) filter (
        where current_state.state in ('captured', 'pending_review', 'cooling')
      )::bigint as pending_count,
      count(*) filter (where current_state.state = 'qualified')::bigint
        as qualified_count,
      count(*) filter (where current_state.state in ('blocked', 'rejected'))::bigint
        as rejected_count,
      count(*) filter (where current_state.state = 'reversed')::bigint
        as reversed_count
    from loyalty.referral_attributions as attribution
    join lateral (
      select transition.to_state as state
      from loyalty.referral_attribution_transitions as transition
      where transition.organization_id = attribution.organization_id
        and transition.attribution_id = attribution.id
      order by transition.id desc
      limit 1
    ) as current_state on true
    where attribution.organization_id = link.organization_id
      and attribution.advocate_id = advocate.id
  ) as referral_counts on advocate.id is not null
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'referralId', row.referral_id,
        'state', row.state,
        'rewardPoints', policy.advocate_reward_points::text,
        'capturedAt', row.captured_at,
        'updatedAt', row.updated_at,
        'availableAt', row.available_at
      ) order by row.captured_at desc, row.referral_id
    ) as items
    from (
      select attribution.public_id as referral_id,
        current_state.state,
        attribution.captured_at,
        current_state.updated_at,
        issuance.available_at
      from loyalty.referral_attributions as attribution
      join lateral (
        select transition.to_state as state,
          transition.created_at as updated_at
        from loyalty.referral_attribution_transitions as transition
        where transition.organization_id = attribution.organization_id
          and transition.attribution_id = attribution.id
        order by transition.id desc
        limit 1
      ) as current_state on true
      left join loyalty_private.referral_reward_issuances as issuance
        on issuance.organization_id = attribution.organization_id
       and issuance.attribution_id = attribution.id
      where attribution.organization_id = link.organization_id
        and attribution.advocate_id = advocate.id
      order by attribution.captured_at desc, attribution.id desc
      limit 20
    ) as row
  ) as referral_history on advocate.id is not null
  where link.auth_user_id = actor_user_id
    and link.revoked_at is null
  order by link.id;
end;
$$;

create or replace function loyalty.get_referral_dashboard_v1(
  target_programme_public_id uuid,
  target_lookback_days integer default 30
)
returns table (
  programme_id uuid,
  lookback_days integer,
  generated_at timestamptz,
  totals jsonb,
  top_advocates jsonb,
  recent jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_programme loyalty.programmes%rowtype;
  target_generated_at timestamptz := pg_catalog.transaction_timestamp();
begin
  if target_programme_public_id is null
    or target_lookback_days not between 1 and 365 then
    raise exception using errcode = '22023',
      message = 'invalid referral dashboard filter';
  end if;
  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and loyalty_private.has_organization_role(
      programme.organization_id,
      array['owner', 'admin', 'operator', 'marketer', 'analyst', 'auditor']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'referral dashboard not authorized';
  end if;

  return query
  with scoped_referrals as materialized (
    select attribution.id, attribution.public_id,
      attribution.organization_id, attribution.advocate_id,
      attribution.friend_customer_id, attribution.source_order_id,
      attribution.risk_codes, attribution.captured_at,
      current_state.state, current_state.updated_at
    from loyalty.referral_attributions as attribution
    join lateral (
      select transition.to_state as state,
        transition.created_at as updated_at
      from loyalty.referral_attribution_transitions as transition
      where transition.organization_id = attribution.organization_id
        and transition.attribution_id = attribution.id
      order by transition.id desc
      limit 1
    ) as current_state on true
    where attribution.organization_id = target_programme.organization_id
      and attribution.programme_group_id = target_programme.programme_group_id
      and attribution.captured_at >= target_generated_at
        - pg_catalog.make_interval(days => target_lookback_days)
  ), aggregate_totals as (
    select count(*)::bigint as attributions,
      count(*) filter (
        where referral.state in ('captured', 'pending_review', 'cooling')
      )::bigint as pending,
      count(*) filter (where referral.state = 'qualified')::bigint as qualified,
      count(*) filter (
        where referral.state in ('blocked', 'rejected')
      )::bigint as rejected,
      count(*) filter (where referral.state = 'reversed')::bigint as reversed,
      coalesce(pg_catalog.sum(issuance.advocate_points), 0)::bigint
        as advocate_points_issued,
      coalesce(pg_catalog.sum(issuance.friend_points), 0)::bigint
        as friend_points_issued
    from scoped_referrals as referral
    left join loyalty_private.referral_reward_issuances as issuance
      on issuance.organization_id = referral.organization_id
     and issuance.attribution_id = referral.id
  ), advocate_rows as (
    select advocate_customer.public_id as customer_id,
      coalesce(nullif(btrim(advocate_customer.display_reference), ''),
        'Customer ' || left(advocate_customer.public_id::text, 8)) as reference,
      count(*)::bigint as attributions,
      count(*) filter (where referral.state = 'qualified')::bigint as qualified,
      coalesce(pg_catalog.sum(issuance.advocate_points), 0)::bigint
        as points_issued
    from scoped_referrals as referral
    join loyalty.referral_advocates as advocate
      on advocate.organization_id = referral.organization_id
     and advocate.id = referral.advocate_id
    join loyalty.customers as advocate_customer
      on advocate_customer.organization_id = advocate.organization_id
     and advocate_customer.id = advocate.customer_id
    left join loyalty_private.referral_reward_issuances as issuance
      on issuance.organization_id = referral.organization_id
     and issuance.attribution_id = referral.id
    group by advocate_customer.public_id, advocate_customer.display_reference
    order by qualified desc, attributions desc, advocate_customer.public_id
    limit 10
  ), recent_rows as (
    select referral.public_id as referral_id,
      coalesce(nullif(btrim(advocate_customer.display_reference), ''),
        'Customer ' || left(advocate_customer.public_id::text, 8))
        as advocate_reference,
      coalesce(nullif(btrim(friend_customer.display_reference), ''),
        'Customer ' || left(friend_customer.public_id::text, 8))
        as friend_reference,
      referral.source_order_id, referral.state, referral.risk_codes,
      referral.captured_at, referral.updated_at
    from scoped_referrals as referral
    join loyalty.referral_advocates as advocate
      on advocate.organization_id = referral.organization_id
     and advocate.id = referral.advocate_id
    join loyalty.customers as advocate_customer
      on advocate_customer.organization_id = advocate.organization_id
     and advocate_customer.id = advocate.customer_id
    join loyalty.customers as friend_customer
      on friend_customer.organization_id = referral.organization_id
     and friend_customer.id = referral.friend_customer_id
    order by referral.captured_at desc, referral.id desc
    limit 20
  )
  select target_programme.public_id,
    target_lookback_days,
    target_generated_at,
    pg_catalog.jsonb_build_object(
      'advocates', (
        select count(*)::text
        from loyalty.referral_advocates as advocate
        where advocate.organization_id = target_programme.organization_id
          and advocate.programme_group_id = target_programme.programme_group_id
          and advocate.status = 'active'
      ),
      'attributions', aggregate_totals.attributions::text,
      'pending', aggregate_totals.pending::text,
      'qualified', aggregate_totals.qualified::text,
      'rejected', aggregate_totals.rejected::text,
      'reversed', aggregate_totals.reversed::text,
      'advocatePointsIssued', aggregate_totals.advocate_points_issued::text,
      'friendPointsIssued', aggregate_totals.friend_points_issued::text
    ),
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'customerId', advocate.customer_id,
        'reference', advocate.reference,
        'attributions', advocate.attributions::text,
        'qualified', advocate.qualified::text,
        'pointsIssued', advocate.points_issued::text
      ) order by advocate.qualified desc, advocate.attributions desc, advocate.customer_id)
      from advocate_rows as advocate
    ), '[]'::jsonb),
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'referralId', referral.referral_id,
        'advocateReference', referral.advocate_reference,
        'friendReference', referral.friend_reference,
        'sourceOrderReference', referral.source_order_id,
        'state', referral.state,
        'riskCodes', referral.risk_codes,
        'capturedAt', referral.captured_at,
        'updatedAt', referral.updated_at
      ) order by referral.captured_at desc, referral.referral_id)
      from recent_rows as referral
    ), '[]'::jsonb)
  from aggregate_totals;
end;
$$;

alter function loyalty.get_my_referral_experiences_v1() owner to loyalty_owner;
alter function loyalty.get_referral_dashboard_v1(uuid, integer) owner to loyalty_owner;

revoke all on function loyalty.get_my_referral_experiences_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_referral_dashboard_v1(uuid, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.get_my_referral_experiences_v1()
  to authenticated;
grant execute on function loyalty.get_referral_dashboard_v1(uuid, integer)
  to authenticated;

comment on function loyalty.get_my_referral_experiences_v1() is
  'Auth-derived customer referral policy, sharing state, reconciled counts, and identity-minimized history; no tenant or customer selector is accepted.';
comment on function loyalty.get_referral_dashboard_v1(uuid, integer) is
  'Tenant-derived referral performance from canonical attribution, transition, and issuance facts; fabricated share or click metrics are excluded.';
