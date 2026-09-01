import { randomUUID } from "node:crypto";

import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const admin = postgres(connectionString, { max: 1, onnotice: () => {} });
const first = postgres(connectionString, { max: 1, onnotice: () => {} });
const second = postgres(connectionString, { max: 1, onnotice: () => {} });
const hash = (value) => Buffer.from(value.repeat(64).slice(0, 64), "hex");

try {
  const fixture = await admin.begin(async (sql) => {
    const actorId = randomUUID();
    await sql`
      insert into auth.users (id, email)
      values (${actorId}, ${`campaign-capacity-${suffix}@example.test`})
    `;
    const [organization] = await sql`
      insert into loyalty.organizations (slug, name)
      values (${`campaign-capacity-${suffix}`}, 'Campaign Capacity Probe')
      returning id
    `;
    const [group] = await sql`
      insert into loyalty.programme_groups (organization_id, slug, name)
      values (${organization.id}, 'probe', 'Campaign Capacity Group')
      returning id
    `;
    const [programme] = await sql`
      insert into loyalty.programmes (
        organization_id, programme_group_id, slug, name
      ) values (
        ${organization.id}, ${group.id}, 'probe', 'Campaign Capacity Programme'
      )
      returning id
    `;
    const programmeDefinition = {
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
          code: "purchase",
          name: "Purchase",
          source: "purchase",
          enabled: true,
          priority: 0,
          stackable: false,
          effect: { kind: "base_rate", pointsPerMajorUnit: "1" },
          conditions: {
            productIds: [],
            categoryIds: [],
            currencyCodes: [],
            markets: [],
            channels: [],
            activityCodes: [],
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
            perEventPoints: null,
            perMemberPoints: null,
            memberPeriod: null,
            rollingDays: null,
          },
        },
      ],
    };
    const [programmeVersion] = await sql`
      with configuration as (
        select ${programmeDefinition}::jsonb as value
      )
      select draft.programme_version_public_id as public_id,
        extensions.digest(
          convert_to(configuration.value::text, 'UTF8'), 'sha256'
        ) as configuration_sha256
      from configuration
      cross join lateral loyalty_private.create_programme_draft(
        ${organization.id}, ${programme.id}, configuration.value,
        extensions.digest(
          convert_to(configuration.value::text, 'UTF8'), 'sha256'
        ), ${actorId}
      ) as draft
    `;
    await sql`
      select loyalty_private.publish_programme_version(
        ${programmeVersion.public_id},
        ${programmeVersion.configuration_sha256},
        ${actorId}, statement_timestamp()
      )
    `;
    const customers = await sql`
      insert into loyalty.customers (organization_id, display_reference)
      values
        (${organization.id}, ${`campaign-first-${suffix}`}),
        (${organization.id}, ${`campaign-second-${suffix}`})
      returning id
    `;
    const wallets = [];
    for (const customer of customers) {
      const [wallet] = await sql`
        insert into loyalty.wallets (
          organization_id, programme_group_id, customer_id
        ) values (${organization.id}, ${group.id}, ${customer.id})
        returning id
      `;
      wallets.push(wallet);
    }
    const [audience] = await sql`
      insert into loyalty.audiences (
        organization_id, programme_group_id, code, created_by_user_id
      ) values (
        ${organization.id}, ${group.id}, 'all_members', ${actorId}
      ) returning id
    `;
    const audienceDefinition = {
      schemaVersion: "1",
      code: "all_members",
      name: "All members",
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
    const [audienceVersion] = await sql`
      insert into loyalty.audience_versions (
        organization_id, programme_group_id, audience_id, version_number,
        status, definition, definition_sha256, created_by_user_id
      ) values (
        ${organization.id}, ${group.id}, ${audience.id}, 1, 'draft',
        ${audienceDefinition},
        extensions.digest(
          convert_to((${audienceDefinition}::jsonb)::text, 'UTF8'), 'sha256'
        ),
        ${actorId}
      ) returning id, definition_sha256
    `;
    await sql`
      update loyalty.audience_versions
      set status = 'published', approved_by_user_id = ${actorId},
          published_at = clock_timestamp()
      where id = ${audienceVersion.id}
    `;
    const [snapshot] = await sql`
      insert into loyalty.audience_snapshots (
        organization_id, programme_group_id, audience_version_id, state,
        snapshot_at, member_count, definition_sha256, created_by_user_id,
        completed_at
      ) values (
        ${organization.id}, ${group.id}, ${audienceVersion.id}, 'complete',
        clock_timestamp(), 2, ${audienceVersion.definition_sha256},
        ${actorId}, clock_timestamp()
      ) returning id, public_id
    `;
    for (let index = 0; index < customers.length; index += 1) {
      await sql`
        insert into loyalty_private.audience_snapshot_members (
          organization_id, programme_group_id, audience_snapshot_id,
          customer_id, wallet_id, evaluation
        ) values (
          ${organization.id}, ${group.id}, ${snapshot.id},
          ${customers[index].id}, ${wallets[index].id},
          ${{ included: true }}
        )
      `;
    }
    const [campaign] = await sql`
      insert into loyalty.campaigns (
        organization_id, programme_group_id, programme_id, code,
        created_by_user_id
      ) values (
        ${organization.id}, ${group.id}, ${programme.id}, 'one_reward',
        ${actorId}
      ) returning id
    `;
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    const definition = {
      schemaVersion: "1",
      code: "one_reward",
      name: "One reward",
      description: "",
      audienceSnapshotId: snapshot.public_id,
      exclusionSnapshotIds: [],
      schedule: {
        timezone: "UTC",
        startsAt,
        startsLocal: startsAt.slice(0, 19),
        endsAt,
        endsLocal: endsAt.slice(0, 19),
      },
      behavior: {
        kind: "tier",
        movement: "entry",
        tierCodes: ["rose"],
        reward: { kind: "points", points: "25" },
      },
      capacity: {
        globalEffectLimit: "1",
        perMemberEffectLimit: 1,
        maximumPoints: "25",
        maximumLiabilityMinor: null,
        liabilityMinorPerEffect: null,
        liabilityCurrencyCode: null,
        liabilityMinorUnitDigits: null,
      },
      controlBasisPoints: 0,
    };
    const [version] = await sql`
      insert into loyalty.campaign_versions (
        organization_id, programme_group_id, campaign_id, version_number,
        status, definition, definition_sha256, created_by_user_id
      ) values (
        ${organization.id}, ${group.id}, ${campaign.id}, 1, 'draft',
        ${definition},
        extensions.digest(
          convert_to((${definition}::jsonb)::text, 'UTF8'), 'sha256'
        ),
        ${actorId}
      ) returning id, public_id
    `;
    const assignmentHash = hash("a");
    await sql`
      insert into loyalty_private.campaign_controls (
        organization_id, programme_group_id, campaign_version_id,
        assignment_salt, assignment_sha256
      ) values (
        ${organization.id}, ${group.id}, ${version.id}, ${hash("b")},
        ${assignmentHash}
      )
    `;
    for (let index = 0; index < customers.length; index += 1) {
      await sql`
        insert into loyalty_private.campaign_assignments (
          organization_id, programme_group_id, campaign_version_id,
          audience_snapshot_id, customer_id, wallet_id, assignment,
          assignment_evidence_sha256
        ) values (
          ${organization.id}, ${group.id}, ${version.id}, ${snapshot.id},
          ${customers[index].id}, ${wallets[index].id}, 'treatment',
          ${hash(String(index + 1))}
        )
      `;
    }
    const replacementProgrammeDefinition = {
      ...programmeDefinition,
      tiers: [
        {
          code: "bloom",
          name: "Bloom",
          minimumEligibleSpendMinor: "0",
          pointsPerMajorUnit: "1",
        },
      ],
    };
    const [replacementProgrammeVersion] = await sql`
      with configuration as (
        select ${replacementProgrammeDefinition}::jsonb as value
      )
      select draft.programme_version_public_id as public_id,
        extensions.digest(
          convert_to(configuration.value::text, 'UTF8'), 'sha256'
        ) as configuration_sha256
      from configuration
      cross join lateral loyalty_private.create_programme_draft(
        ${organization.id}, ${programme.id}, configuration.value,
        extensions.digest(
          convert_to(configuration.value::text, 'UTF8'), 'sha256'
        ), ${actorId}
      ) as draft
    `;
    return {
      actorId,
      organizationId: organization.id,
      groupId: group.id,
      programmeId: programme.id,
      replacementProgrammeVersion,
      campaignVersionInternalId: version.id,
      campaignVersionId: version.public_id,
      assignmentHash,
      firstCustomerId: customers[0].id,
      secondCustomerId: customers[1].id,
    };
  });

  let allowApprovalCommit;
  let markApprovalReady;
  const approvalReady = new Promise((resolve) => {
    markApprovalReady = resolve;
  });
  const approvalCommitGate = new Promise((resolve) => {
    allowApprovalCommit = resolve;
  });
  const campaignApproval = first.begin(async (sql) => {
    await sql`
      update loyalty.campaign_versions
      set status = 'scheduled', approved_by_user_id = ${fixture.actorId},
          approved_at = clock_timestamp(), status_changed_at = clock_timestamp(),
          eligible_member_count = 2, treatment_member_count = 2,
          control_member_count = 0,
          assignment_sha256 = ${fixture.assignmentHash}
      where id = ${fixture.campaignVersionInternalId}
    `;
    markApprovalReady();
    await approvalCommitGate;
  });
  await approvalReady;

  let publicationBackendPid;
  let markPublicationStarted;
  const publicationStarted = new Promise((resolve) => {
    markPublicationStarted = resolve;
  });
  const competingPublication = second
    .begin(async (sql) => {
      const [backend] = await sql`select pg_backend_pid() as pid`;
      publicationBackendPid = backend.pid;
      markPublicationStarted();
      await sql`
        select loyalty_private.publish_programme_version(
          ${fixture.replacementProgrammeVersion.public_id},
          ${fixture.replacementProgrammeVersion.configuration_sha256},
          ${fixture.actorId}, statement_timestamp()
        )
      `;
    })
    .then(
      () => ({ error: undefined }),
      (error) => ({ error }),
    );
  await publicationStarted;

  let publicationWaitedForProgramme = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [activity] = await admin`
      select wait_event_type, wait_event
      from pg_stat_activity
      where pid = ${publicationBackendPid}
    `;
    if (activity?.wait_event_type === "Lock") {
      publicationWaitedForProgramme = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  allowApprovalCommit();
  await campaignApproval;

  const { error: publicationError } = await competingPublication;
  if (!publicationWaitedForProgramme) {
    throw new Error(
      "campaign approval did not serialize a competing programme publication",
    );
  }
  if (
    publicationError?.code !== "23514" ||
    publicationError?.message !==
      "campaign tiers must exist in the published programme"
  ) {
    throw new Error(
      `competing programme publication did not fail closed: ${publicationError?.message ?? "no error"}`,
    );
  }
  const [programmeState] = await admin`
    select
      count(*) filter (where status = 'published')::integer as published_versions,
      count(*) filter (
        where public_id = ${fixture.replacementProgrammeVersion.public_id}
          and status = 'draft'
      )::integer as replacement_drafts
    from loyalty.programme_versions
    where organization_id = ${fixture.organizationId}
      and programme_id = ${fixture.programmeId}
  `;
  if (
    programmeState.published_versions !== 1 ||
    programmeState.replacement_drafts !== 1
  ) {
    throw new Error(
      `competing programme publication did not roll back atomically: ${JSON.stringify(programmeState)}`,
    );
  }

  let allowFirstCommit;
  let markFirstReserved;
  const firstReserved = new Promise((resolve) => {
    markFirstReserved = resolve;
  });
  const commitGate = new Promise((resolve) => {
    allowFirstCommit = resolve;
  });
  const firstKey = `campaign-capacity:first:${suffix}`;

  const firstReservation = first.begin(async (sql) => {
    const rows = await sql`
      select * from loyalty_private.reserve_campaign_capacity_v1(
        ${fixture.organizationId}, ${fixture.groupId},
        ${fixture.campaignVersionId}, ${fixture.firstCustomerId},
        ${`milestone:first:${suffix}`}, ${firstKey}, ${hash("c")},
        clock_timestamp()
      )
    `;
    markFirstReserved();
    await commitGate;
    return rows;
  });

  await firstReserved;
  const competingReservation = second`
    select * from loyalty_private.reserve_campaign_capacity_v1(
      ${fixture.organizationId}, ${fixture.groupId},
      ${fixture.campaignVersionId}, ${fixture.secondCustomerId},
      ${`milestone:second:${suffix}`},
      ${`campaign-capacity:second:${suffix}`}, ${hash("d")},
      clock_timestamp()
    )
  `;
  setTimeout(allowFirstCommit, 100);

  const [firstResult, competingResult] = await Promise.all([
    firstReservation,
    competingReservation,
  ]);
  if (
    firstResult[0]?.outcome !== "created" ||
    competingResult[0]?.outcome !== "capacity_exhausted"
  ) {
    throw new Error(
      `campaign capacity race returned unexpected outcomes: ${JSON.stringify({ firstResult, competingResult })}`,
    );
  }

  const [retry] = await admin`
    select * from loyalty_private.reserve_campaign_capacity_v1(
      ${fixture.organizationId}, ${fixture.groupId},
      ${fixture.campaignVersionId}, ${fixture.firstCustomerId},
      ${`milestone:first:${suffix}`}, ${firstKey}, ${hash("c")},
      clock_timestamp()
    )
  `;
  if (retry.outcome !== "duplicate") {
    throw new Error("exact campaign-capacity retry was not idempotent");
  }

  const [state] = await admin`
    select
      (select count(*)::integer
       from loyalty_private.campaign_capacity_allocations
       where organization_id = ${fixture.organizationId}) as allocations,
      counter.reserved_effects::integer as reserved_effects,
      counter.committed_effects::integer as committed_effects,
      counter.reserved_points::integer as reserved_points,
      counter.committed_points::integer as committed_points
    from loyalty_private.campaign_capacity_counters as counter
    where counter.organization_id = ${fixture.organizationId}
  `;
  if (
    state.allocations !== 1 ||
    state.reserved_effects !== 1 ||
    state.committed_effects !== 0 ||
    state.reserved_points !== 25 ||
    state.committed_points !== 0
  ) {
    throw new Error(
      `campaign capacity race did not reconcile: ${JSON.stringify(state)}`,
    );
  }

  console.log(
    "Campaign concurrency probe passed: campaign approval serialized with programme publication and preserved the accepted selector, two capacity sessions serialized on one campaign, exactly one reservation consumed the global points budget, the competitor observed exhaustion, the retry was idempotent, and counters reconcile.",
  );
} finally {
  await Promise.allSettled([admin.end(), first.end(), second.end()]);
}
