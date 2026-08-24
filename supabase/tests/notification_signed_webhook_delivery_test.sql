begin;

create extension if not exists pgtap with schema extensions;

select plan(58);

grant loyalty_worker to current_user;
grant usage on schema extensions to loyalty_worker;
grant execute on all functions in schema extensions to loyalty_worker;

select has_table(
  'loyalty_private', 'notification_webhook_endpoints',
  'webhook endpoints are private'
);
select has_table(
  'loyalty_private', 'notification_webhook_deliveries',
  'webhook delivery leases are private'
);
select has_table(
  'loyalty_private', 'notification_webhook_attempts',
  'webhook attempts retain minimized evidence'
);
select has_table(
  'loyalty_private', 'notification_webhook_rate_windows',
  'webhook rate windows are database-authoritative'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_webhook_endpoints'::regclass),
  'endpoint bindings have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_webhook_deliveries'::regclass),
  'delivery leases have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_webhook_attempts'::regclass),
  'attempt evidence has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_webhook_rate_windows'::regclass),
  'rate windows have RLS enabled'
);
select has_trigger(
  'loyalty_private', 'notification_webhook_attempts',
  'notification_webhook_attempts_immutable',
  'webhook attempt history cannot be rewritten'
);
select has_function(
  'loyalty_private', 'claim_notification_webhook_deliveries_v1',
  array['uuid', 'text', 'text', 'text', 'integer', 'integer'],
  'endpoint-bound webhook claim exists'
);
select has_function(
  'loyalty_private', 'authorize_notification_webhook_dispatch_v1',
  array['uuid', 'text', 'text', 'uuid', 'text'],
  'last-moment webhook authorization exists'
);
select has_function(
  'loyalty_private', 'finish_notification_webhook_delivery_v1',
  array['uuid', 'text', 'text', 'uuid', 'text', 'text', 'integer', 'text', 'integer'],
  'bounded webhook finish command exists'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.claim_notification_webhook_deliveries_v1(uuid,text,text,text,integer,integer)',
    'EXECUTE'
  ) and has_function_privilege(
    'loyalty_worker',
    'loyalty_private.authorize_notification_webhook_dispatch_v1(uuid,text,text,uuid,text)',
    'EXECUTE'
  ),
  'worker can claim and authorize only through protected commands'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.finish_notification_webhook_delivery_v1(uuid,text,text,uuid,text,text,integer,text,integer)',
    'EXECUTE'
  ) and not has_table_privilege(
    'loyalty_worker', 'loyalty_private.notification_webhook_deliveries', 'SELECT'
  ),
  'worker records bounded results without enumerating deliveries'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.authorize_notification_webhook_dispatch_v1(uuid,text,text,uuid,text)',
    'EXECUTE'
  ) and not has_table_privilege(
    'authenticated', 'loyalty_private.notification_webhook_endpoints', 'SELECT'
  ),
  'browser sessions cannot enumerate or authorize endpoint work'
);
select hasnt_column(
  'loyalty_private', 'notification_webhook_endpoints', 'signing_secret',
  'endpoint rows never store signing secrets'
);
select hasnt_column(
  'loyalty_private', 'notification_webhook_deliveries', 'payload',
  'delivery leases never copy event payloads'
);
select hasnt_column(
  'loyalty_private', 'notification_webhook_attempts', 'response_body',
  'attempt evidence never stores receiver bodies'
);
select hasnt_column(
  'loyalty_private', 'notification_webhook_attempts', 'destination_url',
  'attempt evidence never stores destinations'
);
select hasnt_column(
  'loyalty_private', 'notification_webhook_attempts', 'signature',
  'attempt evidence never stores signatures'
);

insert into loyalty.organizations(public_id, slug, name) values
  ('c1000000-0000-4000-8000-000000000100', 'webhook-one', 'Webhook One'),
  ('c2000000-0000-4000-8000-000000000100', 'webhook-two', 'Webhook Two');
insert into loyalty.programme_groups(public_id, organization_id, slug, name)
select case organization.slug
    when 'webhook-one' then 'c1000000-0000-4000-8000-000000000120'::uuid
    else 'c2000000-0000-4000-8000-000000000120'::uuid end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('webhook-one', 'webhook-two');
insert into loyalty.customers(public_id, organization_id, display_reference)
select case organization.slug
    when 'webhook-one' then 'c1000000-0000-4000-8000-000000000150'::uuid
    else 'c2000000-0000-4000-8000-000000000150'::uuid end,
  organization.id, organization.name || ' Customer'
from loyalty.organizations as organization
where organization.slug in ('webhook-one', 'webhook-two');

select loyalty_private.set_deployment_mode(
  'self_hosted', 1, 'operator:webhook-test',
  'Exercise generic webhook delivery', pg_catalog.clock_timestamp()
);
select loyalty_private.set_organization_entitlement(
  organization.public_id, 'notifications', 'enabled', null, 'local_control',
  'operator:webhook-test', 'Enable webhook delivery tests',
  pg_catalog.clock_timestamp(), null
)
from loyalty.organizations as organization
where organization.slug in ('webhook-one', 'webhook-two');

insert into loyalty_private.notification_webhook_endpoints(
  public_id, organization_id, destination_url, allowed_origin,
  current_secret_sha256, previous_secret_sha256,
  previous_secret_expires_at, event_types, rate_limit_per_minute, state
)
select case organization.slug
    when 'webhook-one' then 'c1000000-0000-4000-8000-000000000170'::uuid
    else 'c2000000-0000-4000-8000-000000000170'::uuid end,
  organization.id,
  case organization.slug
    when 'webhook-one' then 'https://hooks.example.test/loyalty'
    else 'https://hooks-two.example.test/loyalty' end,
  case organization.slug
    when 'webhook-one' then 'https://hooks.example.test'
    else 'https://hooks-two.example.test' end,
  pg_catalog.decode(case organization.slug
    when 'webhook-one' then repeat('ab', 32) else repeat('ef', 32) end, 'hex'),
  case when organization.slug = 'webhook-one'
    then pg_catalog.decode(repeat('cd', 32), 'hex') else null end,
  case when organization.slug = 'webhook-one'
    then '2099-01-01T00:00:00Z'::timestamptz else null end,
  case organization.slug when 'webhook-one' then array[
    'loyalty.billing.changed', 'loyalty.campaign.effect',
    'loyalty.connector.health', 'loyalty.points.released'
  ]::text[] else array['loyalty.connector.health']::text[] end,
  case when organization.slug = 'webhook-two' then 1 else 60 end,
  'active'
from loyalty.organizations as organization
where organization.slug in ('webhook-one', 'webhook-two');

create function pg_temp.wh_org(target_slug text)
returns bigint language sql stable security definer set search_path = '' as $$
  select id from loyalty.organizations where slug = target_slug;
$$;
create function pg_temp.wh_group(target_slug text)
returns bigint language sql stable security definer set search_path = '' as $$
  select programme_group.id
  from loyalty.programme_groups as programme_group
  join loyalty.organizations as organization
    on organization.id = programme_group.organization_id
  where organization.slug = target_slug;
$$;
create function pg_temp.wh_customer(target_slug text)
returns bigint language sql stable security definer set search_path = '' as $$
  select customer.id
  from loyalty.customers as customer
  join loyalty.organizations as organization
    on organization.id = customer.organization_id
  where organization.slug = target_slug;
$$;
create function pg_temp.wh_endpoint(target_slug text)
returns uuid language sql stable security definer set search_path = '' as $$
  select endpoint.public_id
  from loyalty_private.notification_webhook_endpoints as endpoint
  join loyalty.organizations as organization
    on organization.id = endpoint.organization_id
  where organization.slug = target_slug;
$$;
create function pg_temp.wh_delivery(target_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select delivery.public_id
  from loyalty_private.notification_webhook_deliveries as delivery
  join loyalty_private.notification_events as event
    on event.organization_id = delivery.organization_id
   and event.id = delivery.notification_event_id
  where event.deduplication_key = target_key;
$$;

create temporary table webhook_ledger_before as
select count(*)::bigint as transaction_count from loyalty.ledger_transactions;

set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.wh_org('webhook-one'), pg_temp.wh_group('webhook-one'),
       pg_temp.wh_customer('webhook-one'), 'loyalty.points.released',
       'ledger_release', 'release:webhook-one', 'webhook:event:one',
       '2026-08-24T08:00:00Z',
       '{"points":"25","availableBalance":"125"}'::jsonb
     ) $$,
  array['created'::text],
  'provider-neutral event is created independently of webhook delivery'
);
reset role;
select is(
  (select count(*) from loyalty_private.notification_webhook_deliveries
   where organization_id = pg_temp.wh_org('webhook-one')),
  1::bigint,
  'one subscribed endpoint receives one delivery projection'
);
set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.wh_org('webhook-one'), pg_temp.wh_group('webhook-one'),
       pg_temp.wh_customer('webhook-one'), 'loyalty.points.released',
       'ledger_release', 'release:webhook-one', 'webhook:event:one',
       '2026-08-24T08:00:00Z',
       '{"points":"25","availableBalance":"125"}'::jsonb
     ) $$,
  array['duplicate'::text],
  'exact event replay is idempotent before provider projection'
);
select throws_ok(
  $$ select * from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('00', 32), repeat('cd', 32),
       'webhook-worker-one', 1, 60
     ) $$,
  '42501', 'webhook endpoint not authorized',
  'wrong current secret fingerprint cannot claim work'
);
select throws_ok(
  $$ select * from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('00', 32),
       'webhook-worker-one', 1, 60
     ) $$,
  '42501', 'webhook endpoint not authorized',
  'wrong rotation fingerprint cannot claim work'
);
select throws_ok(
  $$ select * from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), null,
       'webhook-worker-one', 1, 60
     ) $$,
  '42501', 'webhook endpoint not authorized',
  'active rotation overlap requires both exact fingerprints'
);
select results_eq(
  $$ select delivery_public_id
     from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       'webhook-worker-one', 1, 60
     ) $$,
  $$ values (pg_temp.wh_delivery('webhook:event:one')) $$,
  'matching endpoint worker claims the exact delivery identity only'
);
select throws_ok(
  $$ select * from loyalty_private.authorize_notification_webhook_dispatch_v1(
       pg_temp.wh_endpoint('webhook-two'), repeat('ef', 32), null,
       pg_temp.wh_delivery('webhook:event:one'), 'webhook-worker-one'
     ) $$,
  '42501', 'webhook delivery lease not owned',
  'another tenant endpoint cannot authorize the claimed delivery'
);
select results_eq(
  $$ select outcome, destination_url, event ->> 'eventType',
       event #>> '{subject,customerId}',
       event ?| array[
         'email', 'phone', 'coupon', 'ledger', 'signingSecret',
         'sourceReference'
       ]
     from loyalty_private.authorize_notification_webhook_dispatch_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       pg_temp.wh_delivery('webhook:event:one'), 'webhook-worker-one'
     ) $$,
  $$ values (
       'authorized'::text, 'https://hooks.example.test/loyalty'::text,
       'loyalty.points.released'::text,
       'c1000000-0000-4000-8000-000000000150'::text,
       false
     ) $$,
  'last-moment authorization returns the strict minimized event only once'
);
select results_eq(
  $$ select state, outcome
     from loyalty_private.finish_notification_webhook_delivery_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       pg_temp.wh_delivery('webhook:event:one'), 'webhook-worker-one',
       'delivered', 204, null, null
     ) $$,
  $$ values ('completed'::text, 'delivered'::text) $$,
  '2xx acceptance completes the stable delivery once'
);
select is(
  (select count(*) from loyalty_private.claim_notification_webhook_deliveries_v1(
     pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
     'webhook-worker-one', 1, 60
   )),
  0::bigint,
  'completed delivery is never claimed again'
);

select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.wh_org('webhook-one'), pg_temp.wh_group('webhook-one'),
       pg_temp.wh_customer('webhook-one'), 'loyalty.campaign.effect',
       'campaign_effect', 'campaign:webhook-one', 'webhook:event:marketing',
       '2026-08-24T08:01:00Z',
       '{"campaignVersionId":"c1000000-0000-4000-8000-000000000180","outcome":"points_awarded","points":"5"}'::jsonb
     ) $$,
  array['created'::text],
  'marketing event is recorded before consent filtering'
);
select lives_ok(
  $$ select * from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       'webhook-worker-one', 1, 60
     ) $$,
  'marketing delivery can be claimed without disclosing its payload'
);
select results_eq(
  $$ select outcome
     from loyalty_private.authorize_notification_webhook_dispatch_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       pg_temp.wh_delivery('webhook:event:marketing'), 'webhook-worker-one'
     ) $$,
  array['suppressed'::text],
  'marketing defaults to unsubscribed at dispatch authorization'
);

reset role;
with preference_event as (
  insert into loyalty_private.notification_preference_events(
    public_id, organization_id, customer_id, channel, purpose, from_state,
    to_state, source, policy_version, reason_code, idempotency_key,
    request_sha256, effective_at
  ) values (
    'c1000000-0000-4000-8000-000000000190',
    pg_temp.wh_org('webhook-one'), pg_temp.wh_customer('webhook-one'),
    'email', 'loyalty_transactional', 'subscribed', 'unsubscribed', 'system',
    'system-v1', 'merchant_request', 'webhook:preference:unsubscribe',
    pg_catalog.decode(repeat('12', 32), 'hex'), '2026-08-24T08:02:00Z'
  ) returning id
)
insert into loyalty_private.notification_preferences(
  organization_id, customer_id, channel, purpose, state, source,
  policy_version, effective_at, last_event_id, updated_at
)
select pg_temp.wh_org('webhook-one'), pg_temp.wh_customer('webhook-one'),
  'email', 'loyalty_transactional', 'unsubscribed', 'system', 'system-v1',
  '2026-08-24T08:02:00Z', id, '2026-08-24T08:02:00Z'
from preference_event;
set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.wh_org('webhook-one'), pg_temp.wh_group('webhook-one'),
       pg_temp.wh_customer('webhook-one'), 'loyalty.points.released',
       'ledger_release', 'release:webhook-two', 'webhook:event:withdrawn',
       '2026-08-24T08:03:00Z',
       '{"points":"10","availableBalance":"135"}'::jsonb
     ) $$,
  array['created'::text],
  'transactional event remains provider-neutral after withdrawal'
);
select lives_ok(
  $$ select * from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       'webhook-worker-one', 1, 60
     ) $$,
  'withdrawn event claim remains payload-free'
);
select results_eq(
  $$ select outcome
     from loyalty_private.authorize_notification_webhook_dispatch_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       pg_temp.wh_delivery('webhook:event:withdrawn'), 'webhook-worker-one'
     ) $$,
  array['suppressed'::text],
  'current transactional withdrawal blocks dispatch'
);

reset role;
select loyalty_private.set_organization_entitlement(
  'c1000000-0000-4000-8000-000000000100', 'notifications', 'disabled', null,
  'local_control', 'operator:webhook-test', 'Exercise webhook rollback',
  pg_catalog.clock_timestamp(), null
);
insert into loyalty_private.notification_events(
  public_id, organization_id, schema_version, event_type, purpose, locale,
  source_kind, source_reference, deduplication_key, occurred_at, payload,
  event_sha256
) values (
  'c1000000-0000-4000-8000-000000000201',
  pg_temp.wh_org('webhook-one'), '1', 'loyalty.connector.health',
  'merchant_operational', 'en', 'connector_health', 'connection:webhook-one',
  'webhook:event:held', '2026-08-24T08:04:00Z',
  '{"connectionId":"c1000000-0000-4000-8000-000000000202","state":"offline","errorCode":"timeout"}'::jsonb,
  pg_catalog.decode(repeat('21', 32), 'hex')
);
set local role loyalty_worker;
select lives_ok(
  $$ select * from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       'webhook-worker-one', 1, 60
     ) $$,
  'disabled entitlement does not erase queued work'
);
select results_eq(
  $$ select outcome
     from loyalty_private.authorize_notification_webhook_dispatch_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       pg_temp.wh_delivery('webhook:event:held'), 'webhook-worker-one'
     ) $$,
  array['held'::text],
  'disabled entitlement holds work before destination or payload disclosure'
);

reset role;
select loyalty_private.set_organization_entitlement(
  'c1000000-0000-4000-8000-000000000100', 'notifications', 'enabled', null,
  'local_control', 'operator:webhook-test', 'Restore webhook test entitlement',
  pg_catalog.clock_timestamp(), null
);
set local role loyalty_worker;
select results_eq(
  $$ select delivery_public_id
     from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       'webhook-worker-one', 1, 60
     ) $$,
  $$ values (pg_temp.wh_delivery('webhook:event:held')) $$,
  'restored entitlement makes held work claimable without recreating it'
);
select results_eq(
  $$ select outcome, event ->> 'eventType'
     from loyalty_private.authorize_notification_webhook_dispatch_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       pg_temp.wh_delivery('webhook:event:held'), 'webhook-worker-one'
     ) $$,
  $$ values ('authorized'::text, 'loyalty.connector.health'::text) $$,
  'resumed held work rechecks and receives current dispatch authority'
);
select throws_ok(
  $$ select * from loyalty_private.finish_notification_webhook_delivery_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       pg_temp.wh_delivery('webhook:event:held'), 'webhook-worker-one',
       'delivered', null, null, null
     ) $$,
  '22023', 'invalid successful webhook result',
  'a delivered outcome requires an actual 2xx response'
);
select results_eq(
  $$ select state
     from loyalty_private.finish_notification_webhook_delivery_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), repeat('cd', 32),
       pg_temp.wh_delivery('webhook:event:held'), 'webhook-worker-one',
       'delivered', 204, null, null
     ) $$,
  array['completed'::text],
  'resumed held work can complete without duplicate event creation'
);

reset role;
update loyalty_private.notification_webhook_endpoints
set previous_secret_sha256 = null, previous_secret_expires_at = null
where public_id = pg_temp.wh_endpoint('webhook-one');
insert into loyalty_private.notification_events(
  public_id, organization_id, schema_version, event_type, purpose, locale,
  source_kind, source_reference, deduplication_key, occurred_at, payload,
  event_sha256
) values (
  'c1000000-0000-4000-8000-000000000203',
  pg_temp.wh_org('webhook-one'), '1', 'loyalty.connector.health',
  'merchant_operational', 'en', 'connector_health', 'connection:webhook-one',
  'webhook:event:rotated', '2026-08-24T08:05:00Z',
  '{"connectionId":"c1000000-0000-4000-8000-000000000202","state":"healthy","errorCode":null}'::jsonb,
  pg_catalog.decode(repeat('22', 32), 'hex')
);
set local role loyalty_worker;
select results_eq(
  $$ select delivery_public_id
     from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), null,
       'webhook-worker-one', 1, 60
     ) $$,
  $$ values (pg_temp.wh_delivery('webhook:event:rotated')) $$,
  'retired rotation key is no longer required after atomic overlap removal'
);
select lives_ok(
  $$ select * from loyalty_private.authorize_notification_webhook_dispatch_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), null,
       pg_temp.wh_delivery('webhook:event:rotated'), 'webhook-worker-one'
     ) $$,
  'current key alone authorizes after rotation overlap closes'
);
select lives_ok(
  $$ select * from loyalty_private.finish_notification_webhook_delivery_v1(
       pg_temp.wh_endpoint('webhook-one'), repeat('ab', 32), null,
       pg_temp.wh_delivery('webhook:event:rotated'), 'webhook-worker-one',
       'delivered', 200, null, null
     ) $$,
  'rotated current key completes delivery'
);

reset role;
insert into loyalty_private.notification_events(
  public_id, organization_id, schema_version, event_type, purpose, locale,
  source_kind, source_reference, deduplication_key, occurred_at, payload,
  event_sha256
) values
  (
    'c2000000-0000-4000-8000-000000000201',
    pg_temp.wh_org('webhook-two'), '1', 'loyalty.connector.health',
    'merchant_operational', 'en', 'connector_health', 'connection:webhook-two',
    'webhook:rate:one', '2026-08-24T08:06:00Z',
    '{"connectionId":"c2000000-0000-4000-8000-000000000202","state":"degraded","errorCode":"lag"}'::jsonb,
    pg_catalog.decode(repeat('31', 32), 'hex')
  ),
  (
    'c2000000-0000-4000-8000-000000000203',
    pg_temp.wh_org('webhook-two'), '1', 'loyalty.connector.health',
    'merchant_operational', 'en', 'connector_health', 'connection:webhook-two',
    'webhook:rate:two', '2026-08-24T08:06:01Z',
    '{"connectionId":"c2000000-0000-4000-8000-000000000202","state":"degraded","errorCode":"lag"}'::jsonb,
    pg_catalog.decode(repeat('32', 32), 'hex')
  );
set local role loyalty_worker;
select is(
  (select count(*) from loyalty_private.claim_notification_webhook_deliveries_v1(
     pg_temp.wh_endpoint('webhook-two'), repeat('ef', 32), null,
     'webhook-worker-two', 10, 60
   )),
  1::bigint,
  'database rate window claims only the configured attempts per minute'
);
select lives_ok(
  $$ select * from loyalty_private.authorize_notification_webhook_dispatch_v1(
       pg_temp.wh_endpoint('webhook-two'), repeat('ef', 32), null,
       pg_temp.wh_delivery('webhook:rate:one'), 'webhook-worker-two'
     ) $$,
  'rate-limited claim can authorize one dispatch'
);
select results_eq(
  $$ select state
     from loyalty_private.finish_notification_webhook_delivery_v1(
       pg_temp.wh_endpoint('webhook-two'), repeat('ef', 32), null,
       pg_temp.wh_delivery('webhook:rate:one'), 'webhook-worker-two',
       'retryable', 429, null, 75
     ) $$,
  array['retryable'::text],
  '429 with Retry-After schedules a bounded retry'
);
select is(
  (select count(*) from loyalty_private.claim_notification_webhook_deliveries_v1(
     pg_temp.wh_endpoint('webhook-two'), repeat('ef', 32), null,
     'webhook-worker-two', 10, 60
   )),
  0::bigint,
  'same database minute cannot exceed endpoint rate limit'
);

reset role;
update loyalty_private.notification_webhook_rate_windows
set window_started_at = pg_catalog.date_trunc('minute', pg_catalog.clock_timestamp())
    - interval '1 minute',
  claimed_attempts = 0, updated_at = pg_catalog.clock_timestamp()
where endpoint_id = (
  select id from loyalty_private.notification_webhook_endpoints
  where public_id = pg_temp.wh_endpoint('webhook-two')
);
update loyalty_private.notification_webhook_deliveries
set next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
where public_id = pg_temp.wh_delivery('webhook:rate:one');
set local role loyalty_worker;
select lives_ok(
  $$ select * from loyalty_private.claim_notification_webhook_deliveries_v1(
       pg_temp.wh_endpoint('webhook-two'), repeat('ef', 32), null,
       'webhook-worker-two', 1, 60
     ) $$,
  'next database window can reclaim due retry work'
);
select lives_ok(
  $$ select * from loyalty_private.authorize_notification_webhook_dispatch_v1(
       pg_temp.wh_endpoint('webhook-two'), repeat('ef', 32), null,
       pg_temp.wh_delivery('webhook:rate:one'), 'webhook-worker-two'
     ) $$,
  'due retry rechecks all dispatch authority'
);
select results_eq(
  $$ select state, outcome
     from loyalty_private.finish_notification_webhook_delivery_v1(
       pg_temp.wh_endpoint('webhook-two'), repeat('ef', 32), null,
       pg_temp.wh_delivery('webhook:rate:one'), 'webhook-worker-two',
       'dead_letter', 410, 'webhook_endpoint_gone', null
     ) $$,
  $$ values ('dead_letter'::text, 'dead_letter'::text) $$,
  '410 terminates the delivery'
);
reset role;
select is(
  (select state from loyalty_private.notification_webhook_endpoints
   where public_id = pg_temp.wh_endpoint('webhook-two')),
  'disabled',
  '410 disables future endpoint work'
);

update loyalty_private.notification_webhook_endpoints
set event_types = array[
  'loyalty.billing.changed', 'loyalty.campaign.effect',
  'loyalty.connector.health'
]::text[]
where public_id = pg_temp.wh_endpoint('webhook-one');
insert into loyalty_private.notification_events(
  public_id, organization_id, programme_group_id, customer_id,
  schema_version, event_type, purpose, locale, source_kind, source_reference,
  deduplication_key, occurred_at, payload, event_sha256
) values (
  'c1000000-0000-4000-8000-000000000204',
  pg_temp.wh_org('webhook-one'), pg_temp.wh_group('webhook-one'),
  pg_temp.wh_customer('webhook-one'), '1', 'loyalty.points.released',
  'loyalty_transactional', 'en', 'ledger_release', 'release:webhook-three',
  'webhook:event:removed', '2026-08-24T08:07:00Z',
  '{"points":"10","availableBalance":"145"}'::jsonb,
  pg_catalog.decode(repeat('23', 32), 'hex')
);
select is(
  pg_temp.wh_delivery('webhook:event:removed'),
  null::uuid,
  'removed event subscription does not enqueue new deliveries'
);

select throws_ok(
  $$ update loyalty_private.notification_webhook_endpoints
     set organization_id = pg_temp.wh_org('webhook-two')
     where public_id = pg_temp.wh_endpoint('webhook-one') $$,
  '23514', 'webhook endpoint identity is immutable',
  'endpoint identity cannot move across tenants'
);
select throws_ok(
  $$ update loyalty_private.notification_webhook_attempts
     set error_code = 'rewritten'
     where delivery_id = (
       select id from loyalty_private.notification_webhook_deliveries
       where public_id = pg_temp.wh_delivery('webhook:event:one')
     ) $$,
  '55000', 'immutable loyalty history cannot be changed',
  'webhook attempt evidence cannot be rewritten'
);
select is(
  (select count(*) from loyalty.ledger_transactions),
  (select transaction_count from webhook_ledger_before),
  'webhook events retries consent and endpoint changes never mutate the ledger'
);

select * from finish();
rollback;
