-- Phase 9 minimized customer tier visibility. Qualification state is derived
-- from immutable tier decisions and current membership intervals; internal
-- explanation and request fingerprints remain outside the Data API result.

create or replace function loyalty.get_customer_tier_read_model(
  target_customer_public_id uuid,
  target_programme_group_public_id uuid
)
returns table (
  customer_id uuid,
  tier_code text,
  tier_name text,
  qualified_tier_code text,
  qualified_tier_name text,
  transition text,
  rolling_eligible_spend_minor text,
  below_threshold_since timestamptz,
  grace_until timestamptz,
  effective_from timestamptz,
  decided_at timestamptz
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
  if target_customer_public_id is null
    or target_programme_group_public_id is null then
    raise exception using errcode = '22023', message = 'invalid customer tier request';
  end if;

  select customer.organization_id, customer.id, programme_group.id
  into selected_organization_id, selected_customer_id, selected_programme_group_id
  from loyalty.customers as customer
  join loyalty.organizations as organization
    on organization.id = customer.organization_id
   and organization.status = 'active'
  join loyalty.programme_groups as programme_group
    on programme_group.organization_id = customer.organization_id
   and programme_group.public_id = target_programme_group_public_id
   and programme_group.status = 'active'
  where customer.public_id = target_customer_public_id
    and loyalty_private.is_organization_member(customer.organization_id);
  if not found then
    return;
  end if;

  return query
  select customer.public_id,
    membership.tier_code,
    current_tier.name,
    decision.qualified_tier_code,
    qualified_tier.name,
    decision.transition,
    decision.rolling_eligible_spend_minor::text,
    decision.below_threshold_since,
    decision.grace_until,
    membership.effective_from,
    decision.effective_at
  from loyalty.customers as customer
  left join loyalty.wallets as wallet
    on wallet.organization_id = customer.organization_id
   and wallet.programme_group_id = selected_programme_group_id
   and wallet.customer_id = customer.id
  left join loyalty.tier_memberships as membership
    on membership.organization_id = customer.organization_id
   and membership.programme_group_id = selected_programme_group_id
   and membership.wallet_id = wallet.id
   and membership.effective_until is null
  left join loyalty.tier_decisions as decision
    on decision.organization_id = membership.organization_id
   and decision.programme_group_id = membership.programme_group_id
   and decision.programme_version_id = membership.programme_version_id
   and decision.wallet_id = membership.wallet_id
   and decision.id = membership.decision_id
  left join loyalty.programme_tiers as current_tier
    on current_tier.organization_id = membership.organization_id
   and current_tier.programme_version_id = membership.programme_version_id
   and current_tier.code = membership.tier_code
  left join loyalty.programme_tiers as qualified_tier
    on qualified_tier.organization_id = decision.organization_id
   and qualified_tier.programme_version_id = decision.programme_version_id
   and qualified_tier.code = decision.qualified_tier_code
  where customer.organization_id = selected_organization_id
    and customer.id = selected_customer_id;
end;
$$;

alter function loyalty.get_customer_tier_read_model(uuid, uuid)
  owner to loyalty_owner;
revoke all on function loyalty.get_customer_tier_read_model(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_customer_tier_read_model(uuid, uuid)
  to authenticated;

comment on function loyalty.get_customer_tier_read_model(uuid, uuid) is
  'Returns one tenant-authorized current tier and minimized immutable qualification state with exact text-form spend.';
