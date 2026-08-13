-- Phase 9 merchant customer adjustments. Balance changes remain immutable
-- double-entry transactions; this exposed boundary derives actor and tenant
-- authority from the live request and records administration audit evidence.

create or replace function loyalty.get_customer_adjustment_context(
  target_customer_public_id uuid,
  target_programme_group_public_id uuid
)
returns table (
  customer_public_id uuid,
  available_points text
)
language sql
stable
security definer
set search_path = ''
as $$
  select customer.public_id, balance.points::text
  from loyalty.customers as customer
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = customer.organization_id
   and programme_group.public_id = target_programme_group_public_id
   and programme_group.status = 'active'
  join loyalty.wallets as wallet
    on wallet.organization_id = customer.organization_id
   and wallet.programme_group_id = programme_group.id
   and wallet.customer_id = customer.id
   and wallet.status = 'active'
  join loyalty.wallet_balances as balance
    on balance.organization_id = wallet.organization_id
   and balance.wallet_id = wallet.id
   and balance.account_kind = 'available'
  where customer.public_id = target_customer_public_id
    and customer.status = 'active'
    and loyalty_private.has_organization_role(
      customer.organization_id,
      array['owner', 'admin']::text[]
    );
$$;

create or replace function loyalty.adjust_customer_points_command(
  target_customer_public_id uuid,
  target_programme_group_public_id uuid,
  target_programme_version_public_id uuid,
  target_points bigint,
  target_reason text,
  target_internal_note text,
  target_expires_at timestamptz,
  target_idempotency_key text,
  target_correlation_id uuid
)
returns table (
  transaction_public_id uuid,
  outcome text,
  available_points text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_wallet loyalty.wallets%rowtype;
  target_version loyalty.programme_versions%rowtype;
  existing_audit loyalty.admin_audit_events%rowtype;
  normalized_reason text := btrim(target_reason);
  normalized_note text := nullif(btrim(target_internal_note), '');
  request_hash bytea;
  posted record;
  ledger_correlation_id uuid;
  resulting_available_points text;
begin
  if actor_user_id is null
    or target_customer_public_id is null
    or target_programme_group_public_id is null
    or target_programme_version_public_id is null
    or target_points is null
    or target_points = 0
    or target_reason is null
    or target_reason <> normalized_reason
    or length(normalized_reason) not between 8 and 500
    or normalized_reason ~ '[[:cntrl:]]'
    or target_idempotency_key is null
    or length(btrim(target_idempotency_key)) not between 1 and 255
    or target_idempotency_key <> btrim(target_idempotency_key)
    or target_correlation_id is null
    or (target_internal_note is not null and target_internal_note <> coalesce(normalized_note, ''))
    or (normalized_note is not null and (
      length(normalized_note) > 500 or normalized_note ~ '[[:cntrl:]]'
    )) then
    raise exception using errcode = '22023', message = 'invalid customer adjustment command';
  end if;
  if target_points > 0
    and (target_expires_at is null or target_expires_at <= clock_timestamp()) then
    raise exception using errcode = '22023', message = 'positive adjustment requires a future expiry';
  end if;
  if target_points < 0 and target_expires_at is not null then
    raise exception using errcode = '22023', message = 'negative adjustment cannot have an expiry';
  end if;

  select wallet.* into target_wallet
  from loyalty.customers as customer
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = customer.organization_id
   and programme_group.public_id = target_programme_group_public_id
   and programme_group.status = 'active'
  join loyalty.wallets as wallet
    on wallet.organization_id = customer.organization_id
   and wallet.programme_group_id = programme_group.id
   and wallet.customer_id = customer.id
   and wallet.status = 'active'
  where customer.public_id = target_customer_public_id
    and customer.status = 'active'
    and loyalty_private.has_organization_role(
      customer.organization_id,
      array['owner', 'admin']::text[]
    )
  for update of wallet;
  if not found then
    raise exception using errcode = '42501', message = 'customer adjustment not authorized';
  end if;

  select version.* into target_version
  from loyalty.programme_versions as version
  where version.public_id = target_programme_version_public_id
    and version.organization_id = target_wallet.organization_id
    and version.programme_group_id = target_wallet.programme_group_id
    and version.status = 'published';
  if not found then
    raise exception using errcode = '22023', message = 'adjustment requires the current published programme version';
  end if;

  request_hash := extensions.digest(
    convert_to(
      'customer.points.adjust|' || target_customer_public_id::text || '|' ||
      target_programme_group_public_id::text || '|' ||
      target_version.public_id::text || '|' || target_points::text || '|' ||
      normalized_reason || '|' || coalesce(normalized_note, '') || '|' ||
      coalesce(extract(epoch from target_expires_at)::text, ''),
      'UTF8'
    ),
    'sha256'
  );

  select audit.* into existing_audit
  from loyalty.admin_audit_events as audit
  where audit.organization_id = target_wallet.organization_id
    and audit.idempotency_key = target_idempotency_key;
  if found then
    if existing_audit.action <> 'customer.points.adjust'
      or existing_audit.request_sha256 <> request_hash then
      raise exception using errcode = '23514', message = 'customer adjustment idempotency conflict';
    end if;
    select balance.points::text into resulting_available_points
    from loyalty.wallet_balances as balance
    where balance.organization_id = target_wallet.organization_id
      and balance.wallet_id = target_wallet.id
      and balance.account_kind = 'available';
    return query select existing_audit.resource_public_id, 'duplicate'::text,
      resulting_available_points;
    return;
  end if;

  select adjustment.transaction_public_id, adjustment.outcome
  into posted
  from loyalty_private.adjust_points(
    target_wallet.organization_id,
    target_wallet.public_id,
    target_version.id,
    target_points,
    normalized_reason,
    actor_user_id::text,
    target_idempotency_key,
    request_hash,
    target_expires_at,
    clock_timestamp()
  ) as adjustment;

  select transaction.correlation_id into ledger_correlation_id
  from loyalty.ledger_transactions as transaction
  where transaction.organization_id = target_wallet.organization_id
    and transaction.public_id = posted.transaction_public_id;

  insert into loyalty.admin_audit_events (
    organization_id, actor_user_id, action, resource_type,
    resource_public_id, idempotency_key, request_sha256, correlation_id,
    metadata
  ) values (
    target_wallet.organization_id, actor_user_id,
    'customer.points.adjust', 'ledger_transaction',
    posted.transaction_public_id, target_idempotency_key, request_hash,
    target_correlation_id,
    jsonb_build_object(
      'customerPublicId', target_customer_public_id,
      'programmeGroupPublicId', target_programme_group_public_id,
      'programmeVersionPublicId', target_version.public_id,
      'points', target_points::text,
      'reason', normalized_reason,
      'internalNote', normalized_note,
      'expiresAt', target_expires_at,
      'ledgerCorrelationId', ledger_correlation_id
    )
  );

  select balance.points::text into resulting_available_points
  from loyalty.wallet_balances as balance
  where balance.organization_id = target_wallet.organization_id
    and balance.wallet_id = target_wallet.id
    and balance.account_kind = 'available';
  return query select posted.transaction_public_id, posted.outcome,
    resulting_available_points;
end;
$$;

alter function loyalty.get_customer_adjustment_context(uuid, uuid)
  owner to loyalty_owner;
alter function loyalty.adjust_customer_points_command(
  uuid, uuid, uuid, bigint, text, text, timestamptz, text, uuid
) owner to loyalty_owner;

revoke all on function loyalty.get_customer_adjustment_context(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty.adjust_customer_points_command(
  uuid, uuid, uuid, bigint, text, text, timestamptz, text, uuid
) from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_customer_adjustment_context(uuid, uuid)
  to authenticated;
grant execute on function loyalty.adjust_customer_points_command(
  uuid, uuid, uuid, bigint, text, text, timestamptz, text, uuid
) to authenticated;

comment on function loyalty.get_customer_adjustment_context(uuid, uuid) is
  'Returns an exact text-form available balance only to live owner/admin roles for adjustment preview.';
comment on function loyalty.adjust_customer_points_command(
  uuid, uuid, uuid, bigint, text, text, timestamptz, text, uuid
) is 'Creates one attributable immutable manual-adjustment transaction and matching administration audit event.';
