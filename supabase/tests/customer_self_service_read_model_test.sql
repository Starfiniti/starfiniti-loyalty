begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select has_function(
  'loyalty', 'get_my_loyalty_accounts', array[]::text[],
  'authenticated customer self-service read model exists'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.get_my_loyalty_accounts()', 'EXECUTE'),
  'authenticated sessions can call their own projection'
);
select ok(
  not has_function_privilege('anon', 'loyalty.get_my_loyalty_accounts()', 'EXECUTE'),
  'anonymous sessions cannot call the customer projection'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty'
       and routine.proname = 'get_my_loyalty_accounts'
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'customer projection is security definer with an empty search path'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.customer_user_links', 'SELECT'),
  'customers cannot enumerate raw Auth links'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.identity_link_decisions', 'SELECT'),
  'customers cannot enumerate identity-link evidence'
);

insert into auth.users (id, email)
values
  ('8c000000-0000-4000-8000-000000000001', 'member-one@example.test'),
  ('8c000000-0000-4000-8000-000000000002', 'member-two@example.test');
insert into loyalty.organizations (slug, name)
values ('member-one', 'Private Member One Org'), ('member-two', 'Private Member Two Org');
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case slug when 'member-one' then '8c000000-0000-4000-8000-000000000110'::uuid
    else '8d000000-0000-4000-8000-000000000110'::uuid end,
  id, 'store', name || ' Store'
from loyalty.organizations where slug in ('member-one', 'member-two');
insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('member-one', 'member-two');
insert into loyalty.programme_group_workspaces (organization_id, programme_group_id, workspace_id)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace on workspace.organization_id = organization.id;
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug when 'member-one' then '8c000000-0000-4000-8000-000000000130'::uuid
    else '8d000000-0000-4000-8000-000000000130'::uuid end,
  organization.id, programme_group.id, 'rosy-rewards',
  case organization.slug when 'member-one' then 'Rosy Rewards' else 'Other Rewards' end,
  'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id;
insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number,
  status, configuration, configuration_sha256, published_at
)
select organization_id, programme_group_id, id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(public_id::text, 'sha256'), now()
from loyalty.programmes where public_id in (
  '8c000000-0000-4000-8000-000000000130',
  '8d000000-0000-4000-8000-000000000130'
);
insert into loyalty.programme_tiers (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, minimum_eligible_spend_minor, points_per_major_unit
)
select organization_id, programme_group_id, id, 'rose', 'Rose', 1, 0, 5
from loyalty.programme_versions;
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points
)
select organization_id, programme_group_id, id,
  'five-off', 'Five off', 'fixed_discount', 500
from loyalty.programme_versions
where organization_id = (select id from loyalty.organizations where slug = 'member-one');
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points
)
select organization_id, programme_group_id, id,
  'large-reward', 'Large reward', 'custom', 9007199254740994
from loyalty.programme_versions
where organization_id = (select id from loyalty.organizations where slug = 'member-one');
insert into loyalty.programme_rewards (
  organization_id, programme_group_id, programme_version_id,
  code, name, reward_kind, cost_points
)
select organization_id, programme_group_id, id,
  'unsafe', '<script>unsafe</script>', 'custom', 1
from loyalty.programme_versions
where organization_id = (select id from loyalty.organizations where slug = 'member-one');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select
  case organization.slug when 'member-one' then '8c000000-0000-4000-8000-000000000101'::uuid
    else '8d000000-0000-4000-8000-000000000101'::uuid end,
  organization.id, workspace.id, organization.slug || '-store',
  case organization.slug when 'member-one' then 'Rosy Store' else 'Other Store' end,
  'v1', 'vault://' || organization.slug, programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id;
insert into loyalty.customers (public_id, organization_id, display_reference)
select
  case slug when 'member-one' then '8c000000-0000-4000-8000-000000000150'::uuid
    else '8d000000-0000-4000-8000-000000000150'::uuid end,
  id, 'Private profile reference'
from loyalty.organizations where slug in ('member-one', 'member-two');
insert into loyalty.customer_user_links (
  organization_id, customer_id, auth_user_id, source_connection_id
)
select organization.id, customer.id,
  case organization.slug when 'member-one' then '8c000000-0000-4000-8000-000000000001'::uuid
    else '8c000000-0000-4000-8000-000000000002'::uuid end,
  connection.id
from loyalty.organizations as organization
join loyalty.customers as customer on customer.organization_id = organization.id
join loyalty.commerce_connections as connection on connection.organization_id = organization.id;

select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'member-one'),
  (select id from loyalty.programme_groups where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  (select id from loyalty.customers where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  9007199254740993, 'member-award', extensions.digest('member-award', 'sha256')
);
select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'member-one'),
  (select id from loyalty.programme_groups where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'member-one')),
  (select entry.public_id from loyalty.ledger_entries as entry
   join loyalty.ledger_accounts as account on account.id = entry.account_id
   where account.organization_id =
       (select id from loyalty.organizations where slug = 'member-one')
     and account.account_kind = 'pending' and entry.points > 0),
  now() + interval '90 days', 'member-release',
  extensions.digest('member-release', 'sha256')
);
insert into loyalty.tier_decisions (
  organization_id, programme_group_id, programme_version_id, wallet_id,
  tier_code, qualified_tier_code, transition, rolling_eligible_spend_minor,
  effective_at, idempotency_key, request_sha256, explanation
)
select wallet.organization_id, wallet.programme_group_id, version.id, wallet.id,
  'rose', 'rose', 'upgrade', 5000, now(), 'member-tier',
  extensions.digest('member-tier', 'sha256'), '{}'::jsonb
from loyalty.wallets as wallet
join loyalty.programme_versions as version
  on version.organization_id = wallet.organization_id
 and version.programme_group_id = wallet.programme_group_id
where wallet.organization_id = (select id from loyalty.organizations where slug = 'member-one');
insert into loyalty.tier_memberships (
  organization_id, programme_group_id, programme_version_id, wallet_id,
  tier_code, decision_id, effective_from
)
select decision.organization_id, decision.programme_group_id,
  decision.programme_version_id, decision.wallet_id, decision.tier_code,
  decision.id, decision.effective_at
from loyalty.tier_decisions as decision where decision.idempotency_key = 'member-tier';
insert into loyalty.reward_reservations (
  organization_id, programme_group_id, programme_version_id, wallet_id,
  reward_id, cost_points, state, idempotency_key, request_sha256, expires_at
)
select wallet.organization_id, wallet.programme_group_id, version.id, wallet.id,
  reward.id, reward.cost_points, 'issued', 'member-reservation',
  extensions.digest('member-reservation', 'sha256'), now() + interval '1 day'
from loyalty.wallets as wallet
join loyalty.programme_versions as version
  on version.organization_id = wallet.organization_id
 and version.programme_group_id = wallet.programme_group_id
join loyalty.programme_rewards as reward
  on reward.organization_id = version.organization_id
 and reward.programme_version_id = version.id
 and reward.code = 'five-off';

create temporary table member_ledger_before as
select count(*)::bigint as transaction_count from loyalty.ledger_transactions;

set local role authenticated;
set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_accounts() $$,
  array[1::bigint],
  'a customer sees exactly their active linked account'
);
select results_eq(
  $$ select store_name, programme_name from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('Rosy Store'::text, 'Rosy Rewards'::text) $$,
  'the projection exposes only the relevant public-facing store and programme names'
);
select results_eq(
  $$ select account_status from loyalty.get_my_loyalty_accounts() $$,
  array['ready'::text],
  'an active linked wallet reports ready status'
);
select results_eq(
  $$ select pending_points, available_points, reserved_points
     from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('0'::text, '9007199254740993'::text, '0'::text) $$,
  'all balances retain exact text-form bigint precision'
);
select results_eq(
  $$ select tier_code, tier_name from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('rose'::text, 'Rose'::text) $$,
  'current tier is minimized to its safe code and name'
);
select results_eq(
  $$ select next_expiry_points from loyalty.get_my_loyalty_accounts() $$,
  array['9007199254740993'::text],
  'the next live expiry lot retains exact points'
);
select results_eq(
  $$ select rewards from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('[{"code":"five-off","kind":"fixed_discount","name":"Five off","affordable":true,"costPoints":"500"},{"code":"large-reward","kind":"custom","name":"Large reward","affordable":false,"costPoints":"9007199254740994"}]'::jsonb) $$,
  'safe current rewards are bounded and affordability is computed with bigint arithmetic'
);
select ok(
  (select rewards::text !~ 'unsafe|script|configuration'
   from loyalty.get_my_loyalty_accounts()),
  'markup-shaped names and raw reward configuration never enter the customer projection'
);
select results_eq(
  $$ select reservations -> 0 ->> 'state' from loyalty.get_my_loyalty_accounts() $$,
  array['issued'::text],
  'only the customer current active reservation is visible'
);
select results_eq(
  $$ select jsonb_array_length(activity) from loyalty.get_my_loyalty_accounts() $$,
  array[2],
  'recent activity is bounded to minimized immutable transactions'
);
select ok(
  (select activity::text !~ 'actor|source|request|metadata|reason'
   from loyalty.get_my_loyalty_accounts()),
  'activity omits actors source references fingerprints metadata and reasons'
);
select ok(
  (select store_name <> 'Private Member One Org'
      and customer_id = '8c000000-0000-4000-8000-000000000150'
   from loyalty.get_my_loyalty_accounts()),
  'organization identity and private customer profile text are omitted'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  $$ select transaction_count from member_ledger_before $$,
  'reading the account creates no ledger transaction'
);
set local role authenticated;
set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000001';

set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select store_name, account_status from loyalty.get_my_loyalty_accounts() $$,
  $$ values ('Other Store'::text, 'ready_without_activity'::text) $$,
  'another Auth user sees only their own honest empty account'
);
select ok(
  (select every(store_name <> 'Rosy Store') from loyalty.get_my_loyalty_accounts()),
  'another customer cannot read the first tenant account'
);

set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000001';
reset role;
update loyalty.customer_user_links set revoked_at = clock_timestamp()
where auth_user_id = '8c000000-0000-4000-8000-000000000001';
set local role authenticated;
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_accounts() $$,
  array[0::bigint],
  'revocation removes customer self access immediately'
);

reset role;
update loyalty.workspaces set status = 'suspended'
where public_id = '8d000000-0000-4000-8000-000000000110';
set local role authenticated;
set local request.jwt.claim.sub = '8c000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_accounts() $$,
  array[0::bigint],
  'a suspended workspace removes hosted account access'
);

set local request.jwt.claim.sub = '';
select results_eq(
  $$ select count(*)::bigint from loyalty.get_my_loyalty_accounts() $$,
  array[0::bigint],
  'a missing authenticated subject fails closed'
);
select is_empty(
  $$ select parameter_name from information_schema.parameters
     where specific_schema = 'loyalty'
       and specific_name like 'get_my_loyalty_accounts_%'
       and parameter_mode = 'IN' $$,
  'the caller cannot inject organization customer workspace or programme authority'
);
select ok(
  (select pg_get_functiondef('loyalty.get_my_loyalty_accounts()'::regprocedure)
      !~* 'email'),
  'customer self access contains no email matching path'
);
select ok(
  (select pg_get_functiondef('loyalty.get_my_loyalty_accounts()'::regprocedure)
      ~ 'limit 20'),
  'account and reward output is explicitly bounded'
);

select * from finish();
rollback;
