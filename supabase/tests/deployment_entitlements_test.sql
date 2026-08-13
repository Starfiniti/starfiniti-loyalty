begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

select has_table('loyalty', 'entitlement_catalogue', 'catalogue exists');
select has_table('loyalty', 'organization_entitlements', 'tenant evidence exists');
select has_table('loyalty_private', 'deployment_configuration_versions', 'deployment history exists');
select has_table('loyalty_private', 'capability_rollout_versions', 'rollout history exists');
select has_table('loyalty_private', 'entitlement_provider_price_versions', 'private provider mapping exists');
select has_function(
  'loyalty', 'get_my_entitlements_v1', array['uuid', 'timestamp with time zone'],
  'tenant read boundary exists'
);
select has_function(
  'loyalty_private', 'resolve_organization_entitlement',
  array['bigint', 'text', 'text', 'timestamp with time zone'],
  'server decision boundary exists'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_my_entitlements_v1(uuid,timestamptz)', 'EXECUTE'
  ),
  'authenticated users can request their minimized snapshot'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.set_organization_entitlement(uuid,text,text,bigint,text,text,text,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'browser users cannot grant entitlements'
);
select ok(
  not has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.set_organization_entitlement(uuid,text,text,bigint,text,text,text,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'application runtime cannot grant entitlements'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.resolve_organization_entitlement(bigint,text,text,timestamptz)',
    'EXECUTE'
  ),
  'worker can make the same database-authoritative decision'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.organization_entitlements', 'INSERT'),
  'browser cannot insert tenant evidence'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.entitlement_provider_price_versions', 'SELECT'
  ),
  'provider price IDs stay outside the browser'
);
select ok(
  not has_schema_privilege('authenticated', 'loyalty_private', 'USAGE'),
  'private configuration schema remains unexposed'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.entitlement_catalogue $$,
  array[18::bigint],
  'catalogue v1 contains every locked M02 capability'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.entitlement_catalogue where protected_value_path $$,
  array[6::bigint],
  'six value-preservation paths are structural protections'
);

insert into auth.users (id, email)
values
  ('82000000-0000-4000-8000-000000000001', 'entitlement-one@example.test'),
  ('82000000-0000-4000-8000-000000000002', 'entitlement-revoked@example.test'),
  ('83000000-0000-4000-8000-000000000001', 'entitlement-two@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('82000000-0000-4000-8000-000000000100', 'entitlement-one', 'Entitlement One'),
  ('83000000-0000-4000-8000-000000000100', 'entitlement-two', 'Entitlement Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'entitlement-one'), '82000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'entitlement-one'), '82000000-0000-4000-8000-000000000002', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'entitlement-two'), '83000000-0000-4000-8000-000000000001', 'owner', null);

select results_eq(
  $$
    select enabled
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-one'),
      'programme.v2', 'stable-one', '2026-08-13 12:00:00+00'
    )
  $$,
  array[true],
  'self-hosted capabilities default locally enabled'
);
select results_eq(
  $$
    select enabled
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-one'),
      'managed.billing', 'stable-one', '2026-08-13 12:00:00+00'
    )
  $$,
  array[false],
  'self-hosted mode never enables managed billing by default'
);
select results_eq(
  $$
    select enabled, source
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-one'),
      'core.refund', 'stable-one', '2026-08-13 12:00:00+00'
    )
  $$,
  $$ values (true, 'protected_value_path'::text) $$,
  'refund processing is independent from commercial access'
);
select results_eq(
  $$
    select loyalty_private.entitlement_rollout_bucket(
      '82000000-0000-4000-8000-000000000500', 'stable-one'
    ) = loyalty_private.entitlement_rollout_bucket(
      '82000000-0000-4000-8000-000000000500', 'stable-one'
    )
  $$,
  array[true],
  'rollout bucket is deterministic for a stable subject and seed'
);
select ok(
  loyalty_private.entitlement_rollout_bucket(
    '82000000-0000-4000-8000-000000000500', 'stable-one'
  ) between 0 and 9999,
  'rollout bucket is bounded to basis points'
);

do $$ begin
  perform loyalty_private.set_organization_entitlement(
    '82000000-0000-4000-8000-000000000100', 'analytics', 'disabled', null,
    'local_control', 'operator:test', 'Local operator disabled analytics',
    '2026-08-13 06:00:00+00', null
  );
end $$;
select results_eq(
  $$
    select enabled, source
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-one'),
      'analytics', 'stable-one', '2026-08-13 12:00:00+00'
    )
  $$,
  $$ values (false, 'tenant_override'::text) $$,
  'local self-hosted operator can explicitly disable a growth capability'
);
select throws_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '82000000-0000-4000-8000-000000000100', 'core.balance_read', 'disabled', null,
    'local_control', 'operator:test', 'Attempt to disable protected access',
    '2026-08-13 07:00:00+00', null
  ) $$,
  '22023', 'protected value path cannot be disabled',
  'protected balance access cannot be disabled even by deployment administration'
);

do $$ begin
  perform loyalty_private.set_deployment_mode(
    'managed', 1, 'operator:test', 'Begin managed deployment test window',
    '2026-08-14 00:00:00+00'
  );
  perform loyalty_private.set_capability_rollout(
    'programme.v2', 0, '82000000-0000-4000-8000-000000000500',
    'operator:test', 'Deploy disabled before the managed canary',
    '2026-08-14 00:00:00+00', '2026-08-15 00:00:00+00'
  );
  perform loyalty_private.set_capability_rollout(
    'programme.v2', 10000, '82000000-0000-4000-8000-000000000500',
    'operator:test', 'Expand managed rollout after canary evidence',
    '2026-08-15 00:00:00+00', null
  );
  perform loyalty_private.set_organization_entitlement(
    '82000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', 9007199254740993,
    'canary', 'operator:test', 'Enable the approved Starfiniti tenant canary',
    '2026-08-14 00:00:00+00', null
  );
  perform loyalty_private.set_entitlement_provider_price(
    'programme.v2', 'stripe', 'price_external_test_reference',
    'operator:test', 'Attach externally configured managed catalogue reference',
    '2026-08-14 00:00:00+00', null
  );
end $$;

select results_eq(
  $$
    select deployment_mode, enabled, limit_value, source
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-one'),
      'programme.v2', 'stable-one', '2026-08-14 12:00:00+00'
    )
  $$,
  $$ values ('managed'::text, true, 9007199254740993::bigint, 'tenant_override'::text) $$,
  'managed canary is tenant-specific and preserves an exact bigint limit'
);
select results_eq(
  $$
    select enabled, rollout_basis_points, source
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-two'),
      'programme.v2', 'stable-two', '2026-08-14 12:00:00+00'
    )
  $$,
  $$ values (false, 0, 'percentage_rollout'::text) $$,
  'managed non-canary stays disabled at zero-percent rollout'
);
select results_eq(
  $$
    select enabled, rollout_basis_points, source
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-two'),
      'programme.v2', 'stable-two', '2026-08-15 12:00:00+00'
    )
  $$,
  $$ values (true, 10000, 'percentage_rollout'::text) $$,
  'managed rollout reaches every tenant at one hundred percent'
);
select results_eq(
  $$
    select enabled
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-two'),
      'analytics', 'stable-two', '2026-08-14 12:00:00+00'
    )
  $$,
  array[false],
  'provider configuration does not grant an unrelated managed capability'
);
select results_eq(
  $$
    select enabled
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-two'),
      'core.reconciliation', 'stable-two', '2026-08-14 12:00:00+00'
    )
  $$,
  array[true],
  'managed mode still permits reconciliation'
);
select results_eq(
  $$
    select enabled
    from loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'entitlement-two'),
      'core.checkout_independence', 'stable-two', '2026-08-14 12:00:00+00'
    )
  $$,
  array[true],
  'managed mode cannot interrupt checkout independence'
);
select throws_ok(
  $$ select loyalty_private.set_capability_rollout(
    'core.export', 9999, '82000000-0000-4000-8000-000000000500',
    'operator:test', 'Attempt to reduce protected export availability',
    '2026-08-14 00:00:00+00', null
  ) $$,
  '22023', 'protected value path cannot be rolled back',
  'percentage rollout cannot reduce protected paths'
);

set local role authenticated;
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000001';

select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_entitlements_v1(
      '82000000-0000-4000-8000-000000000100', '2026-08-14 12:00:00+00'
    )
  $$,
  array[18::bigint],
  'active member receives the complete effective catalogue'
);
select results_eq(
  $$
    select deployment_mode, enabled, limit_value, source
    from loyalty.get_my_entitlements_v1(
      '82000000-0000-4000-8000-000000000100', '2026-08-14 12:00:00+00'
    ) where capability_key = 'programme.v2'
  $$,
  $$ values ('managed'::text, true, '9007199254740993'::text, 'tenant_override'::text) $$,
  'public read model is minimized and keeps bigint limits as text'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.organization_entitlements $$,
  array[2::bigint],
  'RLS exposes only the current tenant entitlement history'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_entitlements_v1(
      '83000000-0000-4000-8000-000000000100', '2026-08-14 12:00:00+00'
    )
  $$,
  array[0::bigint],
  'active member cannot request another tenant snapshot'
);

set local request.jwt.claims = '{"sub":"82000000-0000-4000-8000-000000000001","entitlements":["managed.billing"],"plan":"enterprise"}';
select results_eq(
  $$
    select enabled
    from loyalty.get_my_entitlements_v1(
      '82000000-0000-4000-8000-000000000100', '2026-08-14 12:00:00+00'
    ) where capability_key = 'managed.billing'
  $$,
  array[false],
  'forged entitlement and plan claims grant nothing'
);

set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000002';
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_entitlements_v1(
      '82000000-0000-4000-8000-000000000100', '2026-08-14 12:00:00+00'
    )
  $$,
  array[0::bigint],
  'revoked member fails closed despite a valid identity token'
);

set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_entitlements_v1(
      '83000000-0000-4000-8000-000000000100', '2026-08-14 12:00:00+00'
    )
  $$,
  array[18::bigint],
  'second tenant owner receives only its effective snapshot'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.organization_entitlements $$,
  array[0::bigint],
  'second tenant cannot inspect first tenant overrides'
);
select throws_ok(
  $$ insert into loyalty.organization_entitlements (
    organization_id, catalogue_version, capability_key, state, source,
    actor_reference, reason, effective_from
  ) values (
    (select id from loyalty.organizations where slug = 'entitlement-two'),
    1, 'analytics', 'enabled', 'canary', 'browser:forged',
    'Browser attempted to grant its own capability', now()
  ) $$,
  '42501', 'permission denied for table organization_entitlements',
  'authenticated owner cannot bypass the deployment command boundary'
);

reset role;
select throws_ok(
  $$ update loyalty.organization_entitlements set state = 'enabled' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'tenant entitlement evidence is immutable'
);
select throws_ok(
  $$ delete from loyalty_private.deployment_configuration_versions $$,
  '55000', 'immutable loyalty history cannot be changed',
  'deployment mode history is immutable'
);
select throws_ok(
  $$ update loyalty_private.capability_rollout_versions set basis_points = 1 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'rollout history is immutable'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.entitlement_provider_price_versions
    where provider = 'stripe' and provider_price_id = 'price_external_test_reference'
  $$,
  array[1::bigint],
  'external price reference is stored once in private append-only evidence'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.deployment_configuration_versions
    where deployment_mode = 'managed'
      and length(actor_reference) >= 3 and length(reason) >= 8
  $$,
  array[1::bigint],
  'managed mode transition is attributable and explained'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.capability_rollout_versions
    where capability_key = 'programme.v2'
  $$,
  array[2::bigint],
  'rollout expansion retains both disabled and enabled history'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.organization_entitlements
    where source = 'canary' and state = 'enabled'
  $$,
  array[1::bigint],
  'tenant canary is explicit append-only evidence'
);

select * from finish();
rollback;
