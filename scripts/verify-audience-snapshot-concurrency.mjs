import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = randomUUID();
const idempotencyKey = `audience-snapshot:${suffix}`;
const correlationId = randomUUID();
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
      values (${userId}, ${`audience-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`audience-${suffix}`}, 'Audience Snapshot Race Probe')
      returning id
    `;
    await sql`
      insert into loyalty.organization_memberships (
        organization_id, user_id, role
      ) values (${organization.id}, ${userId}, 'owner')
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (organization_id, slug, name)
      values (${organization.id}, 'audience', 'Audience Probe Group')
      returning id
    `;
    const [programme] = await sql`
      insert into loyalty.programmes (
        organization_id, programme_group_id, slug, name, status
      ) values (
        ${organization.id}, ${group.id}, 'audience',
        'Audience Probe Programme', 'active'
      ) returning public_id
    `;
    const [customer] = await sql`
      insert into loyalty.customers (organization_id, display_reference)
      values (${organization.id}, ${`audience-member-${suffix}`})
      returning id
    `;
    await sql`
      insert into loyalty.wallets (
        organization_id, programme_group_id, customer_id
      ) values (${organization.id}, ${group.id}, ${customer.id})
    `;

    await assumeOwner(sql);
    const definition = {
      schemaVersion: "1",
      code: `race_${suffix}`,
      name: "Snapshot race audience",
      description: "",
      match: "all",
      conditions: [
        {
          kind: "metric",
          metric: "available_points",
          operator: "at_least",
          minimum: "0",
          maximum: null,
          window: null,
          activityCodes: [],
        },
      ],
    };
    const [draft] = await sql`
      select * from loyalty.create_audience_draft_command(
        ${programme.public_id}, ${definition},
        ${`audience-draft:${suffix}`}, ${randomUUID()}
      )
    `;
    const [published] = await sql`
      select * from loyalty.publish_audience_version_command(
        ${draft.resource_public_id}, ${draft.definition_sha256},
        ${`audience-publish:${suffix}`}, ${randomUUID()}
      )
    `;
    if (draft.outcome !== "created" || published.outcome !== "created") {
      throw new Error("audience concurrency fixture did not publish");
    }
    return {
      organizationId: organization.id,
      audienceVersionId: draft.resource_public_id,
    };
  });

  let releaseFirst;
  let markFirstComplete;
  const firstComplete = new Promise((resolve) => {
    markFirstComplete = resolve;
  });
  const commitGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const firstSnapshot = first.begin(async (sql) => {
    await assumeOwner(sql);
    const rows = await sql`
      select * from loyalty.create_audience_snapshot_command(
        ${fixture.audienceVersionId}, ${idempotencyKey}, ${correlationId}
      )
    `;
    markFirstComplete();
    await commitGate;
    return rows;
  });

  await firstComplete;
  const competingSnapshot = second.begin(async (sql) => {
    await assumeOwner(sql);
    return sql`
      select * from loyalty.create_audience_snapshot_command(
        ${fixture.audienceVersionId}, ${idempotencyKey}, ${correlationId}
      )
    `;
  });
  setTimeout(releaseFirst, 100);

  const [firstRows, secondRows] = await Promise.all([
    firstSnapshot,
    competingSnapshot,
  ]);
  if (
    firstRows[0]?.outcome !== "created" ||
    secondRows[0]?.outcome !== "duplicate" ||
    firstRows[0]?.resource_public_id !== secondRows[0]?.resource_public_id ||
    firstRows[0]?.member_count !== "1" ||
    secondRows[0]?.member_count !== "1"
  ) {
    throw new Error(
      `audience snapshot race was not idempotent: ${JSON.stringify({ firstRows, secondRows })}`,
    );
  }

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty.audience_snapshots
       where organization_id = ${fixture.organizationId}) as snapshots,
      (select count(*)::integer
       from loyalty_private.audience_snapshot_members
       where organization_id = ${fixture.organizationId}) as members,
      (select count(*)::integer
       from loyalty.admin_audit_events
       where organization_id = ${fixture.organizationId}
         and action = 'audience.snapshot.create') as snapshot_audits
  `;
  if (
    state.snapshots !== 1 ||
    state.members !== 1 ||
    state.snapshot_audits !== 1
  ) {
    throw new Error(
      `audience snapshot race did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Audience snapshot concurrency probe passed: two identical commands serialized on the stable audience, created one immutable snapshot/member/audit, and returned one created plus one duplicate result.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
