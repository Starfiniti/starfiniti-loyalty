begin;

create extension if not exists pgtap with schema extensions;

select plan(56);

select has_table('loyalty', 'migration_import_batches',
  'migration application batches retain immutable approval evidence');
select has_table('loyalty', 'migration_import_items',
  'migration application items fence opaque source rows');
select has_table('loyalty', 'migration_import_lots',
  'migration lots trace every imported point to an opening transaction');
select has_table('loyalty', 'migration_correction_batches',
  'migration correction batches append compensating history');
select results_eq(
  $$
    select count(*)::bigint from pg_class
    where oid in (
      'loyalty.migration_import_batches'::regclass,
      'loyalty.migration_import_items'::regclass,
      'loyalty.migration_import_lots'::regclass,
      'loyalty.migration_pending_lot_releases'::regclass,
      'loyalty.migration_correction_batches'::regclass,
      'loyalty.migration_correction_items'::regclass
    ) and relrowsecurity
  $$,
  array[6::bigint],
  'all exposed migration application evidence enables RLS'
);
select ok(
  has_function_privilege(
    'authenticated',
    'loyalty.apply_migration_opening_balance_v1(uuid,text,text,text,uuid,text,uuid)',
    'EXECUTE'
  ),
  'authenticated owners can enter the guarded application boundary'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty.apply_migration_opening_balance_v1(uuid,text,text,text,uuid,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot apply migration value'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.release_due_migration_lots_v1(timestamp with time zone,integer)',
    'EXECUTE'
  ),
  'only the value worker receives the pending-lot release primitive'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty.migration_import_batches', 'INSERT'
  ),
  'browser sessions cannot forge migration application evidence'
);
select results_eq(
  $$
    select count(*)::bigint from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and routine.proname in (
        'apply_migration_opening_balance_v1',
        'release_due_migration_lots_v1',
        'compensate_migration_batch_v1'
      ) and routine.prosecdef
      and exists (
        select 1 from unnest(routine.proconfig) as setting
        where setting = 'search_path=""'
      )
  $$,
  array[3::bigint],
  'all application functions are security definer with empty search paths'
);
select results_eq(
  $$
    select count(*)::bigint from information_schema.parameters
    where specific_schema = 'loyalty'
      and specific_name like 'apply_migration_opening_balance_v1_%'
      and parameter_name in (
        'organization_id', 'actor_user_id', 'customer_id', 'wallet_id',
        'points'
      )
  $$,
  array[0::bigint],
  'the application command accepts no tenant actor customer wallet or points authority'
);
select results_eq(
  $$
    select count(*)::bigint from pg_constraint
    where conrelid = 'loyalty.ledger_transactions'::regclass
      and conname = 'ledger_transactions_transaction_kind_check'
      and pg_get_constraintdef(oid) like '%opening_balance%'
  $$,
  array[1::bigint],
  'the immutable ledger explicitly recognizes opening-balance transactions'
);

insert into auth.users (id, email)
values
  ('83000000-0000-4000-8000-000000000001', 'application-owner@example.test'),
  ('83000000-0000-4000-8000-000000000002', 'application-operator@example.test'),
  ('84000000-0000-4000-8000-000000000001', 'application-other@example.test');

insert into loyalty.organizations (public_id, slug, name)
values
  ('83000000-0000-4000-8000-000000000100', 'application-one', 'Application One'),
  ('84000000-0000-4000-8000-000000000100', 'application-two', 'Application Two');

insert into loyalty.organization_memberships (organization_id, user_id, role)
values
  ((select id from loyalty.organizations where slug = 'application-one'),
    '83000000-0000-4000-8000-000000000001', 'owner'),
  ((select id from loyalty.organizations where slug = 'application-one'),
    '83000000-0000-4000-8000-000000000002', 'operator'),
  ((select id from loyalty.organizations where slug = 'application-two'),
    '84000000-0000-4000-8000-000000000001', 'owner');

insert into loyalty.programme_groups (
  public_id, organization_id, slug, name, status
)
select '83000000-0000-4000-8000-000000000110', id,
  'rewards', 'Application Rewards', 'active'
from loyalty.organizations where slug = 'application-one';

insert into loyalty.programmes (
  public_id, organization_id, programme_group_id, slug, name, status
)
select '83000000-0000-4000-8000-000000000120', organization.id,
  programme_group.id, 'rewards', 'Application Rewards', 'active'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
where organization.slug = 'application-one';

insert into loyalty.programme_versions (
  public_id, organization_id, programme_group_id, programme_id,
  version_number, status, configuration, configuration_sha256,
  approved_by_user_id, published_at
)
select '83000000-0000-4000-8000-000000000130', organization.id,
  programme_group.id, programme.id, 1, 'published',
  '{"version":"1","tiers":[],"rewards":[]}'::jsonb,
  extensions.digest(convert_to('{}', 'UTF8'), 'sha256'),
  '83000000-0000-4000-8000-000000000001', now() - interval '1 day'
from loyalty.organizations as organization
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = organization.id
join loyalty.programmes as programme
  on programme.organization_id = organization.id
where organization.slug = 'application-one';

create temporary table migration_application_fixture (
  name text primary key,
  document_text text not null,
  resolutions_text text not null,
  document_sha text not null,
  resolution_sha text not null,
  dry_run_id uuid,
  approval_sha text,
  batch_id uuid
);
grant select, update on migration_application_fixture to authenticated;

with identity as (
  select encode(extensions.digest(convert_to(
    '{"identity":{"kind":"email","value":"member@example.test"},"schemaVersion":"1"}',
    'UTF8'
  ), 'sha256'), 'hex') as sha
), fixture as (
  select
    '{"expiryPolicy":{"expiresAt":"2027-08-26T08:00:00Z","mode":"apply_default"},"programmeGroupId":"83000000-0000-4000-8000-000000000110","programmeVersionId":"83000000-0000-4000-8000-000000000130","rows":[{"balance":{"availablePoints":"100","lots":[],"pendingPoints":"0"},"identity":{"kind":"email","value":"member@example.test"},"referral":null,"sourceHistory":[],"sourceRowId":"row-1","tier":null}],"schemaVersion":"1","source":{"exportId":"export-1","exportSha256":"' || repeat('a', 64) || '","exportedAt":"2026-08-26T06:00:00Z","system":"generic_csv"}}' as document_text,
    '[{"basis":"explicit_create","identitySha256":"' || identity.sha || '","outcome":"create_new","sourceRowId":"row-1","targetCustomerId":null}]' as resolutions_text
  from identity
)
insert into migration_application_fixture (
  name, document_text, resolutions_text, document_sha, resolution_sha
)
select 'default', document_text, resolutions_text,
  encode(extensions.digest(convert_to(document_text, 'UTF8'), 'sha256'), 'hex'),
  encode(extensions.digest(convert_to(resolutions_text, 'UTF8'), 'sha256'), 'hex')
from fixture;

set local role authenticated;
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000001';

with created as (
  select * from loyalty.record_migration_dry_run_v1(
    '83000000-0000-4000-8000-000000000110',
    '83000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('a', 64),
    (select document_sha from migration_application_fixture where name = 'default'),
    (select resolution_sha from migration_application_fixture where name = 'default'),
    repeat('d', 64), 1, 0, 1, 0, 100, 0, '{}'::jsonb,
    'migration:application:dry-run:1',
    '83000000-0000-4000-8000-000000000201'
  )
)
update migration_application_fixture as fixture
set dry_run_id = created.dry_run_public_id,
  approval_sha = created.approval_sha256
from created where fixture.name = 'default';

with applied as (
  select * from loyalty.apply_migration_opening_balance_v1(
    (select dry_run_id from migration_application_fixture where name = 'default'),
    (select approval_sha from migration_application_fixture where name = 'default'),
    (select document_text from migration_application_fixture where name = 'default'),
    (select resolutions_text from migration_application_fixture where name = 'default'),
    null, 'migration:application:1',
    '83000000-0000-4000-8000-000000000202'
  )
)
update migration_application_fixture as fixture
set batch_id = applied.batch_public_id
from applied where fixture.name = 'default';

select results_eq(
  $$ select customer_count || ':' || created_customer_count || ':' || available_points || ':' || pending_points
     from loyalty.migration_import_batches $$,
  array['1:1:100:0'::text],
  'application persists exact receipt-bound counts and totals'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customers $$,
  array[1::bigint],
  'explicit create produces one tenant-derived customer'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.wallets $$,
  array[1::bigint],
  'application derives one programme wallet'
);
select results_eq(
  $$ select transaction_kind from loyalty.ledger_transactions $$,
  array['opening_balance'::text],
  'application posts an explicit immutable opening-balance transaction'
);
select results_eq(
  $$ select sum(points)::bigint from loyalty.ledger_entries $$,
  array[0::bigint],
  'opening-balance ledger entries are exactly zero sum'
);
select results_eq(
  $$ select account_kind || ':' || points from loyalty.wallet_balances where points <> 0 $$,
  array['available:100'::text],
  'the imported available balance projects exactly once'
);
select results_eq(
  $$ select initial_points || ':' || remaining_points || ':' || expires_at::date
     from loyalty.point_lots join loyalty.point_lot_balances on lot_id = point_lots.id $$,
  array['100:100:2027-08-26'::text],
  'default-expiry import creates one exact FIFO lot'
);
select results_eq(
  $$ select source_row_ref || ':' || source_lot_ref
     from loyalty.migration_import_items
     join loyalty.migration_import_lots on item_id = migration_import_items.id $$,
  array['row-1:default'::text],
  'every imported point traces to an opaque source row and lot'
);
select is_empty(
  $$
    select id from loyalty.migration_import_batches
    where row_to_json(migration_import_batches)::text like '%member@example.test%'
    union all
    select id from loyalty.migration_import_items
    where row_to_json(migration_import_items)::text like '%member@example.test%'
  $$,
  'raw source email is not retained in import evidence'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action = 'migration.opening_balance.apply' $$,
  array[1::bigint],
  'opening-balance application is attributable in immutable audit'
);
select results_eq(
  $$ select outcome from loyalty.apply_migration_opening_balance_v1(
    (select dry_run_id from migration_application_fixture where name = 'default'),
    (select approval_sha from migration_application_fixture where name = 'default'),
    (select document_text from migration_application_fixture where name = 'default'),
    (select resolutions_text from migration_application_fixture where name = 'default'),
    null, 'migration:application:1',
    '83000000-0000-4000-8000-000000000203'
  ) $$,
  array['duplicate'::text],
  'exact application retry returns the original batch'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[1::bigint],
  'application retry creates no second value effect'
);
select throws_ok(
  $$ select * from loyalty.apply_migration_opening_balance_v1(
    (select dry_run_id from migration_application_fixture where name = 'default'),
    repeat('f', 64),
    (select document_text from migration_application_fixture where name = 'default'),
    (select resolutions_text from migration_application_fixture where name = 'default'),
    null, 'migration:application:stale',
    '83000000-0000-4000-8000-000000000204'
  ) $$,
  '23514', 'migration application approval is stale',
  'changed approval evidence fails before another value effect'
);

select results_eq(
  $$ select outcome from loyalty.compensate_migration_batch_v1(
    (select batch_id from migration_application_fixture where name = 'default'),
    'Rollback approved migration canary', 'migration:correction:1',
    '83000000-0000-4000-8000-000000000205'
  ) $$,
  array['created'::text],
  'owner appends an approved compensating correction batch'
);
select results_eq(
  $$ select account_kind || ':' || points from loyalty.wallet_balances where points <> 0 $$,
  array[]::text[],
  'correction removes the imported available value without rewriting history'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[2::bigint],
  'correction appends a second transaction and preserves the opening transaction'
);
select results_eq(
  $$ select corrected_points from loyalty.migration_correction_batches $$,
  array[100::bigint],
  'correction evidence reconciles to the original imported points'
);
select results_eq(
  $$ select outcome from loyalty.compensate_migration_batch_v1(
    (select batch_id from migration_application_fixture where name = 'default'),
    'Rollback approved migration canary', 'migration:correction:1',
    '83000000-0000-4000-8000-000000000206'
  ) $$,
  array['duplicate'::text],
  'exact correction retry is idempotent'
);

reset role;

with identity as (
  select encode(extensions.digest(convert_to(
    '{"identity":{"kind":"email","value":"pending@example.test"},"schemaVersion":"1"}',
    'UTF8'
  ), 'sha256'), 'hex') as sha
), fixture as (
  select
    '{"expiryPolicy":{"mode":"preserve_exact"},"programmeGroupId":"83000000-0000-4000-8000-000000000110","programmeVersionId":"83000000-0000-4000-8000-000000000130","rows":[{"balance":{"availablePoints":"60","lots":[{"availableAt":"2026-08-26T06:00:00Z","bucket":"available","expiresAt":"2027-08-27T08:00:00Z","points":"60","sourceLotId":"available-1"},{"availableAt":"2026-08-27T08:00:00Z","bucket":"pending","expiresAt":"2027-08-27T08:00:00Z","points":"40","sourceLotId":"pending-1"}],"pendingPoints":"40"},"identity":{"kind":"email","value":"pending@example.test"},"referral":null,"sourceHistory":[],"sourceRowId":"row-pending","tier":null}],"schemaVersion":"1","source":{"exportId":"export-pending","exportSha256":"' || repeat('b', 64) || '","exportedAt":"2026-08-26T06:00:00Z","system":"generic_csv"}}' as document_text,
    '[{"basis":"explicit_create","identitySha256":"' || identity.sha || '","outcome":"create_new","sourceRowId":"row-pending","targetCustomerId":null}]' as resolutions_text
  from identity
)
insert into migration_application_fixture (
  name, document_text, resolutions_text, document_sha, resolution_sha
)
select 'pending', document_text, resolutions_text,
  encode(extensions.digest(convert_to(document_text, 'UTF8'), 'sha256'), 'hex'),
  encode(extensions.digest(convert_to(resolutions_text, 'UTF8'), 'sha256'), 'hex')
from fixture;

set local role authenticated;
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000001';

with created as (
  select * from loyalty.record_migration_dry_run_v1(
    '83000000-0000-4000-8000-000000000110',
    '83000000-0000-4000-8000-000000000130',
    'valid', 'generic_csv', repeat('b', 64),
    (select document_sha from migration_application_fixture where name = 'pending'),
    (select resolution_sha from migration_application_fixture where name = 'pending'),
    repeat('e', 64), 1, 0, 1, 0, 60, 40, '{}'::jsonb,
    'migration:pending:dry-run:1',
    '83000000-0000-4000-8000-000000000211'
  )
)
update migration_application_fixture as fixture
set dry_run_id = created.dry_run_public_id,
  approval_sha = created.approval_sha256
from created where fixture.name = 'pending';

with applied as (
  select * from loyalty.apply_migration_opening_balance_v1(
    (select dry_run_id from migration_application_fixture where name = 'pending'),
    (select approval_sha from migration_application_fixture where name = 'pending'),
    (select document_text from migration_application_fixture where name = 'pending'),
    (select resolutions_text from migration_application_fixture where name = 'pending'),
    null, 'migration:pending:application:1',
    '83000000-0000-4000-8000-000000000212'
  )
)
update migration_application_fixture as fixture
set batch_id = applied.batch_public_id
from applied where fixture.name = 'pending';

select results_eq(
  $$ select available_points || ':' || pending_points
     from loyalty.migration_import_batches
     where public_id = (
       select batch_id from migration_application_fixture where name = 'pending'
     ) $$,
  array['60:40'::text],
  'preserve-exact application persists separate available and pending totals'
);
select results_eq(
  $$ select account_kind || ':' || points
     from loyalty.migration_import_items as item
     join loyalty.wallet_balances as balance
       on balance.organization_id = item.organization_id
      and balance.wallet_id = item.wallet_id
     where item.source_row_ref = 'row-pending' and balance.points <> 0
     order by account_kind $$,
  array['available:60'::text, 'pending:40'::text],
  'pending source value remains pending before its exact availability time'
);

reset role;
set local role loyalty_worker;

select results_eq(
  $$ select released_lots || ':' || released_points
     from loyalty_private.release_due_migration_lots_v1(
       '2026-08-27T07:59:59Z'::timestamptz, 10
     ) $$,
  array['0:0'::text],
  'pending import lot cannot release before its source availability time'
);
select results_eq(
  $$ select released_lots || ':' || released_points
     from loyalty_private.release_due_migration_lots_v1(
       '2026-08-27T08:00:00Z'::timestamptz, 10
     ) $$,
  array['1:40'::text],
  'pending import lot releases once at its exact source availability time'
);
select results_eq(
  $$ select released_lots || ':' || released_points
     from loyalty_private.release_due_migration_lots_v1(
       '2026-08-28T08:00:00Z'::timestamptz, 10
     ) $$,
  array['0:0'::text],
  'pending import release retry creates no second value effect'
);

reset role;

select results_eq(
  $$ select (released_at = '2026-08-27T08:00:00Z'::timestamptz)::text ||
       ':' || points
     from loyalty.migration_pending_lot_releases as release
     join loyalty.migration_import_lots as import_lot
       on import_lot.organization_id = release.organization_id
      and import_lot.id = release.import_lot_id $$,
  array['true:40'::text],
  'pending release evidence retains the exact source timestamp and points'
);
select results_eq(
  $$ select account_kind || ':' || points
     from loyalty.migration_import_items as item
     join loyalty.wallet_balances as balance
       on balance.organization_id = item.organization_id
      and balance.wallet_id = item.wallet_id
     where item.source_row_ref = 'row-pending' and balance.points <> 0 $$,
  array['available:100'::text],
  'released pending value moves atomically into the available account'
);
select results_eq(
  $$ select initial_points || ':' || remaining_points || ':' ||
       (available_at = '2026-08-27T08:00:00Z'::timestamptz)::text || ':' ||
       (expires_at = '2027-08-27T08:00:00Z'::timestamptz)::text
     from loyalty.migration_pending_lot_releases as release
     join loyalty.point_lots as lot
       on lot.organization_id = release.organization_id
      and lot.id = release.point_lot_id
     join loyalty.point_lot_balances as balance on balance.lot_id = lot.id $$,
  array['40:40:true:true'::text],
  'released pending value becomes an exact expiring FIFO lot'
);

set local role authenticated;
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select outcome from loyalty.compensate_migration_batch_v1(
    (select batch_id from migration_application_fixture where name = 'pending'),
    'Rollback released pending migration canary',
    'migration:pending:correction:1',
    '83000000-0000-4000-8000-000000000213'
  ) $$,
  array['created'::text],
  'released pending import can be corrected without rewriting its history'
);
select results_eq(
  $$ select corrected_pending_points || ':' || corrected_available_points
     from loyalty.migration_correction_items as correction
     join loyalty.migration_import_items as item
       on item.organization_id = correction.organization_id
      and item.id = correction.original_item_id
     where item.source_row_ref = 'row-pending' $$,
  array['0:100'::text],
  'correction classifies released pending points as available value'
);
select results_eq(
  $$ select count(*)::bigint
     from loyalty.migration_import_items as item
     join loyalty.wallet_balances as balance
       on balance.organization_id = item.organization_id
      and balance.wallet_id = item.wallet_id
     where item.source_row_ref = 'row-pending' and balance.points <> 0 $$,
  array[0::bigint],
  'pending import correction removes all projected value exactly once'
);

reset role;

select throws_ok(
  $$ update loyalty.migration_import_items set source_row_ref = 'changed' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'source-row application evidence cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty.migration_import_batches $$,
  '55000', 'immutable loyalty history cannot be changed',
  'migration batches cannot be deleted'
);

set local role authenticated;
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select * from loyalty.apply_migration_opening_balance_v1(
    (select dry_run_id from migration_application_fixture where name = 'default'),
    (select approval_sha from migration_application_fixture where name = 'default'),
    (select document_text from migration_application_fixture where name = 'default'),
    (select resolutions_text from migration_application_fixture where name = 'default'),
    null, 'migration:application:operator',
    '83000000-0000-4000-8000-000000000207'
  ) $$,
  '42501', 'migration application not authorized',
  'operator cannot enter the migration value boundary'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_import_batches $$,
  array[0::bigint],
  'operator receives no direct migration application projection'
);

set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select * from loyalty.apply_migration_opening_balance_v1(
    (select dry_run_id from migration_application_fixture where name = 'default'),
    (select approval_sha from migration_application_fixture where name = 'default'),
    (select document_text from migration_application_fixture where name = 'default'),
    (select resolutions_text from migration_application_fixture where name = 'default'),
    null, 'migration:application:cross-tenant',
    '83000000-0000-4000-8000-000000000208'
  ) $$,
  '42501', 'migration application not authorized',
  'another tenant owner cannot apply the first tenant receipt'
);

reset role;

select results_eq(
  $$ select count(*)::bigint from loyalty.migration_import_batches $$,
  array[2::bigint],
  'adversarial attempts leave only the two explained application batches'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_import_items $$,
  array[2::bigint],
  'adversarial attempts leave only the two explained source-row fences'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_correction_batches $$,
  array[2::bigint],
  'both application batches retain an explained correction batch'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.admin_audit_events
     where action in (
       'migration.opening_balance.apply', 'migration.batch.compensate'
     ) $$,
  array[4::bigint],
  'both applications and both corrections retain actor and correlation audit evidence'
);
select is_empty(
  $$ select id from loyalty.admin_audit_events
     where action like 'migration.%'
       and metadata::text like '%member@example.test%' $$,
  'migration audit metadata never persists the raw source email'
);
select results_eq(
  $$
    select count(*)::bigint from loyalty.ledger_transactions as transaction
    where not exists (
      select 1 from loyalty.ledger_entries as entry
      where entry.organization_id = transaction.organization_id
        and entry.transaction_id = transaction.id
      group by entry.transaction_id having sum(entry.points) = 0
    )
  $$,
  array[0::bigint],
  'every opening and correction transaction remains balanced'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.wallet_projection_differences(null) $$,
  array[0::bigint],
  'wallet projections rebuild exactly after application and correction'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_import_lots
     where opening_transaction_id is null or opening_credit_entry_id is null $$,
  array[0::bigint],
  'no imported lot lacks its immutable ledger attribution'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_import_items
     where available_points + pending_points <> (
       select coalesce(sum(points), 0) from loyalty.migration_import_lots
       where item_id = migration_import_items.id
     ) $$,
  array[0::bigint],
  'every source-row total reconciles exactly to stored import lots'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.migration_correction_items
     where corrected_pending_points + corrected_available_points = 0 $$,
  array[0::bigint],
  'every correction item explains non-zero compensating value'
);

select * from finish();
rollback;
