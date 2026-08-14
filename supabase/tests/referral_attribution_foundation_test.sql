begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

select has_table('loyalty', 'programme_referral_policies', 'referral policies exist');
select has_table('loyalty', 'referral_advocates', 'opaque referral advocates exist');
select has_table('loyalty', 'referral_attributions', 'first-attribution facts exist');
select has_table('loyalty', 'referral_attribution_transitions', 'referral state transitions exist');
select has_table('loyalty_private', 'referral_risk_evidence', 'risk evidence is private');
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.programme_referral_policies'::regclass),
  'referral policies have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.referral_advocates'::regclass),
  'referral advocates have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.referral_attributions'::regclass),
  'referral attributions have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'loyalty.referral_attribution_transitions'::regclass),
  'referral transitions have RLS enabled'
);
select has_trigger(
  'loyalty', 'programme_versions', 'programme_versions_referral_policy_contract',
  'referral policy is guarded at the immutable programme boundary'
);
select has_trigger(
  'loyalty', 'programme_versions', 'programme_versions_materialize_referral_policy',
  'published referral policy materializes transactionally'
);
select has_trigger(
  'loyalty', 'referral_attributions', 'referral_attributions_immutable',
  'first attribution is immutable'
);
select has_trigger(
  'loyalty', 'referral_attribution_transitions', 'referral_attribution_transitions_immutable',
  'referral decisions are append-only'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.create_my_referral_link(uuid,uuid)', 'EXECUTE'
  ),
  'authenticated customers can request their own opaque link'
);
select ok(
  not has_function_privilege(
    'anon', 'loyalty.create_my_referral_link(uuid,uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot create referral links'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.record_referral_attribution_v1(uuid)', 'EXECUTE'
  ),
  'the worker can derive referral attribution from signed canonical evidence'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.record_referral_attribution_v1(uuid)', 'EXECUTE'
  ),
  'browser sessions cannot manufacture referral attribution'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.referral_advocates', 'SELECT'),
  'browser sessions cannot enumerate opaque advocate codes'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.referral_attributions', 'SELECT'),
  'browser sessions cannot inspect other customers referral evidence'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty.referral_attributions', 'INSERT'),
  'browser sessions cannot insert attribution facts'
);
select ok(
  not has_table_privilege('authenticated', 'loyalty_private.referral_risk_evidence', 'SELECT'),
  'privacy-minimized risk evidence remains private'
);

insert into auth.users (id, email)
values
  ('a6000000-0000-4000-8000-000000000001', 'm06-owner-one@example.test'),
  ('a6000000-0000-4000-8000-000000000002', 'm06-advocate-one@example.test'),
  ('a6000000-0000-4000-8000-000000000003', 'm06-advocate-two@example.test'),
  ('a7000000-0000-4000-8000-000000000001', 'm06-owner-two@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('a6000000-0000-4000-8000-000000000100', 'm06-one', 'M06 One'),
  ('a7000000-0000-4000-8000-000000000100', 'm06-two', 'M06 Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'm06-one'),
    'a6000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'm06-two'),
    'a7000000-0000-4000-8000-000000000001', 'owner');

insert into loyalty.workspaces (public_id, organization_id, slug, name)
select
  case slug when 'm06-one' then 'a6000000-0000-4000-8000-000000000110'::uuid
    else 'a7000000-0000-4000-8000-000000000110'::uuid end,
  id, 'store', name || ' Store'
from loyalty.organizations where slug in ('m06-one', 'm06-two');

insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', name || ' Rewards'
from loyalty.organizations where slug in ('m06-one', 'm06-two');

insert into loyalty.programmes (public_id, organization_id, programme_group_id, slug, name)
select
  case organization.slug when 'm06-one'
    then 'a6000000-0000-4000-8000-000000000101'::uuid
    else 'a7000000-0000-4000-8000-000000000101'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('m06-one', 'm06-two');

create function pg_temp.valid_m06()
returns jsonb
language sql
immutable
as $$
  select '{
    "version":"2",
    "currencyCode":"EUR",
    "currencyMinorUnitDigits":2,
    "pendingDays":30,
    "pointsExpireAfterDays":365,
    "tiers":[
      {"code":"rose","name":"Rose","minimumEligibleSpendMinor":"0","pointsPerMajorUnit":"5"}
    ],
    "rewards":[],
    "earningRules":[{
      "code":"purchase-base","name":"Base purchase points","source":"purchase",
      "enabled":true,"priority":0,"stackable":false,
      "effect":{"kind":"base_rate","pointsPerMajorUnit":"5"},
      "conditions":{"productIds":[],"categoryIds":[],"currencyCodes":[],"markets":[],"channels":[],"activityCodes":[],"segmentCodes":[],"tierCodes":[],"startsAt":null,"endsAt":null},
      "purchaseExclusions":{"productIds":[],"categoryIds":[],"shipping":true,"tax":true,"fees":true,"giftCardPayments":true,"storeCreditPayments":true,"discounts":true},
      "cap":{"perEventPoints":null,"perMemberPoints":null,"memberPeriod":null,"rollingDays":null}
    }],
    "referralPolicy":{
      "version":"1","attributionWindowDays":30,"qualificationStatus":"completed",
      "coolingDays":14,"minimumEligibleSpendMinor":"2500","requireNewCustomer":true,
      "monthlyAdvocateReferralLimit":10,
      "advocateReward":{"kind":"points","points":"500"},
      "friendReward":{"kind":"points","points":"250"},
      "risk":{"manualReviewEnabled":true,"rollingWindowHours":24,
        "sourceNetworkReferralLimit":2,"deviceReferralLimit":2}
    }
  }'::jsonb;
$$;

select lives_ok(
  $$ select loyalty_private.set_deployment_mode(
    'managed', 1, 'test:m06', 'Exercise managed referral gating', now() - interval '2 minutes'
  ) $$,
  'test enters managed mode through the append-only deployment command'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    'a6000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', null,
    'canary', 'test:m06', 'Enable V2 for referral canary', now() - interval '90 seconds', null
  ) $$,
  'test enables V2 for the referral canary'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    'a6000000-0000-4000-8000-000000000100', 'referrals', 'enabled', null,
    'canary', 'test:m06', 'Enable referrals for canary', now() - interval '90 seconds', null
  ) $$,
  'test enables referrals for only the canary tenant'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    'a7000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', null,
    'canary', 'test:m06', 'Enable V2 without referrals for control', now() - interval '90 seconds', null
  ) $$,
  'control tenant receives V2 without referral authority'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a7000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    'a7000000-0000-4000-8000-000000000101', pg_temp.valid_m06(),
    'm06:disabled:draft', 'a7000000-0000-4000-8000-000000000201'
  ) $$,
  '42501', 'referrals are not enabled for this organization',
  'V2 authority cannot bypass the separate referral entitlement'
);

set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select * from loyalty.create_programme_draft_command(
    'a6000000-0000-4000-8000-000000000101',
    jsonb_set(pg_temp.valid_m06(), '{referralPolicy,attributionWindowDays}', '0'::jsonb),
    'm06:invalid:window', 'a6000000-0000-4000-8000-000000000202'
  ) $$,
  '22023', 'invalid ReferralPolicyV1',
  'invalid attribution windows fail before draft storage'
);
select results_eq(
  $$ select outcome from loyalty.create_programme_draft_command(
    'a6000000-0000-4000-8000-000000000101', pg_temp.valid_m06(),
    'm06:valid:draft', 'a6000000-0000-4000-8000-000000000203'
  ) $$,
  array['created'::text],
  'entitled owner stores one strict referral policy'
);
select results_eq(
  $$ select outcome from loyalty.publish_programme_version_command(
    (select public_id from loyalty.programme_versions where programme_id =
      (select id from loyalty.programmes where public_id =
        'a6000000-0000-4000-8000-000000000101')),
    (select encode(configuration_sha256, 'hex') from loyalty.programme_versions
      where programme_id = (select id from loyalty.programmes where public_id =
        'a6000000-0000-4000-8000-000000000101')),
    'm06:valid:publish', 'a6000000-0000-4000-8000-000000000204'
  ) $$,
  array['created'::text],
  'reviewed referral policy publishes through the authenticated command'
);

reset role;

select results_eq(
  $$ select attribution_window_days, qualification_status, cooling_days,
      minimum_eligible_spend_minor, advocate_reward_points, friend_reward_points
    from loyalty.programme_referral_policies $$,
  $$ values (30::smallint, 'completed'::text, 14::smallint,
    2500::bigint, 500::bigint, 250::bigint) $$,
  'publication materializes the exact reviewed referral policy'
);
select throws_ok(
  $$ update loyalty.programme_referral_policies set cooling_days = 1 $$,
  '55000', 'immutable loyalty record',
  'materialized referral policy cannot be rewritten'
);

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select 'a6000000-0000-4000-8000-000000000120', organization.id, workspace.id,
  'https://m06-one.example.test', 'M06 WooCommerce', 'v1', 'vault://m06-one',
  programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
where organization.slug = 'm06-one';

insert into loyalty.customers (public_id, organization_id, display_reference)
select fixture.public_id, organization.id, fixture.reference
from loyalty.organizations as organization
cross join (values
  ('a6000000-0000-4000-8000-000000000150'::uuid, 'advocate-one'),
  ('a6000000-0000-4000-8000-000000000151'::uuid, 'advocate-two'),
  ('a6000000-0000-4000-8000-000000000152'::uuid, 'friend-one'),
  ('a6000000-0000-4000-8000-000000000153'::uuid, 'friend-two'),
  ('a6000000-0000-4000-8000-000000000154'::uuid, 'friend-outside'),
  ('a6000000-0000-4000-8000-000000000155'::uuid, 'friend-disabled')
) as fixture(public_id, reference)
where organization.slug = 'm06-one';

insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  customer.display_reference, 'registered', now()
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.organization_id = (select id from loyalty.organizations where slug = 'm06-one');

insert into loyalty.customer_user_links (
  public_id, organization_id, customer_id, auth_user_id, source_connection_id
)
select
  case customer.display_reference when 'advocate-one'
    then 'a6000000-0000-4000-8000-000000000160'::uuid
    else 'a6000000-0000-4000-8000-000000000161'::uuid end,
  customer.organization_id, customer.id,
  case customer.display_reference when 'advocate-one'
    then 'a6000000-0000-4000-8000-000000000002'::uuid
    else 'a6000000-0000-4000-8000-000000000003'::uuid end,
  connection.id
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.display_reference in ('advocate-one', 'advocate-two');

set local role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000002';

select results_eq(
  $$ select outcome from loyalty.create_my_referral_link(
    'a6000000-0000-4000-8000-000000000160',
    'a6000000-0000-4000-8000-000000000301'
  ) $$,
  array['created'::text],
  'active customer creates one opaque advocate link'
);
select results_eq(
  $$ select outcome from loyalty.create_my_referral_link(
    'a6000000-0000-4000-8000-000000000160',
    'a6000000-0000-4000-8000-000000000301'
  ) $$,
  array['duplicate'::text],
  'exact link request retry is idempotent'
);
select results_eq(
  $$ select outcome from loyalty.create_my_referral_link(
    'a6000000-0000-4000-8000-000000000160',
    'a6000000-0000-4000-8000-000000000302'
  ) $$,
  array['duplicate'::text],
  'a new request returns the same customer-bound advocate identity'
);
select throws_ok(
  $$ select * from loyalty.create_my_referral_link(
    'a6000000-0000-4000-8000-000000000161',
    'a6000000-0000-4000-8000-000000000303'
  ) $$,
  '42501', 'referral link not authorized',
  'customer cannot request another account link'
);

set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select outcome from loyalty.create_my_referral_link(
    'a6000000-0000-4000-8000-000000000161',
    'a6000000-0000-4000-8000-000000000304'
  ) $$,
  array['created'::text],
  'second customer receives a distinct advocate identity'
);

reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.referral_advocates $$,
  array[2::bigint],
  'request retries create exactly one advocate per customer'
);
set local request.jwt.claim.sub = '';
select throws_ok(
  $$ select * from loyalty.create_my_referral_link(
    'a6000000-0000-4000-8000-000000000160',
    'a6000000-0000-4000-8000-000000000301'
  ) $$,
  '42501', 'referral link not authorized',
  'execution without an Auth subject cannot recover a customer link'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select (share_url ~
      '^https://m06-one[.]example[.]test/[?]stf_ref=[0-9a-f-]{36}$')::text
    from loyalty.create_my_referral_link(
      'a6000000-0000-4000-8000-000000000160',
      'a6000000-0000-4000-8000-000000000301'
    ) $$,
  array['true'::text],
  'share URL exposes only the store origin and opaque advocate code'
);
reset role;

create function pg_temp.add_referral_event(
  target_suffix text,
  target_customer text,
  target_advocate uuid,
  target_captured_at timestamptz,
  target_occurred_at timestamptz,
  target_fingerprint text
)
returns uuid
language plpgsql
as $$
declare
  target_receipt uuid;
  target_event uuid;
  target_body jsonb;
begin
  target_body := jsonb_build_object(
    'version', '1',
    'payload', jsonb_build_object(
      'kind', 'order_status_changed',
      'previousStatus', 'pending',
      'order', jsonb_build_object(
        'kind', 'order', 'orderId', 'order-' || target_suffix,
        'status', 'processing', 'currency', 'EUR',
        'currencyMinorUnitDigits', 2, 'market', 'SI',
        'customer', jsonb_build_object(
          'kind', 'registered', 'externalCustomerId', target_customer
        ),
        'paymentKind', 'money', 'lines', '[]'::jsonb,
        'shippingTotal', '0.00', 'shippingRefundedTotal', '0.00',
        'taxTotal', '0.00', 'taxRefundedTotal', '0.00',
        'feeTotal', '0.00', 'feeRefundedTotal', '0.00',
        'discountTotal', '0.00', 'refundedTotal', '0.00',
        'referral', jsonb_build_object(
          'version', '1', 'advocateCode', target_advocate,
          'capturedAt', target_captured_at,
          'sourceNetworkFingerprint', target_fingerprint,
          'deviceFingerprint', target_fingerprint,
          'paymentFingerprint', target_fingerprint,
          'shippingFingerprint', target_fingerprint
        )
      )
    )
  );
  select receipt_id into strict target_receipt
  from loyalty_private.accept_commerce_delivery(
    (select id from loyalty.organizations where slug = 'm06-one'),
    (select id from loyalty.commerce_connections where public_id =
      'a6000000-0000-4000-8000-000000000120'),
    'delivery-' || target_suffix, '1', 'event-' || target_suffix,
    'commerce.order.status_changed', 'order-' || target_suffix, target_suffix,
    target_occurred_at, now(), 'v1', 'nonce-' || target_suffix,
    repeat(substr(md5(target_suffix), 1, 1), 64), target_body
  );
  select canonical_event_id into strict target_event
  from loyalty_private.normalize_commerce_delivery(target_receipt, 'v1');
  return target_event;
end;
$$;

create temporary table referral_events (name text primary key, public_id uuid not null);
insert into referral_events values
  ('first', pg_temp.add_referral_event(
    'first', 'friend-one',
    (select advocate.public_id from loyalty.referral_advocates as advocate
      join loyalty.customers as customer on customer.id = advocate.customer_id
      where customer.display_reference = 'advocate-one'),
    now() - interval '1 hour', now(), repeat('a', 64)
  ));

select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_events where name = 'first')) $$,
  $$ values ('captured'::text, 'created'::text) $$,
  'first eligible signed order creates one captured attribution'
);
select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_events where name = 'first')) $$,
  $$ values ('existing'::text, 'duplicate'::text) $$,
  'exact event replay creates no second attribution'
);

insert into referral_events values
  ('different-advocate', pg_temp.add_referral_event(
    'different-advocate', 'friend-one',
    (select advocate.public_id from loyalty.referral_advocates as advocate
      join loyalty.customers as customer on customer.id = advocate.customer_id
      where customer.display_reference = 'advocate-two'),
    now() - interval '1 hour', now(), repeat('b', 64)
  ));
select results_eq(
  $$ select outcome from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_events where name = 'different-advocate')) $$,
  array['existing_attribution'::text],
  'first advocate remains authoritative when a later code differs'
);

insert into referral_events values
  ('risk-review', pg_temp.add_referral_event(
    'risk-review', 'friend-two',
    (select advocate.public_id from loyalty.referral_advocates as advocate
      join loyalty.customers as customer on customer.id = advocate.customer_id
      where customer.display_reference = 'advocate-one'),
    now() - interval '30 minutes', now(), repeat('a', 64)
  ));
select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_events where name = 'risk-review')) $$,
  $$ values ('pending_review'::text, 'created'::text) $$,
  'reused keyed evidence routes uncertain attribution to manual review'
);
select results_eq(
  $$ select risk_codes from loyalty.referral_attributions
    join loyalty.customers on customers.id = referral_attributions.friend_customer_id
    where customers.display_reference = 'friend-two' $$,
  $$ values (array['reused_payment_evidence', 'reused_shipping_evidence']::text[]) $$,
  'risk decision retains only allowlisted reason codes'
);

insert into referral_events values
  ('self', pg_temp.add_referral_event(
    'self', 'advocate-one',
    (select advocate.public_id from loyalty.referral_advocates as advocate
      join loyalty.customers as customer on customer.id = advocate.customer_id
      where customer.display_reference = 'advocate-one'),
    now() - interval '15 minutes', now(), repeat('c', 64)
  ));
select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_events where name = 'self')) $$,
  $$ values ('blocked'::text, 'created'::text) $$,
  'deterministic self-referral is blocked without issuing value'
);

insert into referral_events values
  ('outside', pg_temp.add_referral_event(
    'outside', 'friend-outside',
    (select advocate.public_id from loyalty.referral_advocates as advocate
      join loyalty.customers as customer on customer.id = advocate.customer_id
      where customer.display_reference = 'advocate-one'),
    now() - interval '31 days', now(), repeat('d', 64)
  ));
select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_events where name = 'outside')) $$,
  $$ values ('ignored'::text, 'outside_window'::text) $$,
  'attribution outside the reviewed window is ignored'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.referral_attributions $$,
  array[3::bigint],
  'duplicate, conflicting, and expired evidence create no extra facts'
);
select results_eq(
  $$ select to_state from loyalty.referral_attribution_transitions order by id $$,
  $$ values ('captured'::text), ('pending_review'::text), ('blocked'::text) $$,
  'each accepted attribution appends its exact initial state transition'
);
select throws_ok(
  $$ update loyalty.referral_attributions set source_order_id = 'rewritten' $$,
  '55000', 'immutable loyalty record',
  'first attribution cannot be reassigned or rewritten'
);

update loyalty_private.referral_risk_evidence
set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
where attribution_id = (
  select attribution.id from loyalty.referral_attributions as attribution
  join loyalty.customers as customer on customer.id = attribution.friend_customer_id
  where customer.display_reference = 'friend-one'
);
select results_eq(
  $$ select loyalty_private.purge_expired_referral_risk_evidence(1) $$,
  array[1],
  'bounded purge deletes expired fingerprint evidence'
);

select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    'a6000000-0000-4000-8000-000000000100', 'referrals', 'disabled', null,
    'rollback', 'test:m06', 'Disable new referral growth after canary',
    now() - interval '1 second', null
  ) $$,
  'operator can disable new referral growth without touching history'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a6000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.create_my_referral_link(
    'a6000000-0000-4000-8000-000000000160',
    'a6000000-0000-4000-8000-000000000399'
  ) $$,
  '42501', 'referrals are not enabled',
  'disabled rollout blocks new link requests'
);
reset role;

insert into referral_events values
  ('disabled', pg_temp.add_referral_event(
    'disabled', 'friend-disabled',
    (select advocate.public_id from loyalty.referral_advocates as advocate
      join loyalty.customers as customer on customer.id = advocate.customer_id
      where customer.display_reference = 'advocate-one'),
    now() - interval '1 minute', now(), repeat('e', 64)
  ));
select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_events where name = 'disabled')) $$,
  $$ values ('ignored'::text, 'feature_disabled'::text) $$,
  'disabled rollout ignores new attribution at the authoritative worker boundary'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.referral_attributions $$,
  array[3::bigint],
  'rollback preserves every accepted attribution and creates no new value'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'attribution foundation issues no points before qualification and cooling'
);

select * from finish();
rollback;
