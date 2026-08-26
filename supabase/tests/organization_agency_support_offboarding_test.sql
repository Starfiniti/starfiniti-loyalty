begin;

create extension if not exists pgtap with schema extensions;

select plan(73);

-- 1-22: schema, privilege, and authority boundaries.
select has_table('loyalty', 'organization_agency_invitations', 'agency invitations exist');
select has_table('loyalty', 'organization_agency_relationships', 'agency relationships exist');
select has_table('loyalty', 'organization_agency_events', 'agency events exist');
select has_table('loyalty', 'organization_support_access_requests', 'support requests exist');
select has_table('loyalty', 'organization_support_events', 'support decision events exist');
select has_table('loyalty', 'support_access_use_events', 'support use events exist');
select has_table('loyalty', 'organization_break_glass_sessions', 'break-glass sessions exist');
select has_table('loyalty', 'organization_break_glass_use_events', 'break-glass use events exist');
select has_table('loyalty', 'organization_deletion_cases', 'organization deletion cases exist');
select has_table('loyalty', 'organization_deletion_events', 'organization deletion events exist');
select has_table('loyalty_private', 'organization_offboarding_receipts', 'private offboarding receipts exist');
select has_column('loyalty', 'organizations', 'deletion_completed_at', 'organizations retain terminal deletion state');
select ok(
  not exists (
    select 1 from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and relation.relname in (
        'organization_agency_invitations', 'organization_agency_relationships',
        'organization_agency_events', 'organization_support_access_requests',
        'organization_support_events', 'support_access_use_events',
        'organization_break_glass_sessions', 'organization_break_glass_use_events',
        'organization_deletion_cases', 'organization_deletion_events',
        'organization_offboarding_receipts'
      ) and not relation.relrowsecurity
  ),
  'every agency support recovery and deletion table enables RLS'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.organization_agency_relationships', 'SELECT')
  and not has_table_privilege('authenticated', 'loyalty.organization_support_access_requests', 'SELECT')
  and not has_table_privilege('authenticated', 'loyalty.support_access_use_events', 'SELECT')
  and not has_table_privilege('authenticated', 'loyalty.organization_deletion_cases', 'SELECT'),
  'authenticated sessions cannot read administration tables directly'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.support_access_grants', 'SELECT')
  and not has_table_privilege('loyalty_runtime', 'loyalty.support_access_grants', 'SELECT')
  and not has_table_privilege('loyalty_worker', 'loyalty.support_access_grants', 'SELECT'),
  'the legacy support grant table no longer exposes raw Auth UUIDs or scopes'
);
select results_eq(
  $$
    select count(*)::bigint from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty' and routine.proname in (
      'create_organization_agency_invitation_command_v1',
      'accept_organization_agency_invitation_command_v1',
      'revoke_organization_agency_relationship_command_v1',
      'get_organization_agency_portfolio_v1',
      'create_support_access_request_command_v1',
      'resolve_support_access_request_command_v1',
      'revoke_support_access_grant_command_v1',
      'get_support_administration_workspace_v1',
      'get_support_workspace_v1',
      'start_organization_break_glass_command_v1',
      'get_organization_recovery_workspace_v1',
      'get_organization_administration_export_v1',
      'organization_deletion_command_v1'
    )
  $$,
  array[13::bigint],
  'thirteen exact public M13-S05 boundaries exist'
);
select ok(
  has_function_privilege('authenticated', 'loyalty.get_organization_agency_portfolio_v1(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'loyalty.get_support_workspace_v1(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'loyalty.organization_deletion_command_v1(uuid,uuid,uuid,bigint,text,text,text,uuid)', 'EXECUTE'),
  'authenticated sessions receive only narrow administration entry points'
);
select ok(
  not has_function_privilege('anon', 'loyalty.get_organization_agency_portfolio_v1(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'loyalty.get_support_workspace_v1(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'loyalty.organization_deletion_command_v1(uuid,uuid,uuid,bigint,text,text,text,uuid)', 'EXECUTE'),
  'anonymous sessions cannot enter administration boundaries'
);
select results_eq(
  $$
    select count(*)::bigint from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty' and routine.proname in (
      'create_organization_agency_invitation_command_v1',
      'accept_organization_agency_invitation_command_v1',
      'revoke_organization_agency_relationship_command_v1',
      'get_organization_agency_portfolio_v1',
      'create_support_access_request_command_v1',
      'resolve_support_access_request_command_v1',
      'revoke_support_access_grant_command_v1',
      'get_support_administration_workspace_v1',
      'get_support_workspace_v1',
      'start_organization_break_glass_command_v1',
      'get_organization_recovery_workspace_v1',
      'get_organization_administration_export_v1',
      'organization_deletion_command_v1'
    ) and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[13::bigint],
  'all public administration functions are security definer with empty search paths'
);
select results_eq(
  $$
    select count(*)::bigint from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like any(array[
        'create_organization_agency_%', 'accept_organization_agency_%',
        'revoke_organization_agency_%', 'get_organization_agency_%',
        'create_support_access_%', 'resolve_support_access_%',
        'revoke_support_access_%', 'get_support_%',
        'start_organization_break_glass_%', 'get_organization_recovery_%',
        'get_organization_administration_export_%', 'organization_deletion_%'
      ])
      and parameter_name in (
        'actor_user_id', 'support_user_id', 'auth_session_id',
        'email', 'domain', 'group', 'claims'
      )
  $$,
  array[0::bigint],
  'public commands accept no actor session identity email domain group or claim authority'
);
select results_eq(
  $$
    select count(*)::bigint from information_schema.columns
    where table_schema = 'loyalty'
      and table_name in (
        'organization_agency_invitations', 'organization_support_access_requests',
        'support_access_grants', 'support_access_use_events'
      ) and column_name in ('token', 'secret', 'email', 'domain', 'claims', 'raw_body')
  $$,
  array[0::bigint],
  'administration storage contains no raw token secret identity claims or request body'
);
select ok(
  not has_schema_privilege('loyalty_owner', 'auth', 'USAGE')
  and not has_column_privilege('loyalty_owner', 'auth.sessions', 'id', 'SELECT')
  and not has_column_privilege('loyalty_owner', 'auth.sessions', 'user_id', 'SELECT')
  and not has_table_privilege('loyalty_owner', 'auth.sessions', 'SELECT')
  and not has_table_privilege('authenticated', 'auth.sessions', 'SELECT')
  and has_function_privilege(
    'loyalty_owner',
    'loyalty_private.request_has_live_auth_session_v1()',
    'EXECUTE'
  )
  and (
    select pg_get_userbyid(proowner) <> 'loyalty_owner'
    from pg_proc
    where oid = 'loyalty_private.request_has_live_auth_session_v1()'::regprocedure
  ),
  'the private owner receives only the boolean live-session bridge, never Auth schema access'
);

insert into auth.users (id, email)
values
  ('9d000000-0000-4000-8000-000000000001', 'agency-client-owner@example.test'),
  ('9d000000-0000-4000-8000-000000000002', 'agency-client-admin@example.test'),
  ('9d000000-0000-4000-8000-000000000003', 'agency-support-owner@example.test'),
  ('9d000000-0000-4000-8000-000000000004', 'agency-dual-member@example.test'),
  ('9d000000-0000-4000-8000-000000000005', 'agency-other-owner@example.test');

insert into auth.sessions (id, user_id)
values
  ('9d000000-0000-4000-8000-000000000901', '9d000000-0000-4000-8000-000000000003'),
  ('9d000000-0000-4000-8000-000000000902', '9d000000-0000-4000-8000-000000000001'),
  ('9d000000-0000-4000-8000-000000000904', '9d000000-0000-4000-8000-000000000004');

insert into loyalty.organizations (public_id, slug, name)
values
  ('9d000000-0000-4000-8000-000000000100', 'agency-client', 'Agency Client'),
  ('9d000000-0000-4000-8000-000000000200', 'agency-provider', 'Agency Provider'),
  ('9d000000-0000-4000-8000-000000000300', 'agency-other', 'Agency Other');

insert into loyalty.organization_memberships (
  public_id, organization_id, user_id, role, display_label
)
select member.public_id, organization.id, member.user_id, member.role, member.label
from (values
  ('agency-client'::text, '9d000000-0000-4000-8000-000000000101'::uuid,
    '9d000000-0000-4000-8000-000000000001'::uuid, 'owner'::text, 'Client owner'::text),
  ('agency-client'::text, '9d000000-0000-4000-8000-000000000102'::uuid,
    '9d000000-0000-4000-8000-000000000002'::uuid, 'admin'::text, 'Client admin'::text),
  ('agency-client'::text, '9d000000-0000-4000-8000-000000000104'::uuid,
    '9d000000-0000-4000-8000-000000000004'::uuid, 'auditor'::text, 'Dual auditor'::text),
  ('agency-provider'::text, '9d000000-0000-4000-8000-000000000201'::uuid,
    '9d000000-0000-4000-8000-000000000003'::uuid, 'owner'::text, 'Support owner'::text),
  ('agency-provider'::text, '9d000000-0000-4000-8000-000000000204'::uuid,
    '9d000000-0000-4000-8000-000000000004'::uuid, 'operator'::text, 'Dual operator'::text),
  ('agency-other'::text, '9d000000-0000-4000-8000-000000000301'::uuid,
    '9d000000-0000-4000-8000-000000000005'::uuid, 'owner'::text, 'Other owner'::text)
) as member(slug, public_id, user_id, role, label)
join loyalty.organizations as organization on organization.slug = member.slug;

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select '9d000000-0000-4000-8000-000000000110', id, 'store', 'Client Store'
from loyalty.organizations where slug = 'agency-client';
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select '9d000000-0000-4000-8000-000000000120', id, 'rewards', 'Client Rewards'
from loyalty.organizations where slug = 'agency-client';
insert into loyalty.programme_group_workspaces (organization_id, programme_group_id, workspace_id)
select organization.id, programme_group.id, workspace.id
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
where organization.slug = 'agency-client';
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select '9d000000-0000-4000-8000-000000000130', organization.id,
  programme_group.id, 'main', 'Main programme', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group on programme_group.organization_id = organization.id
where organization.slug = 'agency-client';
insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  created_by_user_id, approved_by_user_id, published_at
)
select '9d000000-0000-4000-8000-000000000131', programme.organization_id,
  programme.programme_group_id, programme.id, 1, 'published', '{}'::jsonb,
  decode(repeat('a', 64), 'hex'),
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000001', now()
from loyalty.programmes as programme
where programme.public_id = '9d000000-0000-4000-8000-000000000130';
insert into loyalty.customers (public_id, organization_id, display_reference)
select '9d000000-0000-4000-8000-000000000140', id, 'Customer 1'
from loyalty.organizations where slug = 'agency-client';
select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'agency-client'),
  (select id from loyalty.programme_groups where public_id = '9d000000-0000-4000-8000-000000000120'),
  (select id from loyalty.programme_versions where public_id = '9d000000-0000-4000-8000-000000000131'),
  (select id from loyalty.customers where public_id = '9d000000-0000-4000-8000-000000000140'),
  10, 'm13-s05-ledger-preservation', decode(repeat('b', 64), 'hex')
);

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, platform, external_store_id,
  display_name, status, current_key_version, signing_material_ref
)
select '9d000000-0000-4000-8000-000000000150', organization.id,
  workspace.id, 'service_api', 'm13-s05-service-api', 'M13 API',
  'active', 'v1', 'secret://m13-s05-signing'
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
where organization.slug = 'agency-client';
insert into loyalty.service_accounts (
  public_id, organization_id, workspace_id, programme_id, connection_id,
  display_name, scopes, requests_per_minute, created_by_user_id
)
select '9d000000-0000-4000-8000-000000000151', organization.id,
  workspace.id, programme.id, connection.id, 'Offboard API',
  array['activities:write']::text[], 60,
  '9d000000-0000-4000-8000-000000000001'
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
join loyalty.commerce_connections as connection on connection.organization_id = organization.id
where organization.slug = 'agency-client';
insert into loyalty_private.service_account_credentials (
  public_id, organization_id, service_account_id, token_sha256,
  secret_hint, created_by_user_id
)
select '9d000000-0000-4000-8000-000000000152', account.organization_id,
  account.id, decode(repeat('c', 64), 'hex'), 'abc123',
  '9d000000-0000-4000-8000-000000000001'
from loyalty.service_accounts as account
where account.public_id = '9d000000-0000-4000-8000-000000000151';
insert into loyalty_private.notification_klaviyo_connections (
  public_id, organization_id, credential_sha256, state
)
select '9d000000-0000-4000-8000-000000000160', id,
  decode(repeat('d', 64), 'hex'), 'active'
from loyalty.organizations where slug = 'agency-client';
insert into loyalty_private.notification_webhook_endpoints (
  public_id, organization_id, destination_url, allowed_origin,
  current_secret_sha256, current_secret_hint,
  previous_secret_sha256, previous_secret_hint, previous_secret_expires_at,
  event_types, state, label,
  created_by_user_id, updated_by_user_id
)
select '9d000000-0000-4000-8000-000000000161', id,
  'https://hooks.example.test/loyalty', 'https://hooks.example.test',
  decode(repeat('e', 64), 'hex'), 'ABC123',
  decode(repeat('f', 64), 'hex'), 'DEF456', clock_timestamp() + interval '1 hour',
  array['loyalty.points.earned']::text[],
  'active', 'Offboard webhook',
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000001'
from loyalty.organizations where slug = 'agency-client';

-- 23-31: bilateral portfolio with no implied tenant authority.
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.create_organization_agency_invitation_command_v1(
    '9d000000-0000-4000-8000-000000000100', 'Starfiniti support',
    transaction_timestamp() + interval '1 day', repeat('1', 64),
    'agency:invite:test', '9d000000-0000-4000-8000-000000000601'
  ) $$,
  array['created'::text], 'a client owner creates one digest-only agency invitation'
);
select results_eq(
  $$ select outcome from loyalty.create_organization_agency_invitation_command_v1(
    '9d000000-0000-4000-8000-000000000100', 'Starfiniti support',
    transaction_timestamp() + interval '1 day', repeat('1', 64),
    'agency:invite:test', '9d000000-0000-4000-8000-000000000601'
  ) $$,
  array['duplicate'::text], 'an exact agency invitation retry returns one effect'
);
reset role;
select results_eq(
  $$ select octet_length(token_sha256)::bigint
     from loyalty.organization_agency_invitations
     where agency_label = 'Starfiniti support' $$,
  array[32::bigint], 'only the agency capability digest is retained'
);
update loyalty.organization_memberships as membership
set role = 'admin'
where membership.organization_id = (
  select id from loyalty.organizations where slug = 'agency-client'
) and membership.user_id = '9d000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.accept_organization_agency_invitation_command_v1(
    '9d000000-0000-4000-8000-000000000200', repeat('1', 64),
    'agency:accept:revoked-client-owner', '9d000000-0000-4000-8000-000000000699'
  ) $$,
  '42501', 'agency acceptance not authorized',
  'an invitation loses authority when its approving client owner is no longer live'
);
reset role;
update loyalty.organization_memberships as membership
set role = 'owner'
where membership.organization_id = (
  select id from loyalty.organizations where slug = 'agency-client'
) and membership.user_id = '9d000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select outcome from loyalty.accept_organization_agency_invitation_command_v1(
    '9d000000-0000-4000-8000-000000000200', repeat('1', 64),
    'agency:accept:test', '9d000000-0000-4000-8000-000000000602'
  ) $$,
  array['created'::text], 'an agency owner supplies the second explicit approval'
);
select results_eq(
  $$ select outcome from loyalty.accept_organization_agency_invitation_command_v1(
    '9d000000-0000-4000-8000-000000000200', repeat('1', 64),
    'agency:accept:test', '9d000000-0000-4000-8000-000000000602'
  ) $$,
  array['duplicate'::text], 'an exact agency acceptance retry is idempotent'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.organization_agency_relationships
     where status = 'active' $$,
  array[1::bigint], 'bilateral approval creates exactly one active relationship'
);
select set_config('test.m13_relationship', (
  select public_id::text from loyalty.organization_agency_relationships limit 1
), false);
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select * from loyalty.get_organization_access_workspace_v1(
    '9d000000-0000-4000-8000-000000000100'
  ) $$,
  'an agency relationship is not client membership or tenant authority'
);
select ok(
  (select workspace #> '{relationships,0,counterpart}'
   from loyalty.get_organization_agency_portfolio_v1(
     '9d000000-0000-4000-8000-000000000200'
   )) ?& array['id', 'name']
  and not ((select workspace
   from loyalty.get_organization_agency_portfolio_v1(
     '9d000000-0000-4000-8000-000000000200'
   ))::text ~* 'customer|wallet|ledger|email'),
  'the agency portfolio contains only counterpart identity and relationship state'
);
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000005';
select throws_ok(
  $$ select * from loyalty.revoke_organization_agency_relationship_command_v1(
    '9d000000-0000-4000-8000-000000000300',
    current_setting('test.m13_relationship')::uuid,
    1, 'Unauthorized unrelated revocation.', 'agency:revoke:other',
    '9d000000-0000-4000-8000-000000000603'
  ) $$,
  '42501', 'agency revocation not authorized',
  'an unrelated tenant owner cannot revoke or infer the relationship'
);
reset role;

-- 32-47: support request, separate approval, scope, session, and use audit.
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select outcome from loyalty.create_support_access_request_command_v1(
    '9d000000-0000-4000-8000-000000000200',
    '9d000000-0000-4000-8000-000000000100',
    array['audit.summary.read', 'organization.summary.read']::text[],
    'Investigate tenant identity and audit health.',
    transaction_timestamp() + interval '2 hours',
    'support:request:test', '9d000000-0000-4000-8000-000000000604'
  ) $$,
  array['created'::text], 'an eligible agency operator requests exact read-only scopes'
);
select results_eq(
  $$ select outcome from loyalty.create_support_access_request_command_v1(
    '9d000000-0000-4000-8000-000000000200',
    '9d000000-0000-4000-8000-000000000100',
    array['audit.summary.read', 'organization.summary.read']::text[],
    'Investigate tenant identity and audit health.',
    transaction_timestamp() + interval '2 hours',
    'support:request:test', '9d000000-0000-4000-8000-000000000604'
  ) $$,
  array['duplicate'::text], 'an exact support request retry returns one effect'
);
reset role;
select results_eq(
  $$ select requested_scopes from loyalty.organization_support_access_requests
     where reason = 'Investigate tenant identity and audit health.' $$,
  $$ values (array['audit.summary.read', 'organization.summary.read']::text[]) $$,
  'the database retains the canonical exact scope set'
);
select set_config('test.m13_support_request', (
  select public_id::text from loyalty.organization_support_access_requests
  where reason = 'Investigate tenant identity and audit health.'
), false);
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000004';
select throws_ok(
  $$ select * from loyalty.create_support_access_request_command_v1(
    '9d000000-0000-4000-8000-000000000200',
    '9d000000-0000-4000-8000-000000000100',
    array['organization.summary.read']::text[],
    'Attempt support while already a client member.',
    transaction_timestamp() + interval '1 hour',
    'support:request:dual', '9d000000-0000-4000-8000-000000000605'
  ) $$,
  '42501', 'support access request not authorized',
  'a client member cannot become its hidden support subject'
);
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.resolve_support_access_request_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_support_request')::uuid,
    1, 'approve', array['organization.summary.read']::text[],
    transaction_timestamp() + interval '1 hour',
    'Admin must not approve support grants.', 'support:approve:admin',
    '9d000000-0000-4000-8000-000000000606'
  ) $$,
  '42501', 'support request decision not authorized',
  'only a client owner with support.approve can approve a grant'
);
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.resolve_support_access_request_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_support_request')::uuid,
    1, 'approve', array['organization.summary.read']::text[],
    transaction_timestamp() + interval '1 hour',
    'Owner approved one narrowed diagnostic scope.', 'support:approve:test',
    '9d000000-0000-4000-8000-000000000607'
  ) $$,
  array['created'::text], 'the client owner narrows and approves the support request'
);
select results_eq(
  $$ select outcome from loyalty.resolve_support_access_request_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_support_request')::uuid,
    1, 'approve', array['organization.summary.read']::text[],
    transaction_timestamp() + interval '1 hour',
    'Owner approved one narrowed diagnostic scope.', 'support:approve:test',
    '9d000000-0000-4000-8000-000000000607'
  ) $$,
  array['duplicate'::text], 'an exact support approval retry returns the grant'
);
reset role;
select ok(
  (select grant_version = '1' and scopes = array['organization.summary.read']::text[]
    and expires_at <= starts_at + interval '4 hours'
   from loyalty.support_access_grants where grant_version = '1'),
  'the effective grant is V1 exact-scope and no longer than four hours'
);
select set_config('test.m13_support_grant', (
  select public_id::text from loyalty.support_access_grants where grant_version = '1'
), false);
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000003","session_id":"9d000000-0000-4000-8000-000000000901","aal":"aal1"}';
select ok(
  (select workspace #>> '{organization,name}'
   from loyalty.get_support_workspace_v1(current_setting('test.m13_support_grant')::uuid))
    = 'Agency Client',
  'a live approved support subject receives the minimized projection'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.support_access_use_events $$,
  array[1::bigint], 'a successful support projection atomically records one use'
);
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
select ok(
  not ((select workspace from loyalty.get_support_administration_workspace_v1(
    '9d000000-0000-4000-8000-000000000100'
  ))::text ~* 'email|customer|wallet|token|secret'),
  'support administration projections exclude PII value and credential material'
);
reset role;
delete from auth.sessions where id = '9d000000-0000-4000-8000-000000000901';
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000003","session_id":"9d000000-0000-4000-8000-000000000901","aal":"aal1"}';
select is_empty(
  $$ select * from loyalty.get_support_workspace_v1(
    current_setting('test.m13_support_grant')::uuid
  ) $$,
  'terminating auth.sessions invalidates the next support use despite the JWT'
);
reset role;
insert into auth.sessions (id, user_id)
values ('9d000000-0000-4000-8000-000000000901', '9d000000-0000-4000-8000-000000000003');
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select outcome from loyalty.revoke_organization_agency_relationship_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_relationship')::uuid,
    1, 'Client ended the agency relationship.', 'agency:revoke:test',
    '9d000000-0000-4000-8000-000000000608'
  ) $$,
  array['revoked'::text], 'either organization owner can revoke the relationship immediately'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.support_access_grants
     where grant_version = '1' and revoked_at is null $$,
  array[0::bigint], 'relationship revocation atomically revokes every support grant'
);
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000003","session_id":"9d000000-0000-4000-8000-000000000901","aal":"aal1"}';
select is_empty(
  $$ select * from loyalty.get_support_workspace_v1(
    current_setting('test.m13_support_grant')::uuid
  ) $$,
  'a revoked relationship can no longer exercise its former grant'
);
reset role;

-- 48-70: AAL2 break-glass, export, offboarding, cooling, and deletion.
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000001","session_id":"9d000000-0000-4000-8000-000000000902","aal":"aal1"}';
select throws_ok(
  $$ select * from loyalty.start_organization_break_glass_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    'Recover access after tenant identity outage.', 'break-glass:aal1',
    '9d000000-0000-4000-8000-000000000609'
  ) $$,
  '42501', 'break-glass access not authorized',
  'AAL1 cannot start owner break-glass access'
);
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000001","session_id":"9d000000-0000-4000-8000-000000000902","aal":"aal2"}';
select results_eq(
  $$ select outcome from loyalty.start_organization_break_glass_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    'Recover access after tenant identity outage.', 'break-glass:aal2',
    '9d000000-0000-4000-8000-000000000610'
  ) $$,
  array['created'::text], 'AAL2 plus a live Auth session creates a thirty-minute owner capability'
);
reset role;
select set_config('test.m13_break_glass', (
  select public_id::text from loyalty.organization_break_glass_sessions
  where reason = 'Recover access after tenant identity outage.'
), false);
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000001","session_id":"9d000000-0000-4000-8000-000000000902","aal":"aal2"}';
select ok(
  (select (document #>> '{ledger,balanced}')::boolean
   from loyalty.get_organization_administration_export_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_break_glass')::uuid
  )),
  'break-glass export reports exact balanced immutable ledger evidence'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.organization_break_glass_use_events
     where surface = 'organization_export' $$,
  array[1::bigint], 'every elevated export use is tenant-visible and immutable'
);
delete from auth.sessions where id = '9d000000-0000-4000-8000-000000000902';
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000001","session_id":"9d000000-0000-4000-8000-000000000902","aal":"aal2"}';
select throws_ok(
  $$ select * from loyalty.get_organization_administration_export_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_break_glass')::uuid
  ) $$,
  '42501', 'break-glass use not authorized',
  'a terminated Auth session invalidates an existing AAL2 recovery capability'
);
reset role;
insert into auth.sessions (id, user_id)
values ('9d000000-0000-4000-8000-000000000902', '9d000000-0000-4000-8000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select status from loyalty.update_organization_lifecycle_command_v1(
    '9d000000-0000-4000-8000-000000000100', 1, 'close', null,
    'Owner approved terminal organization closure.',
    'organization:close:m13-s05', '9d000000-0000-4000-8000-000000000611'
  ) $$,
  array['closed'::text], 'the owner closes the organization before offboarding'
);
select results_eq(
  $$ select outcome from loyalty.update_organization_lifecycle_command_v1(
    '9d000000-0000-4000-8000-000000000100', 2, 'offboard', null,
    'Owner approved complete organization offboarding.',
    'organization:offboard:m13-s05', '9d000000-0000-4000-8000-000000000612'
  ) $$,
  array['updated'::text], 'terminal offboarding runs the comprehensive cleanup transaction'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.organization_memberships as membership
     join loyalty.organizations as organization on organization.id = membership.organization_id
     where organization.public_id = '9d000000-0000-4000-8000-000000000100'
       and membership.revoked_at is null $$,
  array[1::bigint], 'offboarding retains only the initiating owner for recovery evidence'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.commerce_connections as connection
     join loyalty.organizations as organization on organization.id = connection.organization_id
     where organization.public_id = '9d000000-0000-4000-8000-000000000100'
       and connection.status <> 'disabled' $$,
  array[0::bigint], 'offboarding disables every commerce credential path'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.service_account_credentials as credential
     join loyalty.organizations as organization on organization.id = credential.organization_id
     where organization.public_id = '9d000000-0000-4000-8000-000000000100'
       and credential.status <> 'revoked' $$,
  array[0::bigint], 'offboarding revokes every service-account bearer credential'
);
select results_eq(
  $$ select
    (select count(*) from loyalty_private.notification_klaviyo_connections as connection
      join loyalty.organizations as organization on organization.id = connection.organization_id
      where organization.public_id = '9d000000-0000-4000-8000-000000000100'
        and connection.state = 'active')
    +
    (select count(*) from loyalty_private.notification_webhook_endpoints as endpoint
      join loyalty.organizations as organization on organization.id = endpoint.organization_id
      where organization.public_id = '9d000000-0000-4000-8000-000000000100'
        and endpoint.state = 'active') $$,
  array[0::bigint], 'offboarding disables every managed notification credential path'
);
select results_eq(
  $$ select endpoint.destination_url, endpoint.allowed_origin,
       endpoint.current_secret_hint,
       encode(endpoint.current_secret_sha256, 'hex') <> repeat('e', 64),
       endpoint.previous_secret_sha256 is null,
       endpoint.previous_secret_hint is null,
       endpoint.previous_secret_expires_at is null
     from loyalty_private.notification_webhook_endpoints as endpoint
     where endpoint.public_id = '9d000000-0000-4000-8000-000000000161' $$,
  $$ values (
       'https://retired.invalid/webhook/9d000000-0000-4000-8000-000000000161'::text,
       'https://retired.invalid'::text, null::text, true, true, true, true
     ) $$,
  'offboarding removes every live webhook destination and signing fingerprint'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.organization_offboarding_receipts as receipt
     where receipt.organization_public_id = '9d000000-0000-4000-8000-000000000100' $$,
  array[1::bigint], 'offboarding writes one immutable minimized cleanup receipt'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions as transaction
     join loyalty.organizations as organization on organization.id = transaction.organization_id
     where organization.public_id = '9d000000-0000-4000-8000-000000000100' $$,
  array[1::bigint], 'offboarding preserves the immutable loyalty transaction'
);
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000001","session_id":"9d000000-0000-4000-8000-000000000902","aal":"aal2"}';
select throws_ok(
  $$ select * from loyalty.get_organization_administration_export_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_break_glass')::uuid
  ) $$,
  '42501', 'break-glass use not authorized',
  'offboarding revokes every pre-existing recovery capability'
);
select results_eq(
  $$ select outcome from loyalty.start_organization_break_glass_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    'Export verified before deletion workflow.', 'break-glass:deletion',
    '9d000000-0000-4000-8000-000000000613'
  ) $$,
  array['created'::text], 'the retained owner may open a fresh audited recovery capability'
);
reset role;
select set_config('test.m13_delete_break_glass', (
  select public_id::text from loyalty.organization_break_glass_sessions
  where reason = 'Export verified before deletion workflow.'
), false);
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000001","session_id":"9d000000-0000-4000-8000-000000000902","aal":"aal2"}';
select results_eq(
  $$ select status from loyalty.organization_deletion_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_delete_break_glass')::uuid, null, 3, 'request',
    'Contract ended after verified organization export.',
    'organization:deletion:request', '9d000000-0000-4000-8000-000000000614'
  ) $$,
  array['cooling'::text], 'deletion starts in an explicit seven-day cooling state'
);
select results_eq(
  $$ select outcome from loyalty.organization_deletion_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_delete_break_glass')::uuid, null, 3, 'request',
    'Contract ended after verified organization export.',
    'organization:deletion:request', '9d000000-0000-4000-8000-000000000614'
  ) $$,
  array['duplicate'::text],
  'an exact deletion request retry returns the one serialized cooling case'
);
reset role;
select set_config('test.m13_deletion_case', (
  select public_id::text from loyalty.organization_deletion_cases where status = 'cooling'
), false);
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000001","session_id":"9d000000-0000-4000-8000-000000000902","aal":"aal2"}';
select throws_ok(
  $$ select * from loyalty.organization_deletion_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_delete_break_glass')::uuid,
    current_setting('test.m13_deletion_case')::uuid,
    1, 'complete', 'Attempt completion before cooling finishes.',
    'organization:deletion:early', '9d000000-0000-4000-8000-000000000615'
  ) $$,
  '55000', 'organization deletion cooling period active',
  'deletion cannot complete before the seven-day cooling period'
);
select results_eq(
  $$ select status from loyalty.organization_deletion_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_delete_break_glass')::uuid,
    current_setting('test.m13_deletion_case')::uuid,
    1, 'cancel', 'Owner cancelled deletion during cooling.',
    'organization:deletion:cancel', '9d000000-0000-4000-8000-000000000616'
  ) $$,
  array['cancelled'::text], 'the retained owner can cancel during cooling without restoring credentials'
);
reset role;
insert into loyalty.organization_deletion_cases (
  public_id, organization_id, reason, requested_by_user_id,
  due_at, created_at, updated_at
)
select '9d000000-0000-4000-8000-000000000170', id,
  'Historical cooling case ready for completion.',
  '9d000000-0000-4000-8000-000000000001',
  transaction_timestamp() - interval '1 day',
  transaction_timestamp() - interval '8 days',
  transaction_timestamp() - interval '8 days'
from loyalty.organizations where public_id = '9d000000-0000-4000-8000-000000000100';
set local role authenticated;
set local request.jwt.claim.sub = '9d000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"9d000000-0000-4000-8000-000000000001","session_id":"9d000000-0000-4000-8000-000000000902","aal":"aal2"}';
select results_eq(
  $$ select status from loyalty.organization_deletion_command_v1(
    '9d000000-0000-4000-8000-000000000100',
    current_setting('test.m13_delete_break_glass')::uuid,
    '9d000000-0000-4000-8000-000000000170', 1, 'complete',
    'Cooling finished and deletion was approved.',
    'organization:deletion:complete', '9d000000-0000-4000-8000-000000000617'
  ) $$,
  array['completed'::text], 'a cooled AAL2 deletion case completes through the exact command'
);
reset role;
select ok(
  (select organization.slug like 'deleted-%'
     and organization.name like 'Deleted organization %'
     and organization.pseudonymized_at is not null
     and organization.deletion_completed_at = organization.pseudonymized_at
   from loyalty.organizations as organization
   where organization.public_id = '9d000000-0000-4000-8000-000000000100'),
  'completion pseudonymizes mutable organization identity and retains its public tombstone'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.organization_memberships as membership
     join loyalty.organizations as organization on organization.id = membership.organization_id
     where organization.public_id = '9d000000-0000-4000-8000-000000000100'
       and membership.revoked_at is null $$,
  array[0::bigint], 'deletion completion removes the final organization access path'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions as transaction
     join loyalty.organizations as organization on organization.id = transaction.organization_id
     where organization.public_id = '9d000000-0000-4000-8000-000000000100' $$,
  array[1::bigint], 'deletion completion never destroys an immutable ledger transaction'
);
select results_eq(
  $$ select coalesce(sum(entry.points), 0)::bigint from loyalty.ledger_entries as entry
     join loyalty.organizations as organization on organization.id = entry.organization_id
     where organization.public_id = '9d000000-0000-4000-8000-000000000100' $$,
  array[0::bigint], 'preserved ledger entries still reconcile exactly to zero'
);
select throws_ok(
  $$ update loyalty.organization_deletion_events
     set outcome = 'cancelled'
     where action = 'organization.deletion.complete' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'terminal deletion evidence cannot be rewritten'
);

select * from finish();
rollback;
