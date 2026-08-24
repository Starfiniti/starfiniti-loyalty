begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

grant loyalty_worker to current_user;
grant usage on schema extensions to loyalty_worker;
grant execute on all functions in schema extensions to loyalty_worker;

select has_table(
  'loyalty_private', 'notification_klaviyo_connections',
  'Klaviyo connection bindings are private'
);
select has_table(
  'loyalty_private', 'notification_klaviyo_profiles',
  'Klaviyo profile IDs use a private projection'
);
select has_table(
  'loyalty_private', 'notification_klaviyo_operations',
  'Klaviyo operations use a private lease projection'
);
select has_table(
  'loyalty_private', 'notification_klaviyo_operation_attempts',
  'Klaviyo attempts retain append-only evidence'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_klaviyo_connections'::regclass),
  'Klaviyo connection bindings have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_klaviyo_profiles'::regclass),
  'Klaviyo profile mappings have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_klaviyo_operations'::regclass),
  'Klaviyo operations have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_klaviyo_operation_attempts'::regclass),
  'Klaviyo attempt evidence has RLS enabled'
);
select has_trigger(
  'loyalty_private', 'notification_klaviyo_operation_attempts',
  'notification_klaviyo_operation_attempts_immutable',
  'Klaviyo attempt history cannot be rewritten'
);
select has_function(
  'loyalty_private', 'claim_klaviyo_notification_operations_v1',
  array['uuid', 'text', 'text', 'integer', 'integer'],
  'tenant-bound Klaviyo claim function exists'
);
select has_function(
  'loyalty_private', 'prepare_klaviyo_notification_operation_v1',
  array['uuid', 'text', 'uuid', 'text'],
  'Klaviyo preparation authorization exists'
);
select has_function(
  'loyalty_private', 'record_klaviyo_profile_v1',
  array['uuid', 'text', 'uuid', 'text', 'text', 'integer'],
  'Klaviyo profile projection command exists'
);
select has_function(
  'loyalty_private', 'authorize_klaviyo_provider_action_v1',
  array['uuid', 'text', 'uuid', 'text'],
  'Klaviyo action authorization exists'
);
select has_function(
  'loyalty_private', 'record_klaviyo_provider_suppression_v1',
  array['uuid', 'text', 'uuid', 'text', 'text'],
  'provider suppression import command exists'
);
select has_function(
  'loyalty_private', 'finish_klaviyo_notification_operation_v1',
  array['uuid', 'text', 'uuid', 'text', 'text', 'text', 'integer', 'text', 'integer'],
  'bounded Klaviyo finish command exists'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.claim_klaviyo_notification_operations_v1(uuid,text,text,integer,integer)',
    'EXECUTE'
  ) and has_function_privilege(
    'loyalty_worker',
    'loyalty_private.prepare_klaviyo_notification_operation_v1(uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'worker can claim and prepare only through protected commands'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.record_klaviyo_profile_v1(uuid,text,uuid,text,text,integer)',
    'EXECUTE'
  ) and has_function_privilege(
    'loyalty_worker',
    'loyalty_private.authorize_klaviyo_provider_action_v1(uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'worker can record one profile and authorize one provider action'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.finish_klaviyo_notification_operation_v1(uuid,text,uuid,text,text,text,integer,text,integer)',
    'EXECUTE'
  ) and not has_table_privilege(
    'loyalty_worker', 'loyalty_private.notification_klaviyo_operations', 'SELECT'
  ),
  'worker records bounded results without enumerating operations'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.prepare_klaviyo_notification_operation_v1(uuid,text,uuid,text)',
    'EXECUTE'
  ) and not has_table_privilege(
    'authenticated', 'loyalty_private.notification_klaviyo_profiles', 'SELECT'
  ),
  'browser sessions cannot resolve provider contact or mappings'
);
select hasnt_column(
  'loyalty_private', 'notification_klaviyo_connections', 'api_key',
  'connection bindings never store the private API key'
);
select hasnt_column(
  'loyalty_private', 'notification_klaviyo_operations', 'recipient_email',
  'operation leases never persist contact'
);
select hasnt_column(
  'loyalty_private', 'notification_klaviyo_operation_attempts', 'response_body',
  'attempt evidence never persists raw provider responses'
);

insert into auth.users (id, email, email_confirmed_at)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    'managed-one@example.test', '2026-08-24T07:00:00Z'
  ),
  (
    'b2000000-0000-4000-8000-000000000001',
    'managed-two@example.test', '2026-08-24T07:00:00Z'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'unconfirmed-managed@example.test', null
  );
insert into loyalty.organizations (public_id, slug, name)
values
  ('b1000000-0000-4000-8000-000000000100', 'klaviyo-one', 'Klaviyo One'),
  ('b2000000-0000-4000-8000-000000000100', 'klaviyo-two', 'Klaviyo Two');
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'klaviyo-one' then 'b1000000-0000-4000-8000-000000000110'::uuid
    else 'b2000000-0000-4000-8000-000000000110'::uuid end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('klaviyo-one', 'klaviyo-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug
    when 'klaviyo-one' then 'b1000000-0000-4000-8000-000000000120'::uuid
    else 'b2000000-0000-4000-8000-000000000120'::uuid end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('klaviyo-one', 'klaviyo-two');
insert into loyalty.programmes(
  public_id, organization_id, programme_group_id, slug, name, status
)
select case organization.slug
    when 'klaviyo-one' then 'b1000000-0000-4000-8000-000000000130'::uuid
    else 'b2000000-0000-4000-8000-000000000130'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards',
  'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('klaviyo-one', 'klaviyo-two');
insert into loyalty.commerce_connections(
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select case organization.slug
    when 'klaviyo-one' then 'b1000000-0000-4000-8000-000000000140'::uuid
    else 'b2000000-0000-4000-8000-000000000140'::uuid end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug,
  programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('klaviyo-one', 'klaviyo-two');
insert into loyalty.customers(public_id, organization_id, display_reference)
select case organization.slug
    when 'klaviyo-one' then 'b1000000-0000-4000-8000-000000000150'::uuid
    else 'b2000000-0000-4000-8000-000000000150'::uuid end,
  organization.id, 'Managed subject'
from loyalty.organizations as organization
where organization.slug in ('klaviyo-one', 'klaviyo-two');
insert into loyalty.customers(public_id, organization_id, display_reference)
select 'b2000000-0000-4000-8000-000000000151', organization.id,
  'Unconfirmed managed subject'
from loyalty.organizations as organization where organization.slug = 'klaviyo-two';
insert into loyalty.customer_user_links(
  public_id, organization_id, customer_id, auth_user_id, source_connection_id
)
select case customer.public_id
    when 'b1000000-0000-4000-8000-000000000150'::uuid
      then 'b1000000-0000-4000-8000-000000000160'::uuid
    when 'b2000000-0000-4000-8000-000000000150'::uuid
      then 'b2000000-0000-4000-8000-000000000160'::uuid
    else 'b2000000-0000-4000-8000-000000000161'::uuid end,
  customer.organization_id, customer.id,
  case customer.public_id
    when 'b1000000-0000-4000-8000-000000000150'::uuid
      then 'b1000000-0000-4000-8000-000000000001'::uuid
    when 'b2000000-0000-4000-8000-000000000150'::uuid
      then 'b2000000-0000-4000-8000-000000000001'::uuid
    else 'b2000000-0000-4000-8000-000000000002'::uuid end,
  connection.id
from loyalty.customers as customer
join loyalty.commerce_connections as connection
  on connection.organization_id = customer.organization_id
where customer.public_id in (
  'b1000000-0000-4000-8000-000000000150',
  'b2000000-0000-4000-8000-000000000150',
  'b2000000-0000-4000-8000-000000000151'
);

select loyalty_private.set_deployment_mode(
  'managed', 1, 'operator:klaviyo-test',
  'Exercise managed provider delivery', pg_catalog.clock_timestamp()
);
select loyalty_private.set_organization_entitlement(
  organization.public_id, 'notifications', 'enabled', null, 'billing',
  'operator:klaviyo-test', 'Enable managed notification test',
  pg_catalog.clock_timestamp(), null
)
from loyalty.organizations as organization
where organization.slug in ('klaviyo-one', 'klaviyo-two');
insert into loyalty_private.notification_klaviyo_connections(
  public_id, organization_id, credential_sha256, list_id, state
)
select case organization.slug
    when 'klaviyo-one' then 'b1000000-0000-4000-8000-000000000170'::uuid
    else 'b2000000-0000-4000-8000-000000000170'::uuid end,
  organization.id,
  case organization.slug
    when 'klaviyo-one' then pg_catalog.decode(repeat('ab', 32), 'hex')
    else pg_catalog.decode(repeat('cd', 32), 'hex') end,
  case when organization.slug = 'klaviyo-one' then 'LoyaltyList' else null end,
  'active'
from loyalty.organizations as organization
where organization.slug in ('klaviyo-one', 'klaviyo-two');

create function pg_temp.kl_org(target_slug text)
returns bigint language sql stable security definer set search_path = '' as $$
  select id from loyalty.organizations where slug = target_slug;
$$;
create function pg_temp.kl_group(target_slug text)
returns bigint language sql stable security definer set search_path = '' as $$
  select programme_group.id
  from loyalty.programme_groups as programme_group
  join loyalty.organizations as organization
    on organization.id = programme_group.organization_id
  where organization.slug = target_slug;
$$;
create function pg_temp.kl_customer(target_public_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select id from loyalty.customers where public_id = target_public_id;
$$;
create function pg_temp.kl_connection(target_slug text)
returns uuid language sql stable security definer set search_path = '' as $$
  select connection.public_id
  from loyalty_private.notification_klaviyo_connections as connection
  join loyalty.organizations as organization
    on organization.id = connection.organization_id
  where organization.slug = target_slug;
$$;
create function pg_temp.kl_event_operation(target_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select operation.public_id
  from loyalty_private.notification_klaviyo_operations as operation
  join loyalty_private.notification_events as event
    on event.organization_id = operation.organization_id
   and event.id = operation.notification_event_id
  where event.deduplication_key = target_key;
$$;
create function pg_temp.kl_preference_operation(target_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select operation.public_id
  from loyalty_private.notification_klaviyo_operations as operation
  join loyalty_private.notification_preference_events as preference
    on preference.organization_id = operation.organization_id
   and preference.id = operation.preference_event_id
  where preference.idempotency_key = target_key;
$$;
create function pg_temp.kl_current_preference_operation(target_customer uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select operation.public_id
  from loyalty_private.notification_preferences as preference
  join loyalty.customers as customer
    on customer.organization_id = preference.organization_id
   and customer.id = preference.customer_id
  join loyalty_private.notification_klaviyo_operations as operation
    on operation.organization_id = preference.organization_id
   and operation.preference_event_id = preference.last_event_id
  where customer.public_id = target_customer
    and preference.purpose = 'loyalty_marketing';
$$;

create temporary table klaviyo_ledger_before as
select count(*)::bigint as transaction_count from loyalty.ledger_transactions;

set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.kl_org('klaviyo-one'), pg_temp.kl_group('klaviyo-one'),
       pg_temp.kl_customer('b1000000-0000-4000-8000-000000000150'),
       'loyalty.points.released', 'ledger_release', 'release:managed-one',
       'klaviyo:event:one', '2026-08-24T08:00:00Z',
       '{"points":"25","availableBalance":"125"}'::jsonb
     ) $$,
  array['created'::text],
  'managed event creates provider-neutral evidence'
);
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.kl_org('klaviyo-one'), pg_temp.kl_group('klaviyo-one'),
       pg_temp.kl_customer('b1000000-0000-4000-8000-000000000150'),
       'loyalty.points.released', 'ledger_release', 'release:managed-one',
       'klaviyo:event:one', '2026-08-24T08:00:00Z',
       '{"points":"25","availableBalance":"125"}'::jsonb
     ) $$,
  array['duplicate'::text],
  'exact managed event replay is idempotent'
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.notification_klaviyo_operations as operation
     where operation.public_id = pg_temp.kl_event_operation('klaviyo:event:one') $$,
  array[1::bigint],
  'event replay creates one provider operation'
);
set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('00', 32),
       'klaviyo-worker-wrong-key', 1, 60
     ) $$,
  '42501', 'Klaviyo connection not authorized',
  'wrong key fingerprint fails before any claim'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       'klaviyo-worker-two', 1, 60
     ) $$,
  array[0::bigint],
  'another tenant connection cannot claim the first tenant operation'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       'klaviyo-worker-one', 1, 60
     ) $$,
  array[1::bigint],
  'correct connection and fingerprint claim one operation'
);
select throws_ok(
  $$ select * from loyalty_private.prepare_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_event_operation('klaviyo:event:one'), 'different-worker'
     ) $$,
  '42501', 'Klaviyo notification lease not owned',
  'another worker cannot prepare an owned lease'
);
select results_eq(
  $$ select outcome, operation_kind, attempt_count, recipient_email,
       external_customer_public_id, api_revision, list_id,
       event ->> 'eventType'
     from loyalty_private.prepare_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_event_operation('klaviyo:event:one'), 'klaviyo-worker-one'
     ) $$,
  $$ values (
    'authorized'::text, 'event_sync'::text, 1,
    'managed-one@example.test'::text,
    'b1000000-0000-4000-8000-000000000150'::uuid,
    '2026-07-15'::text, 'LoyaltyList'::text,
    'loyalty.points.released'::text
  ) $$,
  'preparation resolves minimized contact only after every binding check'
);
reset role;
select ok(
  not exists (
    select 1 from loyalty_private.notification_klaviyo_operations as operation
    where operation.public_id = pg_temp.kl_event_operation('klaviyo:event:one')
      and pg_catalog.to_jsonb(operation)::text like '%managed-one@example.test%'
  ),
  'verified contact is absent from persisted provider work'
);
set local role loyalty_worker;
select results_eq(
  $$ select state, provider_profile_id
     from loyalty_private.record_klaviyo_profile_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_event_operation('klaviyo:event:one'), 'klaviyo-worker-one',
       'KlaviyoProfile_One', 201
     ) $$,
  $$ values ('processing'::text, 'KlaviyoProfile_One'::text) $$,
  'profile upsert records only the tenant-scoped provider ID'
);
select results_eq(
  $$ select outcome, action, provider_profile_id
     from loyalty_private.authorize_klaviyo_provider_action_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_event_operation('klaviyo:event:one'), 'klaviyo-worker-one'
     ) $$,
  $$ values ('authorized'::text, 'event'::text, 'KlaviyoProfile_One'::text) $$,
  'event action is reauthorized immediately before provider submission'
);
select results_eq(
  $$ select state, outcome, scheduled_at
     from loyalty_private.finish_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_event_operation('klaviyo:event:one'), 'klaviyo-worker-one',
       'event', 'completed', 202, null, null
     ) $$,
  $$ values ('completed'::text, 'completed'::text, null::timestamptz) $$,
  '202 records asynchronous provider acceptance rather than delivery'
);
select throws_ok(
  $$ select * from loyalty_private.finish_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_event_operation('klaviyo:event:one'), 'klaviyo-worker-one',
       'event', 'completed', 202, null, null
     ) $$,
  '42501', 'Klaviyo notification result not owned',
  'finished provider evidence cannot be replayed'
);
reset role;
select results_eq(
  $$ select phase, outcome, response_code
     from loyalty_private.notification_klaviyo_operation_attempts as attempt
     join loyalty_private.notification_klaviyo_operations as operation
       on operation.organization_id = attempt.organization_id
      and operation.id = attempt.operation_id
     where operation.public_id = pg_temp.kl_event_operation('klaviyo:event:one')
     order by attempt.id $$,
  $$ values
    ('profile'::text, 'profile_synced'::text, 201),
    ('event'::text, 'accepted'::text, 202) $$,
  'append-only evidence distinguishes profile sync from event acceptance'
);

set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select preference_state
     from loyalty.set_my_notification_preference_v1(
       'b1000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'subscribed', 'klaviyo:consent:subscribe',
       'b1000000-0000-4000-8000-000000000201'
     ) $$,
  array['subscribed'::text],
  'explicit local marketing opt-in creates current consent authority'
);
reset role;
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       'klaviyo-worker-suppression', 1, 60
     ) $$,
  array[1::bigint],
  'latest opt-in receives a bounded consent lease'
);
select results_eq(
  $$ select outcome, operation_kind, desired_state, recipient_email
     from loyalty_private.prepare_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:subscribe'),
       'klaviyo-worker-suppression'
     ) $$,
  $$ values (
    'authorized'::text, 'consent_sync'::text, 'subscribed'::text,
    'managed-one@example.test'::text
  ) $$,
  'only the exact current opt-in can prepare a subscribe operation'
);
select results_eq(
  $$ select state from loyalty_private.record_klaviyo_profile_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:subscribe'),
       'klaviyo-worker-suppression', 'KlaviyoProfile_One', 200
     ) $$,
  array['processing'::text],
  'consent sync confirms the same tenant-scoped provider profile'
);
select results_eq(
  $$ select state, preference_state
     from loyalty_private.record_klaviyo_provider_suppression_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:subscribe'),
       'klaviyo-worker-suppression', 'hard_bounce'
     ) $$,
  $$ values ('suppressed'::text, 'suppressed'::text) $$,
  'provider suppression tightens local authority without a subscribe call'
);
reset role;
select results_eq(
  $$ select state, source, reason_code
     from loyalty_private.notification_preferences as preference
     join loyalty_private.notification_preference_events as event
       on event.organization_id = preference.organization_id
      and event.id = preference.last_event_id
     where preference.organization_id = pg_temp.kl_org('klaviyo-one')
       and preference.customer_id =
         pg_temp.kl_customer('b1000000-0000-4000-8000-000000000150')
       and preference.purpose = 'loyalty_marketing' $$,
  $$ values ('suppressed'::text, 'provider'::text, 'hard_bounce'::text) $$,
  'provider suppression remains attributable in local append-only consent history'
);
set local role authenticated;
set local request.jwt.claim.sub = 'b1000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.set_my_notification_preference_v1(
       'b1000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'subscribed', 'klaviyo:consent:unsafe-clear',
       'b1000000-0000-4000-8000-000000000202'
     ) $$,
  '42501', 'notification preference is suppressed',
  'customer session cannot blindly clear provider suppression'
);
reset role;

set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       'klaviyo-worker-suppressed-projection', 1, 60
     ) $$,
  array[1::bigint],
  'provider suppression projects one latest consent operation'
);
select results_eq(
  $$ select outcome, recipient_email
     from loyalty_private.prepare_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_current_preference_operation(
         'b1000000-0000-4000-8000-000000000150'
       ), 'klaviyo-worker-suppressed-projection'
     ) $$,
  $$ values ('suppressed'::text, null::text) $$,
  'suppressed projection terminates without contact or provider mutation'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select preference_state
     from loyalty.set_my_notification_preference_v1(
       'b2000000-0000-4000-8000-000000000160',
       'loyalty_marketing', 'unsubscribed', 'klaviyo:consent:unsubscribe',
       'b2000000-0000-4000-8000-000000000201'
     ) $$,
  array['unsubscribed'::text],
  'explicit local withdrawal creates an unsubscribe operation'
);
reset role;
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       'klaviyo-worker-unsubscribe', 1, 60
     ) $$,
  array[1::bigint],
  'unsubscribe receives an isolated tenant lease'
);
select results_eq(
  $$ select desired_state
     from loyalty_private.prepare_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:unsubscribe'),
       'klaviyo-worker-unsubscribe'
     ) $$,
  array['unsubscribed'::text],
  'withdrawal preparation derives its state from current local authority'
);
select results_eq(
  $$ select state from loyalty_private.record_klaviyo_profile_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:unsubscribe'),
       'klaviyo-worker-unsubscribe', 'KlaviyoProfile_Two', 201
     ) $$,
  array['processing'::text],
  'unsubscribe profile mapping is tenant isolated'
);
select results_eq(
  $$ select action from loyalty_private.authorize_klaviyo_provider_action_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:unsubscribe'),
       'klaviyo-worker-unsubscribe'
     ) $$,
  array['unsubscribe'::text],
  'latest withdrawal authorizes only global unsubscribe'
);
select results_eq(
  $$ select state from loyalty_private.finish_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:unsubscribe'),
       'klaviyo-worker-unsubscribe', 'unsubscribe', 'retryable', null,
       'klaviyo_connection_unavailable', null
     ) $$,
  array['retryable'::text],
  'ambiguous unsubscribe safely retries because it only tightens consent'
);
reset role;
update loyalty_private.notification_klaviyo_operations
set next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
where public_id = pg_temp.kl_preference_operation('klaviyo:consent:unsubscribe');
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       'klaviyo-worker-unsubscribe-retry', 1, 60
     ) $$,
  array[1::bigint],
  'due unsubscribe is safely reclaimed'
);
select * from loyalty_private.prepare_klaviyo_notification_operation_v1(
  pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
  pg_temp.kl_preference_operation('klaviyo:consent:unsubscribe'),
  'klaviyo-worker-unsubscribe-retry'
);
select * from loyalty_private.record_klaviyo_profile_v1(
  pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
  pg_temp.kl_preference_operation('klaviyo:consent:unsubscribe'),
  'klaviyo-worker-unsubscribe-retry', 'KlaviyoProfile_Two', 200
);
select * from loyalty_private.authorize_klaviyo_provider_action_v1(
  pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
  pg_temp.kl_preference_operation('klaviyo:consent:unsubscribe'),
  'klaviyo-worker-unsubscribe-retry'
);
select results_eq(
  $$ select state from loyalty_private.finish_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:unsubscribe'),
       'klaviyo-worker-unsubscribe-retry', 'unsubscribe', 'completed', 202,
       null, null
     ) $$,
  array['completed'::text],
  'repeated unsubscribe converges on one accepted terminal operation'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000001';
select * from loyalty.set_my_notification_preference_v1(
  'b2000000-0000-4000-8000-000000000160',
  'loyalty_marketing', 'subscribed', 'klaviyo:consent:ambiguous-subscribe',
  'b2000000-0000-4000-8000-000000000202'
);
reset role;
set local role loyalty_worker;
select * from loyalty_private.claim_klaviyo_notification_operations_v1(
  pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
  'klaviyo-worker-ambiguous', 1, 60
);
select * from loyalty_private.prepare_klaviyo_notification_operation_v1(
  pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
  pg_temp.kl_preference_operation('klaviyo:consent:ambiguous-subscribe'),
  'klaviyo-worker-ambiguous'
);
select * from loyalty_private.record_klaviyo_profile_v1(
  pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
  pg_temp.kl_preference_operation('klaviyo:consent:ambiguous-subscribe'),
  'klaviyo-worker-ambiguous', 'KlaviyoProfile_Two', 200
);
select results_eq(
  $$ select action from loyalty_private.authorize_klaviyo_provider_action_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:ambiguous-subscribe'),
       'klaviyo-worker-ambiguous'
     ) $$,
  array['subscribe'::text],
  'fresh exact local opt-in reaches the subscribe ambiguity boundary'
);
select results_eq(
  $$ select state from loyalty_private.finish_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:ambiguous-subscribe'),
       'klaviyo-worker-ambiguous', 'subscribe', 'manual_review', null,
       'klaviyo_subscribe_outcome_ambiguous', null
     ) $$,
  array['manual_review'::text],
  'ambiguous subscribe is never retried automatically'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000001';
select * from loyalty.set_my_notification_preference_v1(
  'b2000000-0000-4000-8000-000000000160',
  'loyalty_marketing', 'unsubscribed', 'klaviyo:consent:old',
  'b2000000-0000-4000-8000-000000000203'
);
select * from loyalty.set_my_notification_preference_v1(
  'b2000000-0000-4000-8000-000000000160',
  'loyalty_marketing', 'subscribed', 'klaviyo:consent:new',
  'b2000000-0000-4000-8000-000000000204'
);
reset role;
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       'klaviyo-worker-superseded', 1, 60
     ) $$,
  array[1::bigint],
  'older consent work can be leased without becoming authority'
);
select results_eq(
  $$ select outcome, recipient_email
     from loyalty_private.prepare_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:old'),
       'klaviyo-worker-superseded'
     ) $$,
  $$ values ('superseded'::text, null::text) $$,
  'superseded consent terminates before contact disclosure'
);
reset role;

set local role loyalty_worker;
select * from loyalty_private.emit_notification_event_v1(
  pg_temp.kl_org('klaviyo-two'), pg_temp.kl_group('klaviyo-two'),
  pg_temp.kl_customer('b2000000-0000-4000-8000-000000000151'),
  'loyalty.points.earned', 'ledger_award', 'award:no-contact',
  'klaviyo:event:no-contact', '2026-08-24T08:10:00Z',
  '{"points":"5","pendingUntil":null}'::jsonb
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       'klaviyo-worker-new-consent', 1, 60
     ) $$,
  array[1::bigint],
  'newer consent remains ahead of later event work in the tenant queue'
);
select results_eq(
  $$ select outcome from loyalty_private.prepare_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_preference_operation('klaviyo:consent:new'),
       'klaviyo-worker-new-consent'
     ) $$,
  array['authorized'::text],
  'latest consent remains authorizable after older work is suppressed'
);
select * from loyalty_private.finish_klaviyo_notification_operation_v1(
  pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
  pg_temp.kl_preference_operation('klaviyo:consent:new'),
  'klaviyo-worker-new-consent', 'profile', 'dead_letter', null,
  'klaviyo_request_invalid', null
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       'klaviyo-worker-no-contact', 1, 60
     ) $$,
  array[1::bigint],
  'unconfirmed contact work can be leased without exposing identity'
);
select results_eq(
  $$ select outcome, recipient_email
     from loyalty_private.prepare_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-two'), repeat('cd', 32),
       pg_temp.kl_event_operation('klaviyo:event:no-contact'),
       'klaviyo-worker-no-contact'
     ) $$,
  $$ values ('contact_unavailable'::text, null::text) $$,
  'unverified Auth email never crosses the provider boundary'
);
reset role;

set local role loyalty_worker;
select * from loyalty_private.emit_notification_event_v1(
  pg_temp.kl_org('klaviyo-one'), pg_temp.kl_group('klaviyo-one'),
  pg_temp.kl_customer('b1000000-0000-4000-8000-000000000150'),
  'loyalty.points.earned', 'ledger_award', 'award:held',
  'klaviyo:event:held', '2026-08-24T08:11:00Z',
  '{"points":"5","pendingUntil":null}'::jsonb
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       'klaviyo-worker-held', 1, 60
     ) $$,
  array[1::bigint],
  'enabled managed work can be leased before rollback'
);
reset role;
select loyalty_private.set_organization_entitlement(
  'b1000000-0000-4000-8000-000000000100', 'notifications', 'disabled', null,
  'billing', 'operator:klaviyo-test', 'Disable provider during rollback test',
  pg_catalog.clock_timestamp(), null
);
set local role loyalty_worker;
select results_eq(
  $$ select outcome, recipient_email
     from loyalty_private.prepare_klaviyo_notification_operation_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       pg_temp.kl_event_operation('klaviyo:event:held'), 'klaviyo-worker-held'
     ) $$,
  $$ values ('held'::text, null::text) $$,
  'entitlement rollback withholds contact at preparation time'
);
reset role;
select loyalty_private.set_organization_entitlement(
  'b1000000-0000-4000-8000-000000000100', 'notifications', 'enabled', null,
  'billing', 'operator:klaviyo-test', 'Restore provider after rollback test',
  pg_catalog.clock_timestamp(), null
);

select throws_ok(
  $$ update loyalty_private.notification_klaviyo_operation_attempts
     set error_code = 'rewritten' where id = (
       select min(id) from loyalty_private.notification_klaviyo_operation_attempts
     ) $$,
  '55000', 'immutable loyalty history cannot be changed',
  'Klaviyo attempt evidence rejects rewrites'
);
set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.claim_klaviyo_notification_operations_v1(
       pg_temp.kl_connection('klaviyo-one'), repeat('ab', 32),
       'klaviyo-worker-invalid', 51, 60
     ) $$,
  '22023', 'invalid Klaviyo notification claim',
  'Klaviyo claim batches remain bounded'
);
select throws_ok(
  $$ insert into loyalty_private.notification_klaviyo_profiles(
       organization_id, connection_id, customer_id, provider_profile_id
     ) values (1, 1, 1, 'forbidden') $$,
  '42501', null,
  'worker cannot bypass the profile command boundary'
);
reset role;
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  $$ select transaction_count from klaviyo_ledger_before $$,
  'Klaviyo synchronization cannot create or change loyalty value'
);

select * from finish();
rollback;
