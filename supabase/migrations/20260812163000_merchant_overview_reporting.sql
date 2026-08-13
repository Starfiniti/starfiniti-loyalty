-- Phase 9 tenant-authorized Overview reporting. Raw evaluation, identity,
-- commerce, and ledger evidence remains private; only bounded aggregates leave
-- this security-definer read model.

create index programme_evaluations_overview_report_idx
  on loyalty_private.programme_evaluations (
    organization_id, programme_group_id, evaluation_kind, evaluated_at, id
  ) where evaluation_kind = 'live_award';

create or replace function loyalty.get_overview_report(
  target_organization_public_id uuid,
  target_workspace_public_id uuid,
  target_programme_group_public_id uuid,
  target_days integer,
  target_as_of timestamptz default now()
)
returns table (
  report_version text,
  report_as_of timestamptz,
  range_days integer,
  currency_code text,
  minor_units_per_major integer,
  members_total text,
  members_new text,
  members_new_previous text,
  eligible_spend_minor text,
  eligible_spend_minor_previous text,
  repeat_rate_basis_points text,
  repeat_rate_basis_points_previous text,
  redemption_rate_basis_points text,
  redemption_rate_basis_points_previous text,
  outstanding_points text,
  daily_new_members jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_organization_id bigint;
  selected_workspace_id bigint;
  selected_programme_group_id bigint;
begin
  if target_organization_public_id is null
    or target_workspace_public_id is null
    or target_programme_group_public_id is null
    or target_days is null
    or target_days not in (7, 30, 90)
    or target_as_of is null
    or not pg_catalog.isfinite(target_as_of) then
    raise exception using errcode = '22023', message = 'invalid overview report request';
  end if;

  select organization.id, workspace.id, programme_group.id
  into selected_organization_id, selected_workspace_id,
    selected_programme_group_id
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

  return query
  with boundaries as (
    select
      (
        pg_catalog.date_trunc('day', target_as_of at time zone 'UTC')
        at time zone 'UTC'
      ) + interval '1 day' as period_end
  ), periods as (
    select period_end,
      period_end - target_days * interval '1 day' as current_start,
      period_end - target_days * interval '2 days' as previous_start
    from boundaries
  ), scoped_wallets as materialized (
    select wallet.id, wallet.customer_id, wallet.created_at
    from loyalty.wallets as wallet
    where wallet.organization_id = selected_organization_id
      and wallet.programme_group_id = selected_programme_group_id
      and wallet.status <> 'closed'
      and exists (
        select 1
        from loyalty.customer_identities as identity
        join loyalty.commerce_connections as connection
          on connection.organization_id = identity.organization_id
         and connection.id = identity.commerce_connection_id
        where identity.organization_id = wallet.organization_id
          and identity.customer_id = wallet.customer_id
          and connection.workspace_id = selected_workspace_id
      )
  ), evaluations as materialized (
    select evaluation.id, evaluation.evaluated_at,
      case
        when evaluation.result ->> 'eligibleSpendMinor' ~ '^[0-9]{1,19}$'
          then (evaluation.result ->> 'eligibleSpendMinor')::numeric
        else 0::numeric
      end as eligible_spend_minor,
      identity.customer_id,
      wallet.id as wallet_id
    from loyalty_private.programme_evaluations as evaluation
    join loyalty_private.canonical_commerce_events as event
      on event.organization_id = evaluation.organization_id
     and event.id = evaluation.canonical_event_id
    join loyalty.commerce_connections as connection
      on connection.organization_id = event.organization_id
     and connection.id = event.connection_id
     and connection.workspace_id = selected_workspace_id
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
    left join scoped_wallets as wallet
      on wallet.customer_id = identity.customer_id
    cross join periods
    where evaluation.organization_id = selected_organization_id
      and evaluation.programme_group_id = selected_programme_group_id
      and evaluation.evaluation_kind = 'live_award'
      and evaluation.evaluated_at >= periods.previous_start
      and evaluation.evaluated_at < periods.period_end
  ), wallet_order_counts as (
    select evaluation.wallet_id,
      count(*) filter (
        where evaluation.evaluated_at >= periods.current_start
      )::bigint as current_orders,
      count(*) filter (
        where evaluation.evaluated_at < periods.current_start
      )::bigint as previous_orders
    from evaluations as evaluation
    cross join periods
    where evaluation.wallet_id is not null
    group by evaluation.wallet_id
  ), spend as (
    select
      coalesce(sum(evaluation.eligible_spend_minor) filter (
        where evaluation.evaluated_at >= periods.current_start
      ), 0)::numeric as current_spend,
      coalesce(sum(evaluation.eligible_spend_minor) filter (
        where evaluation.evaluated_at < periods.current_start
      ), 0)::numeric as previous_spend
    from evaluations as evaluation
    cross join periods
  ), repeat_rates as (
    select
      coalesce(
        pg_catalog.round(
          count(*) filter (where current_orders >= 2)::numeric * 10000
          / nullif(count(*) filter (where current_orders >= 1), 0)
        ), 0
      )::numeric as current_rate,
      coalesce(
        pg_catalog.round(
          count(*) filter (where previous_orders >= 2)::numeric * 10000
          / nullif(count(*) filter (where previous_orders >= 1), 0)
        ), 0
      )::numeric as previous_rate
    from wallet_order_counts
  ), point_flows as (
    select
      coalesce(sum(entry.points) filter (
        where transaction.transaction_kind = 'award'
          and account.account_kind = 'pending'
          and transaction.effective_at >= periods.current_start
      ), 0)::numeric as current_earned,
      coalesce(sum(entry.points) filter (
        where transaction.transaction_kind = 'award'
          and account.account_kind = 'pending'
          and transaction.effective_at < periods.current_start
      ), 0)::numeric as previous_earned,
      coalesce(sum(entry.points) filter (
        where transaction.transaction_kind = 'capture'
          and account.account_kind = 'spent'
          and transaction.effective_at >= periods.current_start
      ), 0)::numeric as current_redeemed,
      coalesce(sum(entry.points) filter (
        where transaction.transaction_kind = 'capture'
          and account.account_kind = 'spent'
          and transaction.effective_at < periods.current_start
      ), 0)::numeric as previous_redeemed
    from loyalty.ledger_transactions as transaction
    join loyalty.ledger_entries as entry
      on entry.organization_id = transaction.organization_id
     and entry.transaction_id = transaction.id
     and entry.points > 0
    join loyalty.ledger_accounts as account
      on account.organization_id = entry.organization_id
     and account.id = entry.account_id
    join scoped_wallets as wallet on wallet.id = account.wallet_id
    cross join periods
    where transaction.organization_id = selected_organization_id
      and transaction.programme_group_id = selected_programme_group_id
      and transaction.effective_at >= periods.previous_start
      and transaction.effective_at < periods.period_end
      and transaction.transaction_kind in ('award', 'capture')
  ), redemption_rates as (
    select
      coalesce(
        pg_catalog.round(current_redeemed * 10000 / nullif(current_earned, 0)), 0
      )::numeric as current_rate,
      coalesce(
        pg_catalog.round(previous_redeemed * 10000 / nullif(previous_earned, 0)), 0
      )::numeric as previous_rate
    from point_flows
  ), liability as (
    select coalesce(sum(balance.points), 0)::numeric as outstanding
    from loyalty.wallet_balances as balance
    join scoped_wallets as wallet on wallet.id = balance.wallet_id
    where balance.organization_id = selected_organization_id
      and balance.programme_group_id = selected_programme_group_id
      and balance.account_kind in ('pending', 'available', 'reserved')
  ), programme_currency as (
    select
      case when version.configuration ->> 'currencyCode' ~ '^[A-Z]{3}$'
        then version.configuration ->> 'currencyCode' else null end as code,
      case when version.configuration ->> 'minorUnitsPerMajor' ~ '^(1|10|100|1000|10000|100000|1000000)$'
        then (version.configuration ->> 'minorUnitsPerMajor')::integer else null end as units
    from loyalty.programme_versions as version
    where version.organization_id = selected_organization_id
      and version.programme_group_id = selected_programme_group_id
      and version.status = 'published'
    order by version.published_at desc, version.id desc
    limit 1
  ), member_counts as (
    select count(*)::bigint as total,
      count(*) filter (
        where wallet.created_at >= periods.current_start
          and wallet.created_at < periods.period_end
      )::bigint as current_new,
      count(*) filter (
        where wallet.created_at >= periods.previous_start
          and wallet.created_at < periods.current_start
      )::bigint as previous_new
    from scoped_wallets as wallet
    cross join periods
  ), day_series as (
    select day_index,
      (periods.current_start + day_index * interval '1 day')::date as report_date,
      count(wallet.id) filter (
        where wallet.created_at >= periods.current_start + day_index * interval '1 day'
          and wallet.created_at < periods.current_start + (day_index + 1) * interval '1 day'
      )::bigint as current_count,
      count(wallet.id) filter (
        where wallet.created_at >= periods.previous_start + day_index * interval '1 day'
          and wallet.created_at < periods.previous_start + (day_index + 1) * interval '1 day'
      )::bigint as previous_count
    from pg_catalog.generate_series(0, target_days - 1) as generated(day_index)
    cross join periods
    left join scoped_wallets as wallet
      on wallet.created_at >= periods.previous_start
     and wallet.created_at < periods.period_end
    group by day_index, periods.current_start
  ), trend as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', report_date,
          'current', current_count::text,
          'previous', previous_count::text
        ) order by day_index
      ), '[]'::jsonb
    ) as points
    from day_series
  )
  select '1'::text, target_as_of, target_days,
    programme_currency.code, programme_currency.units,
    member_counts.total::text,
    member_counts.current_new::text,
    member_counts.previous_new::text,
    spend.current_spend::text,
    spend.previous_spend::text,
    repeat_rates.current_rate::text,
    repeat_rates.previous_rate::text,
    redemption_rates.current_rate::text,
    redemption_rates.previous_rate::text,
    liability.outstanding::text,
    trend.points
  from member_counts
  cross join spend
  cross join repeat_rates
  cross join redemption_rates
  cross join liability
  cross join trend
  left join programme_currency on true;
end;
$$;

alter function loyalty.get_overview_report(uuid, uuid, uuid, integer, timestamptz)
  owner to loyalty_owner;
revoke all on function loyalty.get_overview_report(
  uuid, uuid, uuid, integer, timestamptz
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_overview_report(
  uuid, uuid, uuid, integer, timestamptz
) to authenticated;

comment on function loyalty.get_overview_report(
  uuid, uuid, uuid, integer, timestamptz
) is 'Returns bounded tenant/workspace/programme Overview aggregates without private evaluation, identity, commerce, or ledger evidence.';
