-- Phase 9 exact customer read models. All bigint values cross the Data API as
-- text, and channel identifiers are masked before leaving PostgreSQL.

create index customers_organization_created_idx
  on loyalty.customers (organization_id, created_at desc, id desc);

create or replace function loyalty.list_customer_summaries(
  target_organization_public_id uuid,
  target_programme_group_public_id uuid default null,
  target_search text default null
)
returns table (
  customer_id uuid,
  display_reference text,
  customer_status text,
  created_at timestamptz,
  identity_kind text,
  masked_external_id text,
  wallet_status text,
  pending_points text,
  available_points text,
  reserved_points text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_organization_id bigint;
  selected_programme_group_id bigint;
  normalized_search text := pg_catalog.btrim(coalesce(target_search, ''));
begin
  if target_organization_public_id is null
    or pg_catalog.length(normalized_search) > 100
    or normalized_search ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid customer search request';
  end if;

  select organization.id into selected_organization_id
  from loyalty.organizations as organization
  where organization.public_id = target_organization_public_id
    and organization.status = 'active'
    and loyalty_private.is_organization_member(organization.id);
  if not found then
    return;
  end if;

  if target_programme_group_public_id is not null then
    select programme_group.id into selected_programme_group_id
    from loyalty.programme_groups as programme_group
    where programme_group.organization_id = selected_organization_id
      and programme_group.public_id = target_programme_group_public_id
      and programme_group.status = 'active';
    if not found then
      return;
    end if;
  end if;

  return query
  select customer.public_id,
    coalesce(
      nullif(pg_catalog.btrim(customer.display_reference), ''),
      'Customer ' || pg_catalog.left(customer.public_id::text, 8)
    ),
    customer.status,
    customer.created_at,
    identity.identity_kind,
    case
      when identity.external_customer_id is null then null
      when pg_catalog.length(identity.external_customer_id) <= 4
        then pg_catalog.repeat(pg_catalog.chr(8226), 4)
      else pg_catalog.repeat(pg_catalog.chr(8226), 4)
        || pg_catalog.right(identity.external_customer_id, 4)
    end,
    wallet.status,
    balance.pending_points,
    balance.available_points,
    balance.reserved_points
  from loyalty.customers as customer
  left join lateral (
    select customer_identity.identity_kind,
      customer_identity.external_customer_id
    from loyalty.customer_identities as customer_identity
    where customer_identity.organization_id = customer.organization_id
      and customer_identity.customer_id = customer.id
    order by customer_identity.id
    limit 1
  ) as identity on true
  left join loyalty.wallets as wallet
    on selected_programme_group_id is not null
   and wallet.organization_id = customer.organization_id
   and wallet.programme_group_id = selected_programme_group_id
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
    where wallet_balance.organization_id = selected_organization_id
      and wallet_balance.wallet_id = wallet.id
  ) as balance on true
  where customer.organization_id = selected_organization_id
    and (
      normalized_search = ''
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(customer.display_reference, '')),
        pg_catalog.lower(normalized_search)
      ) > 0
    )
  order by customer.created_at desc, customer.id desc
  limit 50;
end;
$$;

create or replace function loyalty.get_customer_read_model(
  target_customer_public_id uuid,
  target_programme_group_public_id uuid default null
)
returns table (
  customer_id uuid,
  display_reference text,
  customer_status text,
  created_at timestamptz,
  identity_kind text,
  masked_external_id text,
  wallet_status text,
  pending_points text,
  available_points text,
  reserved_points text,
  spent_points text,
  expired_points text,
  reversed_points text,
  ledger_items jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_organization_id bigint;
  selected_customer_id bigint;
  selected_programme_group_id bigint;
begin
  if target_customer_public_id is null then
    raise exception using errcode = '22023', message = 'invalid customer detail request';
  end if;

  select customer.organization_id, customer.id
  into selected_organization_id, selected_customer_id
  from loyalty.customers as customer
  join loyalty.organizations as organization
    on organization.id = customer.organization_id
   and organization.status = 'active'
  where customer.public_id = target_customer_public_id
    and loyalty_private.is_organization_member(customer.organization_id);
  if not found then
    return;
  end if;

  if target_programme_group_public_id is not null then
    select programme_group.id into selected_programme_group_id
    from loyalty.programme_groups as programme_group
    where programme_group.organization_id = selected_organization_id
      and programme_group.public_id = target_programme_group_public_id
      and programme_group.status = 'active';
    if not found then
      return;
    end if;
  end if;

  return query
  select customer.public_id,
    coalesce(
      nullif(pg_catalog.btrim(customer.display_reference), ''),
      'Customer ' || pg_catalog.left(customer.public_id::text, 8)
    ),
    customer.status,
    customer.created_at,
    identity.identity_kind,
    case
      when identity.external_customer_id is null then null
      when pg_catalog.length(identity.external_customer_id) <= 4
        then pg_catalog.repeat(pg_catalog.chr(8226), 4)
      else pg_catalog.repeat(pg_catalog.chr(8226), 4)
        || pg_catalog.right(identity.external_customer_id, 4)
    end,
    wallet.status,
    balance.pending_points,
    balance.available_points,
    balance.reserved_points,
    balance.spent_points,
    balance.expired_points,
    balance.reversed_points,
    ledger.items
  from loyalty.customers as customer
  left join lateral (
    select customer_identity.identity_kind,
      customer_identity.external_customer_id
    from loyalty.customer_identities as customer_identity
    where customer_identity.organization_id = customer.organization_id
      and customer_identity.customer_id = customer.id
    order by customer_identity.id
    limit 1
  ) as identity on true
  left join loyalty.wallets as wallet
    on selected_programme_group_id is not null
   and wallet.organization_id = customer.organization_id
   and wallet.programme_group_id = selected_programme_group_id
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
      ), 0)::text as reserved_points,
      coalesce(pg_catalog.sum(wallet_balance.points) filter (
        where wallet_balance.account_kind = 'spent'
      ), 0)::text as spent_points,
      coalesce(pg_catalog.sum(wallet_balance.points) filter (
        where wallet_balance.account_kind = 'expired'
      ), 0)::text as expired_points,
      coalesce(pg_catalog.sum(wallet_balance.points) filter (
        where wallet_balance.account_kind = 'reversed'
      ), 0)::text as reversed_points
    from loyalty.wallet_balances as wallet_balance
    where wallet_balance.organization_id = selected_organization_id
      and wallet_balance.wallet_id = wallet.id
  ) as balance on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', history.transaction_public_id,
          'kind', history.transaction_kind,
          'actorType', history.actor_type,
          'sourceReference', history.source_reference,
          'bucket', history.account_kind,
          'points', history.points,
          'effectiveAt', history.effective_at,
          'correlationId', history.correlation_id,
          'programmeVersion', history.version_number
        ) order by history.entry_id desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select entry.id as entry_id,
        transaction.public_id as transaction_public_id,
        transaction.transaction_kind,
        transaction.actor_type,
        transaction.source_reference,
        account.account_kind,
        entry.points::text as points,
        transaction.effective_at,
        transaction.correlation_id,
        version.version_number
      from loyalty.ledger_accounts as account
      join loyalty.ledger_entries as entry
        on entry.organization_id = account.organization_id
       and entry.account_id = account.id
      join loyalty.ledger_transactions as transaction
        on transaction.organization_id = entry.organization_id
       and transaction.id = entry.transaction_id
      join loyalty.programme_versions as version
        on version.organization_id = transaction.organization_id
       and version.id = transaction.programme_version_id
      where account.organization_id = selected_organization_id
        and account.wallet_id = wallet.id
      order by entry.id desc
      limit 100
    ) as history
  ) as ledger on true
  where customer.organization_id = selected_organization_id
    and customer.id = selected_customer_id;
end;
$$;

alter function loyalty.list_customer_summaries(uuid, uuid, text)
  owner to loyalty_owner;
alter function loyalty.get_customer_read_model(uuid, uuid)
  owner to loyalty_owner;

revoke all on function loyalty.list_customer_summaries(uuid, uuid, text)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_customer_read_model(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.list_customer_summaries(uuid, uuid, text)
  to authenticated;
grant execute on function loyalty.get_customer_read_model(uuid, uuid)
  to authenticated;

comment on function loyalty.list_customer_summaries(uuid, uuid, text) is
  'Returns at most 50 tenant-authorized customer summaries with masked identities and exact text-form wallet values.';
comment on function loyalty.get_customer_read_model(uuid, uuid) is
  'Returns one tenant-authorized customer wallet and 100-entry ledger read model with exact text-form point values.';
