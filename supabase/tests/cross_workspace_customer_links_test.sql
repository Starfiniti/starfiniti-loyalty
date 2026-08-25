begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

select has_column(
  'loyalty', 'customer_user_links', 'source_customer_id',
  'customer Auth links retain the immutable source customer'
);
select results_eq(
  $$
    select relrowsecurity from pg_class
    where oid = 'loyalty.customer_identity_link_versions'::regclass
  $$,
  array[true],
  'customer-link versions have RLS enabled'
);
select results_eq(
  $$
    select relrowsecurity from pg_class
    where oid = 'loyalty.customer_identity_link_version_members'::regclass
  $$,
  array[true],
  'customer-link version membership has RLS enabled'
);
select results_eq(
  $$
    select relrowsecurity from pg_class
    where oid = 'loyalty_private.customer_link_projection_authorizations'::regclass
  $$,
  array[true],
  'projection capabilities have RLS enabled'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_my_cross_workspace_customer_links_v1()', 'EXECUTE'
  ),
  'authenticated customers can enter the minimized no-selector read'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.unlink_my_cross_workspace_customer_account_v1(uuid,text,uuid)',
    'EXECUTE'
  ),
  'authenticated customers can enter the Auth-derived unlink command'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_my_cross_workspace_customer_links_v1()', 'EXECUTE'
  ),
  'anonymous clients cannot read customer link state'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.unlink_my_cross_workspace_customer_account_v1(uuid,text,uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot unlink a customer account'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty.customer_identity_link_versions', 'SELECT'
  ),
  'browser clients cannot enumerate immutable link versions'
);
select ok(
  not has_table_privilege(
    'loyalty_runtime',
    'loyalty_private.customer_link_projection_authorizations', 'INSERT'
  ),
  'runtime code cannot mint projection capabilities directly'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname in (
        'get_my_cross_workspace_customer_links_v1',
        'unlink_my_cross_workspace_customer_account_v1'
      )
      and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[2::bigint],
  'both exposed boundaries are security-definer with an empty search path'
);
select is_empty(
  $$
    select column_name
    from information_schema.columns
    where table_schema = 'loyalty'
      and table_name in (
        'customer_identity_link_versions',
        'customer_identity_link_version_members'
      )
      and column_name in ('email', 'domain', 'name', 'address')
  $$,
  'cross-workspace link evidence contains no attribute-matching authority'
);

insert into auth.users (id, email)
values
  ('93000000-0000-4000-8000-000000000001', 'linked-customer@example.test'),
  ('93000000-0000-4000-8000-000000000002', 'other-customer@example.test'),
  ('94000000-0000-4000-8000-000000000001', 'other-tenant@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('93000000-0000-4000-8000-000000000100', 'customer-link-one', 'Customer Link One'),
  ('94000000-0000-4000-8000-000000000100', 'customer-link-two', 'Customer Link Two');

insert into loyalty.workspaces (public_id, organization_id, slug, name)
values
  ('93000000-0000-4000-8000-000000000201', (select id from loyalty.organizations where slug = 'customer-link-one'), 'alpha', 'Alpha store'),
  ('93000000-0000-4000-8000-000000000202', (select id from loyalty.organizations where slug = 'customer-link-one'), 'beta', 'Beta store'),
  ('93000000-0000-4000-8000-000000000203', (select id from loyalty.organizations where slug = 'customer-link-one'), 'gamma', 'Gamma store'),
  ('94000000-0000-4000-8000-000000000201', (select id from loyalty.organizations where slug = 'customer-link-two'), 'other', 'Other store');

insert into loyalty.programme_groups (
  public_id, organization_id, slug, name, sharing_policy
)
values
  ('93000000-0000-4000-8000-000000000301', (select id from loyalty.organizations where slug = 'customer-link-one'), 'shared', 'Shared rewards', 'explicit-workspace-allowlist'),
  ('94000000-0000-4000-8000-000000000301', (select id from loyalty.organizations where slug = 'customer-link-two'), 'other', 'Other rewards', 'isolated');

insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where (organization.slug = 'customer-link-one' and workspace.slug in ('alpha', 'beta', 'gamma'))
   or (organization.slug = 'customer-link-two' and workspace.slug = 'other');

insert into loyalty.programme_group_sharing_versions (
  organization_id, programme_group_id, revision, sharing_mode,
  source_kind, created_by_user_id
)
select organization.id, programme_group.id, 1,
  programme_group.sharing_policy, 'migration', null
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('customer-link-one', 'customer-link-two');

insert into loyalty.programme_group_sharing_version_workspaces (
  organization_id, sharing_version_id, workspace_id, ordinal
)
select version.organization_id, version.id, workspace.id,
  row_number() over (partition by version.id order by workspace.public_id)::smallint
from loyalty.programme_group_sharing_versions as version
join loyalty.programme_group_workspaces as current_link
  on current_link.organization_id = version.organization_id
 and current_link.programme_group_id = version.programme_group_id
join loyalty.workspaces as workspace
  on workspace.organization_id = current_link.organization_id
 and workspace.id = current_link.workspace_id
where version.revision = 1;

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
values
  ('93000000-0000-4000-8000-000000000401', (select id from loyalty.organizations where slug = 'customer-link-one'), (select id from loyalty.programme_groups where public_id = '93000000-0000-4000-8000-000000000301'), 'shared', 'Shared loyalty', 'active'),
  ('94000000-0000-4000-8000-000000000401', (select id from loyalty.organizations where slug = 'customer-link-two'), (select id from loyalty.programme_groups where public_id = '94000000-0000-4000-8000-000000000301'), 'other', 'Other loyalty', 'active');

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, platform, external_store_id,
  display_name, current_key_version, signing_material_ref, programme_id
)
select source.public_id, organization.id, workspace.id, 'woocommerce',
  source.external_store_id, source.display_name, 'v1', source.signing_ref,
  programme.id
from (
  values
    ('93000000-0000-4000-8000-000000000501'::uuid, 'customer-link-one', 'alpha', 'customer-link-alpha', 'Alpha WooCommerce', 'vault://customer-link-alpha', 'shared'),
    ('93000000-0000-4000-8000-000000000502'::uuid, 'customer-link-one', 'beta', 'customer-link-beta', 'Beta WooCommerce', 'vault://customer-link-beta', 'shared'),
    ('93000000-0000-4000-8000-000000000503'::uuid, 'customer-link-one', 'gamma', 'customer-link-gamma', 'Gamma WooCommerce', 'vault://customer-link-gamma', 'shared'),
    ('94000000-0000-4000-8000-000000000501'::uuid, 'customer-link-two', 'other', 'customer-link-other', 'Other WooCommerce', 'vault://customer-link-other', 'other')
) as source(public_id, organization_slug, workspace_slug, external_store_id, display_name, signing_ref, programme_slug)
join loyalty.organizations as organization on organization.slug = source.organization_slug
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id and workspace.slug = source.workspace_slug
join loyalty.programmes as programme
  on programme.organization_id = organization.id and programme.slug = source.programme_slug;

select * from loyalty_private.resolve_commerce_customer(
  (select id from loyalty.organizations where slug = 'customer-link-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'customer-link-alpha'),
  'registered', '7'
);
select * from loyalty_private.resolve_commerce_customer(
  (select id from loyalty.organizations where slug = 'customer-link-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'customer-link-beta'),
  'registered', '8'
);
select * from loyalty_private.resolve_commerce_customer(
  (select id from loyalty.organizations where slug = 'customer-link-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'customer-link-gamma'),
  'registered', '9'
);
select * from loyalty_private.resolve_commerce_customer(
  (select id from loyalty.organizations where slug = 'customer-link-two'),
  (select id from loyalty.commerce_connections where external_store_id = 'customer-link-other'),
  'registered', '7'
);

create temporary table customer_link_instants as
select now() as alpha_at, now() + interval '1 millisecond' as beta_at,
  now() + interval '2 milliseconds' as gamma_at;

create temporary table alpha_claim as
select * from loyalty_private.claim_woocommerce_customer_identity(
  '93000000-0000-4000-8000-000000000501', '7',
  '93000000-0000-4000-8000-000000000001', 'v1',
  (select alpha_at from customer_link_instants),
  extensions.digest('customer-link-alpha-nonce', 'sha256'),
  extensions.digest('customer-link-alpha-proof', 'sha256')
);

select results_eq(
  $$ select outcome from alpha_claim $$,
  array['linked'::text],
  'the first store requires and accepts its own verified claim'
);
select results_eq(
  $$
    select (source_customer_id = customer_id)::text
    from loyalty.customer_user_links
    where public_id = (select link_public_id from alpha_claim)
  $$,
  array['true'::text],
  'the first account retains an identical source and current customer'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_identity_link_versions $$,
  array[0::bigint],
  'one store proof alone creates no cross-workspace link'
);

create temporary table beta_claim as
select * from loyalty_private.claim_woocommerce_customer_identity(
  '93000000-0000-4000-8000-000000000502', '8',
  '93000000-0000-4000-8000-000000000001', 'v1',
  (select beta_at from customer_link_instants),
  extensions.digest('customer-link-beta-nonce', 'sha256'),
  extensions.digest('customer-link-beta-proof', 'sha256')
);

select results_eq(
  $$ select outcome from beta_claim $$,
  array['linked'::text],
  'a second independently verified store creates the explicit shared link'
);
select results_eq(
  $$
    select count(distinct customer_id)::text || ':' ||
      count(distinct source_customer_id)::text
    from loyalty.customer_user_links
    where organization_id = (select id from loyalty.organizations where slug = 'customer-link-one')
      and auth_user_id = '93000000-0000-4000-8000-000000000001'
      and revoked_at is null
  $$,
  array['1:2'::text],
  'two immutable source customers project to one canonical customer'
);
select results_eq(
  $$
    select count(distinct identity.customer_id)::bigint
    from loyalty.customer_identities as identity
    where identity.commerce_connection_id in (
      select id from loyalty.commerce_connections
      where external_store_id in ('customer-link-alpha', 'customer-link-beta')
    )
  $$,
  array[1::bigint],
  'both exact verified identities now resolve to the canonical customer'
);
select results_eq(
  $$
    select state || ':' || revision::text || ':' || member_count::text
    from loyalty.customer_identity_link_versions
  $$,
  array['active:1:2'::text],
  'the first immutable link revision records an active two-store set'
);
select results_eq(
  $$
    select count(*)::text || ':' ||
      count(*) filter (where canonical)::text || ':' ||
      count(distinct source_customer_id)::text
    from loyalty.customer_identity_link_version_members
  $$,
  array['2:1:2'::text],
  'the exact revision has two source members and one canonical account'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'verified linking writes no ledger value'
);

select results_eq(
  $$
    select outcome from loyalty_private.claim_woocommerce_customer_identity(
      '93000000-0000-4000-8000-000000000502', '8',
      '93000000-0000-4000-8000-000000000001', 'v1',
      (select beta_at from customer_link_instants),
      extensions.digest('customer-link-beta-nonce', 'sha256'),
      extensions.digest('customer-link-beta-proof', 'sha256')
    )
  $$,
  array['linked'::text],
  'an exact second-store proof retry returns its original outcome'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_identity_link_versions $$,
  array[1::bigint],
  'an exact proof retry appends no duplicate link revision'
);
select results_eq(
  $$
    select outcome from loyalty_private.claim_woocommerce_customer_identity(
      '93000000-0000-4000-8000-000000000502', '8',
      '93000000-0000-4000-8000-000000000001', 'v1', now(),
      extensions.digest('customer-link-beta-nonce-2', 'sha256'),
      extensions.digest('customer-link-beta-proof-2', 'sha256')
    )
  $$,
  array['already_linked'::text],
  'a fresh proof for the already linked exact store is harmless'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_identity_link_versions $$,
  array[1::bigint],
  'an already-linked proof does not invent a new topology revision'
);
select results_eq(
  $$
    select outcome from loyalty_private.claim_woocommerce_customer_identity(
      '93000000-0000-4000-8000-000000000502', '8',
      '93000000-0000-4000-8000-000000000002', 'v1', now(),
      extensions.digest('customer-link-beta-other-nonce', 'sha256'),
      extensions.digest('customer-link-beta-other-proof', 'sha256')
    )
  $$,
  array['rejected_customer_conflict'::text],
  'another Auth subject cannot claim an already verified source identity'
);

insert into loyalty.wallets (organization_id, programme_group_id, customer_id)
select customer.organization_id, programme_group.id, customer.id
from loyalty.customer_identities as identity
join loyalty.customers as customer
  on customer.organization_id = identity.organization_id
 and customer.id = identity.customer_id
join loyalty.commerce_connections as connection
  on connection.organization_id = identity.organization_id
 and connection.id = identity.commerce_connection_id
join loyalty.programmes as programme
  on programme.organization_id = connection.organization_id
 and programme.id = connection.programme_id
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = programme.organization_id
 and programme_group.id = programme.programme_group_id
where connection.external_store_id = 'customer-link-gamma';

select results_eq(
  $$
    select outcome from loyalty_private.claim_woocommerce_customer_identity(
      '93000000-0000-4000-8000-000000000503', '9',
      '93000000-0000-4000-8000-000000000001', 'v1',
      (select gamma_at from customer_link_instants),
      extensions.digest('customer-link-gamma-nonce', 'sha256'),
      extensions.digest('customer-link-gamma-proof', 'sha256')
    )
  $$,
  array['rejected_value_conflict'::text],
  'a secondary customer with an existing wallet is never auto-merged'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.customer_user_links as link
    join loyalty.commerce_connections as connection
      on connection.organization_id = link.organization_id
     and connection.id = link.source_connection_id
    where connection.external_store_id = 'customer-link-gamma'
  $$,
  array[0::bigint],
  'a wallet conflict creates no misleading customer Auth link'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.customer_identity_link_versions
  $$,
  array[1::bigint],
  'a wallet conflict creates no link revision'
);

grant select on alpha_claim, beta_claim to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '93000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select (document ->> 'version') || ':' ||
      jsonb_array_length(document -> 'links')::text || ':' ||
      (document #>> '{links,0,state}') || ':' ||
      jsonb_array_length(document #> '{links,0,members}')::text
    from loyalty.get_my_cross_workspace_customer_links_v1()
  $$,
  array['1:1:active:2'::text],
  'the customer receives one bounded minimized active link state'
);
select results_eq(
  $$
    select count(*)::text || ':' ||
      count(*) filter (where member ? 'accountId')::text || ':' ||
      count(*) filter (where member ? 'customerId' or member ? 'externalCustomerId')::text
    from loyalty.get_my_cross_workspace_customer_links_v1() as result
    cross join jsonb_array_elements(result.document #> '{links,0,members}') as member
  $$,
  array['2:2:0'::text],
  'the member projection exposes account selectors but no customer or channel identity'
);

reset role;
select throws_ok(
  $$
    update loyalty.customer_user_links
    set customer_id = source_customer_id
    where public_id = (select link_public_id from beta_claim)
  $$,
  '55000', 'customer identity link projection is protected',
  'direct canonical-link projection mutation fails closed'
);
select throws_ok(
  $$
    update loyalty.customer_identities
    set customer_id = (
      select id from loyalty.customers
      where organization_id = loyalty.customer_identities.organization_id
      order by id desc limit 1
    )
    where commerce_connection_id = (
      select id from loyalty.commerce_connections
      where external_store_id = 'customer-link-beta'
    )
  $$,
  '55000', 'customer identity canonical projection is protected',
  'direct store-identity canonical mutation fails closed'
);
select throws_ok(
  $$ update loyalty.customer_identity_link_versions set revision = 99 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'link versions cannot be rewritten'
);
select throws_ok(
  $$ update loyalty.customer_identity_link_version_members set canonical = false $$,
  '55000', 'immutable loyalty history cannot be changed',
  'link-version membership cannot be rewritten'
);

set local role authenticated;
set local request.jwt.claim.sub = '93000000-0000-4000-8000-000000000002';
select results_eq(
  $$
    select jsonb_array_length(document -> 'links')::bigint
    from loyalty.get_my_cross_workspace_customer_links_v1()
  $$,
  array[0::bigint],
  'another Auth subject receives no customer link state'
);
select throws_ok(
  $$
    select * from loyalty.unlink_my_cross_workspace_customer_account_v1(
      (select link_public_id from beta_claim), 'customer-link:unlink:other',
      '93000000-0000-4000-8000-000000000601'
    )
  $$,
  '42501', 'customer unlink not authorized',
  'another Auth subject cannot unlink this account'
);

set local request.jwt.claim.sub = '93000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    select * from loyalty.unlink_my_cross_workspace_customer_account_v1(
      (select link_public_id from alpha_claim), 'customer-link:unlink:canonical',
      '93000000-0000-4000-8000-000000000602'
    )
  $$,
  '23514', 'canonical customer account cannot be unlinked',
  'the account anchoring shared value cannot be orphaned'
);

create temporary table beta_unlink as
select * from loyalty.unlink_my_cross_workspace_customer_account_v1(
  (select link_public_id from beta_claim), 'customer-link:unlink:beta',
  '93000000-0000-4000-8000-000000000603'
);

select results_eq(
  $$ select outcome || ':' || revision::text || ':' || state from beta_unlink $$,
  array['unlinked:2:unlinked'::text],
  'the exact secondary account appends an unlinked revision'
);
select results_eq(
  $$
    select (link.revoked_at is not null)::text || ':' ||
      (link.customer_id = link.source_customer_id)::text
    from loyalty.customer_user_links as link
    where link.public_id = (select link_public_id from beta_claim)
  $$,
  array['true:true'::text],
  'unlink revokes access and restores the immutable source customer projection'
);
select results_eq(
  $$
    select (identity.customer_id = link.source_customer_id)::text
    from loyalty.customer_identity_link_versions as version
    join loyalty.customer_identity_link_version_members as member
      on member.organization_id = version.organization_id
     and member.version_id = version.id
    join loyalty.customer_identities as identity
      on identity.organization_id = member.organization_id
     and identity.id = member.source_identity_id
    join loyalty.customer_user_links as link
      on link.organization_id = member.organization_id
     and link.id = member.customer_user_link_id
    where version.revision = 1 and not member.canonical
  $$,
  array['true'::text],
  'the exact source identity is restored without guessing by email or customer number'
);
select results_eq(
  $$
    select jsonb_array_length(document #> '{links,0,members}')::text || ':' ||
      (document #>> '{links,0,state}')
    from loyalty.get_my_cross_workspace_customer_links_v1()
  $$,
  array['1:unlinked'::text],
  'the minimized read retains one canonical account after unlink'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'unlink writes no ledger value'
);
select results_eq(
  $$
    select outcome || ':' || revision::text || ':' || state
    from loyalty.unlink_my_cross_workspace_customer_account_v1(
      (select link_public_id from beta_claim), 'customer-link:unlink:beta',
      '93000000-0000-4000-8000-000000000699'
    )
  $$,
  array['duplicate:2:unlinked'::text],
  'an exact unlink retry returns the immutable result despite a new correlation ID'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_identity_link_versions $$,
  array[2::bigint],
  'an exact unlink retry appends no duplicate revision'
);
select throws_ok(
  $$
    select * from loyalty.unlink_my_cross_workspace_customer_account_v1(
      (select link_public_id from alpha_claim), 'customer-link:unlink:beta',
      '93000000-0000-4000-8000-000000000604'
    )
  $$,
  '23514', 'customer unlink idempotency conflict',
  'changed reuse of an unlink key fails closed'
);

reset role;
create temporary table beta_relink as
select * from loyalty_private.claim_woocommerce_customer_identity(
  '93000000-0000-4000-8000-000000000502', '8',
  '93000000-0000-4000-8000-000000000001', 'v1', now(),
  extensions.digest('customer-link-beta-relink-nonce', 'sha256'),
  extensions.digest('customer-link-beta-relink-proof', 'sha256')
);

select results_eq(
  $$ select outcome from beta_relink $$,
  array['linked'::text],
  'a new signed proof can safely relink a value-free restored identity'
);
select results_eq(
  $$
    select count(distinct link_set_public_id)::text || ':' ||
      max(revision)::text || ':' || max(state) filter (where revision = 3)
    from loyalty.customer_identity_link_versions
  $$,
  array['1:3:active'::text],
  'relink preserves the stable link set and appends active revision three'
);
select results_eq(
  $$
    select count(*)::text || ':' ||
      count(*) filter (where revoked_at is null)::text
    from loyalty.customer_user_links as link
    join loyalty.commerce_connections as connection
      on connection.organization_id = link.organization_id
     and connection.id = link.source_connection_id
    where connection.external_store_id = 'customer-link-beta'
  $$,
  array['2:1'::text],
  'relink preserves revoked history and creates one new active source link'
);
select results_eq(
  $$
    select count(distinct customer_id)::bigint
    from loyalty.customer_identities
    where commerce_connection_id in (
      select id from loyalty.commerce_connections
      where external_store_id in ('customer-link-alpha', 'customer-link-beta')
    )
  $$,
  array[1::bigint],
  'relink restores one canonical identity projection'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'link unlink and relink remain value-neutral'
);

set local role authenticated;
set local request.jwt.claim.sub = '';
select is_empty(
  $$ select * from loyalty.get_my_cross_workspace_customer_links_v1() $$,
  'execution without an Auth subject returns no customer-link document'
);
select throws_ok(
  $$
    select * from loyalty.unlink_my_cross_workspace_customer_account_v1(
      (select link_public_id from beta_relink), 'customer-link:unlink:none',
      '93000000-0000-4000-8000-000000000605'
    )
  $$,
  '22023', 'invalid customer unlink command',
  'unlink without an Auth subject fails closed'
);

select * from finish();
rollback;
