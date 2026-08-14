-- M05 earned-date expiry policy, bounded lifecycle automation, and liability preview.

alter function loyalty_private.validate_programme_definition_v2(jsonb)
  rename to validate_programme_definition_v2_expiry_core;

create or replace function loyalty_private.validate_point_expiry_policy_v2(
  target_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_policy jsonb := target_configuration -> 'pointsExpiryPolicy';
  target_expire_after_days integer;
  lead_value jsonb;
  lead_days integer;
  previous_lead integer;
  seen_leads integer[] := array[]::integer[];
begin
  if coalesce(target_configuration ->> 'version', '') <> '2'
    or target_policy is null then
    return;
  end if;
  if jsonb_typeof(target_policy) <> 'object'
    or not (target_policy ?& array[
      'version', 'method', 'expireAfterDays', 'notificationLeadDays'
    ])
    or target_policy - array[
      'version', 'method', 'expireAfterDays', 'notificationLeadDays'
    ] <> '{}'::jsonb
    or target_policy ->> 'version' <> '2'
    or target_policy ->> 'method' <> 'earned_date'
    or coalesce(target_policy ->> 'expireAfterDays', '') !~ '^[1-9][0-9]{0,3}$'
    or (target_policy ->> 'expireAfterDays')::integer > 3650
    or target_policy ->> 'expireAfterDays' <>
      target_configuration ->> 'pointsExpireAfterDays'
    or jsonb_typeof(target_policy -> 'notificationLeadDays') <> 'array'
    or jsonb_array_length(target_policy -> 'notificationLeadDays') > 5 then
    raise exception using errcode = '22023',
      message = 'invalid PointExpiryPolicyV2';
  end if;
  target_expire_after_days := (target_policy ->> 'expireAfterDays')::integer;
  for lead_value in
    select value from jsonb_array_elements(target_policy -> 'notificationLeadDays')
  loop
    if jsonb_typeof(lead_value) <> 'number'
      or (lead_value #>> '{}') !~ '^[1-9][0-9]{0,3}$'
      or (lead_value #>> '{}')::integer >= target_expire_after_days then
      raise exception using errcode = '22023',
        message = 'invalid point expiry notification lead day';
    end if;
    lead_days := (lead_value #>> '{}')::integer;
    if lead_days = any(seen_leads) then
      raise exception using errcode = '23514',
        message = 'duplicate point expiry notification lead day';
    end if;
    if previous_lead is not null and lead_days >= previous_lead then
      raise exception using errcode = '23514',
        message = 'point expiry notification lead days must descend';
    end if;
    seen_leads := array_append(seen_leads, lead_days);
    previous_lead := lead_days;
  end loop;
end;
$$;

create or replace function loyalty_private.validate_programme_definition_v2(
  target_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform loyalty_private.validate_programme_definition_v2_expiry_core(
    target_configuration - 'pointsExpiryPolicy'
  );
  perform loyalty_private.validate_point_expiry_policy_v2(target_configuration);
end;
$$;

create table loyalty.programme_point_expiry_policies (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  organization_id bigint not null,
  programme_group_id bigint not null,
  programme_version_id bigint not null,
  method text not null check (method = 'earned_date'),
  expire_after_days smallint not null check (expire_after_days between 1 and 3650),
  notification_lead_days smallint[] not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, programme_version_id),
  foreign key (organization_id, programme_group_id, programme_version_id)
    references loyalty.programme_versions(
      organization_id, programme_group_id, id
    ) on delete restrict,
  check (cardinality(notification_lead_days) <= 5),
  check (0 < all(notification_lead_days)),
  check (expire_after_days > all(notification_lead_days))
);

create index programme_point_expiry_policies_group_idx
  on loyalty.programme_point_expiry_policies (
    organization_id, programme_group_id, programme_version_id
  );
create index point_lots_expiry_scheduler_idx
  on loyalty.point_lots (
    expires_at, organization_id, wallet_id, programme_version_id, id
  );

alter table loyalty.programme_point_expiry_policies owner to loyalty_owner;
create trigger programme_point_expiry_policies_immutable
before update or delete on loyalty.programme_point_expiry_policies
for each row execute function loyalty_private.reject_immutable_change();

create or replace function loyalty_private.materialize_point_expiry_policy_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_policy jsonb := new.configuration -> 'pointsExpiryPolicy';
  target_expire_after_days integer;
  target_lead_days smallint[];
begin
  if new.status not in ('published', 'scheduled')
    or (tg_op = 'UPDATE' and old.status <> 'draft')
    or coalesce(new.configuration ->> 'version', '') <> '2' then
    return new;
  end if;
  perform loyalty_private.validate_point_expiry_policy_v2(new.configuration);
  target_expire_after_days := (new.configuration ->> 'pointsExpireAfterDays')::integer;
  if target_policy is null then
    select coalesce(array_agg(lead_days order by lead_days desc), '{}'::smallint[])
      into target_lead_days
    from unnest(array[30, 14, 7]::smallint[]) as lead(lead_days)
    where lead_days < target_expire_after_days;
  else
    select coalesce(array_agg(value::smallint order by ordinality), '{}'::smallint[])
      into target_lead_days
    from jsonb_array_elements_text(target_policy -> 'notificationLeadDays')
      with ordinality as lead(value, ordinality);
  end if;
  insert into loyalty.programme_point_expiry_policies (
    organization_id, programme_group_id, programme_version_id,
    method, expire_after_days, notification_lead_days
  ) values (
    new.organization_id, new.programme_group_id, new.id,
    'earned_date', target_expire_after_days, target_lead_days
  );
  return new;
end;
$$;

create trigger programme_versions_materialize_point_expiry_policy
after insert or update of status on loyalty.programme_versions
for each row execute function loyalty_private.materialize_point_expiry_policy_v2();

insert into loyalty.programme_point_expiry_policies (
  organization_id, programme_group_id, programme_version_id,
  method, expire_after_days, notification_lead_days
)
select version.organization_id, version.programme_group_id, version.id,
  'earned_date',
  (version.configuration ->> 'pointsExpireAfterDays')::integer,
  case when version.configuration ? 'pointsExpiryPolicy' then
    array(
      select value::smallint
      from jsonb_array_elements_text(
        version.configuration -> 'pointsExpiryPolicy' -> 'notificationLeadDays'
      ) with ordinality as lead(value, ordinality)
      order by ordinality
    )
  else array(
    select lead_days
    from unnest(array[30, 14, 7]::smallint[]) as lead(lead_days)
    where lead_days < (version.configuration ->> 'pointsExpireAfterDays')::integer
    order by lead_days desc
  ) end
from loyalty.programme_versions as version
where version.configuration ->> 'version' = '2'
  and version.status in ('published', 'scheduled')
on conflict (organization_id, programme_version_id) do nothing;

create or replace function loyalty_private.expire_points(
  target_organization_id bigint,
  target_wallet_public_id uuid,
  target_programme_version_id bigint,
  target_as_of timestamptz,
  target_idempotency_key text,
  target_request_sha256 bytea
)
returns table (transaction_public_id uuid, expired_points bigint, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_wallet loyalty.wallets%rowtype;
  available_account_id bigint;
  expired_account_id bigint;
  total_to_expire bigint := 0;
  candidate record;
  posted record;
begin
  select wallet.* into target_wallet from loyalty.wallets as wallet
  where wallet.public_id = target_wallet_public_id
    and wallet.organization_id = target_organization_id and wallet.status = 'active';
  if not found then
    raise exception using errcode = '22023', message = 'unknown active wallet';
  end if;
  perform 1 from loyalty.programme_versions as version
  where version.id = target_programme_version_id
    and version.organization_id = target_organization_id
    and version.programme_group_id = target_wallet.programme_group_id;
  if not found then
    raise exception using errcode = '22023',
      message = 'programme version does not belong to wallet';
  end if;
  perform 1 from loyalty.wallet_balances as balance
  where balance.organization_id = target_organization_id
    and balance.wallet_id = target_wallet.id
  order by balance.ledger_account_id for update;
  select account.id into available_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet.id and account.account_kind = 'available';
  select account.id into expired_account_id from loyalty.ledger_accounts as account
  where account.organization_id = target_organization_id
    and account.wallet_id = target_wallet.id and account.account_kind = 'expired';
  select coalesce(sum(balance.remaining_points), 0) into total_to_expire
  from loyalty.point_lots as lot
  join loyalty.point_lot_balances as balance
    on balance.organization_id = lot.organization_id and balance.lot_id = lot.id
  where lot.organization_id = target_organization_id
    and lot.wallet_id = target_wallet.id
    and lot.programme_version_id = target_programme_version_id
    and lot.expires_at <= target_as_of and balance.remaining_points > 0;
  if total_to_expire <= 0 then
    raise exception using errcode = '22023', message = 'no eligible points to expire';
  end if;

  select * into posted from loyalty_private.post_ledger_transaction(
    target_organization_id, target_wallet.programme_group_id,
    target_programme_version_id, 'expire', 'system', 'expiry-scheduler',
    null, null, null, target_idempotency_key, target_request_sha256, null,
    jsonb_build_object(
      'as_of', target_as_of, 'points', total_to_expire,
      'programme_version_id', target_programme_version_id
    ), target_as_of,
    jsonb_build_array(
      jsonb_build_object('account_id', available_account_id, 'points', -total_to_expire),
      jsonb_build_object('account_id', expired_account_id, 'points', total_to_expire)
    )
  );
  if posted.outcome = 'created' then
    for candidate in
      select lot.id, balance.remaining_points
      from loyalty.point_lots as lot
      join loyalty.point_lot_balances as balance
        on balance.organization_id = lot.organization_id and balance.lot_id = lot.id
      where lot.organization_id = target_organization_id
        and lot.wallet_id = target_wallet.id
        and lot.programme_version_id = target_programme_version_id
        and lot.expires_at <= target_as_of and balance.remaining_points > 0
      order by lot.expires_at, lot.available_at, lot.id
      for update of balance
    loop
      insert into loyalty.redemption_allocations (
        organization_id, transaction_id, lot_id, allocation_kind, points
      ) values (
        target_organization_id, posted.transaction_id, candidate.id,
        'expire', candidate.remaining_points
      );
    end loop;
  end if;
  return query select posted.transaction_public_id, total_to_expire, posted.outcome;
end;
$$;

create or replace function loyalty_private.run_point_expiry_lifecycle_v2(
  target_as_of timestamptz default now(),
  target_limit integer default 100
)
returns table (
  expiry_batches integer,
  expired_lots bigint,
  expired_points bigint,
  notifications_enqueued integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  expiry_result record;
  notification_id bigint;
  created_outbox_id bigint;
  batch_count integer := 0;
  lot_count bigint := 0;
  point_count bigint := 0;
  notification_count integer := 0;
  expired_lot_count bigint;
  caught_message text;
  request_hash bytea;
begin
  if target_as_of is null or target_limit is null or target_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid point expiry lifecycle sweep';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtext('loyalty.point-expiry-lifecycle-v2')
  ) then
    return query select 0, 0::bigint, 0::bigint, 0;
    return;
  end if;

  for candidate in
    select lot.organization_id, lot.wallet_id, wallet.public_id as wallet_public_id,
      lot.programme_version_id,
      string_agg(lot.id::text, ',' order by lot.id) as lot_identity
    from loyalty.point_lots as lot
    join loyalty.point_lot_balances as balance
      on balance.organization_id = lot.organization_id and balance.lot_id = lot.id
    join loyalty.wallets as wallet
      on wallet.organization_id = lot.organization_id and wallet.id = lot.wallet_id
    where lot.expires_at <= target_as_of and balance.remaining_points > 0
      and wallet.status = 'active'
    group by lot.organization_id, lot.wallet_id, wallet.public_id,
      lot.programme_version_id
    order by min(lot.expires_at), lot.organization_id, lot.wallet_id,
      lot.programme_version_id
    limit target_limit
  loop
    request_hash := extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.concat_ws('|', 'expiry-v2', candidate.organization_id::text,
          candidate.wallet_id::text, candidate.programme_version_id::text,
          candidate.lot_identity, target_as_of::text),
        'utf8'
      ), 'sha256'
    );
    begin
      select * into strict expiry_result from loyalty_private.expire_points(
        candidate.organization_id, candidate.wallet_public_id,
        candidate.programme_version_id, target_as_of,
        'expiry:v2:' || pg_catalog.encode(request_hash, 'hex'), request_hash
      );
      batch_count := batch_count + 1;
      select count(*)::bigint into strict expired_lot_count
      from loyalty.ledger_transactions as transaction
      join loyalty.redemption_allocations as allocation
        on allocation.organization_id = transaction.organization_id
       and allocation.transaction_id = transaction.id
       and allocation.allocation_kind = 'expire'
      where transaction.organization_id = candidate.organization_id
        and transaction.public_id = expiry_result.transaction_public_id;
      lot_count := lot_count + expired_lot_count;
      point_count := point_count + expiry_result.expired_points;
    exception when sqlstate '22023' then
      get stacked diagnostics caught_message = message_text;
      if caught_message <> 'no eligible points to expire' then
        raise;
      end if;
    end;
  end loop;

  for candidate in
    select lot.organization_id, lot.id as lot_id, lot.public_id as lot_public_id,
      lot.wallet_id, wallet.public_id as wallet_public_id,
      balance.remaining_points, lot.expires_at, lead.lead_days
    from loyalty.point_lots as lot
    join loyalty.point_lot_balances as balance
      on balance.organization_id = lot.organization_id and balance.lot_id = lot.id
    join loyalty.wallets as wallet
      on wallet.organization_id = lot.organization_id and wallet.id = lot.wallet_id
    left join loyalty.programme_point_expiry_policies as policy
      on policy.organization_id = lot.organization_id
     and policy.programme_version_id = lot.programme_version_id
    cross join lateral (
      select min(candidate_lead)::smallint as lead_days
      from unnest(
        coalesce(policy.notification_lead_days, array[30]::smallint[])
      ) as configured(candidate_lead)
      where lot.expires_at <=
        target_as_of + make_interval(days => configured.candidate_lead)
    ) as lead
    left join loyalty_private.point_expiry_notifications as notification
      on notification.organization_id = lot.organization_id
     and notification.lot_id = lot.id
     and notification.notify_before_days = lead.lead_days
    where balance.remaining_points > 0 and lot.expires_at > target_as_of
      and lead.lead_days is not null
      and notification.id is null
    order by lot.expires_at, lot.id, lead.lead_days desc
    limit target_limit
  loop
    notification_id := null;
    insert into loyalty_private.point_expiry_notifications (
      organization_id, wallet_id, lot_id, notify_before_days,
      points_snapshot, expires_at
    ) values (
      candidate.organization_id, candidate.wallet_id, candidate.lot_id,
      candidate.lead_days, candidate.remaining_points, candidate.expires_at
    ) on conflict (organization_id, lot_id, notify_before_days) do nothing
    returning id into notification_id;
    if notification_id is not null then
      insert into loyalty_private.transactional_outbox (
        organization_id, topic, payload_version, payload, available_at
      ) values (
        candidate.organization_id, 'loyalty.points.expiring', 'v2',
        jsonb_build_object(
          'walletId', candidate.wallet_public_id,
          'lotId', candidate.lot_public_id,
          'points', candidate.remaining_points,
          'expiresAt', candidate.expires_at,
          'notifyBeforeDays', candidate.lead_days,
          'expiryMethod', 'earned_date'
        ), target_as_of
      ) returning id into created_outbox_id;
      update loyalty_private.point_expiry_notifications
      set outbox_id = created_outbox_id where id = notification_id;
      notification_count := notification_count + 1;
    end if;
  end loop;
  return query select batch_count, lot_count, point_count, notification_count;
end;
$$;

create or replace function loyalty.get_programme_expiry_liability_v2(
  target_programme_public_id uuid,
  target_as_of timestamptz default now()
)
returns table (
  outstanding_points text,
  overdue_points text,
  reserved_past_expiry_points text,
  expiring_30_days text,
  expiring_90_days text,
  affected_members text,
  next_expiry_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_programme loyalty.programmes%rowtype;
begin
  if target_programme_public_id is null or target_as_of is null then
    raise exception using errcode = '22023', message = 'invalid expiry liability request';
  end if;
  select programme.* into target_programme
  from loyalty.programmes as programme
  where programme.public_id = target_programme_public_id
    and loyalty_private.is_organization_member(programme.organization_id);
  if not found then
    raise exception using errcode = '42501', message = 'programme access denied';
  end if;
  return query
  with lot_exposure as (
    select lot.wallet_id, lot.expires_at, balance.remaining_points,
      coalesce(sum(reserve_allocation.points) filter (
        where resolution.id is null
      ), 0)::bigint as unresolved_reserved_points
    from loyalty.programme_versions as version
    join loyalty.point_lots as lot
      on lot.organization_id = version.organization_id
     and lot.programme_version_id = version.id
    join loyalty.point_lot_balances as balance
      on balance.organization_id = lot.organization_id
     and balance.lot_id = lot.id
    left join loyalty.redemption_allocations as reserve_allocation
      on reserve_allocation.organization_id = lot.organization_id
     and reserve_allocation.lot_id = lot.id
     and reserve_allocation.allocation_kind = 'reserve'
    left join loyalty.ledger_transactions as reservation
      on reservation.organization_id = reserve_allocation.organization_id
     and reservation.id = reserve_allocation.transaction_id
     and reservation.transaction_kind = 'reserve'
    left join loyalty.ledger_transactions as resolution
      on resolution.organization_id = reservation.organization_id
     and resolution.related_transaction_id = reservation.id
     and resolution.transaction_kind in ('capture', 'cancel')
    where version.organization_id = target_programme.organization_id
      and version.programme_id = target_programme.id
    group by lot.id, lot.wallet_id, lot.expires_at, balance.remaining_points
  )
  select
    coalesce(sum(
      exposure.remaining_points + exposure.unresolved_reserved_points
    ), 0)::text,
    coalesce(sum(exposure.remaining_points) filter (
      where exposure.expires_at <= target_as_of
    ), 0)::text,
    coalesce(sum(exposure.unresolved_reserved_points) filter (
      where exposure.expires_at <= target_as_of
    ), 0)::text,
    coalesce(sum(
      exposure.remaining_points + exposure.unresolved_reserved_points
    ) filter (
      where exposure.expires_at > target_as_of
        and exposure.expires_at <= target_as_of + interval '30 days'
    ), 0)::text,
    coalesce(sum(
      exposure.remaining_points + exposure.unresolved_reserved_points
    ) filter (
      where exposure.expires_at > target_as_of
        and exposure.expires_at <= target_as_of + interval '90 days'
    ), 0)::text,
    count(distinct exposure.wallet_id) filter (
      where exposure.remaining_points + exposure.unresolved_reserved_points > 0
    )::text,
    min(exposure.expires_at) filter (
      where exposure.remaining_points + exposure.unresolved_reserved_points > 0
        and exposure.expires_at > target_as_of
    )
  from lot_exposure as exposure;
end;
$$;

alter function loyalty_private.validate_programme_definition_v2_expiry_core(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.validate_point_expiry_policy_v2(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.validate_programme_definition_v2(jsonb)
  owner to loyalty_owner;
alter function loyalty_private.materialize_point_expiry_policy_v2()
  owner to loyalty_owner;
alter function loyalty_private.expire_points(
  bigint, uuid, bigint, timestamptz, text, bytea
) owner to loyalty_owner;
alter function loyalty_private.run_point_expiry_lifecycle_v2(timestamptz, integer)
  owner to loyalty_owner;
alter function loyalty.get_programme_expiry_liability_v2(uuid, timestamptz)
  owner to loyalty_owner;

revoke all on function
  loyalty_private.validate_programme_definition_v2_expiry_core(jsonb),
  loyalty_private.validate_point_expiry_policy_v2(jsonb),
  loyalty_private.validate_programme_definition_v2(jsonb),
  loyalty_private.materialize_point_expiry_policy_v2(),
  loyalty_private.expire_points(bigint, uuid, bigint, timestamptz, text, bytea),
  loyalty_private.run_point_expiry_lifecycle_v2(timestamptz, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.get_programme_expiry_liability_v2(uuid, timestamptz)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.run_point_expiry_lifecycle_v2(
  timestamptz, integer
) to loyalty_worker;
grant execute on function loyalty.get_programme_expiry_liability_v2(uuid, timestamptz)
  to authenticated;

alter table loyalty.programme_point_expiry_policies enable row level security;
create policy programme_point_expiry_policies_member_select
  on loyalty.programme_point_expiry_policies for select to authenticated
  using ((select loyalty_private.is_organization_member(organization_id)));
grant select on loyalty.programme_point_expiry_policies to authenticated;

comment on table loyalty.programme_point_expiry_policies is
  'Immutable earned-date expiry and reminder policy materialized per published programme version.';
comment on function loyalty_private.run_point_expiry_lifecycle_v2(timestamptz, integer) is
  'Runs bounded, single-flight, version-attributed point expiry and exactly-once reminder scheduling.';
comment on function loyalty.get_programme_expiry_liability_v2(uuid, timestamptz) is
  'Returns tenant-scoped aggregate point expiry exposure without customer identities.';
