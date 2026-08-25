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
      values (${userId}, ${`sharing-race-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`sharing-race-${suffix}`}, 'Sharing Race Probe')
      returning id
    `;
    await sql`
      insert into loyalty.organization_memberships (
        organization_id, user_id, role
      ) values (${organization.id}, ${userId}, 'owner')
    `;
    const workspaces = await sql`
      insert into loyalty.workspaces (organization_id, slug, name)
      values
        (${organization.id}, 'primary', 'Primary store'),
        (${organization.id}, 'outlet', 'Outlet store')
      returning id, public_id
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (
        organization_id, slug, name, sharing_policy
      ) values (
        ${organization.id}, 'rewards', 'Sharing Race Rewards', 'isolated'
      ) returning id, public_id
    `;

    await assumeOwner(sql);
    const [initial] = await sql`
      select * from loyalty.configure_programme_group_sharing_v1(
        ${group.public_id}, 'isolated',
        ${[workspaces[0].public_id]}::uuid[], 0,
        ${`sharing-race-initial:${suffix}`}, ${randomUUID()}
      )
    `;
    if (initial?.outcome !== "created" || initial?.revision !== 1) {
      throw new Error("sharing concurrency fixture did not create revision 1");
    }
    return { organization, group, workspaces };
  });

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
    const rows = await sql`
      select * from loyalty.configure_programme_group_sharing_v1(
        ${fixture.group.public_id}, 'explicit-workspace-allowlist',
        ${fixture.workspaces.map((workspace) => workspace.public_id)}::uuid[],
        1, ${`sharing-race-shared:${suffix}`}, ${randomUUID()}
      )
    `;
    markFirstComplete();
    await commitGate;
    return rows;
  });

  await firstComplete;
  const competingCommand = second.begin(async (sql) => {
    await assumeOwner(sql);
    return sql`
      select * from loyalty.configure_programme_group_sharing_v1(
        ${fixture.group.public_id}, 'isolated',
        ${[fixture.workspaces[1].public_id]}::uuid[],
        1, ${`sharing-race-isolated:${suffix}`}, ${randomUUID()}
      )
    `;
  });
  setTimeout(releaseFirst, 100);

  const [firstResult, competingResult] = await Promise.allSettled([
    firstCommand,
    competingCommand,
  ]);
  if (
    firstResult.status !== "fulfilled" ||
    firstResult.value[0]?.outcome !== "created" ||
    firstResult.value[0]?.revision !== 2 ||
    competingResult.status !== "rejected" ||
    competingResult.reason?.code !== "23514" ||
    !String(competingResult.reason?.message).includes(
      "sharing policy revision conflict",
    )
  ) {
    throw new Error(
      `sharing revision race did not fail closed: ${JSON.stringify({ firstResult, competingResult })}`,
    );
  }

  const [state] = await admin`
    select
      (select sharing_policy
       from loyalty.programme_groups
       where id = ${fixture.group.id}) as sharing_policy,
      (select count(*)::integer
       from loyalty.programme_group_workspaces
       where organization_id = ${fixture.organization.id}
         and programme_group_id = ${fixture.group.id}) as links,
      (select count(*)::integer
       from loyalty.programme_group_sharing_versions
       where organization_id = ${fixture.organization.id}
         and programme_group_id = ${fixture.group.id}) as versions,
      (select count(*)::integer
       from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'programme_group.sharing.configure') as audits,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${fixture.organization.id}) as ledger_transactions
  `;
  if (
    state.sharing_policy !== "explicit-workspace-allowlist" ||
    state.links !== 2 ||
    state.versions !== 2 ||
    state.audits !== 2 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `sharing revision race evidence did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Programme-group sharing concurrency probe passed: two different commands at revision 1 serialized on the stable group, one created revision 2, one failed stale, and topology/version/audit/value evidence reconciled.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
