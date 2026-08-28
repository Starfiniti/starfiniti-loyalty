begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('loyalty', 'loyalty_private')
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  ),
  0,
  'every replayed Starfiniti tenant table has RLS enabled'
);

select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.referral_link_requests'::regclass),
  'private referral-link request evidence has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.referral_risk_evidence'::regclass),
  'private referral risk evidence has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'loyalty_private.woocommerce_customer_snapshot_deliveries'::regclass),
  'private WooCommerce snapshot delivery state has RLS enabled'
);

select ok(
  not (select relforcerowsecurity from pg_class
       where oid = 'loyalty_private.referral_link_requests'::regclass),
  'referral-link SECURITY DEFINER owner functions retain deliberate owner bypass'
);
select ok(
  not (select relforcerowsecurity from pg_class
       where oid = 'loyalty_private.referral_risk_evidence'::regclass),
  'referral-risk SECURITY DEFINER owner functions retain deliberate owner bypass'
);
select ok(
  not (select relforcerowsecurity from pg_class
       where oid = 'loyalty_private.woocommerce_customer_snapshot_deliveries'::regclass),
  'snapshot SECURITY DEFINER owner functions retain deliberate owner bypass'
);

select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.referral_link_requests', 'SELECT'
  ),
  'authenticated sessions cannot select private referral-link request evidence'
);
select ok(
  not has_table_privilege(
    'authenticated', 'loyalty_private.referral_risk_evidence', 'SELECT'
  ),
  'authenticated sessions cannot select private referral risk evidence'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'loyalty_private.woocommerce_customer_snapshot_deliveries',
    'SELECT'
  ),
  'authenticated sessions cannot select private snapshot delivery state'
);

select ok(
  not has_table_privilege(
    'loyalty_runtime', 'loyalty_private.referral_link_requests', 'SELECT'
  ),
  'runtime cannot enumerate private referral-link request evidence'
);
select ok(
  not has_table_privilege(
    'loyalty_worker', 'loyalty_private.referral_risk_evidence', 'SELECT'
  ),
  'worker cannot enumerate private referral risk evidence'
);
select ok(
  not has_table_privilege(
    'loyalty_runtime',
    'loyalty_private.woocommerce_customer_snapshot_deliveries',
    'SELECT'
  ),
  'runtime cannot enumerate private snapshot delivery state'
);

select is(
  (
    select count(*)::integer
    from unnest(
      array['anon', 'authenticated', 'loyalty_runtime', 'loyalty_worker']
    ) as roles(role_name),
    unnest(
      array[
        'loyalty_private.referral_link_requests',
        'loyalty_private.referral_risk_evidence',
        'loyalty_private.woocommerce_customer_snapshot_deliveries'
      ]
    ) as tables(table_name),
    unnest(
      array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]
    ) as privileges(privilege_name)
    where has_table_privilege(role_name, table_name, privilege_name)
  ),
  0,
  'application roles retain no effective direct table privilege on the three private coordination tables'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'loyalty_private'
     and tablename = 'referral_link_requests'),
  0,
  'referral-link requests have no direct-role RLS policy'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'loyalty_private'
     and tablename = 'referral_risk_evidence'),
  0,
  'referral risk evidence has no direct-role RLS policy'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'loyalty_private'
     and tablename = 'woocommerce_customer_snapshot_deliveries'),
  0,
  'snapshot delivery state has no direct-role RLS policy'
);

select * from finish();

rollback;
