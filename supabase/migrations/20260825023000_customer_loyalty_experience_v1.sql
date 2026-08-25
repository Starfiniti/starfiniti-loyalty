-- M09 strict, Auth-derived customer experience. The caller supplies no tenant,
-- customer, connection, workspace, programme, or account selector. Existing
-- customer reads remain available for backward compatibility.

create or replace function loyalty.get_my_loyalty_experiences_v1()
returns table (account_id uuid, experience jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with projection_clock as materialized (
    select pg_catalog.transaction_timestamp() as as_of
  ), account as materialized (
    select * from loyalty.get_my_loyalty_accounts()
  ), tier_progress as materialized (
    select progress.account_id, progress.tier_progress
    from loyalty.get_my_tier_progress_v1(
      (select clock.as_of from projection_clock as clock)
    ) as progress
  ), referral as materialized (
    select * from loyalty.get_my_referral_experiences_v1()
  )
  select account.account_id,
    pg_catalog.jsonb_build_object(
      'version', '1',
      'asOf', clock.as_of,
      'accountId', account.account_id,
      'workspaceId', account.workspace_id,
      'programmeId', account.programme_id,
      'storeName', case
        when account.store_name ~ '[<>[:cntrl:]]' then 'Store'
        else account.store_name
      end,
      'programmeName', case
        when account.programme_name is null then null
        when account.programme_name ~ '[<>[:cntrl:]]' then 'Loyalty programme'
        else account.programme_name
      end,
      'accountStatus', account.account_status,
      'enhancementsEnabled', coalesce(entitlement.enabled, false),
      'balances', pg_catalog.jsonb_build_object(
        'pending', account.pending_points,
        'available', account.available_points,
        'reserved', account.reserved_points
      ),
      'currentTier', case
        when account.tier_code is null or account.tier_name is null then null
        else pg_catalog.jsonb_build_object(
          'code', account.tier_code,
          'name', account.tier_name
        )
      end,
      'nextExpiry', case
        when account.next_expiry_points is null
          or account.next_expiry_at is null then null
        else pg_catalog.jsonb_build_object(
          'points', account.next_expiry_points,
          'expiresAt', account.next_expiry_at
        )
      end,
      'earningMethods', coalesce(earning.items, '[]'::jsonb),
      'rewards', account.rewards,
      'reservations', account.reservations,
      'activity', account.activity,
      'tierProgress', tier_progress.tier_progress,
      'referral', case when referral.account_id is null then null
        else pg_catalog.jsonb_build_object(
          'accountId', referral.account_id,
          'sharingState', referral.sharing_state,
          'shareUrl', referral.share_url,
          'advocateRewardPoints', referral.advocate_reward_points,
          'friendRewardPoints', referral.friend_reward_points,
          'minimumEligibleSpendMinor', referral.minimum_eligible_spend_minor,
          'currencyCode', referral.currency_code,
          'currencyMinorUnitDigits', referral.currency_minor_unit_digits,
          'qualificationStatus', referral.qualification_status,
          'coolingDays', referral.cooling_days,
          'counts', pg_catalog.jsonb_build_object(
            'total', referral.total_count,
            'pending', referral.pending_count,
            'qualified', referral.qualified_count,
            'rejected', referral.rejected_count,
            'reversed', referral.reversed_count
          ),
          'history', referral.history
        )
      end
    ) as experience
  from account
  cross join projection_clock as clock
  join loyalty.customer_user_links as link
    on link.public_id = account.account_id
   and link.auth_user_id = loyalty_private.request_user_id()
   and link.revoked_at is null
  left join tier_progress on tier_progress.account_id = account.account_id
  left join referral on referral.account_id = account.account_id
  left join lateral loyalty_private.resolve_organization_entitlement(
    link.organization_id,
    'storefront.experience',
    'customer-account:' || account.account_id::text,
    clock.as_of
  ) as entitlement on true
  left join lateral (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'code', method.code,
          'name', method.name,
          'source', method.source,
          'effect', method.effect,
          'cap', method.cap,
          'hasRestrictions', method.purchase_exclusions is not null
            or method.conditions <> pg_catalog.jsonb_build_object(
              'productIds', '[]'::jsonb,
              'categoryIds', '[]'::jsonb,
              'currencyCodes', '[]'::jsonb,
              'markets', '[]'::jsonb,
              'channels', '[]'::jsonb,
              'activityCodes', '[]'::jsonb,
              'segmentCodes', '[]'::jsonb,
              'tierCodes', '[]'::jsonb,
              'startsAt', null,
              'endsAt', null
            ),
          'startsAt', method.conditions -> 'startsAt',
          'endsAt', method.conditions -> 'endsAt',
          'availableNow',
            (method.conditions ->> 'startsAt' is null
              or (method.conditions ->> 'startsAt')::timestamptz <= clock.as_of)
            and (method.conditions ->> 'endsAt' is null
              or (method.conditions ->> 'endsAt')::timestamptz > clock.as_of)
        ) order by method.ordinal, method.code
      ),
      '[]'::jsonb
    ) as items
    from (
      select rule.*
      from loyalty.programmes as programme
      join loyalty.programme_versions as version
        on version.organization_id = programme.organization_id
       and version.programme_id = programme.id
       and version.status = 'published'
      join loyalty.programme_earning_rules as rule
        on rule.organization_id = version.organization_id
       and rule.programme_version_id = version.id
       and rule.enabled
      where programme.public_id = account.programme_id
        and programme.organization_id = link.organization_id
        and rule.name !~ '[<>[:cntrl:]]'
        and (rule.conditions ->> 'endsAt' is null
          or (rule.conditions ->> 'endsAt')::timestamptz > clock.as_of)
      order by version.version_number desc, version.id desc,
        rule.ordinal, rule.code
      limit 24
    ) as method
  ) as earning on true
  order by account.account_id;
$$;

alter function loyalty.get_my_loyalty_experiences_v1() owner to loyalty_owner;
revoke all on function loyalty.get_my_loyalty_experiences_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_my_loyalty_experiences_v1()
  to authenticated;

comment on function loyalty.get_my_loyalty_experiences_v1() is
  'Returns one strict, bounded, single-statement customer experience per active Auth-derived link; entitlement controls enhancements but never removes core loyalty value.';
