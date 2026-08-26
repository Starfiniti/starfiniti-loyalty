begin;

create extension if not exists pgtap with schema extensions;

select plan(49);

grant loyalty_runtime to current_user;
grant usage on schema extensions to loyalty_runtime;
grant execute on all functions in schema extensions to loyalty_runtime;

-- 1-12: schema, grants, and secret minimization.
select has_table('loyalty', 'organization_scim_endpoints', 'SCIM endpoints exist');
select has_table('loyalty', 'organization_scim_users', 'SCIM Users exist');
select has_table('loyalty', 'organization_scim_groups', 'SCIM Groups exist');
select has_table('loyalty', 'organization_scim_audit_events', 'SCIM audit exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.organization_scim_endpoints'::regclass)
  and (select relrowsecurity from pg_class where oid = 'loyalty.organization_scim_users'::regclass)
  and (select relrowsecurity from pg_class where oid = 'loyalty.organization_scim_groups'::regclass)
  and (select relrowsecurity from pg_class where oid = 'loyalty.organization_scim_audit_events'::regclass),
  'every SCIM table enables RLS'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.organization_scim_users', 'SELECT')
  and not has_table_privilege('authenticated', 'loyalty.organization_scim_users', 'INSERT')
  and not has_table_privilege('loyalty_runtime', 'loyalty.organization_scim_users', 'SELECT')
  and not has_table_privilege('loyalty_worker', 'loyalty.organization_scim_groups', 'SELECT'),
  'application roles have no direct SCIM directory access'
);
select results_eq(
  $$
    select count(*)::bigint from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where (namespace.nspname, routine.proname) in (
      ('loyalty', 'create_organization_scim_endpoint_command_v1'),
      ('loyalty', 'update_organization_scim_endpoint_command_v1'),
      ('loyalty', 'map_organization_scim_group_role_command_v1'),
      ('loyalty', 'claim_organization_scim_membership_v1'),
      ('loyalty', 'organization_scim_workspace_v1'),
      ('loyalty', 'resolve_organization_federation_login_v2'),
      ('loyalty_private', 'organization_scim_request_v1'),
      ('loyalty_private', 'resolve_scim_provider_subject_v1')
    )
  $$,
  array[8::bigint],
  'eight exact SCIM and login boundaries exist'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.organization_scim_request_v1(uuid,bytea,text,text,uuid,text,text,integer,integer,jsonb,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'loyalty.claim_organization_scim_membership_v1(uuid,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'anon', 'loyalty.resolve_organization_federation_login_v2(text)', 'EXECUTE'
  ),
  'runtime, session, and login discovery receive only their narrow boundary'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.create_organization_scim_endpoint_command_v1(uuid,uuid,text,bytea,text,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'loyalty_private.organization_scim_request_v1(uuid,bytea,text,text,uuid,text,text,integer,integer,jsonb,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'loyalty_runtime', 'loyalty_private.resolve_scim_provider_subject_v1(uuid,text)', 'EXECUTE'
  ),
  'anonymous, browser, and runtime roles cannot cross SCIM authority boundaries'
);
select results_eq(
  $$
    select count(*)::bigint from information_schema.columns
    where table_schema = 'loyalty'
      and table_name in (
        'organization_scim_endpoints', 'organization_scim_credential_revisions',
        'organization_scim_audit_events'
      )
      and column_name in (
        'credential', 'token', 'secret', 'bearer', 'authorization',
        'raw_body', 'email', 'user_name', 'display_name'
      )
  $$,
  array[1::bigint],
  'SCIM control storage contains only endpoint display_name and no raw credential body or PII field'
);
select has_column(
  'loyalty', 'organization_memberships', 'scim_user_id',
  'memberships retain one explicit SCIM provenance selector'
);
select ok(
  (select routine.prosecdef
   from pg_proc as routine join pg_namespace as namespace on namespace.oid = routine.pronamespace
   where namespace.nspname = 'loyalty_private'
     and routine.proname = 'resolve_scim_provider_subject_v1')
  and not has_function_privilege(
    'authenticated', 'loyalty_private.resolve_scim_provider_subject_v1(uuid,text)', 'EXECUTE'
  ),
  'the Auth identities bridge is SECURITY DEFINER and inaccessible to sessions'
);

insert into auth.users (id, email, encrypted_password)
values
  ('9c000000-0000-4000-8000-000000000001', 'scim-owner@example.test', 'owner-password'),
  ('9c000000-0000-4000-8000-000000000002', 'scim-member@example.test', null),
  ('9c000000-0000-4000-8000-000000000003', 'scim-unprovisioned@example.test', null),
  ('9c000000-0000-4000-8000-000000000004', 'scim-other-owner@example.test', 'other-password');

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values
  (
    '9c000000-0000-4000-8000-000000000021',
    '9c000000-0000-4000-8000-000000000002',
    'authentik-hashed-subject-member',
    '{"sub":"authentik-hashed-subject-member"}'::jsonb,
    'custom:loyalty-scimsource0000000001', now(), now(), now()
  ),
  (
    '9c000000-0000-4000-8000-000000000022',
    '9c000000-0000-4000-8000-000000000003',
    'authentik-hashed-subject-unprovisioned',
    '{"sub":"authentik-hashed-subject-unprovisioned"}'::jsonb,
    'custom:loyalty-scimsource0000000001', now(), now(), now()
  );

insert into loyalty.organizations (public_id, slug, name)
values
  ('9c000000-0000-4000-8000-000000000100', 'scim-main', 'SCIM Main'),
  ('9c000000-0000-4000-8000-000000000200', 'scim-other', 'SCIM Other');
insert into loyalty.organization_memberships (
  public_id, organization_id, user_id, role, display_label
)
select member.public_id, organization.id, member.user_id, 'owner', member.label
from (values
  ('scim-main'::text, '9c000000-0000-4000-8000-000000000101'::uuid,
    '9c000000-0000-4000-8000-000000000001'::uuid, 'SCIM owner'::text),
  ('scim-other'::text, '9c000000-0000-4000-8000-000000000201'::uuid,
    '9c000000-0000-4000-8000-000000000004'::uuid, 'Other owner'::text)
) as member(slug, public_id, user_id, label)
join loyalty.organizations as organization on organization.slug = member.slug;

insert into loyalty.organization_federation_sources (
  public_id, organization_id, display_name, protocol, status,
  lifecycle_revision, discovery_url, client_id, upstream_secret_sha256,
  broker_secret_sha256, configuration_sha256, document_sha256,
  validated_issuer, authorization_endpoint, token_endpoint, jwks_uri,
  signing_fingerprints, validated_at, authentik_source_slug,
  authentik_source_public_id, authentik_provider_id,
  supabase_provider_identifier, external_outcome,
  created_by_user_id, updated_by_user_id
)
select source.public_id, organization.id, source.display_name, 'oidc', 'enabled',
  2, 'https://id.example.test/.well-known/openid-configuration',
  'loyalty-scim', decode(repeat('a', 64), 'hex'),
  decode(repeat('b', 64), 'hex'), decode(repeat('c', 64), 'hex'),
  decode(repeat('d', 64), 'hex'), 'https://id.example.test/',
  'https://id.example.test/authorize', 'https://id.example.test/token',
  'https://id.example.test/jwks', jsonb_build_array(repeat('e', 64)), now(),
  source.source_slug, source.source_public_id, source.provider_id,
  source.provider_identifier, 'succeeded', source.owner_id, source.owner_id
from loyalty.organizations as organization
join (values
  ('scim-main'::text, '9c000000-0000-4000-8000-000000000301'::uuid,
    'SCIM OIDC'::text, 'loyalty-scimsource0000000001'::text,
    '9c000000-0000-4000-8000-000000000311'::uuid, 931::bigint,
    'custom:loyalty-scimsource0000000001'::text,
    '9c000000-0000-4000-8000-000000000001'::uuid),
  ('scim-other'::text, '9c000000-0000-4000-8000-000000000302'::uuid,
    'Other OIDC'::text, 'loyalty-scimsource0000000002'::text,
    '9c000000-0000-4000-8000-000000000312'::uuid, 932::bigint,
    'custom:loyalty-scimsource0000000002'::text,
    '9c000000-0000-4000-8000-000000000004'::uuid)
) as source(
  slug, public_id, display_name, source_slug, source_public_id,
  provider_id, provider_identifier, owner_id
) on source.slug = organization.slug;

set local role authenticated;
set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000001';

-- 13-16: one-time digest-only endpoint lifecycle.
select results_eq(
  $$
    select outcome from loyalty.create_organization_scim_endpoint_command_v1(
      '9c000000-0000-4000-8000-000000000100',
      '9c000000-0000-4000-8000-000000000301',
      'Corporate directory', decode(repeat('1', 64), 'hex'),
      'scim:endpoint:create', '9c000000-0000-4000-8000-000000000601'
    )
  $$,
  array['created'::text],
  'an owner creates one digest-only endpoint for an exact federation source'
);
select results_eq(
  $$
    select outcome from loyalty.create_organization_scim_endpoint_command_v1(
      '9c000000-0000-4000-8000-000000000100',
      '9c000000-0000-4000-8000-000000000301',
      'Corporate directory', decode(repeat('1', 64), 'hex'),
      'scim:endpoint:create', '9c000000-0000-4000-8000-000000000601'
    )
  $$,
  array['duplicate'::text],
  'an exact endpoint retry returns the original effect'
);
select throws_ok(
  $$
    select * from loyalty.create_organization_scim_endpoint_command_v1(
      '9c000000-0000-4000-8000-000000000100',
      '9c000000-0000-4000-8000-000000000301',
      'Changed directory', decode(repeat('1', 64), 'hex'),
      'scim:endpoint:create', '9c000000-0000-4000-8000-000000000601'
    )
  $$,
  '23514', 'SCIM endpoint idempotency conflict',
  'changed endpoint reuse fails closed'
);
reset role;
select results_eq(
  $$
    select octet_length(credential_sha256)::bigint
    from loyalty.organization_scim_endpoints
    where display_name = 'Corporate directory'
  $$,
  array[32::bigint],
  'only a 32-byte endpoint credential digest persists'
);

select set_config('test.scim_endpoint', (
  select public_id::text from loyalty.organization_scim_endpoints
  where display_name = 'Corporate directory'
), false);
select set_config('test.scim_credential', repeat('1', 64), false);

create or replace function pg_temp.scim_request(
  target_method text,
  target_resource_type text,
  target_resource_public_id uuid default null,
  target_body jsonb default null,
  target_filter_attribute text default null,
  target_filter_value text default null,
  target_count integer default 100,
  target_if_match text default null
)
returns table (
  http_status integer, response_document jsonb, response_etag text,
  quota_limit integer, quota_remaining integer, quota_reset_at timestamptz
)
language sql
as $$
  select * from loyalty_private.organization_scim_request_v1(
    current_setting('test.scim_endpoint')::uuid,
    decode(current_setting('test.scim_credential'), 'hex'),
    target_method, target_resource_type, target_resource_public_id,
    target_filter_attribute, target_filter_value, 1, target_count,
    target_body, target_if_match, gen_random_uuid()
  );
$$;
grant execute on function pg_temp.scim_request(
  text, text, uuid, jsonb, text, text, integer, text
) to loyalty_runtime;

set local role loyalty_runtime;

-- 17-23: discovery and retry-safe resources.
select results_eq(
  $$ select http_status from pg_temp.scim_request('GET', 'ServiceProviderConfig') $$,
  array[200],
  'digest-authenticated discovery succeeds'
);
select results_eq(
  $$
    select http_status from pg_temp.scim_request(
      'POST', 'Users', null,
      jsonb_build_object(
        'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:User'),
        'externalId', 'authentik-hashed-subject-member',
        'userName', 'directory-member', 'displayName', 'Directory member',
        'emails', jsonb_build_array(jsonb_build_object(
          'value', 'scim-member@example.test', 'primary', true
        )), 'active', true
      )
    )
  $$,
  array[201],
  'a valid User is created without linking by email'
);
select results_eq(
  $$
    select http_status from pg_temp.scim_request(
      'POST', 'Users', null,
      jsonb_build_object(
        'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:User'),
        'externalId', 'authentik-hashed-subject-member',
        'userName', 'directory-member', 'displayName', 'Directory member',
        'emails', jsonb_build_array(jsonb_build_object(
          'value', 'scim-member@example.test', 'primary', true
        )), 'active', true
      )
    )
  $$,
  array[200],
  'an exact User create retry returns the existing resource'
);
select throws_ok(
  $$
    select * from pg_temp.scim_request(
      'POST', 'Users', null,
      jsonb_build_object(
        'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:User'),
        'externalId', 'authentik-malformed-subject',
        'userName', 'malformed-directory-user',
        'emails', jsonb_build_array(jsonb_build_object(
          'value', 'malformed@example.test', 'tenantRole', 'owner'
        )), 'active', true
      )
    )
  $$,
  '22023', 'invalid SCIM User schema',
  'PostgreSQL independently rejects nested attributes outside the versioned contract'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.organization_scim_users $$,
  array[1::bigint],
  'User retry creates one row'
);
select set_config('test.scim_user', (
  select public_id::text from loyalty.organization_scim_users
  where external_id = 'authentik-hashed-subject-member'
), false);
set local role loyalty_runtime;
select results_eq(
  $$
    select http_status from pg_temp.scim_request(
      'POST', 'Groups', null,
      jsonb_build_object(
        'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:Group'),
        'externalId', 'authentik-group-operators',
        'displayName', 'Directory operators',
        'members', jsonb_build_array(jsonb_build_object(
          'value', current_setting('test.scim_user')::uuid
        ))
      )
    )
  $$,
  array[201],
  'a Group is created with an endpoint-local User member'
);
select results_eq(
  $$
    select (response_document->>'totalResults')::integer
    from pg_temp.scim_request(
      'GET', 'Users', null, null, 'externalId',
      'authentik-hashed-subject-member'
    )
  $$,
  array[1],
  'exact externalId filtering finds one User'
);
select results_eq(
  $$
    select (response_document->>'itemsPerPage')::integer
    from pg_temp.scim_request('GET', 'Users', null, null, null, null, 0)
  $$,
  array[0],
  'bounded zero-count pagination returns no resources'
);

reset role;
select set_config('test.scim_group', (
  select public_id::text from loyalty.organization_scim_groups
  where external_id = 'authentik-group-operators'
), false);

set local role authenticated;
set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000001';

-- 24-30: explicit role mapping plus exact-subject claim.
select results_eq(
  $$
    select mapped_role from loyalty.map_organization_scim_group_role_command_v1(
      '9c000000-0000-4000-8000-000000000100',
      current_setting('test.scim_endpoint')::uuid,
      current_setting('test.scim_group')::uuid, 1, 'operator',
      'Allow the reviewed operations group.', 'scim:group:map:operator',
      '9c000000-0000-4000-8000-000000000602'
    )
  $$,
  array['operator'::text],
  'an owner explicitly maps an opaque Group to a non-owner role'
);

set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000002';
select results_eq(
  $$
    select outcome from loyalty.claim_organization_scim_membership_v1(
      '9c000000-0000-4000-8000-000000000100',
      '9c000000-0000-4000-8000-000000000603'
    )
  $$,
  array['created'::text],
  'matching hashed OIDC subject plus active SCIM User and role creates membership'
);
reset role;
select results_eq(
  $$
    select role, revoked_at is null
    from loyalty.organization_memberships
    where user_id = '9c000000-0000-4000-8000-000000000002'
      and organization_id = (select id from loyalty.organizations where slug = 'scim-main')
  $$,
  $$ values ('operator'::text, true) $$,
  'the SCIM-created membership has exact provenance and is live'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_memberships
    where scim_user_id = (select id from loyalty.organization_scim_users
      where external_id = 'authentik-hashed-subject-member')
  $$,
  array[1::bigint],
  'one SCIM User owns at most one membership'
);

set local role authenticated;
set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000003';
select results_eq(
  $$
    select outcome from loyalty.claim_organization_scim_membership_v1(
      '9c000000-0000-4000-8000-000000000100',
      '9c000000-0000-4000-8000-000000000604'
    )
  $$,
  array['unavailable'::text],
  'a brokered subject without prior SCIM provisioning receives no authority'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_memberships
    where user_id = '9c000000-0000-4000-8000-000000000003'
  $$,
  array[0::bigint],
  'unprovisioned authentication creates no membership'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_scim_groups
    where mapped_role = 'owner'
  $$,
  array[0::bigint],
  'SCIM group mapping can never produce an owner'
);

set local role loyalty_runtime;

-- 31-36: deprovision, deterministic retry, and reactivation.
select results_eq(
  $$
    select http_status from pg_temp.scim_request(
      'PATCH', 'Users', current_setting('test.scim_user')::uuid,
      jsonb_build_object(
        'schemas', jsonb_build_array('urn:ietf:params:scim:api:messages:2.0:PatchOp'),
        'Operations', jsonb_build_array(jsonb_build_object(
          'op', 'replace', 'path', 'active', 'value', false
        ))
      )
    )
  $$,
  array[200],
  'active false is accepted'
);
reset role;
select results_eq(
  $$
    select revoked_at is not null from loyalty.organization_memberships
    where user_id = '9c000000-0000-4000-8000-000000000002'
      and organization_id = (select id from loyalty.organizations where slug = 'scim-main')
  $$,
  array[true],
  'active false revokes the live membership in the same transaction'
);
select set_config('test.inactive_revision', (
  select lifecycle_revision::text from loyalty.organization_scim_users
  where external_id = 'authentik-hashed-subject-member'
), false);
set local role loyalty_runtime;
select results_eq(
  $$
    select http_status from pg_temp.scim_request(
      'PATCH', 'Users', current_setting('test.scim_user')::uuid,
      jsonb_build_object(
        'schemas', jsonb_build_array('urn:ietf:params:scim:api:messages:2.0:PatchOp'),
        'Operations', jsonb_build_array(jsonb_build_object(
          'op', 'replace', 'path', 'active', 'value', false
        ))
      )
    )
  $$,
  array[200],
  'an exact inactive retry succeeds without another effect'
);
reset role;
select results_eq(
  $$
    select lifecycle_revision from loyalty.organization_scim_users
    where external_id = 'authentik-hashed-subject-member'
  $$,
  array[current_setting('test.inactive_revision')::bigint],
  'an exact inactive retry does not increment the resource revision'
);
set local role loyalty_runtime;
select results_eq(
  $$
    select http_status from pg_temp.scim_request(
      'PUT', 'Users', current_setting('test.scim_user')::uuid,
      jsonb_build_object(
        'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:User'),
        'externalId', 'authentik-hashed-subject-member',
        'userName', 'directory-member', 'displayName', 'Directory member',
        'emails', jsonb_build_array(jsonb_build_object(
          'value', 'scim-member@example.test', 'primary', true
        )), 'active', true
      )
    )
  $$,
  array[200],
  'PUT reactivates the provisioned User'
);
reset role;
select results_eq(
  $$
    select role, revoked_at is null from loyalty.organization_memberships
    where user_id = '9c000000-0000-4000-8000-000000000002'
      and organization_id = (select id from loyalty.organizations where slug = 'scim-main')
  $$,
  $$ values ('operator'::text, true) $$,
  'reactivation restores the same membership row and role'
);

set local role loyalty_runtime;

-- 37-42: ambiguous mappings fail closed and recover deterministically.
select results_eq(
  $$
    select http_status from pg_temp.scim_request(
      'POST', 'Groups', null,
      jsonb_build_object(
        'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:Group'),
        'externalId', 'authentik-group-admins', 'displayName', 'Directory admins',
        'members', jsonb_build_array(jsonb_build_object(
          'value', current_setting('test.scim_user')::uuid
        ))
      )
    )
  $$,
  array[201],
  'a second Group can contain the same User'
);
reset role;
select set_config('test.scim_admin_group', (
  select public_id::text from loyalty.organization_scim_groups
  where external_id = 'authentik-group-admins'
), false);
set local role authenticated;
set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select mapped_role from loyalty.map_organization_scim_group_role_command_v1(
      '9c000000-0000-4000-8000-000000000100',
      current_setting('test.scim_endpoint')::uuid,
      current_setting('test.scim_admin_group')::uuid, 1, 'admin',
      'Review a deliberately conflicting group.', 'scim:group:map:admin',
      '9c000000-0000-4000-8000-000000000605'
    )
  $$,
  array['admin'::text],
  'a separately reviewed Group can map to admin'
);
reset role;
select results_eq(
  $$
    select revoked_at is not null from loyalty.organization_memberships
    where user_id = '9c000000-0000-4000-8000-000000000002'
      and organization_id = (select id from loyalty.organizations where slug = 'scim-main')
  $$,
  array[true],
  'two distinct mapped roles revoke rather than resolve by privilege'
);
set local role authenticated;
set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select mapped_role is null from loyalty.map_organization_scim_group_role_command_v1(
      '9c000000-0000-4000-8000-000000000100',
      current_setting('test.scim_endpoint')::uuid,
      current_setting('test.scim_admin_group')::uuid, 2, null,
      'Remove the deliberately conflicting role.', 'scim:group:unmap:admin',
      '9c000000-0000-4000-8000-000000000606'
    )
  $$,
  array[true],
  'an owner can remove the conflicting allowlist mapping'
);
reset role;
select results_eq(
  $$
    select role, revoked_at is null from loyalty.organization_memberships
    where user_id = '9c000000-0000-4000-8000-000000000002'
      and organization_id = (select id from loyalty.organizations where slug = 'scim-main')
  $$,
  $$ values ('operator'::text, true) $$,
  'resolving the conflict restores the only exact role'
);
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from pg_temp.scim_request(
      'PUT', 'Users', current_setting('test.scim_user')::uuid,
      jsonb_build_object(
        'schemas', jsonb_build_array('urn:ietf:params:scim:schemas:core:2.0:User'),
        'externalId', 'changed-subject', 'userName', 'directory-member',
        'emails', '[]'::jsonb, 'active', true
      )
    )
  $$,
  '22023', 'SCIM externalId is immutable',
  'a provisioned subject cannot be rebound by mutation'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000001';

-- 43-48: rotation, revocation, stale sessions, and minimized review.
select results_eq(
  $$
    select outcome from loyalty.update_organization_scim_endpoint_command_v1(
      '9c000000-0000-4000-8000-000000000100',
      current_setting('test.scim_endpoint')::uuid, 1, 'rotate',
      decode(repeat('2', 64), 'hex'), 'Rotate the controlled canary credential.',
      'scim:endpoint:rotate', '9c000000-0000-4000-8000-000000000607'
    )
  $$,
  array['rotate'::text],
  'credential rotation accepts one new digest'
);
reset role;
set local role loyalty_runtime;
select throws_ok(
  $$ select * from pg_temp.scim_request('GET', 'Users') $$,
  '28000', 'invalid SCIM credential',
  'the old endpoint credential fails immediately'
);
reset role;
select set_config('test.scim_credential', repeat('2', 64), false);
set local role loyalty_runtime;
select results_eq(
  $$ select http_status from pg_temp.scim_request('GET', 'Users') $$,
  array[200],
  'the rotated credential authorizes the same endpoint'
);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select status from loyalty.update_organization_scim_endpoint_command_v1(
      '9c000000-0000-4000-8000-000000000100',
      current_setting('test.scim_endpoint')::uuid, 2, 'revoke', null,
      'Revoke the controlled canary endpoint.', 'scim:endpoint:revoke',
      '9c000000-0000-4000-8000-000000000608'
    )
  $$,
  array['revoked'::text],
  'endpoint revocation is explicit and audited'
);
reset role;
select results_eq(
  $$
    select revoked_at is not null from loyalty.organization_memberships
    where user_id = '9c000000-0000-4000-8000-000000000002'
      and organization_id = (select id from loyalty.organizations where slug = 'scim-main')
  $$,
  array[true],
  'endpoint revocation invalidates the existing member session on its next database check'
);
set local role loyalty_runtime;
select throws_ok(
  $$ select * from pg_temp.scim_request('GET', 'Users') $$,
  '28000', 'invalid SCIM credential',
  'a revoked endpoint rejects its current credential'
);

reset role;
select * from finish();
rollback;
