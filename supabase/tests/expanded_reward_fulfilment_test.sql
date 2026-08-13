begin;

create extension if not exists pgtap with schema extensions;

select plan(102);

select has_table(
  'loyalty_private', 'reward_capacity_counters',
  'expanded rewards have serialized capacity counters'
);
select has_table(
  'loyalty_private', 'reward_capacity_allocations',
  'expanded rewards have reservation-scoped capacity allocations'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.reward_capacity_counters'::regclass),
  'capacity counters have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.reward_capacity_allocations'::regclass),
  'capacity allocations have RLS enabled'
);
select has_trigger(
  'loyalty', 'programme_versions',
  'programme_versions_expanded_reward_contract',
  'expanded reward definitions are guarded at the immutable version boundary'
);
select has_trigger(
  'loyalty', 'reward_reservations',
  'reward_reservations_allocate_capacity_v2',
  'capacity is allocated in the reservation transaction'
);
select has_trigger(
  'loyalty', 'reward_reservations',
  'reward_reservations_resolve_capacity_v2',
  'capacity resolves from the authoritative reservation state machine'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.reward_capacity_allocations', 'SELECT'
  ),
  'browser sessions cannot inspect private capacity allocations'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.claim_woocommerce_commands(uuid,integer,integer,text[])',
    'EXECUTE'
  ),
  'connector runtime can make capability-aware claims'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.claim_woocommerce_commands(uuid,integer,integer,text[])',
    'EXECUTE'
  ),
  'browser sessions cannot claim connector commands'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.redeem_my_reward(uuid,text,uuid)', 'EXECUTE'
  ),
  'customer redemption keeps its compatible public command'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.claim_woocommerce_commands(uuid,integer,integer)',
    'EXECUTE'
  ),
  'legacy connector clients retain the V1-only claim overload'
);
select has_table(
  'loyalty_private', 'reward_fulfilment_cases',
  'manual rewards have a private operator queue'
);
select has_table(
  'loyalty_private', 'reward_fulfilment_case_transitions',
  'manual rewards retain immutable decision history'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.reward_fulfilment_cases'::regclass),
  'manual fulfilment cases have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.reward_fulfilment_case_transitions'::regclass),
  'manual fulfilment transitions have RLS enabled'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.reward_fulfilment_cases', 'SELECT'
  ),
  'browser sessions cannot query raw manual cases'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.list_reward_fulfilment_cases(uuid,text,integer)', 'EXECUTE'
  ),
  'authenticated merchants can call the minimized queue read'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_reward_fulfilment_summary(uuid)', 'EXECUTE'
  ),
  'authenticated merchants can call the minimized queue summary'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.start_reward_fulfilment_command(uuid,text,uuid)', 'EXECUTE'
  ),
  'authenticated merchants can request a role-checked case start'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.resolve_reward_fulfilment_command(uuid,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated merchants can request a role-checked case resolution'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.enqueue_manual_reward_fulfilment(uuid,uuid)', 'EXECUTE'
  ),
  'browser sessions cannot bypass redemption to create manual cases'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.redeem_my_native_reward(uuid,text,uuid)', 'EXECUTE'
  ),
  'the native delegate is not a second browser command surface'
);

insert into auth.users (id, email)
values
  ('84000000-0000-4000-8000-000000000001', 'expanded-owner@example.test'),
  ('84000000-0000-4000-8000-000000000002', 'expanded-member@example.test'),
  ('84000000-0000-4000-8000-000000000003', 'expanded-operator@example.test'),
  ('84000000-0000-4000-8000-000000000004', 'expanded-analyst@example.test'),
  ('84000000-0000-4000-8000-000000000005', 'expanded-outsider@example.test');
insert into loyalty.organizations (public_id, slug, name)
values (
  '84000000-0000-4000-8000-000000000100',
  'expanded-rewards', 'Expanded Rewards'
);
insert into loyalty.organization_memberships (organization_id, user_id, role)
select organization.id, membership.user_id, membership.role
from loyalty.organizations as organization
cross join (values
  ('84000000-0000-4000-8000-000000000001'::uuid, 'owner'::text),
  ('84000000-0000-4000-8000-000000000003'::uuid, 'operator'::text),
  ('84000000-0000-4000-8000-000000000004'::uuid, 'analyst'::text)
) as membership(user_id, role)
where organization.slug = 'expanded-rewards';
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select '84000000-0000-4000-8000-000000000110', id, 'shop', 'Expanded Shop'
from loyalty.organizations where slug = 'expanded-rewards';
insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', 'Expanded Rewards'
from loyalty.organizations where slug = 'expanded-rewards';
insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug = 'expanded-rewards';
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select '84000000-0000-4000-8000-000000000120',
  organization.id, programme_group.id, 'rewards', 'Expanded Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'expanded-rewards';

create function pg_temp.expanded_org_id()
returns bigint
language sql
stable
as $$
  select id from loyalty.organizations where slug = 'expanded-rewards';
$$;

create function pg_temp.expanded_programme()
returns jsonb
language sql
immutable
as $$
  select '{
    "version":"2",
    "currencyCode":"EUR",
    "currencyMinorUnitDigits":2,
    "pendingDays":30,
    "pointsExpireAfterDays":365,
    "tiers":[
      {"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}
    ],
    "rewards":[
      {
        "code":"ten-off","name":"Ten euro off","kind":"fixed_discount",
        "costPoints":"500",
        "configuration":{
          "version":"2","fulfilmentMode":"woocommerce_coupon",
          "validityDays":30,"amountMinor":"1000","currencyMinorUnitDigits":2,
          "availability":{
            "startsAt":null,"endsAt":null,"tierCodes":[],"segmentCodes":[],
            "perCustomerLimit":1,"globalQuantity":"1","pointsBudget":"500"
          },
          "restrictions":{
            "minimumSpendMinor":"2500","productIds":["42"],
            "excludedProductIds":[],"categoryIds":[],"excludedCategoryIds":[],
            "excludeSaleItems":true,"stacking":"combinable"
          }
        }
      },
      {
        "code":"studio-tour","name":"Private studio tour","kind":"exclusive_access",
        "costPoints":"200",
        "configuration":{
          "version":"2","fulfilmentMode":"manual",
          "availability":{
            "startsAt":null,"endsAt":null,"tierCodes":[],"segmentCodes":[],
            "perCustomerLimit":1,"globalQuantity":"1","pointsBudget":"200"
          },
          "fulfilmentInstructions":"Contact the member and arrange one private studio visit.",
          "fulfilmentSlaDays":5
        }
      },
      {
        "code":"concierge-perk","name":"Concierge perk","kind":"custom",
        "costPoints":"200",
        "configuration":{
          "version":"2","fulfilmentMode":"manual",
          "availability":{
            "startsAt":null,"endsAt":null,"tierCodes":[],"segmentCodes":[],
            "perCustomerLimit":1,"globalQuantity":"1","pointsBudget":"200"
          },
          "fulfilmentInstructions":"Confirm the requested concierge benefit before delivery.",
          "fulfilmentSlaDays":3
        }
      }
    ],
    "earningRules":[
      {
        "code":"purchase-base","name":"Base purchase points","source":"purchase",
        "enabled":true,"priority":0,"stackable":false,
        "effect":{"kind":"base_rate","pointsPerMajorUnit":"5"},
        "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
        "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
        "cap":{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}
      }
    ]
  }'::jsonb;
$$;

create function pg_temp.legacy_programme(
  target_kind text,
  target_configuration jsonb
)
returns jsonb
language sql
immutable
as $$
  select pg_catalog.jsonb_set(
    pg_temp.expanded_programme(),
    '{rewards}',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'legacy-reward',
        'name', 'Legacy reward',
        'kind', target_kind,
        'costPoints', '500',
        'configuration', target_configuration
      )
    )
  );
$$;

create function pg_temp.legacy_native_programme()
returns jsonb
language sql
immutable
as $$
  select pg_catalog.jsonb_set(
    pg_temp.expanded_programme(),
    '{rewards}',
    '[
      {
        "code":"legacy-fixed","name":"Legacy fixed discount",
        "kind":"fixed_discount","costPoints":"500",
        "configuration":{
          "validityDays":30,"amountMinor":"500","currencyMinorUnitDigits":2
        }
      },
      {
        "code":"legacy-percent","name":"Legacy percentage discount",
        "kind":"percentage_discount","costPoints":"500",
        "configuration":{
          "validityDays":30,"percentageBasisPoints":1000,
          "maximumDiscountMinor":null,"currencyMinorUnitDigits":2
        }
      },
      {
        "code":"legacy-shipping","name":"Legacy free shipping",
        "kind":"free_shipping","costPoints":"500",
        "configuration":{"validityDays":30}
      }
    ]'::jsonb
  );
$$;

select lives_ok(
  $$ select loyalty_private.set_deployment_mode(
    'managed', 1, 'test:m04', 'Exercise managed expanded reward gating',
    now() - interval '2 minutes'
  ) $$,
  'test switches to managed mode through the audited private command'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '84000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', null,
    'canary', 'test:m04', 'Enable V2 before expanded rewards',
    now() - interval '90 seconds', null
  ) $$,
  'the canary organization receives ProgrammeDefinitionV2'
);

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000120',
    pg_temp.legacy_programme('free_product', '{}'::jsonb),
    'legacy:free-product', '84000000-0000-4000-8000-000000000211'
  ) $$,
  '22023', 'unsupported or invalid legacy reward configuration',
  'legacy free-product definitions cannot bypass the V2 contract or entitlement'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000120',
    pg_temp.legacy_programme('store_credit', '{}'::jsonb),
    'legacy:store-credit', '84000000-0000-4000-8000-000000000212'
  ) $$,
  '22023', 'unsupported or invalid legacy reward configuration',
  'legacy store credit remains outside the V2 authoring surface'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000120',
    pg_temp.legacy_programme('exclusive_access', '{}'::jsonb),
    'legacy:exclusive-access', '84000000-0000-4000-8000-000000000213'
  ) $$,
  '22023', 'unsupported or invalid legacy reward configuration',
  'legacy exclusive access cannot bypass the audited manual V2 state machine'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000120',
    pg_temp.legacy_programme('custom', '{}'::jsonb),
    'legacy:custom', '84000000-0000-4000-8000-000000000214'
  ) $$,
  '22023', 'unsupported or invalid legacy reward configuration',
  'legacy custom rewards cannot bypass the audited manual V2 state machine'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000120',
    pg_temp.legacy_programme(
      'fixed_discount',
      '{"version":"1","validityDays":30,"amountMinor":"500","currencyMinorUnitDigits":2}'::jsonb
    ),
    'legacy:disguised-version', '84000000-0000-4000-8000-000000000215'
  ) $$,
  '22023', 'invalid reward configuration version',
  'a disguised legacy version marker cannot bypass RewardDefinitionV2'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000120',
    pg_temp.legacy_programme(
      'fixed_discount',
      '{"validityDays":30,"amountMinor":"0","currencyMinorUnitDigits":2}'::jsonb
    ),
    'legacy:malformed-fixed', '84000000-0000-4000-8000-000000000216'
  ) $$,
  '22023', 'invalid legacy fixed-discount reward configuration',
  'a malformed allowed legacy reward fails at the database command boundary'
);
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000120', pg_temp.expanded_programme(),
    'expanded:disabled', '84000000-0000-4000-8000-000000000201'
  ) $$,
  '42501', 'expanded rewards are not enabled for this organization',
  'direct RPC cannot store expanded rewards without database entitlement'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_versions
     where organization_id = pg_temp.expanded_org_id() $$,
  array[0::bigint],
  'failed entitlement leaves no partial draft'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '84000000-0000-4000-8000-000000000100', 'rewards.expanded', 'enabled', null,
    'canary', 'test:m04', 'Enable expanded rewards for the canary',
    now() - interval '1 minute', null
  ) $$,
  'the canary organization receives expanded rewards'
);

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000120',
    jsonb_set(
      pg_temp.expanded_programme(),
      '{rewards,0,configuration,restrictions,productIds}',
      '["sku:unsafe"]'::jsonb
    ),
    'expanded:bad-selector', '84000000-0000-4000-8000-000000000202'
  ) $$,
  '22023', 'invalid RewardDefinitionV2 coupon restrictions',
  'database contract rejects non-numeric WooCommerce selectors'
);
select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000120', pg_temp.expanded_programme(),
    'expanded:valid', '84000000-0000-4000-8000-000000000203'
  ) $$,
  array['created'::text],
  'entitled owner creates a valid expanded reward draft'
);
select results_eq(
  $$ select outcome from loyalty.publish_programme_version_command(
    (select public_id from loyalty.programme_versions),
    (select encode(configuration_sha256, 'hex') from loyalty.programme_versions),
    'expanded:publish', '84000000-0000-4000-8000-000000000204'
  ) $$,
  array['created'::text],
  'reviewed expanded reward publishes atomically'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.programme_rewards
     where organization_id = pg_temp.expanded_org_id()
       and configuration ->> 'version' = '2' $$,
  array[3::bigint],
  'publication materializes the immutable expanded reward configuration'
);
select results_eq(
  $$ select reward_kind || ':' || cost_points::text
     from loyalty.programme_rewards
     where organization_id = pg_temp.expanded_org_id()
     order by code $$,
  array[
    'custom:200'::text,
    'exclusive_access:200'::text,
    'fixed_discount:500'::text
  ],
  'materialized reward retains its exact type and points cost'
);

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select '84000000-0000-4000-8000-000000000130',
  organization.id, workspace.id, 'expanded-store', 'Expanded Store',
  'v1', 'vault://expanded', programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
where organization.slug = 'expanded-rewards';
insert into loyalty.customers (public_id, organization_id, display_reference)
select '84000000-0000-4000-8000-000000000140', id, 'Private member'
from loyalty.organizations where slug = 'expanded-rewards';
insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  identity_kind, external_customer_id
)
select organization.id, customer.id, connection.id, 'registered', 'registered:101'
from loyalty.organizations as organization
join loyalty.customers as customer on customer.organization_id = organization.id
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'expanded-rewards';
insert into loyalty.customer_user_links (
  public_id, organization_id, customer_id, auth_user_id, source_connection_id
)
select '84000000-0000-4000-8000-000000000150',
  organization.id, customer.id, '84000000-0000-4000-8000-000000000002',
  connection.id
from loyalty.organizations as organization
join loyalty.customers as customer on customer.organization_id = organization.id
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug = 'expanded-rewards';

select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'expanded-rewards'),
  (select id from loyalty.programme_groups
   where organization_id = pg_temp.expanded_org_id()),
  (select id from loyalty.programme_versions
   where organization_id = pg_temp.expanded_org_id()),
  (select id from loyalty.customers
   where organization_id = pg_temp.expanded_org_id()),
  1000, 'expanded-award', extensions.digest('expanded-award', 'sha256')
);
select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'expanded-rewards'),
  (select id from loyalty.programme_groups
   where organization_id = pg_temp.expanded_org_id()),
  (select id from loyalty.programme_versions
   where organization_id = pg_temp.expanded_org_id()),
  (select entry.public_id
   from loyalty.ledger_entries as entry
   join loyalty.ledger_accounts as account on account.id = entry.account_id
   where account.organization_id = pg_temp.expanded_org_id()
     and account.account_kind = 'pending' and entry.points > 0),
  now() + interval '1 year', 'expanded-release',
  extensions.digest('expanded-release', 'sha256')
);

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000002';
create temporary table expanded_redemption as
select * from loyalty.redeem_my_reward(
  '84000000-0000-4000-8000-000000000150', 'ten-off',
  '84000000-0000-4000-8000-000000000301'
);
select results_eq(
  $$ select outcome from expanded_redemption $$,
  array['created'::text],
  'customer creates one expanded reward redemption'
);
select results_eq(
  $$ select state from expanded_redemption $$,
  array['reserved'::text],
  'expanded reward stops at reserved while the connector outcome is unknown'
);
reset role;
select results_eq(
  $$ select state || ':' || points::text
     from loyalty_private.reward_capacity_allocations
     where organization_id = pg_temp.expanded_org_id() $$,
  array['allocated:500'::text],
  'capacity is reserved before the native benefit is issued'
);
select results_eq(
  $$ select allocated_quantity::text || ':' || allocated_points::text
     from loyalty_private.reward_capacity_counters
     where organization_id = pg_temp.expanded_org_id() $$,
  array['1:500'::text],
  'serialized quantity and points budgets reflect the reservation'
);
select results_eq(
  $$ select payload_version from loyalty_private.transactional_outbox
     where organization_id = pg_temp.expanded_org_id()
       and topic = 'woocommerce.coupon.issue' $$,
  array['v2'::text],
  'expanded reward enqueues only a V2 native coupon command'
);
select results_eq(
  $$ select payload -> 'reward' -> 'restrictions' ->> 'minimumSpendMinor'
     from loyalty_private.transactional_outbox
     where organization_id = pg_temp.expanded_org_id()
       and topic = 'woocommerce.coupon.issue' $$,
  array['2500'::text],
  'connector payload retains the reviewed minimum-spend restriction'
);
select is_empty(
  $$ select * from loyalty_private.claim_woocommerce_commands(
    '84000000-0000-4000-8000-000000000130', 10, 60
  ) $$,
  'legacy plugin cannot claim a V2 coupon command'
);
select results_eq(
  $$ select attempt_count from loyalty_private.transactional_outbox
     where organization_id = pg_temp.expanded_org_id()
       and topic = 'woocommerce.coupon.issue' $$,
  array[0],
  'capability mismatch does not consume a delivery attempt'
);
select throws_ok(
  $$ select * from loyalty_private.claim_woocommerce_commands(
    '84000000-0000-4000-8000-000000000130', 10, 60,
    array['coupon.issue.v3']::text[]
  ) $$,
  '22023', 'unsupported connector capability',
  'unknown connector capabilities fail closed'
);
create temporary table expanded_claim as
select * from loyalty_private.claim_woocommerce_commands(
  '84000000-0000-4000-8000-000000000130', 10, 60,
  array['coupon.issue.v2']::text[]
);
select results_eq(
  $$ select count(*)::bigint from expanded_claim $$,
  array[1::bigint],
  'capable plugin claims exactly one expanded coupon command'
);
select results_eq(
  $$ select payload_version || ':' || (payload -> 'reward' ->> 'kind')
     from expanded_claim $$,
  array['v2:fixed_discount'::text],
  'claimed command retains the negotiated payload and reward kind'
);
select results_eq(
  $$ select outcome from loyalty_private.finish_woocommerce_command(
    '84000000-0000-4000-8000-000000000130',
    (select command_id from expanded_claim), 'delivered',
    'woocommerce:coupon:901', null, 0
  ) $$,
  array['delivered'::text],
  'successful native issuance is acknowledged through the existing state machine'
);
select results_eq(
  $$ select state from loyalty.reward_reservations
     where organization_id = pg_temp.expanded_org_id() $$,
  array['issued'::text],
  'native acknowledgement advances reserved value to issued only'
);
select results_eq(
  $$ select state from loyalty_private.reward_capacity_allocations
     where organization_id = pg_temp.expanded_org_id() $$,
  array['allocated'::text],
  'issued but unused native benefit keeps capacity allocated'
);
select results_eq(
  $$ select outcome from loyalty_private.capture_woocommerce_coupon_use(
    (select id from loyalty.organizations where slug = 'expanded-rewards'),
    (select id from loyalty.commerce_connections
     where organization_id = pg_temp.expanded_org_id()),
    (select reservation_id from expanded_redemption), '7001', now()
  ) $$,
  array['created'::text],
  'verified WooCommerce use captures the reserved points'
);
select results_eq(
  $$ select state from loyalty_private.reward_capacity_allocations
     where organization_id = pg_temp.expanded_org_id() $$,
  array['consumed'::text],
  'captured benefit consumes its exact capacity allocation'
);
select results_eq(
  $$ select allocated_quantity::text || ':' || consumed_quantity::text || ':' ||
            allocated_points::text || ':' || consumed_points::text
     from loyalty_private.reward_capacity_counters
     where organization_id = pg_temp.expanded_org_id() $$,
  array['0:1:0:500'::text],
  'capacity counters reconcile allocated and consumed value exactly'
);
select results_eq(
  $$ select available.points, reserved.points, spent.points
     from loyalty.wallet_balances as available
     join loyalty.wallet_balances as reserved
       on reserved.wallet_id = available.wallet_id
      and reserved.account_kind = 'reserved'
     join loyalty.wallet_balances as spent
       on spent.wallet_id = available.wallet_id
      and spent.account_kind = 'spent'
     where available.organization_id = pg_temp.expanded_org_id()
       and available.account_kind = 'available' $$,
  $$ values (500::bigint, 0::bigint, 500::bigint) $$,
  'wallet balances reconcile the captured expanded reward'
);
set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
    '84000000-0000-4000-8000-000000000150', 'ten-off',
    '84000000-0000-4000-8000-000000000302'
  ) $$,
  '23514', 'reward per-customer limit reached',
  'member limit rejects another redemption before any points move'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.reward_reservations
     where organization_id = pg_temp.expanded_org_id() $$,
  array[1::bigint],
  'rejected capacity request leaves no partial reservation'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.transactional_outbox
     where organization_id = pg_temp.expanded_org_id()
       and topic = 'woocommerce.coupon.issue' $$,
  array[1::bigint],
  'rejected capacity request creates no connector command'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where organization_id = pg_temp.expanded_org_id()
       and transaction_kind = 'reserve' $$,
  array[1::bigint],
  'rejected capacity request creates no extra ledger transaction'
);

select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '84000000-0000-4000-8000-000000000100', 'rewards.expanded', 'disabled', null,
    'canary', 'test:m04', 'Stop new expanded reward reservations',
    now() - interval '1 second', null
  ) $$,
  'expanded rewards can be disabled without changing accepted history'
);
set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
    '84000000-0000-4000-8000-000000000150', 'studio-tour',
    '84000000-0000-4000-8000-000000000303'
  ) $$,
  '42501', 'expanded rewards are not enabled for this organization',
  'disabled entitlement stops a new reservation before points move'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.reward_reservations
     where organization_id = pg_temp.expanded_org_id() $$,
  array[1::bigint],
  'disabled redemption leaves no reservation residue'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '84000000-0000-4000-8000-000000000100', 'rewards.expanded', 'enabled', null,
    'canary', 'test:m04', 'Resume expanded reward reservations',
    now(), null
  ) $$,
  'expanded rewards can resume without rewriting accepted history'
);

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000002';
create temporary table manual_tour_redemption as
select * from loyalty.redeem_my_reward(
  '84000000-0000-4000-8000-000000000150', 'studio-tour',
  '84000000-0000-4000-8000-000000000304'
);
select results_eq(
  $$ select outcome || ':' || state from manual_tour_redemption $$,
  array['created:reserved'::text],
  'customer reserves one manual exclusive-access reward'
);
select results_eq(
  $$ select outcome from loyalty.redeem_my_reward(
    '84000000-0000-4000-8000-000000000150', 'studio-tour',
    '84000000-0000-4000-8000-000000000304'
  ) $$,
  array['duplicate'::text],
  'exact manual redemption retry returns the original reservation'
);
select throws_ok(
  $$ select * from loyalty.list_reward_fulfilment_cases(
    '84000000-0000-4000-8000-000000000120', null, 50
  ) $$,
  '42501', 'fulfilment queue not authorized',
  'a customer session cannot inspect the merchant queue'
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.reward_fulfilment_case_transitions
     where organization_id = pg_temp.expanded_org_id()
       and action = 'created' $$,
  array[1::bigint],
  'manual redemption creates one immutable case-creation transition'
);
select results_eq(
  $$ select state || ':' || instructions_snapshot
     from loyalty_private.reward_fulfilment_cases
     where reservation_id = (
       select id from loyalty.reward_reservations
       where public_id = (select reservation_id from manual_tour_redemption)
     ) $$,
  array['pending:Contact the member and arrange one private studio visit.'::text],
  'manual case snapshots the reviewed instructions in pending state'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.transactional_outbox
     where organization_id = pg_temp.expanded_org_id()
       and topic = 'woocommerce.coupon.issue' $$,
  array[1::bigint],
  'manual redemption creates no WooCommerce coupon command'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.reward_fulfilment_cases
     where organization_id = pg_temp.expanded_org_id()
       and reservation_id = (
         select id from loyalty.reward_reservations
         where public_id = (select reservation_id from manual_tour_redemption)
       ) $$,
  array[1::bigint],
  'manual redemption and retry create exactly one queue case'
);
create temporary table manual_tour_case as
select public_id as case_id
from loyalty_private.reward_fulfilment_cases
where reservation_id = (
  select id from loyalty.reward_reservations
  where public_id = (select reservation_id from manual_tour_redemption)
);
grant select on manual_tour_case to authenticated;

select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '84000000-0000-4000-8000-000000000100', 'rewards.expanded', 'disabled', null,
    'canary', 'test:m04', 'Prove accepted manual cases survive rollback',
    now(), null
  ) $$,
  'disabling new expanded rewards keeps accepted manual cases operational'
);

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000004';
select results_eq(
  $$ select reward_code || ':' || state
     from loyalty.list_reward_fulfilment_cases(
       '84000000-0000-4000-8000-000000000120', 'pending', 50
     ) $$,
  array['studio-tour:pending'::text],
  'an analyst receives the minimized tenant-scoped queue'
);
select throws_ok(
  $$ select * from loyalty.start_reward_fulfilment_command(
    (select case_id from manual_tour_case),
    'manual:analyst:start', '84000000-0000-4000-8000-000000000401'
  ) $$,
  '42501', 'fulfilment command not authorized',
  'analyst read access cannot start delivery'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000003';
create temporary table manual_tour_start as
select * from loyalty.start_reward_fulfilment_command(
  (select case_id from manual_tour_case),
  'manual:tour:start', '84000000-0000-4000-8000-000000000402'
);
select results_eq(
  $$ select outcome || ':' || state from manual_tour_start $$,
  array['created:in_progress'::text],
  'operator explicitly starts the manual delivery'
);
select results_eq(
  $$ select outcome from loyalty.start_reward_fulfilment_command(
    (select case_id from manual_tour_start),
    'manual:tour:start', '84000000-0000-4000-8000-000000000402'
  ) $$,
  array['duplicate'::text],
  'exact start retry is idempotent'
);
select throws_ok(
  $$ select * from loyalty.resolve_reward_fulfilment_command(
    (select case_id from manual_tour_start), 'fulfilled', null,
    'Member confirmed receipt', 'manual:tour:bad-resolution',
    '84000000-0000-4000-8000-000000000403'
  ) $$,
  '22023', 'invalid fulfilment resolution',
  'fulfilment cannot be confirmed without an opaque delivery reference'
);
reset role;
select results_eq(
  $$ select reservation.state, allocation.state
     from loyalty.reward_reservations as reservation
     join loyalty_private.reward_capacity_allocations as allocation
       on allocation.organization_id = reservation.organization_id
      and allocation.reservation_id = reservation.id
     where reservation.public_id = (
       select reservation_id from manual_tour_redemption
     ) $$,
  $$ values ('reserved'::text, 'allocated'::text) $$,
  'an in-progress or invalid resolution keeps points and capacity reserved'
);

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000003';
create temporary table manual_tour_resolution as
select * from loyalty.resolve_reward_fulfilment_command(
  (select case_id from manual_tour_start), 'fulfilled',
  'store-fulfilment:901', 'Member confirmed receipt',
  'manual:tour:fulfilled', '84000000-0000-4000-8000-000000000404'
);
select results_eq(
  $$ select outcome || ':' || state || ':' || reservation_state
     from manual_tour_resolution $$,
  array['created:fulfilled:captured'::text],
  'confirmed manual delivery captures its points atomically'
);
select results_eq(
  $$ select outcome from loyalty.resolve_reward_fulfilment_command(
    (select case_id from manual_tour_start), 'fulfilled',
    'store-fulfilment:901', 'Member confirmed receipt',
    'manual:tour:fulfilled', '84000000-0000-4000-8000-000000000404'
  ) $$,
  array['duplicate'::text],
  'exact fulfilment retry creates no second value effect'
);
reset role;
select results_eq(
  $$ select state || ':' || result_reference
     from loyalty_private.reward_fulfilment_cases
     where public_id = (select case_id from manual_tour_start) $$,
  array['fulfilled:store-fulfilment:901'::text],
  'fulfilled case retains its opaque delivery evidence'
);
select results_eq(
  $$ select state from loyalty_private.reward_capacity_allocations
     where reservation_id = (
       select id from loyalty.reward_reservations
       where public_id = (select reservation_id from manual_tour_redemption)
     ) $$,
  array['consumed'::text],
  'confirmed manual delivery consumes the allocated capacity'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty.ledger_transactions as transaction
     join loyalty.reward_reservations as reservation
       on reservation.organization_id = transaction.organization_id
      and reservation.ledger_reservation_transaction_id = transaction.related_transaction_id
     where reservation.public_id = (select reservation_id from manual_tour_redemption)
       and transaction.transaction_kind = 'capture' $$,
  array[1::bigint],
  'manual fulfilment records exactly one related capture transaction'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.reward_fulfilment_case_transitions as transition
     join loyalty_private.reward_fulfilment_cases as fulfilment_case
       on fulfilment_case.organization_id = transition.organization_id
      and fulfilment_case.id = transition.case_id
     where fulfilment_case.public_id = (select case_id from manual_tour_start) $$,
  array[3::bigint],
  'manual case retains created started and fulfilled transitions'
);

select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '84000000-0000-4000-8000-000000000100', 'rewards.expanded', 'enabled', null,
    'canary', 'test:m04', 'Resume expanded rewards after rollback evidence',
    now(), null
  ) $$,
  'expanded rewards resume after accepted-case rollback verification'
);

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000002';
create temporary table manual_custom_redemption as
select * from loyalty.redeem_my_reward(
  '84000000-0000-4000-8000-000000000150', 'concierge-perk',
  '84000000-0000-4000-8000-000000000305'
);
select results_eq(
  $$ select outcome || ':' || state from manual_custom_redemption $$,
  array['created:reserved'::text],
  'customer reserves one custom manual perk'
);
reset role;
create temporary table manual_custom_case as
select public_id as case_id
from loyalty_private.reward_fulfilment_cases
where reservation_id = (
  select id from loyalty.reward_reservations
  where public_id = (select reservation_id from manual_custom_redemption)
);
grant select on manual_custom_case to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000003';
create temporary table manual_custom_start as
select * from loyalty.start_reward_fulfilment_command(
  (select case_id from manual_custom_case),
  'manual:custom:start', '84000000-0000-4000-8000-000000000405'
);
select results_eq(
  $$ select state from manual_custom_start $$,
  array['in_progress'::text],
  'operator starts the custom-perk case'
);
select throws_ok(
  $$ select * from loyalty.resolve_reward_fulfilment_command(
    (select case_id from manual_custom_start), 'rejected', null, null,
    'manual:custom:bad-reject', '84000000-0000-4000-8000-000000000406'
  ) $$,
  '22023', 'invalid fulfilment resolution',
  'rejection requires an attributable reason'
);
select results_eq(
  $$ select outcome || ':' || state || ':' || reservation_state
     from loyalty.resolve_reward_fulfilment_command(
       (select case_id from manual_custom_start), 'rejected', null,
       'Requested benefit is unavailable', 'manual:custom:rejected',
       '84000000-0000-4000-8000-000000000407'
     ) $$,
  array['created:rejected:released'::text],
  'definitive rejection compensates reserved points atomically'
);
select results_eq(
  $$ select outcome from loyalty.resolve_reward_fulfilment_command(
    (select case_id from manual_custom_start), 'rejected', null,
    'Requested benefit is unavailable', 'manual:custom:rejected',
    '84000000-0000-4000-8000-000000000407'
  ) $$,
  array['duplicate'::text],
  'exact rejection retry creates no second compensation'
);
reset role;
select results_eq(
  $$ select fulfilment_case.state, reservation.state, allocation.state
     from loyalty_private.reward_fulfilment_cases as fulfilment_case
     join loyalty.reward_reservations as reservation
       on reservation.organization_id = fulfilment_case.organization_id
      and reservation.id = fulfilment_case.reservation_id
     join loyalty_private.reward_capacity_allocations as allocation
       on allocation.organization_id = reservation.organization_id
      and allocation.reservation_id = reservation.id
     where fulfilment_case.public_id = (select case_id from manual_custom_start) $$,
  $$ values ('rejected'::text, 'released'::text, 'released'::text) $$,
  'rejected case releases points and capacity only after a definitive decision'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty.ledger_transactions as transaction
     join loyalty.reward_reservations as reservation
       on reservation.organization_id = transaction.organization_id
      and reservation.ledger_reservation_transaction_id = transaction.related_transaction_id
     where reservation.public_id = (select reservation_id from manual_custom_redemption)
       and transaction.transaction_kind = 'cancel' $$,
  array[1::bigint],
  'manual rejection records exactly one related cancel transaction'
);
select results_eq(
  $$ select available.points, reserved.points, spent.points
     from loyalty.wallet_balances as available
     join loyalty.wallet_balances as reserved
       on reserved.wallet_id = available.wallet_id
      and reserved.account_kind = 'reserved'
     join loyalty.wallet_balances as spent
       on spent.wallet_id = available.wallet_id
      and spent.account_kind = 'spent'
     where available.organization_id = pg_temp.expanded_org_id()
       and available.account_kind = 'available' $$,
  $$ values (300::bigint, 0::bigint, 700::bigint) $$,
  'wallet balances reconcile native capture manual capture and manual rejection'
);

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000004';
select results_eq(
  $$ select loyalty.get_reward_fulfilment_summary(
    '84000000-0000-4000-8000-000000000120'
  ) $$,
  array['{"overdue": 0, "pending": 0, "inProgress": 0, "fulfilled30d": 1, "rejected30d": 1}'::jsonb],
  'merchant summary reports exact queue outcomes without value approximation'
);
select results_eq(
  $$ select reward_code || ':' || state
     from loyalty.list_reward_fulfilment_cases(
       '84000000-0000-4000-8000-000000000120', null, 50
     ) order by reward_code $$,
  array['concierge-perk:rejected'::text, 'studio-tour:fulfilled'::text],
  'merchant queue returns both terminal cases through minimized fields'
);
reset role;
select throws_ok(
  $$ update loyalty_private.reward_fulfilment_cases
     set state = 'pending', result_reference = null
     where public_id = (select case_id from manual_tour_start) $$,
  '55000', 'manual fulfilment case history is immutable',
  'terminal manual case cannot be rewritten'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where organization_id = pg_temp.expanded_org_id()
       and action like 'reward.fulfilment.%' $$,
  array[4::bigint],
  'start and resolution commands retain one audit event each'
);

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select '84000000-0000-4000-8000-000000000121',
  organization.id, programme_group.id, 'legacy-native', 'Legacy Native'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'expanded-rewards';

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    '84000000-0000-4000-8000-000000000121',
    pg_temp.legacy_native_programme(),
    'legacy:valid', '84000000-0000-4000-8000-000000000217'
  ) $$,
  array['created'::text],
  'owner can preserve the three fulfilable legacy native reward kinds'
);
select results_eq(
  $$ select outcome from loyalty.publish_programme_version_command(
    (
      select version.public_id
      from loyalty.programme_versions as version
      join loyalty.programmes as programme
        on programme.organization_id = version.organization_id
       and programme.id = version.programme_id
      where programme.public_id = '84000000-0000-4000-8000-000000000121'
        and version.status = 'draft'
    ),
    (
      select encode(version.configuration_sha256, 'hex')
      from loyalty.programme_versions as version
      join loyalty.programmes as programme
        on programme.organization_id = version.organization_id
       and programme.id = version.programme_id
      where programme.public_id = '84000000-0000-4000-8000-000000000121'
        and version.status = 'draft'
    ),
    'legacy:publish', '84000000-0000-4000-8000-000000000218'
  ) $$,
  array['created'::text],
  'valid legacy native rewards publish through the authenticated command'
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty.programme_rewards as reward
     join loyalty.programmes as programme
       on programme.organization_id = reward.organization_id
      and programme.id = reward.programme_id
     where programme.public_id = '84000000-0000-4000-8000-000000000121' $$,
  array[3::bigint],
  'legacy native publication materializes exactly three rewards'
);
select results_eq(
  $$ select reward.reward_kind
     from loyalty.programme_rewards as reward
     join loyalty.programmes as programme
       on programme.organization_id = reward.organization_id
      and programme.id = reward.programme_id
     where programme.public_id = '84000000-0000-4000-8000-000000000121'
       and not (reward.configuration ? 'version')
     order by reward.reward_kind $$,
  array[
    'fixed_discount'::text,
    'free_shipping'::text,
    'percentage_discount'::text
  ],
  'legacy native materialization remains explicitly unversioned and allowlisted'
);

select * from finish();
rollback;
