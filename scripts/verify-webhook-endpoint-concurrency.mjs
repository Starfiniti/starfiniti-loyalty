import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = randomUUID();
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });

async function assumeOwner(sql) {
  await sql`set local role authenticated`;
  await sql`select set_config('request.jwt.claim.sub', ${userId}, true)`;
}

try {
  const fixture = await admin.begin(async (sql) => {
    await sql`
      insert into auth.users (id, email)
      values (${userId}, ${`webhook-race-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`webhook-race-${suffix}`}, 'Webhook Race Probe')
      returning id
    `;
    await sql`
      insert into loyalty.organization_memberships (
        organization_id, user_id, role
      ) values (${organization.id}, ${userId}, 'owner')
    `;
    const [workspace] = await sql`
      insert into loyalty.workspaces (organization_id, slug, name)
      values (${organization.id}, 'primary', 'Primary store')
      returning public_id
    `;
    return { organization, workspace };
  });

  const idempotencyKey = `webhook-race-create:${suffix}`;
  const createEndpoint = (sql, fingerprint, hint) => sql`
    select * from loyalty.create_notification_webhook_endpoint_command_v1(
      ${fixture.workspace.public_id}, 'Concurrency receiver',
      'https://hooks.example.test/starfiniti', ${fingerprint}, ${hint},
      ${[
        "loyalty.connector.health",
        "loyalty.points.earned",
      ]}::text[], 60, ${idempotencyKey}, ${randomUUID()}
    )
  `;

  let releaseFirst;
  let markFirstComplete;
  const firstComplete = new Promise((resolve) => {
    markFirstComplete = resolve;
  });
  const commitGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const firstCommand = first.begin(async (sql) => {
    await assumeOwner(sql);
    const rows = await createEndpoint(sql, "11".repeat(32), "raceA1");
    markFirstComplete();
    await commitGate;
    return rows;
  });
  await firstComplete;
  const secondCommand = second.begin(async (sql) => {
    await assumeOwner(sql);
    return createEndpoint(sql, "22".repeat(32), "raceB2");
  });
  setTimeout(releaseFirst, 100);

  const [firstRows, secondRows] = await Promise.all([
    firstCommand,
    secondCommand,
  ]);
  const outcomes = [firstRows[0]?.outcome, secondRows[0]?.outcome].sort();
  if (
    JSON.stringify(outcomes) !== JSON.stringify(["created", "duplicate"]) ||
    firstRows[0]?.endpoint_public_id !== secondRows[0]?.endpoint_public_id
  ) {
    throw new Error(
      `webhook creation race did not serialize exactly once: ${JSON.stringify({ firstRows, secondRows })}`,
    );
  }

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.notification_webhook_endpoints
       where organization_id = ${fixture.organization.id}) as endpoints,
      (select count(*)::integer
       from loyalty_private.notification_webhook_endpoint_revisions as revision
       join loyalty_private.notification_webhook_endpoints as endpoint
         on endpoint.id = revision.endpoint_id
       where endpoint.organization_id = ${fixture.organization.id}) as revisions,
      (select count(*)::integer
       from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'notification.webhook.create') as audits,
      (select count(*)::integer
       from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'notification.webhook.create'
         and actor_user_id = ${userId}) as attributed_audits,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${fixture.organization.id}) as ledger_transactions
  `;
  if (
    state.endpoints !== 1 ||
    state.revisions !== 1 ||
    state.audits !== 1 ||
    state.attributed_audits !== 1 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `webhook creation race evidence did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Webhook endpoint concurrency probe passed: two authenticated retries serialized on PostgreSQL-derived actor/tenant authority, returned one created and one duplicate endpoint, and revision/audit/value evidence reconciled.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
