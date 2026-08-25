import { createHash, randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });

function digest(value) {
  return createHash("sha256").update(value).digest();
}

async function claim(sql, connectionId, externalCustomerId, authUserId, label) {
  return sql`
    select * from loyalty_private.claim_woocommerce_customer_identity(
      ${connectionId}::uuid, ${externalCustomerId}, ${authUserId}::uuid,
      'v1', clock_timestamp(), ${digest(`${label}:nonce`)}::bytea,
      ${digest(`${label}:proof`)}::bytea
    )
  `;
}

async function createFixture(label, workspaceCount) {
  return admin.begin(async (sql) => {
    const primaryUserId = randomUUID();
    const competingUserId = randomUUID();
    await sql`
      insert into auth.users (id, email)
      values
        (${primaryUserId}, ${`${label}-primary-${suffix}@example.test`}),
        (${competingUserId}, ${`${label}-competing-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`${label}-${suffix}`}, ${`${label} customer link race`})
      returning id
    `;
    const workspaceRows = Array.from(
      { length: workspaceCount },
      (_, index) => ({
        slug: `store-${index + 1}`,
        name: `Store ${index + 1}`,
      }),
    );
    const workspaces = await sql`
      insert into loyalty.workspaces ${sql(
        workspaceRows.map((workspace) => ({
          organization_id: organization.id,
          slug: workspace.slug,
          name: workspace.name,
        })),
      )}
      returning id, public_id, slug
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (
        organization_id, slug, name, sharing_policy
      ) values (
        ${organization.id}, 'shared', 'Shared rewards',
        'explicit-workspace-allowlist'
      ) returning id, public_id
    `;
    await sql`
      insert into loyalty.programme_group_workspaces (
        organization_id, programme_group_id, workspace_id
      )
      select ${organization.id}, ${group.id}, workspace.id
      from loyalty.workspaces as workspace
      where workspace.organization_id = ${organization.id}
    `;
    const [sharingVersion] = await sql`
      insert into loyalty.programme_group_sharing_versions (
        organization_id, programme_group_id, revision, sharing_mode,
        source_kind, created_by_user_id
      ) values (
        ${organization.id}, ${group.id}, 1,
        'explicit-workspace-allowlist', 'migration', null
      ) returning id
    `;
    await sql`
      insert into loyalty.programme_group_sharing_version_workspaces (
        organization_id, sharing_version_id, workspace_id, ordinal
      )
      select ${organization.id}, ${sharingVersion.id}, workspace.id,
        row_number() over (order by workspace.public_id)::smallint
      from loyalty.workspaces as workspace
      where workspace.organization_id = ${organization.id}
    `;
    const [programme] = await sql`
      insert into loyalty.programmes (
        organization_id, programme_group_id, slug, name, status
      ) values (
        ${organization.id}, ${group.id}, 'shared', 'Shared loyalty', 'active'
      ) returning id
    `;
    const connections = [];
    for (const [index, workspace] of workspaces.entries()) {
      const [connection] = await sql`
        insert into loyalty.commerce_connections (
          organization_id, workspace_id, external_store_id, display_name,
          current_key_version, signing_material_ref, programme_id
        ) values (
          ${organization.id}, ${workspace.id},
          ${`${label}-${suffix}-store-${index + 1}`},
          ${`Store ${index + 1} WooCommerce`}, 'v1',
          ${`vault://${label}-${suffix}-${index + 1}`}, ${programme.id}
        ) returning id, public_id
      `;
      connections.push(connection);
      await sql`
        select * from loyalty_private.resolve_commerce_customer(
          ${organization.id}, ${connection.id}, 'registered', ${String(index + 1)}
        )
      `;
    }
    const firstClaim = await claim(
      sql,
      connections[0].public_id,
      "1",
      primaryUserId,
      `${label}:${suffix}:primary`,
    );
    if (firstClaim[0]?.outcome !== "linked") {
      throw new Error(`${label} fixture could not link the canonical store`);
    }
    return {
      organization,
      group,
      connections,
      primaryUserId,
      competingUserId,
    };
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

try {
  const sameSubject = await createFixture("same-subject", 3);
  const firstCalled = deferred();
  const releaseFirst = deferred();
  const firstClaim = first.begin(async (sql) => {
    const rows = await claim(
      sql,
      sameSubject.connections[1].public_id,
      "2",
      sameSubject.primaryUserId,
      `same-subject:${suffix}:second`,
    );
    firstCalled.resolve();
    await releaseFirst.promise;
    return rows;
  });
  await firstCalled.promise;
  const secondClaim = second.begin((sql) =>
    claim(
      sql,
      sameSubject.connections[2].public_id,
      "3",
      sameSubject.primaryUserId,
      `same-subject:${suffix}:third`,
    ),
  );
  setTimeout(releaseFirst.resolve, 100);

  const sameSubjectResults = await Promise.all([firstClaim, secondClaim]);
  if (
    sameSubjectResults[0][0]?.outcome !== "linked" ||
    sameSubjectResults[1][0]?.outcome !== "linked"
  ) {
    throw new Error(
      `same-subject claims did not both serialize safely: ${JSON.stringify(sameSubjectResults)}`,
    );
  }
  const [sameSubjectState] = await admin`
    select
      (select count(*)::integer
       from loyalty.customer_identity_link_versions
       where organization_id = ${sameSubject.organization.id}) as versions,
      (select max(revision)::integer
       from loyalty.customer_identity_link_versions
       where organization_id = ${sameSubject.organization.id}) as revision,
      (select member_count::integer
       from loyalty.customer_identity_link_versions
       where organization_id = ${sameSubject.organization.id}
       order by revision desc limit 1) as members,
      (select count(distinct customer_id)::integer
       from loyalty.customer_user_links
       where organization_id = ${sameSubject.organization.id}
         and auth_user_id = ${sameSubject.primaryUserId}
         and revoked_at is null) as canonical_customers,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${sameSubject.organization.id}) as ledger_transactions
  `;
  if (
    sameSubjectState.versions !== 2 ||
    sameSubjectState.revision !== 2 ||
    sameSubjectState.members !== 3 ||
    sameSubjectState.canonical_customers !== 1 ||
    sameSubjectState.ledger_transactions !== 0
  ) {
    throw new Error(
      `same-subject link race did not reconcile: ${JSON.stringify(sameSubjectState)}`,
    );
  }

  const competingSubjects = await createFixture("competing-subjects", 2);
  const winnerCalled = deferred();
  const releaseWinner = deferred();
  const winningClaim = first.begin(async (sql) => {
    const rows = await claim(
      sql,
      competingSubjects.connections[1].public_id,
      "2",
      competingSubjects.primaryUserId,
      `competing-subjects:${suffix}:winner`,
    );
    winnerCalled.resolve();
    await releaseWinner.promise;
    return rows;
  });
  await winnerCalled.promise;
  const losingClaim = second.begin((sql) =>
    claim(
      sql,
      competingSubjects.connections[1].public_id,
      "2",
      competingSubjects.competingUserId,
      `competing-subjects:${suffix}:loser`,
    ),
  );
  setTimeout(releaseWinner.resolve, 100);

  const competingResults = await Promise.all([winningClaim, losingClaim]);
  if (
    competingResults[0][0]?.outcome !== "linked" ||
    competingResults[1][0]?.outcome !== "rejected_customer_conflict"
  ) {
    throw new Error(
      `competing-subject race did not fail closed: ${JSON.stringify(competingResults)}`,
    );
  }
  const [competingState] = await admin`
    select
      (select count(*)::integer
       from loyalty.customer_identity_link_versions
       where organization_id = ${competingSubjects.organization.id}) as versions,
      (select count(*)::integer
       from loyalty.customer_user_links as link
       join loyalty.commerce_connections as connection
         on connection.organization_id = link.organization_id
        and connection.id = link.source_connection_id
       where link.organization_id = ${competingSubjects.organization.id}
         and connection.public_id = ${competingSubjects.connections[1].public_id}
         and link.revoked_at is null) as active_secondary_links,
      (select count(*)::integer
       from loyalty.identity_link_decisions
       where organization_id = ${competingSubjects.organization.id}
         and outcome = 'rejected_customer_conflict') as rejected_decisions,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id = ${competingSubjects.organization.id}) as ledger_transactions
  `;
  if (
    competingState.versions !== 1 ||
    competingState.active_secondary_links !== 1 ||
    competingState.rejected_decisions !== 1 ||
    competingState.ledger_transactions !== 0
  ) {
    throw new Error(
      `competing-subject evidence did not reconcile: ${JSON.stringify(competingState)}`,
    );
  }

  console.log(
    "Customer-link concurrency probe passed: concurrent second/third store proofs serialized into one canonical three-member set, competing Auth subjects produced one accepted and one immutable rejection, and both scenarios created zero ledger effects.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
