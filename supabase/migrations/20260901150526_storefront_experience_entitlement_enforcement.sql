-- M09 follow-up: customer-experience authoring must obey the product
-- capability decision. Reads remain available so disabling the enhancement
-- cannot hide existing configuration or accepted loyalty value.

create or replace function loyalty_private.enforce_storefront_experience_entitlement_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text;
  entitlement_enabled boolean;
begin
  if tg_table_schema <> 'loyalty'
     or tg_table_name not in ('experience_themes', 'experience_translations')
     or tg_op not in ('INSERT', 'UPDATE')
     or new.organization_id is null
     or new.workspace_id is null
     or new.programme_group_id is null then
    raise exception using errcode = '55000',
      message = 'storefront experience entitlement trigger is misconfigured';
  end if;

  request_role := nullif(pg_catalog.current_setting('role', true), '');
  if request_role is null or request_role = 'none' then
    request_role := session_user;
  end if;

  -- Migrations and direct database administration retain their narrow role
  -- authority. Browser, dashboard/runtime, and worker commands always resolve
  -- the entitlement, including through SECURITY DEFINER functions.
  if request_role in ('postgres', 'loyalty_owner') then
    return new;
  end if;

  select decision.enabled into strict entitlement_enabled
  from loyalty_private.resolve_organization_entitlement(
    new.organization_id,
    'storefront.experience',
    'storefront-authoring:' || new.organization_id::text || ':' ||
      new.workspace_id::text || ':' || new.programme_group_id::text,
    pg_catalog.statement_timestamp()
  ) as decision;

  if not entitlement_enabled then
    raise exception using errcode = '42501',
      message = 'storefront experience capability disabled';
  end if;

  return new;
end;
$$;

alter function loyalty_private.enforce_storefront_experience_entitlement_v1()
  owner to loyalty_owner;
revoke all on function loyalty_private.enforce_storefront_experience_entitlement_v1()
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;

create trigger zy_storefront_entitlement_experience_themes
before insert or update on loyalty.experience_themes
for each row execute function
  loyalty_private.enforce_storefront_experience_entitlement_v1();

create trigger zy_storefront_entitlement_experience_translations
before insert or update on loyalty.experience_translations
for each row execute function
  loyalty_private.enforce_storefront_experience_entitlement_v1();

comment on function loyalty_private.enforce_storefront_experience_entitlement_v1() is
  'Denies merchant theme and copy writes when storefront.experience is disabled while preserving all reads and historical configuration.';
