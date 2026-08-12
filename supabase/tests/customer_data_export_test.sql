begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

select has_table(
  'loyalty_private', 'customer_data_export_authorizations',
  'private one-use export authorizations exist'
);
select has_table(
  'loyalty_private', 'customer_data_export_events',
  'private immutable export audit events exist'
);
select has_function(
  'loyalty_private', 'issue_customer_data_export_authorization',
  array['uuid', 'uuid'],
  'the server-only export authorization function exists'
);
select has_function(
  'loyalty_private', 'consume_customer_data_export',
  array['text', 'uuid', 'uuid'],
  'the server-only export consumption function exists'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.issue_customer_data_export_authorization(uuid,uuid)',
    'EXECUTE'
  ),
  'the dashboard runtime can issue a capability after password reauthentication'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.consume_customer_data_export(text,uuid,uuid)',
    'EXECUTE'
  ),
  'the dashboard runtime can consume the exact capability'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.issue_customer_data_export_authorization(uuid,uuid)',
    'EXECUTE'
  ),
  'browser sessions cannot mint export capabilities through the Data API'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.consume_customer_data_export(text,uuid,uuid)',
    'EXECUTE'
  ),
  'browser sessions cannot consume export capabilities through the Data API'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty_private.consume_customer_data_export(text,uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous sessions cannot enter the export boundary'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'loyalty_private.customer_data_export_authorizations',
    'SELECT'
  ),
  'customers cannot enumerate export capabilities'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'loyalty_private.customer_data_export_events',
    'SELECT'
  ),
  'customers cannot enumerate private export audit evidence'
);
select results_eq(
  $$ select relation.relrowsecurity
     from pg_class as relation
     join pg_namespace as namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'loyalty_private'
       and relation.relname in (
         'customer_data_export_authorizations', 'customer_data_export_events'
       )
     order by relation.relname $$,
  array[true, true],
  'both export tables have RLS enabled as defense in depth'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     join pg_namespace as namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'loyalty_private'
       and routine.proname in (
         'consume_customer_data_export',
         'issue_customer_data_export_authorization'
       )
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       )
     order by routine.proname $$,
  array[true, true],
  'both export functions are security definer with an empty search path'
);
select has_index(
  'loyalty_private', 'customer_data_export_authorizations',
  'customer_data_export_authorizations_subject_idx',
  'pending capability cleanup and lookup has a subject/session index'
);
select has_index(
  'loyalty', 'customer_user_links',
  'customer_user_links_active_auth_subject_idx',
  'Auth-derived customer account and export reads have a partial subject index'
);

insert into auth.users (id, email)
values
  ('a5000000-0000-4000-8000-000000000001', 'export-one@example.test'),
  ('a6000000-0000-4000-8000-000000000001', 'export-two@example.test');

insert into loyalty.organizations (slug, name)
values ('export-one', 'Export One'), ('export-two', 'Export Two');

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'export-one' then 'a5000000-0000-4000-8000-000000000101'::uuid
    else 'a6000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('export-one', 'export-two');

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'export-one' then 'a5000000-0000-4000-8000-000000000102'::uuid
    else 'a6000000-0000-4000-8000-000000000102'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('export-one', 'export-two');

insert into loyalty.programme_group_workspaces (
  organization_id, programme_group_id, workspace_id
)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
where organization.slug in ('export-one', 'export-two');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select
  case organization.slug
    when 'export-one' then 'a5000000-0000-4000-8000-000000000103'::uuid
    else 'a6000000-0000-4000-8000-000000000103'::uuid
  end,
  organization.id, programme_group.id, 'rewards',
  organization.name || ' Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('export-one', 'export-two');

insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number,
  status, configuration, configuration_sha256, published_at
)
select programme.organization_id, programme.programme_group_id, programme.id,
  1, 'published', '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(programme.public_id::text, 'sha256'), now()
from loyalty.programmes as programme
where programme.public_id in (
  'a5000000-0000-4000-8000-000000000103',
  'a6000000-0000-4000-8000-000000000103'
);

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select
  case organization.slug
    when 'export-one' then 'a5000000-0000-4000-8000-000000000104'::uuid
    else 'a6000000-0000-4000-8000-000000000104'::uuid
  end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug,
  programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('export-one', 'export-two');

insert into loyalty.customers (
  public_id, organization_id, display_reference
)
select
  case organization.slug
    when 'export-one' then 'a5000000-0000-4000-8000-000000000105'::uuid
    else 'a6000000-0000-4000-8000-000000000105'::uuid
  end,
  organization.id, organization.name || ' Customer'
from loyalty.organizations as organization
where organization.slug in ('export-one', 'export-two');

insert into loyalty.customer_identities (
  public_id, organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select
  case organization.slug
    when 'export-one' then 'a5000000-0000-4000-8000-000000000106'::uuid
    else 'a6000000-0000-4000-8000-000000000106'::uuid
  end,
  organization.id, customer.id, connection.id,
  case organization.slug when 'export-one' then '42' else '84' end,
  'registered', now()
from loyalty.organizations as organization
join loyalty.customers as customer
  on customer.organization_id = organization.id
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug in ('export-one', 'export-two');

insert into loyalty.customer_user_links (
  public_id, organization_id, customer_id, auth_user_id, source_connection_id
)
select
  case organization.slug
    when 'export-one' then 'a5000000-0000-4000-8000-000000000107'::uuid
    else 'a6000000-0000-4000-8000-000000000107'::uuid
  end,
  organization.id, customer.id,
  case organization.slug
    when 'export-one' then 'a5000000-0000-4000-8000-000000000001'::uuid
    else 'a6000000-0000-4000-8000-000000000001'::uuid
  end,
  connection.id
from loyalty.organizations as organization
join loyalty.customers as customer
  on customer.organization_id = organization.id
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug in ('export-one', 'export-two');

do $$
declare
  award_number integer;
begin
  for award_number in 1..12 loop
    perform * from loyalty_private.award_points(
      (select id from loyalty.organizations where slug = 'export-one'),
      (select id from loyalty.programme_groups where organization_id =
        (select id from loyalty.organizations where slug = 'export-one')),
      (select id from loyalty.programme_versions where organization_id =
        (select id from loyalty.organizations where slug = 'export-one')),
      (select id from loyalty.customers where organization_id =
        (select id from loyalty.organizations where slug = 'export-one')),
      award_number,
      pg_catalog.format('export-award-%s', award_number),
      extensions.digest(pg_catalog.format('export-award-%s', award_number), 'sha256')
    );
  end loop;
end;
$$;

select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'export-two'),
  (select id from loyalty.programme_groups where organization_id =
    (select id from loyalty.organizations where slug = 'export-two')),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'export-two')),
  (select id from loyalty.customers where organization_id =
    (select id from loyalty.organizations where slug = 'export-two')),
  84, 'export-two-award', extensions.digest('export-two-award', 'sha256')
);

create temporary table issued_export_authorization as
select * from loyalty_private.issue_customer_data_export_authorization(
  'a5000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000201'
);

select ok(
  (select authorization_token ~ '^[0-9a-f-]{36}$'
     and expires_at > now() + interval '4 minutes 50 seconds'
     and expires_at <= now() + interval '5 minutes 5 seconds'
   from issued_export_authorization),
  'authorization returns one short-lived opaque UUID token'
);
select ok(
  (select authorization.token_sha256 = extensions.digest(
      pg_catalog.convert_to(issued.authorization_token, 'utf8'), 'sha256'
    )
   from loyalty_private.customer_data_export_authorizations as authorization
   cross join issued_export_authorization as issued),
  'the database stores only the exact token hash'
);

create temporary table completed_export as
select * from loyalty_private.consume_customer_data_export(
  (select authorization_token from issued_export_authorization),
  'a5000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000201'
);

select results_eq(
  $$ select payload ->> 'schemaVersion' from completed_export $$,
  array['starfiniti.customer-data-export.v1'::text],
  'the direct response is explicitly versioned'
);
select results_eq(
  $$ select payload ->> 'authSubjectId' from completed_export $$,
  array['a5000000-0000-4000-8000-000000000001'::text],
  'the export is attributed to the verified Auth subject'
);
select results_eq(
  $$ select jsonb_array_length(payload -> 'accounts') from completed_export $$,
  array[1],
  'the subject receives exactly their active linked account'
);
select results_eq(
  $$ select payload #>> '{accounts,0,store,displayName}' from completed_export $$,
  array['Export One Store'::text],
  'the export identifies the subject-owned store'
);
select results_eq(
  $$ select payload #>> '{accounts,0,identities,0,externalCustomerId}'
     from completed_export $$,
  array['42'::text],
  'the subject receives their own channel customer identifier'
);
select results_eq(
  $$ select jsonb_array_length(payload #> '{accounts,0,wallets,0,ledger}')
     from completed_export $$,
  array[12],
  'the direct export includes complete wallet history rather than the ten-row account preview'
);
select results_eq(
  $$ select balance ->> 'points'
     from completed_export,
       jsonb_array_elements(
         payload #> '{accounts,0,wallets,0,balances}'
       ) as balance
     where balance ->> 'kind' = 'pending' $$,
  array['78'::text],
  'wallet balances retain exact text-form integer values'
);
select ok(
  (select payload::text !~* 'vault://|signing|actorId|request_sha256|idempotency|coupon'
   from completed_export),
  'the export excludes signing material private command evidence and coupon capability'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.customer_data_export_events
     where export_id = (select export_id from completed_export) $$,
  array[1::bigint],
  'one immutable per-customer audit event records the export'
);
select results_eq(
  $$ select customer.public_id, event.auth_user_id
     from loyalty_private.customer_data_export_events as event
     join loyalty.customers as customer
       on customer.organization_id = event.organization_id
      and customer.id = event.customer_id
     where event.export_id = (select export_id from completed_export) $$,
  $$ values (
    'a5000000-0000-4000-8000-000000000105'::uuid,
    'a5000000-0000-4000-8000-000000000001'::uuid
  ) $$,
  'audit evidence binds the exact customer and Auth subject'
);
select ok(
  (select authorization.used_at is not null
   from loyalty_private.customer_data_export_authorizations as authorization
   cross join issued_export_authorization as issued
   where authorization.token_sha256 = extensions.digest(
     pg_catalog.convert_to(issued.authorization_token, 'utf8'), 'sha256'
   )),
  'successful export consumption burns the capability'
);
select throws_ok(
  $$ select * from loyalty_private.consume_customer_data_export(
    (select authorization_token from issued_export_authorization),
    'a5000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000201'
  ) $$,
  '42501', 'customer data export authorization invalid',
  'the capability cannot be replayed'
);

create temporary table mismatched_export_authorization as
select * from loyalty_private.issue_customer_data_export_authorization(
  'a5000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000202'
);
select throws_ok(
  $$ select * from loyalty_private.consume_customer_data_export(
    (select authorization_token from mismatched_export_authorization),
    'a5000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000299'
  ) $$,
  '42501', 'customer data export authorization invalid',
  'a capability cannot cross Supabase sessions'
);
select throws_ok(
  $$ select * from loyalty_private.consume_customer_data_export(
    (select authorization_token from mismatched_export_authorization),
    'a6000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000202'
  ) $$,
  '42501', 'customer data export authorization invalid',
  'a capability cannot cross Auth subjects'
);
select throws_ok(
  $$ select * from loyalty_private.consume_customer_data_export(
    'a5000000-0000-4000-8000-000000000999',
    'a5000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000202'
  ) $$,
  '42501', 'customer data export authorization invalid',
  'a guessed capability fails closed'
);

create temporary table expired_export_authorization as
select * from loyalty_private.issue_customer_data_export_authorization(
  'a5000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000203'
);
update loyalty_private.customer_data_export_authorizations as authorization
set created_at = now() - interval '10 minutes',
  expires_at = now() - interval '5 minutes'
from expired_export_authorization as expired
where authorization.token_sha256 = extensions.digest(
  pg_catalog.convert_to(expired.authorization_token, 'utf8'), 'sha256'
);
select throws_ok(
  $$ select * from loyalty_private.consume_customer_data_export(
    (select authorization_token from expired_export_authorization),
    'a5000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000203'
  ) $$,
  '42501', 'customer data export authorization invalid',
  'an expired capability fails closed'
);

create temporary table revoked_export_authorization as
select * from loyalty_private.issue_customer_data_export_authorization(
  'a5000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000204'
);
update loyalty.customer_user_links
set revoked_at = clock_timestamp()
where auth_user_id = 'a5000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty_private.consume_customer_data_export(
    (select authorization_token from revoked_export_authorization),
    'a5000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000204'
  ) $$,
  '42501', 'customer data export not authorized',
  'link revocation removes export authority immediately'
);
select ok(
  (select authorization.used_at is null
   from loyalty_private.customer_data_export_authorizations as authorization
   cross join revoked_export_authorization as revoked
   where authorization.token_sha256 = extensions.digest(
     pg_catalog.convert_to(revoked.authorization_token, 'utf8'), 'sha256'
   )),
  'a rejected export does not burn or audit a successful download'
);

create temporary table other_export_authorization as
select * from loyalty_private.issue_customer_data_export_authorization(
  'a6000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000201'
);
create temporary table other_completed_export as
select * from loyalty_private.consume_customer_data_export(
  (select authorization_token from other_export_authorization),
  'a6000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000201'
);
select results_eq(
  $$ select jsonb_array_length(payload -> 'accounts') from other_completed_export $$,
  array[1],
  'another tenant subject receives one account only'
);
select results_eq(
  $$ select payload #>> '{accounts,0,store,displayName}' from other_completed_export $$,
  array['Export Two Store'::text],
  'the second subject receives only their own store'
);
select ok(
  (select payload::text !~ 'Export One|a5000000|"42"'
   from other_completed_export),
  'the second tenant export contains no first-tenant subject data'
);
select throws_ok(
  $$ update loyalty_private.customer_data_export_events
     set format = 'starfiniti.customer-data-export.v1'
     where export_id = (select export_id from completed_export) $$,
  '55000', 'immutable loyalty history cannot be changed',
  'export audit evidence cannot be updated'
);
select throws_ok(
  $$ delete from loyalty_private.customer_data_export_events
     where export_id = (select export_id from completed_export) $$,
  '55000', 'immutable loyalty history cannot be changed',
  'export audit evidence cannot be deleted'
);
select hasnt_column(
  'loyalty_private', 'customer_data_export_events', 'payload',
  'audit evidence does not retain exported content'
);
select hasnt_column(
  'loyalty_private', 'customer_data_export_authorizations', 'authorization_token',
  'the raw bearer capability has no storage column'
);
select ok(
  (select pg_get_functiondef(
      'loyalty_private.consume_customer_data_export(text,uuid,uuid)'::regprocedure
    ) !~* 'email|signing_material_ref|connector_execution_reference|actor_id|request_sha256'),
  'the export projection contains no Auth email lookup secret reference or private execution evidence'
);

select * from finish();
rollback;
