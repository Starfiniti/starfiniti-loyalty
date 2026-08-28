-- M09 Auth-derived customer purchase campaign opportunities. The caller
-- supplies no tenant, customer, account, programme, wallet, campaign, audience,
-- or assignment selector. V2 remains immutable and callable for rolling deploys.

create or replace function loyalty.get_my_loyalty_experiences_v3()
returns table (account_id uuid, experience jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with projection_clock as materialized (
    select pg_catalog.transaction_timestamp() as as_of
  ), legacy as materialized (
    select * from loyalty.get_my_loyalty_experiences_v2()
  )
  select legacy.account_id,
    (legacy.experience - 'version') || pg_catalog.jsonb_build_object(
      'version', '3',
      'campaignOpportunities', coalesce(opportunities.items, '[]'::jsonb)
    ) as experience
  from legacy
  cross join projection_clock as clock
  join loyalty.customer_user_links as customer_link
    on customer_link.public_id = legacy.account_id
   and customer_link.auth_user_id = loyalty_private.request_user_id()
   and customer_link.revoked_at is null
  join loyalty.commerce_connections as connection
    on connection.organization_id = customer_link.organization_id
   and connection.id = customer_link.source_connection_id
  left join loyalty.programmes as programme
    on programme.organization_id = connection.organization_id
   and programme.id = connection.programme_id
   and programme.public_id = (legacy.experience ->> 'programmeId')::uuid
  left join loyalty.wallets as wallet
    on wallet.organization_id = customer_link.organization_id
   and wallet.programme_group_id = programme.programme_group_id
   and wallet.customer_id = customer_link.customer_id
  left join lateral (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'code', candidate.display_code,
          'name', candidate.safe_name,
          'description', candidate.safe_description,
          'state', candidate.presentation_state,
          'startsAt', candidate.starts_at,
          'endsAt', candidate.ends_at,
          'hasPurchaseRestrictions', candidate.has_purchase_restrictions,
          'effect', candidate.safe_effect
        ) order by candidate.state_order, candidate.starts_at,
          candidate.campaign_version_public_id
      ),
      '[]'::jsonb
    ) as items
    from (
      select version.public_id as campaign_version_public_id,
        'offer-' || pg_catalog.substr(pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(version.public_id::text, 'UTF8'),
            'sha256'
          ),
          'hex'
        ), 1, 12) as display_code,
        case
          when pg_catalog.length(pg_catalog.btrim(version.definition ->> 'name'))
              between 1 and 200
            and version.definition ->> 'name' !~ '[<>[:cntrl:]]'
            then pg_catalog.btrim(version.definition ->> 'name')
          else 'Member offer'
        end as safe_name,
        case
          when pg_catalog.length(pg_catalog.btrim(
              version.definition ->> 'description')) between 1 and 500
            and version.definition ->> 'description' !~ '[<>[:cntrl:]]'
            then pg_catalog.btrim(version.definition ->> 'description')
          else null
        end as safe_description,
        case
          when loyalty_private.campaign_open_at_v1(version.id, clock.as_of)
            then 'active'
          else 'scheduled'
        end as presentation_state,
        case
          when loyalty_private.campaign_open_at_v1(version.id, clock.as_of)
            then 0
          else 1
        end as state_order,
        version.starts_at,
        version.ends_at,
        true as has_purchase_restrictions,
        case version.definition #>> '{behavior,kind}'
          when 'bonus_points' then pg_catalog.jsonb_build_object(
            'kind', 'bonus_points',
            'points', version.definition #>> '{behavior,reward,points}',
            'combination', 'additive_bonus'
          )
          else pg_catalog.jsonb_build_object(
            'kind', 'purchase_multiplier',
            'multiplierBasisPoints',
              (version.definition #>> '{behavior,multiplierBasisPoints}')::integer,
            'combination', 'highest_eligible_multiplier'
          )
        end as safe_effect
      from loyalty_private.campaign_assignments as assignment
      join loyalty.campaign_versions as version
        on version.organization_id = assignment.organization_id
       and version.programme_group_id = assignment.programme_group_id
       and version.id = assignment.campaign_version_id
      join loyalty.campaigns as campaign
        on campaign.organization_id = version.organization_id
       and campaign.programme_group_id = version.programme_group_id
       and campaign.id = version.campaign_id
       and campaign.programme_id = programme.id
      left join loyalty_private.campaign_capacity_counters as counter
        on counter.organization_id = version.organization_id
       and counter.programme_group_id = version.programme_group_id
       and counter.campaign_version_id = version.id
      where assignment.organization_id = customer_link.organization_id
        and assignment.programme_group_id = programme.programme_group_id
        and assignment.wallet_id = wallet.id
        and assignment.assignment = 'treatment'
        and version.status in ('scheduled', 'active')
        and version.ends_at > clock.as_of
        and version.definition #>> '{behavior,kind}' in (
          'bonus_points', 'purchase_multiplier'
        )
        and coalesce(counter.reserved_effects::numeric, 0)
          + coalesce(counter.committed_effects::numeric, 0)
          < version.global_effect_limit::numeric
        and case version.definition #>> '{behavior,kind}'
          when 'bonus_points' then
            version.maximum_points::numeric
              - coalesce(counter.reserved_points::numeric, 0)
              - coalesce(counter.committed_points::numeric, 0)
              >= (version.definition #>> '{behavior,reward,points}')::numeric
          else
            version.maximum_points::numeric
              - coalesce(counter.reserved_points::numeric, 0)
              - coalesce(counter.committed_points::numeric, 0) > 0
        end
        and (
          (select pg_catalog.count(*)
           from loyalty_private.campaign_effects as effect
           where effect.organization_id = version.organization_id
             and effect.campaign_version_id = version.id
             and effect.wallet_id = wallet.id
             and effect.decision_outcome = 'awarded')
          + (select pg_catalog.count(*)
             from loyalty_private.campaign_capacity_allocations as allocation
             where allocation.organization_id = version.organization_id
               and allocation.campaign_version_id = version.id
               and allocation.wallet_id = wallet.id
               and allocation.state in ('reserved', 'committed'))
        ) < version.per_member_effect_limit::bigint
        and (
          loyalty_private.campaign_open_at_v1(version.id, clock.as_of)
          or version.starts_at > clock.as_of
        )
        and not exists (
          select 1
          from loyalty.admin_audit_events as audit
          where audit.organization_id = version.organization_id
            and audit.resource_type = 'campaign_version'
            and audit.resource_public_id = version.public_id
            and audit.action in (
              'campaign.version.pause', 'campaign.version.cancel'
            )
            and (audit.metadata ->> 'changedAt')::timestamptz <= clock.as_of
        )
      order by state_order, version.starts_at, version.public_id
      limit 8
    ) as candidate
  ) as opportunities on true
  order by legacy.account_id;
$$;

alter function loyalty.get_my_loyalty_experiences_v3() owner to loyalty_owner;
revoke all on function loyalty.get_my_loyalty_experiences_v3()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_my_loyalty_experiences_v3()
  to authenticated;

comment on function loyalty.get_my_loyalty_experiences_v3() is
  'Returns strict Auth-derived V3 customer accounts with bounded treatment-assigned purchase campaign opportunities and no caller selectors.';
