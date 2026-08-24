begin;

create extension if not exists pgtap with schema extensions;

select plan(86);

grant loyalty_worker to current_user;
grant usage on schema extensions to loyalty_worker;
grant execute on all functions in schema extensions to loyalty_worker;

select has_table(
  'loyalty_private', 'notification_email_template_versions',
  'versioned SMTP templates are private'
);
select has_table(
  'loyalty_private', 'notification_smtp_deliveries',
  'SMTP delivery leases have a private projection'
);
select has_table(
  'loyalty_private', 'notification_smtp_delivery_attempts',
  'SMTP attempts retain append-only evidence'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_email_template_versions'::regclass),
  'SMTP templates have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_smtp_deliveries'::regclass),
  'SMTP delivery leases have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_smtp_delivery_attempts'::regclass),
  'SMTP attempt evidence has RLS enabled'
);
select has_trigger(
  'loyalty_private', 'notification_email_template_versions',
  'notification_email_template_versions_immutable',
  'published SMTP templates cannot be rewritten'
);
select has_trigger(
  'loyalty_private', 'notification_smtp_delivery_attempts',
  'notification_smtp_delivery_attempts_immutable',
  'SMTP attempt history cannot be rewritten'
);
select has_function(
  'loyalty_private', 'claim_smtp_notification_deliveries_v1',
  array['text', 'integer', 'integer'],
  'bounded SMTP claim function exists'
);
select has_function(
  'loyalty_private', 'authorize_smtp_notification_delivery_v1',
  array['uuid', 'text'],
  'SMTP dispatch authorization function exists'
);
select has_function(
  'loyalty_private', 'finish_smtp_notification_delivery_v1',
  array['uuid', 'text', 'text', 'integer', 'text'],
  'SMTP finish function exists'
);
select has_function(
  'loyalty_private', 'resolve_verified_auth_email_v1', array['uuid'],
  'verified Auth contact uses one narrow bridge'
);
select function_owner_is(
  'loyalty_private', 'resolve_verified_auth_email_v1', array['uuid'],
  'postgres',
  'the narrow contact bridge executes with the migration administrator'
);
select results_eq(
  $$ select routine.prosecdef
     from pg_proc as routine
     where routine.oid =
       'loyalty_private.resolve_verified_auth_email_v1(uuid)'::regprocedure
       and exists (
         select 1 from unnest(routine.proconfig) as setting
         where setting = 'search_path=""'
       ) $$,
  array[true],
  'the contact bridge is security definer with an empty search path'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.claim_smtp_notification_deliveries_v1(text,integer,integer)',
    'EXECUTE'
  ),
  'worker can claim SMTP deliveries only through the command boundary'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.authorize_smtp_notification_delivery_v1(uuid,text)',
    'EXECUTE'
  ),
  'worker can authorize an owned SMTP lease'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.finish_smtp_notification_delivery_v1(uuid,text,text,integer,text)',
    'EXECUTE'
  ),
  'worker can record a bounded SMTP result'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.claim_smtp_notification_deliveries_v1(text,integer,integer)',
    'EXECUTE'
  ),
  'browser sessions cannot claim SMTP work'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.authorize_smtp_notification_delivery_v1(uuid,text)',
    'EXECUTE'
  ),
  'browser sessions cannot resolve a notification contact'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.notification_smtp_deliveries', 'SELECT'
  ),
  'worker cannot enumerate the private SMTP projection'
);
select ok(
  not has_table_privilege(
    'loyalty_worker',
    'loyalty_private.notification_smtp_delivery_attempts', 'SELECT'
  ),
  'worker cannot enumerate contact-free attempt history'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'loyalty_private.notification_email_template_versions', 'SELECT'
  ),
  'browser sessions cannot enumerate message templates'
);
select ok(
  has_function_privilege(
    'loyalty_owner',
    'loyalty_private.resolve_verified_auth_email_v1(uuid)', 'EXECUTE'
  ),
  'NOLOGIN loyalty owner can call the narrow verified-contact bridge'
);
select ok(
  not has_schema_privilege('loyalty_owner', 'auth', 'USAGE')
    and not has_table_privilege('loyalty_owner', 'auth.users', 'SELECT'),
  'loyalty function ownership does not grant direct Auth enumeration'
);
select ok(
  not has_function_privilege(
    'loyalty_worker',
    'loyalty_private.resolve_verified_auth_email_v1(uuid)', 'EXECUTE'
  ),
  'worker cannot resolve Auth contact outside dispatch authorization'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.notification_email_template_versions $$,
  array[6::bigint],
  'six English transactional templates are seeded'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.notification_email_template_versions
     where pg_catalog.octet_length(template_sha256) = 32 $$,
  array[6::bigint],
  'every template has deterministic SHA-256 evidence'
);
select hasnt_column(
  'loyalty_private', 'notification_smtp_deliveries', 'recipient_email',
  'delivery projections never persist the recipient contact'
);
select hasnt_column(
  'loyalty_private', 'notification_smtp_delivery_attempts', 'recipient_email',
  'attempt evidence never persists the recipient contact'
);
select hasnt_column(
  'loyalty_private', 'notification_events', 'recipient_email',
  'provider-neutral events never persist the recipient contact'
);

insert into auth.users (id, email, email_confirmed_at)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'confirmed-member@example.test', '2026-08-24T07:00:00Z'
  ),
  (
    'a2000000-0000-4000-8000-000000000001',
    'unconfirmed-member@example.test', null
  );
insert into loyalty.organizations (public_id, slug, name)
values
  ('a1000000-0000-4000-8000-000000000100', 'smtp-one', 'SMTP One'),
  ('a2000000-0000-4000-8000-000000000100', 'smtp-two', 'SMTP Two');
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'smtp-one' then 'a1000000-0000-4000-8000-000000000110'::uuid
    else 'a2000000-0000-4000-8000-000000000110'::uuid end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('smtp-one', 'smtp-two');
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select case organization.slug
    when 'smtp-one' then 'a1000000-0000-4000-8000-000000000120'::uuid
    else 'a2000000-0000-4000-8000-000000000120'::uuid end,
  organization.id, 'rewards', organization.name || ' Rewards'
from loyalty.organizations as organization
where organization.slug in ('smtp-one', 'smtp-two');
insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select case organization.slug
    when 'smtp-one' then 'a1000000-0000-4000-8000-000000000130'::uuid
    else 'a2000000-0000-4000-8000-000000000130'::uuid end,
  organization.id, programme_group.id, 'rewards', organization.name || ' Rewards',
  'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug in ('smtp-one', 'smtp-two');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id, display_name,
  current_key_version, signing_material_ref, programme_id
)
select case organization.slug
    when 'smtp-one' then 'a1000000-0000-4000-8000-000000000140'::uuid
    else 'a2000000-0000-4000-8000-000000000140'::uuid end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug,
  programme.id
from loyalty.organizations as organization
join loyalty.workspaces as workspace
  on workspace.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug in ('smtp-one', 'smtp-two');
insert into loyalty.customers (public_id, organization_id, display_reference)
select case organization.slug
    when 'smtp-one' then 'a1000000-0000-4000-8000-000000000150'::uuid
    else 'a2000000-0000-4000-8000-000000000150'::uuid end,
  organization.id, 'Private SMTP subject'
from loyalty.organizations as organization
where organization.slug in ('smtp-one', 'smtp-two');
insert into loyalty.customer_user_links (
  public_id, organization_id, customer_id, auth_user_id, source_connection_id
)
select case organization.slug
    when 'smtp-one' then 'a1000000-0000-4000-8000-000000000160'::uuid
    else 'a2000000-0000-4000-8000-000000000160'::uuid end,
  organization.id, customer.id,
  case organization.slug
    when 'smtp-one' then 'a1000000-0000-4000-8000-000000000001'::uuid
    else 'a2000000-0000-4000-8000-000000000001'::uuid end,
  connection.id
from loyalty.organizations as organization
join loyalty.customers as customer
  on customer.organization_id = organization.id
join loyalty.commerce_connections as connection
  on connection.organization_id = organization.id
where organization.slug in ('smtp-one', 'smtp-two');

create function pg_temp.smtp_org(target_slug text)
returns bigint language sql stable security definer set search_path = '' as $$
  select id from loyalty.organizations where slug = target_slug;
$$;
create function pg_temp.smtp_group(target_slug text)
returns bigint language sql stable security definer set search_path = '' as $$
  select programme_group.id
  from loyalty.programme_groups as programme_group
  join loyalty.organizations as organization
    on organization.id = programme_group.organization_id
  where organization.slug = target_slug;
$$;
create function pg_temp.smtp_customer(target_slug text)
returns bigint language sql stable security definer set search_path = '' as $$
  select customer.id
  from loyalty.customers as customer
  join loyalty.organizations as organization
    on organization.id = customer.organization_id
  where organization.slug = target_slug;
$$;
create function pg_temp.smtp_delivery(target_deduplication_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select delivery.public_id
  from loyalty_private.notification_smtp_deliveries as delivery
  join loyalty_private.notification_events as event
    on event.organization_id = delivery.organization_id
   and event.id = delivery.notification_event_id
  where event.deduplication_key = target_deduplication_key;
$$;

create temporary table smtp_ledger_before as
select count(*)::bigint as transaction_count from loyalty.ledger_transactions;

set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
       pg_temp.smtp_customer('smtp-one'), 'loyalty.points.released',
       'ledger_release', 'release:one', 'smtp:event:released',
       '2026-08-24T08:00:00Z',
       '{"points":"25","availableBalance":"125"}'::jsonb
     ) $$,
  array['created'::text],
  'a transactional event creates provider-neutral evidence'
);
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
       pg_temp.smtp_customer('smtp-one'), 'loyalty.points.released',
       'ledger_release', 'release:one', 'smtp:event:released',
       '2026-08-24T08:00:00Z',
       '{"points":"25","availableBalance":"125"}'::jsonb
     ) $$,
  array['duplicate'::text],
  'exact event replay returns the accepted event identity'
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.notification_smtp_deliveries as delivery
     join loyalty_private.notification_events as event
       on event.id = delivery.notification_event_id
     where event.deduplication_key = 'smtp:event:released' $$,
  array[1::bigint],
  'event replay maps to exactly one SMTP delivery'
);
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-one', 1, 60
     ) $$,
  array[1::bigint],
  'worker claims one bounded SMTP delivery'
);
select results_eq(
  $$ select outcome, attempt_count, recipient_email, event ->> 'eventType'
     from loyalty_private.authorize_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:released'), 'smtp-worker-one'
     ) $$,
  $$ values (
    'authorized'::text, 1, 'confirmed-member@example.test'::text,
    'loyalty.points.released'::text
  ) $$,
  'authorization resolves the verified Auth contact only for the owned lease'
);
reset role;
select ok(
  not exists (
    select 1 from loyalty_private.notification_events as event
    where event.deduplication_key = 'smtp:event:released'
      and pg_catalog.to_jsonb(event)::text like '%confirmed-member@example.test%'
  ),
  'the resolved contact is absent from persisted event evidence'
);
set local role loyalty_worker;
select results_eq(
  $$ select state, outcome, scheduled_at
     from loyalty_private.finish_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:released'), 'smtp-worker-one',
       'delivered', 250, null
     ) $$,
  $$ values ('delivered'::text, 'delivered'::text, null::timestamptz) $$,
  'a 2xx provider acceptance records one delivered outcome'
);
reset role;
select results_eq(
  $$ select state, attempt_count, delivered_at is not null
     from loyalty_private.notification_smtp_deliveries
     where public_id = pg_temp.smtp_delivery('smtp:event:released') $$,
  $$ values ('delivered'::text, 1, true) $$,
  'delivered state retains the bounded attempt count and timestamp'
);
set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.finish_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:released'), 'smtp-worker-one',
       'delivered', 250, null
     ) $$,
  '42501', 'SMTP notification authorization not owned',
  'replaying a finished SMTP result cannot append another attempt'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select preference_state
     from loyalty.set_my_notification_preference_v1(
       'a1000000-0000-4000-8000-000000000160',
       'loyalty_transactional', 'unsubscribed', 'smtp:preference:off',
       'a1000000-0000-4000-8000-000000000201'
     ) $$,
  array['unsubscribed'::text],
  'customer withdrawal updates transactional eligibility immediately'
);
reset role;
set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
       pg_temp.smtp_customer('smtp-one'), 'loyalty.points.earned',
       'ledger_award', 'award:off', 'smtp:event:suppressed',
       '2026-08-24T08:01:00Z',
       '{"points":"10","pendingUntil":null}'::jsonb
     ) $$,
  array['created'::text],
  'suppressed customer events remain immutable provider-neutral evidence'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-suppressed', 1, 60
     ) $$,
  array[1::bigint],
  'suppressed event is claimed before current consent is rechecked'
);
select results_eq(
  $$ select outcome, recipient_email
     from loyalty_private.authorize_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:suppressed'), 'smtp-worker-suppressed'
     ) $$,
  $$ values ('suppressed'::text, null::text) $$,
  'withdrawal prevents contact disclosure and SMTP authorization'
);
reset role;
select results_eq(
  $$ select outcome, response_class
     from loyalty_private.notification_smtp_delivery_attempts as attempt
     where attempt.delivery_id = (
       select id from loyalty_private.notification_smtp_deliveries
       where public_id = pg_temp.smtp_delivery('smtp:event:suppressed')
     ) $$,
  $$ values ('suppressed'::text, 'policy'::text) $$,
  'suppression writes contact-free policy evidence'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select preference_state
     from loyalty.set_my_notification_preference_v1(
       'a1000000-0000-4000-8000-000000000160',
       'loyalty_transactional', 'subscribed', 'smtp:preference:on',
       'a1000000-0000-4000-8000-000000000202'
     ) $$,
  array['subscribed'::text],
  'customer can explicitly restore transactional notifications'
);
reset role;
set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
       pg_temp.smtp_customer('smtp-one'), 'loyalty.points.earned',
       'ledger_award', 'award:held', 'smtp:event:held',
       '2026-08-24T08:02:00Z',
       '{"points":"10","pendingUntil":null}'::jsonb
     ) $$,
  array['created'::text],
  'an enabled self-hosted tenant queues transactional SMTP work'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-held', 1, 60
     ) $$,
  array[1::bigint],
  'enabled work can be leased before a rollout change'
);
reset role;
do $$ begin
  perform loyalty_private.set_organization_entitlement(
    'a1000000-0000-4000-8000-000000000100', 'notifications', 'disabled', null,
    'local_control', 'operator:smtp-test',
    'Disable notifications during SMTP rollback verification',
    pg_catalog.clock_timestamp(), null
  );
end $$;
set local role loyalty_worker;
select results_eq(
  $$ select outcome, recipient_email
     from loyalty_private.authorize_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:held'), 'smtp-worker-held'
     ) $$,
  $$ values ('held'::text, null::text) $$,
  'rollout disablement withholds an in-flight lease before contact disclosure'
);
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
       pg_temp.smtp_customer('smtp-one'), 'loyalty.points.earned',
       'ledger_award', 'award:disabled', 'smtp:event:disabled',
       pg_catalog.clock_timestamp(),
       '{"points":"10","pendingUntil":null}'::jsonb
     ) $$,
  array['created'::text],
  'disabled delivery still retains the provider-neutral business event'
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.notification_smtp_deliveries as delivery
     join loyalty_private.notification_events as event
       on event.id = delivery.notification_event_id
     where event.deduplication_key = 'smtp:event:disabled' $$,
  array[0::bigint],
  'disabled delivery creates no SMTP work projection'
);
do $$ begin
  perform loyalty_private.set_organization_entitlement(
    'a1000000-0000-4000-8000-000000000100', 'notifications', 'enabled', null,
    'local_control', 'operator:smtp-test',
    'Restore notifications after SMTP rollback verification',
    pg_catalog.clock_timestamp(), null
  );
end $$;
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-held-again', 1, 60
     ) $$,
  array[1::bigint],
  'a held delivery becomes claimable after explicit re-enablement'
);
select results_eq(
  $$ select outcome from loyalty_private.authorize_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:held'), 'smtp-worker-held-again'
     ) $$,
  array['authorized'::text],
  're-enabled work rechecks every dispatch authority'
);
select results_eq(
  $$ select state from loyalty_private.finish_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:held'), 'smtp-worker-held-again',
       'manual_review', null, 'smtp_outcome_ambiguous'
     ) $$,
  array['manual_review'::text],
  'ambiguous provider outcomes never retry automatically'
);

select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
       pg_temp.smtp_customer('smtp-one'), 'loyalty.points.released',
       'ledger_release', 'release:retry', 'smtp:event:retry',
       '2026-08-24T08:03:00Z',
       '{"points":"5","availableBalance":"130"}'::jsonb
     ) $$,
  array['created'::text],
  'a second provider-neutral event queues independently'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-retry', 1, 60
     ) $$,
  array[1::bigint],
  'retry fixture receives one lease'
);
select results_eq(
  $$ select outcome from loyalty_private.authorize_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:retry'), 'smtp-worker-retry'
     ) $$,
  array['authorized'::text],
  'retry fixture resolves dispatch authority once'
);
select throws_ok(
  $$ select * from loyalty_private.finish_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:retry'), 'smtp-worker-retry',
       'retryable', 250, 'smtp_temporary_rejection'
     ) $$,
  '22023', 'invalid retryable SMTP result',
  'success response codes cannot be mislabeled retryable'
);
select results_eq(
  $$ select state from loyalty_private.finish_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:retry'), 'smtp-worker-retry',
       'retryable', 450, 'smtp_temporary_rejection'
     ) $$,
  array['retryable'::text],
  'an explicit 4xx rejection receives bounded backoff'
);
reset role;
select ok(
  (select next_attempt_at > updated_at
   from loyalty_private.notification_smtp_deliveries
   where public_id = pg_temp.smtp_delivery('smtp:event:retry')),
  'retry scheduling is strictly in the future'
);
update loyalty_private.notification_smtp_deliveries
set attempt_count = 9, next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
where public_id = pg_temp.smtp_delivery('smtp:event:retry');
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-limit', 1, 60
     ) $$,
  array[1::bigint],
  'a due ninth-attempt projection can receive its final lease'
);
select results_eq(
  $$ select attempt_count
     from loyalty_private.authorize_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:retry'), 'smtp-worker-limit'
     ) $$,
  array[10],
  'authorization increments the final attempt atomically'
);
select results_eq(
  $$ select state from loyalty_private.finish_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:retry'), 'smtp-worker-limit',
       'retryable', 450, 'smtp_temporary_rejection'
     ) $$,
  array['manual_review'::text],
  'the tenth temporary failure stops in manual review'
);
reset role;
select results_eq(
  $$ select state, last_error_code
     from loyalty_private.notification_smtp_deliveries
     where public_id = pg_temp.smtp_delivery('smtp:event:retry') $$,
  $$ values ('manual_review'::text, 'attempt_limit_exhausted'::text) $$,
  'attempt exhaustion is nonclaimable and diagnostically explicit'
);

set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
       pg_temp.smtp_customer('smtp-one'), 'loyalty.points.released',
       'ledger_release', 'release:prelease', 'smtp:event:prelease',
       '2026-08-24T08:04:00Z',
       '{"points":"1","availableBalance":"131"}'::jsonb
     ) $$,
  array['created'::text],
  'pre-authorization lease recovery fixture is queued'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-crashed-before', 1, 60
     ) $$,
  array[1::bigint],
  'pre-authorization fixture is leased'
);
reset role;
update loyalty_private.notification_smtp_deliveries
set lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
where public_id = pg_temp.smtp_delivery('smtp:event:prelease');
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-recovered-before', 1, 60
     ) $$,
  array[1::bigint],
  'a crash before contact disclosure safely reclaims the same work'
);
reset role;
select results_eq(
  $$ select attempt_count, outcome
     from loyalty_private.notification_smtp_delivery_attempts as attempt
     where attempt.delivery_id = (
       select id from loyalty_private.notification_smtp_deliveries
       where public_id = pg_temp.smtp_delivery('smtp:event:prelease')
     ) $$,
  $$ values (null::integer, 'lease_expired_before_authorization'::text) $$,
  'pre-authorization expiry records evidence without consuming an attempt'
);
set local role loyalty_worker;
select * from loyalty_private.authorize_smtp_notification_delivery_v1(
  pg_temp.smtp_delivery('smtp:event:prelease'), 'smtp-worker-recovered-before'
);
select * from loyalty_private.finish_smtp_notification_delivery_v1(
  pg_temp.smtp_delivery('smtp:event:prelease'), 'smtp-worker-recovered-before',
  'dead_letter', 550, 'smtp_permanent_rejection'
);

select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
       pg_temp.smtp_customer('smtp-one'), 'loyalty.points.released',
       'ledger_release', 'release:postlease', 'smtp:event:postlease',
       '2026-08-24T08:05:00Z',
       '{"points":"1","availableBalance":"132"}'::jsonb
     ) $$,
  array['created'::text],
  'post-authorization lease recovery fixture is queued'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-crashed-after', 1, 60
     ) $$,
  array[1::bigint],
  'post-authorization fixture is leased'
);
select results_eq(
  $$ select outcome from loyalty_private.authorize_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:postlease'), 'smtp-worker-crashed-after'
     ) $$,
  array['authorized'::text],
  'post-authorization fixture discloses contact for one attempt'
);
reset role;
update loyalty_private.notification_smtp_deliveries
set lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
where public_id = pg_temp.smtp_delivery('smtp:event:postlease');
set local role loyalty_worker;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-recovered-after', 1, 60
     ) $$,
  array[0::bigint],
  'a crash after contact disclosure is never retried automatically'
);
reset role;
select results_eq(
  $$ select state, last_error_code
     from loyalty_private.notification_smtp_deliveries
     where public_id = pg_temp.smtp_delivery('smtp:event:postlease') $$,
  $$ values (
    'manual_review'::text, 'lease_expired_after_authorization'::text
  ) $$,
  'post-authorization expiry stops in manual review'
);
select results_eq(
  $$ select attempt_number, outcome, response_class
     from loyalty_private.notification_smtp_delivery_attempts as attempt
     where attempt.delivery_id = (
       select id from loyalty_private.notification_smtp_deliveries
       where public_id = pg_temp.smtp_delivery('smtp:event:postlease')
     ) $$,
  $$ values (
    1, 'lease_expired_after_authorization'::text, 'ambiguous'::text
  ) $$,
  'post-authorization expiry retains its exact attempt evidence'
);

set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-two'), pg_temp.smtp_group('smtp-two'),
       pg_temp.smtp_customer('smtp-two'), 'loyalty.points.released',
       'ledger_release', 'release:no-contact', 'smtp:event:no-contact',
       '2026-08-24T08:06:00Z',
       '{"points":"2","availableBalance":"2"}'::jsonb
     ) $$,
  array['created'::text],
  'an unconfirmed account still receives provider-neutral event evidence'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-no-contact', 1, 60
     ) $$,
  array[1::bigint],
  'unconfirmed contact work can be leased without revealing identity'
);
select throws_ok(
  $$ select * from loyalty_private.authorize_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:no-contact'), 'wrong-worker'
     ) $$,
  '42501', 'SMTP notification lease not owned',
  'a different worker cannot authorize another worker lease'
);
select results_eq(
  $$ select outcome, recipient_email
     from loyalty_private.authorize_smtp_notification_delivery_v1(
       pg_temp.smtp_delivery('smtp:event:no-contact'), 'smtp-worker-no-contact'
     ) $$,
  $$ values ('contact_unavailable'::text, null::text) $$,
  'unverified Auth email never crosses the dispatch boundary'
);
reset role;
select results_eq(
  $$ select state, attempt_count
     from loyalty_private.notification_smtp_deliveries
     where public_id = pg_temp.smtp_delivery('smtp:event:no-contact') $$,
  $$ values ('contact_unavailable'::text, 0) $$,
  'missing verified contact consumes no SMTP attempt'
);

set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
       pg_temp.smtp_customer('smtp-one'), 'loyalty.campaign.effect',
       'campaign_effect', 'campaign:one', 'smtp:event:marketing',
       '2026-08-24T08:07:00Z',
       '{"campaignVersionId":"a1000000-0000-4000-8000-000000000300","outcome":"control","points":"0"}'::jsonb
     ) $$,
  array['created'::text],
  'marketing events remain available for later provider adapters'
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.notification_smtp_deliveries as delivery
     join loyalty_private.notification_events as event
       on event.id = delivery.notification_event_id
     where event.deduplication_key = 'smtp:event:marketing' $$,
  array[0::bigint],
  'transactional SMTP never consumes marketing events'
);

set local role loyalty_worker;
select * from loyalty_private.emit_notification_event_v1(
  pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
  pg_temp.smtp_customer('smtp-one'), 'loyalty.points.expiring',
  'expiry_notice', 'expiry:one', 'smtp:event:expiring',
  '2026-08-24T08:08:00Z',
  '{"points":"5","expiresAt":"2026-09-24T08:08:00Z","daysRemaining":31}'::jsonb
);
select * from loyalty_private.emit_notification_event_v1(
  pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
  pg_temp.smtp_customer('smtp-one'), 'loyalty.reward.changed',
  'reward_state', 'reward:one', 'smtp:event:reward',
  '2026-08-24T08:09:00Z',
  '{"rewardReservationId":"a1000000-0000-4000-8000-000000000310","rewardCode":"reward_one","state":"reserved"}'::jsonb
);
select * from loyalty_private.emit_notification_event_v1(
  pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
  pg_temp.smtp_customer('smtp-one'), 'loyalty.tier.changed',
  'tier_transition', 'tier:one', 'smtp:event:tier',
  '2026-08-24T08:10:00Z',
  '{"fromTierCode":null,"toTierCode":"rose","effectiveAt":"2026-08-24T08:10:00Z"}'::jsonb
);
select * from loyalty_private.emit_notification_event_v1(
  pg_temp.smtp_org('smtp-one'), pg_temp.smtp_group('smtp-one'),
  pg_temp.smtp_customer('smtp-one'), 'loyalty.referral.changed',
  'referral_state', 'referral:one', 'smtp:event:referral',
  '2026-08-24T08:11:00Z',
  '{"referralId":"a1000000-0000-4000-8000-000000000320","party":"advocate","state":"cooling"}'::jsonb
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty_private.notification_smtp_deliveries as delivery
     join loyalty_private.notification_events as event
       on event.id = delivery.notification_event_id
     join loyalty_private.notification_email_template_versions as template
       on template.id = delivery.template_id
     where template.event_type <> event.event_type $$,
  array[0::bigint],
  'every queued event is pinned to its matching immutable template version'
);

select throws_ok(
  $$ update loyalty_private.notification_email_template_versions
     set subject_template = 'rewritten' where template_code = 'points_released' $$,
  '55000', 'immutable row cannot be changed',
  'template history rejects updates'
);
select throws_ok(
  $$ update loyalty_private.notification_smtp_delivery_attempts
     set error_code = 'rewritten' where id = (
       select min(id) from loyalty_private.notification_smtp_delivery_attempts
     ) $$,
  '55000', 'immutable row cannot be changed',
  'SMTP attempt history rejects updates'
);
set local role loyalty_worker;
select throws_ok(
  $$ select * from loyalty_private.claim_smtp_notification_deliveries_v1(
       'smtp-worker-invalid', 51, 60
     ) $$,
  '22023', 'invalid SMTP notification claim',
  'claim batches remain bounded'
);
select throws_ok(
  $$ insert into loyalty_private.notification_smtp_deliveries (
       organization_id, notification_event_id, template_id
     ) values (1, 1, 1) $$,
  '42501', null,
  'worker cannot bypass the SMTP delivery command boundary'
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from loyalty.ledger_transactions $$,
  $$ select transaction_count from smtp_ledger_before $$,
  'notification delivery cannot create or change loyalty value'
);

select * from finish();
rollback;
