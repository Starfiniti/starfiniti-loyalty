-- Authenticated hosted-customer projection. Authority comes only from the
-- active Auth/customer link; the caller cannot supply tenant or customer IDs.

create or replace function loyalty.get_my_loyalty_accounts()
returns table (
  account_id uuid,
  customer_id uuid,
  workspace_id uuid,
  programme_id uuid,
  store_name text,
  programme_name text,
  account_status text,
  pending_points text,
  available_points text,
  reserved_points text,
  tier_code text,
  tier_name text,
  next_expiry_points text,
  next_expiry_at timestamptz,
  rewards jsonb,
  reservations jsonb,
  activity jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := loyalty_private.request_user_id();
begin
  if request_user_id is null then
    return;
  end if;

  return query
  select link.public_id,
    customer.public_id,
    workspace.public_id,
    programme.public_id,
    connection.display_name,
    programme.name,
    case
      when programme.id is null or published_version.id is null then 'programme_unavailable'
      when wallet.id is null then 'ready_without_activity'
      when wallet.status <> 'active' then 'wallet_' || wallet.status
      else 'ready'
    end,
    coalesce(balance.pending_points, '0'),
    coalesce(balance.available_points, '0'),
    coalesce(balance.reserved_points, '0'),
    membership.tier_code,
    tier.name,
    expiry.remaining_points,
    expiry.expires_at,
    coalesce(available_rewards.items, '[]'::jsonb),
    coalesce(active_reservations.items, '[]'::jsonb),
    coalesce(recent_activity.items, '[]'::jsonb)
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
  join loyalty.workspaces as workspace
    on workspace.organization_id = connection.organization_id
   and workspace.id = connection.workspace_id
   and workspace.status = 'active'
  left join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.status = 'active'
  left join loyalty.programme_groups as programme_group
    on programme_group.organization_id = programme.organization_id
   and programme_group.id = programme.programme_group_id
   and programme_group.status = 'active'
  left join loyalty.programme_group_workspaces as group_workspace
    on group_workspace.organization_id = programme_group.organization_id
   and group_workspace.programme_group_id = programme_group.id
   and group_workspace.workspace_id = workspace.id
  left join lateral (
    select version.id
    from loyalty.programme_versions as version
    where version.organization_id = programme.organization_id
      and version.programme_id = programme.id
      and version.status = 'published'
    order by version.version_number desc, version.id desc
    limit 1
  ) as published_version on group_workspace.workspace_id is not null
  left join loyalty.wallets as wallet
    on wallet.organization_id = link.organization_id
   and wallet.programme_group_id = programme_group.id
   and wallet.customer_id = customer.id
  left join lateral (
    select
      coalesce(pg_catalog.sum(wallet_balance.points) filter (
        where wallet_balance.account_kind = 'pending'
      ), 0)::text as pending_points,
      coalesce(pg_catalog.sum(wallet_balance.points) filter (
        where wallet_balance.account_kind = 'available'
      ), 0)::text as available_points,
      coalesce(pg_catalog.sum(wallet_balance.points) filter (
        where wallet_balance.account_kind = 'reserved'
      ), 0)::text as reserved_points
    from loyalty.wallet_balances as wallet_balance
    where wallet_balance.organization_id = link.organization_id
      and wallet_balance.wallet_id = wallet.id
  ) as balance on true
  left join loyalty.tier_memberships as membership
    on membership.organization_id = link.organization_id
   and membership.wallet_id = wallet.id
   and membership.effective_until is null
  left join loyalty.programme_tiers as tier
    on tier.organization_id = membership.organization_id
   and tier.programme_version_id = membership.programme_version_id
   and tier.code = membership.tier_code
   and tier.name !~ '[<>&[:cntrl:]]'
  left join lateral (
    select lot_balance.remaining_points::text, lot.expires_at
    from loyalty.point_lot_balances as lot_balance
    join loyalty.point_lots as lot
      on lot.organization_id = lot_balance.organization_id
     and lot.id = lot_balance.lot_id
    where lot_balance.organization_id = link.organization_id
      and lot_balance.wallet_id = wallet.id
      and lot_balance.remaining_points > 0
      and lot.available_at <= pg_catalog.transaction_timestamp()
      and lot.expires_at > pg_catalog.transaction_timestamp()
    order by lot.expires_at, lot.available_at, lot.id
    limit 1
  ) as expiry on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', reward.code,
          'name', reward.name,
          'kind', reward.reward_kind,
          'costPoints', reward.cost_points::text,
          'affordable', reward.cost_points <= coalesce(balance.available_points::bigint, 0)
        ) order by reward.cost_points, reward.code
      ),
      '[]'::jsonb
    ) as items
    from (
      select definition.code, definition.name, definition.reward_kind,
        definition.cost_points
      from loyalty.programme_rewards as definition
      where definition.organization_id = link.organization_id
        and definition.programme_version_id = published_version.id
        and definition.name !~ '[<>&[:cntrl:]]'
      order by definition.cost_points, definition.code
      limit 20
    ) as reward
  ) as available_rewards on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', reservation.public_id,
          'rewardName', reservation.reward_name,
          'state', reservation.state,
          'costPoints', reservation.cost_points,
          'expiresAt', reservation.expires_at
        ) order by reservation.created_at desc, reservation.id desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select reward_reservation.id, reward_reservation.public_id,
        reward.name as reward_name, reward_reservation.state,
        reward_reservation.cost_points::text as cost_points,
        reward_reservation.expires_at, reward_reservation.created_at
      from loyalty.reward_reservations as reward_reservation
      join loyalty.programme_rewards as reward
        on reward.organization_id = reward_reservation.organization_id
       and reward.id = reward_reservation.reward_id
       and reward.name !~ '[<>&[:cntrl:]]'
      where reward_reservation.organization_id = link.organization_id
        and reward_reservation.wallet_id = wallet.id
        and reward_reservation.state in ('requested', 'reserved', 'issued')
      order by reward_reservation.created_at desc, reward_reservation.id desc
      limit 10
    ) as reservation
  ) as active_reservations on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', history.public_id,
          'kind', history.transaction_kind,
          'points', history.points,
          'effectiveAt', history.effective_at
        ) order by history.effective_at desc, history.id desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select transaction.id, transaction.public_id,
        transaction.transaction_kind,
        pg_catalog.max(pg_catalog.abs(entry.points))::text as points,
        transaction.effective_at
      from loyalty.ledger_transactions as transaction
      join loyalty.ledger_entries as entry
        on entry.organization_id = transaction.organization_id
       and entry.transaction_id = transaction.id
      join loyalty.ledger_accounts as account
        on account.organization_id = entry.organization_id
       and account.id = entry.account_id
       and account.wallet_id = wallet.id
      where transaction.organization_id = link.organization_id
        and transaction.programme_group_id = programme_group.id
      group by transaction.id, transaction.public_id,
        transaction.transaction_kind, transaction.effective_at
      order by transaction.effective_at desc, transaction.id desc
      limit 10
    ) as history
  ) as recent_activity on true
  where link.auth_user_id = request_user_id
    and link.revoked_at is null
  order by link.linked_at desc, link.id desc
  limit 20;
end;
$$;

alter function loyalty.get_my_loyalty_accounts() owner to loyalty_owner;
revoke all on function loyalty.get_my_loyalty_accounts()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_my_loyalty_accounts() to authenticated;

comment on function loyalty.get_my_loyalty_accounts() is
  'Returns bounded minimized loyalty accounts only for the Auth user derived from the live request; no tenant or customer authority is caller supplied.';
