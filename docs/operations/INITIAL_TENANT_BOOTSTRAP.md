# Initial tenant bootstrap

Use this procedure once per new production tenant after the migrations are current and before the first merchant sign-in. It creates the organization, first live owner membership, workspace, programme group, workspace/group link, and one immutable administration audit event in a single transaction. It does not create a programme or WooCommerce connection; the owner completes those through the authenticated hub.

## Security boundary

- Create the first user in Supabase Auth through an approved administration path and record only its UUID for this command. Do not use email as tenant or membership authority.
- Run from a trusted administration host with a temporary PostgreSQL URL for a superuser or a login that can assume `loyalty_owner`.
- Put the URL in an environment variable. Never pass it as a command argument, paste it into documentation, commit it, or expose it to the dashboard/worker containers.
- The browser, `anon`, `authenticated`, `loyalty_runtime`, and `loyalty_worker` roles cannot execute the bootstrap function.
- The command prints only its outcome and new public resource UUIDs. It never prints the database URL.

## Preconditions

1. Restore/backup checks for the deployment change window are green.
2. All Starfiniti migrations, including `20260813070000_initial_tenant_bootstrap.sql`, have been applied.
3. Self-service Auth signup remains disabled.
4. The intended owner exists in `auth.users`, can receive the configured Auth flow, and has an approved UUID.
5. Organization, workspace, and programme-group slugs are final canonical lowercase slugs. Names are trimmed and final for launch.

## Command

Export the administration connection URL only in the current trusted shell, then run from the matching approved release source:

```sh
export STARFINITI_ADMIN_DATABASE_URL='postgresql://ADMIN_USER:REDACTED@PRIVATE_DATABASE_HOST:5432/postgres'

npm run tenant:bootstrap -- \
  --database-url-env STARFINITI_ADMIN_DATABASE_URL \
  --auth-user-id 00000000-0000-4000-8000-000000000000 \
  --organization-slug example-merchant \
  --organization-name 'Example Merchant' \
  --workspace-slug main-store \
  --workspace-name 'Main Store' \
  --programme-group-slug shared-loyalty \
  --programme-group-name 'Shared Loyalty' \
  --confirm example-merchant

unset STARFINITI_ADMIN_DATABASE_URL
```

The command derives `tenant-bootstrap:<organization-slug>` as its idempotency key. An exact retry returns `retry` and the same public IDs without another membership or audit event. A changed request using that organization slug or idempotency identity fails closed; it never adopts an existing organization.

## Verification

1. Retain the command's public-ID JSON as deployment evidence; do not add credentials or Auth email to it.
2. Sign in as the new owner and confirm the selected organization, workspace, and programme group are visible.
3. Create and publish the first programme through the guided authenticated programme flow.
4. Provision WooCommerce through the operations hub and import the one-time setup package into the plugin.
5. Confirm `tenant.bootstrap`, programme creation/publication, and connector provisioning appear in the tenant audit history.
6. Run the authenticated tenant and forbidden cross-tenant smoke tests before opening merchant access.

## Failure and correction

The database transaction is all-or-nothing. A missing Auth user, invalid input, insufficient database authority, existing organization slug, or changed retry rolls back without a partial tenant. Do not delete or rewrite bootstrap audit evidence. If an approved but incorrect bootstrap reached a persistent environment, stop launch and use a reviewed forward corrective migration or administration command; never repair it by editing immutable audit or ledger history.
