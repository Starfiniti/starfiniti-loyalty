begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select has_function(
  'loyalty', 'get_customer_tier_read_model', array['uuid', 'uuid'],
  'customer tier read model exists'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_customer_tier_read_model(uuid,uuid)', 'EXECUTE'
  ),
  'authenticated users can enter the guarded tier read model'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_customer_tier_read_model(uuid,uuid)', 'EXECUTE'
  ),
  'anonymous clients cannot read customer tier state'
);
select results_eq(
  $$
    select routine.prosecdef
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'get_customer_tier_read_model'
  $$,
  array[true],
  'tier read model is a security definer boundary'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty'
      and routine.proname = 'get_customer_tier_read_model'
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting like 'search_path=%'
      )
  $$,
  array[1::bigint],
  'tier read model fixes an empty search path'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    cross join unnest(routine.proargnames) as output_name
    where namespace.nspname = 'loyalty'
      and routine.proname = 'get_customer_tier_read_model'
      and output_name in (
        'explanation', 'request_sha256', 'idempotency_key', 'actor_user_id'
      )
  $$,
  array[0::bigint],
  'private decision and actor evidence is absent from the result contract'
);
select throws_ok(
  $$ select * from loyalty.get_customer_tier_read_model(
    null, '75000000-0000-4000-8000-000000000110'
  ) $$,
  '22023', 'invalid customer tier request',
  'a null customer selector is rejected explicitly'
);
select throws_ok(
  $$ select * from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201', null
  ) $$,
  '22023', 'invalid customer tier request',
  'a null programme-group selector is rejected explicitly'
);

insert into auth.users (id, email)
values
  ('75000000-0000-4000-8000-000000000001', 'tier-owner@example.test'),
  ('75000000-0000-4000-8000-000000000002', 'tier-analyst@example.test'),
  ('75000000-0000-4000-8000-000000000003', 'tier-revoked@example.test'),
  ('76000000-0000-4000-8000-000000000001', 'other-tier-owner@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('75000000-0000-4000-8000-000000000100', 'tier-read-one', 'Tier Read One'),
  ('76000000-0000-4000-8000-000000000100', 'tier-read-two', 'Tier Read Two');

insert into loyalty.organization_memberships (
  organization_id, user_id, role, revoked_at
)
values
  ((select id from loyalty.organizations where slug = 'tier-read-one'), '75000000-0000-4000-8000-000000000001', 'owner', null),
  ((select id from loyalty.organizations where slug = 'tier-read-one'), '75000000-0000-4000-8000-000000000002', 'analyst', null),
  ((select id from loyalty.organizations where slug = 'tier-read-one'), '75000000-0000-4000-8000-000000000003', 'admin', now()),
  ((select id from loyalty.organizations where slug = 'tier-read-two'), '76000000-0000-4000-8000-000000000001', 'owner', null);

insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select
  case organization.slug
    when 'tier-read-one' then '75000000-0000-4000-8000-000000000110'::uuid
    else '76000000-0000-4000-8000-000000000110'::uuid
  end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization;

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select
  case organization.slug
    when 'tier-read-one' then '75000000-0000-4000-8000-000000000120'::uuid
    else '76000000-0000-4000-8000-000000000120'::uuid
  end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id;

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select
  case organization.slug
    when 'tier-read-one' then '75000000-0000-4000-8000-000000000130'::uuid
    else '76000000-0000-4000-8000-000000000130'::uuid
  end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to(organization.slug, 'UTF8'), 'sha256'),
  case organization.slug
    when 'tier-read-one' then '75000000-0000-4000-8000-000000000001'::uuid
    else '76000000-0000-4000-8000-000000000001'::uuid
  end,
  '2026-08-01T00:00:00Z'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id;

insert into loyalty.programme_tiers (
  organization_id, programme_group_id, programme_version_id, code, name,
  ordinal, minimum_eligible_spend_minor, points_per_major_unit
)
select version.organization_id, version.programme_group_id, version.id,
  tier.code, tier.name, tier.ordinal, tier.minimum_spend, tier.rate
from loyalty.programme_versions as version
cross join (
  values
    ('rose'::text, 'Rose'::text, 1::smallint, 0::bigint, 5::bigint),
    ('bloom'::text, 'Bloom'::text, 2::smallint, 15000::bigint, 6::bigint)
) as tier(code, name, ordinal, minimum_spend, rate);

insert into loyalty.customers (public_id, organization_id, display_reference)
select '75000000-0000-4000-8000-000000000201', id, 'Tier Member'
from loyalty.organizations where slug = 'tier-read-one'
union all
select '75000000-0000-4000-8000-000000000202', id, 'Unevaluated Member'
from loyalty.organizations where slug = 'tier-read-one'
union all
select '76000000-0000-4000-8000-000000000201', id, 'Other Tier Member'
from loyalty.organizations where slug = 'tier-read-two';

insert into loyalty.wallets (
  public_id, organization_id, programme_group_id, customer_id
)
select
  case customer.public_id
    when '75000000-0000-4000-8000-000000000201' then '75000000-0000-4000-8000-000000000211'::uuid
    when '75000000-0000-4000-8000-000000000202' then '75000000-0000-4000-8000-000000000212'::uuid
    else '76000000-0000-4000-8000-000000000211'::uuid
  end,
  customer.organization_id, programme_group.id, customer.id
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id;

insert into loyalty.tier_decisions (
  public_id, organization_id, programme_group_id, programme_version_id,
  wallet_id, tier_code, qualified_tier_code, transition,
  rolling_eligible_spend_minor, below_threshold_since, grace_until,
  effective_at, idempotency_key, request_sha256, explanation
)
select '75000000-0000-4000-8000-000000000220', wallet.organization_id,
  wallet.programme_group_id, version.id, wallet.id, 'bloom', 'rose', 'grace',
  9007199254740993, '2026-08-10T00:00:00Z', '2026-09-10T00:00:00Z',
  '2026-08-12T00:00:00Z', 'tier-read:decision',
  extensions.digest(convert_to('tier-read-decision', 'UTF8'), 'sha256'),
  '{"private":"must-not-leak"}'::jsonb
from loyalty.wallets as wallet
join loyalty.programme_versions as version
  on version.organization_id = wallet.organization_id
where wallet.public_id = '75000000-0000-4000-8000-000000000211';

insert into loyalty.tier_memberships (
  public_id, organization_id, programme_group_id, programme_version_id,
  wallet_id, tier_code, decision_id, effective_from
)
select '75000000-0000-4000-8000-000000000230', decision.organization_id,
  decision.programme_group_id, decision.programme_version_id,
  decision.wallet_id, decision.tier_code, decision.id, '2026-08-01T00:00:00Z'
from loyalty.tier_decisions as decision
where decision.public_id = '75000000-0000-4000-8000-000000000220';

set local role authenticated;
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select count(*)::bigint from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array[1::bigint], 'authorized tier detail returns one bounded row'
);
select results_eq(
  $$ select tier_code from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['bloom'::text], 'current effective tier code is returned'
);
select results_eq(
  $$ select tier_name from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['Bloom'::text], 'current effective tier display name is returned'
);
select results_eq(
  $$ select qualified_tier_code from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['rose'::text], 'qualified tier code remains distinct during grace'
);
select results_eq(
  $$ select qualified_tier_name from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['Rose'::text], 'qualified tier display name is returned'
);
select results_eq(
  $$ select transition from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['grace'::text], 'grace transition is explicit'
);
select results_eq(
  $$ select rolling_eligible_spend_minor from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['9007199254740993'::text], 'qualification spend remains exact beyond JavaScript safe integers'
);
select results_eq(
  $$ select below_threshold_since from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['2026-08-10T00:00:00Z'::timestamptz], 'below-threshold start is returned'
);
select results_eq(
  $$ select grace_until from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['2026-09-10T00:00:00Z'::timestamptz], 'grace deadline is returned'
);
select results_eq(
  $$ select effective_from from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['2026-08-01T00:00:00Z'::timestamptz], 'membership effective start is returned'
);
select results_eq(
  $$ select decided_at from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['2026-08-12T00:00:00Z'::timestamptz], 'decision effective time is returned'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000202',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array[1::bigint], 'an unevaluated authorized customer returns honest empty tier state'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000202',
    '75000000-0000-4000-8000-000000000110'
  ) where tier_code is null and rolling_eligible_spend_minor is null $$,
  array[1::bigint], 'unevaluated tier fields are null rather than invented defaults'
);
select is_empty(
  $$ select * from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '76000000-0000-4000-8000-000000000110'
  ) $$,
  'a mismatched programme group returns no tier state'
);
select is_empty(
  $$ select * from loyalty.get_customer_tier_read_model(
    '75999999-0000-4000-8000-000000000999',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  'an unknown customer returns no tier state'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select tier_code from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  array['bloom'::text], 'a live analyst may inspect customer tier state'
);

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000003';
select is_empty(
  $$ select * from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  'a revoked member fails closed with a live token'
);

set local request.jwt.claim.sub = '76000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select * from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  'another tenant owner cannot read this customer tier state'
);

reset role;
update loyalty.programme_groups
set status = 'suspended'
where public_id = '75000000-0000-4000-8000-000000000110';
set local role authenticated;
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select * from loyalty.get_customer_tier_read_model(
    '75000000-0000-4000-8000-000000000201',
    '75000000-0000-4000-8000-000000000110'
  ) $$,
  'a suspended programme group fails closed'
);

select * from finish();
rollback;
