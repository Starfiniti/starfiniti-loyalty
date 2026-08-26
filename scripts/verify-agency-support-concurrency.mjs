import { createHash, randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const clientOwnerId = randomUUID();
const agencyOwnerId = randomUUID();
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });

async function asSubject(sql, subjectId, callback) {
  return sql.begin(async (transaction) => {
    await transaction`set local role authenticated`;
    await transaction`select set_config('request.jwt.claim.sub', ${subjectId}, true)`;
    return callback(transaction);
  });
}

try {
  const fixture = await admin.begin(async (sql) => {
    await sql`
      insert into auth.users (id, email)
      values
        (${clientOwnerId}, ${`agency-client-owner-${suffix}@example.test`}),
        (${agencyOwnerId}, ${`agency-provider-owner-${suffix}@example.test`})
    `;
    const [client] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`agency-client-race-${suffix}`}, 'Agency client race')
      returning id, public_id
    `;
    const [agency] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`agency-provider-race-${suffix}`}, 'Agency provider race')
      returning id, public_id
    `;
    await sql`
      insert into loyalty.organization_memberships (
        organization_id, user_id, role, display_label
      ) values
        (${client.id}, ${clientOwnerId}, 'owner', 'Client owner'),
        (${agency.id}, ${agencyOwnerId}, 'owner', 'Agency owner')
    `;
    return { client, agency };
  });

  const tokenSha256 = createHash("sha256")
    .update(`agency-support-race:${suffix}`)
    .digest("hex");
  await asSubject(
    admin,
    clientOwnerId,
    (transaction) => transaction`
      select * from loyalty.create_organization_agency_invitation_command_v1(
        ${fixture.client.public_id}, 'Concurrent support agency',
        statement_timestamp() + interval '1 day', ${tokenSha256},
        ${`agency-race:invite:${suffix}`}, ${randomUUID()}
      )
    `,
  );

  const acceptIdempotencyKey = `agency-race:accept:${suffix}`;
  const acceptCorrelationId = randomUUID();
  const accept = (sql) =>
    asSubject(
      sql,
      agencyOwnerId,
      (transaction) => transaction`
        select * from loyalty.accept_organization_agency_invitation_command_v1(
          ${fixture.agency.public_id}, ${tokenSha256},
          ${acceptIdempotencyKey}, ${acceptCorrelationId}
        )
      `,
    );
  const [firstAcceptance, secondAcceptance] = await Promise.all([
    accept(first),
    accept(second),
  ]);
  const acceptanceOutcomes = [
    firstAcceptance[0]?.outcome,
    secondAcceptance[0]?.outcome,
  ].sort();
  if (
    JSON.stringify(acceptanceOutcomes) !==
      JSON.stringify(["created", "duplicate"]) ||
    firstAcceptance[0]?.resource_public_id !==
      secondAcceptance[0]?.resource_public_id
  ) {
    throw new Error(
      `agency acceptance did not serialize exactly once: ${JSON.stringify({ firstAcceptance, secondAcceptance })}`,
    );
  }

  const [relationship] = await admin`
    select public_id, lifecycle_revision
    from loyalty.organization_agency_relationships
    where client_organization_id = ${fixture.client.id}
      and agency_organization_id = ${fixture.agency.id}
  `;
  const [supportRequest] = await asSubject(
    admin,
    agencyOwnerId,
    (transaction) => transaction`
      select * from loyalty.create_support_access_request_command_v1(
        ${fixture.agency.public_id}, ${fixture.client.public_id},
        array['audit.summary.read', 'organization.summary.read']::text[],
        'Investigate a concurrent tenant support incident.',
        statement_timestamp() + interval '2 hours',
        ${`agency-race:support-request:${suffix}`}, ${randomUUID()}
      )
    `,
  );

  const approvalIdempotencyKey = `agency-race:approve:${suffix}`;
  const approvalCorrelationId = randomUUID();
  const approve = (sql) =>
    asSubject(
      sql,
      clientOwnerId,
      (transaction) => transaction`
        select * from loyalty.resolve_support_access_request_command_v1(
          ${fixture.client.public_id}, ${supportRequest.resource_public_id},
          1, 'approve', array['organization.summary.read']::text[],
          statement_timestamp() + interval '1 hour',
          'Owner approved the narrowed concurrent support request.',
          ${approvalIdempotencyKey}, ${approvalCorrelationId}
        )
      `,
    );
  const [firstApproval, secondApproval] = await Promise.all([
    approve(first),
    approve(second),
  ]);
  const approvalOutcomes = [
    firstApproval[0]?.outcome,
    secondApproval[0]?.outcome,
  ].sort();
  if (
    JSON.stringify(approvalOutcomes) !==
      JSON.stringify(["created", "duplicate"]) ||
    firstApproval[0]?.resource_public_id !==
      secondApproval[0]?.resource_public_id
  ) {
    throw new Error(
      `support approval did not serialize exactly once: ${JSON.stringify({ firstApproval, secondApproval })}`,
    );
  }

  const revoke = (sql, organizationId, actorId, key) =>
    asSubject(
      sql,
      actorId,
      (transaction) => transaction`
        select * from loyalty.revoke_organization_agency_relationship_command_v1(
          ${organizationId}, ${relationship.public_id},
          ${relationship.lifecycle_revision},
          'Concurrent relationship termination exercise.',
          ${key}, ${randomUUID()}
        )
      `,
    );
  const revokeResults = await Promise.allSettled([
    revoke(
      first,
      fixture.client.public_id,
      clientOwnerId,
      `agency-race:revoke-client:${suffix}`,
    ),
    revoke(
      second,
      fixture.agency.public_id,
      agencyOwnerId,
      `agency-race:revoke-agency:${suffix}`,
    ),
  ]);
  const revokeSuccesses = revokeResults.filter(
    (result) => result.status === "fulfilled",
  );
  const staleFailures = revokeResults.filter(
    (result) => result.status === "rejected" && result.reason?.code === "40001",
  );

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty.organization_agency_relationships
       where client_organization_id = ${fixture.client.id}
         and agency_organization_id = ${fixture.agency.id}) as relationships,
      (select lifecycle_revision::integer
       from loyalty.organization_agency_relationships
       where client_organization_id = ${fixture.client.id}
         and agency_organization_id = ${fixture.agency.id}) as relationship_revision,
      (select status
       from loyalty.organization_agency_relationships
       where client_organization_id = ${fixture.client.id}
         and agency_organization_id = ${fixture.agency.id}) as relationship_status,
      (select count(*)::integer
       from loyalty.organization_support_access_requests
       where client_organization_id = ${fixture.client.id}) as support_requests,
      (select status
       from loyalty.organization_support_access_requests
       where client_organization_id = ${fixture.client.id}) as support_request_status,
      (select count(*)::integer
       from loyalty.support_access_grants
       where organization_id = ${fixture.client.id}
         and grant_version = '1') as support_grants,
      (select count(*)::integer
       from loyalty.support_access_grants
       where organization_id = ${fixture.client.id}
         and grant_version = '1' and revoked_at is null) as active_support_grants,
      (select count(*)::integer
       from loyalty.organization_memberships
       where organization_id = ${fixture.client.id}
         and user_id = ${agencyOwnerId} and revoked_at is null) as implied_memberships,
      (select count(*)::integer
       from loyalty.ledger_transactions
       where organization_id in (${fixture.client.id}, ${fixture.agency.id})) as ledger_transactions
  `;
  if (
    revokeSuccesses.length !== 1 ||
    staleFailures.length !== 1 ||
    state.relationships !== 1 ||
    state.relationship_revision !== 2 ||
    state.relationship_status !== "revoked" ||
    state.support_requests !== 1 ||
    state.support_request_status !== "revoked" ||
    state.support_grants !== 1 ||
    state.active_support_grants !== 0 ||
    state.implied_memberships !== 0 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `agency support concurrency did not reconcile: ${JSON.stringify({ revokeResults, state })}`,
    );
  }

  console.log(
    "Agency/support concurrency probe passed: exact acceptance and approval retries created one effect, competing bilateral revocations had one winner, support authority was revoked atomically, no membership was implied, and no ledger value changed.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
