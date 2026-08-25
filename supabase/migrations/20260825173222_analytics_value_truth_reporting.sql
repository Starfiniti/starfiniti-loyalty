-- M10-S01: exact, tenant-authorized loyalty value truth. Immutable ledger and
-- point-lot evidence are authoritative; mutable projections are checked before
-- aggregates leave PostgreSQL. Point exposure is never labelled as money.

create or replace function loyalty.get_analytics_value_truth_v1(
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
  projection_status text,
  wallet_count text,
  wallet_account_count text,
  ledger_entry_count text,
  lot_count text,
  pending_points text,
  available_points text,
  reserved_points text,
  spent_points text,
  expired_points text,
  reversed_points text,
  outstanding_points text,
  awarded_flow_points text,
  released_flow_points text,
  reserved_flow_points text,
  captured_flow_points text,
  cancelled_flow_points text,
  expired_flow_points text,
  refund_reversed_flow_points text,
  manual_credit_points text,
  manual_debit_points text,
  manual_net_points text,
  lot_backed_points text,
  overdue_available_points text,
  reserved_past_expiry_points text,
  expiring_next_30_days text,
  expiring_days_31_to_90 text,
  expiring_beyond_90_days text,
  affected_members text,
  next_expiry_at timestamptz,
  monetary_liability_status text,
  monetary_liability_reason text
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
      message = 'invalid analytics value truth request';
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

  -- Projection drift is a deterministic report failure. Returning a plausible
  -- aggregate while a mutable cache disagrees with immutable history would
  -- hide an operational incident.
  if exists (
    select 1
    from loyalty.ledger_accounts as account
    left join loyalty.wallet_balances as balance
      on balance.organization_id = account.organization_id
     and balance.ledger_account_id = account.id
    left join loyalty.ledger_entries as entry
      on entry.organization_id = account.organization_id
     and entry.account_id = account.id
    where account.organization_id = selected_organization_id
      and account.programme_group_id = selected_programme_group_id
      and account.wallet_id is not null
    group by account.id, balance.ledger_account_id, balance.points
    having balance.ledger_account_id is null
      or balance.points::numeric <> coalesce(sum(entry.points), 0::numeric)
  ) then
    raise exception using
      errcode = '55000',
      message = 'analytics wallet projection drift';
  end if;

  if exists (
    select 1
    from loyalty.point_lots as lot
    left join loyalty.point_lot_balances as balance
      on balance.organization_id = lot.organization_id
     and balance.lot_id = lot.id
    left join loyalty.redemption_allocations as allocation
      on allocation.organization_id = lot.organization_id
     and allocation.lot_id = lot.id
    where lot.organization_id = selected_organization_id
      and lot.programme_group_id = selected_programme_group_id
    group by lot.id, lot.initial_points,
      balance.lot_id, balance.remaining_points
    having balance.lot_id is null
      or balance.remaining_points::numeric <>
        lot.initial_points::numeric - coalesce(sum(allocation.points), 0::numeric)
  ) then
    raise exception using
      errcode = '55000',
      message = 'analytics point-lot projection drift';
  end if;

  selected_period_from := target_as_of - target_days * interval '1 day';

  return query
  with scoped_wallets as materialized (
    select wallet.id
    from loyalty.wallets as wallet
    where wallet.organization_id = selected_organization_id
      and wallet.programme_group_id = selected_programme_group_id
  ), scoped_entries as materialized (
    select entry.id, entry.points, account.account_kind,
      transaction.transaction_kind, transaction.effective_at
    from loyalty.ledger_transactions as transaction
    join loyalty.ledger_entries as entry
      on entry.organization_id = transaction.organization_id
     and entry.transaction_id = transaction.id
    join loyalty.ledger_accounts as account
      on account.organization_id = entry.organization_id
     and account.id = entry.account_id
    join scoped_wallets as wallet on wallet.id = account.wallet_id
    where transaction.organization_id = selected_organization_id
      and transaction.programme_group_id = selected_programme_group_id
      and transaction.effective_at < target_as_of
  ), projection_counts as (
    select
      (select count(*)::numeric from scoped_wallets) as wallets,
      (
        select count(*)::numeric
        from loyalty.ledger_accounts as account
        join scoped_wallets as wallet on wallet.id = account.wallet_id
        where account.organization_id = selected_organization_id
          and account.programme_group_id = selected_programme_group_id
      ) as accounts,
      (select count(*)::numeric from scoped_entries) as entries,
      (
        select count(*)::numeric
        from loyalty.point_lots as lot
        join scoped_wallets as wallet on wallet.id = lot.wallet_id
        where lot.organization_id = selected_organization_id
          and lot.programme_group_id = selected_programme_group_id
          and lot.available_at < target_as_of
      ) as lots
  ), snapshot as (
    select
      coalesce(sum(entry.points) filter (
        where entry.account_kind = 'pending'
      ), 0::numeric) as pending,
      coalesce(sum(entry.points) filter (
        where entry.account_kind = 'available'
      ), 0::numeric) as available,
      coalesce(sum(entry.points) filter (
        where entry.account_kind = 'reserved'
      ), 0::numeric) as reserved,
      coalesce(sum(entry.points) filter (
        where entry.account_kind = 'spent'
      ), 0::numeric) as spent,
      coalesce(sum(entry.points) filter (
        where entry.account_kind = 'expired'
      ), 0::numeric) as expired,
      coalesce(sum(entry.points) filter (
        where entry.account_kind = 'reversed'
      ), 0::numeric) as reversed
    from scoped_entries as entry
  ), flows as (
    select
      coalesce(sum(entry.points) filter (
        where entry.transaction_kind = 'award'
          and entry.account_kind = 'pending' and entry.points > 0
      ), 0::numeric) as awarded,
      coalesce(sum(entry.points) filter (
        where entry.transaction_kind = 'release'
          and entry.account_kind = 'available' and entry.points > 0
      ), 0::numeric) as released,
      coalesce(sum(entry.points) filter (
        where entry.transaction_kind = 'reserve'
          and entry.account_kind = 'reserved' and entry.points > 0
      ), 0::numeric) as reserved,
      coalesce(sum(entry.points) filter (
        where entry.transaction_kind = 'capture'
          and entry.account_kind = 'spent' and entry.points > 0
      ), 0::numeric) as captured,
      coalesce(sum(entry.points) filter (
        where entry.transaction_kind = 'cancel'
          and entry.account_kind = 'available' and entry.points > 0
      ), 0::numeric) as cancelled,
      coalesce(sum(entry.points) filter (
        where entry.transaction_kind = 'expire'
          and entry.account_kind = 'expired' and entry.points > 0
      ), 0::numeric) as expired,
      coalesce(sum(entry.points) filter (
        where entry.transaction_kind = 'refund_reversal'
          and entry.account_kind = 'reversed' and entry.points > 0
      ), 0::numeric) as refund_reversed,
      coalesce(sum(entry.points) filter (
        where entry.transaction_kind = 'manual_adjustment'
          and entry.account_kind = 'available' and entry.points > 0
      ), 0::numeric) as manual_credit,
      coalesce(-sum(entry.points) filter (
        where entry.transaction_kind = 'manual_adjustment'
          and entry.account_kind = 'available' and entry.points < 0
      ), 0::numeric) as manual_debit,
      coalesce(sum(entry.points) filter (
        where entry.transaction_kind = 'manual_adjustment'
          and entry.account_kind = 'available'
      ), 0::numeric) as manual_net
    from scoped_entries as entry
    where entry.effective_at >= selected_period_from
      and entry.effective_at < target_as_of
  ), lot_exposure as materialized (
    select lot.id, lot.wallet_id, lot.expires_at,
      (
        lot.initial_points::numeric - coalesce(sum(allocation.points) filter (
          where allocation_transaction.effective_at < target_as_of
        ), 0::numeric)
      ) as remaining_points,
      coalesce(sum(allocation.points) filter (
        where allocation.allocation_kind = 'reserve'
          and allocation_transaction.effective_at < target_as_of
          and not exists (
            select 1
            from loyalty.ledger_transactions as resolution
            where resolution.organization_id = allocation.organization_id
              and resolution.related_transaction_id = allocation.transaction_id
              and resolution.transaction_kind in ('capture', 'cancel')
              and resolution.effective_at < target_as_of
          )
      ), 0::numeric) as unresolved_reserved_points
    from loyalty.point_lots as lot
    join scoped_wallets as wallet on wallet.id = lot.wallet_id
    left join loyalty.redemption_allocations as allocation
      on allocation.organization_id = lot.organization_id
     and allocation.lot_id = lot.id
    left join loyalty.ledger_transactions as allocation_transaction
      on allocation_transaction.organization_id = allocation.organization_id
     and allocation_transaction.id = allocation.transaction_id
    where lot.organization_id = selected_organization_id
      and lot.programme_group_id = selected_programme_group_id
      and lot.available_at < target_as_of
    group by lot.id, lot.wallet_id, lot.expires_at, lot.initial_points
  ), expiry as (
    select
      coalesce(sum(
        exposure.remaining_points + exposure.unresolved_reserved_points
      ), 0::numeric) as lot_backed,
      coalesce(sum(exposure.remaining_points) filter (
        where exposure.expires_at <= target_as_of
      ), 0::numeric) as overdue_available,
      coalesce(sum(exposure.unresolved_reserved_points) filter (
        where exposure.expires_at <= target_as_of
      ), 0::numeric) as reserved_past_expiry,
      coalesce(sum(
        exposure.remaining_points + exposure.unresolved_reserved_points
      ) filter (
        where exposure.expires_at > target_as_of
          and exposure.expires_at <= target_as_of + interval '30 days'
      ), 0::numeric) as next_30,
      coalesce(sum(
        exposure.remaining_points + exposure.unresolved_reserved_points
      ) filter (
        where exposure.expires_at > target_as_of + interval '30 days'
          and exposure.expires_at <= target_as_of + interval '90 days'
      ), 0::numeric) as days_31_to_90,
      coalesce(sum(
        exposure.remaining_points + exposure.unresolved_reserved_points
      ) filter (
        where exposure.expires_at > target_as_of + interval '90 days'
      ), 0::numeric) as beyond_90,
      count(distinct exposure.wallet_id) filter (
        where exposure.remaining_points + exposure.unresolved_reserved_points > 0
      )::numeric as affected,
      min(exposure.expires_at) filter (
        where exposure.remaining_points + exposure.unresolved_reserved_points > 0
          and exposure.expires_at > target_as_of
      ) as next_expiry
    from lot_exposure as exposure
  )
  select
    '1'::text,
    '1'::text,
    target_as_of,
    selected_period_from,
    target_as_of,
    target_days,
    'reconciled'::text,
    projection_counts.wallets::text,
    projection_counts.accounts::text,
    projection_counts.entries::text,
    projection_counts.lots::text,
    snapshot.pending::text,
    snapshot.available::text,
    snapshot.reserved::text,
    snapshot.spent::text,
    snapshot.expired::text,
    snapshot.reversed::text,
    (snapshot.pending + snapshot.available + snapshot.reserved)::text,
    flows.awarded::text,
    flows.released::text,
    flows.reserved::text,
    flows.captured::text,
    flows.cancelled::text,
    flows.expired::text,
    flows.refund_reversed::text,
    flows.manual_credit::text,
    flows.manual_debit::text,
    flows.manual_net::text,
    expiry.lot_backed::text,
    expiry.overdue_available::text,
    expiry.reserved_past_expiry::text,
    expiry.next_30::text,
    expiry.days_31_to_90::text,
    expiry.beyond_90::text,
    expiry.affected::text,
    expiry.next_expiry,
    'unavailable'::text,
    'valuation_policy_not_configured'::text
  from projection_counts
  cross join snapshot
  cross join flows
  cross join expiry;
end;
$$;

alter function loyalty.get_analytics_value_truth_v1(
  uuid, uuid, uuid, integer, timestamptz
) owner to loyalty_owner;

revoke all on function loyalty.get_analytics_value_truth_v1(
  uuid, uuid, uuid, integer, timestamptz
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;

grant execute on function loyalty.get_analytics_value_truth_v1(
  uuid, uuid, uuid, integer, timestamptz
) to authenticated;

comment on function loyalty.get_analytics_value_truth_v1(
  uuid, uuid, uuid, integer, timestamptz
) is
  'Returns exact tenant/programme value flows, balances, and expiry exposure after immutable projection reconciliation; monetary liability remains unavailable without a versioned valuation policy.';
