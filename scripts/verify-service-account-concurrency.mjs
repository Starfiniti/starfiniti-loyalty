import { createHash, randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });
const quota = postgres(connectionString, { max: 12, onnotice: () => {} });
const digest = (value) => createHash("sha256").update(value).digest();

try {
  const fixture = await admin.begin(async (sql) => {
    const actorId = randomUUID();
    await sql`
      insert into auth.users (id, email)
      values (${actorId}, ${`service-race-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`service-race-${suffix}`}, 'Service API Race')
      returning id, public_id
    `;
    await sql`
      insert into loyalty.organization_memberships (
        organization_id, user_id, role
      ) values (${organization.id}, ${actorId}, 'owner')
    `;
    const [workspace] = await sql`
      insert into loyalty.workspaces (organization_id, slug, name)
      values (${organization.id}, 'primary', 'Primary store')
      returning id, public_id
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (organization_id, slug, name)
      values (${organization.id}, 'rewards', 'Service Race Rewards')
      returning id
    `;
    await sql`
      insert into loyalty.programme_group_workspaces (
        organization_id, programme_group_id, workspace_id
      ) values (${organization.id}, ${group.id}, ${workspace.id})
    `;
    const [programme] = await sql`
      insert into loyalty.programmes (
        organization_id, programme_group_id, slug, name, status
      ) values (
        ${organization.id}, ${group.id}, 'rewards',
        'Service Race Programme', 'active'
      ) returning id, public_id
    `;
    const definition = {
      version: "2",
      currencyCode: "EUR",
      currencyMinorUnitDigits: 2,
      pendingDays: 0,
      pointsExpireAfterDays: 365,
      tiers: [
        {
          code: "rose",
          name: "Rose",
          minimumEligibleSpendMinor: "0",
          pointsPerMajorUnit: "1",
        },
      ],
      rewards: [],
      earningRules: [
        {
          code: "consultation",
          name: "Consultation",
          source: "custom_activity",
          enabled: true,
          priority: 10,
          stackable: true,
          effect: { kind: "fixed_bonus", points: "25" },
          conditions: {
            productIds: [],
            categoryIds: [],
            currencyCodes: [],
            markets: [],
            channels: [],
            activityCodes: ["consultation"],
            segmentCodes: [],
            tierCodes: [],
            startsAt: null,
            endsAt: null,
          },
          purchaseExclusions: {
            productIds: [],
            categoryIds: [],
            shipping: true,
            tax: true,
            fees: true,
            giftCardPayments: true,
            storeCreditPayments: true,
            discounts: true,
          },
          cap: {
            perEventPoints: "25",
            perMemberPoints: null,
            memberPeriod: null,
            rollingDays: null,
          },
        },
      ],
    };
    const [draft] = await sql`
      with configuration as (select ${definition}::jsonb as value)
      select created.programme_version_public_id as public_id,
        extensions.digest(
          convert_to(configuration.value::text, 'UTF8'), 'sha256'
        ) as configuration_sha256
      from configuration
      cross join lateral loyalty_private.create_programme_draft(
        ${organization.id}, ${programme.id}, configuration.value,
        extensions.digest(
          convert_to(configuration.value::text, 'UTF8'), 'sha256'
        ), ${actorId}
      ) as created
    `;
    await sql`
      select loyalty_private.publish_programme_version(
        ${draft.public_id}, ${draft.configuration_sha256}, ${actorId},
        statement_timestamp()
      )
    `;
    const createAccount = (displayName, quotaLimit, idempotencyKey) => sql`
      select * from loyalty_private.create_service_account_v1(
        ${actorId}, ${workspace.public_id}, ${programme.public_id},
        ${displayName}, ${["customers:write"]}::text[], ${quotaLimit},
        ${idempotencyKey}, ${randomUUID()}
      )
    `;
    const [raceAccount] = await createAccount(
      "Customer race",
      100,
      `service-race-account:${suffix}`,
    );
    const raceCredentialId = randomUUID();
    const raceDigest = digest(`service-race-token:${suffix}`);
    await sql`
      select * from loyalty_private.issue_service_account_credential_v1(
        ${actorId}, ${raceAccount.service_account_public_id},
        ${raceCredentialId}, ${raceDigest}, 'raceAA', 0,
        ${`service-race-credential:${suffix}`}, ${randomUUID()}
      )
    `;
    const [quotaAccount] = await createAccount(
      "Quota race",
      10,
      `service-quota-account:${suffix}`,
    );
    const quotaCredentialId = randomUUID();
    const quotaDigest = digest(`service-quota-token:${suffix}`);
    await sql`
      select * from loyalty_private.issue_service_account_credential_v1(
        ${actorId}, ${quotaAccount.service_account_public_id},
        ${quotaCredentialId}, ${quotaDigest}, 'quotaA', 0,
        ${`service-quota-credential:${suffix}`}, ${randomUUID()}
      )
    `;
    return {
      organization,
      raceAccount,
      raceCredentialId,
      raceDigest,
      quotaAccount,
      quotaCredentialId,
      quotaDigest,
    };
  });

  const upsertRace = (sql) => sql`
    select * from loyalty_private.upsert_service_customer_v1(
      ${fixture.raceCredentialId}, ${fixture.raceDigest},
      ${`customer-${suffix}`}, ${`customer-race:${suffix}`}, ${randomUUID()}
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
    const rows = await upsertRace(sql);
    markFirstComplete();
    await commitGate;
    return rows;
  });
  await firstComplete;
  const secondCommand = second.begin((sql) => upsertRace(sql));
  setTimeout(releaseFirst, 100);
  const [firstRows, secondRows] = await Promise.all([
    firstCommand,
    secondCommand,
  ]);
  const customerOutcomes = [
    firstRows[0]?.outcome,
    secondRows[0]?.outcome,
  ].sort();
  if (
    JSON.stringify(customerOutcomes) !==
      JSON.stringify(["created", "duplicate"]) ||
    firstRows[0]?.customer_public_id !== secondRows[0]?.customer_public_id
  ) {
    throw new Error(
      `service customer race did not serialize exactly once: ${JSON.stringify({ firstRows, secondRows })}`,
    );
  }

  // Keep the fixed-window assertion deterministic when CI reaches this probe
  // immediately before a UTC minute boundary. Production behavior is still
  // clock-derived; this wait only prevents one synthetic burst spanning two
  // legitimate windows.
  const millisecondsIntoMinute = Date.now() % 60_000;
  if (millisecondsIntoMinute >= 50_000) {
    await new Promise((resolve) =>
      setTimeout(resolve, 60_500 - millisecondsIntoMinute),
    );
  }

  const quotaResults = await Promise.allSettled(
    Array.from(
      { length: 12 },
      (_, index) =>
        quota`
        select * from loyalty_private.upsert_service_customer_v1(
          ${fixture.quotaCredentialId}, ${fixture.quotaDigest},
          ${`quota-customer-${suffix}-${index}`},
          ${`quota-race:${suffix}:${index}`}, ${randomUUID()}
        )
      `,
    ),
  );
  const acceptedQuota = quotaResults.filter(
    (result) => result.status === "fulfilled",
  ).length;
  const rejectedQuota = quotaResults.filter(
    (result) =>
      result.status === "rejected" &&
      result.reason?.code === "P0001" &&
      String(result.reason?.message).includes("rate limit exceeded"),
  ).length;
  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.service_customer_identities as identity
       where identity.organization_id = ${fixture.organization.id}
         and identity.service_account_id = (
           select id from loyalty.service_accounts
           where public_id = ${fixture.raceAccount.service_account_public_id}
         )) as race_identities,
      (select count(*)::integer
       from loyalty_private.service_customer_command_receipts as receipt
       where receipt.organization_id = ${fixture.organization.id}
         and receipt.service_account_id = (
           select id from loyalty.service_accounts
           where public_id = ${fixture.raceAccount.service_account_public_id}
         )) as race_receipts,
      (select count(*)::integer
       from loyalty_private.service_customer_identities as identity
       where identity.organization_id = ${fixture.organization.id}
         and identity.service_account_id = (
           select id from loyalty.service_accounts
           where public_id = ${fixture.quotaAccount.service_account_public_id}
         )) as quota_identities,
      (select request_count
       from loyalty_private.service_account_rate_windows as window
       join loyalty_private.service_account_credentials as credential
         on credential.id = window.credential_id
       where credential.public_id = ${fixture.quotaCredentialId}) as quota_count,
      (select count(*)::integer from loyalty.ledger_transactions
       where organization_id = ${fixture.organization.id}) as ledger_transactions
  `;
  if (
    acceptedQuota !== 10 ||
    rejectedQuota !== 2 ||
    state.race_identities !== 1 ||
    state.race_receipts !== 1 ||
    state.quota_identities !== 10 ||
    state.quota_count !== 10 ||
    state.ledger_transactions !== 0
  ) {
    throw new Error(
      `service API concurrency did not reconcile: ${JSON.stringify({ acceptedQuota, rejectedQuota, state })}`,
    );
  }

  console.log(
    "Service API concurrency probe passed: two customer writers serialized to one HMAC identity and receipt, twelve concurrent quota consumers admitted exactly ten, and all customer, quota, and zero-ledger projections reconcile.",
  );
} finally {
  await Promise.allSettled([
    admin.end(),
    first.end(),
    second.end(),
    quota.end(),
  ]);
}
