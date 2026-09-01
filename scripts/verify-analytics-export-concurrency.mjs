import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = randomUUID();
const exportKey = randomUUID();
const scheduleKey = randomUUID();
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });

async function assumeOwner(sql) {
  await sql`set local role authenticated`;
  await sql`select set_config('request.jwt.claim.sub', ${userId}, true)`;
}

async function raceWithHeldCommit(firstSql, secondSql) {
  let releaseFirst;
  let markFirstComplete;
  const firstComplete = new Promise((resolve) => {
    markFirstComplete = resolve;
  });
  const commitGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstResult = first.begin(async (sql) => {
    const rows = await firstSql(sql);
    markFirstComplete();
    await commitGate;
    return rows;
  });
  await firstComplete;
  const secondResult = second.begin(secondSql);
  setTimeout(releaseFirst, 100);
  return Promise.all([firstResult, secondResult]);
}

try {
  const fixture = await admin.begin(async (sql) => {
    await sql`
      insert into auth.users (id, email)
      values (${userId}, ${`analytics-race-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`analytics-race-${suffix}`}, 'Analytics Export Race Probe')
      returning id, public_id
    `;
    await sql`
      insert into loyalty.organization_memberships (organization_id, user_id, role)
      values (${organization.id}, ${userId}, 'owner')
    `;
    const [workspace] = await sql`
      insert into loyalty.workspaces (organization_id, slug, name)
      values (${organization.id}, 'shop', 'Analytics Probe Shop')
      returning id, public_id
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (organization_id, slug, name)
      values (${organization.id}, 'rewards', 'Analytics Probe Rewards')
      returning id, public_id
    `;
    await sql`
      insert into loyalty.programme_group_workspaces (
        organization_id, programme_group_id, workspace_id
      ) values (${organization.id}, ${group.id}, ${workspace.id})
    `;
    return { organization, workspace, group };
  });

  const createExport = async (sql) => {
    await assumeOwner(sql);
    return sql`
      select * from loyalty.create_analytics_export_command(
        ${fixture.organization.public_id}, ${fixture.workspace.public_id},
        ${fixture.group.public_id}, 'json_v1', 30, 'Europe/Ljubljana',
        ${exportKey}, ${randomUUID()}
      )
    `;
  };
  const [firstExportRows, secondExportRows] = await raceWithHeldCommit(
    createExport,
    createExport,
  );
  const exportOutcomes = [
    firstExportRows[0]?.outcome,
    secondExportRows[0]?.outcome,
  ].sort();
  const exportId = firstExportRows[0]?.resource_public_id;
  if (
    exportOutcomes.join(",") !== "created,duplicate" ||
    !exportId ||
    exportId !== secondExportRows[0]?.resource_public_id
  ) {
    throw new Error(
      `analytics export command race was not idempotent: ${JSON.stringify({ firstExportRows, secondExportRows })}`,
    );
  }

  const createSchedule = async (sql) => {
    await assumeOwner(sql);
    return sql`
      select * from loyalty.create_analytics_report_schedule_command(
        ${fixture.organization.public_id}, ${fixture.workspace.public_id},
        ${fixture.group.public_id}, 'json_v1', 30, 'Europe/Ljubljana',
        'weekly', 8, 1, null, ${scheduleKey}, ${randomUUID()}
      )
    `;
  };
  const [firstScheduleRows, secondScheduleRows] = await raceWithHeldCommit(
    createSchedule,
    createSchedule,
  );
  const scheduleOutcomes = [
    firstScheduleRows[0]?.outcome,
    secondScheduleRows[0]?.outcome,
  ].sort();
  const scheduleId = firstScheduleRows[0]?.resource_public_id;
  if (
    scheduleOutcomes.join(",") !== "created,duplicate" ||
    !scheduleId ||
    scheduleId !== secondScheduleRows[0]?.resource_public_id
  ) {
    throw new Error(
      `analytics schedule command race was not idempotent: ${JSON.stringify({ firstScheduleRows, secondScheduleRows })}`,
    );
  }

  await admin`
    update loyalty.analytics_report_schedules
    set next_run_at = statement_timestamp() - interval '1 second',
      updated_at = statement_timestamp()
    where public_id = ${scheduleId}
  `;
  const [firstMaterialized, secondMaterialized] = await Promise.all([
    first`select * from loyalty_private.materialize_due_analytics_exports_v1(now(), 20)`,
    second`select * from loyalty_private.materialize_due_analytics_exports_v1(now(), 20)`,
  ]);
  const materialized =
    Number(firstMaterialized[0]?.materialized ?? -1) +
    Number(secondMaterialized[0]?.materialized ?? -1);
  if (materialized !== 1) {
    throw new Error(
      `analytics schedule race materialized ${materialized} jobs`,
    );
  }

  const [firstClaims, secondClaims] = await Promise.all([
    first`select * from loyalty_private.claim_analytics_export_jobs_v1('analytics-race-first', 1, 300)`,
    second`select * from loyalty_private.claim_analytics_export_jobs_v1('analytics-race-second', 1, 300)`,
  ]);
  if (
    firstClaims.length !== 1 ||
    secondClaims.length !== 1 ||
    firstClaims[0].export_public_id === secondClaims[0].export_public_id
  ) {
    throw new Error(
      `analytics claim race was not isolated: ${JSON.stringify({ firstClaims, secondClaims })}`,
    );
  }
  const exportWorker =
    firstClaims[0].export_public_id === exportId
      ? "analytics-race-first"
      : "analytics-race-second";
  const [generated] = await admin`
    select * from loyalty_private.generate_analytics_export_job_v1(
      ${exportId}, ${exportWorker}
    )
  `;
  if (generated?.state !== "ready") {
    throw new Error("analytics export race fixture did not generate");
  }

  const sessionId = randomUUID();
  const [authorization] = await admin`
    select * from loyalty_private.issue_analytics_export_authorization_v1(
      ${exportId}, ${userId}, ${sessionId}
    )
  `;
  const consume = (sql) =>
    sql`
      select export_id
      from loyalty_private.consume_analytics_export_v1(
        ${exportId}, ${authorization.authorization_token}, ${userId}, ${sessionId}
      )
    `;
  const consumption = await Promise.allSettled([
    consume(first),
    consume(second),
  ]);
  const fulfilled = consumption.filter(
    (result) => result.status === "fulfilled",
  );
  const rejected = consumption.filter((result) => result.status === "rejected");
  if (fulfilled.length !== 1 || rejected.length !== 1) {
    throw new Error(
      `analytics one-use race did not fail closed: ${JSON.stringify(consumption)}`,
    );
  }

  const [state] = await admin`
    select
      (select count(*)::integer from loyalty.analytics_export_requests
       where organization_id = ${fixture.organization.id}) as requests,
      (select count(*)::integer from loyalty.analytics_report_schedules
       where organization_id = ${fixture.organization.id}) as schedules,
      (select count(*)::integer from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'analytics.export.create') as export_audits,
      (select count(*)::integer from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'analytics.schedule.create') as schedule_audits
  `;
  if (
    state.requests !== 2 ||
    state.schedules !== 1 ||
    state.export_audits !== 1 ||
    state.schedule_audits !== 1
  ) {
    throw new Error(
      `analytics race evidence did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Analytics export concurrency probe passed: manual and schedule commands returned created/duplicate pairs, one due instant materialized once, two claimers leased distinct jobs, and one capability consumption won exactly once.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
