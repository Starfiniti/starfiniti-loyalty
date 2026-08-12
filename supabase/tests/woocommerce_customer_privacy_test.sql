begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

select has_table(
  'loyalty_private', 'customer_privacy_cases',
  'private immutable customer privacy cases exist'
);
select has_function(
  'loyalty_private', 'apply_woocommerce_customer_erasure',
  array['bigint', 'bigint', 'uuid', 'text', 'text'],
  'the worker customer-erasure command exists'
);
select ok(
  has_function_privilege(
    'loyalty_worker',
    'loyalty_private.apply_woocommerce_customer_erasure(bigint,bigint,uuid,text,text)',
    'EXECUTE'
  ),
  'the worker can apply a verified customer erasure'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'loyalty_private.apply_woocommerce_customer_erasure(bigint,bigint,uuid,text,text)',
    'EXECUTE'
  ),
  'browser sessions cannot apply customer erasure'
);
select ok(
  not has_function_privilege(
    'anon',
    'loyalty_private.apply_woocommerce_customer_erasure(bigint,bigint,uuid,text,text)',
    'EXECUTE'
  ),
  'anonymous sessions cannot apply customer erasure'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.customer_privacy_cases', 'SELECT'
  ),
  'the worker cannot enumerate privacy cases outside the command'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.customer_privacy_cases', 'SELECT'
  ),
  'tenant members cannot enumerate private subject fingerprints'
);
select ok(
  (
    select relation.relrowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'loyalty_private'
      and relation.relname = 'customer_privacy_cases'
  ),
  'privacy cases have RLS enabled in addition to absent direct grants'
);
select results_eq(
  $$
    select role.rolname
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    join pg_roles as role on role.oid = relation.relowner
    where namespace.nspname = 'loyalty_private'
      and relation.relname = 'customer_privacy_cases'
  $$,
  array['loyalty_owner'::name],
  'privacy cases use the no-login application owner'
);
select is(
  (
    select coalesce(array_to_string(routine.proconfig, ','), '')::text
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'loyalty_private'
      and routine.oid::regprocedure::text =
        'loyalty_private.apply_woocommerce_customer_erasure(bigint,bigint,uuid,text,text)'
  ),
  'search_path=""'::text,
  'the privileged erasure command uses an empty search path'
);

insert into auth.users (id, email)
values ('9d000000-0000-4000-8000-000000000001', 'privacy@example.test');
insert into loyalty.organizations (slug, name)
values ('privacy-one', 'Privacy One'), ('privacy-two', 'Privacy Two');
insert into loyalty.workspaces (organization_id, slug, name)
select id, 'store', name || ' Store'
from loyalty.organizations where slug in ('privacy-one', 'privacy-two');
insert into loyalty.commerce_connections (
  public_id, organization_id, workspace_id, external_store_id,
  display_name, current_key_version, signing_material_ref
)
select
  case organization.slug
    when 'privacy-one' then '9d000000-0000-4000-8000-000000000101'::uuid
    else '9e000000-0000-4000-8000-000000000101'::uuid
  end,
  organization.id, workspace.id, organization.slug || '-store',
  organization.name || ' Store', 'v1', 'vault://' || organization.slug
from loyalty.organizations as organization
join loyalty.workspaces as workspace on workspace.organization_id = organization.id
where organization.slug in ('privacy-one', 'privacy-two');
insert into loyalty.programme_groups (organization_id, slug, name)
select id, 'rewards', 'Rewards'
from loyalty.organizations where slug = 'privacy-one';

select * from loyalty_private.resolve_commerce_customer(
  (select id from loyalty.organizations where slug = 'privacy-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'privacy-one-store'),
  'registered', '7'
);
insert into loyalty.wallets (organization_id, programme_group_id, customer_id)
select customer.organization_id, programme_group.id, customer.id
from loyalty.customers as customer
join loyalty.customer_identities as identity
  on identity.organization_id = customer.organization_id
 and identity.customer_id = customer.id
join loyalty.programme_groups as programme_group
  on programme_group.organization_id = customer.organization_id
where identity.external_customer_id = 'registered:7';
select * from loyalty_private.claim_woocommerce_customer_identity(
  '9d000000-0000-4000-8000-000000000101', '7',
  '9d000000-0000-4000-8000-000000000001', 'v1', now(),
  extensions.digest('privacy-nonce', 'sha256'),
  extensions.digest('privacy-proof', 'sha256')
);

create temporary table privacy_receipts (
  event_number integer primary key,
  receipt_id uuid not null
);
insert into privacy_receipts
select 1, accepted.receipt_id
from loyalty_private.accept_commerce_delivery(
  (select id from loyalty.organizations where slug = 'privacy-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'privacy-one-store'),
  'privacy-delivery-1', '1', 'privacy-erasure:opaque-one',
  'commerce.customer.deleted', 'customer-erasure', null, now(), now(),
  'v1', 'privacy-nonce-1', repeat('a', 64),
  '{"version":"1","eventType":"commerce.customer.deleted","payload":{"kind":"customer_deleted","externalCustomerId":"7"}}'::jsonb
) as accepted;
select * from loyalty_private.normalize_commerce_delivery(
  (select receipt_id from privacy_receipts where event_number = 1), 'v1'
);
create temporary table first_privacy_claim as
select * from loyalty_private.claim_woocommerce_effects('privacy-worker', 10, 60);
select results_eq(
  $$ select event_type from first_privacy_claim $$,
  array['commerce.customer.deleted'::text],
  'the effect worker claims customer deletion events'
);
select results_eq(
  $$ select source_object_id from first_privacy_claim $$,
  array['customer-erasure'::text],
  'the connector source object contains no raw customer identifier'
);

create temporary table first_erasure as
select * from loyalty_private.apply_woocommerce_customer_erasure(
  (select organization_id from first_privacy_claim),
  (select connection_id from first_privacy_claim),
  (select canonical_event_public_id from first_privacy_claim),
  'privacy-worker', '7'
);
select results_eq(
  $$ select outcome from first_erasure $$,
  array['pseudonymized'::text],
  'a known registered identity is pseudonymized'
);
select ok(
  (select privacy_case_public_id is not null and customer_public_id is not null from first_erasure),
  'the erasure returns opaque case and retained customer references'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.customer_privacy_cases $$,
  array[1::bigint],
  'one erasure creates one privacy tombstone'
);
select is_empty(
  $$ select id from loyalty_private.customer_privacy_cases
     where octet_length(subject_fingerprint) <> 32 $$,
  'privacy cases contain a fixed one-way subject fingerprint'
);
select is_empty(
  $$ select column_name from information_schema.columns
     where table_schema = 'loyalty_private'
       and table_name = 'customer_privacy_cases'
       and column_name in ('external_customer_id', 'email', 'phone', 'name') $$,
  'privacy cases have no raw customer or contact columns'
);
select is_empty(
  $$ select id from loyalty.customer_identities
     where external_customer_id = 'registered:7' $$,
  'the raw registered channel identity is removed'
);
select results_eq(
  $$ select (external_customer_id ~ '^erased:[0-9a-f-]{36}$')::text
     from loyalty.customer_identities $$,
  array['true'::text],
  'the retained channel row uses only an opaque erasure reference'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_user_links
     where revoked_at is null $$,
  array[0::bigint],
  'hosted customer access is revoked'
);
select results_eq(
  $$ select status || ':' || coalesce(display_reference, 'null')
     from loyalty.customers $$,
  array['pseudonymized:null'::text],
  'the customer is pseudonymized without deleting its authority row'
);
select results_eq(
  $$ select status from loyalty.wallets $$,
  array['active'::text],
  'erasure does not silently discard or rewrite wallet value'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_transactions $$,
  array[0::bigint],
  'erasure creates no unexplained ledger transaction'
);
select results_eq(
  $$ select (source_object_id like 'privacy-case:%'
             and payload ? 'privacyCaseId'
             and not payload ? 'externalCustomerId')::text
     from loyalty_private.canonical_commerce_events
     where public_id = (select canonical_event_public_id from first_privacy_claim) $$,
  array['true'::text],
  'canonical event evidence is scrubbed to the opaque privacy case'
);
select results_eq(
  $$ select (raw_body ? 'privacyCaseId'
             and not raw_body::text like '%externalCustomerId%')::text
     from loyalty_private.commerce_delivery_inbox
     where receipt_id = (select receipt_id from privacy_receipts where event_number = 1) $$,
  array['true'::text],
  'the verified raw delivery body is scrubbed after application'
);
select results_eq(
  format(
    'select outcome from loyalty_private.finish_commerce_effect(%L,%L,%L,%L,%L,%L,null,0)',
    (select canonical_event_public_id from first_privacy_claim),
    'privacy-worker', 'applied', 'privacy.customer.erasure',
    'privacy-case:' || (select privacy_case_public_id from first_erasure),
    'privacy-case:' || (select privacy_case_public_id from first_erasure)
  ),
  array['applied'::text],
  'the privacy effect reaches an applied terminal state'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.commerce_business_effects
     where effect_kind = 'privacy.customer.erasure' $$,
  array[1::bigint],
  'the application records one independent privacy effect fence'
);
select results_eq(
  $$ select outcome from loyalty_private.resolve_commerce_customer(
       (select id from loyalty.organizations where slug = 'privacy-one'),
       (select id from loyalty.commerce_connections where external_store_id = 'privacy-one-store'),
       'registered', '7') $$,
  array['suppressed'::text],
  'a deleted source identity cannot be silently re-imported'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customers $$,
  array[1::bigint],
  'suppressed resolution creates no replacement customer'
);
select throws_ok(
  $$ update loyalty_private.customer_privacy_cases set outcome = 'suppressed_no_identity' $$,
  '55000', 'immutable loyalty history cannot be changed',
  'privacy case history cannot be rewritten'
);
select throws_ok(
  $$ delete from loyalty_private.customer_privacy_cases $$,
  '55000', 'immutable loyalty history cannot be changed',
  'privacy case history cannot be deleted'
);

insert into privacy_receipts
select 2, accepted.receipt_id
from loyalty_private.accept_commerce_delivery(
  (select id from loyalty.organizations where slug = 'privacy-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'privacy-one-store'),
  'privacy-delivery-2', '1', 'privacy-erasure:opaque-two',
  'commerce.customer.deleted', 'customer-erasure', null, now(), now(),
  'v1', 'privacy-nonce-2', repeat('b', 64),
  '{"version":"1","eventType":"commerce.customer.deleted","payload":{"kind":"customer_deleted","externalCustomerId":"7"}}'::jsonb
) as accepted;
select * from loyalty_private.normalize_commerce_delivery(
  (select receipt_id from privacy_receipts where event_number = 2), 'v1'
);
create temporary table second_privacy_claim as
select * from loyalty_private.claim_woocommerce_effects('privacy-worker', 10, 60);
create temporary table second_erasure as
select * from loyalty_private.apply_woocommerce_customer_erasure(
  (select organization_id from second_privacy_claim),
  (select connection_id from second_privacy_claim),
  (select canonical_event_public_id from second_privacy_claim),
  'privacy-worker', '7'
);
select results_eq(
  $$ select outcome from second_erasure $$,
  array['duplicate'::text],
  'a later deletion event for the same subject is idempotent'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.customer_privacy_cases $$,
  array[1::bigint],
  'a repeated deletion event does not duplicate the tombstone'
);
select results_eq(
  $$ select (payload ? 'privacyCaseId' and not payload ? 'externalCustomerId')::text
     from loyalty_private.canonical_commerce_events
     where public_id = (select canonical_event_public_id from second_privacy_claim) $$,
  array['true'::text],
  'a duplicate deletion event is also scrubbed'
);
select * from loyalty_private.finish_commerce_effect(
  (select canonical_event_public_id from second_privacy_claim),
  'privacy-worker', 'applied', 'privacy.customer.erasure',
  'privacy-case:' || (select privacy_case_public_id from second_erasure),
  'privacy-case:' || (select privacy_case_public_id from second_erasure), null, 0
);

insert into privacy_receipts
select 3, accepted.receipt_id
from loyalty_private.accept_commerce_delivery(
  (select id from loyalty.organizations where slug = 'privacy-one'),
  (select id from loyalty.commerce_connections where external_store_id = 'privacy-one-store'),
  'privacy-delivery-3', '1', 'privacy-erasure:opaque-three',
  'commerce.customer.deleted', 'customer-erasure', null, now(), now(),
  'v1', 'privacy-nonce-3', repeat('c', 64),
  '{"version":"1","eventType":"commerce.customer.deleted","payload":{"kind":"customer_deleted","externalCustomerId":"999"}}'::jsonb
) as accepted;
select * from loyalty_private.normalize_commerce_delivery(
  (select receipt_id from privacy_receipts where event_number = 3), 'v1'
);
create temporary table missing_privacy_claim as
select * from loyalty_private.claim_woocommerce_effects('privacy-worker', 10, 60);
create temporary table missing_erasure as
select * from loyalty_private.apply_woocommerce_customer_erasure(
  (select organization_id from missing_privacy_claim),
  (select connection_id from missing_privacy_claim),
  (select canonical_event_public_id from missing_privacy_claim),
  'privacy-worker', '999'
);
select results_eq(
  $$ select outcome from missing_erasure $$,
  array['suppressed_no_identity'::text],
  'an erasure arriving before identity import creates a suppression tombstone'
);
select results_eq(
  $$ select (customer_id is null)::text from loyalty_private.customer_privacy_cases
     where outcome = 'suppressed_no_identity' $$,
  array['true'::text],
  'a pre-import suppression invents no customer reference'
);
select results_eq(
  $$ select outcome from loyalty_private.resolve_commerce_customer(
       (select id from loyalty.organizations where slug = 'privacy-one'),
       (select id from loyalty.commerce_connections where external_store_id = 'privacy-one-store'),
       'registered', '999') $$,
  array['suppressed'::text],
  'a pre-import deletion suppresses later identity resolution'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customers $$,
  array[1::bigint],
  'pre-import suppression leaves customer cardinality unchanged'
);

select throws_ok(
  $$ select * from loyalty_private.apply_woocommerce_customer_erasure(
       (select id from loyalty.organizations where slug = 'privacy-two'),
       (select id from loyalty.commerce_connections where external_store_id = 'privacy-two-store'),
       (select canonical_event_public_id from missing_privacy_claim),
       'privacy-worker', '999') $$,
  '22023', 'invalid customer erasure event',
  'another tenant cannot apply a claimed privacy event'
);
select throws_ok(
  $$ select * from loyalty_private.apply_woocommerce_customer_erasure(
       (select organization_id from missing_privacy_claim),
       (select connection_id from missing_privacy_claim),
       (select canonical_event_public_id from missing_privacy_claim),
       'other-worker', '999') $$,
  '22023', 'invalid customer erasure event',
  'a worker without the lease cannot apply the privacy event'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.ledger_entries $$,
  array[0::bigint],
  'all privacy paths leave immutable ledger history untouched'
);
select results_eq(
  $$ select count(*)::bigint from loyalty.customer_user_links $$,
  array[1::bigint],
  'revocation retains the original hosted-link history'
);
select results_eq(
  $$ select count(*)::bigint from loyalty_private.customer_privacy_cases
     where subject_fingerprint = extensions.digest(
       connection_id::text || ':registered:7', 'sha256'
     ) $$,
  array[1::bigint],
  'the tombstone fingerprint is connection-bound and deterministic'
);

select * from finish();
rollback;
