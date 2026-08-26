begin;

create extension if not exists pgtap with schema extensions;

select plan(72);

select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'loyalty.service_accounts'::regclass $$,
  array[true], 'service accounts have RLS enabled'
);
select results_eq(
  $$ select count(*)::bigint from pg_class where oid in (
    'loyalty_private.service_account_credentials'::regclass,
    'loyalty_private.service_account_identity_peppers'::regclass,
    'loyalty_private.service_customer_identities'::regclass,
    'loyalty_private.service_customer_command_receipts'::regclass,
    'loyalty_private.service_account_rate_windows'::regclass
  ) and relrowsecurity $$,
  array[5::bigint], 'every private service API table has RLS enabled'
);
select ok(
  has_function_privilege('loyalty_runtime', 'loyalty_private.create_service_account_v1(uuid,uuid,uuid,text,text[],integer,text,uuid)', 'EXECUTE'),
  'runtime can enter the guarded service-account creation boundary'
);
select ok(
  has_function_privilege('loyalty_runtime', 'loyalty_private.issue_service_account_credential_v1(uuid,uuid,uuid,bytea,text,integer,text,uuid)', 'EXECUTE'),
  'runtime can issue one-time credential digests'
);
select ok(
  has_function_privilege('loyalty_runtime', 'loyalty_private.revoke_service_account_credential_v1(uuid,uuid,uuid,text,text,uuid)', 'EXECUTE'),
  'runtime can revoke a credential even when growth is disabled'
);
select ok(
  has_function_privilege('loyalty_runtime', 'loyalty_private.upsert_service_customer_v1(uuid,bytea,text,text,uuid)', 'EXECUTE'),
  'runtime can enter the scoped customer command'
);
select ok(
  has_function_privilege('loyalty_runtime', 'loyalty_private.accept_service_activity_v1(uuid,bytea,text,text,timestamptz,text,text,text,text[],text,uuid)', 'EXECUTE'),
  'runtime can enter the scoped activity command'
);
select ok(
  not has_function_privilege('loyalty_runtime', 'loyalty_private.authorize_service_account_request_v1(uuid,bytea,text)', 'EXECUTE'),
  'runtime cannot bypass the complete customer or activity command'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.get_my_service_accounts_v1(uuid)', 'EXECUTE'),
  'authenticated owners and admins can enter the minimized read'
);
select ok(
  not has_function_privilege('authenticated', 'loyalty_private.upsert_service_customer_v1(uuid,bytea,text,text,uuid)', 'EXECUTE'),
  'browser roles cannot enter service customer commands'
);
select ok(
  not has_function_privilege('anon', 'loyalty.get_my_service_accounts_v1(uuid)', 'EXECUTE'),
  'anonymous callers cannot read service accounts'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.service_accounts', 'SELECT'),
  'browser roles have no direct service-account table read'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty_private.service_account_credentials', 'SELECT'),
  'browser roles cannot inspect credential digests'
);
select ok(
  not has_table_privilege('loyalty_runtime', 'loyalty_private.service_account_credentials', 'SELECT'),
  'runtime uses exact functions rather than credential-table grants'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname in (
        'create_service_account_v1',
        'issue_service_account_credential_v1',
        'revoke_service_account_credential_v1',
        'authorize_service_account_request_v1',
        'upsert_service_customer_v1',
        'accept_service_activity_v1',
        'get_my_service_accounts_v1'
      ) and routine.prosecdef
  $$,
  array[7::bigint], 'all public service API boundaries are security definer'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname in (
        'create_service_account_v1',
        'issue_service_account_credential_v1',
        'revoke_service_account_credential_v1',
        'authorize_service_account_request_v1',
        'upsert_service_customer_v1',
        'accept_service_activity_v1',
        'get_my_service_accounts_v1'
      ) and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[7::bigint], 'all service API boundaries pin an empty search path'
);
select is_empty(
  $$
    select parameter_name from information_schema.parameters
    where specific_schema = 'loyalty_private'
      and specific_name like 'upsert_service_customer_v1_%'
      and parameter_name in (
        'organization_id', 'workspace_id', 'programme_id', 'connection_id',
        'customer_id', 'wallet_id', 'actor_user_id'
      )
  $$,
  'inbound customer commands accept no caller tenant actor customer or wallet authority'
);

insert into auth.users (id, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'service-owner@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'service-admin@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'service-operator@example.test'),
  ('a1000000-0000-4000-8000-000000000004', 'service-revoked@example.test'),
  ('a2000000-0000-4000-8000-000000000001', 'service-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('a1000000-0000-4000-8000-000000000100', 'service-one', 'Service One'),
  ('a2000000-0000-4000-8000-000000000100', 'service-two', 'Service Two');

insert into loyalty.organization_memberships (organization_id, user_id, role, revoked_at)
values
  ((select id from loyalty.organizations where slug = 'service-one'), 'a1000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'service-one'), 'a1000000-0000-4000-8000-000000000002', 'admin', null),
  ((select id from loyalty.organizations where slug = 'service-one'), 'a1000000-0000-4000-8000-000000000003', 'operator', null),
  ((select id from loyalty.organizations where slug = 'service-one'), 'a1000000-0000-4000-8000-000000000004', 'owner', now()),
  ((select id from loyalty.organizations where slug = 'service-two'), 'a2000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'service-one' then 'a1000000-0000-4000-8000-000000000200'::uuid
    else 'a2000000-0000-4000-8000-000000000200'::uuid end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('service-one', 'service-two');

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug
    when 'service-one' then 'a1000000-0000-4000-8000-000000000300'::uuid
    else 'a2000000-0000-4000-8000-000000000300'::uuid end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('service-one', 'service-two');

insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('service-one', 'service-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select case organization.slug
    when 'service-one' then 'a1000000-0000-4000-8000-000000000400'::uuid
    else 'a2000000-0000-4000-8000-000000000400'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('service-one', 'service-two');

create function pg_temp.service_v2_definition()
returns jsonb language sql immutable as $$
  select '{
    "version":"2","currencyCode":"EUR","currencyMinorUnitDigits":2,
    "pendingDays":30,"pointsExpireAfterDays":365,
    "tiers":[{"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}],
    "rewards":[],
    "earningRules":[{
      "code":"consultation","name":"Consultation","source":"custom_activity",
      "enabled":true,"priority":10,"stackable":true,
      "effect":{"kind":"fixed_bonus","points":"25"},
      "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":["consultation"],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
      "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
      "cap":{"perEventPoints":"25","perMemberPoints":null,"memberPeriod":null,"rollingDays":null}
    }]
  }'::jsonb;
$$;

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  created_by_user_id, approved_by_user_id, published_at
)
select case organization.slug
    when 'service-one' then 'a1000000-0000-4000-8000-000000000500'::uuid
    else 'a2000000-0000-4000-8000-000000000500'::uuid end,
  organization.id, programme.programme_group_id, programme.id, 1,
  'published', pg_temp.service_v2_definition(),
  extensions.digest(convert_to(pg_temp.service_v2_definition()::text, 'UTF8'), 'sha256'),
  membership.user_id, membership.user_id, now()
from loyalty.organizations as organization
join loyalty.programmes as programme on programme.organization_id = organization.id
join loyalty.organization_memberships as membership
  on membership.organization_id = organization.id
 and membership.role = 'owner' and membership.revoked_at is null
where organization.slug in ('service-one', 'service-two');

create function pg_temp.service_account_public_id(target_display_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select account.public_id
  from loyalty.service_accounts as account
  where account.display_name = target_display_name;
$$;
grant execute on function pg_temp.service_account_public_id(text) to loyalty_runtime;

set local role loyalty_runtime;
select results_eq(
  $$ select outcome from loyalty_private.create_service_account_v1(
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000200',
    'a1000000-0000-4000-8000-000000000400',
    'ERP production', array['customers:write','activities:write'], 10,
    'service:create:main', 'a1000000-0000-4000-8000-000000000701'
  ) $$,
  array['created'::text], 'owner creates one scoped service account'
);
select results_eq(
  $$ select outcome from loyalty_private.create_service_account_v1(
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000200',
    'a1000000-0000-4000-8000-000000000400',
    'ERP production', array['activities:write','customers:write'], 10,
    'service:create:main', 'a1000000-0000-4000-8000-000000000701'
  ) $$,
  array['duplicate'::text], 'scope ordering does not change exact creation retry identity'
);
select throws_ok(
  $$ select * from loyalty_private.create_service_account_v1(
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000200',
    'a1000000-0000-4000-8000-000000000400',
    'Changed ERP', array['customers:write'], 10,
    'service:create:main', 'a1000000-0000-4000-8000-000000000701'
  ) $$,
  '23514', 'service account idempotency conflict',
  'changed service-account retry fails closed'
);
select throws_ok(
  $$ select * from loyalty_private.create_service_account_v1(
    'a1000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000200',
    'a1000000-0000-4000-8000-000000000400',
    'Operator', array['customers:write'], 10,
    'service:create:operator', 'a1000000-0000-4000-8000-000000000702'
  ) $$,
  '42501', 'service account command not authorized',
  'operator cannot create server authority'
);
select throws_ok(
  $$ select * from loyalty_private.create_service_account_v1(
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000200',
    'a2000000-0000-4000-8000-000000000400',
    'Cross tenant', array['customers:write'], 10,
    'service:create:cross', 'a1000000-0000-4000-8000-000000000703'
  ) $$,
  '42501', 'service account command not authorized',
  'caller cannot substitute another tenant workspace and programme'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.service_accounts where display_name = 'ERP production' $$,
  array[1::bigint], 'creation retry retains one service account'
);
select results_eq(
  $$ select platform || ':' || current_key_version from loyalty.commerce_connections where platform = 'service_api' and organization_id = (select id from loyalty.organizations where slug = 'service-one') $$,
  array['service_api:v1'::text], 'service account receives one internal canonical-event connection'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.service_account_identity_peppers $$,
  array[1::bigint], 'service account receives one private random identity pepper'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where action = 'service_account.create' $$,
  array[1::bigint], 'service-account creation appends one immutable audit event'
);

set local role loyalty_runtime;
select results_eq(
  $$ select outcome || ':' || secret_hint from loyalty_private.issue_service_account_credential_v1(
    'a1000000-0000-4000-8000-000000000001',
    pg_temp.service_account_public_id('ERP production'),
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'firstA', 300, 'service:credential:first',
    'a1000000-0000-4000-8000-000000000711'
  ) $$,
  array['created:firstA'::text], 'owner issues the first credential digest'
);
select results_eq(
  $$ select credential_public_id::text || ':' || outcome from loyalty_private.issue_service_account_credential_v1(
    'a1000000-0000-4000-8000-000000000001',
    pg_temp.service_account_public_id('ERP production'),
    'a1000000-0000-4000-8000-000000000712', decode(repeat('b',64),'hex'),
    'lostBB', 300, 'service:credential:first',
    'a1000000-0000-4000-8000-000000000711'
  ) $$,
  array['a1000000-0000-4000-8000-000000000710:duplicate'::text],
  'issuance retry returns the original selector without storing a replacement secret'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty_private.service_account_credentials $$,
  array[1::bigint], 'issuance retry stores one credential digest'
);
select results_eq(
  $$ select encode(token_sha256,'hex') from loyalty_private.service_account_credentials $$,
  array[repeat('a',64)], 'database retains only the submitted digest'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events where metadata::text ~ repeat('a',32) or metadata::text ~ 'sflt_' $$,
  array[0::bigint], 'audit metadata contains no credential digest or bearer token'
);
select throws_ok(
  $$ update loyalty_private.service_account_credentials set token_sha256 = decode(repeat('c',64),'hex') $$,
  '55000', 'service credential material is immutable',
  'credential digest cannot be rewritten'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select jsonb_array_length(document -> 'serviceAccounts') from loyalty.get_my_service_accounts_v1('a1000000-0000-4000-8000-000000000100') $$,
  array[1], 'owner reads one bounded service account'
);
select results_eq(
  $$ select (document -> 'serviceAccounts' -> 0 -> 'credentials' -> 0 ->> 'secretHint') from loyalty.get_my_service_accounts_v1('a1000000-0000-4000-8000-000000000100') $$,
  array['firstA'::text], 'read exposes only the non-secret credential hint'
);
select is_empty(
  $$ select document from loyalty.get_my_service_accounts_v1('a1000000-0000-4000-8000-000000000100') where document::text ~ repeat('a',32) or document::text ~ 'sflt_' $$,
  'browser projection contains no reusable secret or digest'
);
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.get_my_service_accounts_v1('a1000000-0000-4000-8000-000000000100') $$,
  '42501', 'service account read not authorized',
  'operator cannot inspect credential lifecycle metadata'
);
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_my_service_accounts_v1('a1000000-0000-4000-8000-000000000100') $$,
  '42501', 'service account read not authorized',
  'another tenant cannot read service accounts'
);
reset role;

set local role loyalty_runtime;
select results_eq(
  $$ select outcome from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'crm-customer-42', 'customer:42', 'a1000000-0000-4000-8000-000000000720'
  ) $$,
  array['created'::text], 'scoped credential creates one opaque customer mapping'
);
select results_eq(
  $$ select outcome from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'crm-customer-42', 'customer:42', 'a1000000-0000-4000-8000-000000000720'
  ) $$,
  array['duplicate'::text], 'exact customer command retry returns the original customer'
);
select throws_ok(
  $$ select * from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'crm-customer-43', 'customer:42', 'a1000000-0000-4000-8000-000000000720'
  ) $$,
  '23514', 'service customer idempotency conflict',
  'changed customer retry fails closed'
);
select results_eq(
  $$ select outcome from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'crm-customer-42', 'customer:42:second', 'a1000000-0000-4000-8000-000000000721'
  ) $$,
  array['existing'::text], 'a new command for the same namespace resolves the existing customer'
);
select throws_ok(
  $$ select * from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('f',64),'hex'),
    'crm-customer-42', 'customer:wrong-secret', 'a1000000-0000-4000-8000-000000000722'
  ) $$,
  '28000', 'invalid service credential', 'wrong token digest fails closed'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty_private.service_customer_identities $$,
  array[1::bigint], 'customer retries retain one HMAC identity mapping'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.service_customer_command_receipts $$,
  array[2::bigint], 'two distinct customer commands retain two immutable receipts'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customers where organization_id = (select id from loyalty.organizations where slug = 'service-one') $$,
  array[1::bigint], 'customer retries create one tenant customer'
);
select is_empty(
  $$ select external_customer_sha256 from loyalty_private.service_customer_identities where encode(external_customer_sha256,'hex') = encode(extensions.digest(convert_to('crm-customer-42','UTF8'),'sha256'),'hex') $$,
  'stored customer fingerprint is keyed rather than a reversible plain digest'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint], 'customer synchronization creates no loyalty value'
);

set local role loyalty_runtime;
select results_eq(
  $$ select receipt_outcome || ':' || canonical_outcome from loyalty_private.accept_service_activity_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'crm-customer-42', 'consultation:42', '2026-08-26 01:00:00+00',
    'custom_activity', 'consultation', null, array[]::text[],
    'activity:42', 'a1000000-0000-4000-8000-000000000730'
  ) $$,
  array['accepted:created'::text], 'service activity enters the canonical commerce pipeline'
);
select results_eq(
  $$ select receipt_outcome || ':' || canonical_outcome from loyalty_private.accept_service_activity_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'crm-customer-42', 'consultation:42',
    '2026-08-26 01:00:00+00',
    'custom_activity', 'consultation', null, array[]::text[],
    'activity:42', 'a1000000-0000-4000-8000-000000000730'
  ) $$,
  array['duplicate:duplicate'::text], 'exact activity replay produces one canonical event'
);
select throws_ok(
  $$ select * from loyalty_private.accept_service_activity_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'crm-customer-42', 'consultation:changed',
    '2026-08-26 01:00:00+00',
    'custom_activity', 'other_activity', null, array[]::text[],
    'activity:42', 'a1000000-0000-4000-8000-000000000730'
  ) $$,
  '23514', 'delivery id reused with different body hash',
  'changed activity retry fails at the canonical inbox fence'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty_private.canonical_commerce_events where event_type = 'commerce.activity.recorded' $$,
  array[1::bigint], 'activity retry retains one canonical event'
);
select is_empty(
  $$ select raw_body from loyalty_private.commerce_delivery_inbox
     where raw_body::text like '%crm-customer-42%'
        or raw_body::text like '%' || repeat('a',64) || '%' $$,
  'canonical inbox stores no raw external customer identifier or token digest'
);
select results_eq(
  $$ select payload ->> 'customerId' from loyalty_private.canonical_commerce_events where event_type = 'commerce.activity.recorded' $$,
  $$ select customer.public_id::text from loyalty.customers as customer where customer.organization_id = (select id from loyalty.organizations where slug = 'service-one') $$,
  'canonical activity uses only the resolved public customer selector'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.commerce_business_effects $$,
  array[0::bigint], 'API acceptance does not bypass the worker effect fence'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint], 'API acceptance never writes value directly'
);

set local role loyalty_runtime;
select results_eq(
  $$ select outcome from loyalty_private.issue_service_account_credential_v1(
    'a1000000-0000-4000-8000-000000000001',
    pg_temp.service_account_public_id('ERP production'),
    'a1000000-0000-4000-8000-000000000713', decode(repeat('b',64),'hex'),
    'second', 300, 'service:credential:second',
    'a1000000-0000-4000-8000-000000000714'
  ) $$,
  array['created'::text], 'rotation issues a new credential'
);
select results_eq(
  $$ select outcome from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'crm-customer-42', 'customer:overlap:old', 'a1000000-0000-4000-8000-000000000723'
  ) $$,
  array['existing'::text], 'old credential remains valid inside bounded overlap'
);
select results_eq(
  $$ select outcome from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000713', decode(repeat('b',64),'hex'),
    'crm-customer-42', 'customer:overlap:new', 'a1000000-0000-4000-8000-000000000724'
  ) $$,
  array['existing'::text], 'new credential is active immediately during overlap'
);
select results_eq(
  $$ select outcome || ':' || status from loyalty_private.revoke_service_account_credential_v1(
    'a1000000-0000-4000-8000-000000000001',
    pg_temp.service_account_public_id('ERP production'),
    'a1000000-0000-4000-8000-000000000710', 'Rotation complete',
    'service:credential:revoke:first', 'a1000000-0000-4000-8000-000000000715'
  ) $$,
  array['revoked:revoked'::text], 'owner revokes the retiring credential immediately'
);
select throws_ok(
  $$ select * from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000710', decode(repeat('a',64),'hex'),
    'crm-customer-42', 'customer:revoked', 'a1000000-0000-4000-8000-000000000725'
  ) $$,
  '28000', 'invalid service credential', 'revoked credential fails on the next request'
);
select results_eq(
  $$ select outcome from loyalty_private.revoke_service_account_credential_v1(
    'a1000000-0000-4000-8000-000000000001',
    pg_temp.service_account_public_id('ERP production'),
    'a1000000-0000-4000-8000-000000000710', 'Rotation complete',
    'service:credential:revoke:first', 'a1000000-0000-4000-8000-000000000715'
  ) $$,
  array['duplicate'::text], 'exact revocation retry returns the original state'
);
reset role;

select results_eq(
  $$ select status from loyalty_private.service_account_credentials where public_id = 'a1000000-0000-4000-8000-000000000713' $$,
  array['active'::text], 'replacement credential remains independently active'
);

set local role loyalty_runtime;
select results_eq(
  $$ select outcome from loyalty_private.create_service_account_v1(
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000200',
    'a1000000-0000-4000-8000-000000000400',
    'Quota probe', array['customers:write'], 10,
    'service:create:quota', 'a1000000-0000-4000-8000-000000000740'
  ) $$,
  array['created'::text], 'a second account receives an independent quota partition'
);
select results_eq(
  $$ select outcome from loyalty_private.issue_service_account_credential_v1(
    'a1000000-0000-4000-8000-000000000001',
    pg_temp.service_account_public_id('Quota probe'),
    'a1000000-0000-4000-8000-000000000741', decode(repeat('c',64),'hex'),
    'quotaC', 0, 'service:credential:quota',
    'a1000000-0000-4000-8000-000000000742'
  ) $$,
  array['created'::text], 'quota probe receives one credential'
);
do $$
begin
  for counter in 1..10 loop
    perform * from loyalty_private.upsert_service_customer_v1(
      'a1000000-0000-4000-8000-000000000741', decode(repeat('c',64),'hex'),
      'quota-customer-' || counter::text, 'quota:customer:' || counter::text,
      ('a1000000-0000-4000-8000-' || lpad((750 + counter)::text, 12, '0'))::uuid
    );
  end loop;
end;
$$;
select throws_ok(
  $$ select * from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000741', decode(repeat('c',64),'hex'),
    'quota-customer-11', 'quota:customer:11', 'a1000000-0000-4000-8000-000000000799'
  ) $$,
  'P0001', 'service account rate limit exceeded',
  'eleventh concurrent-window request fails at the database quota'
);
reset role;

select results_eq(
  $$ select request_count from loyalty_private.service_account_rate_windows where credential_id = (select id from loyalty_private.service_account_credentials where public_id = 'a1000000-0000-4000-8000-000000000741') $$,
  array[10], 'authoritative quota counter stops exactly at the configured limit'
);

select loyalty_private.set_organization_entitlement(
  'a1000000-0000-4000-8000-000000000100', 'ecosystem.api', 'disabled', null,
  'local_control', 'pgtap', 'Disable API growth after the canary',
  clock_timestamp() - interval '1 second', null
);

set local role loyalty_runtime;
select throws_ok(
  $$ select * from loyalty_private.upsert_service_customer_v1(
    'a1000000-0000-4000-8000-000000000713', decode(repeat('b',64),'hex'),
    'crm-customer-42', 'customer:disabled', 'a1000000-0000-4000-8000-000000000726'
  ) $$,
  '42501', 'ecosystem capability disabled',
  'disabled ecosystem capability blocks new inbound growth'
);
select results_eq(
  $$ select outcome from loyalty_private.revoke_service_account_credential_v1(
    'a1000000-0000-4000-8000-000000000001',
    pg_temp.service_account_public_id('ERP production'),
    'a1000000-0000-4000-8000-000000000713', 'Capability disabled',
    'service:credential:revoke:disabled', 'a1000000-0000-4000-8000-000000000716'
  ) $$,
  array['revoked'::text], 'security revocation remains available when growth is disabled'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select jsonb_array_length(document -> 'serviceAccounts') from loyalty.get_my_service_accounts_v1('a1000000-0000-4000-8000-000000000100') $$,
  array[2], 'owner retains service-account history while capability is disabled'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint], 'credential lifecycle quota and customer commands never mutate loyalty value'
);
select throws_ok(
  $$ update loyalty_private.service_customer_identities set external_customer_sha256 = decode(repeat('d',64),'hex') $$,
  '55000', 'immutable loyalty history cannot be changed',
  'service customer identity evidence is immutable'
);
select throws_ok(
  $$ delete from loyalty_private.service_customer_command_receipts $$,
  '55000', 'immutable loyalty history cannot be changed',
  'service customer receipts are immutable'
);

select * from finish();
rollback;
