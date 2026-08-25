-- M10-S02A: currency-safe member and commerce performance. V2 qualification
-- facts are authoritative; immutable V1 evaluations are normalized only for
-- legacy programme versions so one order can never enter both source paths.

create index tier_qualification_facts_analytics_period_idx
  on loyalty_private.tier_qualification_facts (
    organization_id, programme_group_id, effective_at, recorded_at, id
  ) include (
    source_programme_version_id, customer_id, canonical_event_id, origin_fact_id,
    fact_kind, eligible_spend_minor_delta, order_count_delta,
    referral_count_delta, verified_action_count_delta
  );

create or replace function loyalty.get_analytics_commerce_performance_v1(
  target_organization_public_id uuid,
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_days integer,
  target_as_of timestamptz default now()
)
returns table (
  report_version text,
  dictionary_version text,
  report_as_of timestamptz,
  period_from timestamptz,
  period_to timestamptz,
  range_days integer,
  currency_status text,
  currency_code text,
  currency_minor_unit_digits integer,
  currency_reason text,
  members_total text,
  activation_window_days integer,
  activation_cohort_from timestamptz,
  activation_cohort_to timestamptz,
  activation_cohort_members text,
  activated_members text,
  activation_rate_basis_points text,
  participating_members text,
  participation_rate_basis_points text,
  net_eligible_orders text,
  purchasing_members text,
  repeat_purchasing_members text,
  repeat_purchase_rate_basis_points text,
  net_eligible_spend_minor text,
  average_order_value_minor text,
  observed_lifetime_eligible_spend_minor text,
  observed_lifetime_purchasing_members text,
  observed_lifetime_value_minor text,
  coverage_status text,
  v1_net_eligible_orders text,
  v2_net_eligible_orders text,
  guest_net_eligible_orders text,
  missing_customer_link_orders text,
  missing_customer_link_spend_minor text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_organization_id bigint;
  selected_programme_group_id bigint;
  analytics_enabled boolean;
  selected_period_from timestamptz;
  activation_window constant interval := interval '30 days';
begin
  if target_organization_public_id is null
    or target_workspace_public_id is null
    or target_programme_group_public_id is null
    or target_days is null
    or target_days not in (7, 30, 90)
    or target_as_of is null
    or not pg_catalog.isfinite(target_as_of) then
    raise exception using
      errcode = '22023',
      message = 'invalid analytics commerce performance request';
  end if;

  select organization.id, programme_group.id
  into selected_organization_id, selected_programme_group_id
  from loyalty.organizations as organization
  join loyalty.workspaces as workspace
    on workspace.organization_id = organization.id
   and workspace.public_id = target_workspace_public_id
   and workspace.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = organization.id
   and programme_group.public_id = target_programme_group_public_id
   and programme_group.status = 'active'
  join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = organization.id
   and group_workspace.programme_group_id = programme_group.id
   and group_workspace.workspace_id = workspace.id
  where organization.public_id = target_organization_public_id
    and organization.status = 'active'
    and loyalty_private.is_organization_member(organization.id);

  if not found then
    return;
  end if;

  select entitlement.enabled
  into analytics_enabled
  from loyalty_private.resolve_organization_entitlement(
    selected_organization_id,
    'analytics',
    target_organization_public_id::text,
    now()
  ) as entitlement;

  if not coalesce(analytics_enabled, false) then
    raise exception using
      errcode = '42501',
      message = 'analytics capability disabled';
  end if;

  selected_period_from := target_as_of - target_days * interval '1 day';

  -- Legacy V1 remains readable, but malformed immutable evidence must stop the
  -- report rather than becoming a zero or changing a denominator silently.
  if exists (
    select 1
    from loyalty_private.programme_evaluations as evaluation
    join loyalty.programme_versions as version
      on version.organization_id = evaluation.organization_id
     and version.id = evaluation.programme_version_id
    where evaluation.organization_id = selected_organization_id
      and evaluation.programme_group_id = selected_programme_group_id
      and evaluation.evaluation_kind = 'live_award'
      and coalesce(version.configuration ->> 'version', '1') = '1'
      and evaluation.evaluated_at < target_as_of
      and (
        coalesce(evaluation.result ->> 'eligibleSpendMinor', '')
          !~ '^(0|[1-9][0-9]{0,30})$'
        or coalesce(version.configuration ->> 'currencyCode', '')
          !~ '^[A-Z]{3}$'
        or coalesce(version.configuration ->> 'minorUnitsPerMajor', '')
          !~ '^(1|10|100|1000|10000|100000|1000000)$'
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'analytics legacy award evidence invalid';
  end if;

  if exists (
    with refund_context as (
      select refund.id, refund.evaluated_at,
        (refund.result ->> 'cumulativeRefundedEligibleSpendMinor')::numeric
          as cumulative_refunded,
        (refund.result ->> 'originalEligibleSpendMinor')::numeric
          as stated_original,
        (original.result ->> 'eligibleSpendMinor')::numeric
          as original_eligible,
        pg_catalog.lag(
          (refund.result ->> 'cumulativeRefundedEligibleSpendMinor')::numeric,
          1,
          0::numeric
        ) over (
          partition by original.id order by refund.evaluated_at, refund.id
        ) as prior_refunded
      from loyalty_private.programme_evaluations as refund
      join loyalty.programme_versions as version
        on version.organization_id = refund.organization_id
       and version.id = refund.programme_version_id
      join loyalty_private.canonical_commerce_events as refund_event
        on refund_event.organization_id = refund.organization_id
       and refund_event.id = refund.canonical_event_id
      join loyalty_private.programme_evaluations as original
        on original.organization_id = refund.organization_id
       and original.programme_group_id = refund.programme_group_id
       and original.programme_version_id = refund.programme_version_id
       and original.evaluation_kind = 'live_award'
       and original.subject_reference =
         'woocommerce:order:' || (refund.result ->> 'orderId')
      join loyalty_private.canonical_commerce_events as original_event
        on original_event.organization_id = original.organization_id
       and original_event.id = original.canonical_event_id
       and original_event.connection_id = refund_event.connection_id
      where refund.organization_id = selected_organization_id
        and refund.programme_group_id = selected_programme_group_id
        and refund.evaluation_kind = 'live_refund'
        and coalesce(version.configuration ->> 'version', '1') = '1'
        and refund.evaluated_at < target_as_of
        and coalesce(refund.result ->> 'orderId', '') <> ''
        and coalesce(
          refund.result ->> 'cumulativeRefundedEligibleSpendMinor', ''
        ) ~ '^(0|[1-9][0-9]{0,30})$'
        and coalesce(refund.result ->> 'originalEligibleSpendMinor', '')
          ~ '^(0|[1-9][0-9]{0,30})$'
        and coalesce(original.result ->> 'eligibleSpendMinor', '')
          ~ '^(0|[1-9][0-9]{0,30})$'
    ), invalid_shape as (
      select refund.id
      from loyalty_private.programme_evaluations as refund
      join loyalty.programme_versions as version
        on version.organization_id = refund.organization_id
       and version.id = refund.programme_version_id
      where refund.organization_id = selected_organization_id
        and refund.programme_group_id = selected_programme_group_id
        and refund.evaluation_kind = 'live_refund'
        and coalesce(version.configuration ->> 'version', '1') = '1'
        and refund.evaluated_at < target_as_of
        and (
          coalesce(refund.result ->> 'orderId', '') = ''
          or coalesce(
            refund.result ->> 'cumulativeRefundedEligibleSpendMinor', ''
          ) !~ '^(0|[1-9][0-9]{0,30})$'
          or coalesce(refund.result ->> 'originalEligibleSpendMinor', '')
            !~ '^(0|[1-9][0-9]{0,30})$'
          or (
            select count(*)
            from loyalty_private.programme_evaluations as original
            join loyalty_private.canonical_commerce_events as original_event
              on original_event.organization_id = original.organization_id
             and original_event.id = original.canonical_event_id
            join loyalty_private.canonical_commerce_events as refund_event
              on refund_event.organization_id = refund.organization_id
             and refund_event.id = refund.canonical_event_id
            where original.organization_id = refund.organization_id
              and original.programme_group_id = refund.programme_group_id
              and original.programme_version_id = refund.programme_version_id
              and original.evaluation_kind = 'live_award'
              and original.subject_reference =
                'woocommerce:order:' || (refund.result ->> 'orderId')
              and original_event.connection_id = refund_event.connection_id
          ) <> 1
        )
    )
    select 1 from invalid_shape
    union all
    select 1
    from refund_context
    where cumulative_refunded < prior_refunded
      or cumulative_refunded > original_eligible
      or stated_original <> original_eligible
  ) then
    raise exception using
      errcode = '55000',
      message = 'analytics legacy refund evidence invalid';
  end if;

  return query
  with scoped_versions as materialized (
    select version.id,
      coalesce(version.configuration ->> 'version', '1') as definition_version,
      case
        when version.configuration ->> 'currencyCode' ~ '^[A-Z]{3}$'
          then version.configuration ->> 'currencyCode'
        else null
      end as currency_code,
      case
        when version.configuration ->> 'version' = '2'
          and version.configuration ->> 'currencyMinorUnitDigits' ~ '^[0-6]$'
          then (version.configuration ->> 'currencyMinorUnitDigits')::integer
        when coalesce(version.configuration ->> 'version', '1') = '1'
          then case version.configuration ->> 'minorUnitsPerMajor'
            when '1' then 0 when '10' then 1 when '100' then 2
            when '1000' then 3 when '10000' then 4
            when '100000' then 5 when '1000000' then 6 else null
          end
        else null
      end as minor_unit_digits,
      version.status, version.published_at
    from loyalty.programme_versions as version
    where version.organization_id = selected_organization_id
      and version.programme_group_id = selected_programme_group_id
  ), v2_facts as materialized (
    select 2 as source_version,
      fact.source_programme_version_id as programme_version_id,
      fact.customer_id,
      original_event.payload -> 'order' -> 'customer' ->> 'kind'
        as customer_kind,
      fact.fact_kind,
      fact.eligible_spend_minor_delta::numeric as eligible_spend_delta,
      fact.order_count_delta::numeric as order_count_delta,
      fact.referral_count_delta::numeric as referral_count_delta,
      fact.verified_action_count_delta::numeric as verified_action_count_delta,
      fact.effective_at, fact.recorded_at
    from loyalty_private.tier_qualification_facts as fact
    left join loyalty_private.tier_qualification_facts as origin
      on origin.organization_id = fact.organization_id
     and origin.id = fact.origin_fact_id
    join loyalty_private.canonical_commerce_events as original_event
      on original_event.organization_id = fact.organization_id
     and original_event.id = coalesce(
       origin.canonical_event_id, fact.canonical_event_id
     )
    where fact.organization_id = selected_organization_id
      and fact.programme_group_id = selected_programme_group_id
      and fact.effective_at < target_as_of
      and fact.recorded_at < target_as_of
      and fact.fact_kind in (
        'purchase', 'refund', 'referral', 'referral_reversal',
        'verified_action'
      )
  ), v1_awards as materialized (
    select 1 as source_version,
      evaluation.programme_version_id,
      identity.customer_id,
      event.payload -> 'order' -> 'customer' ->> 'kind' as customer_kind,
      'purchase'::text as fact_kind,
      (evaluation.result ->> 'eligibleSpendMinor')::numeric
        as eligible_spend_delta,
      1::numeric as order_count_delta,
      0::numeric as referral_count_delta,
      0::numeric as verified_action_count_delta,
      event.occurred_at as effective_at,
      evaluation.evaluated_at as recorded_at
    from loyalty_private.programme_evaluations as evaluation
    join scoped_versions as version
      on version.id = evaluation.programme_version_id
     and version.definition_version = '1'
    join loyalty_private.canonical_commerce_events as event
      on event.organization_id = evaluation.organization_id
     and event.id = evaluation.canonical_event_id
    left join loyalty.customer_identities as identity
      on identity.organization_id = event.organization_id
     and identity.commerce_connection_id = event.connection_id
     and identity.identity_kind =
       event.payload -> 'order' -> 'customer' ->> 'kind'
     and identity.external_customer_id = case
       when event.payload -> 'order' -> 'customer' ->> 'kind' = 'registered'
         then 'registered:' || coalesce(
           event.payload -> 'order' -> 'customer' ->> 'externalCustomerId', ''
         )
       when event.payload -> 'order' -> 'customer' ->> 'kind' = 'guest'
         then 'guest-order:' || coalesce(
           event.payload -> 'order' -> 'customer' ->> 'guestOrderId', ''
         )
       else null
     end
    where evaluation.organization_id = selected_organization_id
      and evaluation.programme_group_id = selected_programme_group_id
      and evaluation.evaluation_kind = 'live_award'
      and event.occurred_at < target_as_of
      and evaluation.evaluated_at < target_as_of
  ), v1_refund_context as materialized (
    select refund.programme_version_id,
      identity.customer_id,
      original_event.payload -> 'order' -> 'customer' ->> 'kind'
        as customer_kind,
      (refund.result ->> 'cumulativeRefundedEligibleSpendMinor')::numeric
        as cumulative_refunded,
      pg_catalog.lag(
        (refund.result ->> 'cumulativeRefundedEligibleSpendMinor')::numeric,
        1,
        0::numeric
      ) over (
        partition by original.id order by refund.evaluated_at, refund.id
      ) as prior_refunded,
      (original.result ->> 'eligibleSpendMinor')::numeric as original_eligible,
      original_event.occurred_at as effective_at,
      refund.evaluated_at as recorded_at
    from loyalty_private.programme_evaluations as refund
    join scoped_versions as version
      on version.id = refund.programme_version_id
     and version.definition_version = '1'
    join loyalty_private.canonical_commerce_events as refund_event
      on refund_event.organization_id = refund.organization_id
     and refund_event.id = refund.canonical_event_id
    join loyalty_private.programme_evaluations as original
      on original.organization_id = refund.organization_id
     and original.programme_group_id = refund.programme_group_id
     and original.programme_version_id = refund.programme_version_id
     and original.evaluation_kind = 'live_award'
     and original.subject_reference =
       'woocommerce:order:' || (refund.result ->> 'orderId')
    join loyalty_private.canonical_commerce_events as original_event
      on original_event.organization_id = original.organization_id
     and original_event.id = original.canonical_event_id
     and original_event.connection_id = refund_event.connection_id
    left join loyalty.customer_identities as identity
      on identity.organization_id = original_event.organization_id
     and identity.commerce_connection_id = original_event.connection_id
     and identity.identity_kind =
       original_event.payload -> 'order' -> 'customer' ->> 'kind'
     and identity.external_customer_id = case
       when original_event.payload -> 'order' -> 'customer' ->> 'kind' = 'registered'
         then 'registered:' || coalesce(
           original_event.payload -> 'order' -> 'customer'
             ->> 'externalCustomerId', ''
         )
       when original_event.payload -> 'order' -> 'customer' ->> 'kind' = 'guest'
         then 'guest-order:' || coalesce(
           original_event.payload -> 'order' -> 'customer' ->> 'guestOrderId', ''
         )
       else null
     end
    where refund.organization_id = selected_organization_id
      and refund.programme_group_id = selected_programme_group_id
      and refund.evaluation_kind = 'live_refund'
      and original_event.occurred_at < target_as_of
      and refund.evaluated_at < target_as_of
  ), v1_refunds as materialized (
    select 1 as source_version, programme_version_id, customer_id,
      customer_kind, 'refund'::text as fact_kind,
      -(cumulative_refunded - prior_refunded) as eligible_spend_delta,
      case when cumulative_refunded = original_eligible
          and prior_refunded < original_eligible
        then -1::numeric else 0::numeric end as order_count_delta,
      0::numeric as referral_count_delta,
      0::numeric as verified_action_count_delta,
      effective_at, recorded_at
    from v1_refund_context
  ), normalized_facts as materialized (
    select * from v2_facts
    union all select * from v1_awards
    union all select * from v1_refunds
  ), scoped_wallets as materialized (
    select wallet.id, wallet.customer_id, wallet.created_at
    from loyalty.wallets as wallet
    where wallet.organization_id = selected_organization_id
      and wallet.programme_group_id = selected_programme_group_id
      and wallet.created_at < target_as_of
  ), member_total as (
    select count(*)::numeric as member_count from scoped_wallets
  ), activation_cohort as materialized (
    select wallet.id
    from scoped_wallets as wallet
    where wallet.created_at >= selected_period_from - activation_window
      and wallet.created_at < target_as_of - activation_window
  ), activation as (
    select count(*)::numeric as cohort_count,
      count(*) filter (
        where exists (
          select 1
          from loyalty.point_lots as lot
          join loyalty.ledger_entries as credit_entry
            on credit_entry.organization_id = lot.organization_id
           and credit_entry.id = lot.credit_entry_id
          join loyalty.ledger_transactions as transaction
            on transaction.organization_id = credit_entry.organization_id
           and transaction.id = credit_entry.transaction_id
           and transaction.transaction_kind = 'release'
          join scoped_wallets as cohort_wallet
            on cohort_wallet.id = lot.wallet_id
          where lot.organization_id = selected_organization_id
            and lot.programme_group_id = selected_programme_group_id
            and lot.wallet_id = cohort.id
            and lot.available_at >= cohort_wallet.created_at
            and lot.available_at <= cohort_wallet.created_at + activation_window
            and lot.created_at < target_as_of
            and transaction.created_at < target_as_of
        )
      )::numeric as activated_count
    from activation_cohort as cohort
  ), period_facts as materialized (
    select *
    from normalized_facts as fact
    where fact.effective_at >= selected_period_from
      and fact.effective_at < target_as_of
  ), fact_participation as (
    select fact.customer_id
    from period_facts as fact
    where fact.customer_id is not null
    group by fact.customer_id
    having sum(fact.order_count_delta) > 0
      or sum(fact.referral_count_delta) > 0
      or sum(fact.verified_action_count_delta) > 0
  ), capture_participation as (
    select distinct wallet.customer_id
    from loyalty.ledger_transactions as transaction
    join loyalty.ledger_entries as entry
      on entry.organization_id = transaction.organization_id
     and entry.transaction_id = transaction.id
     and entry.points > 0
    join loyalty.ledger_accounts as account
      on account.organization_id = entry.organization_id
     and account.id = entry.account_id
     and account.account_kind = 'spent'
    join scoped_wallets as wallet on wallet.id = account.wallet_id
    where transaction.organization_id = selected_organization_id
      and transaction.programme_group_id = selected_programme_group_id
      and transaction.transaction_kind = 'capture'
      and transaction.effective_at >= selected_period_from
      and transaction.effective_at < target_as_of
      and transaction.created_at < target_as_of
  ), participants as (
    select customer_id from fact_participation
    union
    select customer_id from capture_participation
  ), participant_total as (
    select count(*)::numeric as participant_count
    from participants as participant
    join scoped_wallets as wallet
      on wallet.customer_id = participant.customer_id
  ), commerce_period_facts as materialized (
    select * from period_facts
    where fact_kind in ('purchase', 'refund')
  ), commerce_totals as (
    select coalesce(sum(order_count_delta), 0::numeric) as net_orders,
      coalesce(sum(eligible_spend_delta), 0::numeric) as net_spend,
      coalesce(sum(order_count_delta) filter (
        where source_version = 1
      ), 0::numeric) as v1_net_orders,
      coalesce(sum(order_count_delta) filter (
        where source_version = 2
      ), 0::numeric) as v2_net_orders,
      coalesce(sum(order_count_delta) filter (
        where customer_kind = 'guest'
      ), 0::numeric) as guest_net_orders,
      count(*) filter (
        where fact_kind = 'purchase' and customer_id is null
      )::numeric as missing_link_orders,
      coalesce(sum(eligible_spend_delta) filter (
        where customer_id is null
      ), 0::numeric) as missing_link_spend
    from commerce_period_facts
  ), period_customer_orders as (
    select customer_id, sum(order_count_delta)::numeric as net_orders
    from commerce_period_facts
    where customer_id is not null
    group by customer_id
  ), period_purchasers as (
    select count(*) filter (where net_orders >= 1)::numeric as purchasers,
      count(*) filter (where net_orders >= 2)::numeric as repeat_purchasers
    from period_customer_orders
  ), lifetime_customer_commerce as (
    select customer_id,
      sum(order_count_delta)::numeric as net_orders,
      sum(eligible_spend_delta)::numeric as net_spend
    from normalized_facts
    where customer_id is not null
      and fact_kind in ('purchase', 'refund')
    group by customer_id
  ), lifetime as (
    select count(*)::numeric as purchasers,
      coalesce(sum(net_spend), 0::numeric) as eligible_spend
    from lifetime_customer_commerce
    where net_orders > 0
  ), currency_candidates as (
    select distinct version.currency_code, version.minor_unit_digits
    from normalized_facts as fact
    join scoped_versions as version on version.id = fact.programme_version_id
    where fact.fact_kind in ('purchase', 'refund')
  ), currency_history as (
    select count(*)::integer as candidate_count,
      min(currency_code) as code,
      min(minor_unit_digits) as digits,
      bool_or(currency_code is null or minor_unit_digits is null)
        as has_invalid
    from currency_candidates
  ), published_currency as (
    select version.currency_code as code, version.minor_unit_digits as digits
    from scoped_versions as version
    where version.status = 'published'
    order by version.published_at desc nulls last, version.id desc
    limit 1
  ), currency_resolution as (
    select case
        when history.has_invalid then 'unavailable'
        when history.candidate_count = 1 then 'available'
        when history.candidate_count > 1 then 'unavailable'
        when published.code is not null and published.digits is not null
          then 'available'
        else 'unavailable'
      end as status,
      case
        when history.candidate_count = 1 and not history.has_invalid
          then history.code
        when history.candidate_count = 0 then published.code
        else null
      end as code,
      case
        when history.candidate_count = 1 and not history.has_invalid
          then history.digits
        when history.candidate_count = 0 then published.digits
        else null
      end as digits,
      case
        when history.candidate_count > 1 then 'mixed_currency_scope'
        when history.has_invalid
          or (history.candidate_count = 0 and (
            published.code is null or published.digits is null
          )) then 'programme_currency_unavailable'
        else null
      end as reason
    from currency_history as history
    left join published_currency as published on true
  )
  select '1'::text, '2'::text, target_as_of,
    selected_period_from, target_as_of, target_days,
    currency.status, currency.code, currency.digits, currency.reason,
    members.member_count::text,
    30,
    selected_period_from - activation_window,
    target_as_of - activation_window,
    activation.cohort_count::text,
    activation.activated_count::text,
    case when activation.cohort_count = 0 then '0'
      else pg_catalog.trunc(
        activation.activated_count * 10000 / activation.cohort_count
      )::text end,
    participants.participant_count::text,
    case when members.member_count = 0 then '0'
      else pg_catalog.trunc(
        participants.participant_count * 10000 / members.member_count
      )::text end,
    totals.net_orders::text,
    purchasers.purchasers::text,
    purchasers.repeat_purchasers::text,
    case when purchasers.purchasers = 0 then '0'
      else pg_catalog.trunc(
        purchasers.repeat_purchasers * 10000 / purchasers.purchasers
      )::text end,
    case when currency.status = 'available' then totals.net_spend::text end,
    case when currency.status = 'available' then
      case when totals.net_orders = 0 then '0'
        else pg_catalog.trunc(totals.net_spend / totals.net_orders)::text end
    end,
    case when currency.status = 'available' then lifetime.eligible_spend::text end,
    lifetime.purchasers::text,
    case when currency.status = 'available' then
      case when lifetime.purchasers = 0 then '0'
        else pg_catalog.trunc(
          lifetime.eligible_spend / lifetime.purchasers
        )::text end
    end,
    case when totals.missing_link_orders = 0
      then 'complete' else 'partial_customer_linkage' end,
    totals.v1_net_orders::text,
    totals.v2_net_orders::text,
    totals.guest_net_orders::text,
    totals.missing_link_orders::text,
    case when currency.status = 'available'
      then totals.missing_link_spend::text end
  from member_total as members
  cross join activation
  cross join participant_total as participants
  cross join commerce_totals as totals
  cross join period_purchasers as purchasers
  cross join lifetime
  cross join currency_resolution as currency;
end;
$$;

alter function loyalty.get_analytics_commerce_performance_v1(
  uuid, uuid, uuid, integer, timestamptz
) owner to loyalty_owner;

revoke all on function loyalty.get_analytics_commerce_performance_v1(
  uuid, uuid, uuid, integer, timestamptz
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.get_analytics_commerce_performance_v1(
  uuid, uuid, uuid, integer, timestamptz
) to authenticated;

comment on function loyalty.get_analytics_commerce_performance_v1(
  uuid, uuid, uuid, integer, timestamptz
) is 'Returns exact V1/V2 normalized member and commerce performance with refund, linkage, and currency coverage evidence.';
