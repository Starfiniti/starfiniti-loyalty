begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

select has_function(
  'loyalty', 'redeem_my_reward', array['uuid', 'text', 'uuid'],
  'authenticated customer reward redemption command exists'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.redeem_my_reward(uuid,text,uuid)', 'EXECUTE'
  ),
  'authenticated sessions can request their own reward'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.redeem_my_reward(uuid,text,uuid)', 'EXECUTE'
  ),
  'anonymous sessions cannot redeem rewards'
);
select ok(
  not has_function_privilege(
    'loyalty_worker', 'loyalty.redeem_my_reward(uuid,text,uuid)', 'EXECUTE'
  ),
  'the connector worker cannot impersonate a customer redemption request'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'redeem_my_reward'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'the command is security definer with an empty search path'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.transactional_outbox', 'SELECT'
  ),
  'customers cannot read coupon command payloads'
);

insert into auth.users (id, email)
values
  ('91000000-0000-4000-8000-000000000001', 'redeemer-one@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'redeemer-two@example.test');
insert into loyalty.organizations (slug, name)
values ('redeem-one', 'Redeem One'), ('redeem-two', 'Redeem Two');
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case slug when 'redeem-one' then '91000000-0000-4000-8000-000000000110'::uuid
    else '92000000-0000-4000-8000-000000000110'::uuid end,
  id, 'store', name || ' Store'
from loyalty.organizations where slug in ('redeem-one', 'redeem-two');
insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('redeem-one', 'redeem-two');
insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id;
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug when 'redeem-one' then '91000000-0000-4000-8000-000000000130'::uuid
    else '92000000-0000-4000-8000-000000000130'::uuid end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id;
insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number,
  status, configuration, configuration_sha256, published_at
)
select organization_id, programme_group_id, id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(public_id::text, 'sha256'), now()
from loyalty.programmes where public_id in (
  '91000000-0000-4000-8000-000000000130',
  '92000000-0000-4000-8000-000000000130'
);
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id,
  'five-off', 'Five off', 'fixed_discount', 400,
  '{"amountMinor":"500","currencyMinorUnitDigits":2,"validityDays":7}'::jsonb
from loyalty.programme_versions;
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points, configuration
)
select organization_id, programme_group_id, id,
  definition.code, definition.name, definition.kind, definition.cost, definition.configuration
from loyalty.programme_versions
cross join (values
  ('shipping', 'Free shipping', 'free_shipping', 300::bigint, '{"validityDays":30}'::jsonb),
  ('too-expensive', 'Too expensive', 'free_shipping', 2000::bigint, '{}'::jsonb),
  ('custom-only', 'Custom only', 'custom', 100::bigint, '{}'::jsonb),
  ('bad-currency', 'Bad currency', 'fixed_discount', 100::bigint,
    '{"amountMinor":"100","currencyMinorUnitDigits":9}'::jsonb),
  ('bad-validity', 'Bad validity', 'free_shipping', 100::bigint,
    '{"validityDays":366}'::jsonb),
  ('bad-maximum', 'Bad maximum', 'percentage_discount', 100::bigint,
    '{"percentageBasisPoints":1000,"maximumDiscountMinor":"free","currencyMinorUnitDigits":2,"validityDays":30}'::jsonb),
  ('capped-maximum', 'Capped maximum', 'percentage_discount', 100::bigint,
    '{"percentageBasisPoints":1000,"maximumDiscountMinor":"2500","currencyMinorUnitDigits":2,"validityDays":30}'::jsonb)
) as definition(code, name, kind, cost, configuration)
where loyalty.programme_versions.organization_id = (
  select id from loyalty.organizations where slug = 'redeem-one'
);
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select
  case organization.slug when 'redeem-one' then '91000000-0000-4000-8000-000000000101'::uuid
    else '92000000-0000-4000-8000-000000000101'::uuid end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug,
  programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id;
insert into loyalty.customers (public_id, organization_id, display_reference)
select
  case slug when 'redeem-one' then '91000000-0000-4000-8000-000000000150'::uuid
    else '92000000-0000-4000-8000-000000000150'::uuid end,
  id, 'Private customer'
from loyalty.organizations where slug in ('redeem-one', 'redeem-two');
insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  identity_kind, external_customer_id
)
select organization.id, customer.id, connection.id, 'registered',
  case organization.slug when 'redeem-one' then 'registered:101' else 'registered:202' end
from loyalty.organizations as organization
join loyalty.customers as customer on customer.organization_id = organization.id
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id;
insert into loyalty.customer_user_links (
  public_id, organization_id, customer_id, auth_user_id, source_connection_id
)
select
  case organization.slug when 'redeem-one' then '91000000-0000-4000-8000-000000000160'::uuid
    else '92000000-0000-4000-8000-000000000160'::uuid end,
  organization.id, customer.id,
  case organization.slug when 'redeem-one' then '91000000-0000-4000-8000-000000000001'::uuid
    else '91000000-0000-4000-8000-000000000002'::uuid end,
  connection.id
from loyalty.organizations as organization
join loyalty.customers as customer on customer.organization_id = organization.id
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id;

select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'redeem-one'),
  (select id from loyalty.programme_groups where organization_id =
    (select id from loyalty.organizations where slug = 'redeem-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'redeem-one')),
  (select id from loyalty.customers where organization_id =
    (select id from loyalty.organizations where slug = 'redeem-one')),
  1000, 'redeem-award-one', extensions.digest('redeem-award-one', 'sha256')
);
select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'redeem-one'),
  (select id from loyalty.programme_groups where organization_id =
    (select id from loyalty.organizations where slug = 'redeem-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'redeem-one')),
  (select entry.public_id from loyalty.ledger_entries as entry
   join loyalty.ledger_accounts as account on account.id = entry.account_id
   where account.organization_id =
       (select id from loyalty.organizations where slug = 'redeem-one')
     and account.account_kind = 'pending' and entry.points > 0),
  now() + interval '1 year', 'redeem-release-one',
  extensions.digest('redeem-release-one', 'sha256')
);

create temporary table redemption_before as
select
  (select count(*)::bigint from loyalty.reward_reservations) as reservations,
  (select count(*)::bigint from loyalty.ledger_transactions) as transactions,
  (select count(*)::bigint from loyalty_private.transactional_outbox) as commands;
grant select on redemption_before to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';

create temporary table redemption_result as
select * from loyalty.redeem_my_reward(
  '91000000-0000-4000-8000-000000000160',
  'five-off',
  '91000000-0000-4000-8000-000000000900'
);
select results_eq(
  $$ select outcome from redemption_result $$,
  array['created'::text],
  'a linked customer creates one redemption request'
);
select results_eq(
  $$ select state from redemption_result $$,
  array['reserved'::text],
  'the customer request reaches reserved only after ledger evidence exists'
);
reset role;
select results_eq(
  $$ select count(*)::bigint - (select reservations from redemption_before)
     from loyalty.reward_reservations $$,
  array[1::bigint],
  'one immutable reward reservation is created'
);
select results_eq(
  $$ select to_state from loyalty.reward_reservation_transitions
     where reservation_id = (
       select id from loyalty.reward_reservations
       where public_id = (select reservation_id from redemption_result)
     ) $$,
  array['reserved'::text],
  'one reserved transition records the value-state change'
);
select results_eq(
  $$ select count(*)::bigint - (select transactions from redemption_before)
     from loyalty.ledger_transactions $$,
  array[1::bigint],
  'redemption creates exactly one reserve ledger transaction'
);
select results_eq(
  $$ select available.points, reserved.points
     from loyalty.wallet_balances as available
     join loyalty.wallet_balances as reserved
       on reserved.organization_id = available.organization_id
      and reserved.wallet_id = available.wallet_id
      and reserved.account_kind = 'reserved'
     where available.organization_id =
       (select id from loyalty.organizations where slug = 'redeem-one')
       and available.account_kind = 'available' $$,
  $$ values (600::bigint, 400::bigint) $$,
  'the immutable ledger atomically moves the exact points into reserved'
);
select results_eq(
  $$ select count(*)::bigint - (select commands from redemption_before)
     from loyalty_private.transactional_outbox $$,
  array[1::bigint],
  'the same transaction queues exactly one connector command'
);
select results_eq(
  $$ select topic, payload ->> 'reservationId'
     from loyalty_private.transactional_outbox
     where topic = 'woocommerce.coupon.issue' $$,
  $$ select 'woocommerce.coupon.issue'::text, reservation_id::text
     from redemption_result $$,
  'the private command targets the exact reservation'
);
select results_eq(
  $$ select payload ->> 'externalCustomerId'
     from loyalty_private.transactional_outbox
     where topic = 'woocommerce.coupon.issue' $$,
  array['101'::text],
  'the private connector derives the verified WooCommerce customer identity'
);
select ok(
  (select expires_at between created_at + interval '6 days 23 hours'
      and created_at + interval '7 days 1 hour'
   from loyalty.reward_reservations
   where public_id = (select reservation_id from redemption_result)),
  'the reservation snapshots the configured coupon validity'
);
select results_eq(
  $$ select connector_execution_reference
     from loyalty.reward_reservations
     where public_id = (select reservation_id from redemption_result) $$,
  array[null::text],
  'coupon plaintext and execution details are absent from the reservation'
);
select ok(
  pg_get_function_result('loyalty.redeem_my_reward(uuid,text,uuid)'::regprocedure)
    !~* 'coupon|external|customer_id|organization',
  'the browser result exposes no coupon, external identity, or tenant authority'
);
set local role authenticated;
select results_eq(
  $$ select outcome from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'five-off',
       '91000000-0000-4000-8000-000000000900'
     ) $$,
  array['duplicate'::text],
  'an exact retry returns the original redemption'
);
select results_eq(
  $$ select reservation_id from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'five-off',
       '91000000-0000-4000-8000-000000000900'
     ) $$,
  $$ select reservation_id from redemption_result $$,
  'an exact retry returns the same reservation identity'
);
reset role;
select results_eq(
  $$ select count(*)::bigint - (select reservations from redemption_before),
            (select count(*)::bigint - (select transactions from redemption_before)
             from loyalty.ledger_transactions),
            (select count(*)::bigint - (select commands from redemption_before)
             from loyalty_private.transactional_outbox)
     from loyalty.reward_reservations $$,
  $$ values (1::bigint, 1::bigint, 1::bigint) $$,
  'retries create no duplicate reservation, ledger effect, or connector command'
);
set local role authenticated;
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'shipping',
       '91000000-0000-4000-8000-000000000900'
     ) $$,
  '23514', 'reward redemption request conflict',
  'request UUID reuse with another reward is rejected'
);
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '92000000-0000-4000-8000-000000000160', 'five-off',
       '91000000-0000-4000-8000-000000000901'
     ) $$,
  '42501', 'reward redemption not authorized',
  'a customer cannot redeem through another tenant account'
);
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'too-expensive',
       '91000000-0000-4000-8000-000000000902'
     ) $$,
  '23514', 'insufficient available points',
  'insufficient points reject the entire redemption transaction'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.reward_reservations
     where idempotency_key =
       'customer-reward:91000000-0000-4000-8000-000000000902' $$,
  array[0::bigint],
  'an insufficient-balance failure leaves no requested reservation behind'
);
set local role authenticated;
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'custom-only',
       '91000000-0000-4000-8000-000000000903'
     ) $$,
  '22023', 'reward is not available for self-service redemption',
  'connector-neutral custom rewards are not exposed as native coupons'
);
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'bad-currency',
       '91000000-0000-4000-8000-000000000904'
     ) $$,
  '22023', 'invalid reward currency configuration',
  'invalid currency precision is rejected before value moves'
);
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'bad-validity',
       '91000000-0000-4000-8000-000000000905'
     ) $$,
  '22023', 'invalid reward validity configuration',
  'invalid coupon validity is rejected before value moves'
);
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'bad-maximum',
       '91000000-0000-4000-8000-000000000913'
     ) $$,
  '22023', 'invalid reward coupon configuration',
  'invalid maximum discount is rejected before value moves'
);
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'capped-maximum',
       '91000000-0000-4000-8000-000000000914'
     ) $$,
  '22023', 'percentage discount maximum is unsupported',
  'legacy capped percentages are rejected before native coupon reservation'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.reward_reservations
     where idempotency_key =
       'customer-reward:91000000-0000-4000-8000-000000000914' $$,
  array[0::bigint],
  'an unsupported cap creates no reservation'
);
select results_eq(
  $$ select count(*)::bigint - (select commands from redemption_before)
     from loyalty_private.transactional_outbox $$,
  array[1::bigint],
  'an unsupported cap creates no additional connector command'
);

update loyalty.commerce_connections set status = 'disabled'
where public_id = '91000000-0000-4000-8000-000000000101';
set local role authenticated;
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'shipping',
       '91000000-0000-4000-8000-000000000906'
     ) $$,
  '42501', 'reward redemption not authorized',
  'a disabled connector cannot receive new redemptions'
);
reset role;
update loyalty.commerce_connections set status = 'active'
where public_id = '91000000-0000-4000-8000-000000000101';
update loyalty.workspaces set status = 'suspended'
where public_id = '91000000-0000-4000-8000-000000000110';
set local role authenticated;
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'shipping',
       '91000000-0000-4000-8000-000000000907'
     ) $$,
  '42501', 'reward redemption not authorized',
  'a suspended workspace cannot create value commands'
);
reset role;
update loyalty.workspaces set status = 'active'
where public_id = '91000000-0000-4000-8000-000000000110';
update loyalty.wallets set status = 'blocked'
where organization_id = (select id from loyalty.organizations where slug = 'redeem-one');
set local role authenticated;
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'shipping',
       '91000000-0000-4000-8000-000000000908'
     ) $$,
  '42501', 'reward redemption not authorized',
  'a blocked wallet cannot reserve points'
);
reset role;
update loyalty.wallets set status = 'active'
where organization_id = (select id from loyalty.organizations where slug = 'redeem-one');
set local role authenticated;
set local request.jwt.claim.sub = '';
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'shipping',
       '91000000-0000-4000-8000-000000000910'
     ) $$,
  '42501', 'reward redemption not authorized',
  'a missing Auth subject cannot redeem'
);
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'Five Off',
       '91000000-0000-4000-8000-000000000911'
     ) $$,
  '22023', 'invalid reward redemption request',
  'malformed reward codes are rejected'
);
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       null, 'shipping', '91000000-0000-4000-8000-000000000912'
     ) $$,
  '22023', 'invalid reward redemption request',
  'missing account identity is rejected'
);
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'shipping', null
     ) $$,
  '22023', 'invalid reward redemption request',
  'missing request identity is rejected'
);
reset role;
update loyalty.customer_user_links set revoked_at = now()
where public_id = '91000000-0000-4000-8000-000000000160';
set local role authenticated;
select throws_ok(
  $$ select * from loyalty.redeem_my_reward(
       '91000000-0000-4000-8000-000000000160', 'shipping',
       '91000000-0000-4000-8000-000000000909'
     ) $$,
  '42501', 'reward redemption not authorized',
  'a revoked customer link loses redemption authority immediately'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.reward_reservations
     where idempotency_key like 'customer-reward:%' $$,
  array[1::bigint],
  'all rejected paths leave only the successful reservation'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where idempotency_key like 'customer-reward:%' $$,
  array[1::bigint],
  'all rejected paths leave only the successful ledger effect'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.transactional_outbox
     where topic = 'woocommerce.coupon.issue' $$,
  array[1::bigint],
  'all rejected paths leave only the successful connector command'
);
select results_eq(
  $$ select actor_id from loyalty.reward_reservation_transitions
     where reservation_id = (
       select id from loyalty.reward_reservations
       where public_id = (select reservation_id from redemption_result)
     ) $$,
  array['customer:91000000-0000-4000-8000-000000000001'::text],
  'the immutable transition attributes the exact Auth subject'
);
select results_eq(
  $$ select octet_length(request_sha256)
     from loyalty.reward_reservations
     where public_id = (select reservation_id from redemption_result) $$,
  array[32],
  'the reservation retains only a SHA-256 request fingerprint'
);
select ok(
  (select payload ? 'code'
      and not (payload ? 'authUserId')
      and not (payload ? 'accountId')
   from loyalty_private.transactional_outbox
   where topic = 'woocommerce.coupon.issue'),
  'private coupon payload excludes hosted-account and Auth identifiers'
);
select ok(
  (select extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.string_agg(
          parameter_name::text, ',' order by ordinal_position
        ),
        'UTF8'
      ),
      'sha256'
    ) = extensions.digest(
      pg_catalog.convert_to(
        'target_account_public_id,target_reward_code,target_request_id',
        'UTF8'
      ),
      'sha256'
    )
   from information_schema.parameters
   where specific_schema = 'loyalty'
     and specific_name like 'redeem_my_reward_%'
     and parameter_mode = 'IN'),
  'the caller cannot supply tenant, customer, wallet, points, expiry, or connector authority'
);
select ok(
  (select pg_get_functiondef(
      'loyalty.redeem_my_reward(uuid,text,uuid)'::regprocedure
    ) !~ 'target_organization_id|target_customer_id|target_wallet_id|target_points'),
  'the command source contains no hidden caller-controlled value authority'
);
update loyalty_private.transactional_outbox
set state = 'retryable', attempt_count = 9, available_at = clock_timestamp()
where topic = 'woocommerce.coupon.issue';
create temporary table exhausted_coupon_claim as
select * from loyalty_private.claim_woocommerce_commands(
  '91000000-0000-4000-8000-000000000101', 1, 60
);
select * from loyalty_private.finish_woocommerce_command(
  '91000000-0000-4000-8000-000000000101',
  (select command_id from exhausted_coupon_claim),
  'retryable', null, 'woocommerce_timeout', 60
);
select results_eq(
  $$ select state from loyalty_private.transactional_outbox
     where command_id = (select command_id from exhausted_coupon_claim) $$,
  array['manual_review'::text],
  'an ambiguous tenth coupon attempt stops for manual review'
);
select results_eq(
  $$ select state from loyalty.reward_reservations
     where public_id = (select reservation_id from redemption_result) $$,
  array['reserved'::text],
  'ambiguous coupon exhaustion does not assume absence or release value'
);
select results_eq(
  $$ select count(*)::bigint - (select transactions from redemption_before)
     from loyalty.ledger_transactions $$,
  array[1::bigint],
  'manual review creates no compensating ledger transaction without proof'
);
select * from finish();

rollback;
