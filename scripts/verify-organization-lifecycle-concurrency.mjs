import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });

async function asSubject(sql, subjectId, callback) {
  return sql.begin(async (transaction) => {
    await transaction`select set_config('request.jwt.claim.sub', ${subjectId}, true)`;
    return callback(transaction);
  });
}

try {
  const fixture = await admin.begin(async (sql) => {
    const ownerOne = randomUUID();
    const ownerTwo = randomUUID();
    const inviteeOne = randomUUID();
    const inviteeTwo = randomUUID();
    await sql`
      insert into auth.users (id, email)
      values
        (${ownerOne}, ${`lifecycle-owner-one-${suffix}@example.test`}),
        (${ownerTwo}, ${`lifecycle-owner-two-${suffix}@example.test`}),
        (${inviteeOne}, ${`lifecycle-invitee-one-${suffix}@example.test`}),
        (${inviteeTwo}, ${`lifecycle-invitee-two-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`lifecycle-race-${suffix}`}, 'Lifecycle Race')
      returning id, public_id
    `;
    const memberships = await sql`
      insert into loyalty.organization_memberships (
        organization_id, user_id, role, display_label
      ) values
        (${organization.id}, ${ownerOne}, 'owner', 'Owner one'),
        (${organization.id}, ${ownerTwo}, 'owner', 'Owner two')
      returning user_id, public_id, lifecycle_revision
    `;
    return {
      organization,
      ownerOne,
      ownerTwo,
      inviteeOne,
      inviteeTwo,
      memberships,
      tokenSha256: "a1".repeat(32),
    };
  });

  const membershipByUser = new Map(
    fixture.memberships.map((membership) => [membership.user_id, membership]),
  );
  const revokeOther = (sql, actor, target) => {
    const membership = membershipByUser.get(target);
    return asSubject(
      sql,
      actor,
      (transaction) => transaction`
      select * from loyalty.update_organization_member_command_v1(
        ${fixture.organization.public_id}, ${membership.public_id},
        ${membership.lifecycle_revision}, 'revoke', null,
        'Concurrent owner-quorum exercise.',
        ${`lifecycle-race:revoke:${actor}`}, ${randomUUID()}
      )
    `,
    );
  };
  const ownerResults = await Promise.allSettled([
    revokeOther(first, fixture.ownerOne, fixture.ownerTwo),
    revokeOther(second, fixture.ownerTwo, fixture.ownerOne),
  ]);
  const ownerSuccesses = ownerResults.filter(
    (result) => result.status === "fulfilled",
  );
  const ownerFailures = ownerResults.filter(
    (result) =>
      result.status === "rejected" &&
      ["42501", "23514"].includes(result.reason?.code),
  );

  const [survivingOwner] = await admin`
    select user_id
    from loyalty.organization_memberships
    where organization_id = ${fixture.organization.id}
      and role = 'owner'
      and revoked_at is null
  `;
  const [invitation] = await asSubject(
    admin,
    survivingOwner.user_id,
    (transaction) => transaction`
    select * from loyalty.create_organization_invitation_command_v1(
      ${fixture.organization.public_id}, 'Concurrent invitee', 'operator',
      statement_timestamp() + interval '2 days', ${fixture.tokenSha256},
      ${`lifecycle-race:invite:${suffix}`}, ${randomUUID()}
    )
  `,
  );

  const acceptInvite = (sql, actor, key) =>
    asSubject(
      sql,
      actor,
      (transaction) => transaction`
      select * from loyalty.accept_organization_invitation_command_v1(
        ${fixture.tokenSha256}, ${key}, ${randomUUID()}
      )
    `,
    );
  const inviteResults = await Promise.allSettled([
    acceptInvite(
      first,
      fixture.inviteeOne,
      `lifecycle-race:accept-one:${suffix}`,
    ),
    acceptInvite(
      second,
      fixture.inviteeTwo,
      `lifecycle-race:accept-two:${suffix}`,
    ),
  ]);
  const inviteSuccesses = inviteResults.filter(
    (result) => result.status === "fulfilled",
  );
  const inviteFailures = inviteResults.filter(
    (result) => result.status === "rejected" && result.reason?.code === "42501",
  );

  const [state] = await admin`
    select
      (select count(*)::integer from loyalty.organization_memberships
       where organization_id = ${fixture.organization.id}
         and role = 'owner' and revoked_at is null) as active_owners,
      (select count(*)::integer from loyalty.organization_memberships
       where organization_id = ${fixture.organization.id}
         and user_id in (${fixture.inviteeOne}, ${fixture.inviteeTwo})
         and revoked_at is null) as accepted_invitees,
      (select count(*)::integer from loyalty.organization_invitations
       where organization_id = ${fixture.organization.id}
         and public_id = ${invitation.resource_public_id}
         and status = 'accepted') as accepted_invitations,
      (select count(*)::integer from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'membership.revoke') as owner_revocations,
      (select count(*)::integer from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'invitation.accept') as invitation_acceptances,
      (select count(*)::integer from loyalty.ledger_transactions
       where organization_id = ${fixture.organization.id}) as ledger_transactions
  `;

  if (
    ownerSuccesses.length !== 1 ||
    ownerFailures.length !== 1 ||
    inviteSuccesses.length !== 1 ||
    inviteFailures.length !== 1 ||
    state.active_owners !== 1 ||
    state.accepted_invitees !== 1 ||
    state.accepted_invitations !== 1 ||
    state.owner_revocations !== 1 ||
    state.invitation_acceptances !== 1 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `organization lifecycle concurrency did not reconcile: ${JSON.stringify({ ownerResults, inviteResults, state })}`,
    );
  }

  console.log(
    "Organization lifecycle concurrency probe passed: competing owner revocations retained one live owner, competing invitation acceptances created one membership, audits reconcile, and no ledger value changed.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
