begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_my_referral_experiences_v1()', 'EXECUTE'
  ),
  'authenticated customers can read their Auth-derived referral experience'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_my_referral_experiences_v1()', 'EXECUTE'
  ),
  'anonymous callers cannot enumerate referral experience'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_referral_dashboard_v1(uuid,integer)', 'EXECUTE'
  ),
  'authenticated merchants can request the role-checked referral dashboard'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.get_referral_dashboard_v1(uuid,integer)', 'EXECUTE'
  ),
  'anonymous callers cannot request referral performance'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.referral_attributions', 'SELECT'),
  'experience projections do not grant raw attribution reads'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.referral_reward_issuances', 'SELECT'
  ),
  'experience projections do not grant raw issuance reads'
);

insert into auth.users (id, email) values
  ('86000000-0000-4000-8000-000000000001', 'm06-s05-owner@example.test'),
  ('86000000-0000-4000-8000-000000000002', 'm06-s05-analyst@example.test'),
  ('86000000-0000-4000-8000-000000000003', 'm06-s05-advocate@example.test'),
  ('86000000-0000-4000-8000-000000000004', 'm06-s05-second-customer@example.test'),
  ('87000000-0000-4000-8000-000000000001', 'm06-s05-outsider@example.test');

insert into loyalty.organizations (public_id, slug, name) values
  ('86000000-0000-4000-8000-000000000100', 'm06-s05', 'M06 S05'),
  ('87000000-0000-4000-8000-000000000100', 'm06-s05-other', 'M06 S05 Other');

insert into loyalty.organization_memberships (organization_id, user_id, role)
select organization.id, member.user_id, member.role
from loyalty.organizations as organization
join (values
  ('m06-s05'::text, '86000000-0000-4000-8000-000000000001'::uuid, 'owner'::text),
  ('m06-s05'::text, '86000000-0000-4000-8000-000000000002'::uuid, 'analyst'::text),
  ('m06-s05-other'::text, '87000000-0000-4000-8000-000000000001'::uuid, 'owner'::text)
) as member(slug, user_id, role) on member.slug = organization.slug;

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'm06-s05' then '86000000-0000-4000-8000-000000000110'::uuid
    else '87000000-0000-4000-8000-000000000110'::uuid end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('m06-s05', 'm06-s05-other');

insert into loyalty.programme_groups (organization_id, slug, name)
select organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('m06-s05', 'm06-s05-other');

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select case organization.slug
    when 'm06-s05' then '86000000-0000-4000-8000-000000000120'::uuid
    else '87000000-0000-4000-8000-000000000120'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('m06-s05', 'm06-s05-other');

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select case organization.slug
    when 'm06-s05' then '86000000-0000-4000-8000-000000000130'::uuid
    else '87000000-0000-4000-8000-000000000130'::uuid end,
  organization.id, programme_group.id, programme.id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(pg_catalog.convert_to('{}', 'UTF8'), 'sha256'),
  case organization.slug
    when 'm06-s05' then '86000000-0000-4000-8000-000000000001'::uuid
    else '87000000-0000-4000-8000-000000000001'::uuid end,
  now() - interval '60 days'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('m06-s05', 'm06-s05-other');

insert into loyalty.programme_referral_policies (
  organization_id, programme_group_id, programme_version_id,
  attribution_window_days, qualification_status, cooling_days,
  minimum_eligible_spend_minor, require_new_customer,
  monthly_advocate_referral_limit, advocate_reward_points,
  friend_reward_points, manual_review_enabled, risk_window_hours,
  source_network_referral_limit, device_referral_limit
)
select version.organization_id, version.programme_group_id, version.id,
  30, 'completed', 14, 3000, true, 10, 500, 250, true, 24, 3, 3
from loyalty.programme_versions as version
where version.public_id = '86000000-0000-4000-8000-000000000130';

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select '86000000-0000-4000-8000-000000000140', organization.id, workspace.id,
  'https://m06-s05.example.test', 'M06 S05 WooCommerce', 'v1',
  'vault://m06-s05', programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
where organization.slug = 'm06-s05';

insert into loyalty.customers (public_id, organization_id, display_reference)
select fixture.public_id, organization.id, fixture.reference
from loyalty.organizations as organization
cross join (values
  ('86000000-0000-4000-8000-000000000150'::uuid, 'Advocate Example'),
  ('86000000-0000-4000-8000-000000000151'::uuid, 'Second Advocate'),
  ('86000000-0000-4000-8000-000000000152'::uuid, 'Friend One'),
  ('86000000-0000-4000-8000-000000000153'::uuid, 'Friend Two'),
  ('86000000-0000-4000-8000-000000000154'::uuid, 'Friend Three'),
  ('86000000-0000-4000-8000-000000000155'::uuid, 'Friend Four')
) as fixture(public_id, reference)
where organization.slug = 'm06-s05';

insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  'customer-' || customer.public_id::text, 'registered', now()
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.organization_id = (
  select id from loyalty.organizations where slug = 'm06-s05'
);

insert into loyalty.customer_user_links (
  public_id, organization_id, customer_id, auth_user_id, source_connection_id
)
select case customer.public_id
    when '86000000-0000-4000-8000-000000000150'
      then '86000000-0000-4000-8000-000000000160'::uuid
    else '86000000-0000-4000-8000-000000000161'::uuid end,
  customer.organization_id, customer.id,
  case customer.public_id
    when '86000000-0000-4000-8000-000000000150'
      then '86000000-0000-4000-8000-000000000003'::uuid
    else '86000000-0000-4000-8000-000000000004'::uuid end,
  connection.id
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.public_id in (
  '86000000-0000-4000-8000-000000000150',
  '86000000-0000-4000-8000-000000000151'
);

set local role authenticated;
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000003';

select results_eq(
  $$ select sharing_state, total_count, jsonb_array_length(history)
    from loyalty.get_my_referral_experiences_v1() $$,
  $$ values ('available'::text, '0'::text, 0) $$,
  'linked customer sees an available referral programme before creating a link'
);
select results_eq(
  $$ select outcome from loyalty.create_my_referral_link(
    '86000000-0000-4000-8000-000000000160',
    '86000000-0000-4000-8000-000000000170'
  ) $$,
  array['created'::text],
  'customer creates the normal Auth-derived opaque link'
);
select results_eq(
  $$ select sharing_state, (share_url ~
      '^https://m06-s05[.]example[.]test/[?]stf_ref=[0-9a-f-]{36}$')::text
    from loyalty.get_my_referral_experiences_v1() $$,
  $$ values ('active'::text, 'true'::text) $$,
  'active customer projection exposes only the canonical opaque store URL'
);

reset role;

insert into loyalty_private.commerce_delivery_inbox (
  organization_id, connection_id, source_delivery_id, envelope_version,
  source_event_id, event_type, source_object_id, occurred_at, delivered_at,
  key_version, nonce, body_sha256, raw_body
)
select organization.id, connection.id, 'delivery-' || fixture.suffix, '1',
  'event-' || fixture.suffix, 'commerce.order.status_changed',
  'order-' || fixture.suffix, fixture.occurred_at, fixture.occurred_at,
  'v1', 'nonce-' || fixture.suffix, repeat(fixture.sha, 64), '{}'::jsonb
from loyalty.organizations as organization
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
cross join (values
  ('one'::text, now() - interval '4 days', 'a'::text),
  ('two'::text, now() - interval '3 days', 'b'::text),
  ('three'::text, now() - interval '2 days', 'c'::text),
  ('four'::text, now() - interval '1 day', 'd'::text)
) as fixture(suffix, occurred_at, sha)
where organization.slug = 'm06-s05';

insert into loyalty_private.canonical_commerce_events (
  organization_id, connection_id, delivery_inbox_id, source_event_id,
  normalization_version, event_type, source_object_id, occurred_at, payload
)
select inbox.organization_id, inbox.connection_id, inbox.id,
  inbox.source_event_id, 'v1', inbox.event_type, inbox.source_object_id,
  inbox.occurred_at, '{}'::jsonb
from loyalty_private.commerce_delivery_inbox as inbox
where inbox.source_delivery_id like 'delivery-%';

insert into loyalty.referral_attributions (
  public_id, organization_id, programme_group_id, programme_version_id,
  advocate_id, friend_customer_id, source_connection_id, source_event_id,
  source_order_id, captured_at, attribution_expires_at, risk_codes
)
select fixture.public_id, event.organization_id, policy.programme_group_id,
  policy.programme_version_id, advocate.id, friend.id, event.connection_id,
  event.id, event.source_object_id, event.occurred_at,
  event.occurred_at + interval '30 days', fixture.risk_codes
from (values
  ('one'::text, '86000000-0000-4000-8000-000000000181'::uuid,
    '86000000-0000-4000-8000-000000000152'::uuid, array[]::text[]),
  ('two'::text, '86000000-0000-4000-8000-000000000182'::uuid,
    '86000000-0000-4000-8000-000000000153'::uuid, array[]::text[]),
  ('three'::text, '86000000-0000-4000-8000-000000000183'::uuid,
    '86000000-0000-4000-8000-000000000154'::uuid,
    array['device_velocity']::text[]),
  ('four'::text, '86000000-0000-4000-8000-000000000184'::uuid,
    '86000000-0000-4000-8000-000000000155'::uuid, array[]::text[])
) as fixture(suffix, public_id, friend_id, risk_codes)
join loyalty_private.canonical_commerce_events as event
  on event.source_event_id = 'event-' || fixture.suffix
join loyalty.programme_referral_policies as policy
  on policy.organization_id = event.organization_id
join loyalty.referral_advocates as advocate
  on advocate.organization_id = event.organization_id
join loyalty.customers as advocate_customer
  on advocate_customer.organization_id = advocate.organization_id
 and advocate_customer.id = advocate.customer_id
 and advocate_customer.public_id = '86000000-0000-4000-8000-000000000150'
join loyalty.customers as friend
  on friend.organization_id = event.organization_id
 and friend.public_id = fixture.friend_id;

insert into loyalty.referral_attribution_transitions (
  organization_id, attribution_id, from_state, to_state, reason_code,
  actor_kind, idempotency_key, created_at
)
select attribution.organization_id, attribution.id, null, fixture.state,
  'test_' || fixture.state, 'system', 'test:' || fixture.state,
  attribution.captured_at + interval '1 hour'
from (values
  ('86000000-0000-4000-8000-000000000181'::uuid, 'captured'::text),
  ('86000000-0000-4000-8000-000000000182'::uuid, 'qualified'::text),
  ('86000000-0000-4000-8000-000000000183'::uuid, 'rejected'::text),
  ('86000000-0000-4000-8000-000000000184'::uuid, 'reversed'::text)
) as fixture(public_id, state)
join loyalty.referral_attributions as attribution
  on attribution.public_id = fixture.public_id;

set local role authenticated;
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000003';

select results_eq(
  $$ select total_count, pending_count, qualified_count,
      rejected_count, reversed_count
    from loyalty.get_my_referral_experiences_v1() $$,
  $$ values ('4'::text, '1'::text, '1'::text, '1'::text, '1'::text) $$,
  'customer counts reconcile every accepted referral into one current state'
);
select results_eq(
  $$ select jsonb_array_length(history)
    from loyalty.get_my_referral_experiences_v1() $$,
  array[4],
  'customer receives bounded referral history'
);
select results_eq(
  $$ select history -> 0 ->> 'state'
    from loyalty.get_my_referral_experiences_v1() $$,
  array['reversed'::text],
  'customer history is newest first'
);
select results_eq(
  $$ select (history::text !~* 'friend|order|email|fingerprint')::text
    from loyalty.get_my_referral_experiences_v1() $$,
  array['true'::text],
  'customer history exposes no friend order or fingerprint identity'
);
select results_eq(
  $$ select history -> 0 ->> 'rewardPoints'
    from loyalty.get_my_referral_experiences_v1() $$,
  array['500'::text],
  'customer progress uses the immutable historical advocate reward'
);
select results_eq(
  $$ select minimum_eligible_spend_minor, qualification_status, cooling_days
    from loyalty.get_my_referral_experiences_v1() $$,
  $$ values ('3000'::text, 'completed'::text, 14::smallint) $$,
  'customer explanation uses the published historical policy'
);

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000004';
select results_eq(
  $$ select account_id, sharing_state, total_count
    from loyalty.get_my_referral_experiences_v1() $$,
  $$ values (
    '86000000-0000-4000-8000-000000000161'::uuid,
    'available'::text, '0'::text
  ) $$,
  'second customer can read only their own empty referral experience'
);
select is_empty(
  $$ select * from loyalty.get_my_referral_experiences_v1()
    where account_id = '86000000-0000-4000-8000-000000000160' $$,
  'customer cannot select another linked account from the no-selector projection'
);

set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select * from loyalty.get_my_referral_experiences_v1() $$,
  'merchant identity without a customer link receives no customer history'
);

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select (totals ->> 'advocates'), (totals ->> 'attributions'),
      (totals ->> 'pending'), (totals ->> 'qualified'),
      (totals ->> 'rejected'), (totals ->> 'reversed')
    from loyalty.get_referral_dashboard_v1(
      '86000000-0000-4000-8000-000000000120', 30
    ) $$,
  $$ values ('1'::text, '4'::text, '1'::text, '1'::text, '1'::text, '1'::text) $$,
  'analyst receives a reconciled canonical referral funnel'
);
select results_eq(
  $$ select jsonb_array_length(top_advocates), jsonb_array_length(recent)
    from loyalty.get_referral_dashboard_v1(
      '86000000-0000-4000-8000-000000000120', 30
    ) $$,
  $$ values (1, 4) $$,
  'dashboard returns bounded real advocate and recent-referral rows'
);
select results_eq(
  $$ select top_advocates -> 0 ->> 'reference',
      top_advocates -> 0 ->> 'attributions'
    from loyalty.get_referral_dashboard_v1(
      '86000000-0000-4000-8000-000000000120', 30
    ) $$,
  $$ values ('Advocate Example'::text, '4'::text) $$,
  'top advocate ranking is fact-derived'
);
select results_eq(
  $$ select recent -> 0 ->> 'state', recent -> 0 ->> 'sourceOrderReference'
    from loyalty.get_referral_dashboard_v1(
      '86000000-0000-4000-8000-000000000120', 30
    ) $$,
  $$ values ('reversed'::text, 'order-four'::text) $$,
  'recent merchant history carries current state and canonical order reference'
);
select results_eq(
  $$ select ((totals || jsonb_build_object('top', top_advocates))::text
      !~* 'click|share|revenue|email|fingerprint')::text
    from loyalty.get_referral_dashboard_v1(
      '86000000-0000-4000-8000-000000000120', 30
    ) $$,
  array['true'::text],
  'dashboard does not fabricate unobserved shares clicks or revenue'
);
select throws_ok(
  $$ select * from loyalty.get_referral_dashboard_v1(
    '86000000-0000-4000-8000-000000000120', 0
  ) $$,
  '22023', 'invalid referral dashboard filter',
  'invalid dashboard windows fail closed'
);

set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.get_referral_dashboard_v1(
    '86000000-0000-4000-8000-000000000120', 30
  ) $$,
  '42501', 'referral dashboard not authorized',
  'cross-tenant merchant cannot read referral performance'
);

reset role;

update loyalty.referral_advocates
set status = 'disabled', disabled_at = now()
where public_id = (
  select advocate.public_id
  from loyalty.referral_advocates as advocate
  join loyalty.customers as customer
    on customer.organization_id = advocate.organization_id
   and customer.id = advocate.customer_id
  where customer.public_id = '86000000-0000-4000-8000-000000000150'
);

set local role authenticated;
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select sharing_state, share_url is null, total_count
    from loyalty.get_my_referral_experiences_v1() $$,
  $$ values ('disabled'::text, true, '4'::text) $$,
  'disabled advocate link is hidden while accepted history remains visible'
);
reset role;

update loyalty.referral_advocates
set status = 'active', disabled_at = null
where organization_id = (
  select id from loyalty.organizations where slug = 'm06-s05'
);

select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    '86000000-0000-4000-8000-000000000100', 'referrals', 'disabled', null,
    'manual_override', 'test:m06-s05', 'Pause new customer referral growth',
    now() - interval '1 second', null
  ) $$,
  'test pauses new referral growth through the authoritative entitlement'
);

set local role authenticated;
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select sharing_state, share_url is null, total_count,
      jsonb_array_length(history)
    from loyalty.get_my_referral_experiences_v1() $$,
  $$ values ('paused'::text, true, '4'::text, 4) $$,
  'rollout pause hides sharing but preserves customer progress and history'
);
select throws_ok(
  $$ select * from loyalty.create_my_referral_link(
    '86000000-0000-4000-8000-000000000160',
    '86000000-0000-4000-8000-000000000171'
  ) $$,
  '42501', 'referrals are not enabled',
  'paused rollout still blocks new link requests'
);

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select totals ->> 'attributions', jsonb_array_length(recent)
    from loyalty.get_referral_dashboard_v1(
      '86000000-0000-4000-8000-000000000120', 30
    ) $$,
  $$ values ('4'::text, 4) $$,
  'merchant history remains inspectable after rollout pause'
);

select * from finish();
rollback;
