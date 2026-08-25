begin;

create extension if not exists pgtap with schema extensions;

select plan(63);

grant loyalty_worker to current_user;
grant usage on schema extensions to loyalty_worker;
grant execute on all functions in schema extensions to loyalty_worker;

select has_table(
  'loyalty_private', 'notification_email_template_bindings',
  'active organization email templates use a private projection'
);
select has_table(
  'loyalty_private', 'notification_smtp_test_deliveries',
  'merchant SMTP tests use an isolated private queue'
);
select has_table(
  'loyalty_private', 'notification_smtp_test_delivery_attempts',
  'SMTP test outcomes retain append-only evidence'
);
select has_function(
  'loyalty', 'publish_notification_email_template_command',
  array['uuid', 'text', 'text', 'text', 'text', 'uuid'],
  'Auth-scoped template publication exists'
);
select has_function(
  'loyalty', 'send_notification_test_command',
  array['uuid', 'text', 'text', 'uuid'],
  'Auth-scoped test enqueue exists'
);
select has_function(
  'loyalty', 'get_notification_workspace_v1',
  array['uuid', 'integer'],
  'minimized merchant notification workspace exists'
);
select has_function(
  'loyalty_private', 'claim_smtp_notification_tests_v1',
  array['text', 'integer', 'integer'],
  'bounded SMTP test claim exists'
);
select has_function(
  'loyalty_private', 'authorize_smtp_notification_test_v1',
  array['uuid', 'text'],
  'SMTP test authorization exists'
);
select has_function(
  'loyalty_private', 'finish_smtp_notification_test_v1',
  array['uuid', 'text', 'text', 'integer', 'text'],
  'bounded SMTP test finish exists'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_email_template_bindings'::regclass),
  'active template bindings have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_smtp_test_deliveries'::regclass),
  'SMTP test deliveries have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.notification_smtp_test_delivery_attempts'::regclass),
  'SMTP test attempts have RLS enabled'
);
select has_trigger(
  'loyalty_private', 'notification_smtp_test_delivery_attempts',
  'notification_smtp_test_delivery_attempts_immutable',
  'SMTP test attempt evidence cannot be rewritten'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.publish_notification_email_template_command(uuid,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated sessions can enter the publication command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.send_notification_test_command(uuid,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated sessions can enter the test command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.get_notification_workspace_v1(uuid,integer)', 'EXECUTE'
  ),
  'authenticated members can enter the minimized read command'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.claim_smtp_notification_tests_v1(text,integer,integer)',
    'EXECUTE'
  ),
  'browser sessions cannot claim SMTP tests'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.authorize_smtp_notification_test_v1(uuid,text)',
    'EXECUTE'
  ),
  'notification worker can authorize an owned test lease'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'loyalty_private.notification_smtp_test_deliveries', 'SELECT'
  ),
  'browser sessions cannot enumerate the private test queue'
);
select ok(
  not has_table_privilege(
    'loyalty_worker',
    'loyalty_private.notification_email_template_versions', 'SELECT'
  ),
  'worker cannot enumerate template content outside authorization'
);
select hasnt_column(
  'loyalty_private', 'notification_smtp_test_deliveries', 'recipient_email',
  'test queue never persists a recipient address'
);
select hasnt_column(
  'loyalty_private', 'notification_smtp_test_deliveries', 'subject_template',
  'test queue pins a template instead of copying message content'
);
select hasnt_column(
  'loyalty_private', 'notification_smtp_test_delivery_attempts',
  'provider_response',
  'test attempt evidence cannot retain raw provider responses'
);

insert into auth.users (id, email, email_confirmed_at)
values
  (
    'e1000000-0000-4000-8000-000000000001',
    'notification-owner@example.test', '2026-08-25T08:00:00Z'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'notification-admin@example.test', '2026-08-25T08:00:00Z'
  ),
  (
    'e1000000-0000-4000-8000-000000000003',
    'notification-analyst@example.test', '2026-08-25T08:00:00Z'
  ),
  (
    'e2000000-0000-4000-8000-000000000001',
    'other-owner@example.test', '2026-08-25T08:00:00Z'
  );
insert into loyalty.organizations (public_id, slug, name)
values
  ('e1000000-0000-4000-8000-000000000100', 'template-one', 'Template One'),
  ('e2000000-0000-4000-8000-000000000100', 'template-two', 'Template Two');
insert into loyalty.workspaces (public_id, organization_id, slug, name)
select case organization.slug
    when 'template-one' then 'e1000000-0000-4000-8000-000000000110'::uuid
    else 'e2000000-0000-4000-8000-000000000110'::uuid end,
  organization.id, 'store', organization.name || ' Store'
from loyalty.organizations as organization
where organization.slug in ('template-one', 'template-two');
insert into loyalty.organization_memberships (organization_id, user_id, role)
select organization.id, member.user_id, member.role
from loyalty.organizations as organization
cross join (values
  ('e1000000-0000-4000-8000-000000000001'::uuid, 'owner'::text),
  ('e1000000-0000-4000-8000-000000000002'::uuid, 'admin'::text),
  ('e1000000-0000-4000-8000-000000000003'::uuid, 'analyst'::text)
) as member(user_id, role)
where organization.slug = 'template-one';
insert into loyalty.organization_memberships (organization_id, user_id, role)
select organization.id, 'e2000000-0000-4000-8000-000000000001'::uuid, 'owner'
from loyalty.organizations as organization where organization.slug = 'template-two';
insert into loyalty.programme_groups (public_id, organization_id, slug, name)
select 'e1000000-0000-4000-8000-000000000120'::uuid,
  organization.id, 'rewards', 'Template Rewards'
from loyalty.organizations as organization where organization.slug = 'template-one';
insert into loyalty.customers (public_id, organization_id, display_reference)
select 'e1000000-0000-4000-8000-000000000130'::uuid,
  organization.id, 'Template Customer'
from loyalty.organizations as organization where organization.slug = 'template-one';

create function pg_temp.template_org(target_slug text)
returns bigint language sql stable security definer set search_path = '' as $$
  select id from loyalty.organizations where slug = target_slug;
$$;
create function pg_temp.template_group()
returns bigint language sql stable security definer set search_path = '' as $$
  select id from loyalty.programme_groups
  where public_id = 'e1000000-0000-4000-8000-000000000120'::uuid;
$$;
create function pg_temp.template_customer()
returns bigint language sql stable security definer set search_path = '' as $$
  select id from loyalty.customers
  where public_id = 'e1000000-0000-4000-8000-000000000130'::uuid;
$$;
create function pg_temp.test_delivery(target_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select public_id
  from loyalty_private.notification_smtp_test_deliveries
  where organization_id = pg_temp.template_org('template-one')
    and idempotency_key = target_key;
$$;

create temporary table template_ledger_before as
select pg_catalog.count(*)::bigint as transaction_count
from loyalty.ledger_transactions;

select ok(
  loyalty_private.notification_email_template_content_valid_v1(
    'loyalty.points.released', '{{points}} available',
    'Balance: {{availableBalance}} points.'
  ),
  'database accepts the exact event token allowlist'
);
select ok(
  not loyalty_private.notification_email_template_content_valid_v1(
    'loyalty.points.released', '{{points}} available',
    'Private: {{customerEmail}}'
  ),
  'database rejects an unknown template token'
);
select ok(
  not loyalty_private.notification_email_template_content_valid_v1(
    'loyalty.points.released', 'Available', '<script>alert(1)</script>'
  ),
  'database rejects merchant-authored markup'
);
select ok(
  not loyalty_private.notification_email_template_content_valid_v1(
    'loyalty.points.released', 'Available', 'Visit https://example.test'
  ),
  'database rejects merchant-authored URLs'
);
select results_eq(
  $$ select loyalty_private.notification_email_plain_html_v1(
       E'Five & six\nNo markup'
     ) $$,
  $$ values ('<p>Five &amp; six<br>No markup</p>'::text) $$,
  'HTML alternative is deterministic and escaped'
);

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select template_version, outcome
     from loyalty.publish_notification_email_template_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.released', '{{points}} points are ready',
       'You now have {{availableBalance}} points.',
       'template:released:v1',
       'e1000000-0000-4000-8000-000000000201'
     ) $$,
  $$ values (1, 'created'::text) $$,
  'owner publishes and activates one immutable tenant version'
);
select results_eq(
  $$ select template_version, outcome
     from loyalty.publish_notification_email_template_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.released', '{{points}} points are ready',
       'You now have {{availableBalance}} points.',
       'template:released:v1',
       'e1000000-0000-4000-8000-000000000201'
     ) $$,
  $$ values (1, 'duplicate'::text) $$,
  'exact publication replay returns the accepted version'
);
select throws_ok(
  $$ select * from loyalty.publish_notification_email_template_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.released', 'Changed subject',
       'You now have {{availableBalance}} points.',
       'template:released:v1',
       'e1000000-0000-4000-8000-000000000202'
     ) $$,
  '23514', 'notification template command idempotency conflict',
  'changed publication replay fails closed'
);
select throws_ok(
  $$ select * from loyalty.publish_notification_email_template_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.released', 'Unsafe', 'Visit https://example.test',
       'template:unsafe:url',
       'e1000000-0000-4000-8000-000000000203'
     ) $$,
  '22023', 'invalid notification template command',
  'unsafe content cannot cross the command boundary'
);
reset role;
select results_eq(
  $$ select organization_id is not null, template_version,
       html_template, pg_catalog.octet_length(template_sha256)
     from loyalty_private.notification_email_template_versions
     where organization_id = pg_temp.template_org('template-one') $$,
  $$ values (
    true, 1, '<p>You now have {{availableBalance}} points.</p>'::text, 32
  ) $$,
  'tenant version retains exact content and deterministic hash evidence'
);
select results_eq(
  $$ select pg_catalog.count(*)::bigint
     from loyalty_private.notification_email_template_bindings
     where organization_id = pg_temp.template_org('template-one')
       and event_type = 'loyalty.points.released' $$,
  array[1::bigint],
  'one private active projection points at the published version'
);
select throws_ok(
  $$ update loyalty_private.notification_email_template_versions
     set subject_template = 'rewritten'
     where organization_id = pg_temp.template_org('template-one') $$,
  '55000', 'immutable record cannot be changed',
  'published tenant content cannot be rewritten'
);
select ok(
  not exists (
    select 1 from loyalty.admin_audit_events as audit
    where audit.organization_id = pg_temp.template_org('template-one')
      and audit.action = 'notification.template.publish'
      and audit.metadata::text like '%You now have%'
  ),
  'publication audit does not copy authored message content'
);

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select * from loyalty.publish_notification_email_template_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.earned', 'Earned {{points}}',
       'Pending until {{pendingUntil}}.', 'analyst:publish',
       'e1000000-0000-4000-8000-000000000204'
     ) $$,
  '42501', 'notification template command not authorized',
  'analyst cannot publish message content'
);
select throws_ok(
  $$ select * from loyalty.send_notification_test_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.released', 'analyst:test',
       'e1000000-0000-4000-8000-000000000205'
     ) $$,
  '42501', 'notification test command not authorized',
  'analyst cannot send a test'
);
reset role;

set local role loyalty_worker;
select results_eq(
  $$ select outcome from loyalty_private.emit_notification_event_v1(
       pg_temp.template_org('template-one'), pg_temp.template_group(),
       pg_temp.template_customer(), 'loyalty.points.released',
       'ledger_release', 'template:release:one', 'template:event:one',
       '2026-08-25T09:00:00Z',
       '{"points":"10","availableBalance":"40"}'::jsonb
     ) $$,
  array['created'::text],
  'a normal event is accepted after tenant publication'
);
reset role;
select results_eq(
  $$ select template.organization_id, template.template_version
     from loyalty_private.notification_smtp_deliveries as delivery
     join loyalty_private.notification_events as event
       on event.id = delivery.notification_event_id
     join loyalty_private.notification_email_template_versions as template
       on template.id = delivery.template_id
     where event.deduplication_key = 'template:event:one' $$,
  $$ values (pg_temp.template_org('template-one'), 1) $$,
  'accepted delivery pins the active tenant version'
);

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select template_version, outcome
     from loyalty.publish_notification_email_template_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.released', '{{points}} points arrived',
       'Balance is {{availableBalance}} points.',
       'template:released:v2',
       'e1000000-0000-4000-8000-000000000206'
     ) $$,
  $$ values (2, 'created'::text) $$,
  'second publication creates a new immutable version'
);
select results_eq(
  $$ select state, outcome from loyalty.send_notification_test_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.released', 'test:owner:one',
       'e1000000-0000-4000-8000-000000000207'
     ) $$,
  $$ values ('pending'::text, 'created'::text) $$,
  'owner enqueues a test without a recipient input'
);
select results_eq(
  $$ select state, outcome from loyalty.send_notification_test_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.released', 'test:owner:one',
       'e1000000-0000-4000-8000-000000000207'
     ) $$,
  $$ values ('pending'::text, 'duplicate'::text) $$,
  'exact test replay creates no duplicate queue item'
);
select throws_ok(
  $$ select * from loyalty.send_notification_test_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.earned', 'test:owner:one',
       'e1000000-0000-4000-8000-000000000208'
     ) $$,
  '23514', 'notification test command idempotency conflict',
  'changed test replay fails closed'
);
reset role;
select results_eq(
  $$ select template.template_version
     from loyalty_private.notification_smtp_test_deliveries as delivery
     join loyalty_private.notification_email_template_versions as template
       on template.id = delivery.template_id
     where delivery.public_id = pg_temp.test_delivery('test:owner:one') $$,
  array[2],
  'test queue pins the exact active tenant version'
);
select results_eq(
  $$ select template.template_version
     from loyalty_private.notification_smtp_deliveries as delivery
     join loyalty_private.notification_events as event
       on event.id = delivery.notification_event_id
     join loyalty_private.notification_email_template_versions as template
       on template.id = delivery.template_id
     where event.deduplication_key = 'template:event:one' $$,
  array[1],
  'later publication cannot change an already accepted delivery'
);

set local role loyalty_worker;
select results_eq(
  $$ select pg_catalog.count(*)::bigint
     from loyalty_private.claim_smtp_notification_tests_v1(
       'smtp-test-worker', 1, 60
     ) $$,
  array[1::bigint],
  'worker claims one isolated test lease'
);
select results_eq(
  $$ select outcome, attempt_count, recipient_email,
       pg_catalog.left(subject_template, 18), event ->> 'eventType',
       event -> 'payload' ->> 'availableBalance'
     from loyalty_private.authorize_smtp_notification_test_v1(
       pg_temp.test_delivery('test:owner:one'), 'smtp-test-worker'
     ) $$,
  $$ values (
    'authorized'::text, 1, 'notification-owner@example.test'::text,
    '[Starfiniti test] '::text, 'loyalty.points.released'::text, '500'::text
  ) $$,
  'authorization resolves only requester contact and database-owned sample data'
);
select results_eq(
  $$ select state from loyalty_private.finish_smtp_notification_test_v1(
       pg_temp.test_delivery('test:owner:one'), 'smtp-test-worker',
       'manual_review', null, 'smtp_outcome_ambiguous'
     ) $$,
  array['manual_review'::text],
  'ambiguous test outcome stops for manual review'
);
reset role;
select ok(
  not exists (
    select 1
    from loyalty_private.notification_smtp_test_deliveries as delivery
    where delivery.public_id = pg_temp.test_delivery('test:owner:one')
      and pg_catalog.to_jsonb(delivery)::text like
        '%notification-owner@example.test%'
  ),
  'resolved test recipient is not persisted'
);

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select outcome from loyalty.send_notification_test_command(
       'e1000000-0000-4000-8000-000000000110',
       'loyalty.points.earned', 'test:revoked:one',
       'e1000000-0000-4000-8000-000000000209'
     ) $$,
  array['created'::text],
  'live admin can enqueue a test'
);
reset role;
update loyalty.organization_memberships
set revoked_at = pg_catalog.clock_timestamp()
where organization_id = pg_temp.template_org('template-one')
  and user_id = 'e1000000-0000-4000-8000-000000000002'::uuid;
set local role loyalty_worker;
select results_eq(
  $$ select pg_catalog.count(*)::bigint
     from loyalty_private.claim_smtp_notification_tests_v1(
       'smtp-revoked-worker', 1, 60
     ) $$,
  array[1::bigint],
  'revoked requester fixture is leased before live authority recheck'
);
select results_eq(
  $$ select outcome, recipient_email
     from loyalty_private.authorize_smtp_notification_test_v1(
       pg_temp.test_delivery('test:revoked:one'), 'smtp-revoked-worker'
     ) $$,
  $$ values ('dead_letter'::text, null::text) $$,
  'revoked requester receives no recipient disclosure or delivery authority'
);
reset role;
select results_eq(
  $$ select last_error_code
     from loyalty_private.notification_smtp_test_deliveries
     where public_id = pg_temp.test_delivery('test:revoked:one') $$,
  array['requester_not_authorized'::text],
  'revocation retains only one canonical failure code'
);

set local role authenticated;
set local request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select
       notification_workspace ->> 'schemaVersion',
       notification_workspace ->> 'deploymentMode',
       pg_catalog.jsonb_array_length(notification_workspace -> 'templates'),
       pg_catalog.jsonb_array_length(notification_workspace -> 'providers')
     from loyalty.get_notification_workspace_v1(
       'e1000000-0000-4000-8000-000000000110', 50
     ) $$,
  $$ values ('1'::text, 'self_hosted'::text, 6, 3) $$,
  'analyst can inspect one complete strict notification workspace'
);
select results_eq(
  $$ select
       notification_workspace -> 'consent' ->> 'activeCustomers',
       notification_workspace -> 'consent' -> 'loyaltyTransactional'
         ->> 'subscribed',
       notification_workspace -> 'consent' -> 'loyaltyMarketing'
         ->> 'unsubscribed'
     from loyalty.get_notification_workspace_v1(
       'e1000000-0000-4000-8000-000000000110', 50
     ) $$,
  $$ values ('1'::text, '1'::text, '1'::text) $$,
  'consent summary applies safe transactional and marketing defaults'
);
select results_eq(
  $$ select pg_catalog.count(*)::bigint
     from pg_catalog.jsonb_array_elements((
       select notification_workspace -> 'templates'
       from loyalty.get_notification_workspace_v1(
         'e1000000-0000-4000-8000-000000000110', 50
       )
     )) as template(value)
     where template.value ->> 'source' = 'organization'
       and template.value ->> 'eventType' = 'loyalty.points.released'
       and template.value ->> 'templateVersion' = '2' $$,
  array[1::bigint],
  'workspace exposes the exact active tenant template version'
);
select ok(
  (select notification_workspace::text
     not like '%notification-owner@example.test%'
     and notification_workspace::text not like '%locked_by%'
     and notification_workspace::text not like '%destination%'
     and notification_workspace::text not like '%credential%'
   from loyalty.get_notification_workspace_v1(
     'e1000000-0000-4000-8000-000000000110', 50
   )),
  'workspace excludes contact worker destination and credential material'
);
select results_eq(
  $$ select pg_catalog.count(*)::bigint
     from pg_catalog.jsonb_array_elements((
       select notification_workspace -> 'issues'
       from loyalty.get_notification_workspace_v1(
         'e1000000-0000-4000-8000-000000000110', 50
       )
     )) as issue(value)
     where issue.value ->> 'kind' = 'test'
       and issue.value ->> 'state' in ('manual_review', 'dead_letter') $$,
  array[2::bigint],
  'workspace exposes bounded canonical test issues without diagnostic bodies'
);
select throws_ok(
  $$ select * from loyalty.get_notification_workspace_v1(
       'e2000000-0000-4000-8000-000000000110', 50
     ) $$,
  '42501', 'notification workspace not authorized',
  'cross-tenant notification workspace read fails closed'
);
reset role;

select results_eq(
  $$ select transaction_count from template_ledger_before $$,
  $$ select pg_catalog.count(*)::bigint from loyalty.ledger_transactions $$,
  'template publication tests and health reads do not change loyalty value'
);
select results_eq(
  $$ select pg_catalog.count(*)::bigint
     from loyalty_private.notification_smtp_test_deliveries
     where organization_id = pg_temp.template_org('template-one')
       and idempotency_key = 'test:owner:one' $$,
  array[1::bigint],
  'test idempotency produces exactly one queue row'
);
select results_eq(
  $$ select pg_catalog.count(*)::bigint
     from loyalty_private.notification_smtp_test_delivery_attempts
     where organization_id = pg_temp.template_org('template-one') $$,
  array[2::bigint],
  'manual review and revocation each retain one append-only test attempt'
);

select * from finish();
rollback;
