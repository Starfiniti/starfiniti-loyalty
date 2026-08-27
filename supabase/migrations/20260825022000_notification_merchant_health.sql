-- M08-S05 minimized merchant notification workspace. This read projection
-- deliberately excludes contact, customer identity, payloads, rendered bodies,
-- destinations, secrets, fingerprints, worker references, and raw responses.

create or replace function loyalty.get_notification_workspace_v1(
  target_workspace_public_id uuid,
  target_issue_limit integer default 50
)
returns table (notification_workspace jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := loyalty_private.request_user_id();
  target_workspace loyalty.workspaces%rowtype;
  entitlement record;
  generated_at timestamptz := pg_catalog.statement_timestamp();
  template_catalogue jsonb;
  consent_summary jsonb;
  provider_health jsonb;
  recent_issues jsonb;
  smtp_enabled boolean;
  klaviyo_enabled boolean;
  webhook_enabled boolean;
begin
  if actor_user_id is null or target_workspace_public_id is null
    or target_issue_limit not between 1 and 100 then
    raise exception using errcode = '22023',
      message = 'invalid notification workspace request';
  end if;
  select workspace.* into target_workspace
  from loyalty.workspaces as workspace
  where workspace.public_id = target_workspace_public_id
    and workspace.status = 'active'
    and loyalty_private.has_organization_role(
      workspace.organization_id,
      array['owner', 'admin', 'operator', 'analyst', 'auditor']::text[]
    );
  if not found then
    raise exception using errcode = '42501',
      message = 'notification workspace not authorized';
  end if;
  select decision.* into strict entitlement
  from loyalty_private.resolve_organization_entitlement(
    target_workspace.organization_id, 'notifications',
    'workspace:' || target_workspace.public_id::text, generated_at
  ) as decision;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'schemaVersion', '1',
        'templateId', selected_template.public_id,
        'templateCode', selected_template.template_code,
        'eventType', selected_template.event_type,
        'locale', selected_template.locale,
        'source', case when selected_template.organization_id is null
          then 'system' else 'organization' end,
        'templateVersion', selected_template.template_version,
        'templateSha256', pg_catalog.encode(
          selected_template.template_sha256, 'hex'
        ),
        'subjectTemplate', selected_template.subject_template,
        'textTemplate', selected_template.text_template,
        'htmlTemplate', selected_template.html_template,
        'allowedTokens', pg_catalog.to_jsonb(
          loyalty_private.notification_email_template_tokens_v1(
            selected_template.event_type
          )
        ),
        'publishedAt', selected_template.created_at
      ) order by system_template.event_type
    ),
    '[]'::jsonb
  ) into template_catalogue
  from loyalty_private.notification_email_template_versions as system_template
  left join loyalty_private.notification_email_template_bindings as binding
    on binding.organization_id = target_workspace.organization_id
   and binding.event_type = system_template.event_type
  join loyalty_private.notification_email_template_versions as selected_template
    on selected_template.id = coalesce(binding.template_id, system_template.id)
  where system_template.organization_id is null
    and system_template.template_version = 1;

  with active_customers as (
    select customer.id
    from loyalty.customers as customer
    where customer.organization_id = target_workspace.organization_id
      and customer.status = 'active'
  ), expanded as (
    select customer.id as customer_id, purpose.value as purpose,
      coalesce(preference.state, case when purpose.value = 'loyalty_transactional'
        then 'subscribed' else 'unsubscribed' end) as state
    from active_customers as customer
    cross join (values
      ('loyalty_transactional'::text), ('loyalty_marketing'::text)
    ) as purpose(value)
    left join loyalty_private.notification_preferences as preference
      on preference.organization_id = target_workspace.organization_id
     and preference.customer_id = customer.id
     and preference.channel = 'email'
     and preference.purpose = purpose.value
  ), totals as (
    select
      (select pg_catalog.count(*) from active_customers)::text
        as active_customers,
      pg_catalog.count(*) filter (
        where purpose = 'loyalty_transactional' and state = 'subscribed'
      )::text as transactional_subscribed,
      pg_catalog.count(*) filter (
        where purpose = 'loyalty_transactional' and state = 'unsubscribed'
      )::text as transactional_unsubscribed,
      pg_catalog.count(*) filter (
        where purpose = 'loyalty_transactional' and state = 'suppressed'
      )::text as transactional_suppressed,
      pg_catalog.count(*) filter (
        where purpose = 'loyalty_marketing' and state = 'subscribed'
      )::text as marketing_subscribed,
      pg_catalog.count(*) filter (
        where purpose = 'loyalty_marketing' and state = 'unsubscribed'
      )::text as marketing_unsubscribed,
      pg_catalog.count(*) filter (
        where purpose = 'loyalty_marketing' and state = 'suppressed'
      )::text as marketing_suppressed
    from expanded
  )
  select pg_catalog.jsonb_build_object(
    'activeCustomers', totals.active_customers,
    'loyaltyTransactional', pg_catalog.jsonb_build_object(
      'subscribed', totals.transactional_subscribed,
      'unsubscribed', totals.transactional_unsubscribed,
      'suppressed', totals.transactional_suppressed
    ),
    'loyaltyMarketing', pg_catalog.jsonb_build_object(
      'subscribed', totals.marketing_subscribed,
      'unsubscribed', totals.marketing_unsubscribed,
      'suppressed', totals.marketing_suppressed
    )
  ) into consent_summary
  from totals;

  smtp_enabled := entitlement.enabled
    and entitlement.deployment_mode = 'self_hosted';
  select entitlement.enabled and entitlement.deployment_mode = 'managed'
    and exists (
      select 1
      from loyalty_private.notification_klaviyo_connections as connection
      where connection.organization_id = target_workspace.organization_id
        and connection.state = 'active'
    ) into klaviyo_enabled;
  select entitlement.enabled and exists (
    select 1
    from loyalty_private.notification_webhook_endpoints as endpoint
    where endpoint.organization_id = target_workspace.organization_id
      and endpoint.state = 'active'
  ) into webhook_enabled;

  with all_provider_rows as (
    select 'smtp'::text as provider, delivery.state,
      delivery.created_at, delivery.updated_at
    from loyalty_private.notification_smtp_deliveries as delivery
    where delivery.organization_id = target_workspace.organization_id
    union all
    select 'smtp'::text, delivery.state,
      delivery.created_at, delivery.updated_at
    from loyalty_private.notification_smtp_test_deliveries as delivery
    where delivery.organization_id = target_workspace.organization_id
    union all
    select 'klaviyo'::text, operation.state,
      operation.created_at, operation.updated_at
    from loyalty_private.notification_klaviyo_operations as operation
    where operation.organization_id = target_workspace.organization_id
    union all
    select 'webhook'::text, delivery.state,
      delivery.created_at, delivery.updated_at
    from loyalty_private.notification_webhook_deliveries as delivery
    where delivery.organization_id = target_workspace.organization_id
  ), provider_names as (
    select * from (values
      ('smtp'::text, smtp_enabled),
      ('klaviyo'::text, klaviyo_enabled),
      ('webhook'::text, webhook_enabled)
    ) as provider(provider, enabled)
  ), totals as (
    select provider.provider, provider.enabled,
      pg_catalog.count(fact.state) filter (where fact.state = 'pending')::text
        as pending,
      pg_catalog.count(fact.state) filter (where fact.state = 'processing')::text
        as processing,
      pg_catalog.count(fact.state) filter (where fact.state = 'retryable')::text
        as retryable,
      pg_catalog.count(fact.state) filter (where fact.state = 'held')::text
        as held,
      pg_catalog.count(fact.state) filter (
        where fact.state in ('delivered', 'completed', 'superseded')
      )::text as completed,
      pg_catalog.count(fact.state) filter (where fact.state = 'suppressed')::text
        as suppressed,
      pg_catalog.count(fact.state) filter (
        where fact.state = 'contact_unavailable'
      )::text as contact_unavailable,
      pg_catalog.count(fact.state) filter (where fact.state = 'dead_letter')::text
        as dead_letter,
      pg_catalog.count(fact.state) filter (
        where fact.state = 'manual_review'
      )::text as manual_review,
      pg_catalog.min(fact.created_at) filter (
        where fact.state in ('pending', 'processing', 'retryable', 'held')
      ) as oldest_outstanding_at
    from provider_names as provider
    left join all_provider_rows as fact on fact.provider = provider.provider
    group by provider.provider, provider.enabled
  )
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'provider', totals.provider,
      'enabled', totals.enabled,
      'pending', totals.pending,
      'processing', totals.processing,
      'retryable', totals.retryable,
      'held', totals.held,
      'completed', totals.completed,
      'suppressed', totals.suppressed,
      'contactUnavailable', totals.contact_unavailable,
      'deadLetter', totals.dead_letter,
      'manualReview', totals.manual_review,
      'oldestOutstandingAt', totals.oldest_outstanding_at
    ) order by case totals.provider
      when 'smtp' then 1 when 'klaviyo' then 2 else 3 end
  ) into provider_health
  from totals;

  with issues as (
    select 'smtp'::text as provider, 'delivery'::text as kind,
      delivery.public_id as reference_id, event.event_type,
      delivery.state, delivery.attempt_count, delivery.last_error_code,
      delivery.updated_at
    from loyalty_private.notification_smtp_deliveries as delivery
    join loyalty_private.notification_events as event
      on event.organization_id = delivery.organization_id
     and event.id = delivery.notification_event_id
    where delivery.organization_id = target_workspace.organization_id
      and delivery.state in (
        'contact_unavailable', 'dead_letter', 'manual_review'
      )
    union all
    select 'smtp'::text, 'test'::text, delivery.public_id,
      delivery.event_type, delivery.state, delivery.attempt_count,
      delivery.last_error_code, delivery.updated_at
    from loyalty_private.notification_smtp_test_deliveries as delivery
    where delivery.organization_id = target_workspace.organization_id
      and delivery.state in (
        'contact_unavailable', 'dead_letter', 'manual_review'
      )
    union all
    select 'klaviyo'::text, 'operation'::text, operation.public_id,
      event.event_type, operation.state, operation.attempt_count,
      operation.last_error_code, operation.updated_at
    from loyalty_private.notification_klaviyo_operations as operation
    left join loyalty_private.notification_events as event
      on event.organization_id = operation.organization_id
     and event.id = operation.notification_event_id
    where operation.organization_id = target_workspace.organization_id
      and operation.state in (
        'contact_unavailable', 'dead_letter', 'manual_review'
      )
    union all
    select 'webhook'::text, 'delivery'::text, delivery.public_id,
      event.event_type, delivery.state, delivery.attempt_count,
      delivery.last_error_code, delivery.updated_at
    from loyalty_private.notification_webhook_deliveries as delivery
    join loyalty_private.notification_events as event
      on event.organization_id = delivery.organization_id
     and event.id = delivery.notification_event_id
    where delivery.organization_id = target_workspace.organization_id
      and delivery.state in (
        'contact_unavailable', 'dead_letter', 'manual_review'
      )
  ), bounded as (
    select issue.* from issues as issue
    order by issue.updated_at desc, issue.reference_id desc
    limit target_issue_limit
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'provider', bounded.provider,
      'kind', bounded.kind,
      'referenceId', bounded.reference_id,
      'eventType', bounded.event_type,
      'state', bounded.state,
      'attemptCount', bounded.attempt_count,
      'errorCode', bounded.last_error_code,
      'updatedAt', bounded.updated_at
    ) order by bounded.updated_at desc, bounded.reference_id desc
  ), '[]'::jsonb) into recent_issues
  from bounded;

  if pg_catalog.jsonb_array_length(template_catalogue) <> 6
    or pg_catalog.jsonb_array_length(provider_health) <> 3 then
    raise exception using errcode = '55000',
      message = 'notification workspace projection incomplete';
  end if;
  return query select pg_catalog.jsonb_build_object(
    'schemaVersion', '1',
    'generatedAt', generated_at,
    'deploymentMode', entitlement.deployment_mode,
    'entitlementEnabled', entitlement.enabled,
    'templates', template_catalogue,
    'consent', consent_summary,
    'providers', provider_health,
    'issues', recent_issues
  );
end;
$$;

alter function loyalty.get_notification_workspace_v1(uuid, integer)
  owner to loyalty_owner;
revoke all on function loyalty.get_notification_workspace_v1(uuid, integer)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty.get_notification_workspace_v1(uuid, integer)
  to authenticated;

comment on function loyalty.get_notification_workspace_v1(uuid, integer) is
  'Returns Auth-scoped active English templates, consent aggregates, provider totals, and bounded canonical issues without contact, payload, destination, secret, worker, or raw response data.';
