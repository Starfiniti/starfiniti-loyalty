-- M04/M09 follow-up: guest-safe reward discovery derived from the immutable
-- published reward rows. V1-V4 remain available for rolling compatibility.

create or replace function loyalty.get_public_loyalty_experience_v5(
  target_workspace_public_id uuid,
  target_programme_public_id uuid
)
returns table (
  workspace_public_id uuid,
  programme_public_id uuid,
  programme_group_public_id uuid,
  programme_name text,
  requested_locale text,
  resolved_locale text,
  presentation jsonb,
  tiers jsonb,
  vip_catalogue jsonb,
  earning_methods jsonb,
  reward_catalogue jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with public_document as materialized (
    select *
    from loyalty.get_public_loyalty_experience_v4(
      target_workspace_public_id,
      target_programme_public_id
    )
  ), exact_scope as materialized (
    select
      document.*,
      workspace.organization_id,
      programme_group.id as programme_group_id,
      programme.id as programme_id,
      version.id as programme_version_id,
      version.configuration ->> 'version' as configuration_version,
      case when version.configuration ->> 'currencyCode' ~ '^[A-Z]{3}$'
        then version.configuration ->> 'currencyCode' else null end
        as currency_code,
      case when loyalty_private.try_parse_public_integer(
        version.configuration ->> 'currencyMinorUnitDigits'
      ) between 0 and 6 then loyalty_private.try_parse_public_integer(
        version.configuration ->> 'currencyMinorUnitDigits'
      ) else null end as currency_minor_unit_digits
    from public_document as document
    join loyalty.workspaces as workspace
      on workspace.public_id = document.workspace_public_id
     and workspace.status = 'active'
    join loyalty.programme_groups as programme_group
      on programme_group.organization_id = workspace.organization_id
     and programme_group.public_id = document.programme_group_public_id
     and programme_group.status = 'active'
    join loyalty.programme_group_workspaces as group_workspace
      on group_workspace.organization_id = workspace.organization_id
     and group_workspace.workspace_id = workspace.id
     and group_workspace.programme_group_id = programme_group.id
    join loyalty.programmes as programme
      on programme.organization_id = programme_group.organization_id
     and programme.programme_group_id = programme_group.id
     and programme.public_id = document.programme_public_id
     and programme.status = 'active'
    join loyalty.programme_versions as version
      on version.organization_id = programme.organization_id
     and version.programme_id = programme.id
     and version.status = 'published'
    limit 1
  ), reward_candidates as materialized (
    select
      reward.id,
      reward.name,
      reward.reward_kind,
      reward.cost_points,
      reward.configuration,
      scope.configuration_version,
      scope.currency_code,
      scope.currency_minor_unit_digits,
      case when reward.configuration ->> 'version' = '2'
        then reward.configuration -> 'availability'
        else null end as availability,
      case when reward.configuration ->> 'version' = '2'
        and reward.configuration -> 'availability' -> 'startsAt' <> 'null'::jsonb
        then loyalty_private.try_parse_public_timestamptz(
          reward.configuration #>> '{availability,startsAt}'
        ) else null end as starts_at,
      case when reward.configuration ->> 'version' = '2'
        and reward.configuration -> 'availability' -> 'endsAt' <> 'null'::jsonb
        then loyalty_private.try_parse_public_timestamptz(
          reward.configuration #>> '{availability,endsAt}'
        ) else null end as ends_at,
      case when reward.configuration ->> 'version' = '2'
        then reward.configuration -> 'availability' -> 'tierCodes'
        else '[]'::jsonb end as tier_codes,
      case
        when reward.reward_kind = 'fixed_discount'
          and reward.configuration ->> 'version' = '2'
          and coalesce(reward.configuration ->> 'amountMinor', '')
            ~ '^[1-9][0-9]{0,18}$'
          and (pg_catalog.length(reward.configuration ->> 'amountMinor') < 19
            or reward.configuration ->> 'amountMinor' <= '9223372036854775807')
          then pg_catalog.jsonb_build_object(
            'kind', 'fixed_discount',
            'amountMinor', reward.configuration ->> 'amountMinor'
          )
        when reward.reward_kind = 'fixed_discount'
          and reward.configuration ->> 'version' is null
          and coalesce(reward.configuration ->> 'amountMinor', '')
            ~ '^[1-9][0-9]{0,18}$'
          and (pg_catalog.length(reward.configuration ->> 'amountMinor') < 19
            or reward.configuration ->> 'amountMinor' <= '9223372036854775807')
          then pg_catalog.jsonb_build_object(
            'kind', 'fixed_discount', 'amountMinor', null
          )
        when reward.reward_kind = 'percentage_discount'
          and loyalty_private.try_parse_public_integer(
            reward.configuration ->> 'percentageBasisPoints'
          ) between 1 and 10000
          and reward.configuration ? 'maximumDiscountMinor'
          and reward.configuration -> 'maximumDiscountMinor' = 'null'::jsonb
          then pg_catalog.jsonb_build_object(
            'kind', 'percentage_discount',
            'percentageBasisPoints', loyalty_private.try_parse_public_integer(
              reward.configuration ->> 'percentageBasisPoints'
            )
          )
        when reward.reward_kind = 'free_shipping'
          then pg_catalog.jsonb_build_object('kind', 'free_shipping')
        when reward.reward_kind = 'free_product'
          and reward.configuration ->> 'version' = '2'
          and loyalty_private.try_parse_public_integer(
            reward.configuration ->> 'quantity'
          ) between 1 and 10
          then pg_catalog.jsonb_build_object(
            'kind', 'free_product',
            'quantity', loyalty_private.try_parse_public_integer(
              reward.configuration ->> 'quantity'
            )
          )
        when reward.reward_kind = 'exclusive_access'
          and reward.configuration ->> 'version' = '2'
          then pg_catalog.jsonb_build_object('kind', 'exclusive_access')
        when reward.reward_kind = 'custom'
          and reward.configuration ->> 'version' = '2'
          then pg_catalog.jsonb_build_object('kind', 'custom')
        else null
      end as public_benefit
    from exact_scope as scope
    join loyalty.programme_rewards as reward
      on reward.organization_id = scope.organization_id
     and reward.programme_version_id = scope.programme_version_id
    where reward.reward_kind in (
      'fixed_discount', 'percentage_discount', 'free_shipping',
      'free_product', 'exclusive_access', 'custom'
    )
      and pg_catalog.length(pg_catalog.btrim(reward.name)) between 1 and 200
      and reward.name !~ '[[:cntrl:]<>]'
    order by reward.id
  ), structurally_safe as materialized (
    select candidate.*
    from reward_candidates as candidate
    where candidate.public_benefit is not null
      and (
        (
          candidate.configuration ->> 'version' = '2'
          and candidate.configuration_version = '2'
          and candidate.currency_code is not null
          and candidate.currency_minor_unit_digits is not null
          and (
            candidate.reward_kind not in (
              'fixed_discount', 'percentage_discount'
            )
            or loyalty_private.try_parse_public_integer(
              candidate.configuration ->> 'currencyMinorUnitDigits'
            ) = candidate.currency_minor_unit_digits
          )
          and pg_catalog.jsonb_typeof(candidate.availability) = 'object'
          and candidate.availability ?& array[
            'startsAt', 'endsAt', 'tierCodes', 'segmentCodes',
            'perCustomerLimit', 'globalQuantity', 'pointsBudget'
          ]
          and pg_catalog.jsonb_typeof(candidate.availability -> 'startsAt')
            in ('string', 'null')
          and pg_catalog.jsonb_typeof(candidate.availability -> 'endsAt')
            in ('string', 'null')
          and pg_catalog.jsonb_typeof(candidate.availability -> 'tierCodes') = 'array'
          and pg_catalog.jsonb_array_length(
            candidate.availability -> 'tierCodes'
          ) <= 15
          and not exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              candidate.availability -> 'tierCodes'
            ) as item(value)
            where pg_catalog.jsonb_typeof(item.value) <> 'string'
              or item.value #>> '{}' !~ '^[a-z][a-z0-9_-]{0,79}$'
          )
          and pg_catalog.jsonb_typeof(candidate.availability -> 'segmentCodes') = 'array'
          and pg_catalog.jsonb_array_length(
            candidate.availability -> 'segmentCodes'
          ) = 0
          and (
            candidate.availability -> 'startsAt' = 'null'::jsonb
            or candidate.starts_at is not null
          )
          and (
            candidate.availability -> 'endsAt' = 'null'::jsonb
            or candidate.ends_at is not null
          )
          and (
            candidate.availability -> 'perCustomerLimit' = 'null'::jsonb
            or loyalty_private.try_parse_public_integer(
              candidate.availability ->> 'perCustomerLimit'
            ) between 1 and 1000
          )
          and (
            candidate.availability -> 'globalQuantity' = 'null'::jsonb
            or (
              candidate.availability ->> 'globalQuantity'
                ~ '^[1-9][0-9]{0,18}$'
              and (pg_catalog.length(
                candidate.availability ->> 'globalQuantity'
              ) < 19 or candidate.availability ->> 'globalQuantity'
                <= '9223372036854775807')
            )
          )
          and (
            candidate.availability -> 'pointsBudget' = 'null'::jsonb
            or (
              candidate.availability ->> 'pointsBudget'
                ~ '^[1-9][0-9]{0,18}$'
              and (pg_catalog.length(
                candidate.availability ->> 'pointsBudget'
              ) < 19 or candidate.availability ->> 'pointsBudget'
                <= '9223372036854775807')
            )
          )
          and (
            (candidate.reward_kind in (
              'fixed_discount', 'percentage_discount',
              'free_shipping', 'free_product'
            )
              and candidate.configuration ->> 'fulfilmentMode' = 'woocommerce_coupon'
              and loyalty_private.try_parse_public_integer(
                candidate.configuration ->> 'validityDays'
              ) between 1 and 365
              and pg_catalog.jsonb_typeof(
                candidate.configuration -> 'restrictions'
              ) = 'object'
              and candidate.configuration -> 'restrictions' ?& array[
                'minimumSpendMinor', 'productIds', 'excludedProductIds',
                'categoryIds', 'excludedCategoryIds', 'excludeSaleItems',
                'stacking'
              ]
              and candidate.configuration #>> '{restrictions,stacking}'
                in ('exclusive', 'combinable')
              and pg_catalog.jsonb_typeof(
                candidate.configuration #> '{restrictions,excludeSaleItems}'
              ) = 'boolean'
              and (
                candidate.configuration #> '{restrictions,minimumSpendMinor}'
                  = 'null'::jsonb
                or (
                  candidate.configuration #>> '{restrictions,minimumSpendMinor}'
                    ~ '^(?:0|[1-9][0-9]{0,18})$'
                  and (pg_catalog.length(candidate.configuration #>>
                    '{restrictions,minimumSpendMinor}') < 19
                    or candidate.configuration #>>
                      '{restrictions,minimumSpendMinor}'
                      <= '9223372036854775807')
                )
              )
              and not exists (
                select 1 from unnest(array[
                  candidate.configuration #> '{restrictions,productIds}',
                  candidate.configuration #> '{restrictions,excludedProductIds}',
                  candidate.configuration #> '{restrictions,categoryIds}',
                  candidate.configuration #> '{restrictions,excludedCategoryIds}'
                ]) as selector_list(value)
                where pg_catalog.jsonb_typeof(selector_list.value) <> 'array'
              )
            )
            or (candidate.reward_kind in ('exclusive_access', 'custom')
              and candidate.configuration ->> 'fulfilmentMode' = 'manual'
              and loyalty_private.try_parse_public_integer(
                candidate.configuration ->> 'fulfilmentSlaDays'
              ) between 1 and 90)
          )
        )
        or (
          candidate.configuration ->> 'version' is null
          and candidate.reward_kind in (
            'fixed_discount', 'percentage_discount', 'free_shipping'
          )
          and loyalty_private.try_parse_public_integer(
            candidate.configuration ->> 'validityDays'
          ) between 1 and 365
        )
      )
      and (candidate.ends_at is null
        or candidate.ends_at > pg_catalog.statement_timestamp())
      and (candidate.starts_at is null or candidate.ends_at is null
        or candidate.starts_at < candidate.ends_at)
      and (
        candidate.configuration ->> 'version' is null
        or (
          pg_catalog.jsonb_array_length(candidate.tier_codes) = (
            select pg_catalog.count(distinct required.code)::integer
            from pg_catalog.jsonb_array_elements_text(
              candidate.tier_codes
            ) as required(code)
          )
          and pg_catalog.jsonb_array_length(candidate.tier_codes) = (
            select pg_catalog.count(*)::integer
            from pg_catalog.jsonb_array_elements_text(
              candidate.tier_codes
            ) as required(code)
            join exact_scope as scope on true
            join loyalty.programme_tiers as tier
              on tier.organization_id = scope.organization_id
             and tier.programme_version_id = scope.programme_version_id
             and tier.code = required.code
             and tier.name !~ '[[:cntrl:]<>]'
          )
        )
      )
    order by candidate.id
    limit 20
  ), public_offers as (
    select
      reward.id,
      pg_catalog.jsonb_build_object(
        'code', 'reward-' || pg_catalog.row_number()
          over (order by reward.id)::text,
        'name', pg_catalog.btrim(reward.name),
        'costPoints', reward.cost_points::text,
        'benefit', reward.public_benefit,
        'currency', case
          when reward.configuration ->> 'version' = '2'
            then pg_catalog.jsonb_build_object(
              'code', reward.currency_code,
              'minorUnitDigits', reward.currency_minor_unit_digits
            )
          else null
        end,
        'delivery', case
          when reward.configuration ->> 'version' = '2'
            then reward.configuration ->> 'fulfilmentMode'
          else 'woocommerce_coupon'
        end,
        'validityDays', case
          when reward.reward_kind in (
            'fixed_discount', 'percentage_discount',
            'free_shipping', 'free_product'
          ) then loyalty_private.try_parse_public_integer(
            reward.configuration ->> 'validityDays'
          ) else null end,
        'deliveryEstimateDays', case
          when reward.reward_kind in ('exclusive_access', 'custom')
            then loyalty_private.try_parse_public_integer(
              reward.configuration ->> 'fulfilmentSlaDays'
            ) else null end,
        'state', case
          when reward.configuration ->> 'version' is null
            then 'confirm_in_account'
          when reward.starts_at is not null
            and reward.starts_at > pg_catalog.statement_timestamp()
            then 'scheduled'
          else 'available'
        end,
        'startsAt', reward.starts_at,
        'endsAt', reward.ends_at,
        'conditions', pg_catalog.jsonb_build_object(
          'minimumSpendMinor', case
            when reward.configuration ->> 'version' = '2'
              and reward.reward_kind in (
                'fixed_discount', 'percentage_discount',
                'free_shipping', 'free_product'
              )
              then reward.configuration #>> '{restrictions,minimumSpendMinor}'
            else null end,
          'requiredTierNames', case
            when reward.configuration ->> 'version' = '2' then coalesce((
              select pg_catalog.jsonb_agg(tier.name order by required.ordinal)
              from pg_catalog.jsonb_array_elements_text(reward.tier_codes)
                with ordinality as required(code, ordinal)
              join exact_scope as scope on true
              join loyalty.programme_tiers as tier
                on tier.organization_id = scope.organization_id
               and tier.programme_version_id = scope.programme_version_id
               and tier.code = required.code
            ), '[]'::jsonb) else '[]'::jsonb end,
          'hasProductOrCategoryRestrictions',
            reward.configuration ->> 'version' = '2'
            and reward.reward_kind in (
              'fixed_discount', 'percentage_discount',
              'free_shipping', 'free_product'
            ) and (
              pg_catalog.jsonb_array_length(reward.configuration #>
                '{restrictions,productIds}') > 0
              or pg_catalog.jsonb_array_length(reward.configuration #>
                '{restrictions,excludedProductIds}') > 0
              or pg_catalog.jsonb_array_length(reward.configuration #>
                '{restrictions,categoryIds}') > 0
              or pg_catalog.jsonb_array_length(reward.configuration #>
                '{restrictions,excludedCategoryIds}') > 0
            ),
          'excludesSaleItems', coalesce(
            (reward.configuration #>>
              '{restrictions,excludeSaleItems}')::boolean, false
          ),
          'hasMemberLimit', reward.configuration ->> 'version' = '2'
            and reward.availability -> 'perCustomerLimit' <> 'null'::jsonb,
          'limitedAvailability', reward.configuration ->> 'version' = '2'
            and (reward.availability -> 'globalQuantity' <> 'null'::jsonb
              or reward.availability -> 'pointsBudget' <> 'null'::jsonb),
          'stacking', case
            when reward.configuration ->> 'version' is null then 'unknown'
            when reward.reward_kind in ('exclusive_access', 'custom')
              then 'not_applicable'
            else reward.configuration #>> '{restrictions,stacking}'
          end
        )
      ) as offer
    from structurally_safe as reward
  )
  select
    scope.workspace_public_id,
    scope.programme_public_id,
    scope.programme_group_public_id,
    scope.programme_name,
    scope.requested_locale,
    scope.resolved_locale,
    scope.presentation,
    scope.tiers,
    scope.vip_catalogue,
    scope.earning_methods,
    pg_catalog.jsonb_build_object(
      'version', '1',
      'offers', coalesce((
        select pg_catalog.jsonb_agg(offer.offer order by offer.id)
        from public_offers as offer
      ), '[]'::jsonb)
    )
  from exact_scope as scope;
$$;

alter function loyalty.get_public_loyalty_experience_v5(uuid, uuid)
  owner to loyalty_owner;
revoke all on function loyalty.get_public_loyalty_experience_v5(uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_public_loyalty_experience_v5(uuid, uuid)
  to anon, authenticated;

comment on function loyalty.get_public_loyalty_experience_v5(uuid, uuid) is
  'Returns one bounded English guest reward catalogue with safe benefit, availability, delivery, and condition summaries; excludes internal codes, selectors, instructions, limits, inventory, budget, customer state, and value authority.';
