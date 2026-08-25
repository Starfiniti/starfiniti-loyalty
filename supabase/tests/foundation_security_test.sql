begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_schema('loyalty', 'loyalty application schema exists');
select has_schema('loyalty_private', 'private database schema exists');

select ok(
  not exists (
    select 1
    from pg_namespace as namespace
    cross join lateral aclexplode(
      coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) as grant_entry
    where namespace.nspname = 'loyalty'
      and grant_entry.grantee = 0
      and grant_entry.privilege_type = 'USAGE'
  ),
  'PUBLIC cannot use the loyalty schema before explicit Data API exposure'
);

select ok(
  has_schema_privilege('anon', 'loyalty', 'USAGE'),
  'anonymous clients can resolve only explicitly granted loyalty functions'
);

select ok(
  has_schema_privilege('authenticated', 'loyalty', 'USAGE'),
  'authenticated clients can use the loyalty schema after policies exist'
);

select ok(
  not exists (
    select 1
    from pg_namespace as namespace
    cross join lateral aclexplode(
      coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) as grant_entry
    where namespace.nspname = 'loyalty_private'
      and grant_entry.grantee = 0
      and grant_entry.privilege_type = 'USAGE'
  ),
  'PUBLIC cannot use the private schema'
);

select is_empty(
  $$
    select format('%I.%I', namespace.nspname, relation.relname)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'loyalty')
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
      and not exists (
        select 1
        from pg_depend as dependency
        join pg_extension as extension on extension.oid = dependency.refobjid
        where dependency.classid = 'pg_class'::regclass
          and dependency.objid = relation.oid
          and dependency.deptype = 'e'
      )
  $$,
  'every application table in an exposed or candidate schema has RLS enabled'
);

select is_empty(
  $$
    select routine.oid::regprocedure::text
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('public', 'loyalty')
      and routine.prosecdef
      and not (
        namespace.nspname = 'loyalty'
        and routine.oid::regprocedure::text in (
          'loyalty.adjust_customer_points_command(uuid,uuid,uuid,bigint,text,text,timestamp with time zone,text,uuid)',
          'loyalty.approve_campaign_version_command(uuid,text,text,uuid)',
          'loyalty.cancel_campaign_version_command(uuid,text,text,uuid)',
          'loyalty.create_campaign_draft_command(uuid,jsonb,text,uuid)',
          'loyalty.create_programme_command(uuid,text,text,text,uuid)',
          'loyalty.create_programme_draft_command(uuid,jsonb,text,uuid)',
          'loyalty.create_audience_draft_command(uuid,jsonb,text,uuid)',
          'loyalty.create_audience_snapshot_command(uuid,text,uuid)',
          'loyalty.create_my_referral_link(uuid,uuid)',
          'loyalty.get_customer_adjustment_context(uuid,uuid)',
          'loyalty.get_customer_read_model(uuid,uuid)',
          'loyalty.get_customer_tier_progress_v1(uuid,uuid,timestamp with time zone)',
          'loyalty.get_customer_tier_read_model(uuid,uuid)',
          'loyalty.get_campaign_results_v1(uuid,integer)',
          'loyalty.get_my_loyalty_accounts()',
          'loyalty.get_my_loyalty_experiences_v1()',
          'loyalty.get_my_loyalty_experiences_v2()',
          'loyalty.get_my_notification_preferences_v1()',
          'loyalty.get_notification_workspace_v1(uuid,integer)',
          'loyalty.get_my_referral_experiences_v1()',
          'loyalty.get_my_entitlements_v1(uuid,timestamp with time zone)',
          'loyalty.get_my_tier_progress_v1(timestamp with time zone)',
          'loyalty.get_programme_expiry_liability_v2(uuid,timestamp with time zone)',
          'loyalty.get_programme_tier_performance_v1(uuid,timestamp with time zone)',
          'loyalty.get_referral_dashboard_v1(uuid,integer)',
          'loyalty.get_reward_fulfilment_summary(uuid)',
          'loyalty.get_connector_operation_issues(uuid,integer)',
          'loyalty.get_connector_operation_summaries(uuid)',
          'loyalty.get_analytics_value_truth_v1(uuid,uuid,uuid,integer,timestamp with time zone)',
          'loyalty.get_analytics_commerce_performance_v1(uuid,uuid,uuid,integer,timestamp with time zone)',
          'loyalty.get_analytics_programme_outcomes_v1(uuid,uuid,uuid,integer,timestamp with time zone)',
          'loyalty.get_analytics_cohort_retention_v1(uuid,uuid,uuid,integer,text,timestamp with time zone)',
          'loyalty.get_overview_report(uuid,uuid,uuid,integer,timestamp with time zone)',
          'loyalty.list_customer_summaries(uuid,uuid,text)',
          'loyalty.list_referral_review_cases(uuid,text,integer)',
          'loyalty.list_reward_fulfilment_cases(uuid,text,integer)',
          'loyalty.publish_programme_version_command(uuid,text,text,uuid)',
          'loyalty.publish_notification_email_template_command(uuid,text,text,text,text,uuid)',
          'loyalty.publish_audience_version_command(uuid,text,text,uuid)',
          'loyalty.pause_campaign_version_command(uuid,text,text,uuid)',
          'loyalty.preview_bulk_customer_adjustment(uuid[],uuid,uuid,bigint,text,timestamp with time zone)',
          'loyalty.preview_campaign_version_command(uuid,text,text,uuid)',
          'loyalty.redeem_my_reward(uuid,text,uuid)',
          'loyalty.request_connector_reconciliation_command(uuid,text,text,text,uuid)',
          'loyalty.get_public_loyalty_experience(uuid,uuid,text)',
          'loyalty.get_public_loyalty_experience_v2(uuid,uuid)',
          'loyalty.retry_connector_effect_command(uuid,text,text,uuid)',
          'loyalty.retry_referral_reward_job_command(uuid,text,text,uuid)',
          'loyalty.schedule_programme_version_command(uuid,text,timestamp with time zone,text,uuid)',
          'loyalty.set_my_notification_preference_v1(uuid,text,text,text,uuid)',
          'loyalty.send_notification_test_command(uuid,text,text,uuid)',
          'loyalty.set_customer_tier_override_command(uuid,uuid,uuid,text,timestamp with time zone,text,text,uuid)',
          'loyalty.save_experience_translation_command(uuid,uuid,text,text,text,text,text,text,text,text,text,uuid)',
          'loyalty.save_experience_theme_command(uuid,uuid,text,text,integer,text,text,boolean,boolean,text,text,uuid)',
          'loyalty.save_experience_theme_v2_command(uuid,uuid,text,text,integer,text,text,boolean,boolean,text,text,text,boolean,text[],text,uuid)',
          'loyalty.start_reward_fulfilment_command(uuid,text,uuid)',
          'loyalty.resolve_reward_fulfilment_command(uuid,text,text,text,text,uuid)',
          'loyalty.resolve_referral_review_command(uuid,text,text,text,uuid)',
          'loyalty.execute_bulk_customer_adjustment(uuid[],uuid,uuid,bigint,text,timestamp with time zone,text,text,uuid)'
        )
      )
      and not exists (
        select 1
        from pg_depend as dependency
        join pg_extension as extension on extension.oid = dependency.refobjid
        where dependency.classid = 'pg_proc'::regclass
          and dependency.objid = routine.oid
          and dependency.deptype = 'e'
      )
  $$,
  'only reviewed merchant command security-definer functions exist in an exposed schema'
);

select * from finish();
rollback;
