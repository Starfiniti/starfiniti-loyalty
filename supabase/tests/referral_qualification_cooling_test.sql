begin;

create extension if not exists pgtap with schema extensions;

select plan(86);

select has_table(
  'loyalty_private', 'referral_qualification_facts',
  'referral qualification evidence is private'
);
select ok(
  (select relrowsecurity from pg_class
    where oid = 'loyalty_private.referral_qualification_facts'::regclass),
  'referral qualification evidence has RLS enabled'
);
select has_trigger(
  'loyalty_private', 'referral_qualification_facts',
  'referral_qualification_facts_immutable',
  'qualification evidence is immutable'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.get_referral_qualification_context_v1(uuid)',
    'EXECUTE'
  ),
  'only the worker can request a derived qualification context'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.get_referral_qualification_context_v1(uuid)',
    'EXECUTE'
  ),
  'browser sessions cannot request qualification authority'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.record_referral_qualification_v1(uuid,bytea,bytea,jsonb,jsonb,timestamp with time zone)',
    'EXECUTE'
  ),
  'the worker can record one evaluated qualification'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.record_referral_qualification_v1(uuid,bytea,bytea,jsonb,jsonb,timestamp with time zone)',
    'EXECUTE'
  ),
  'browser sessions cannot submit spend or qualification evidence'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.reject_referral_for_refund_v1(uuid)',
    'EXECUTE'
  ),
  'the worker can invalidate value-neutral referrals from canonical refunds'
);

insert into auth.users (id, email)
values ('b6000000-0000-4000-8000-000000000001', 'm06-s02-owner@example.test');
insert into loyalty.organizations (public_id, slug, name)
values ('b6000000-0000-4000-8000-000000000100', 'm06-s02', 'M06 S02');
insert into loyalty.organization_memberships (organization_id, user_id, role)
values (
  (select id from loyalty.organizations where slug = 'm06-s02'),
  'b6000000-0000-4000-8000-000000000001', 'owner'
);
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select 'b6000000-0000-4000-8000-000000000110', id, 'store', 'M06 S02 Store'
from loyalty.organizations where slug = 'm06-s02';
insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', 'M06 S02 Rewards'
from loyalty.organizations where slug = 'm06-s02';
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name
)
select 'b6000000-0000-4000-8000-000000000101', organization.id,
  programme_group.id, 'rewards', 'M06 S02 Rewards'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'm06-s02';

create function pg_temp.valid_m06_s02()
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
    'managed', 1, 'test:m06-s02', 'Exercise referral cooling', now() - interval '40 days'
  ) $$,
  'test enters managed deployment mode'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    'b6000000-0000-4000-8000-000000000100', 'programme.v2', 'enabled', null,
    'canary', 'test:m06-s02', 'Enable V2', now() - interval '2 minutes', null
  ) $$,
  'test enables V2'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    'b6000000-0000-4000-8000-000000000100', 'referrals', 'enabled', null,
    'canary', 'test:m06-s02', 'Enable referrals', now() - interval '30 days', null
  ) $$,
  'test enables referrals'
);

set local role authenticated;
set local request.jwt.claim.sub = 'b6000000-0000-4000-8000-000000000001';
select lives_ok(
  $$ select * from loyalty.create_programme_draft_command(
    'b6000000-0000-4000-8000-000000000101', pg_temp.valid_m06_s02(),
    'm06-s02:draft', 'b6000000-0000-4000-8000-000000000201'
  ) $$,
  'strict referral programme draft is accepted'
);
select lives_ok(
  $$ select * from loyalty.publish_programme_version_command(
    (select public_id from loyalty.programme_versions where programme_id =
      (select id from loyalty.programmes where public_id =
        'b6000000-0000-4000-8000-000000000101')),
    (select encode(configuration_sha256, 'hex') from loyalty.programme_versions
      where programme_id = (select id from loyalty.programmes where public_id =
        'b6000000-0000-4000-8000-000000000101')),
    'm06-s02:publish', 'b6000000-0000-4000-8000-000000000202'
  ) $$,
  'strict referral programme publishes'
);
reset role;

insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select 'b6000000-0000-4000-8000-000000000120', organization.id, workspace.id,
  'https://m06-s02.example.test', 'M06 S02 WooCommerce', 'v1',
  'vault://m06-s02', programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
join loyalty.programmes as programme on programme.organization_id = organization.id
where organization.slug = 'm06-s02';

insert into loyalty.customers (public_id, organization_id, display_reference)
select fixture.public_id, organization.id, fixture.reference
from loyalty.organizations as organization
cross join (values
  ('b6000000-0000-4000-8000-000000000150'::uuid, 'advocate'),
  ('b6000000-0000-4000-8000-000000000151'::uuid, 'eligible'),
  ('b6000000-0000-4000-8000-000000000152'::uuid, 'minimum'),
  ('b6000000-0000-4000-8000-000000000153'::uuid, 'existing'),
  ('b6000000-0000-4000-8000-000000000154'::uuid, 'review'),
  ('b6000000-0000-4000-8000-000000000155'::uuid, 'unattributed')
) as fixture(public_id, reference)
where organization.slug = 'm06-s02';
insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  'registered:' || customer.display_reference, 'registered', now()
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.organization_id = (
  select id from loyalty.organizations where slug = 'm06-s02'
);
insert into loyalty.referral_advocates (
  public_id, organization_id, programme_group_id, customer_id,
  source_connection_id
)
select 'b6000000-0000-4000-8000-000000000170', customer.organization_id,
  programme_group.id, customer.id, connection.id
from loyalty.customers as customer
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.display_reference = 'advocate';

create function pg_temp.add_status_event(
  target_suffix text,
  target_order_id text,
  target_customer text,
  target_status text,
  target_occurred_at timestamptz,
  target_referral boolean,
  target_fingerprint text default null
)
returns uuid
language plpgsql
as $$
declare
  target_receipt uuid;
  target_public_id uuid;
  target_order jsonb;
  target_body jsonb;
begin
  target_order := jsonb_build_object(
    'kind', 'order', 'orderId', target_order_id, 'status', target_status,
    'currency', 'EUR', 'currencyMinorUnitDigits', 2, 'market', 'SI',
    'customer', jsonb_build_object(
      'kind', 'registered', 'externalCustomerId', target_customer
    ),
    'paymentKind', 'money', 'lines', '[]'::jsonb,
    'shippingTotal', '0.00', 'shippingRefundedTotal', '0.00',
    'taxTotal', '0.00', 'taxRefundedTotal', '0.00',
    'feeTotal', '0.00', 'feeRefundedTotal', '0.00',
    'discountTotal', '0.00', 'refundedTotal', '0.00'
  );
  if target_referral then
    target_order := target_order || jsonb_build_object(
      'referral', jsonb_build_object(
        'version', '1',
        'advocateCode', 'b6000000-0000-4000-8000-000000000170',
        'capturedAt', target_occurred_at - interval '1 hour',
        'sourceNetworkFingerprint', target_fingerprint,
        'deviceFingerprint', target_fingerprint,
        'paymentFingerprint', target_fingerprint,
        'shippingFingerprint', target_fingerprint
      )
    );
  end if;
  target_body := jsonb_build_object(
    'version', '1', 'payload', jsonb_build_object(
      'kind', 'order_status_changed', 'previousStatus', 'pending',
      'order', target_order
    )
  );
  select receipt_id into strict target_receipt
  from loyalty_private.accept_commerce_delivery(
    (select id from loyalty.organizations where slug = 'm06-s02'),
    (select id from loyalty.commerce_connections where public_id =
      'b6000000-0000-4000-8000-000000000120'),
    'delivery-' || target_suffix, '1', 'event-' || target_suffix,
    'commerce.order.status_changed', target_order_id, target_suffix,
    target_occurred_at, now(), 'v1', 'nonce-' || target_suffix,
    repeat(substr(md5(target_suffix), 1, 1), 64), target_body
  );
  select canonical_event_id into strict target_public_id
  from loyalty_private.normalize_commerce_delivery(target_receipt, 'v1');
  return target_public_id;
end;
$$;

create function pg_temp.add_refund_event(
  target_suffix text,
  target_order_id text,
  target_customer text,
  target_occurred_at timestamptz
)
returns uuid
language plpgsql
as $$
declare
  target_receipt uuid;
  target_public_id uuid;
  target_order jsonb;
  target_body jsonb;
begin
  target_order := jsonb_build_object(
    'kind', 'order', 'orderId', target_order_id, 'status', 'completed',
    'currency', 'EUR', 'currencyMinorUnitDigits', 2, 'market', 'SI',
    'customer', jsonb_build_object(
      'kind', 'registered', 'externalCustomerId', target_customer
    ),
    'paymentKind', 'money', 'lines', '[]'::jsonb,
    'shippingTotal', '0.00', 'shippingRefundedTotal', '0.00',
    'taxTotal', '0.00', 'taxRefundedTotal', '0.00',
    'feeTotal', '0.00', 'feeRefundedTotal', '0.00',
    'discountTotal', '0.00', 'refundedTotal', '50.00'
  );
  target_body := jsonb_build_object(
    'version', '1', 'payload', jsonb_build_object(
      'kind', 'order_refunded', 'refundId', 'refund-' || target_suffix,
      'order', target_order
    )
  );
  select receipt_id into strict target_receipt
  from loyalty_private.accept_commerce_delivery(
    (select id from loyalty.organizations where slug = 'm06-s02'),
    (select id from loyalty.commerce_connections where public_id =
      'b6000000-0000-4000-8000-000000000120'),
    'refund-delivery-' || target_suffix, '1', 'refund-event-' || target_suffix,
    'commerce.order.refunded', target_order_id, target_suffix,
    target_occurred_at, now(), 'v1', 'refund-nonce-' || target_suffix,
    repeat(substr(md5('refund-' || target_suffix), 1, 1), 64), target_body
  );
  select canonical_event_id into strict target_public_id
  from loyalty_private.normalize_commerce_delivery(target_receipt, 'v1');
  return target_public_id;
end;
$$;

create function pg_temp.qualification_result(
  target_event_public_id uuid,
  target_eligible_spend text,
  target_event_id_override text default null
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'version', '2',
    'eventId', coalesce(target_event_id_override,
      'woocommerce:' || event.connection_id::text || ':' || event.source_event_id),
    'source', 'purchase',
    'eligibleSpendMinor', target_eligible_spend,
    'awardedPoints', '0',
    'tierCodeSnapshot', 'rose',
    'pendingAt', event.occurred_at,
    'availableAt', event.occurred_at + interval '30 days',
    'expiresAt', event.occurred_at + interval '365 days',
    'selectedMultiplierRuleCode', null,
    'contributions', '[]'::jsonb,
    'lines', '[]'::jsonb
  )
  from loyalty_private.canonical_commerce_events as event
  where event.public_id = target_event_public_id;
$$;

create temporary table referral_s02_events (
  name text primary key,
  public_id uuid not null
);
insert into referral_s02_events values
  ('existing-prior', pg_temp.add_status_event(
    'existing-prior', 'order-existing-prior', 'existing', 'completed',
    now() - interval '10 days', false, null
  )),
  ('eligible-processing', pg_temp.add_status_event(
    'eligible-processing', 'order-eligible', 'eligible', 'processing',
    now() - interval '2 hours', true, null
  ));

select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_s02_events where name = 'eligible-processing')
  ) $$,
  $$ values ('captured'::text, 'created'::text) $$,
  'processing event captures attribution without qualifying completed policy'
);
select results_eq(
  $$ select current_state, outcome
    from loyalty_private.get_referral_qualification_context_v1(
      (select public_id from referral_s02_events where name = 'eligible-processing')
    ) $$,
  $$ values ('captured'::text, 'status_pending'::text) $$,
  'wrong paid status remains value-neutral and pending'
);

insert into referral_s02_events values
  ('eligible-completed', pg_temp.add_status_event(
    'eligible-completed', 'order-eligible', 'eligible', 'completed',
    now() - interval '1 hour', false, null
  ));
select results_eq(
  $$ select current_state, qualification_status, outcome
    from loyalty_private.get_referral_qualification_context_v1(
      (select public_id from referral_s02_events where name = 'eligible-completed')
    ) $$,
  $$ values ('captured'::text, 'completed'::text, 'ready'::text) $$,
  'configured completed status exposes the immutable policy context'
);
select results_eq(
  $$ select state, outcome
    from loyalty_private.record_referral_qualification_v1(
      (select public_id from referral_s02_events where name = 'eligible-completed'),
      decode(repeat('1', 64), 'hex'), decode(repeat('2', 64), 'hex'),
      pg_temp.qualification_result(
        (select public_id from referral_s02_events where name = 'eligible-completed'),
        '5000'
      ),
      '{"lines":[],"tierMultiplierBasisPoints":10000}'::jsonb,
      now()
    ) $$,
  $$ values ('cooling'::text, 'eligible'::text) $$,
  'eligible new customer enters cooling without receiving value'
);
select results_eq(
  $$ select eligible_spend_minor, is_new_customer, decision
    from loyalty_private.referral_qualification_facts $$,
  $$ values (5000::bigint, true, 'eligible'::text) $$,
  'qualification stores exact spend, new-customer, and decision evidence'
);
select results_eq(
  $$ select (cooling_ends_at - qualified_at = interval '14 days')::text
    from loyalty_private.referral_qualification_facts $$,
  array['true'::text],
  'cooling deadline is derived from the immutable policy and event time'
);
select results_eq(
  $$ select from_state, to_state, reason_code
    from loyalty.referral_attribution_transitions as transition
    join loyalty.referral_attributions as attribution
      on attribution.id = transition.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'eligible'
    order by transition.id desc limit 1 $$,
  $$ values ('captured'::text, 'cooling'::text, 'qualification_passed'::text) $$,
  'qualification appends the captured-to-cooling transition'
);
select results_eq(
  $$ select outcome from loyalty_private.record_referral_qualification_v1(
      (select public_id from referral_s02_events where name = 'eligible-completed'),
      decode(repeat('1', 64), 'hex'), decode(repeat('2', 64), 'hex'),
      pg_temp.qualification_result(
        (select public_id from referral_s02_events where name = 'eligible-completed'),
        '5000'
      ),
      '{"lines":[],"tierMultiplierBasisPoints":10000}'::jsonb,
      now()
    ) $$,
  array['state_final'::text],
  'delayed duplicate status cannot append a second qualification'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.referral_qualification_facts $$,
  array[1::bigint],
  'qualification replay creates one immutable fact'
);

insert into referral_s02_events values
  ('minimum-completed', pg_temp.add_status_event(
    'minimum-completed', 'order-minimum', 'minimum', 'completed',
    now() - interval '50 minutes', true, repeat('a', 64)
  ));
select results_eq(
  $$ select state from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_s02_events where name = 'minimum-completed')
  ) $$,
  array['captured'::text],
  'minimum-spend case receives only a captured attribution first'
);
select throws_ok(
  $$ select * from loyalty_private.record_referral_qualification_v1(
      (select public_id from referral_s02_events where name = 'minimum-completed'),
      decode(repeat('3', 64), 'hex'), decode(repeat('4', 64), 'hex'),
      pg_temp.qualification_result(
        (select public_id from referral_s02_events where name = 'minimum-completed'),
        '1000', 'forged:event'
      ),
      '{}'::jsonb, now()
    ) $$,
  '22023', 'invalid referral qualification evidence',
  'worker evidence cannot be replayed against a different canonical event'
);
select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_qualification_v1(
      (select public_id from referral_s02_events where name = 'minimum-completed'),
      decode(repeat('3', 64), 'hex'), decode(repeat('4', 64), 'hex'),
      pg_temp.qualification_result(
        (select public_id from referral_s02_events where name = 'minimum-completed'),
        '1000'
      ),
      '{}'::jsonb, now()
    ) $$,
  $$ values ('rejected'::text, 'ineligible_minimum_spend'::text) $$,
  'below-minimum order is rejected before cooling'
);
select results_eq(
  $$ select reason_code from loyalty.referral_attribution_transitions as transition
    join loyalty.referral_attributions as attribution
      on attribution.id = transition.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'minimum'
    order by transition.id desc limit 1 $$,
  array['ineligible_minimum_spend'::text],
  'minimum-spend rejection retains a deterministic reason'
);

insert into referral_s02_events values
  ('existing-completed', pg_temp.add_status_event(
    'existing-completed', 'order-existing-referral', 'existing', 'completed',
    now() - interval '40 minutes', true, null
  ));
select results_eq(
  $$ select state from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_s02_events where name = 'existing-completed')
  ) $$,
  array['captured'::text],
  'returning customer attribution is captured before qualification evidence'
);
select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_qualification_v1(
      (select public_id from referral_s02_events where name = 'existing-completed'),
      decode(repeat('5', 64), 'hex'), decode(repeat('6', 64), 'hex'),
      pg_temp.qualification_result(
        (select public_id from referral_s02_events where name = 'existing-completed'),
        '5000'
      ),
      '{}'::jsonb, now()
    ) $$,
  $$ values ('rejected'::text, 'ineligible_existing_customer'::text) $$,
  'earlier paid order makes the referred customer ineligible'
);
select results_eq(
  $$ select reason_code from loyalty.referral_attribution_transitions as transition
    join loyalty.referral_attributions as attribution
      on attribution.id = transition.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'existing'
    order by transition.id desc limit 1 $$,
  array['ineligible_existing_customer'::text],
  'new-customer rejection is explicit and immutable'
);

insert into referral_s02_events values
  ('review-completed', pg_temp.add_status_event(
    'review-completed', 'order-review', 'review', 'completed',
    now() - interval '30 minutes', true, repeat('a', 64)
  ));
select results_eq(
  $$ select state from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_s02_events where name = 'review-completed')
  ) $$,
  array['pending_review'::text],
  'reused keyed evidence remains reversible manual review state'
);
select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_qualification_v1(
      (select public_id from referral_s02_events where name = 'review-completed'),
      decode(repeat('7', 64), 'hex'), decode(repeat('8', 64), 'hex'),
      pg_temp.qualification_result(
        (select public_id from referral_s02_events where name = 'review-completed'),
        '5000'
      ),
      '{}'::jsonb, now()
    ) $$,
  $$ values ('pending_review'::text, 'review_held'::text) $$,
  'eligible risky order records evidence but cannot enter cooling automatically'
);
select results_eq(
  $$ select decision from loyalty_private.referral_qualification_facts as fact
    join loyalty.referral_attributions as attribution
      on attribution.id = fact.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'review' $$,
  array['review_held'::text],
  'review hold remains value-neutral and independently inspectable'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.referral_attribution_transitions as transition
    join loyalty.referral_attributions as attribution
      on attribution.id = transition.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'review' $$,
  array[1::bigint],
  'qualification does not bypass the existing review transition'
);
select throws_ok(
  $$ select * from loyalty_private.record_referral_qualification_v1(
      (select public_id from referral_s02_events where name = 'review-completed'),
      decode(repeat('9', 64), 'hex'), decode(repeat('8', 64), 'hex'),
      pg_temp.qualification_result(
        (select public_id from referral_s02_events where name = 'review-completed'),
        '5000'
      ),
      '{}'::jsonb, now()
    ) $$,
  '23514', 'referral qualification idempotency hash conflict',
  'review-held replay cannot replace accepted qualification evidence'
);

insert into referral_s02_events values
  ('eligible-refund', pg_temp.add_refund_event(
    'eligible-refund', 'order-eligible', 'eligible', now()
  ));
select results_eq(
  $$ select state, outcome from loyalty_private.reject_referral_for_refund_v1(
    (select public_id from referral_s02_events where name = 'eligible-refund')
  ) $$,
  $$ values ('rejected'::text, 'rejected'::text) $$,
  'refund during cooling rejects the value-neutral referral'
);
select results_eq(
  $$ select from_state, to_state, reason_code
    from loyalty.referral_attribution_transitions as transition
    join loyalty.referral_attributions as attribution
      on attribution.id = transition.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'eligible'
    order by transition.id desc limit 1 $$,
  $$ values ('cooling'::text, 'rejected'::text, 'source_order_refunded'::text) $$,
  'refund appends cooling-to-rejected history'
);
select results_eq(
  $$ select state, outcome from loyalty_private.reject_referral_for_refund_v1(
    (select public_id from referral_s02_events where name = 'eligible-refund')
  ) $$,
  $$ values ('rejected'::text, 'state_final'::text) $$,
  'refund replay observes the terminal state without mutation'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.referral_attribution_transitions as transition
    join loyalty.referral_attributions as attribution
      on attribution.id = transition.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'eligible'
      and transition.reason_code = 'source_order_refunded' $$,
  array[1::bigint],
  'refund replay creates one rejection transition'
);
insert into referral_s02_events values
  ('unattributed-refund', pg_temp.add_refund_event(
    'unattributed-refund', 'order-unattributed', 'unattributed', now()
  ));
select results_eq(
  $$ select state, outcome from loyalty_private.reject_referral_for_refund_v1(
    (select public_id from referral_s02_events where name = 'unattributed-refund')
  ) $$,
  $$ values ('ignored'::text, 'no_attribution'::text) $$,
  'ordinary refunds remain outside referral state'
);
select throws_ok(
  $$ update loyalty_private.referral_qualification_facts
    set eligible_spend_minor = eligible_spend_minor + 1 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'qualification evidence cannot be rewritten'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.referral_qualification_facts', 'SELECT'
  ),
  'browser sessions cannot enumerate private qualification evidence'
);
select results_eq(
  $$ select evaluation_kind from loyalty_private.programme_evaluations
    where evaluation_kind = 'referral_qualification'
    order by id $$,
  $$ values ('referral_qualification'::text),
            ('referral_qualification'::text),
            ('referral_qualification'::text),
            ('referral_qualification'::text) $$,
  'every accepted qualification decision retains one immutable evaluation'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'qualification, review, cooling, and refund rejection issue no value'
);

select has_table(
  'loyalty_private', 'referral_reward_jobs',
  'referral reward jobs are private'
);
select has_table(
  'loyalty_private', 'referral_reward_job_attempts',
  'referral reward attempt history is private'
);
select has_table(
  'loyalty_private', 'referral_reward_issuances',
  'referral reward issuance evidence is private'
);
select has_table(
  'loyalty_private', 'referral_reward_compensations',
  'referral reward compensation evidence is private'
);
select ok(
  (select relrowsecurity from pg_class
    where oid = 'loyalty_private.referral_reward_jobs'::regclass),
  'referral reward jobs have RLS enabled'
);
select has_trigger(
  'loyalty_private', 'referral_reward_job_attempts',
  'referral_reward_job_attempts_immutable',
  'reward job attempt history is immutable'
);
select has_trigger(
  'loyalty_private', 'referral_reward_issuances',
  'referral_reward_issuances_immutable',
  'reward issuance evidence is immutable'
);
select has_trigger(
  'loyalty_private', 'referral_reward_compensations',
  'referral_reward_compensations_immutable',
  'reward compensation evidence is immutable'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.claim_due_referral_reward_jobs_v1(text,integer,integer)',
    'EXECUTE'
  ),
  'worker can claim bounded referral reward leases'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.finish_referral_reward_job_v1(uuid,text,text,integer)',
    'EXECUTE'
  ),
  'worker can persist a minimized retry result'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.issue_referral_reward_job_v1(uuid,text)',
    'EXECUTE'
  ),
  'worker can atomically issue accepted referral value'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.issue_referral_reward_job_v1(uuid,text)',
    'EXECUTE'
  ),
  'browser sessions cannot issue referral value'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.referral_reward_jobs', 'SELECT'
  ),
  'browser sessions cannot enumerate referral reward work'
);

insert into loyalty.customers (public_id, organization_id, display_reference)
select 'b6000000-0000-4000-8000-000000000156', organization.id, 'issued'
from loyalty.organizations as organization where organization.slug = 'm06-s02';
insert into loyalty.customer_identities (
  organization_id, customer_id, commerce_connection_id,
  external_customer_id, identity_kind, verified_at
)
select customer.organization_id, customer.id, connection.id,
  'registered:issued', 'registered', now()
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.display_reference = 'issued'
  and customer.organization_id = (
    select id from loyalty.organizations where slug = 'm06-s02'
  );
insert into referral_s02_events values
  ('issued-completed', pg_temp.add_status_event(
    'issued-completed', 'order-issued', 'issued', 'completed',
    now() - interval '15 days', true, null
  ));
select results_eq(
  $$ select state, outcome from loyalty_private.record_referral_attribution_v1(
    (select public_id from referral_s02_events where name = 'issued-completed')
  ) $$,
  $$ values ('captured'::text, 'created'::text) $$,
  'a new paid friend creates one captured referral'
);
select results_eq(
  $$ select state, outcome
    from loyalty_private.record_referral_qualification_v1(
      (select public_id from referral_s02_events where name = 'issued-completed'),
      decode(repeat('a', 64), 'hex'), decode(repeat('b', 64), 'hex'),
      pg_temp.qualification_result(
        (select public_id from referral_s02_events where name = 'issued-completed'),
        '5000'
      ),
      '{"lines":[],"tierMultiplierBasisPoints":10000}'::jsonb,
      now()
    ) $$,
  $$ values ('cooling'::text, 'eligible'::text) $$,
  'eligible friend enters cooling without directly issuing value'
);
select results_eq(
  $$ select state, (next_attempt_at <= now())::text
    from loyalty_private.referral_reward_jobs as job
    join loyalty.referral_attributions as attribution
      on attribution.id = job.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'issued' $$,
  $$ values ('pending'::text, 'true'::text) $$,
  'cooling transition enqueues due internal work from event time'
);
select lives_ok(
  $$ select loyalty_private.set_organization_entitlement(
    'b6000000-0000-4000-8000-000000000100', 'referrals', 'disabled', null,
    'canary', 'test:m06-s03', 'Exercise accepted-job rollback', now(), null
  ) $$,
  'rollout can disable new referral configuration after work is accepted'
);
select results_eq(
  $$ select attempt_count from loyalty_private.claim_due_referral_reward_jobs_v1(
    'worker-a', 25, 60
  ) $$,
  array[1::smallint],
  'worker claims the due referral once with its first bounded attempt'
);
select is_empty(
  $$ select * from loyalty_private.claim_due_referral_reward_jobs_v1(
    'worker-b', 25, 60
  ) $$,
  'an active lease cannot be claimed by a second worker'
);
select throws_ok(
  $$ select * from loyalty_private.issue_referral_reward_job_v1(
    (select public_id from loyalty_private.referral_reward_jobs as job
      join loyalty.referral_attributions as attribution
        on attribution.id = job.attribution_id
      join loyalty.customers as customer
        on customer.id = attribution.friend_customer_id
      where customer.display_reference = 'issued'),
    'worker-b'
  ) $$,
  '42501', 'referral reward job lease is inactive',
  'a different worker cannot spend an active referral lease'
);
select results_eq(
  $$ select state, outcome from loyalty_private.issue_referral_reward_job_v1(
    (select public_id from loyalty_private.referral_reward_jobs as job
      join loyalty.referral_attributions as attribution
        on attribution.id = job.attribution_id
      join loyalty.customers as customer
        on customer.id = attribution.friend_customer_id
      where customer.display_reference = 'issued'),
    'worker-a'
  ) $$,
  $$ values ('qualified'::text, 'created'::text) $$,
  'accepted work atomically qualifies even after rollout is disabled'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
    where transaction_kind = 'award' $$,
  array[2::bigint],
  'qualification creates exactly two award transactions'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
    where transaction_kind = 'release' $$,
  array[2::bigint],
  'qualification immediately releases both referral awards'
);
select results_eq(
  $$ select advocate_points, friend_points
    from loyalty_private.referral_reward_issuances $$,
  $$ values (500::bigint, 250::bigint) $$,
  'issuance retains the immutable give/get values'
);
select results_eq(
  $$ select customer.display_reference, balance.points
    from loyalty.wallet_balances as balance
    join loyalty.wallets as wallet on wallet.id = balance.wallet_id
    join loyalty.customers as customer on customer.id = wallet.customer_id
    where balance.account_kind = 'available' and balance.points > 0
    order by customer.display_reference $$,
  $$ values ('advocate'::text, 500::bigint), ('issued'::text, 250::bigint) $$,
  'both customer wallets receive their exact available value'
);
select results_eq(
  $$ select count(*)::bigint,
      bool_and(expires_at - available_at = interval '365 days')::text
    from loyalty.point_lots $$,
  $$ values (2::bigint, 'true'::text) $$,
  'both releases create FIFO lots using the historical programme expiry policy'
);
select results_eq(
  $$ select customer.display_reference, fact.fact_kind,
      fact.earned_points_delta, fact.referral_count_delta
    from loyalty_private.tier_qualification_facts as fact
    join loyalty.customers as customer on customer.id = fact.customer_id
    join loyalty_private.programme_evaluations as evaluation
      on evaluation.id = fact.evaluation_id
    where evaluation.evaluation_kind = 'referral_reward'
    order by customer.display_reference $$,
  $$ values
    ('advocate'::text, 'referral'::text, 500::bigint, 1::smallint),
    ('issued'::text, 'points_adjustment'::text, 250::bigint, 0::smallint) $$,
  'both sides retain exact immutable tier evidence'
);
select results_eq(
  $$ select from_state, to_state, reason_code
    from loyalty.referral_attribution_transitions as transition
    join loyalty.referral_attributions as attribution
      on attribution.id = transition.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'issued'
    order by transition.id desc limit 1 $$,
  $$ values ('cooling'::text, 'qualified'::text, 'cooling_completed'::text) $$,
  'state becomes qualified only after both ledger effects exist'
);
select results_eq(
  $$ select state, attempt_count from loyalty_private.referral_reward_jobs as job
    join loyalty.referral_attributions as attribution
      on attribution.id = job.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'issued' $$,
  $$ values ('completed'::text, 1::smallint) $$,
  'successful referral work becomes nonclaimable and retains attempt count'
);
select results_eq(
  $$ select state, outcome from loyalty_private.issue_referral_reward_job_v1(
    (select public_id from loyalty_private.referral_reward_jobs as job
      join loyalty.referral_attributions as attribution
        on attribution.id = job.attribution_id
      join loyalty.customers as customer
        on customer.id = attribution.friend_customer_id
      where customer.display_reference = 'issued'),
    'worker-a'
  ) $$,
  $$ values ('qualified'::text, 'duplicate'::text) $$,
  'unknown worker acknowledgement retry returns the existing issuance'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[4::bigint],
  'issuance replay cannot duplicate either ledger pair'
);

insert into referral_s02_events values
  ('issued-refund', pg_temp.add_refund_event(
    'issued-refund', 'order-issued', 'issued', now()
  ));
select results_eq(
  $$ select state, outcome from loyalty_private.reject_referral_for_refund_v1(
    (select public_id from referral_s02_events where name = 'issued-refund')
  ) $$,
  $$ values ('reversed'::text, 'reversed'::text) $$,
  'refund atomically compensates both issued referral sides'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
    where transaction_kind = 'refund_reversal' $$,
  array[2::bigint],
  'refund creates exactly two linked reversal transactions'
);
select results_eq(
  $$ select count(*)::bigint
    from loyalty_private.referral_reward_compensations $$,
  array[1::bigint],
  'refund records one immutable two-sided compensation'
);
select results_eq(
  $$ select customer.display_reference, balance.points
    from loyalty.wallet_balances as balance
    join loyalty.wallets as wallet on wallet.id = balance.wallet_id
    join loyalty.customers as customer on customer.id = wallet.customer_id
    where balance.account_kind = 'available'
      and customer.display_reference in ('advocate', 'issued')
    order by customer.display_reference $$,
  $$ values ('advocate'::text, 0::bigint), ('issued'::text, 0::bigint) $$,
  'refund removes the available referral value from both wallets'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.point_lot_balances
    where remaining_points = 0 $$,
  array[2::bigint],
  'refund consumes both referral lots exactly once'
);
select results_eq(
  $$ select customer.display_reference, fact.earned_points_delta,
      fact.referral_count_delta
    from loyalty_private.tier_qualification_facts as fact
    join loyalty.customers as customer on customer.id = fact.customer_id
    where fact.fact_kind = 'referral_reversal'
    order by customer.display_reference $$,
  $$ values
    ('advocate'::text, -500::bigint, -1::smallint),
    ('issued'::text, -250::bigint, 0::smallint) $$,
  'refund appends compensating tier facts for both customers'
);
select results_eq(
  $$ select from_state, to_state, reason_code
    from loyalty.referral_attribution_transitions as transition
    join loyalty.referral_attributions as attribution
      on attribution.id = transition.attribution_id
    join loyalty.customers as customer
      on customer.id = attribution.friend_customer_id
    where customer.display_reference = 'issued'
    order by transition.id desc limit 1 $$,
  $$ values ('qualified'::text, 'reversed'::text, 'source_order_refunded'::text) $$,
  'qualified state moves to reversed only after compensation succeeds'
);
select results_eq(
  $$ select state, outcome from loyalty_private.reject_referral_for_refund_v1(
    (select public_id from referral_s02_events where name = 'issued-refund')
  ) $$,
  $$ values ('reversed'::text, 'state_final'::text) $$,
  'refund replay observes the terminal state without another reversal'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[6::bigint],
  'refund replay leaves the complete ledger effect count unchanged'
);
select throws_ok(
  $$ update loyalty_private.referral_reward_issuances
    set advocate_points = advocate_points + 1 $$,
  '55000', 'immutable loyalty history cannot be changed',
  'issued referral evidence cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty_private.referral_reward_compensations $$,
  '55000', 'immutable loyalty history cannot be changed',
  'compensation evidence cannot be deleted'
);
select throws_ok(
  $$ update loyalty_private.referral_reward_job_attempts
    set outcome = 'retryable' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'job attempt history cannot be rewritten'
);

select * from finish();
rollback;
