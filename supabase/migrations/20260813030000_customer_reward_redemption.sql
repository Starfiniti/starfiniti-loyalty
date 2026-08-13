-- Authenticated customer reward redemption. The browser supplies only the
-- public customer-account identifier, published reward code, and one request
-- UUID. Tenant, customer, wallet, programme, value, and connector authority
-- are all derived from the live Auth link inside this transaction.

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
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'reward redemption not authorized';
  end if;
  if target_account_public_id is null
    or target_request_id is null
    or target_reward_code is null
    or target_reward_code !~ '^[a-z][a-z0-9_-]{0,79}$' then
    raise exception using errcode = '22023', message = 'invalid reward redemption request';
  end if;

  select link.organization_id, link.customer_id, connection.public_id as connection_public_id,
    programme_group.id as programme_group_id, version.id as programme_version_id,
    wallet.id as wallet_id, wallet.public_id as wallet_public_id
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
    raise exception using errcode = '42501', message = 'reward redemption not authorized';
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
      raise exception using errcode = '23514', message = 'reward redemption request conflict';
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
    and reward.reward_kind in ('fixed_discount', 'percentage_discount', 'free_shipping');
  if not found then
    raise exception using errcode = '22023', message = 'reward is not available for self-service redemption';
  end if;

  if target_reward.reward_kind = 'percentage_discount'
    and target_reward.configuration ->> 'maximumDiscountMinor' is not null
    and target_reward.configuration ->> 'maximumDiscountMinor' !~ '^[1-9][0-9]*$' then
    raise exception using errcode = '22023', message = 'invalid reward coupon configuration';
  end if;

  if coalesce(target_reward.configuration ->> 'currencyMinorUnitDigits', '2') !~ '^[0-6]$' then
    raise exception using errcode = '22023', message = 'invalid reward currency configuration';
  end if;
  currency_minor_unit_digits := coalesce(
    (target_reward.configuration ->> 'currencyMinorUnitDigits')::smallint,
    2::smallint
  );
  if coalesce(target_reward.configuration ->> 'validityDays', '30') !~ '^[1-9][0-9]{0,2}$'
    or coalesce((target_reward.configuration ->> 'validityDays')::integer, 30) > 365 then
    raise exception using errcode = '22023', message = 'invalid reward validity configuration';
  end if;
  validity_days := coalesce((target_reward.configuration ->> 'validityDays')::integer, 30);

  select * into reservation_result
  from loyalty_private.create_reward_reservation(
    customer_scope.organization_id,
    customer_scope.programme_group_id,
    customer_scope.programme_version_id,
    customer_scope.wallet_id,
    target_reward.id,
    target_reward.cost_points,
    pg_catalog.transaction_timestamp() + pg_catalog.make_interval(days => validity_days),
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
  select * into coupon_result
  from loyalty_private.enqueue_woocommerce_coupon_issue(
    reservation_result.reservation_public_id,
    customer_scope.connection_public_id,
    currency_minor_unit_digits
  );

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

alter function loyalty.redeem_my_reward(uuid, text, uuid) owner to loyalty_owner;
revoke all on function loyalty.redeem_my_reward(uuid, text, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.redeem_my_reward(uuid, text, uuid) to authenticated;

comment on function loyalty.redeem_my_reward(uuid, text, uuid) is
  'Atomically reserves the signed-in customer points and queues one native WooCommerce coupon without accepting tenant, customer, wallet, value, or connector authority from the browser.';
