import { describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  programmeDefinitionV2,
  wooCommerceOrderFactV1,
} from "@starfiniti/contracts";
import {
  advanceCampaignLifecycle,
  calculateCumulativeRefundPlan,
  calculateCumulativeRefundPlanV2,
  evidenceSha256,
  expireDueTierOverrides,
  runCampaignTriggerLifecycle,
  runPointExpiryLifecycle,
  runReferralRewardLifecycle,
  parseWooCommerceEffect,
  preparePurchaseCurrencyV1,
  processWooCommerceEffect,
  toOrderAwardFact,
  toPurchaseEarningFactV2,
  type ClaimedEffect,
} from "./processor";

const event: ClaimedEffect = {
  canonical_event_id: "1",
  canonical_event_public_id: "00000000-0000-4000-8000-000000000001",
  organization_id: "1",
  connection_id: "1",
  programme_id: "1",
  event_type: "commerce.order.status_changed",
  source_event_id: "order:42:completed",
  source_object_id: "42",
  occurred_at: "2026-08-12T10:00:00Z",
  attempt_count: 1,
  payload: {
    kind: "order_status_changed",
    previousStatus: "processing",
    order: {
      kind: "order",
      orderId: "42",
      status: "completed",
      currency: "EUR",
      currencyMinorUnitDigits: 2,
      market: "SI",
      customer: { kind: "registered", externalCustomerId: "7" },
      paymentKind: "money",
      lines: [],
      shippingTotal: "0.00",
      taxTotal: "0.00",
      feeTotal: "0.00",
      discountTotal: "0.00",
      refundedTotal: "0.00",
    },
  },
};

const referralProgrammeConfiguration = {
  version: "2",
  currencyCode: "EUR",
  currencyMinorUnitDigits: 2,
  pendingDays: 30,
  pointsExpireAfterDays: 365,
  tiers: [
    {
      code: "rose",
      name: "Rose",
      minimumEligibleSpendMinor: "0",
      pointsPerMajorUnit: "5",
    },
  ],
  rewards: [],
  earningRules: [
    {
      code: "purchase-base",
      name: "Base purchase points",
      source: "purchase",
      enabled: true,
      priority: 0,
      stackable: false,
      effect: { kind: "base_rate", pointsPerMajorUnit: "5" },
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
  referralPolicy: {
    version: "1",
    attributionWindowDays: 30,
    qualificationStatus: "processing",
    coolingDays: 14,
    minimumEligibleSpendMinor: "2500",
    requireNewCustomer: true,
    monthlyAdvocateReferralLimit: 10,
    advocateReward: { kind: "points", points: "500" },
    friendReward: { kind: "points", points: "250" },
    risk: {
      manualReviewEnabled: true,
      rollingWindowHours: 24,
      sourceNetworkReferralLimit: 2,
      deviceReferralLimit: 2,
    },
  },
} as const;

describe("WooCommerce effect worker", () => {
  it("converts foreign facts once and reuses the award evidence for refunds", async () => {
    const conversionContext = {
      version: "1",
      policy: {
        version: "1",
        policyVersionId: "99000000-0000-4000-8000-000000000001",
        revision: 1,
        programmeVersionId: "99000000-0000-4000-8000-000000000002",
        state: "enabled",
        providerKey: "verified-test-feed",
        sourceCurrencyCode: "USD",
        sourceMinorUnitDigits: 2,
        baseCurrencyCode: "EUR",
        baseMinorUnitDigits: 2,
        maxRateAgeSeconds: 86_400,
        roundingMode: "half_away_from_zero",
        effectiveFrom: "2026-08-12T00:00:00.000Z",
      },
      snapshot: {
        version: "1",
        rateSnapshotId: "99000000-0000-4000-8000-000000000003",
        providerKey: "verified-test-feed",
        providerRateReference: "usd-eur-2026-08-12",
        sourceCurrencyCode: "USD",
        sourceMinorUnitDigits: 2,
        baseCurrencyCode: "EUR",
        baseMinorUnitDigits: 2,
        rateNumerator: "85",
        rateDenominator: "100",
        observedAt: "2026-08-12T09:00:00.000Z",
        validFrom: "2026-08-12T09:00:00.000Z",
        validUntil: "2026-08-13T09:00:00.000Z",
        payloadSha256: "a".repeat(64),
      },
    } as const;
    const recordedValues: unknown[][] = [];
    const resolvedValues: unknown[][] = [];
    const query = async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      const text = strings.join("?");
      if (text.includes("resolve_currency_conversion_context_v1")) {
        resolvedValues.push(values);
        expect(values).toContain("USD");
        return [{ conversion_context: conversionContext }];
      }
      if (text.includes("record_currency_conversion_evidence_v1")) {
        recordedValues.push(values);
        return [
          {
            conversion_evidence_public_id:
              recordedValues.length === 1
                ? "99000000-0000-4000-8000-000000000004"
                : "99000000-0000-4000-8000-000000000005",
            outcome: "created",
          },
        ];
      }
      throw new Error(`Unexpected query: ${text}`);
    };
    const order = wooCommerceOrderFactV1.parse({
      kind: "order",
      orderId: "42",
      status: "completed",
      currency: "USD",
      currencyMinorUnitDigits: 2,
      market: "US",
      customer: { kind: "registered", externalCustomerId: "7" },
      paymentKind: "money",
      lines: [
        {
          lineId: "1",
          productId: "10",
          variationId: null,
          quantity: "1",
          categoryIds: ["20"],
          collectionIds: [],
          subtotal: "10.00",
          total: "8.00",
          refundedTotal: "1.00",
        },
      ],
      shippingTotal: "2.00",
      shippingRefundedTotal: "0.50",
      taxTotal: "1.00",
      taxRefundedTotal: "0.00",
      feeTotal: "0.00",
      feeRefundedTotal: "0.00",
      discountTotal: "2.00",
      refundedTotal: "1.50",
    });
    const prepared = await preparePurchaseCurrencyV1(
      query as unknown as Sql,
      event,
      {
        definitionVersion: "2",
        programmeGroupId: "1",
        programmeVersionId: "2",
        tierCode: "rose",
        programme: programmeDefinitionV2.parse(referralProgrammeConfiguration),
      },
      order,
      "rose",
      {},
      true,
    );

    expect(prepared.fact).toMatchObject({
      currencyCode: "EUR",
      sourceCurrencyCode: "USD",
      sourceCurrencyMinorUnitDigits: 2,
      shippingMinor: "170",
      shippingRefundedMinor: "43",
      taxMinor: "85",
      lines: [
        {
          grossMinor: "850",
          discountMinor: "170",
          refundedMinor: "85",
        },
      ],
    });
    expect(prepared.conversion).toMatchObject({
      evidenceId: "99000000-0000-4000-8000-000000000004",
      sourceCurrencyCode: "USD",
      baseCurrencyCode: "EUR",
      rateNumerator: "85",
      rateDenominator: "100",
    });
    expect(recordedValues).toHaveLength(1);
    const serializedAmounts = recordedValues[0]?.find(
      (value) => typeof value === "string" && value.includes("line:0:gross"),
    );
    expect(serializedAmounts).toEqual(expect.any(String));
    expect(JSON.parse(String(serializedAmounts))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountKey: "line:0:gross",
          sourceAmountMinor: "1000",
          baseAmountMinor: "850",
        }),
        expect.objectContaining({
          amountKey: "order:shipping_refunded",
          sourceAmountMinor: "50",
          baseAmountMinor: "43",
        }),
      ]),
    );

    const refundPrepared = await preparePurchaseCurrencyV1(
      query as unknown as Sql,
      {
        ...event,
        canonical_event_id: "2",
        canonical_event_public_id: "99000000-0000-4000-8000-000000000006",
        event_type: "commerce.order.refunded",
        source_event_id: "order:42:refund:one",
      },
      {
        definitionVersion: "2",
        programmeGroupId: "1",
        programmeVersionId: "2",
        tierCode: "rose",
        programme: programmeDefinitionV2.parse(referralProgrammeConfiguration),
      },
      order,
      "rose",
      {},
      true,
      "99000000-0000-4000-8000-000000000004",
    );
    expect(refundPrepared.conversion?.evidenceId).toBe(
      "99000000-0000-4000-8000-000000000005",
    );
    expect(resolvedValues).toHaveLength(2);
    expect(resolvedValues[1]).toContain("99000000-0000-4000-8000-000000000004");
    expect(recordedValues).toHaveLength(2);
    expect(recordedValues[1]).toContain("99000000-0000-4000-8000-000000000004");
  });

  it("fails closed before value evaluation when foreign evidence is unavailable", async () => {
    const query = (async () => []) as unknown as Sql;
    const order = wooCommerceOrderFactV1.parse({
      ...(event.payload as { order: Record<string, unknown> }).order,
      currency: "USD",
      currencyMinorUnitDigits: 2,
    });
    await expect(
      preparePurchaseCurrencyV1(
        query,
        event,
        {
          definitionVersion: "2",
          programmeGroupId: "1",
          programmeVersionId: "2",
          tierCode: "rose",
          programme: programmeDefinitionV2.parse(
            referralProgrammeConfiguration,
          ),
        },
        order,
        "rose",
        {},
        false,
      ),
    ).rejects.toThrow("currency_conversion_evidence_unavailable");
  });

  it("runs the bounded point expiry lifecycle and validates aggregate output", async () => {
    const validSql = (async () => [
      {
        expiry_batches: "2",
        expired_lots: "3",
        expired_points: "9223372036854775807",
        notifications_enqueued: "4",
      },
    ]) as unknown as Sql;
    await expect(runPointExpiryLifecycle(validSql)).resolves.toEqual({
      expiryBatches: 2,
      expiredLots: 3,
      expiredPoints: "9223372036854775807",
      notificationsEnqueued: 4,
    });

    const invalidSql = (async () => [
      {
        expiry_batches: "101",
        expired_lots: "3",
        expired_points: "-1",
        notifications_enqueued: "0",
      },
    ]) as unknown as Sql;
    await expect(runPointExpiryLifecycle(invalidSql)).rejects.toThrow(
      "invalid_point_expiry_lifecycle_result",
    );
  });

  it("runs the bounded tier override expiry sweep and rejects malformed counts", async () => {
    const validSql = (async () => [{ expired_count: "2" }]) as unknown as Sql;
    expect(await expireDueTierOverrides(validSql)).toBe(2);

    const invalidSql = (async () => [
      { expired_count: "51" },
    ]) as unknown as Sql;
    await expect(expireDueTierOverrides(invalidSql)).rejects.toThrow(
      "invalid_tier_override_expiry_count",
    );
  });

  it("settles bounded referral reward leases without leaking exception details", async () => {
    let issueCalls = 0;
    const query = async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("claim_due_referral_reward_jobs_v1")) {
        return [
          {
            job_id: "10000000-0000-4000-8000-000000000001",
            attribution_id: "20000000-0000-4000-8000-000000000001",
            attempt_count: "1",
          },
          {
            job_id: "10000000-0000-4000-8000-000000000002",
            attribution_id: "20000000-0000-4000-8000-000000000002",
            attempt_count: "10",
          },
        ];
      }
      if (text.includes("issue_referral_reward_job_v1")) {
        issueCalls += 1;
        if (issueCalls === 2)
          throw new Error("contains-private-provider-detail");
        return [
          {
            attribution_id: "20000000-0000-4000-8000-000000000001",
            issuance_id: "30000000-0000-4000-8000-000000000001",
            state: "qualified",
            outcome: "created",
          },
        ];
      }
      if (text.includes("finish_referral_reward_job_v1")) {
        expect(text).toContain("referral_reward_issue_failed");
        expect(text).not.toContain("private-provider-detail");
        return [{ state: "manual_review", outcome: "manual_review" }];
      }
      throw new Error(`Unexpected query: ${text}`);
    };

    await expect(
      runReferralRewardLifecycle(query as unknown as Sql, "worker-referral"),
    ).resolves.toEqual({
      claimed: 2,
      completed: 1,
      cancelled: 0,
      retryable: 0,
      manualReview: 1,
    });
  });

  it("rejects malformed referral reward claim responses", async () => {
    const invalidSql = (async () => [
      {
        job_id: "not-a-job",
        attribution_id: "20000000-0000-4000-8000-000000000001",
        attempt_count: "0",
      },
    ]) as unknown as Sql;
    await expect(
      runReferralRewardLifecycle(invalidSql, "worker-referral"),
    ).rejects.toThrow("invalid_referral_reward_claim_result");
  });

  it("advances database-timed campaign activation and completion", async () => {
    const query = (async () => [
      {
        campaign_version_id: "42000000-0000-4000-8000-000000000001",
        from_status: "scheduled",
        to_status: "active",
        transitioned_at: "2026-08-24T08:00:00Z",
      },
      {
        campaign_version_id: "42000000-0000-4000-8000-000000000002",
        from_status: "paused",
        to_status: "completed",
        transitioned_at: new Date("2026-08-24T08:00:00Z"),
      },
    ]) as unknown as Sql;

    await expect(advanceCampaignLifecycle(query)).resolves.toEqual({
      activated: 1,
      completed: 1,
    });
  });

  it("rejects malformed campaign lifecycle transitions", async () => {
    const query = (async () => [
      {
        campaign_version_id: "not-a-version",
        from_status: "draft",
        to_status: "active",
        transitioned_at: "not-an-instant",
      },
    ]) as unknown as Sql;

    await expect(advanceCampaignLifecycle(query)).rejects.toThrow(
      "invalid_campaign_lifecycle_result",
    );
  });

  it("executes bounded canonical campaign jobs and reconciles zero-value controls", async () => {
    let executionCalls = 0;
    const query = async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("enqueue_due_limited_campaigns_v1")) {
        return [{ enqueued: "1" }];
      }
      if (text.includes("claim_due_campaign_trigger_jobs_v1")) {
        return [
          {
            job_id: "41000000-0000-4000-8000-000000000001",
            campaign_version_id: "42000000-0000-4000-8000-000000000001",
            trigger_kind: "milestone",
            action: "issue",
            source_reference: "milestone-fact:one",
            occurred_at: "2026-08-23T18:30:00Z",
            attempt_count: "1",
          },
          {
            job_id: "41000000-0000-4000-8000-000000000002",
            campaign_version_id: "42000000-0000-4000-8000-000000000002",
            trigger_kind: "tier",
            action: "issue",
            source_reference: "tier-decision:one",
            occurred_at: new Date("2026-08-23T18:31:00Z"),
            attempt_count: 1,
          },
        ];
      }
      if (text.includes("execute_campaign_trigger_job_v1")) {
        executionCalls += 1;
        return executionCalls === 1
          ? [
              {
                job_id: "41000000-0000-4000-8000-000000000001",
                campaign_version_id: "42000000-0000-4000-8000-000000000001",
                action: "issue",
                outcome: "points_awarded",
                allocation_id: "43000000-0000-4000-8000-000000000001",
                transaction_id: "44000000-0000-4000-8000-000000000001",
                reward_reservation_id: null,
              },
            ]
          : [
              {
                job_id: "41000000-0000-4000-8000-000000000002",
                campaign_version_id: "42000000-0000-4000-8000-000000000002",
                action: "issue",
                outcome: "control",
                allocation_id: null,
                transaction_id: null,
                reward_reservation_id: null,
              },
            ];
      }
      throw new Error(`Unexpected query: ${text}`);
    };
    await expect(
      runCampaignTriggerLifecycle(query as unknown as Sql, "worker-campaign"),
    ).resolves.toEqual({
      enqueued: 1,
      claimed: 2,
      completed: 2,
      reversed: 0,
      controls: 1,
      capacityExhausted: 0,
      retryable: 0,
      manualReview: 0,
    });
  });

  it("moves the tenth failed campaign trigger to manual review without error leakage", async () => {
    const query = async (
      strings: TemplateStringsArray,
      ...values: readonly unknown[]
    ) => {
      const text = strings.join("?");
      if (text.includes("enqueue_due_limited_campaigns_v1")) {
        return [{ enqueued: 0 }];
      }
      if (text.includes("claim_due_campaign_trigger_jobs_v1")) {
        return [
          {
            job_id: "41000000-0000-4000-8000-000000000010",
            campaign_version_id: "42000000-0000-4000-8000-000000000010",
            trigger_kind: "referral",
            action: "reverse",
            source_reference: "referral-compensation:ten",
            occurred_at: "2026-08-23T18:40:00Z",
            attempt_count: "10",
          },
        ];
      }
      if (text.includes("execute_campaign_trigger_job_v1")) {
        throw new Error("tenant-private-database-detail");
      }
      if (text.includes("finish_campaign_trigger_job_v1")) {
        expect(values).toContain("campaign_trigger_execution_failed");
        expect(text).not.toContain("tenant-private-database-detail");
        return [{ state: "manual_review", outcome: "manual_review" }];
      }
      throw new Error(`Unexpected query: ${text}`);
    };
    await expect(
      runCampaignTriggerLifecycle(query as unknown as Sql, "worker-campaign"),
    ).resolves.toMatchObject({
      claimed: 1,
      completed: 0,
      retryable: 0,
      manualReview: 1,
    });
  });

  it("moves a deterministic campaign contract failure directly to manual review", async () => {
    const query = async (
      strings: TemplateStringsArray,
      ...values: readonly unknown[]
    ) => {
      const text = strings.join("?");
      if (text.includes("enqueue_due_limited_campaigns_v1")) {
        return [{ enqueued: 0 }];
      }
      if (text.includes("claim_due_campaign_trigger_jobs_v1")) {
        return [
          {
            job_id: "41000000-0000-4000-8000-000000000011",
            campaign_version_id: "42000000-0000-4000-8000-000000000011",
            trigger_kind: "limited_quantity",
            action: "issue",
            source_reference: "limited-assignment:eleven",
            occurred_at: "2026-08-23T18:41:00Z",
            attempt_count: "1",
          },
        ];
      }
      if (text.includes("execute_campaign_trigger_job_v1")) {
        throw Object.assign(new Error("tenant-private-contract-detail"), {
          code: "23514",
        });
      }
      if (text.includes("finish_campaign_trigger_job_v1")) {
        expect(values).toContain("campaign_trigger_contract_failed");
        expect(values).not.toContain("tenant-private-contract-detail");
        return [{ state: "manual_review", outcome: "manual_review" }];
      }
      throw new Error(`Unexpected query: ${text}`);
    };

    await expect(
      runCampaignTriggerLifecycle(query as unknown as Sql, "worker-campaign"),
    ).resolves.toMatchObject({
      claimed: 1,
      completed: 0,
      retryable: 0,
      manualReview: 1,
    });
  });

  it("keeps a transient campaign database failure on the bounded retry path", async () => {
    const query = async (
      strings: TemplateStringsArray,
      ...values: readonly unknown[]
    ) => {
      const text = strings.join("?");
      if (text.includes("enqueue_due_limited_campaigns_v1")) {
        return [{ enqueued: 0 }];
      }
      if (text.includes("claim_due_campaign_trigger_jobs_v1")) {
        return [
          {
            job_id: "41000000-0000-4000-8000-000000000012",
            campaign_version_id: "42000000-0000-4000-8000-000000000012",
            trigger_kind: "milestone",
            action: "issue",
            source_reference: "milestone-fact:twelve",
            occurred_at: "2026-08-23T18:42:00Z",
            attempt_count: "1",
          },
        ];
      }
      if (text.includes("execute_campaign_trigger_job_v1")) {
        throw Object.assign(new Error("serialization detail"), {
          code: "40001",
        });
      }
      if (text.includes("finish_campaign_trigger_job_v1")) {
        expect(values).toContain("campaign_trigger_execution_failed");
        expect(values).not.toContain("serialization detail");
        return [{ state: "retryable", outcome: "retryable" }];
      }
      throw new Error(`Unexpected query: ${text}`);
    };

    await expect(
      runCampaignTriggerLifecycle(query as unknown as Sql, "worker-campaign"),
    ).resolves.toMatchObject({
      claimed: 1,
      completed: 0,
      retryable: 1,
      manualReview: 0,
    });
  });

  it("rejects malformed campaign scheduler and claim results", async () => {
    const invalidEnqueue = (async () => [
      { enqueued: "101" },
    ]) as unknown as Sql;
    await expect(
      runCampaignTriggerLifecycle(invalidEnqueue, "worker-campaign"),
    ).rejects.toThrow("invalid_limited_campaign_enqueue_result");

    let calls = 0;
    const invalidClaim = (async () => {
      calls += 1;
      return calls === 1
        ? [{ enqueued: 0 }]
        : [
            {
              job_id: "not-a-uuid",
              campaign_version_id: "42000000-0000-4000-8000-000000000001",
              trigger_kind: "milestone",
              action: "issue",
              source_reference: "fact:one",
              occurred_at: "2026-08-23T18:30:00Z",
              attempt_count: 0,
            },
          ];
    }) as unknown as Sql;
    await expect(
      runCampaignTriggerLifecycle(invalidClaim, "worker-campaign"),
    ).rejects.toThrow();
  });

  it("classifies completed orders as awards and earlier states as skips", () => {
    expect(parseWooCommerceEffect(event)).toMatchObject({
      kind: "award",
      awardEligible: true,
    });
    expect(
      parseWooCommerceEffect({
        ...event,
        payload: {
          ...(event.payload as Record<string, unknown>),
          order: {
            ...(event.payload as { order: Record<string, unknown> }).order,
            status: "processing",
          },
        },
      }),
    ).toEqual({ kind: "skip", reason: "order_status_not_eligible" });
  });

  it("retains a processing order only when it carries signed referral evidence", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        payload: {
          ...(event.payload as Record<string, unknown>),
          order: {
            ...(event.payload as { order: Record<string, unknown> }).order,
            status: "processing",
            referral: {
              version: "1",
              advocateCode: "55000000-0000-4000-8000-000000000001",
              capturedAt: "2026-08-14T00:00:00Z",
              sourceNetworkFingerprint: "a".repeat(64),
              deviceFingerprint: null,
              paymentFingerprint: null,
              shippingFingerprint: null,
            },
          },
        },
      }),
    ).toMatchObject({ kind: "award", awardEligible: false });
  });

  it("records processing qualification against the attributed programme without awarding purchase points", async () => {
    const calls: string[] = [];
    const processingEvent = {
      ...event,
      payload: {
        ...(event.payload as Record<string, unknown>),
        order: {
          ...(event.payload as { order: Record<string, unknown> }).order,
          status: "processing",
          referral: {
            version: "1",
            advocateCode: "55000000-0000-4000-8000-000000000001",
            capturedAt: "2026-08-12T09:00:00Z",
            sourceNetworkFingerprint: "a".repeat(64),
            deviceFingerprint: null,
            paymentFingerprint: null,
            shippingFingerprint: null,
          },
        },
      },
    } satisfies ClaimedEffect;
    const programmeRow = {
      programme_group_id: "8",
      programme_version_id: "9",
      programme_version_public_id: "00000000-0000-4000-8000-000000000009",
      version_number: 1,
      tier_code: "rose",
      tier_name: "Rose",
      minimum_eligible_spend_minor: "0",
      points_per_major_unit: "5",
      ordinal: 0,
      configuration: referralProgrammeConfiguration,
    };
    const query = async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      calls.push(text);
      if (text.includes("resolve_commerce_customer")) {
        return [{ customer_id: "7" }];
      }
      if (text.includes("from loyalty.programmes as programme")) {
        return [programmeRow];
      }
      if (text.includes("from loyalty.wallets as wallet")) return [];
      if (text.includes("record_referral_attribution_v1")) {
        return [
          {
            attribution_id: "00000000-0000-4000-8000-000000000071",
            state: "captured",
            outcome: "created",
          },
        ];
      }
      if (text.includes("get_referral_qualification_context_v1")) {
        return [
          {
            attribution_id: "00000000-0000-4000-8000-000000000071",
            programme_version_id: "9",
            current_state: "captured",
            qualification_status: "processing",
            outcome: "ready",
          },
        ];
      }
      if (text.includes("from loyalty.programme_versions as version")) {
        return [programmeRow];
      }
      if (text.includes("get_member_earning_rule_usage")) return [];
      if (text.includes("record_referral_qualification_v1")) {
        return [
          {
            attribution_id: "00000000-0000-4000-8000-000000000071",
            evaluation_id: "00000000-0000-4000-8000-000000000072",
            state: "cooling",
            outcome: "eligible",
            cooling_ends_at: "2026-08-26T10:00:00Z",
          },
        ];
      }
      if (text.includes("finish_commerce_effect")) return [];
      throw new Error(`Unexpected query: ${text}`);
    };
    const fakeSql = query as unknown as Sql;
    Object.assign(fakeSql, {
      begin: async (callback: (transaction: Sql) => Promise<unknown>) =>
        callback(fakeSql),
    });

    await processWooCommerceEffect(fakeSql, "worker-referral", processingEvent);

    expect(
      calls.some((call) => call.includes("record_referral_qualification_v1")),
    ).toBe(true);
    expect(
      calls.some((call) => call.includes("commit_programme_v2_award")),
    ).toBe(false);
    expect(
      calls.some(
        (call) =>
          call.includes("finish_commerce_effect") &&
          call.includes("loyalty.referral.qualification"),
      ),
    ).toBe(true);
  });

  it("finishes a pre-award refund after rejecting its cooling referral", async () => {
    const calls: string[] = [];
    let transactionCount = 0;
    const refundEvent = {
      ...event,
      event_type: "commerce.order.refunded",
      source_event_id: "order:42:refund:one",
      payload: {
        kind: "order_refunded",
        refundId: "one",
        refundAmount: "50.00",
        order: {
          ...(event.payload as { order: Record<string, unknown> }).order,
          refundedTotal: "50.00",
        },
      },
    } satisfies ClaimedEffect;
    const query = async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      calls.push(text);
      if (text.includes("reject_referral_for_refund_v1")) {
        return [
          {
            attribution_id: "00000000-0000-4000-8000-000000000071",
            state: "rejected",
            outcome: "rejected",
          },
        ];
      }
      if (text.includes("from loyalty_private.programme_evaluations")) {
        return [];
      }
      if (text.includes("finish_commerce_effect")) return [];
      throw new Error(`Unexpected query: ${text}`);
    };
    const fakeSql = query as unknown as Sql;
    Object.assign(fakeSql, {
      begin: async (callback: (transaction: Sql) => Promise<unknown>) => {
        transactionCount += 1;
        return callback(fakeSql);
      },
    });

    await processWooCommerceEffect(fakeSql, "worker-referral", refundEvent);

    expect(
      calls.some((call) => call.includes("reject_referral_for_refund_v1")),
    ).toBe(true);
    expect(calls.some((call) => call.includes("reverse_award_points"))).toBe(
      false,
    );
    expect(calls.some((call) => call.includes("finish_commerce_effect"))).toBe(
      true,
    );
    expect(transactionCount).toBe(1);
  });

  it("retries a V2 refund only after campaign compensation rolls back", async () => {
    const calls: string[] = [];
    let transactionCount = 0;
    let insideTransaction = false;
    const finishCalls: Array<{
      insideTransaction: boolean;
      outcome: unknown;
      errorCode: unknown;
    }> = [];
    const refundEvent = {
      ...event,
      event_type: "commerce.order.refunded",
      source_event_id: "order:42:refund:campaign",
      payload: {
        kind: "order_refunded",
        refundId: "campaign",
        refundAmount: "1.00",
        order: {
          ...(event.payload as { order: Record<string, unknown> }).order,
          refundedTotal: "1.00",
        },
      },
    } satisfies ClaimedEffect;
    const programmeRow = {
      programme_group_id: "8",
      programme_version_id: "9",
      programme_version_public_id: "00000000-0000-4000-8000-000000000009",
      version_number: 2,
      tier_code: "rose",
      tier_name: "Rose",
      minimum_eligible_spend_minor: "0",
      points_per_major_unit: "5",
      ordinal: 0,
      configuration: referralProgrammeConfiguration,
    };
    const query = async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      const text = strings.join("?");
      calls.push(text);
      if (text.includes("reject_referral_for_refund_v1")) {
        return [{ attribution_id: null, state: "none", outcome: "none" }];
      }
      if (text.includes("from loyalty_private.programme_evaluations")) {
        return [
          {
            evaluation_public_id: "00000000-0000-4000-8000-000000000021",
            programme_group_id: "8",
            programme_version_id: "9",
            result: {
              version: "2",
              eventId: "woocommerce:1:order:42:completed",
              eligibleSpendMinor: "100",
              awardedPoints: "5",
              tierCodeSnapshot: "rose",
              pendingAt: event.occurred_at,
            },
            explanation: { lines: [] },
            origin_entry_public_id: "00000000-0000-4000-8000-000000000022",
            already_reversed_points: "0",
          },
        ];
      }
      if (text.includes("from loyalty.programme_versions as version")) {
        return [programmeRow];
      }
      if (text.includes("record_programme_evaluation")) {
        return [
          {
            evaluation_public_id: "00000000-0000-4000-8000-000000000023",
          },
        ];
      }
      if (text.includes("reverse_award_points")) {
        return [
          {
            transaction_public_id: "00000000-0000-4000-8000-000000000024",
          },
        ];
      }
      if (text.includes("record_purchase_campaign_refund_v1")) {
        throw new Error("campaign_compensation_failed");
      }
      if (text.includes("finish_commerce_effect")) {
        finishCalls.push({
          insideTransaction,
          outcome: values[2],
          errorCode: values[3],
        });
        return [];
      }
      throw new Error(`Unexpected query: ${text}`);
    };
    const fakeSql = query as unknown as Sql;
    Object.assign(fakeSql, {
      begin: async (callback: (transaction: Sql) => Promise<unknown>) => {
        transactionCount += 1;
        insideTransaction = true;
        try {
          return await callback(fakeSql);
        } finally {
          insideTransaction = false;
        }
      },
    });

    await processWooCommerceEffect(fakeSql, "worker-campaign", refundEvent);

    const programmeReversal = calls.findIndex((call) =>
      call.includes("reverse_award_points"),
    );
    const campaignCompensation = calls.findIndex((call) =>
      call.includes("record_purchase_campaign_refund_v1"),
    );
    expect(programmeReversal).toBeGreaterThanOrEqual(0);
    expect(campaignCompensation).toBeGreaterThan(programmeReversal);
    expect(finishCalls).toEqual([
      {
        insideTransaction: false,
        outcome: "retryable",
        errorCode: "campaign_compensation_failed",
      },
    ]);
    expect(transactionCount).toBe(1);
  });

  it("quarantines malformed facts without exposing payload values", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        payload: { email: "secret@example.test" },
      }),
    ).toEqual({
      kind: "quarantine",
      reason: "invalid_order_status_payload",
    });
  });

  it("preserves the stable refund id for cumulative reversal idempotency", () => {
    const order = (event.payload as { order: Record<string, unknown> }).order;
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.order.refunded",
        payload: {
          kind: "order_refunded",
          refundId: "refund-9",
          refundAmount: "0.00",
          order,
        },
      }),
    ).toMatchObject({ kind: "refund", refundId: "refund-9" });
  });

  it("classifies strict PII-free coupon use facts for ledger capture", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.coupon.captured",
        payload: {
          kind: "coupon_captured",
          reservationId: "63000000-0000-4000-8000-000000000001",
          orderId: "42",
        },
      }),
    ).toEqual({
      kind: "coupon_capture",
      reservationId: "63000000-0000-4000-8000-000000000001",
      orderId: "42",
    });
  });

  it("classifies strict customer erasure facts without accepting contact data", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.customer.deleted",
        source_object_id: "customer-erasure",
        payload: { kind: "customer_deleted", externalCustomerId: "7" },
      }),
    ).toEqual({ kind: "customer_delete", externalCustomerId: "7" });
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.customer.deleted",
        source_object_id: "customer-erasure",
        payload: {
          kind: "customer_deleted",
          externalCustomerId: "7",
          email: "secret@example.test",
        },
      }),
    ).toEqual({
      kind: "quarantine",
      reason: "invalid_customer_deleted_payload",
    });
  });

  it("classifies PII-free account creation and verified review activities", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.customer.created",
        payload: { kind: "customer_created", externalCustomerId: "7" },
      }),
    ).toEqual({
      kind: "activity",
      source: "account_created",
      customerSelector: { kind: "commerce", externalCustomerId: "7" },
      channel: "woocommerce",
      activityReference: "woocommerce:customer:7",
      activityCode: "account_created",
      productId: null,
      categoryIds: [],
    });
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.review.verified",
        payload: {
          kind: "verified_product_review",
          externalCustomerId: "7",
          reviewId: "101",
          productId: "42",
          categoryIds: ["8", "9"],
        },
      }),
    ).toEqual({
      kind: "activity",
      source: "verified_product_review",
      customerSelector: { kind: "commerce", externalCustomerId: "7" },
      channel: "woocommerce",
      activityReference: "woocommerce:review:101",
      activityCode: "verified_product_review",
      productId: "42",
      categoryIds: ["8", "9"],
    });
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.review.verified",
        payload: {
          kind: "verified_product_review",
          externalCustomerId: "7",
          reviewId: "101",
          productId: "42",
          categoryIds: [],
          content: "PII must never cross the boundary",
        },
      }),
    ).toEqual({
      kind: "quarantine",
      reason: "invalid_verified_review_payload",
    });
  });

  it("classifies signed Merchant Activity facts with public customer authority", () => {
    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.activity.recorded",
        source_event_id: "crm:consultation:42",
        payload: {
          kind: "activity",
          source: "custom_activity",
          customerId: "20000000-0000-4000-8000-000000000001",
          activityCode: "consultation",
          productId: null,
          categoryIds: [],
        },
      }),
    ).toEqual({
      kind: "activity",
      source: "custom_activity",
      customerSelector: {
        kind: "public",
        customerId: "20000000-0000-4000-8000-000000000001",
      },
      channel: "merchant-api",
      activityReference: "merchant-activity:crm:consultation:42",
      activityCode: "consultation",
      productId: null,
      categoryIds: [],
    });

    expect(
      parseWooCommerceEffect({
        ...event,
        event_type: "commerce.activity.recorded",
        source_event_id: "referral:qualification:42",
        payload: {
          kind: "activity",
          source: "referral",
          customerId: "20000000-0000-4000-8000-000000000001",
          activityCode: "referral",
          productId: null,
          categoryIds: [],
        },
      }),
    ).toMatchObject({
      kind: "activity",
      source: "referral",
      activityCode: "referral",
    });
  });

  it("hashes equivalent object keys deterministically", () => {
    expect(evidenceSha256({ a: 1, b: { c: 2 } })).toBe(
      evidenceSha256({ b: { c: 2 }, a: 1 }),
    );
  });

  it("rounds partial refunds cumulatively and caps a full refund", () => {
    expect(
      calculateCumulativeRefundPlan({
        originalEligibleSpend: 1_000,
        originalAwardedPoints: 333,
        currentEligibleSpend: 667,
        alreadyReversedPoints: 0,
      }),
    ).toEqual({
      cumulativeRefundedEligibleSpend: 333,
      reversalPoints: 110,
    });
    expect(
      calculateCumulativeRefundPlan({
        originalEligibleSpend: 1_000,
        originalAwardedPoints: 333,
        currentEligibleSpend: 0,
        alreadyReversedPoints: 110,
      }).reversalPoints,
    ).toBe(223);
  });

  it("rejects a cumulative refund snapshot that moves backwards", () => {
    expect(() =>
      calculateCumulativeRefundPlan({
        originalEligibleSpend: 1_000,
        originalAwardedPoints: 333,
        currentEligibleSpend: 1_001,
        alreadyReversedPoints: 0,
      }),
    ).toThrow("cumulative_refund_moved_backwards");
  });

  it("keeps original award spend separate from cumulative refund evidence", () => {
    const parsed = parseWooCommerceEffect(event);
    if (parsed.kind !== "award") throw new Error("expected award fixture");
    const order = {
      ...parsed.order,
      lines: [
        {
          lineId: "1",
          productId: "10",
          variationId: null,
          quantity: "1",
          categoryIds: [],
          collectionIds: [],
          subtotal: "10.00",
          total: "10.00",
          refundedTotal: "4.00",
        },
      ],
      refundedTotal: "4.00",
    };
    const award = toOrderAwardFact(order, event.occurred_at, "rose", false);
    const refund = toOrderAwardFact(order, event.occurred_at, "rose", true);
    expect(award.lines[0]?.refundedMinor).toBe(0);
    expect(refund.lines[0]?.refundedMinor).toBe(400);
  });

  it("converts WooCommerce V2 facts exactly and includes component refunds only during reversal", () => {
    const parsed = parseWooCommerceEffect(event);
    if (parsed.kind !== "award") throw new Error("expected award fixture");
    const order = {
      ...parsed.order,
      shippingTotal: "4.99",
      shippingRefundedTotal: "1.25",
      taxTotal: "2.00",
      taxRefundedTotal: "0.50",
      feeTotal: "1.00",
      feeRefundedTotal: "0.25",
      refundedTotal: "2.00",
    };
    const award = toPurchaseEarningFactV2(
      order,
      event,
      "rose",
      { "purchase-base": "100" },
      false,
    );
    const refund = toPurchaseEarningFactV2(
      order,
      event,
      "rose",
      { "purchase-base": "100" },
      true,
    );

    expect(award).toMatchObject({
      eventId: "woocommerce:1:order:42:completed",
      shippingMinor: "499",
      shippingRefundedMinor: "0",
      taxRefundedMinor: "0",
      feeRefundedMinor: "0",
      memberRuleUsage: { "purchase-base": "100" },
    });
    expect(refund).toMatchObject({
      shippingRefundedMinor: "125",
      taxRefundedMinor: "50",
      feeRefundedMinor: "25",
    });
  });

  it("calculates cumulative V2 reversals beyond JavaScript safe integers", () => {
    expect(
      calculateCumulativeRefundPlanV2({
        originalEligibleSpend: "9007199254740993",
        originalAwardedPoints: "9007199254740991",
        currentEligibleSpend: "4503599627370496",
        alreadyReversedPoints: "0",
      }),
    ).toEqual({
      cumulativeRefundedEligibleSpend: "4503599627370497",
      reversalPoints: "4503599627370495",
    });
    expect(
      calculateCumulativeRefundPlanV2({
        originalEligibleSpend: "9007199254740993",
        originalAwardedPoints: "9007199254740991",
        currentEligibleSpend: "0",
        alreadyReversedPoints: "4503599627370495",
      }).reversalPoints,
    ).toBe("4503599627370496");
  });

  it("routes live V2 purchase and activity awards through the atomic database command", async () => {
    const calls: string[] = [];
    const query = async (parts: TemplateStringsArray): Promise<unknown[]> => {
      const text = parts.join("?");
      calls.push(text);
      if (text.includes("resolve_commerce_customer")) {
        return [{ customer_id: "7" }];
      }
      if (text.includes("from loyalty.customers")) {
        return [{ customer_id: "7" }];
      }
      if (text.includes("from loyalty.programmes as programme")) {
        return [
          {
            programme_group_id: "10",
            programme_version_id: "11",
            programme_version_public_id: "00000000-0000-4000-8000-000000000011",
            version_number: 2,
            tier_code: "rose",
            tier_name: "Rose",
            minimum_eligible_spend_minor: "0",
            points_per_major_unit: "5",
            ordinal: 1,
            configuration: {
              version: "2",
              currencyCode: "EUR",
              currencyMinorUnitDigits: 2,
              pendingDays: 30,
              pointsExpireAfterDays: 365,
              tiers: [
                {
                  code: "rose",
                  name: "Rose",
                  minimumEligibleSpendMinor: "0",
                  pointsPerMajorUnit: "5",
                },
              ],
              tierPolicy: {
                version: "2",
                qualificationPeriod: { kind: "lifetime" },
                downgradeGraceDays: 30,
                levels: [
                  {
                    tierCode: "rose",
                    entry: null,
                    retention: null,
                    reentry: null,
                    benefits: {
                      earningMultiplierBasisPoints: 10000,
                      rewardCodes: [],
                      earlyAccess: false,
                    },
                  },
                ],
              },
              rewards: [],
              earningRules: [
                {
                  code: "purchase-base",
                  name: "Base purchase points",
                  source: "purchase",
                  enabled: true,
                  priority: 0,
                  stackable: false,
                  effect: { kind: "base_rate", pointsPerMajorUnit: "5" },
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
                    perMemberPoints: "1000",
                    memberPeriod: "calendar_year",
                    rollingDays: null,
                  },
                },
                {
                  code: "account-created",
                  name: "Account created",
                  source: "account_created",
                  enabled: true,
                  priority: 10,
                  stackable: true,
                  effect: { kind: "fixed_bonus", points: "100" },
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
                  purchaseExclusions: null,
                  cap: {
                    perEventPoints: "100",
                    perMemberPoints: "100",
                    memberPeriod: "lifetime",
                    rollingDays: null,
                  },
                },
              ],
            },
          },
        ];
      }
      if (text.includes("from loyalty.wallets as wallet")) return [];
      if (text.includes("get_member_earning_rule_usage")) {
        return [{ rule_code: "purchase-base", consumed_points: "25" }];
      }
      if (text.includes("get_purchase_campaign_context_v1")) return [];
      if (text.includes("commit_programme_v2_award")) {
        return [
          {
            evaluation_public_id: "00000000-0000-4000-8000-000000000021",
            transaction_public_id: null,
            outcome: "created",
          },
        ];
      }
      if (text.includes("get_tier_qualification_context_v2")) {
        return [
          {
            metrics: {
              eligibleSpendMinor: "0",
              earnedPoints: "0",
              orderCount: "0",
              referralCount: "0",
              verifiedActionCount: "0",
              verifiedActionCounts: {},
            },
            current_tier_code: null,
            previously_held_tier_codes: [],
            below_threshold_since: null,
          },
        ];
      }
      if (text.includes("record_tier_qualification_decision_v2")) {
        return [
          {
            tier_decision_public_id: "00000000-0000-4000-8000-000000000031",
          },
        ];
      }
      if (text.includes("finish_commerce_effect")) return [];
      throw new Error(`Unexpected query: ${text}`);
    };
    const fakeSql = query as unknown as Sql;
    Object.assign(fakeSql, {
      begin: async (callback: (transaction: Sql) => Promise<unknown>) =>
        callback(fakeSql),
    });

    await processWooCommerceEffect(fakeSql, "worker-test", event);
    await processWooCommerceEffect(fakeSql, "worker-test", {
      ...event,
      canonical_event_id: "2",
      canonical_event_public_id: "00000000-0000-4000-8000-000000000002",
      event_type: "commerce.customer.created",
      source_event_id: "customer:7:created",
      source_object_id: "7",
      payload: { kind: "customer_created", externalCustomerId: "7" },
    });
    await processWooCommerceEffect(fakeSql, "worker-test", {
      ...event,
      canonical_event_id: "3",
      canonical_event_public_id: "00000000-0000-4000-8000-000000000003",
      event_type: "commerce.activity.recorded",
      source_event_id: "crm:consultation:42",
      source_object_id: "20000000-0000-4000-8000-000000000001",
      payload: {
        kind: "activity",
        source: "custom_activity",
        customerId: "20000000-0000-4000-8000-000000000001",
        activityCode: "consultation",
        productId: null,
        categoryIds: [],
      },
    });

    expect(
      calls.some((call) => call.includes("get_member_earning_rule_usage")),
    ).toBe(true);
    expect(
      calls.filter((call) => call.includes("commit_programme_v2_award")),
    ).toHaveLength(3);
    expect(
      calls.filter((call) =>
        call.includes("get_tier_qualification_context_v2"),
      ),
    ).toHaveLength(3);
    expect(
      calls.filter((call) =>
        call.includes("record_tier_qualification_decision_v2"),
      ),
    ).toHaveLength(3);
    expect(calls.some((call) => call.includes("finish_commerce_effect"))).toBe(
      true,
    );
    expect(
      calls.some((call) => call.includes("record_programme_evaluation")),
    ).toBe(false);
  });

  it("evaluates purchase campaigns and commits their capacity with the programme award", async () => {
    const calls: string[] = [];
    const campaignEvent = {
      ...event,
      payload: {
        kind: "order_status_changed",
        previousStatus: "processing",
        order: {
          ...(event.payload as { order: Record<string, unknown> }).order,
          lines: [
            {
              lineId: "1",
              productId: "serum",
              variationId: null,
              categoryIds: ["skincare"],
              collectionIds: [],
              quantity: "1",
              subtotal: "1.00",
              total: "1.00",
              refundedTotal: "0.00",
            },
          ],
        },
      },
    } satisfies ClaimedEffect;
    const programmeRow = {
      programme_group_id: "8",
      programme_version_id: "9",
      programme_version_public_id: "00000000-0000-4000-8000-000000000009",
      version_number: 1,
      tier_code: "rose",
      tier_name: "Rose",
      minimum_eligible_spend_minor: "0",
      points_per_major_unit: "5",
      ordinal: 0,
      configuration: referralProgrammeConfiguration,
    };
    const query = async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      calls.push(text);
      if (text.includes("resolve_commerce_customer")) {
        return [{ customer_id: "7" }];
      }
      if (text.includes("from loyalty.programmes as programme")) {
        return [programmeRow];
      }
      if (text.includes("from loyalty.wallets as wallet")) return [];
      if (text.includes("record_referral_attribution_v1")) {
        return [{ attribution_id: null, state: "none", outcome: "none" }];
      }
      if (text.includes("get_referral_qualification_context_v1")) {
        return [
          {
            attribution_id: null,
            programme_version_id: null,
            current_state: null,
            qualification_status: null,
            outcome: "none",
          },
        ];
      }
      if (text.includes("get_member_earning_rule_usage")) return [];
      if (text.includes("get_purchase_campaign_context_v1")) {
        return [
          {
            campaign_version_public_id: "87000000-0000-4000-8000-000000000801",
            campaign_code: "order_bonus",
            assignment: "treatment",
            behavior: {
              kind: "bonus_points",
              earningRuleCodes: ["purchase-base"],
              reward: { kind: "points", points: "10" },
            },
            remaining_global_effects: "100",
            remaining_member_effects: "1",
            remaining_points: "1000",
          },
        ];
      }
      if (text.includes("commit_purchase_campaign_execution_v1")) {
        return [
          {
            evaluation_public_id: "00000000-0000-4000-8000-000000000021",
            transaction_public_id: "00000000-0000-4000-8000-000000000022",
            campaign_batch_public_id: "00000000-0000-4000-8000-000000000023",
            campaign_points: "10",
            outcome: "created",
          },
        ];
      }
      if (text.includes("get_tier_qualification_context_v2")) {
        return [
          {
            metrics: {
              eligibleSpendMinor: "0",
              earnedPoints: "0",
              orderCount: "0",
              referralCount: "0",
              verifiedActionCount: "0",
              verifiedActionCounts: {},
            },
            current_tier_code: null,
            previously_held_tier_codes: [],
            below_threshold_since: null,
          },
        ];
      }
      if (text.includes("record_tier_qualification_decision_v2")) {
        return [
          {
            tier_decision_public_id: "00000000-0000-4000-8000-000000000031",
          },
        ];
      }
      if (text.includes("finish_commerce_effect")) return [];
      throw new Error(`Unexpected query: ${text}`);
    };
    const fakeSql = query as unknown as Sql;
    Object.assign(fakeSql, {
      begin: async (callback: (transaction: Sql) => Promise<unknown>) =>
        callback(fakeSql),
    });

    await processWooCommerceEffect(fakeSql, "worker-campaign", campaignEvent);

    expect(
      calls.some((call) =>
        call.includes("commit_purchase_campaign_execution_v1"),
      ),
    ).toBe(true);
    expect(
      calls.some((call) => call.includes("commit_programme_v2_award(")),
    ).toBe(false);
    expect(calls.some((call) => call.includes("finish_commerce_effect"))).toBe(
      true,
    );
  });
});
