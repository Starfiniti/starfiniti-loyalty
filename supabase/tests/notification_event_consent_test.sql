begin;

create extension if not exists pgtap with schema extensions;

select plan(50);

grant loyalty_worker to current_user;
grant usage on schema extensions to loyalty_worker;
grant execute on all functions in schema extensions to loyalty_worker;

select has_table(
  'loyalty_private', 'notification_events',
  'provider-neutral notification events are retained privately'
);
select has_table(
  'loyalty_private', 'notification_preference_events',
  'consent and suppression decisions are append-only private evidence'
);
select has_table(
  'loyalty_private', 'notification_preferences',
  'current notification eligibility has a private projection'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_events'::regclass),
  'notification events have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_preference_events'::regclass),
  'preference events have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_preferences'::regclass),
  'preference projections have RLS enabled'
);
select has_trigger(
  'loyalty_private', 'notification_events', 'notification_events_immutable',
  'notification events cannot be rewritten'
);
select has_trigger(
  'loyalty_private', 'notification_preference_events',
  'notification_preference_events_immutable',
  'consent and suppression history cannot be rewritten'
);
select has_function(
  'loyalty', 'get_my_notification_preferences_v1', array[]::text[],
  'customer preference read contract exists'
);
select has_function(
  'loyalty', 'set_my_notification_preference_v1',
  array['uuid', 'text', 'text', 'text', 'uuid'],
  'customer preference command exists'
);
select ok(
  has_function_privilege(
    'authenticated', 'loyalty.get_my_notification_preferences_v1()', 'EXECUTE'
  ),
  'authenticated customers can read their own notification preferences'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.set_my_notification_preference_v1(uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated customers can change only their own preferences'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.set_my_notification_preference_v1(uuid,text,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous sessions cannot change notification preferences'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.emit_notification_event_v1(bigint,bigint,bigint,text,text,text,text,timestamp with time zone,jsonb)',
    'EXECUTE'
  ),
  'worker can append a strict provider-neutral event'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.record_notification_suppression_v1(bigint,bigint,text,boolean,text,text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'worker can record trusted provider suppression'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.emit_notification_event_v1(bigint,bigint,bigint,text,text,text,text,timestamp with time zone,jsonb)',
    'EXECUTE'
  ),
  'browser sessions cannot forge notification events'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.notification_events', 'SELECT'
  ),
  'browser sessions cannot enumerate private event evidence'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.notification_preferences', 'SELECT'
  ),
  'worker cannot bypass the protected preference boundary'
);

insert into auth.users (id, email)
values
  ('91000000-0000-4000-8000-000000000001', 'notify-one@example.test'),
  ('92000000-0000-4000-8000-000000000001', 'notify-two@example.test');
insert into loyalty.organizations (public_id, slug, name)
values
  ('91000000-0000-4000-8000-000000000100', 'notify-one', 'Notify One'),
  ('92000000-0000-4000-8000-000000000100', 'notify-two', 'Notify Two');
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'notify-one' then '91000000-0000-4000-8000-000000000110'::uuid
    else '92000000-0000-4000-8000-000000000110'::uuid end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('notify-one', 'notify-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug
    when 'notify-one' then '91000000-0000-4000-8000-000000000120'::uuid
    else '92000000-0000-4000-8000-000000000120'::uuid end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('notify-one', 'notify-two');
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select case organization.slug
    when 'notify-one' then '91000000-0000-4000-8000-000000000130'::uuid
    else '92000000-0000-4000-8000-000000000130'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards',
  'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('notify-one', 'notify-two');
insert into loyalty.programme_versions (
  organization_id, programme_group_id, programme_id, version_number, status,
  configuration, configuration_sha256, published_at
)
select programme.organization_id, programme.programme_group_id, programme.id,
  1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(programme.public_id::text, 'sha256'),
  '2026-08-01T00:00:00Z'
from loyalty.programmes as programme
join loyalty.organizations as organization
  on organization.id = programme.organization_id
where organization.slug in ('notify-one', 'notify-two');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select case organization.slug
    when 'notify-one' then '91000000-0000-4000-8000-000000000140'::uuid
    else '92000000-0000-4000-8000-000000000140'::uuid end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug,
  programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('notify-one', 'notify-two');
insert into loyalty.customers (public_id, organization_id, display_reference)
select case organization.slug
    when 'notify-one' then '91000000-0000-4000-8000-000000000150'::uuid
    else '92000000-0000-4000-8000-000000000150'::uuid end,
  organization.id, 'Private notification subject'
from loyalty.organizations as organization
where organization.slug in ('notify-one', 'notify-two');
insert into loyalty.customer_user_links (
  public_id, organization_id, customer_id, auth_user_id, source_connection_id
)
select case organization.slug
    when 'notify-one' then '91000000-0000-4000-8000-000000000160'::uuid
    else '92000000-0000-4000-8000-000000000160'::uuid end,
  organization.id, customer.id,
  case organization.slug
    when 'notify-one' then '91000000-0000-4000-8000-000000000001'::uuid
    else '92000000-0000-4000-8000-000000000001'::uuid end,
  connection.id
from loyalty.organizations as organization
join loyalty.customers as customer
  on customer.organization_id = organization.id
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug in ('notify-one', 'notify-two');

create function pg_temp.notify_org(target_slug text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select id from loyalty.organizations where slug = target_slug;
$$;
create function pg_temp.notify_group(target_slug text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select programme_group.id
  from loyalty.programme_groups as programme_group
  join loyalty.organizations as organization
    on organization.id = programme_group.organization_id
  where organization.slug = target_slug;
$$;
create function pg_temp.notify_customer(target_public_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select id from loyalty.customers where public_id = target_public_id;
$$;

select * from loyalty_private.award_points(
  (select id from loyalty.organizations where slug = 'notify-one'),
  (select programme_group_id from loyalty.programmes
   where public_id = '91000000-0000-4000-8000-000000000130'),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'notify-one')),
  (select id from loyalty.customers where public_id =
    '91000000-0000-4000-8000-000000000150'),
  50, 'notify:award', extensions.digest('notify:award', 'sha256')
);
select * from loyalty_private.release_points(
  (select id from loyalty.organizations where slug = 'notify-one'),
  (select programme_group_id from loyalty.programmes
   where public_id = '91000000-0000-4000-8000-000000000130'),
  (select id from loyalty.programme_versions where organization_id =
    (select id from loyalty.organizations where slug = 'notify-one')),
  (select entry.public_id
   from loyalty.ledger_entries as entry
   join loyalty.ledger_accounts as account on account.id = entry.account_id
   where account.organization_id =
       (select id from loyalty.organizations where slug = 'notify-one')
     and account.account_kind = 'pending' and entry.points > 0),
  '2026-12-31T00:00:00Z', 'notify:release',
  extensions.digest('notify:release', 'sha256')
);
create temporary table notification_ledger_before as
select count(*)::bigint as transaction_count
from loyalty.ledger_transactions
where organization_id = (select id from loyalty.organizations where slug = 'notify-one');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select count(*)::bigint
     from loyalty.get_my_notification_preferences_v1() $$,
  array[2::bigint],
  'an active customer receives one row for each supported purpose'
);
select results_eq(
  $$ select purpose, state, policy_version, effective_at
     from loyalty.get_my_notification_preferences_v1()
     order by purpose $$,
  $$ values
    ('loyalty_marketing'::text, 'unsubscribed'::text, 'default-v1'::text,
      null::timestamptz),
    ('loyalty_transactional'::text, 'subscribed'::text, 'default-v1'::text,
      null::timestamptz) $$,
  'marketing defaults off while transactional loyalty notices default on'
);
select results_eq(
  $$ select preference_state, outcome
     from loyalty.set_my_notification_preference_v1(
       '91000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'subscribed', 'notify:preference:one',
       '91000000-0000-4000-8000-000000000201'
     ) $$,
  $$ values ('subscribed'::text, 'updated'::text) $$,
  'customer explicitly subscribes to the marketing purpose'
);
select results_eq(
  $$ select state from loyalty.get_my_notification_preferences_v1()
     where purpose = 'loyalty_marketing' $$,
  array['subscribed'::text],
  'the current projection immediately reflects explicit consent'
);
select results_eq(
  $$ select preference_state, outcome
     from loyalty.set_my_notification_preference_v1(
       '91000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'subscribed', 'notify:preference:one',
       '91000000-0000-4000-8000-000000000202'
     ) $$,
  $$ values ('subscribed'::text, 'duplicate'::text) $$,
  'an exact retry returns the original consent outcome'
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.notification_preference_events $$,
  array[1::bigint],
  'an exact preference retry appends no duplicate decision'
);
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.set_my_notification_preference_v1(
       '91000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'unsubscribed', 'notify:preference:one',
       '91000000-0000-4000-8000-000000000203'
     ) $$,
  '23514', 'notification preference idempotency conflict',
  'a changed preference cannot reuse an accepted idempotency key'
);
select throws_ok(
  $$ select * from loyalty.set_my_notification_preference_v1(
       '92000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'subscribed', 'notify:preference:cross',
       '91000000-0000-4000-8000-000000000204'
     ) $$,
  '42501', 'notification preference not authorized',
  'an Auth subject cannot select another tenant customer account'
);
reset role;

set local role loyalty_worker;
select results_eq(
  $$ select preference_state, outcome
     from loyalty_private.record_notification_suppression_v1(
       pg_temp.notify_org('notify-one'),
       pg_temp.notify_customer('91000000-0000-4000-8000-000000000150'),
       'loyalty_marketing', true, 'provider', 'spam_complaint',
       'notify:suppression:one', pg_catalog.clock_timestamp()
     ) $$,
  $$ values ('suppressed'::text, 'updated'::text) $$,
  'trusted provider evidence suppresses a purpose'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select state from loyalty.get_my_notification_preferences_v1()
     where purpose = 'loyalty_marketing' $$,
  array['suppressed'::text],
  'provider suppression immediately overrides prior consent'
);
select throws_ok(
  $$ select * from loyalty.set_my_notification_preference_v1(
       '91000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'subscribed', 'notify:preference:blocked',
       '91000000-0000-4000-8000-000000000205'
     ) $$,
  '42501', 'notification preference is suppressed',
  'a customer session cannot clear trusted suppression'
);
select results_eq(
  $$ select preference_state, outcome
     from loyalty.set_my_notification_preference_v1(
       '91000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'unsubscribed', 'notify:preference:withdraw',
       '91000000-0000-4000-8000-000000000206'
     ) $$,
  $$ values ('suppressed'::text, 'updated'::text) $$,
  'withdrawal under suppression is recorded without weakening suppression'
);
reset role;

set local role loyalty_worker;
select results_eq(
  $$ select preference_state, outcome
     from loyalty_private.record_notification_suppression_v1(
       pg_temp.notify_org('notify-one'),
       pg_temp.notify_customer('91000000-0000-4000-8000-000000000150'),
       'loyalty_marketing', false, 'provider', 'provider_unsuppressed',
       'notify:suppression:clear', pg_catalog.clock_timestamp()
     ) $$,
  $$ values ('unsubscribed'::text, 'updated'::text) $$,
  'clearing provider suppression never silently restores consent'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select preference_state from loyalty.set_my_notification_preference_v1(
       '91000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'subscribed', 'notify:preference:after-clear',
       '91000000-0000-4000-8000-000000000207'
     ) $$,
  array['subscribed'::text],
  'the customer must explicitly consent again after suppression clears'
);
reset role;

set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.record_notification_suppression_v1(
       pg_temp.notify_org('notify-one'),
       pg_temp.notify_customer('91000000-0000-4000-8000-000000000150'),
       'loyalty_marketing', true, 'provider', 'hard_bounce',
       'notify:suppression:backwards', pg_catalog.clock_timestamp() - interval '1 day'
     ) $$,
  '23514', 'notification preference moved backwards',
  'out-of-order provider state cannot replace a newer local decision'
);

select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.notify_org('notify-one'), pg_temp.notify_group('notify-one'),
       pg_temp.notify_customer('91000000-0000-4000-8000-000000000150'),
       'loyalty.points.released', 'ledger_release', 'release:one',
       'notify:event:released', '2026-08-24T08:00:00Z',
       '{"points":"5","availableBalance":"50"}'::jsonb
     ) $$,
  array['created'::text],
  'worker appends one strict provider-neutral event'
);
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.notify_org('notify-one'), pg_temp.notify_group('notify-one'),
       pg_temp.notify_customer('91000000-0000-4000-8000-000000000150'),
       'loyalty.points.released', 'ledger_release', 'release:one',
       'notify:event:released', '2026-08-24T08:00:00Z',
       '{"points":"5","availableBalance":"50"}'::jsonb
     ) $$,
  array['duplicate'::text],
  'exact event replay returns its original accepted identity'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty_private.notification_events
     where deduplication_key = 'notify:event:released' $$,
  array[1::bigint],
  'exact event replay appends one immutable row'
);
set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.emit_notification_event_v1(
       pg_temp.notify_org('notify-one'), pg_temp.notify_group('notify-one'),
       pg_temp.notify_customer('91000000-0000-4000-8000-000000000150'),
       'loyalty.points.released', 'ledger_release', 'release:one',
       'notify:event:released', '2026-08-24T08:00:00Z',
       '{"points":"6","availableBalance":"50"}'::jsonb
     ) $$,
  '23514', 'notification event idempotency conflict',
  'changed event evidence cannot reuse a deduplication key'
);
select throws_ok(
  $$ select * from loyalty_private.emit_notification_event_v1(
       pg_temp.notify_org('notify-one'), pg_temp.notify_group('notify-one'),
       pg_temp.notify_customer('91000000-0000-4000-8000-000000000150'),
       'loyalty.points.released', 'ledger_release', 'release:pii',
       'notify:event:pii', '2026-08-24T08:00:00Z',
       '{"points":"5","availableBalance":"50","email":"secret@example.test"}'::jsonb
     ) $$,
  '22023', 'invalid notification event',
  'arbitrary contact properties fail the strict database contract'
);
select throws_ok(
  $$ select * from loyalty_private.emit_notification_event_v1(
       pg_temp.notify_org('notify-one'), pg_temp.notify_group('notify-one'),
       null, 'loyalty.points.released', 'ledger_release', 'release:no-subject',
       'notify:event:no-subject', '2026-08-24T08:00:00Z',
       '{"points":"5","availableBalance":"50"}'::jsonb
     ) $$,
  '22023', 'invalid notification subject',
  'a customer event cannot omit its database-derived subject'
);
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.notify_org('notify-one'),
       null, null, 'loyalty.connector.health', 'connector_monitor',
       'connection:one', 'notify:event:connector',
       '2026-08-24T08:00:00Z',
       '{"connectionId":"91000000-0000-4000-8000-000000000140","state":"degraded","errorCode":"connection_timeout"}'::jsonb
     ) $$,
  array['created'::text],
  'merchant operational health is a provider-neutral event without customer identity'
);
select throws_ok(
  $$ select * from loyalty_private.emit_notification_event_v1(
       pg_temp.notify_org('notify-one'),
       null,
       pg_temp.notify_customer('91000000-0000-4000-8000-000000000150'),
       'loyalty.connector.health', 'connector_monitor', 'connection:bad',
       'notify:event:connector:bad', '2026-08-24T08:00:00Z',
       '{"connectionId":"91000000-0000-4000-8000-000000000140","state":"degraded","errorCode":null}'::jsonb
     ) $$,
  '22023', 'invalid notification subject',
  'merchant operational events reject customer subject smuggling'
);
reset role;

select is_empty(
  $$ select 1 from loyalty_private.notification_events as event
     where event.payload ?| array[
       'email', 'phone', 'name', 'address', 'couponCode', 'ledgerMetadata',
       'secret', 'token'
     ] $$,
  'accepted provider-neutral payloads contain no contact coupon ledger or secret keys'
);

insert into loyalty_private.point_expiry_notifications (
  organization_id, wallet_id, lot_id, notify_before_days,
  points_snapshot, expires_at
)
select lot.organization_id, lot.wallet_id, lot.id, 30,
  balance.remaining_points, lot.expires_at
from loyalty.point_lots as lot
join loyalty.point_lot_balances as balance
  on balance.organization_id = lot.organization_id and balance.lot_id = lot.id
where lot.organization_id =
  (select id from loyalty.organizations where slug = 'notify-one');
select results_eq(
  $$ select count(*)::bigint from loyalty_private.notification_events
     where event_type = 'loyalty.points.expiring' $$,
  array[1::bigint],
  'the existing point-expiry fence dual-writes one provider-neutral event'
);
select results_eq(
  $$ select payload ->> 'points', payload ->> 'daysRemaining'
     from loyalty_private.notification_events
     where event_type = 'loyalty.points.expiring' $$,
  $$ values ('50'::text, '30'::text) $$,
  'point-expiry event retains exact minimized points and lead time'
);
select throws_ok(
  $$ update loyalty_private.notification_events set event_type = 'changed' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'notification event history rejects updates'
);
select throws_ok(
  $$ delete from loyalty_private.notification_preference_events $$,
  '55000', 'immutable loyalty history cannot be changed',
  'preference decision history rejects deletion'
);

update loyalty.customers set status = 'pseudonymized', updated_at = now()
where public_id = '91000000-0000-4000-8000-000000000150';
select results_eq(
  $$ select purpose, state, source
     from loyalty_private.notification_preferences
     where organization_id =
       (select id from loyalty.organizations where slug = 'notify-one')
     order by purpose $$,
  $$ values
    ('loyalty_marketing'::text, 'suppressed'::text, 'system'::text),
    ('loyalty_transactional'::text, 'suppressed'::text, 'system'::text) $$,
  'privacy pseudonymization immediately suppresses every customer purpose'
);

set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.record_notification_suppression_v1(
       pg_temp.notify_org('notify-two'),
       pg_temp.notify_customer('91000000-0000-4000-8000-000000000150'),
       'loyalty_marketing', true, 'system', 'privacy_erasure',
       'notify:suppression:cross', pg_catalog.clock_timestamp()
     ) $$,
  '23503', 'notification customer not found',
  'trusted suppression cannot cross an organization boundary'
);
reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions
     where organization_id =
       (select id from loyalty.organizations where slug = 'notify-one') $$,
  $$ select transaction_count from notification_ledger_before $$,
  'notification events and consent decisions never create or change loyalty value'
);

set local role authenticated;
set local request.jwt.claim.sub = '';
select results_eq(
  $$ select count(*)::bigint
     from loyalty.get_my_notification_preferences_v1() $$,
  array[0::bigint],
  'an unauthenticated request receives no preference projection'
);
reset role;

select * from finish();
rollback;
