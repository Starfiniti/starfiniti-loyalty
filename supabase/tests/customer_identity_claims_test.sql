begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

select has_table('loyalty', 'customer_user_links', 'customer Auth links exist');
select has_table('loyalty', 'identity_link_decisions', 'immutable claim evidence exists');
select has_index(
  'loyalty', 'customer_user_links', 'customer_user_links_active_user_uidx',
  'one active verified account per Auth user and store is indexed and enforced'
);
select has_index(
  'loyalty', 'customer_user_links', 'customer_user_links_active_customer_uidx',
  'one active Auth subject per exact source customer and store is indexed and enforced'
);
select has_function(
  'loyalty_private', 'claim_woocommerce_customer_identity',
  array['uuid', 'text', 'uuid', 'text', 'timestamp with time zone', 'bytea', 'bytea'],
  'private WooCommerce customer claim command exists'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.claim_woocommerce_customer_identity(uuid,text,uuid,text,timestamptz,bytea,bytea)',
    'EXECUTE'
  ),
  'server runtime can consume a verified claim'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.claim_woocommerce_customer_identity(uuid,text,uuid,text,timestamptz,bytea,bytea)',
    'EXECUTE'
  ),
  'browser sessions cannot call the private claim command'
);
select ok(
  not has_table_privilege('loyalty_runtime', 'loyalty.customer_user_links', 'SELECT'),
  'runtime cannot enumerate customer Auth links'
);
select ok(
  not has_table_privilege('loyalty_runtime', 'loyalty.identity_link_decisions', 'SELECT'),
  'runtime cannot enumerate identity evidence'
);
select is_empty(
  $$ select column_name from information_schema.columns
     where table_schema = 'loyalty'
       and table_name in ('customer_user_links', 'identity_link_decisions')
       and column_name like '%email%' $$,
  'identity links and decisions contain no email authority'
);

insert into auth.users (id, email)
values
  ('8a000000-0000-4000-8000-000000000001', 'claim-one@example.test'),
  ('8a000000-0000-4000-8000-000000000002', 'claim-two@example.test'),
  ('8a000000-0000-4000-8000-000000000003', 'claim-three@example.test');
insert into loyalty.organizations (slug, name)
values ('claim-one', 'Claim One'), ('claim-two', 'Claim Two');
insert into loyalty.workspaces (organization_id, slug, name)
select id, 'store', name || ' Store'
from loyalty.organizations where slug in ('claim-one', 'claim-two');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id,
  display_name, current_key_version, signing_material_ref
)
select
  case organization.slug
    when 'claim-one' then '8a000000-0000-4000-8000-000000000101'::uuid
    else '8b000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
where organization.slug in ('claim-one', 'claim-two');

select * from loyalty_private.resolve_commerce_customer(
  (select id from loyalty.organizations where slug = 'claim-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'claim-one-store'),
  'registered', '7'
);
select * from loyalty_private.resolve_commerce_customer(
  (select id from loyalty.organizations where slug = 'claim-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'claim-one-store'),
  'registered', '8'
);
select * from loyalty_private.resolve_commerce_customer(
  (select id from loyalty.organizations where slug = 'claim-two'),
  (select id from loyalty.commerce_connections where external_store_id = 'claim-two-store'),
  'registered', '7'
);

create temporary table first_claim as
select * from loyalty_private.claim_woocommerce_customer_identity(
  '8a000000-0000-4000-8000-000000000101', '7',
  '8a000000-0000-4000-8000-000000000001', 'v1', now(),
  extensions.digest('nonce-1', 'sha256'), extensions.digest('proof-1', 'sha256')
);

select results_eq(
  $$ select outcome from first_claim $$,
  array['linked'::text],
  'a fresh channel-bound registered identity creates one Auth link'
);
select ok(
  (select link_public_id is not null and customer_public_id is not null from first_claim),
  'a successful claim returns only public link and customer identifiers'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_user_links $$,
  array[1::bigint],
  'the first claim creates exactly one link'
);
select results_eq(
  $$ select outcome from loyalty.identity_link_decisions $$,
  array['linked'::text],
  'the accepted decision is retained immutably'
);
select results_eq(
  $$ select outcome from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '7',
       '8a000000-0000-4000-8000-000000000001', 'v1', now(),
       extensions.digest('nonce-1', 'sha256'), extensions.digest('proof-1', 'sha256')) $$,
  array['linked'::text],
  'an exact capability retry returns its original outcome'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.identity_link_decisions $$,
  array[1::bigint],
  'an exact retry does not append duplicate evidence'
);
select results_eq(
  $$ select outcome from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '7',
       '8a000000-0000-4000-8000-000000000001', 'v1', now(),
       extensions.digest('nonce-2', 'sha256'), extensions.digest('proof-2', 'sha256')) $$,
  array['already_linked'::text],
  'a second fresh proof for the same exact account is harmless'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.identity_link_decisions $$,
  array[2::bigint],
  'the second verified attempt appends a distinct decision'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_user_links $$,
  array[1::bigint],
  'a second verified attempt does not duplicate the link'
);
select results_eq(
  $$ select outcome from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '999',
       '8a000000-0000-4000-8000-000000000003', 'v1', now(),
       extensions.digest('nonce-3', 'sha256'), extensions.digest('proof-3', 'sha256')) $$,
  array['rejected_identity'::text],
  'an unknown registered channel identity is rejected without fallback matching'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_user_links
     where auth_user_id = '8a000000-0000-4000-8000-000000000003' $$,
  array[0::bigint],
  'unknown identity rejection creates no Auth link'
);
select results_eq(
  $$ select outcome from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '8',
       '8a000000-0000-4000-8000-000000000001', 'v1', now(),
       extensions.digest('nonce-4', 'sha256'), extensions.digest('proof-4', 'sha256')) $$,
  array['rejected_user_conflict'::text],
  'one Auth user cannot silently switch to another customer in the tenant'
);
select results_eq(
  $$ select outcome from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '7',
       '8a000000-0000-4000-8000-000000000002', 'v1', now(),
       extensions.digest('nonce-5', 'sha256'), extensions.digest('proof-5', 'sha256')) $$,
  array['rejected_customer_conflict'::text],
  'one customer cannot silently switch to another Auth user'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'identity linking has no points-ledger effect'
);
select throws_ok(
  $$ select * from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '7',
       '8a000000-0000-4000-8000-000000000001', 'v2', now(),
       extensions.digest('nonce-key', 'sha256'), extensions.digest('proof-key', 'sha256')) $$,
  '22023', 'invalid customer claim',
  'a stale or forged key version fails closed'
);
select throws_ok(
  $$ select * from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '7',
       '8a000000-0000-4000-8000-000000000001', 'v1', now() - interval '301 seconds',
       extensions.digest('nonce-old', 'sha256'), extensions.digest('proof-old', 'sha256')) $$,
  '22023', 'expired customer claim',
  'a claim older than five minutes fails closed in PostgreSQL too'
);
update loyalty.commerce_connections set status = 'disabled'
where public_id = '8b000000-0000-4000-8000-000000000101';
select throws_ok(
  $$ select * from loyalty_private.claim_woocommerce_customer_identity(
       '8b000000-0000-4000-8000-000000000101', '7',
       '8a000000-0000-4000-8000-000000000003', 'v1', now(),
       extensions.digest('nonce-disabled', 'sha256'), extensions.digest('proof-disabled', 'sha256')) $$,
  '22023', 'invalid customer claim',
  'a disabled store connection cannot link accounts'
);
select results_eq(
  $$ select outcome from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '9',
       '8a000000-0000-4000-8000-000000000003', 'v1', now(),
       extensions.digest('nonce-mixed', 'sha256'), extensions.digest('proof-mixed', 'sha256')) $$,
  array['rejected_identity'::text],
  'a customer ID that exists only elsewhere cannot cross the connection boundary'
);
select throws_ok(
  $$ select * from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '7',
       '8a000000-0000-4000-8000-000000000002', 'v1', now(),
       extensions.digest('nonce-1', 'sha256'), extensions.digest('proof-1', 'sha256')) $$,
  '23505', 'customer claim replay conflict',
  'a consumed nonce cannot be replayed into another Auth account'
);
select throws_ok(
  $$ select * from loyalty_private.claim_woocommerce_customer_identity(
       '8a000000-0000-4000-8000-000000000101', '7',
       '8a000000-0000-4000-8000-000000000001', 'v1', now(),
       extensions.digest('nonce-new', 'sha256'), extensions.digest('proof-1', 'sha256')) $$,
  '23505', null,
  'a consumed proof cannot be paired with another nonce'
);
select throws_ok(
  $$ update loyalty.identity_link_decisions set outcome = 'already_linked'
     where outcome = 'linked' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'identity-link decisions cannot be rewritten'
);
select throws_ok(
  $$ update loyalty.customer_user_links
     set auth_user_id = '8a000000-0000-4000-8000-000000000002'
     where revoked_at is null $$,
  '55000', 'customer identity link history is immutable',
  'link identity cannot be rewritten'
);
update loyalty.customer_user_links set revoked_at = clock_timestamp()
where auth_user_id = '8a000000-0000-4000-8000-000000000001' and revoked_at is null;
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_user_links where revoked_at is null $$,
  array[0::bigint],
  'revocation closes the active link without deleting its history'
);
select throws_ok(
  $$ update loyalty.customer_user_links set revoked_at = null
     where auth_user_id = '8a000000-0000-4000-8000-000000000001' $$,
  '55000', 'customer identity link history is immutable',
  'a revoked link cannot be silently reactivated'
);
select is_empty(
  $$ select relation.relname from pg_class as relation
     join pg_namespace as namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'loyalty'
       and relation.relname in ('customer_user_links', 'identity_link_decisions')
       and not relation.relrowsecurity $$,
  'both new tenant tables have RLS enabled'
);
select is_empty(
  $$ select id from loyalty.identity_link_decisions
     where octet_length(external_customer_sha256) <> 32
        or octet_length(nonce_sha256) <> 32
        or octet_length(proof_sha256) <> 32 $$,
  'decision evidence stores fixed hashes rather than raw capabilities'
);
select is_empty(
  $$ select column_name from information_schema.columns
     where table_schema = 'loyalty'
       and table_name = 'identity_link_decisions'
       and column_name in ('external_customer_id', 'nonce', 'signature', 'proof') $$,
  'immutable evidence contains no raw customer ID nonce or signature columns'
);
select ok(
  not has_table_privilege('loyalty_runtime', 'loyalty.customer_user_links', 'UPDATE'),
  'runtime cannot mutate link rows outside the reviewed command'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.identity_link_decisions', 'SELECT'),
  'browser sessions cannot enumerate claim evidence'
);

select * from finish();
rollback;
