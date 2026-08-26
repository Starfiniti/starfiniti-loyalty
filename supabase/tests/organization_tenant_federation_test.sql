begin;

create extension if not exists pgtap with schema extensions;

select plan(76);

grant loyalty_runtime to current_user;
grant usage on schema extensions to loyalty_runtime;
grant execute on all functions in schema extensions to loyalty_runtime;

-- 1-12: schema, grants, and minimized storage.
select has_table('loyalty', 'organization_federation_sources', 'federation sources exist');
select has_table('loyalty', 'organization_federation_source_revisions', 'federation revisions exist');
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.organization_federation_sources'::regclass)
  and (select relrowsecurity from pg_class where oid = 'loyalty.organization_federation_source_revisions'::regclass),
  'federation tables enable RLS'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.organization_federation_sources', 'SELECT')
  and not has_table_privilege('authenticated', 'loyalty.organization_federation_sources', 'INSERT')
  and not has_table_privilege('loyalty_runtime', 'loyalty.organization_federation_sources', 'SELECT')
  and not has_table_privilege('loyalty_worker', 'loyalty.organization_federation_sources', 'SELECT'),
  'application roles have no direct federation-table access'
);
select results_eq(
  $$
    select count(*)::bigint from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where (namespace.nspname, routine.proname) in (
      ('loyalty_private', 'prepare_organization_federation_source_v1'),
      ('loyalty_private', 'record_organization_federation_validation_v1'),
      ('loyalty_private', 'begin_organization_federation_action_v1'),
      ('loyalty_private', 'complete_organization_federation_action_v1'),
      ('loyalty', 'organization_federation_workspace_v1'),
      ('loyalty', 'resolve_organization_federation_login_v1')
    )
  $$,
  array[6::bigint],
  'six exact federation boundaries exist'
);
select ok(
  has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.prepare_organization_federation_source_v1(uuid,uuid,text,text,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.complete_organization_federation_action_v1(uuid,uuid,bigint,text,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'only the trusted runtime may orchestrate external federation state'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.prepare_organization_federation_source_v1(uuid,uuid,text,text,text,text,text,text,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'loyalty_private.complete_organization_federation_action_v1(uuid,uuid,bigint,text,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'browser roles cannot enter trusted federation orchestration'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.organization_federation_workspace_v1(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'anon', 'loyalty.resolve_organization_federation_login_v1(text)', 'EXECUTE'
  ),
  'authenticated review and anonymous login resolution use separate minimized boundaries'
);
select results_eq(
  $$
    select count(*)::bigint from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where (namespace.nspname, routine.proname) in (
      ('loyalty_private', 'prepare_organization_federation_source_v1'),
      ('loyalty_private', 'record_organization_federation_validation_v1'),
      ('loyalty_private', 'begin_organization_federation_action_v1'),
      ('loyalty_private', 'complete_organization_federation_action_v1'),
      ('loyalty', 'organization_federation_workspace_v1'),
      ('loyalty', 'resolve_organization_federation_login_v1')
    )
      and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting like 'statement_timeout=%'
      )
  $$,
  array[6::bigint],
  'every exposed federation boundary fixes search path and timeout'
);
select results_eq(
  $$
    select count(*)::bigint from information_schema.columns
    where table_schema = 'loyalty'
      and table_name in (
        'organization_federation_sources',
        'organization_federation_source_revisions'
      )
      and column_name in (
        'client_secret', 'broker_secret', 'password', 'token', 'assertion',
        'email', 'domain', 'group', 'claims', 'metadata_document', 'jwks_document'
      )
  $$,
  array[0::bigint],
  'federation storage has no raw secret identity claim or source document column'
);
select has_trigger(
  'loyalty', 'organization_federation_source_revisions',
  'organization_federation_revisions_immutable',
  'federation revisions are immutable'
);
select has_trigger(
  'loyalty', 'organization_federation_sources',
  'organization_federation_sources_guarded',
  'current federation state is command-guarded'
);

-- pgTAP evaluates dynamic SQL after SET ROLE. This rolled-back, column-only
-- policy lets test expressions resolve the random public selector and digest;
-- the assertions above prove that deployed runtime has no table access.
grant select (public_id, display_name, configuration_sha256)
  on loyalty.organization_federation_sources to loyalty_runtime;
create policy organization_federation_runtime_test_lookup
  on loyalty.organization_federation_sources
  for select to loyalty_runtime using (true);

insert into auth.users (id, email, encrypted_password)
values
  ('9b000000-0000-4000-8000-000000000001', 'federation-owner@example.test', null),
  ('9b000000-0000-4000-8000-000000000002', 'federation-admin@example.test', null),
  ('9b000000-0000-4000-8000-000000000003', 'federation-auditor@example.test', null),
  ('9b000000-0000-4000-8000-000000000004', 'federation-other@example.test', 'other-owner-hash');

insert into loyalty.organizations (public_id, slug, name)
values
  ('9b000000-0000-4000-8000-000000000100', 'federation-main', 'Federation Main'),
  ('9b000000-0000-4000-8000-000000000200', 'federation-other', 'Federation Other');
insert into loyalty.organization_memberships (
  public_id, organization_id, user_id, role, display_label
)
select member.public_id, organization.id, member.user_id, member.role, member.label
from loyalty.organizations as organization
cross join (values
  ('9b000000-0000-4000-8000-000000000101'::uuid, '9b000000-0000-4000-8000-000000000001'::uuid, 'owner'::text, 'Federation owner'::text),
  ('9b000000-0000-4000-8000-000000000102'::uuid, '9b000000-0000-4000-8000-000000000002'::uuid, 'admin'::text, 'Federation admin'::text),
  ('9b000000-0000-4000-8000-000000000103'::uuid, '9b000000-0000-4000-8000-000000000003'::uuid, 'auditor'::text, 'Federation auditor'::text)
) as member(public_id, user_id, role, label)
where organization.slug = 'federation-main';
insert into loyalty.organization_memberships (
  public_id, organization_id, user_id, role, display_label
)
select '9b000000-0000-4000-8000-000000000201', id,
  '9b000000-0000-4000-8000-000000000004', 'owner', 'Other owner'
from loyalty.organizations where slug = 'federation-other';

create temp table federation_test_baseline as
select
  (select count(*) from loyalty.organization_memberships)::bigint as memberships,
  (select count(*) from loyalty.ledger_transactions)::bigint as ledger_transactions;

-- 13-26: exact source preparation, isolation, and capacity.
set local role loyalty_runtime;
select results_eq(
  $$
    select outcome from loyalty_private.prepare_organization_federation_source_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      'Corporate OIDC', 'oidc',
      'https://id.example.test/.well-known/openid-configuration',
      'loyalty-production', null, null, repeat('a', 64),
      'federation:create:oidc', '9b000000-0000-4000-8000-000000000601'
    )
  $$,
  array['created'::text],
  'an owner prepares one disabled OIDC source'
);
select results_eq(
  $$
    select outcome from loyalty_private.prepare_organization_federation_source_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      'Corporate OIDC', 'oidc',
      'https://id.example.test/.well-known/openid-configuration',
      'loyalty-production', null, null, repeat('a', 64),
      'federation:create:oidc', '9b000000-0000-4000-8000-000000000601'
    )
  $$,
  array['duplicate'::text],
  'an exact source preparation retry returns the original effect'
);
select throws_ok(
  $$
    select * from loyalty_private.prepare_organization_federation_source_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      'Changed OIDC', 'oidc',
      'https://id.example.test/.well-known/openid-configuration',
      'loyalty-production', null, null, repeat('a', 64),
      'federation:create:oidc', '9b000000-0000-4000-8000-000000000601'
    )
  $$,
  '23514', 'federation command idempotency conflict',
  'changed source preparation under one idempotency key fails closed'
);
reset role;
select results_eq(
  $$
    select protocol, status, lifecycle_revision from loyalty.organization_federation_sources
    where display_name = 'Corporate OIDC'
  $$,
  $$ values ('oidc'::text, 'draft'::text, 1::bigint) $$,
  'OIDC preparation stores one exact draft state'
);
select results_eq(
  $$
    select octet_length(upstream_secret_sha256)::bigint
    from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'
  $$,
  array[32::bigint],
  'OIDC stores only the 32-byte upstream secret fingerprint'
);
select results_eq(
  $$
    select (authentik_source_slug ~ '^loyalty-[a-z0-9]{20}$')
      and (supabase_provider_identifier ~ '^custom:loyalty-[a-z0-9]{20}$')
      and authentik_source_slug not like '%federation-main%'
    from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'
  $$,
  array[true],
  'external selectors are opaque and contain no tenant slug'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_federation_source_revisions as revision
    join loyalty.organization_federation_sources as source on source.id = revision.source_id
    where source.display_name = 'Corporate OIDC'
  $$,
  array[1::bigint],
  'source preparation appends one immutable revision'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.admin_audit_events as audit
    where audit.action = 'federation.create'
      and audit.resource_public_id = (
        select public_id from loyalty.organization_federation_sources
        where display_name = 'Corporate OIDC'
      )
  $$,
  array[1::bigint],
  'source preparation appends one attributable audit event'
);
set local role loyalty_runtime;
select results_eq(
  $$
    select outcome from loyalty_private.prepare_organization_federation_source_v1(
      '9b000000-0000-4000-8000-000000000002',
      '9b000000-0000-4000-8000-000000000100',
      'Corporate SAML', 'saml', null, null,
      'https://saml.example.test/metadata', 'urn:example:test:tenant', null,
      'federation:create:saml', '9b000000-0000-4000-8000-000000000602'
    )
  $$,
  array['created'::text],
  'an admin prepares a SAML source with a non-URL entity ID'
);
reset role;
select results_eq(
  $$
    select upstream_secret_sha256 is null from loyalty.organization_federation_sources
    where display_name = 'Corporate SAML'
  $$,
  array[true],
  'SAML source preparation retains no upstream secret'
);
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.prepare_organization_federation_source_v1(
      '9b000000-0000-4000-8000-000000000003',
      '9b000000-0000-4000-8000-000000000100',
      'Auditor source', 'saml', null, null,
      'https://auditor.example.test/metadata', null, null,
      'federation:create:auditor', '9b000000-0000-4000-8000-000000000603'
    )
  $$,
  '42501', 'federation source command not authorized',
  'an auditor cannot prepare a federation source'
);
select throws_ok(
  $$
    select * from loyalty_private.prepare_organization_federation_source_v1(
      '9b000000-0000-4000-8000-000000000002',
      '9b000000-0000-4000-8000-000000000200',
      'Cross tenant', 'saml', null, null,
      'https://cross.example.test/metadata', null, null,
      'federation:create:cross', '9b000000-0000-4000-8000-000000000604'
    )
  $$,
  '42501', 'federation source command not authorized',
  'a foreign tenant selector grants no federation authority'
);
select results_eq(
  $$
    select result.outcome
    from (values
      (1, 'Spare one', 'spare-one', 'b'),
      (2, 'Spare two', 'spare-two', 'c'),
      (3, 'Spare three', 'spare-three', 'd')
    ) as input(ordinal, display_name, suffix, digest_character)
    cross join lateral loyalty_private.prepare_organization_federation_source_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      input.display_name, 'oidc',
      'https://' || input.suffix || '.example.test/.well-known/openid-configuration',
      'loyalty-' || input.suffix, null, null, repeat(input.digest_character, 64),
      'federation:create:' || input.suffix,
      ('9b000000-0000-4000-8000-00000000060' || (4 + input.ordinal)::text)::uuid
    ) as result
    order by input.ordinal
  $$,
  array['created'::text, 'created'::text, 'created'::text],
  'source capacity accepts exactly five non-retired configurations'
);
select throws_ok(
  $$
    select * from loyalty_private.prepare_organization_federation_source_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      'Source six', 'oidc',
      'https://six.example.test/.well-known/openid-configuration',
      'loyalty-six', null, null, repeat('e', 64),
      'federation:create:six', '9b000000-0000-4000-8000-000000000609'
    )
  $$,
  '23514', 'federation source limit reached',
  'a sixth non-retired source fails at the serialized tenant limit'
);
reset role;

-- 27-38: minimized validation evidence and review projection.
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.record_organization_federation_validation_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      1,
      (select encode(configuration_sha256, 'hex') from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      repeat('1', 64), 'https://id.example.test/',
      'https://id.example.test/authorize', 'https://id.example.test/token',
      null, null, array[repeat('2', 64)], repeat('3', 64),
      '9b000000-0000-4000-8000-000000000701',
      '9b000000-0000-4000-8000-000000000702',
      'succeeded', 'validated', 'federation:validate:invalid',
      '9b000000-0000-4000-8000-000000000610'
    )
  $$,
  '22023', 'invalid federation protocol evidence',
  'OIDC validation fails without an exact JWKS endpoint'
);
select results_eq(
  $$
    select outcome from loyalty_private.record_organization_federation_validation_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      1,
      (select encode(configuration_sha256, 'hex') from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      repeat('1', 64), 'https://id.example.test/',
      'https://id.example.test/authorize', 'https://id.example.test/token',
      'https://id.example.test/jwks', null, array[repeat('2', 64)],
      repeat('3', 64),
      '9b000000-0000-4000-8000-000000000701',
      '9b000000-0000-4000-8000-000000000702',
      'succeeded', 'validated', 'federation:validate:oidc',
      '9b000000-0000-4000-8000-000000000611'
    )
  $$,
  array['updated'::text],
  'trusted validation records one exact OIDC result'
);
select results_eq(
  $$
    select outcome from loyalty_private.record_organization_federation_validation_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      1,
      (select encode(configuration_sha256, 'hex') from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      repeat('1', 64), 'https://id.example.test/',
      'https://id.example.test/authorize', 'https://id.example.test/token',
      'https://id.example.test/jwks', null, array[repeat('2', 64)],
      repeat('3', 64),
      '9b000000-0000-4000-8000-000000000701',
      '9b000000-0000-4000-8000-000000000702',
      'succeeded', 'validated', 'federation:validate:oidc',
      '9b000000-0000-4000-8000-000000000611'
    )
  $$,
  array['duplicate'::text],
  'an exact validation retry returns the same effect'
);
select throws_ok(
  $$
    select * from loyalty_private.record_organization_federation_validation_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      1,
      (select encode(configuration_sha256, 'hex') from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      repeat('1', 64), 'https://id.example.test/',
      'https://id.example.test/authorize', 'https://id.example.test/token',
      'https://id.example.test/jwks', null, array[repeat('2', 64)],
      repeat('3', 64),
      '9b000000-0000-4000-8000-000000000701',
      '9b000000-0000-4000-8000-000000000702',
      'succeeded', 'changed', 'federation:validate:oidc',
      '9b000000-0000-4000-8000-000000000611'
    )
  $$,
  '23514', 'federation command idempotency conflict',
  'changed validation evidence under one idempotency key fails closed'
);
reset role;
select results_eq(
  $$
    select status, lifecycle_revision, octet_length(document_sha256)::bigint,
      octet_length(broker_secret_sha256)::bigint,
      authentik_source_public_id is not null,
      authentik_provider_public_id is not null
    from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'
  $$,
  $$ values ('validated'::text, 2::bigint, 32::bigint, 32::bigint, true, true) $$,
  'validated state retains only fingerprints and opaque external selectors'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_federation_source_revisions as revision
    join loyalty.organization_federation_sources as source on source.id = revision.source_id
    where source.display_name = 'Corporate OIDC'
  $$,
  array[2::bigint],
  'validation appends the second immutable revision'
);
set local role authenticated;
set local request.jwt.claim.sub = '9b000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select jsonb_array_length(
      loyalty.organization_federation_workspace_v1(
        '9b000000-0000-4000-8000-000000000100'
      ) -> 'sources'
    )::bigint
  $$,
  array[5::bigint],
  'owner review is bounded to five tenant sources'
);
select results_eq(
  $$
    select not (
      loyalty.organization_federation_workspace_v1(
        '9b000000-0000-4000-8000-000000000100'
      )::text ~* '(secret_sha256|authentik_source_public_id|authentik_provider_public_id|email|domain|group|claims)'
    )
  $$,
  array[true],
  'review projection excludes fingerprints external selectors and identity claims'
);
set local request.jwt.claim.sub = '9b000000-0000-4000-8000-000000000003';
select ok(
  loyalty.organization_federation_workspace_v1(
    '9b000000-0000-4000-8000-000000000100'
  ) is not null,
  'a live auditor receives minimized federation review'
);
select is(
  loyalty.organization_federation_workspace_v1(
    '9b000000-0000-4000-8000-000000000200'
  ),
  null,
  'a cross-tenant review selector returns no document'
);
reset role;
update loyalty.organization_memberships
set revoked_at = transaction_timestamp()
where public_id = '9b000000-0000-4000-8000-000000000103';
set local role authenticated;
set local request.jwt.claim.sub = '9b000000-0000-4000-8000-000000000003';
select is(
  loyalty.organization_federation_workspace_v1(
    '9b000000-0000-4000-8000-000000000100'
  ),
  null,
  'a revoked session fails on its next federation review request'
);
reset role;
select set_config('loyalty.identity_command', 'on', true);
update loyalty.organization_memberships
set revoked_at = null
where public_id = '9b000000-0000-4000-8000-000000000103';
select set_config('loyalty.identity_command', 'off', true);
set local role anon;
select is_empty(
  $$ select * from loyalty.resolve_organization_federation_login_v1('federation-main') $$,
  'a validated source is not publicly discoverable before enablement'
);
reset role;

-- 39-52: enablement requires recovery and remains non-public until completion.
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      2, 'enable', null, 'Enable the approved corporate source.',
      'federation:enable:begin', '9b000000-0000-4000-8000-000000000612'
    )
  $$,
  '23514', 'local owner recovery required before federation enablement',
  'federation cannot be enabled without a local-password owner'
);
reset role;
update auth.users set encrypted_password = 'local-owner-hash'
where id = '9b000000-0000-4000-8000-000000000001';
set local role loyalty_runtime;
select results_eq(
  $$
    select outcome from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      2, 'enable', null, 'Enable the approved corporate source.',
      'federation:enable:begin', '9b000000-0000-4000-8000-000000000612'
    )
  $$,
  array['updated'::text],
  'enablement begins only after recovery is available'
);
reset role;
select results_eq(
  $$
    select status, pending_action, lifecycle_revision
    from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'
  $$,
  $$ values ('validated'::text, 'enable'::text, 3::bigint) $$,
  'pending enablement remains non-public at a new revision'
);
set local role anon;
select is_empty(
  $$ select * from loyalty.resolve_organization_federation_login_v1('federation-main') $$,
  'login resolution remains empty during external enablement'
);
reset role;
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.complete_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000002',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      3, 'enable', 'succeeded', 'enabled', null,
      'federation:enable:wrong-actor', '9b000000-0000-4000-8000-000000000612'
    )
  $$,
  '23514', 'federation completion does not match pending operation',
  'another authorized administrator cannot complete the pending owner operation'
);
select throws_ok(
  $$
    select * from loyalty_private.complete_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      3, 'enable', 'succeeded', 'enabled', null,
      'federation:enable:wrong-correlation', '9b000000-0000-4000-8000-000000000613'
    )
  $$,
  '23514', 'federation completion does not match pending operation',
  'a completion from another workflow cannot consume the pending operation'
);
select results_eq(
  $$
    select outcome from loyalty_private.complete_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      3, 'enable', 'succeeded', 'enabled', null,
      'federation:enable:complete', '9b000000-0000-4000-8000-000000000612'
    )
  $$,
  array['updated'::text],
  'confirmed external enablement creates one enabled revision'
);
reset role;
select results_eq(
  $$
    select status, pending_action is null, lifecycle_revision
    from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'
  $$,
  $$ values ('enabled'::text, true, 4::bigint) $$,
  'only confirmed completion marks the source enabled'
);
set local role anon;
select results_eq(
  $$ select provider from loyalty.resolve_organization_federation_login_v1('federation-main') $$,
  $$
    select supabase_provider_identifier from loyalty.organization_federation_sources
    where display_name = 'Corporate OIDC'
  $$,
  'enabled login resolution returns only the opaque provider identifier'
);
select is_empty(
  $$ select * from loyalty.resolve_organization_federation_login_v1('unknown-tenant') $$,
  'an unknown tenant slug reveals no federation state'
);
reset role;
update loyalty.organizations set status = 'suspended'
where public_id = '9b000000-0000-4000-8000-000000000100';
set local role anon;
select is_empty(
  $$ select * from loyalty.resolve_organization_federation_login_v1('federation-main') $$,
  'a suspended organization never resolves a login provider'
);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '9b000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select (loyalty.organization_federation_workspace_v1(
      '9b000000-0000-4000-8000-000000000100'
    ) ->> 'mayConfigure')::boolean
  $$,
  array[false],
  'suspension preserves owner review but disables new configuration'
);
reset role;
update loyalty.organizations set status = 'active'
where public_id = '9b000000-0000-4000-8000-000000000100';
set local role loyalty_runtime;
select results_eq(
  $$
    select outcome from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      2, 'enable', null, 'Enable the approved corporate source.',
      'federation:enable:begin', '9b000000-0000-4000-8000-000000000612'
    )
  $$,
  array['duplicate'::text],
  'an exact begin retry returns the current completed source'
);
select throws_ok(
  $$
    select * from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      2, 'enable', null, 'Changed enablement reason text.',
      'federation:enable:begin', '9b000000-0000-4000-8000-000000000612'
    )
  $$,
  '23514', 'federation command idempotency conflict',
  'changed begin retry fails closed even after completion'
);
reset role;

-- 53-60: disablement hides login before external reconciliation.
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000002',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      4, 'disable', null, 'Administrator requested disablement.',
      'federation:disable:admin', '9b000000-0000-4000-8000-000000000614'
    )
  $$,
  '42501', 'federation lifecycle command not authorized',
  'only an owner can disable federation during recovery'
);
select results_eq(
  $$
    select outcome from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      4, 'disable', null, 'Disable before external reconciliation.',
      'federation:disable:begin-one', '9b000000-0000-4000-8000-000000000615'
    )
  $$,
  array['updated'::text],
  'owner disablement immediately changes database visibility'
);
reset role;
set local role anon;
select is_empty(
  $$ select * from loyalty.resolve_organization_federation_login_v1('federation-main') $$,
  'login resolution is empty before external disable completes'
);
reset role;
set local role loyalty_runtime;
select results_eq(
  $$
    select status from loyalty_private.complete_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      5, 'disable', 'ambiguous', 'authentik_timeout', null,
      'federation:disable:complete-one', '9b000000-0000-4000-8000-000000000615'
    )
  $$,
  array['review_required'::text],
  'an ambiguous external disable enters review instead of guessing'
);
reset role;
set local role anon;
select is_empty(
  $$ select * from loyalty.resolve_organization_federation_login_v1('federation-main') $$,
  'review-required federation remains hidden from login discovery'
);
reset role;
set local role loyalty_runtime;
select results_eq(
  $$
    select outcome from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      6, 'disable', null, 'Retry the reviewed external disable.',
      'federation:disable:begin-two', '9b000000-0000-4000-8000-000000000617'
    )
  $$,
  array['updated'::text],
  'reviewed disablement can be retried explicitly'
);
select results_eq(
  $$
    select outcome from loyalty_private.complete_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      7, 'disable', 'succeeded', 'disabled', null,
      'federation:disable:complete-two', '9b000000-0000-4000-8000-000000000617'
    )
  $$,
  array['updated'::text],
  'confirmed retry completes the external disable exactly once'
);
reset role;
select results_eq(
  $$
    select status, external_outcome, lifecycle_revision
    from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'
  $$,
  $$ values ('disabled'::text, 'succeeded'::text, 8::bigint) $$,
  'completed disablement preserves an exact reconciled state'
);

-- 61-68: disabled-only rotation and retirement.
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate SAML'),
      1, 'rotate_secret', repeat('f', 64), 'Invalid SAML secret rotation.',
      'federation:rotate:saml', '9b000000-0000-4000-8000-000000000619'
    )
  $$,
  '40001', 'federation lifecycle revision conflict',
  'SAML cannot enter the upstream client-secret rotation path'
);
select results_eq(
  $$
    select outcome from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      8, 'rotate_secret', repeat('f', 64), 'Rotate the disabled upstream secret.',
      'federation:rotate:begin', '9b000000-0000-4000-8000-000000000620'
    )
  $$,
  array['updated'::text],
  'disabled OIDC secret rotation begins with a fingerprint only'
);
reset role;
select results_eq(
  $$
    select octet_length(pending_upstream_secret_sha256)::bigint,
      encode(upstream_secret_sha256, 'hex') = repeat('a', 64)
    from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'
  $$,
  $$ values (32::bigint, true) $$,
  'pending rotation does not overwrite the confirmed secret fingerprint'
);
set local role loyalty_runtime;
select results_eq(
  $$
    select outcome from loyalty_private.complete_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      9, 'rotate_secret', 'succeeded', 'rotated', repeat('4', 64),
      'federation:rotate:complete', '9b000000-0000-4000-8000-000000000620'
    )
  $$,
  array['updated'::text],
  'confirmed rotation updates both external secret fingerprints'
);
reset role;
select results_eq(
  $$
    select encode(upstream_secret_sha256, 'hex'), encode(broker_secret_sha256, 'hex'),
      status, lifecycle_revision
    from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'
  $$,
  $$ values (repeat('f', 64), repeat('4', 64), 'disabled'::text, 10::bigint) $$,
  'confirmed fingerprints replace old material without storing plaintext'
);
set local role loyalty_runtime;
select results_eq(
  $$
    select outcome from loyalty_private.begin_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000100',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      10, 'retire', null, 'Retire the disabled federation source.',
      'federation:retire:begin', '9b000000-0000-4000-8000-000000000622'
    )
  $$,
  array['updated'::text],
  'retirement begins only from a non-enabled source'
);
select results_eq(
  $$
    select outcome from loyalty_private.complete_organization_federation_action_v1(
      '9b000000-0000-4000-8000-000000000001',
      (select public_id from loyalty.organization_federation_sources where display_name = 'Corporate OIDC'),
      11, 'retire', 'succeeded', 'retired', null,
      'federation:retire:complete', '9b000000-0000-4000-8000-000000000622'
    )
  $$,
  array['updated'::text],
  'confirmed retirement creates one terminal revision'
);
reset role;
select results_eq(
  $$
    select status, lifecycle_revision from loyalty.organization_federation_sources
    where display_name = 'Corporate OIDC'
  $$,
  $$ values ('retired'::text, 12::bigint) $$,
  'retired source is terminal and retained for evidence'
);

-- 69-76: history, no authority/value effects, guards, and revocation.
select results_eq(
  $$
    select count(*)::bigint, min(revision), max(revision), count(distinct revision)::bigint
    from loyalty.organization_federation_source_revisions as revision
    join loyalty.organization_federation_sources as source on source.id = revision.source_id
    where source.display_name = 'Corporate OIDC'
  $$,
  $$ values (12::bigint, 1::bigint, 12::bigint, 12::bigint) $$,
  'every OIDC transition has one contiguous immutable revision'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.organization_memberships
  $$,
  $$ select memberships from federation_test_baseline $$,
  'federation configuration creates no membership'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.ledger_transactions
  $$,
  $$ select ledger_transactions from federation_test_baseline $$,
  'federation configuration creates no ledger effect'
);
select set_config('loyalty.federation_command', 'off', true);
set local role loyalty_owner;
select throws_ok(
  $$
    update loyalty.organization_federation_sources
    set status = 'enabled'
    where display_name = 'Corporate SAML'
  $$,
  '55000', 'federation source mutations require an exact command',
  'even the owner role cannot bypass the current-state command guard'
);
select throws_ok(
  $$
    update loyalty.organization_federation_source_revisions
    set status = 'enabled'
    where id = (select min(id) from loyalty.organization_federation_source_revisions)
  $$,
  '55000', 'immutable history cannot be updated or deleted',
  'federation revision history rejects rewriting'
);
reset role;
select set_config('loyalty.identity_command', 'on', true);
update loyalty.organization_memberships
set revoked_at = transaction_timestamp()
where public_id = '9b000000-0000-4000-8000-000000000102';
select set_config('loyalty.identity_command', 'off', true);
set local role loyalty_runtime;
select throws_ok(
  $$
    select * from loyalty_private.prepare_organization_federation_source_v1(
      '9b000000-0000-4000-8000-000000000002',
      '9b000000-0000-4000-8000-000000000100',
      'Revoked admin source', 'saml', null, null,
      'https://revoked.example.test/metadata', null, null,
      'federation:create:revoked', '9b000000-0000-4000-8000-000000000624'
    )
  $$,
  '42501', 'federation source command not authorized',
  'revoked administrator authority fails on the next runtime request'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint from loyalty.admin_audit_events
    where resource_type = 'organization_federation_source'
      and metadata::text ~* '(upstreamSecret|brokerSecret|clientSecret|password|email|domain|group|claims)'
  $$,
  array[0::bigint],
  'federation audit metadata contains no secret or identity claim field'
);
set local role anon;
select is_empty(
  $$ select * from loyalty.resolve_organization_federation_login_v1('federation-main') $$,
  'retired federation remains absent from public login resolution'
);
reset role;

select * from finish();
rollback;
