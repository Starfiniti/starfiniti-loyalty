import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const ownerId = randomUUID();
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });

async function asOwner(sql, callback) {
  return sql.begin(async (transaction) => {
    await transaction`set local role authenticated`;
    await transaction`select set_config('request.jwt.claim.sub', ${ownerId}, true)`;
    return callback(transaction);
  });
}

try {
  const fixture = await admin.begin(async (sql) => {
    await sql`
      insert into auth.users (id, email)
      values (${ownerId}, ${`scim-race-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`scim-race-${suffix}`}, 'SCIM Concurrency Probe')
      returning id, public_id
    `;
    await sql`
      insert into loyalty.organization_memberships (
        organization_id, user_id, role, display_label
      ) values (${organization.id}, ${ownerId}, 'owner', 'SCIM race owner')
    `;
    const sourceToken = `scimrace${suffix}`.slice(0, 20);
    const [source] = await sql`
      insert into loyalty.organization_federation_sources (
        organization_id, display_name, protocol, status, lifecycle_revision,
        discovery_url, client_id, upstream_secret_sha256,
        broker_secret_sha256, configuration_sha256, document_sha256,
        validated_issuer, authorization_endpoint, token_endpoint, jwks_uri,
        signing_fingerprints, validated_at, authentik_source_slug,
        authentik_source_public_id, authentik_provider_id,
        supabase_provider_identifier, external_outcome,
        created_by_user_id, updated_by_user_id
      ) values (
        ${organization.id}, 'SCIM race OIDC', 'oidc', 'enabled', 2,
        'https://id.example.test/.well-known/openid-configuration',
        'loyalty-scim-race', ${Buffer.from("a".repeat(64), "hex")},
        ${Buffer.from("b".repeat(64), "hex")},
        ${Buffer.from("c".repeat(64), "hex")},
        ${Buffer.from("d".repeat(64), "hex")},
        'https://id.example.test/', 'https://id.example.test/authorize',
        'https://id.example.test/token', 'https://id.example.test/jwks',
        ${sql.json(["e".repeat(64)])}, now(),
        ${`loyalty-${sourceToken}`}, ${randomUUID()},
        ${900_000_000 + Number.parseInt(suffix.slice(0, 6), 16)},
        ${`custom:loyalty-${sourceToken}`}, 'succeeded', ${ownerId}, ${ownerId}
      )
      returning id, public_id
    `;
    return { organization, source };
  });

  const idempotencyKey = `scim-race:create:${suffix}`;
  const credentialDigest = Buffer.from("1".repeat(64), "hex");
  const createEndpoint = (sql) =>
    asOwner(
      sql,
      (transaction) => transaction`
      select * from loyalty.create_organization_scim_endpoint_command_v1(
        ${fixture.organization.public_id}, ${fixture.source.public_id},
        'Concurrent directory', ${credentialDigest}, ${idempotencyKey},
        ${randomUUID()}
      )
    `,
    );

  let releaseFirst;
  let markFirstComplete;
  const firstComplete = new Promise((resolve) => {
    markFirstComplete = resolve;
  });
  const commitGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstCreate = first.begin(async (transaction) => {
    await transaction`set local role authenticated`;
    await transaction`select set_config('request.jwt.claim.sub', ${ownerId}, true)`;
    const rows = await transaction`
      select * from loyalty.create_organization_scim_endpoint_command_v1(
        ${fixture.organization.public_id}, ${fixture.source.public_id},
        'Concurrent directory', ${credentialDigest}, ${idempotencyKey},
        ${randomUUID()}
      )
    `;
    markFirstComplete();
    await commitGate;
    return rows;
  });
  await firstComplete;
  const secondCreate = createEndpoint(second);
  setTimeout(releaseFirst, 100);
  const [firstRows, secondRows] = await Promise.all([
    firstCreate,
    secondCreate,
  ]);
  const createOutcomes = [firstRows[0]?.outcome, secondRows[0]?.outcome].sort();
  if (
    JSON.stringify(createOutcomes) !==
      JSON.stringify(["created", "duplicate"]) ||
    firstRows[0]?.endpoint_public_id !== secondRows[0]?.endpoint_public_id
  ) {
    throw new Error(
      `SCIM endpoint creation did not serialize exactly once: ${JSON.stringify({ firstRows, secondRows })}`,
    );
  }

  const [directory] = await admin`
    select id, public_id from loyalty.organization_scim_endpoints
    where organization_id = ${fixture.organization.id}
      and public_id = ${firstRows[0].endpoint_public_id}
  `;
  const [group] = await admin`
    insert into loyalty.organization_scim_groups (
      organization_id, endpoint_id, external_id, display_name,
      representation_sha256
    ) values (
      ${fixture.organization.id}, ${directory.id}, ${`race-group-${suffix}`},
      'Concurrent role group', ${Buffer.from("2".repeat(64), "hex")}
    ) returning public_id, lifecycle_revision
  `;

  const mapRole = (sql, role) =>
    asOwner(
      sql,
      (transaction) => transaction`
      select * from loyalty.map_organization_scim_group_role_command_v1(
        ${fixture.organization.public_id}, ${directory.public_id},
        ${group.public_id}, ${group.lifecycle_revision}, ${role},
        'Concurrent reviewed role mapping.',
        ${`scim-race:map:${role}:${suffix}`}, ${randomUUID()}
      )
    `,
    );
  const roleResults = await Promise.allSettled([
    mapRole(first, "operator"),
    mapRole(second, "analyst"),
  ]);
  const roleSuccesses = roleResults.filter(
    (result) => result.status === "fulfilled",
  );
  const staleFailures = roleResults.filter(
    (result) => result.status === "rejected" && result.reason?.code === "40001",
  );

  const [state] = await admin`
    select
      (select count(*)::integer from loyalty.organization_scim_endpoints
       where organization_id = ${fixture.organization.id}) as endpoints,
      (select count(*)::integer from loyalty.organization_scim_credential_revisions
       where organization_id = ${fixture.organization.id}) as credential_revisions,
      (select count(*)::integer from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'scim.endpoint.create') as endpoint_audits,
      (select lifecycle_revision::integer from loyalty.organization_scim_groups
       where organization_id = ${fixture.organization.id}
         and public_id = ${group.public_id}) as group_revision,
      (select count(*)::integer from loyalty.admin_audit_events
       where organization_id = ${fixture.organization.id}
         and action = 'scim.group.map_role') as mapping_audits,
      (select count(*)::integer from loyalty.ledger_transactions
       where organization_id = ${fixture.organization.id}) as ledger_transactions
  `;
  if (
    roleSuccesses.length !== 1 ||
    staleFailures.length !== 1 ||
    state.endpoints !== 1 ||
    state.credential_revisions !== 1 ||
    state.endpoint_audits !== 1 ||
    state.group_revision !== 2 ||
    state.mapping_audits !== 1 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `SCIM concurrency evidence did not reconcile: ${JSON.stringify({ roleResults, state })}`,
    );
  }

  console.log(
    "SCIM concurrency probe passed: exact endpoint retries created one digest-only endpoint, competing role mappings produced one winner and one stale failure, audits reconcile, and no ledger value changed.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
