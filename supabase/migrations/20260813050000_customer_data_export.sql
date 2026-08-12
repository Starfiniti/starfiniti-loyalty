-- Phase 9 hosted customer data export. A password reauthentication performed
-- by the server issues a short-lived, one-use, session-bound capability. The
-- raw capability is never stored and the direct JSON response is not persisted.

create table loyalty_private.customer_data_export_authorizations (
  id bigint generated always as identity primary key,
  token_sha256 bytea not null unique check (octet_length(token_sha256) = 32),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at)
);

create index customer_data_export_authorizations_subject_idx
  on loyalty_private.customer_data_export_authorizations (
    auth_user_id, session_id, expires_at desc, id desc
  ) where used_at is null;

create index customer_user_links_active_auth_subject_idx
  on loyalty.customer_user_links (auth_user_id, linked_at, id)
  where revoked_at is null;

create table loyalty_private.customer_data_export_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  export_id uuid not null,
  organization_id bigint not null references loyalty.organizations(id) on delete restrict,
  customer_id bigint not null,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  session_id uuid not null,
  format text not null default 'starfiniti.customer-data-export.v1'
    check (format = 'starfiniti.customer-data-export.v1'),
  created_at timestamptz not null default now(),
  unique (organization_id, export_id, customer_id),
  foreign key (organization_id, customer_id)
    references loyalty.customers(organization_id, id) on delete restrict
);

create index customer_data_export_events_customer_idx
  on loyalty_private.customer_data_export_events (
    organization_id, customer_id, created_at desc, id desc
  );

create trigger customer_data_export_events_immutable
before update or delete on loyalty_private.customer_data_export_events
for each row execute function loyalty_private.reject_immutable_change();

alter table loyalty_private.customer_data_export_authorizations owner to loyalty_owner;
alter table loyalty_private.customer_data_export_events owner to loyalty_owner;
alter table loyalty_private.customer_data_export_authorizations enable row level security;
alter table loyalty_private.customer_data_export_events enable row level security;

create or replace function loyalty_private.issue_customer_data_export_authorization(
  target_auth_user_id uuid,
  target_session_id uuid
)
returns table (
  authorization_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  created_token uuid := extensions.gen_random_uuid();
  created_expires_at timestamptz := pg_catalog.clock_timestamp() + interval '5 minutes';
begin
  if target_auth_user_id is null or target_session_id is null then
    raise exception using errcode = '22023', message = 'invalid export authorization subject';
  end if;

  delete from loyalty_private.customer_data_export_authorizations as authorization
  where authorization.expires_at < pg_catalog.clock_timestamp() - interval '1 day'
     or (
       authorization.auth_user_id = target_auth_user_id
       and authorization.session_id = target_session_id
       and authorization.used_at is null
     );

  insert into loyalty_private.customer_data_export_authorizations (
    token_sha256, auth_user_id, session_id, expires_at
  ) values (
    extensions.digest(pg_catalog.convert_to(created_token::text, 'utf8'), 'sha256'),
    target_auth_user_id, target_session_id, created_expires_at
  );

  return query select created_token::text, created_expires_at;
end;
$$;

create or replace function loyalty_private.consume_customer_data_export(
  target_authorization_token text,
  target_auth_user_id uuid,
  target_session_id uuid
)
returns table (
  export_id uuid,
  generated_at timestamptz,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  matched_authorization loyalty_private.customer_data_export_authorizations%rowtype;
  created_export_id uuid := extensions.gen_random_uuid();
  created_generated_at timestamptz := pg_catalog.clock_timestamp();
  export_payload jsonb;
begin
  if target_authorization_token is null
    or pg_catalog.length(target_authorization_token) > 100
    or target_auth_user_id is null
    or target_session_id is null then
    raise exception using errcode = '22023', message = 'invalid customer data export request';
  end if;

  select authorization.* into matched_authorization
  from loyalty_private.customer_data_export_authorizations as authorization
  where authorization.token_sha256 = extensions.digest(
      pg_catalog.convert_to(target_authorization_token, 'utf8'), 'sha256'
    )
    and authorization.auth_user_id = target_auth_user_id
    and authorization.session_id = target_session_id
  for update;

  if not found
    or matched_authorization.used_at is not null
    or matched_authorization.expires_at < created_generated_at then
    raise exception using errcode = '42501', message = 'customer data export authorization invalid';
  end if;

  if not exists (
    select 1
    from loyalty.customer_user_links as link
    join loyalty.organizations as organization
      on organization.id = link.organization_id
     and organization.status = 'active'
    join loyalty.customers as customer
      on customer.organization_id = link.organization_id
     and customer.id = link.customer_id
     and customer.status = 'active'
    join loyalty.commerce_connections as connection
      on connection.organization_id = link.organization_id
     and connection.id = link.source_connection_id
    join loyalty.workspaces as workspace
      on workspace.organization_id = connection.organization_id
     and workspace.id = connection.workspace_id
     and workspace.status = 'active'
    where link.auth_user_id = target_auth_user_id
      and link.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'customer data export not authorized';
  end if;

  update loyalty_private.customer_data_export_authorizations
  set used_at = created_generated_at
  where id = matched_authorization.id;

  insert into loyalty_private.customer_data_export_events (
    export_id, organization_id, customer_id, auth_user_id, session_id, created_at
  )
  select distinct created_export_id, link.organization_id, link.customer_id,
    target_auth_user_id, target_session_id, created_generated_at
  from loyalty.customer_user_links as link
  join loyalty.organizations as organization
    on organization.id = link.organization_id
   and organization.status = 'active'
  join loyalty.customers as customer
    on customer.organization_id = link.organization_id
   and customer.id = link.customer_id
   and customer.status = 'active'
  join loyalty.commerce_connections as connection
    on connection.organization_id = link.organization_id
   and connection.id = link.source_connection_id
  join loyalty.workspaces as workspace
    on workspace.organization_id = connection.organization_id
   and workspace.id = connection.workspace_id
   and workspace.status = 'active'
  where link.auth_user_id = target_auth_user_id
    and link.revoked_at is null;

  select jsonb_build_object(
    'schemaVersion', 'starfiniti.customer-data-export.v1',
    'exportId', created_export_id,
    'generatedAt', created_generated_at,
    'authSubjectId', target_auth_user_id,
    'accounts', coalesce(jsonb_agg(account.document order by account.linked_at, account.link_id), '[]'::jsonb)
  ) into export_payload
  from (
    select link.linked_at, link.id as link_id,
      jsonb_build_object(
        'accountId', link.public_id,
        'linkedAt', link.linked_at,
        'customer', jsonb_build_object(
          'id', customer.public_id,
          'status', customer.status,
          'displayReference', customer.display_reference,
          'createdAt', customer.created_at,
          'updatedAt', customer.updated_at
        ),
        'store', jsonb_build_object(
          'connectionId', connection.public_id,
          'externalStoreId', connection.external_store_id,
          'displayName', connection.display_name,
          'status', connection.status,
          'workspaceId', workspace.public_id,
          'workspaceName', workspace.name
        ),
        'identities', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', identity.public_id,
              'kind', identity.identity_kind,
              'externalCustomerId', identity.external_customer_id,
              'connectionId', identity_connection.public_id,
              'storeName', identity_connection.display_name,
              'verifiedAt', identity.verified_at,
              'createdAt', identity.created_at
            ) order by identity.created_at, identity.id
          )
          from loyalty.customer_identities as identity
          join loyalty.commerce_connections as identity_connection
            on identity_connection.organization_id = identity.organization_id
           and identity_connection.id = identity.commerce_connection_id
          where identity.organization_id = customer.organization_id
            and identity.customer_id = customer.id
        ), '[]'::jsonb),
        'wallets', coalesce((
          select jsonb_agg(wallet_document.document order by wallet_document.created_at, wallet_document.wallet_id)
          from (
            select wallet.created_at, wallet.id as wallet_id,
              jsonb_build_object(
                'id', wallet.public_id,
                'status', wallet.status,
                'programmeGroup', jsonb_build_object(
                  'id', programme_group.public_id,
                  'name', programme_group.name
                ),
                'createdAt', wallet.created_at,
                'updatedAt', wallet.updated_at,
                'balances', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'kind', wallet_balance.account_kind,
                      'points', wallet_balance.points::text,
                      'updatedAt', wallet_balance.updated_at
                    ) order by wallet_balance.account_kind
                  )
                  from loyalty.wallet_balances as wallet_balance
                  where wallet_balance.organization_id = wallet.organization_id
                    and wallet_balance.wallet_id = wallet.id
                ), '[]'::jsonb),
                'tierMemberships', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'tierCode', membership.tier_code,
                      'effectiveFrom', membership.effective_from,
                      'effectiveUntil', membership.effective_until
                    ) order by membership.effective_from, membership.id
                  )
                  from loyalty.tier_memberships as membership
                  where membership.organization_id = wallet.organization_id
                    and membership.wallet_id = wallet.id
                ), '[]'::jsonb),
                'reservations', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', reservation.public_id,
                      'rewardCode', reward.code,
                      'rewardName', reward.name,
                      'costPoints', reservation.cost_points::text,
                      'state', reservation.state,
                      'expiresAt', reservation.expires_at,
                      'createdAt', reservation.created_at,
                      'updatedAt', reservation.updated_at
                    ) order by reservation.created_at, reservation.id
                  )
                  from loyalty.reward_reservations as reservation
                  join loyalty.programme_rewards as reward
                    on reward.organization_id = reservation.organization_id
                   and reward.id = reservation.reward_id
                  where reservation.organization_id = wallet.organization_id
                    and reservation.wallet_id = wallet.id
                ), '[]'::jsonb),
                'ledger', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', history.public_id,
                      'kind', history.transaction_kind,
                      'effectiveAt', history.effective_at,
                      'createdAt', history.created_at,
                      'entries', history.entries
                    ) order by history.effective_at, history.transaction_id
                  )
                  from (
                    select transaction.id as transaction_id,
                      transaction.public_id, transaction.transaction_kind,
                      transaction.effective_at, transaction.created_at,
                      jsonb_agg(
                        jsonb_build_object(
                          'id', entry.public_id,
                          'accountKind', account.account_kind,
                          'points', entry.points::text,
                          'createdAt', entry.created_at
                        ) order by entry.ordinal
                      ) as entries
                    from loyalty.ledger_accounts as account
                    join loyalty.ledger_entries as entry
                      on entry.organization_id = account.organization_id
                     and entry.account_id = account.id
                    join loyalty.ledger_transactions as transaction
                      on transaction.organization_id = entry.organization_id
                     and transaction.id = entry.transaction_id
                    where account.organization_id = wallet.organization_id
                      and account.wallet_id = wallet.id
                    group by transaction.id, transaction.public_id,
                      transaction.transaction_kind, transaction.effective_at,
                      transaction.created_at
                  ) as history
                ), '[]'::jsonb)
              ) as document
            from loyalty.wallets as wallet
            join loyalty.programme_groups as programme_group
              on programme_group.organization_id = wallet.organization_id
             and programme_group.id = wallet.programme_group_id
            where wallet.organization_id = customer.organization_id
              and wallet.customer_id = customer.id
          ) as wallet_document
        ), '[]'::jsonb)
      ) as document
    from loyalty.customer_user_links as link
    join loyalty.organizations as organization
      on organization.id = link.organization_id
     and organization.status = 'active'
    join loyalty.customers as customer
      on customer.organization_id = link.organization_id
     and customer.id = link.customer_id
     and customer.status = 'active'
    join loyalty.commerce_connections as connection
      on connection.organization_id = link.organization_id
     and connection.id = link.source_connection_id
    join loyalty.workspaces as workspace
      on workspace.organization_id = connection.organization_id
     and workspace.id = connection.workspace_id
     and workspace.status = 'active'
    where link.auth_user_id = target_auth_user_id
      and link.revoked_at is null
  ) as account;

  return query select created_export_id, created_generated_at, export_payload;
end;
$$;

alter function loyalty_private.issue_customer_data_export_authorization(uuid, uuid)
  owner to loyalty_owner;
alter function loyalty_private.consume_customer_data_export(text, uuid, uuid)
  owner to loyalty_owner;

revoke all on loyalty_private.customer_data_export_authorizations,
  loyalty_private.customer_data_export_events
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
revoke all on function loyalty_private.issue_customer_data_export_authorization(uuid, uuid),
  loyalty_private.consume_customer_data_export(text, uuid, uuid)
  from public, anon, authenticated, loyalty_runtime, loyalty_worker;
grant execute on function loyalty_private.issue_customer_data_export_authorization(uuid, uuid),
  loyalty_private.consume_customer_data_export(text, uuid, uuid)
  to loyalty_runtime;

comment on table loyalty_private.customer_data_export_authorizations is
  'Ephemeral session-bound customer export capabilities; only SHA-256 token references are stored.';
comment on table loyalty_private.customer_data_export_events is
  'Immutable per-customer evidence for one direct authenticated data export; no exported content is retained.';
comment on function loyalty_private.issue_customer_data_export_authorization(uuid, uuid) is
  'Issues one five-minute server-only export capability after application-level password reauthentication.';
comment on function loyalty_private.consume_customer_data_export(text, uuid, uuid) is
  'Consumes one exact session-bound capability and returns a direct subject-only customer data export with immutable audit evidence.';
