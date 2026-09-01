begin;

create extension if not exists pgtap with schema extensions;

select plan(61);

-- 1-14: schema, grants, RLS, and minimized authority.
select has_table(
  'loyalty_private', 'managed_billing_account_versions',
  'private managed billing account evidence exists'
);
select has_table(
  'loyalty_private', 'managed_billing_state_revisions',
  'private normalized billing state evidence exists'
);
select has_function(
  'loyalty_private', 'record_managed_billing_account_v1',
  array['uuid', 'text', 'boolean', 'text', 'text', 'timestamp with time zone', 'uuid'],
  'private billing account recorder exists'
);
select has_function(
  'loyalty_private', 'record_managed_billing_state_v1',
  array[
    'uuid', 'uuid', 'text', 'text', 'text', 'timestamp with time zone',
    'timestamp with time zone', 'timestamp with time zone',
    'timestamp with time zone', 'text', 'text', 'uuid'
  ],
  'private normalized state recorder exists'
);
select has_function(
  'loyalty', 'get_my_billing_summary_v1',
  array['uuid', 'timestamp with time zone'],
  'live-member minimized billing projection exists'
);
select ok(
  (
    select bool_and(relation.relrowsecurity)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'loyalty_private'
      and relation.relname in (
        'managed_billing_account_versions',
        'managed_billing_state_revisions'
      )
  ),
  'both private billing tables enable RLS'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_my_billing_summary_v1(uuid,timestamptz)',
    'EXECUTE'
  ),
  'authenticated members can request only the minimized projection'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_my_billing_summary_v1(uuid,timestamptz)', 'EXECUTE'
  ),
  'anonymous sessions cannot request billing state'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.record_managed_billing_account_v1(uuid,text,boolean,text,text,timestamptz,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'loyalty_runtime',
    'loyalty_private.record_managed_billing_account_v1(uuid,text,boolean,text,text,timestamptz,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.record_managed_billing_state_v1(uuid,uuid,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)',
    'EXECUTE'
  ),
  'browser runtime and general workers cannot record provider evidence'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'loyalty_private.managed_billing_account_versions',
    'SELECT'
  )
  and not has_table_privilege(
    'loyalty_runtime',
    'loyalty_private.managed_billing_state_revisions',
    'SELECT'
  )
  and not has_table_privilege(
    'loyalty_worker',
    'loyalty_private.managed_billing_state_revisions',
    'SELECT'
  ),
  'private provider references have no direct application grants'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname in (
        'record_managed_billing_account_v1',
        'record_managed_billing_state_v1',
        'get_my_billing_summary_v1'
      )
      and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[3::bigint],
  'all billing boundaries are security definer with an empty search path'
);
select results_eq(
  $$
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'loyalty_private'
      and table_name in (
        'managed_billing_account_versions',
        'managed_billing_state_revisions'
      )
      and column_name ~ '(card|payment_method|email|address|invoice_body|raw_body|client_secret)'
  $$,
  array[0::bigint],
  'billing storage has no card payment contact invoice-body raw-body or client-secret field'
);
select results_eq(
  $$
    select count(*)::bigint
    from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'get_my_billing_summary_v1%'
      and parameter_name in (
        'provider_customer_id', 'provider_subscription_id', 'provider_event_id',
        'user_id', 'email', 'plan', 'claims'
      )
  $$,
  array[0::bigint],
  'public billing read accepts no provider identity actor plan email or claim authority'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'loyalty_private'
      and indexname = 'managed_billing_state_revisions_current_idx'
  ),
  'event-time current-state lookup has a reviewed index'
);

insert into auth.users (id, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'billing-owner@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'billing-revoked@example.test'),
  ('a2000000-0000-4000-8000-000000000001', 'billing-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('a1000000-0000-4000-8000-000000000100', 'billing-one', 'Billing One'),
  ('a2000000-0000-4000-8000-000000000100', 'billing-two', 'Billing Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  (
    (select id from loyalty.organizations where slug = 'billing-one'),
    'a1000000-0000-4000-8000-000000000001', 'owner', null
  ),
  (
    (select id from loyalty.organizations where slug = 'billing-one'),
    'a1000000-0000-4000-8000-000000000002', 'admin', now()
  ),
  (
    (select id from loyalty.organizations where slug = 'billing-two'),
    'a2000000-0000-4000-8000-000000000001', 'owner', null
  );

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

-- 15-20: self-hosted is local, unrestricted, and provider-free.
select results_eq(
  $$
    select
      billing_summary->>'deploymentMode',
      billing_summary->>'commercialState',
      (billing_summary->>'billingAvailable')::boolean,
      (billing_summary->>'providerLinked')::boolean,
      (billing_summary->>'growthConfigurationAllowed')::boolean,
      billing_summary->>'restriction'
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2030-01-01 00:00:00+00'
    )
  $$,
  $$ values ('self_hosted'::text, 'self_hosted'::text, false, false, true, 'none'::text) $$,
  'self-hosted summary is local and commercially unrestricted'
);
select results_eq(
  $$
    select
      (billing_summary#>>'{protectedAccess,balanceRead}')::boolean,
      (billing_summary#>>'{protectedAccess,refunds}')::boolean,
      (billing_summary#>>'{protectedAccess,reconciliation}')::boolean,
      (billing_summary#>>'{protectedAccess,checkoutIndependence}')::boolean,
      (billing_summary#>>'{protectedAccess,exports}')::boolean,
      (billing_summary#>>'{protectedAccess,promisedRewardRedemption}')::boolean
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2030-01-01 00:00:00+00'
    )
  $$,
  $$ values (true, true, true, true, true, true) $$,
  'all six protected loyalty paths remain available in self-hosted mode'
);
reset role;
select results_eq(
  $$
    select
      (select count(*) from loyalty_private.managed_billing_account_versions)::bigint,
      (select count(*) from loyalty_private.managed_billing_state_revisions)::bigint
  $$,
  $$ values (0::bigint, 0::bigint) $$,
  'self-hosted reads require no private provider account or state'
);
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_billing_summary_v1(
      'a2000000-0000-4000-8000-000000000100',
      '2030-01-01 00:00:00+00'
    )
  $$,
  array[0::bigint],
  'a member cannot request another tenant billing summary'
);
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","stripe_customer_id":"cus_forged","plan":"enterprise","billing":"active"}';
select results_eq(
  $$
    select billing_summary->>'commercialState'
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2030-01-01 00:00:00+00'
    )
  $$,
  array['self_hosted'::text],
  'forged provider plan and billing claims grant nothing'
);
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2030-01-01 00:00:00+00'
    )
  $$,
  array[0::bigint],
  'revoked membership fails closed despite a valid identity token'
);

reset role;
do $$
begin
  perform loyalty_private.set_deployment_mode(
    'managed', 1, 'operator:m14', 'Begin isolated managed billing foundation test',
    '2031-01-01 00:00:00+00'
  );
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';

-- 21: managed mode starts restricted and unconfigured.
select results_eq(
  $$
    select
      billing_summary->>'commercialState',
      (billing_summary->>'billingAvailable')::boolean,
      (billing_summary->>'providerLinked')::boolean,
      (billing_summary->>'subscriptionPresent')::boolean,
      (billing_summary->>'growthConfigurationAllowed')::boolean,
      billing_summary->>'restriction'
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-01 12:00:00+00'
    )
  $$,
  $$ values ('unconfigured'::text, true, false, false, false, 'new_growth_only'::text) $$,
  'managed mode is restricted until private provider evidence exists'
);

reset role;
create temporary table billing_test_refs (
  account_public_id uuid,
  active_state_public_id uuid
) on commit drop;
insert into billing_test_refs (account_public_id)
select loyalty_private.record_managed_billing_account_v1(
  'a1000000-0000-4000-8000-000000000100',
  'cus_BillingCustomer0001', false, 'operator:m14',
  'Create isolated managed billing account evidence',
  '2031-01-01 01:00:00+00',
  'a1000000-0000-4000-8000-000000000501'
);

-- 22-28: private account evidence is exact and never public.
select ok(
  (select account_public_id is not null from billing_test_refs),
  'managed account recorder returns one public selector'
);
select results_eq(
  $$
    select loyalty_private.record_managed_billing_account_v1(
      'a1000000-0000-4000-8000-000000000100',
      'cus_BillingCustomer0001', false, 'operator:m14',
      'Create isolated managed billing account evidence',
      '2031-01-01 01:00:00+00',
      'a1000000-0000-4000-8000-000000000501'
    )
  $$,
  $$ select account_public_id from billing_test_refs $$,
  'exact managed account retry returns the original effect'
);
select results_eq(
  $$
    select loyalty_private.record_managed_billing_account_v1(
      'a1000000-0000-4000-8000-000000000100',
      'cus_BillingCustomer0001', false, 'operator:m14',
      'Create isolated managed billing account evidence',
      '2031-01-01 01:00:00+00',
      'a1000000-0000-4000-8000-000000000599'
    )
  $$,
  $$ select account_public_id from billing_test_refs $$,
  'provider account replay with a different request key returns the original effect'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.managed_billing_account_versions $$,
  array[1::bigint],
  'exact account retry stores one immutable version'
);
select throws_ok(
  $$
    select loyalty_private.record_managed_billing_account_v1(
      'a1000000-0000-4000-8000-000000000100',
      'cus_BillingCustomerChanged', false, 'operator:m14',
      'Create isolated managed billing account evidence',
      '2031-01-01 01:00:00+00',
      'a1000000-0000-4000-8000-000000000501'
    )
  $$,
  '23505', 'managed billing account idempotency conflict',
  'changed account retry fails closed'
);
select throws_ok(
  $$
    select loyalty_private.record_managed_billing_account_v1(
      'a1000000-0000-4000-8000-000000000100',
      'cus_BillingCustomer0001', false, 'operator:m14',
      'Attempt a changed provider customer replay',
      '2031-01-01 01:00:00+00',
      'a1000000-0000-4000-8000-000000000598'
    )
  $$,
  '23505', 'managed billing provider account conflict',
  'changed provider account replay with a different request key fails closed'
);
select throws_ok(
  $$
    select loyalty_private.record_managed_billing_account_v1(
      'a3000000-0000-4000-8000-000000000100',
      'cus_BillingUnknown0001', false, 'operator:m14',
      'Reject unknown organization billing evidence',
      '2031-01-01 01:00:00+00',
      'a1000000-0000-4000-8000-000000000502'
    )
  $$,
  '22023', 'invalid managed billing account request',
  'unknown organization cannot receive billing evidence'
);
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select
      billing_summary->>'commercialState',
      (billing_summary->>'providerLinked')::boolean,
      (billing_summary->>'subscriptionPresent')::boolean
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-01 12:00:00+00'
    )
  $$,
  $$ values ('unconfigured'::text, true, false) $$,
  'private customer linkage exposes only a provider-linked boolean'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-01 12:00:00+00'
    )
    where billing_summary::text ~ '(cus_|sub_|evt_|providerCustomer|providerSubscription|providerEvent)'
  $$,
  array[0::bigint],
  'public summary contains no provider identifier or identifier-shaped key'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_billing_summary_v1(
      'a2000000-0000-4000-8000-000000000100',
      '2031-01-01 12:00:00+00'
    )
  $$,
  array[0::bigint],
  'provider linkage does not broaden cross-tenant reads'
);

reset role;
update billing_test_refs
set active_state_public_id = loyalty_private.record_managed_billing_state_v1(
  'a1000000-0000-4000-8000-000000000100',
  account_public_id,
  'sub_BillingSubscription0001', 'evt_BillingActive0001', 'active',
  '2031-01-03 00:00:00+00', '2031-02-01 00:00:00+00', null, null,
  'worker:billing', 'Record normalized active subscription evidence',
  'a1000000-0000-4000-8000-000000000601'
);

-- 29-34: normalized state is exact, attributable, and protected.
select ok(
  (select active_state_public_id is not null from billing_test_refs),
  'active state recorder returns one public evidence selector'
);
select results_eq(
  $$
    select loyalty_private.record_managed_billing_state_v1(
      'a1000000-0000-4000-8000-000000000100',
      account_public_id,
      'sub_BillingSubscription0001', 'evt_BillingActive0001', 'active',
      '2031-01-03 00:00:00+00', '2031-02-01 00:00:00+00', null, null,
      'worker:billing', 'Record normalized active subscription evidence',
      'a1000000-0000-4000-8000-000000000601'
    ) from billing_test_refs
  $$,
  $$ select active_state_public_id from billing_test_refs $$,
  'exact state retry returns the original normalized effect'
);
select results_eq(
  $$
    select loyalty_private.record_managed_billing_state_v1(
      'a1000000-0000-4000-8000-000000000100',
      account_public_id,
      'sub_BillingSubscription0001', 'evt_BillingActive0001', 'active',
      '2031-01-03 00:00:00+00', '2031-02-01 00:00:00+00', null, null,
      'worker:billing', 'Record normalized active subscription evidence',
      'a1000000-0000-4000-8000-000000000699'
    ) from billing_test_refs
  $$,
  $$ select active_state_public_id from billing_test_refs $$,
  'provider event replay with a different request key returns the original effect'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.managed_billing_state_revisions $$,
  array[1::bigint],
  'exact state retry stores one revision'
);
select throws_ok(
  $$
    select loyalty_private.record_managed_billing_state_v1(
      'a1000000-0000-4000-8000-000000000100',
      account_public_id,
      'sub_BillingSubscription0001', 'evt_BillingActive0001', 'suspended',
      '2031-01-03 00:00:00+00', '2031-02-01 00:00:00+00', null, null,
      'worker:billing', 'Record normalized active subscription evidence',
      'a1000000-0000-4000-8000-000000000601'
    ) from billing_test_refs
  $$,
  '23505', 'managed billing state idempotency conflict',
  'changed normalized-state retry fails closed'
);
select throws_ok(
  $$
    select loyalty_private.record_managed_billing_state_v1(
      'a1000000-0000-4000-8000-000000000100',
      account_public_id,
      'sub_BillingSubscription0001', 'evt_BillingActive0001', 'suspended',
      '2031-01-03 00:00:00+00', '2031-02-01 00:00:00+00', null, null,
      'worker:billing', 'Record normalized active subscription evidence',
      'a1000000-0000-4000-8000-000000000698'
    ) from billing_test_refs
  $$,
  '23505', 'managed billing provider event conflict',
  'changed provider event replay with a different request key fails closed'
);
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select
      billing_summary->>'commercialState',
      (billing_summary->>'subscriptionPresent')::boolean,
      (billing_summary->>'growthConfigurationAllowed')::boolean,
      billing_summary->>'restriction'
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-04 00:00:00+00'
    )
  $$,
  $$ values ('active'::text, true, true, 'none'::text) $$,
  'active normalized state permits new managed configuration'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-04 00:00:00+00'
    )
    where (billing_summary#>>'{protectedAccess,balanceRead}')::boolean
      and (billing_summary#>>'{protectedAccess,refunds}')::boolean
      and (billing_summary#>>'{protectedAccess,reconciliation}')::boolean
      and (billing_summary#>>'{protectedAccess,checkoutIndependence}')::boolean
      and (billing_summary#>>'{protectedAccess,exports}')::boolean
      and (billing_summary#>>'{protectedAccess,promisedRewardRedemption}')::boolean
  $$,
  array[1::bigint],
  'active commercial state preserves every protected path'
);

reset role;
select ok(
  loyalty_private.record_managed_billing_state_v1(
    'a1000000-0000-4000-8000-000000000100',
    (select account_public_id from billing_test_refs),
    'sub_BillingSubscription0001', 'evt_BillingOlderPastDue', 'past_due',
    '2031-01-02 00:00:00+00', '2031-02-01 00:00:00+00', null,
    '2031-01-08 00:00:00+00',
    'worker:billing', 'Retain delayed older provider state evidence',
    'a1000000-0000-4000-8000-000000000602'
  ) is not null,
  'late older provider state is retained as immutable evidence'
);

-- 36-42: provider event time, not delivery order, determines current state.
select results_eq(
  $$ select count(*)::bigint from loyalty_private.managed_billing_state_revisions $$,
  array[2::bigint],
  'older delayed event appends without replacing history'
);
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select billing_summary->>'commercialState'
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-04 00:00:00+00'
    )
  $$,
  array['active'::text],
  'late older delivery cannot regress the newer active state'
);
reset role;
select ok(
  loyalty_private.record_managed_billing_state_v1(
    'a1000000-0000-4000-8000-000000000100',
    (select account_public_id from billing_test_refs),
    'sub_BillingSubscription0001', 'evt_BillingPastDue0002', 'past_due',
    '2031-01-05 00:00:00+00', '2031-02-01 00:00:00+00', null,
    '2031-01-10 00:00:00+00',
    'worker:billing', 'Record approved past-due grace evidence',
    'a1000000-0000-4000-8000-000000000603'
  ) is not null,
  'newer past-due event with grace appends once'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.managed_billing_state_revisions $$,
  array[3::bigint],
  'three normalized provider revisions remain attributable'
);
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select
      billing_summary->>'commercialState',
      (billing_summary->>'growthConfigurationAllowed')::boolean,
      billing_summary->>'restriction'
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-06 00:00:00+00'
    )
  $$,
  $$ values ('grace'::text, true, 'none'::text) $$,
  'past-due subscription remains unrestricted inside approved grace'
);
select results_eq(
  $$
    select
      billing_summary->>'commercialState',
      (billing_summary->>'growthConfigurationAllowed')::boolean,
      billing_summary->>'restriction'
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-11 00:00:00+00'
    )
  $$,
  $$ values ('suspended'::text, false, 'new_growth_only'::text) $$,
  'expired grace restricts only new managed growth'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-11 00:00:00+00'
    )
    where billing_summary::text ~ '(cus_|sub_|evt_)'
  $$,
  array[0::bigint],
  'grace and suspension projections retain no provider identifier'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_billing_summary_v1(
      'a2000000-0000-4000-8000-000000000100',
      '2031-01-11 00:00:00+00'
    )
  $$,
  array[0::bigint],
  'commercial state never crosses tenant boundaries'
);

-- 43-45: claims and revocation remain non-authoritative in managed mode.
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","plan":"free","billing":"cancelled"}';
select results_eq(
  $$
    select billing_summary->>'commercialState'
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-06 00:00:00+00'
    )
  $$,
  array['grace'::text],
  'forged downgrade claims cannot change database commercial state'
);
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000002';
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-06 00:00:00+00'
    )
  $$,
  array[0::bigint],
  'revoked member cannot inspect managed commercial state'
);
reset role;
select ok(
  loyalty_private.record_managed_billing_state_v1(
    'a1000000-0000-4000-8000-000000000100',
    (select account_public_id from billing_test_refs),
    'sub_BillingSubscription0001', 'evt_BillingCancelled01', 'cancelled',
    '2031-01-12 00:00:00+00', null, null, null,
    'worker:billing', 'Record normalized subscription cancellation',
    'a1000000-0000-4000-8000-000000000604'
  ) is not null,
  'newer cancellation appends without rewriting earlier states'
);

-- 46-53: cancellation, protected paths, immutability, and validation.
set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$
    select
      billing_summary->>'commercialState',
      (billing_summary->>'growthConfigurationAllowed')::boolean,
      billing_summary->>'restriction'
    from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100',
      '2031-01-13 00:00:00+00'
    )
  $$,
  $$ values ('cancelled'::text, false, 'new_growth_only'::text) $$,
  'cancelled state restricts only new managed growth'
);
reset role;
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.entitlement_catalogue as item
    cross join lateral loyalty_private.resolve_organization_entitlement(
      (select id from loyalty.organizations where slug = 'billing-one'),
      item.capability_key,
      'billing-protected-check',
      '2031-01-13 00:00:00+00'
    ) as resolved
    where item.catalogue_version = 1
      and item.protected_value_path
      and resolved.enabled
  $$,
  array[6::bigint],
  'all six protected entitlements remain enabled after cancellation'
);
select throws_ok(
  $$ update loyalty_private.managed_billing_account_versions set live_mode = true $$,
  '55000', 'immutable loyalty history cannot be changed',
  'billing account versions are immutable'
);
select throws_ok(
  $$ delete from loyalty_private.managed_billing_state_revisions $$,
  '55000', 'immutable loyalty history cannot be changed',
  'normalized billing state history is immutable'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty.ledger_transactions
    where organization_id = (
      select id from loyalty.organizations where slug = 'billing-one'
    )
  $$,
  array[0::bigint],
  'billing account and lifecycle evidence creates no loyalty ledger effect'
);
select throws_ok(
  $$
    select loyalty_private.record_managed_billing_state_v1(
      'a1000000-0000-4000-8000-000000000100',
      (select account_public_id from billing_test_refs),
      'sub_BillingSubscription0001', 'evt_BillingTrialInvalid', 'trialing',
      '2031-01-14 00:00:00+00', '2031-02-01 00:00:00+00', null, null,
      'worker:billing', 'Reject trial state without a deadline',
      'a1000000-0000-4000-8000-000000000605'
    )
  $$,
  '22023', 'invalid managed billing state request',
  'trialing state without a future deadline fails closed'
);
select throws_ok(
  $$
    select loyalty_private.record_managed_billing_state_v1(
      'a1000000-0000-4000-8000-000000000100',
      (select account_public_id from billing_test_refs),
      'sub_BillingSubscription0001', 'evt_BillingGraceInvalid', 'active',
      '2031-01-14 00:00:00+00', '2031-02-01 00:00:00+00', null,
      '2031-01-20 00:00:00+00',
      'worker:billing', 'Reject grace evidence outside past due',
      'a1000000-0000-4000-8000-000000000606'
    )
  $$,
  '22023', 'invalid managed billing state request',
  'grace deadline outside past-due state fails closed'
);
select throws_ok(
  $$
    select * from loyalty.get_my_billing_summary_v1(
      'a1000000-0000-4000-8000-000000000100', null
    )
  $$,
  '22023', 'billing evaluation time is required',
  'a missing evaluation time fails closed'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.managed_billing_account_versions
    where provider = 'stripe'
      and provider_customer_id = 'cus_BillingCustomer0001'
      and live_mode = false
      and length(actor_reference) >= 3
      and length(reason) >= 8
  $$,
  array[1::bigint],
  'private provider customer reference is unique attributable and sandbox-bound'
);
select results_eq(
  $$
    select count(*)::bigint
    from loyalty_private.managed_billing_state_revisions
    where provider_subscription_id = 'sub_BillingSubscription0001'
      and length(actor_reference) >= 3
      and length(reason) >= 8
  $$,
  array[4::bigint],
  'all accepted normalized state revisions remain attributable'
);

select * from finish();
rollback;
