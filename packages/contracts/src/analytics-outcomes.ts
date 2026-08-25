import { z } from "zod";
import { analyticsMetricDictionaryV2, analyticsMetricKeyV2 } from "./reporting";

const exactNonNegativeInteger = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);

const analyticsOutcomeMetricKeysV3 = [
  "rewards.requests",
  "rewards.captures",
  "rewards.captured_points",
  "rewards.unresolved",
  "rewards.mature.requests",
  "rewards.mature.captures",
  "rewards.mature.unresolved",
  "rewards.mature.capture_rate",
  "tiers.decisions.total",
  "tiers.movements.members",
  "tiers.movements.entry",
  "tiers.movements.reentry",
  "tiers.movements.upgrade",
  "tiers.movements.grace",
  "tiers.movements.downgrade",
  "tiers.movements.manual",
  "tiers.movements.none",
  "referrals.advocates.active",
  "referrals.attributions",
  "referrals.pending",
  "referrals.qualified",
  "referrals.rejected",
  "referrals.reversed",
  "referrals.qualification_rate",
  "referrals.issuances",
  "referrals.compensations",
  "referrals.advocate_points_issued",
  "referrals.friend_points_issued",
  "referrals.advocate_points_reversed",
  "referrals.friend_points_reversed",
  "referrals.advocate_points_net",
  "referrals.friend_points_net",
  "campaigns.treatment_outcomes",
  "campaigns.control_outcomes",
  "campaigns.capacity_exhausted",
  "campaigns.suppressed",
  "campaigns.influenced_orders",
  "campaigns.influenced_members",
  "campaigns.influenced_eligible_spend",
  "campaigns.points_awarded_gross",
  "campaigns.points_reversed",
  "campaigns.points_net",
  "campaigns.rewards_reserved",
  "campaigns.manual_review_jobs",
  "campaigns.incremental_revenue",
  "campaigns.incrementality_state",
] as const;

export const analyticsMetricKeyV3 = z.enum([
  ...analyticsMetricKeyV2.options,
  ...analyticsOutcomeMetricKeysV3,
]);

export const analyticsMetricDefinitionV3 = z
  .object({
    key: analyticsMetricKeyV3,
    label: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    formula: z.string().min(1).max(1_000),
    sourceFields: z.array(z.string().min(1).max(200)).min(1).max(16),
    grain: z.string().min(1).max(300),
    timeBoundary: z.string().min(1).max(500),
    timeZone: z.literal("UTC"),
    currencyPolicy: z.enum([
      "not_applicable",
      "single_currency_minor_units",
      "unavailable_if_mixed_currency",
      "unavailable_without_valuation_policy",
      "unavailable_without_experimental_estimator",
    ]),
    owner: z.literal("loyalty_analytics"),
    caveats: z.array(z.string().min(1).max(500)).max(10),
    causalClass: z.enum([
      "operational",
      "descriptive",
      "experimental",
      "unavailable",
    ]),
    availability: z.enum(["available", "conditional", "unavailable"]),
    displayFormat: z.enum([
      "points",
      "count",
      "basis_points",
      "currency_minor",
      "currency_unavailable",
    ]),
  })
  .strict();

export const analyticsMetricDictionaryV3Schema = z
  .object({
    dictionaryVersion: z.literal("3"),
    effectiveFrom: z.iso.datetime({ offset: true }),
    definitions: z.array(analyticsMetricDefinitionV3).length(89),
  })
  .strict()
  .superRefine((dictionary, context) => {
    const keys = dictionary.definitions.map((definition) => definition.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "Analytics metric keys must be unique",
        path: ["definitions"],
      });
    }
  });

export type AnalyticsMetricKeyV3 = z.infer<typeof analyticsMetricKeyV3>;
export type AnalyticsMetricDefinitionV3 = z.infer<
  typeof analyticsMetricDefinitionV3
>;
export type AnalyticsMetricDictionaryV3 = z.infer<
  typeof analyticsMetricDictionaryV3Schema
>;

type OutcomeDefinitionOptions = Readonly<{
  sources: readonly string[];
  timeBoundary?: string;
  caveats?: readonly string[];
  causalClass?: "operational" | "descriptive" | "unavailable";
  currencyPolicy?:
    | "not_applicable"
    | "single_currency_minor_units"
    | "unavailable_without_experimental_estimator";
  availability?: "available" | "conditional" | "unavailable";
  displayFormat?:
    | "points"
    | "count"
    | "basis_points"
    | "currency_minor"
    | "currency_unavailable";
}>;

const outcomeDefinition = (
  key: (typeof analyticsOutcomeMetricKeysV3)[number],
  label: string,
  description: string,
  formula: string,
  options: OutcomeDefinitionOptions,
) => ({
  key,
  label,
  description,
  formula,
  sourceFields: [...options.sources],
  grain:
    "Selected organization and programme group; no customer, order, referral, assignment, or connector identity leaves PostgreSQL.",
  timeBoundary:
    options.timeBoundary ??
    "Fact occurrence in the UTC half-open report period and immutable evidence recorded before report as-of.",
  timeZone: "UTC" as const,
  currencyPolicy: options.currencyPolicy ?? ("not_applicable" as const),
  owner: "loyalty_analytics" as const,
  caveats: [...(options.caveats ?? [])],
  causalClass: options.causalClass ?? ("operational" as const),
  availability: options.availability ?? ("available" as const),
  displayFormat: options.displayFormat ?? ("count" as const),
});

const rewardSources = [
  "loyalty.reward_reservations.created_at",
  "loyalty.reward_reservations.cost_points",
  "loyalty.reward_reservation_transitions.to_state",
  "loyalty.reward_reservation_transitions.created_at",
] as const;
const tierSources = [
  "loyalty.tier_decisions.transition",
  "loyalty.tier_decisions.wallet_id",
  "loyalty.tier_decisions.effective_at",
  "loyalty.tier_decisions.created_at",
] as const;
const referralSources = [
  "loyalty.referral_attributions.captured_at",
  "loyalty.referral_attribution_transitions.to_state",
  "loyalty.referral_attribution_transitions.created_at",
  "loyalty_private.referral_reward_issuances.created_at",
  "loyalty_private.referral_reward_compensations.created_at",
] as const;
const campaignSources = [
  "loyalty_private.campaign_execution_batches.occurred_at",
  "loyalty_private.campaign_effects.decision_outcome",
  "loyalty_private.campaign_trigger_executions.outcome",
  "loyalty_private.campaign_purchase_refund_compensations.cumulative_refunded_eligible_spend_minor",
] as const;

export const analyticsMetricDictionaryV3 = {
  dictionaryVersion: "3",
  effectiveFrom: "2026-08-25T00:00:00Z",
  definitions: [
    ...analyticsMetricDictionaryV2.definitions,
    outcomeDefinition(
      "rewards.requests",
      "Reward requests",
      "Customer reward reservations requested in the selected period.",
      "COUNT(reward_reservations) by immutable request creation.",
      { sources: rewardSources },
    ),
    outcomeDefinition(
      "rewards.captures",
      "Reward captures",
      "Reward reservations whose points reached a ledger-backed captured transition in the period.",
      "COUNT(DISTINCT reservation) with transition.to_state = captured.",
      { sources: rewardSources },
    ),
    outcomeDefinition(
      "rewards.captured_points",
      "Captured reward points",
      "Points permanently spent by reward captures in the period.",
      "SUM(reservation.cost_points) for captured transitions.",
      { sources: rewardSources, displayFormat: "points" },
    ),
    outcomeDefinition(
      "rewards.unresolved",
      "Unresolved rewards",
      "Requests known at report as-of whose latest immutable state still requires resolution.",
      "COUNT(requests whose latest as-of state is requested, reserved, or issued).",
      {
        sources: rewardSources,
        timeBoundary:
          "All requests created before report as-of; latest transition must also predate as-of.",
      },
    ),
    outcomeDefinition(
      "rewards.mature.requests",
      "Mature reward cohort",
      "Requests whose complete 24-hour realization window ended in the selected report range.",
      "COUNT(requests created in [periodFrom - 24 hours, periodTo - 24 hours).",
      {
        sources: rewardSources,
        timeBoundary:
          "Request creation in the shifted UTC half-open cohort; every request has a complete 24-hour observation window.",
      },
    ),
    outcomeDefinition(
      "rewards.mature.captures",
      "24-hour reward captures",
      "Mature-cohort requests captured within 24 hours of request creation.",
      "COUNT(mature requests with captured transition created no later than request.created_at + 24 hours).",
      { sources: rewardSources, causalClass: "descriptive" },
    ),
    outcomeDefinition(
      "rewards.mature.unresolved",
      "Mature unresolved rewards",
      "Mature-cohort requests still requested, reserved, or issued at the 24-hour deadline.",
      "COUNT(mature requests whose latest transition at the request deadline remains unresolved).",
      { sources: rewardSources },
    ),
    outcomeDefinition(
      "rewards.mature.capture_rate",
      "24-hour realization rate",
      "Share of mature requests captured within 24 hours.",
      "FLOOR(mature captures * 10000 / mature requests); zero when the cohort is empty.",
      {
        sources: rewardSources,
        causalClass: "descriptive",
        displayFormat: "basis_points",
        caveats: [
          "This measures timely technical realization, not reward use at checkout or incremental purchase behavior.",
        ],
      },
    ),
    ...(
      [
        ["tiers.decisions.total", "VIP decisions", "all"],
        ["tiers.movements.entry", "Tier entries", "entry"],
        ["tiers.movements.reentry", "Tier re-entries", "reentry"],
        ["tiers.movements.upgrade", "Tier upgrades", "upgrade"],
        ["tiers.movements.grace", "Tier grace movements", "grace"],
        ["tiers.movements.downgrade", "Tier downgrades", "downgrade"],
        ["tiers.movements.manual", "Manual tier decisions", "manual"],
        ["tiers.movements.none", "Unchanged tier decisions", "none"],
      ] as const
    ).map(([key, label, transition]) =>
      outcomeDefinition(
        key,
        label,
        transition === "all"
          ? "Immutable VIP qualification decisions in the period."
          : `Immutable VIP decisions with transition ${transition}.`,
        transition === "all"
          ? "COUNT(tier_decisions)."
          : `COUNT(tier_decisions) where transition = '${transition}'.`,
        { sources: tierSources },
      ),
    ),
    outcomeDefinition(
      "tiers.movements.members",
      "Members with tier movement",
      "Distinct wallets with a non-none VIP transition in the period.",
      "COUNT(DISTINCT wallet_id) where transition <> none.",
      { sources: tierSources, causalClass: "descriptive" },
    ),
    outcomeDefinition(
      "referrals.advocates.active",
      "Active advocates",
      "Advocates active at report as-of.",
      "COUNT(referral_advocates created before as-of and not disabled before as-of).",
      {
        sources: referralSources,
        timeBoundary:
          "Current as-of population rather than report-period flow.",
      },
    ),
    ...(
      [
        ["referrals.attributions", "Referral attributions", "all"],
        ["referrals.pending", "Pending referrals", "pending"],
        ["referrals.qualified", "Qualified referrals", "qualified"],
        ["referrals.rejected", "Rejected referrals", "rejected"],
        ["referrals.reversed", "Reversed referrals", "reversed"],
      ] as const
    ).map(([key, label, state]) =>
      outcomeDefinition(
        key,
        label,
        state === "all"
          ? "Canonical first attributions captured in the report period."
          : `Period attributions whose latest as-of state belongs to ${state}.`,
        state === "all"
          ? "COUNT(referral_attributions)."
          : `COUNT(attributions grouped by latest immutable ${state} state).`,
        { sources: referralSources, causalClass: "descriptive" },
      ),
    ),
    outcomeDefinition(
      "referrals.qualification_rate",
      "Observed referral qualification rate",
      "Share of period attributions currently qualified at report as-of.",
      "FLOOR(qualified * 10000 / attributions); zero when no attribution exists.",
      {
        sources: referralSources,
        causalClass: "descriptive",
        displayFormat: "basis_points",
        caveats: ["Pending and cooling referrals remain in the denominator."],
      },
    ),
    ...(
      [
        [
          "referrals.issuances",
          "Referral reward issuances",
          "COUNT(issuances)",
        ],
        [
          "referrals.compensations",
          "Referral compensations",
          "COUNT(compensations)",
        ],
      ] as const
    ).map(([key, label, formula]) =>
      outcomeDefinition(
        key,
        label,
        `${label} linked to period attributions and known by report as-of.`,
        formula,
        { sources: referralSources },
      ),
    ),
    ...(
      [
        [
          "referrals.advocate_points_issued",
          "Advocate points issued",
          "SUM(issuance.advocate_points)",
        ],
        [
          "referrals.friend_points_issued",
          "Friend points issued",
          "SUM(issuance.friend_points)",
        ],
        [
          "referrals.advocate_points_reversed",
          "Advocate points reversed",
          "SUM(compensated issuance.advocate_points)",
        ],
        [
          "referrals.friend_points_reversed",
          "Friend points reversed",
          "SUM(compensated issuance.friend_points)",
        ],
        [
          "referrals.advocate_points_net",
          "Net advocate points",
          "advocate points issued - advocate points reversed",
        ],
        [
          "referrals.friend_points_net",
          "Net friend points",
          "friend points issued - friend points reversed",
        ],
      ] as const
    ).map(([key, label, formula]) =>
      outcomeDefinition(
        key,
        label,
        `${label} for reward evidence linked to period referral attributions.`,
        formula,
        { sources: referralSources, displayFormat: "points" },
      ),
    ),
    ...(
      [
        [
          "campaigns.treatment_outcomes",
          "Campaign treatment outcomes",
          "COUNT(purchase effects and trigger executions that issued treatment value)",
        ],
        [
          "campaigns.control_outcomes",
          "Campaign control outcomes",
          "COUNT(purchase effects and trigger executions recorded as control)",
        ],
        [
          "campaigns.capacity_exhausted",
          "Campaign capacity exclusions",
          "COUNT(purchase effects and trigger executions rejected by capacity)",
        ],
        [
          "campaigns.suppressed",
          "Campaign suppressions",
          "COUNT(purchase effects with decision_outcome = suppressed)",
        ],
        [
          "campaigns.influenced_orders",
          "Influenced eligible orders",
          "COUNT(DISTINCT purchase execution batch with awarded treatment effect)",
        ],
        [
          "campaigns.influenced_members",
          "Influenced members",
          "COUNT(DISTINCT wallet receiving purchase or trigger treatment value)",
        ],
        [
          "campaigns.rewards_reserved",
          "Campaign rewards reserved",
          "COUNT(trigger executions with outcome = reward_reserved)",
        ],
        [
          "campaigns.manual_review_jobs",
          "Campaign jobs in manual review",
          "COUNT(trigger jobs whose latest state at as-of is manual_review)",
        ],
      ] as const
    ).map(([key, label, formula]) =>
      outcomeDefinition(
        key,
        label,
        `${label} from immutable campaign evidence.`,
        formula,
        {
          sources: campaignSources,
          causalClass: key.includes("influenced")
            ? "descriptive"
            : "operational",
        },
      ),
    ),
    outcomeDefinition(
      "campaigns.influenced_eligible_spend",
      "Influenced eligible spend",
      "Refund-compensated eligible spend on unique purchase orders with directly attributed treatment value.",
      "SUM(original eligible spend - latest cumulative refunded eligible spend) once per influenced purchase batch.",
      {
        sources: campaignSources,
        causalClass: "descriptive",
        currencyPolicy: "single_currency_minor_units",
        availability: "conditional",
        displayFormat: "currency_minor",
        caveats: [
          "Direct attribution is not incremental revenue and one order is counted once even when multiple effects match.",
        ],
      },
    ),
    ...(
      [
        [
          "campaigns.points_awarded_gross",
          "Campaign points awarded",
          "SUM(gross purchase-effect and trigger-allocation points)",
        ],
        [
          "campaigns.points_reversed",
          "Campaign points reversed",
          "SUM(purchase compensation and trigger reversal points)",
        ],
        [
          "campaigns.points_net",
          "Net campaign points",
          "gross campaign points - campaign points reversed",
        ],
      ] as const
    ).map(([key, label, formula]) =>
      outcomeDefinition(key, label, `${label} in the report period.`, formula, {
        sources: campaignSources,
        displayFormat: "points",
      }),
    ),
    outcomeDefinition(
      "campaigns.incremental_revenue",
      "Experimentally incremental revenue",
      "Causal revenue lift attributable to campaign treatment.",
      "Unavailable until a versioned estimator, population, window, exclusions, and sample evidence are implemented.",
      {
        sources: campaignSources,
        causalClass: "unavailable",
        currencyPolicy: "unavailable_without_experimental_estimator",
        availability: "unavailable",
        displayFormat: "currency_unavailable",
      },
    ),
    outcomeDefinition(
      "campaigns.incrementality_state",
      "Campaign incrementality state",
      "Whether a valid experimental estimator supports a causal revenue claim.",
      "Always unavailable: estimator_not_configured in report V1.",
      {
        sources: campaignSources,
        causalClass: "unavailable",
        currencyPolicy: "unavailable_without_experimental_estimator",
        availability: "unavailable",
      },
    ),
  ],
} satisfies AnalyticsMetricDictionaryV3;

const analyticsPeriodV1 = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    timeZone: z.literal("UTC"),
  })
  .strict();

const analyticsCurrencyScopeV1 = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      code: z.string().regex(/^[A-Z]{3}$/u),
      minorUnitDigits: z.int().min(0).max(6),
      reason: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      code: z.null(),
      minorUnitDigits: z.null(),
      reason: z.enum([
        "mixed_currency_scope",
        "programme_currency_unavailable",
      ]),
    })
    .strict(),
]);

export const analyticsProgrammeOutcomeReportV1 = z
  .object({
    reportVersion: z.literal("1"),
    dictionaryVersion: z.literal("3"),
    asOf: z.iso.datetime({ offset: true }),
    period: analyticsPeriodV1,
    rewards: z
      .object({
        requests: exactNonNegativeInteger,
        captures: exactNonNegativeInteger,
        capturedPoints: exactNonNegativeInteger,
        unresolvedAtAsOf: exactNonNegativeInteger,
        maturity: z
          .object({
            windowHours: z.literal(24),
            cohortFrom: z.iso.datetime({ offset: true }),
            cohortTo: z.iso.datetime({ offset: true }),
            requests: exactNonNegativeInteger,
            captures: exactNonNegativeInteger,
            unresolved: exactNonNegativeInteger,
            captureRateBasisPoints: exactNonNegativeInteger,
          })
          .strict(),
      })
      .strict(),
    tiers: z
      .object({
        decisions: exactNonNegativeInteger,
        movedMembers: exactNonNegativeInteger,
        entry: exactNonNegativeInteger,
        reentry: exactNonNegativeInteger,
        upgrade: exactNonNegativeInteger,
        grace: exactNonNegativeInteger,
        downgrade: exactNonNegativeInteger,
        manual: exactNonNegativeInteger,
        none: exactNonNegativeInteger,
      })
      .strict(),
    referrals: z
      .object({
        activeAdvocates: exactNonNegativeInteger,
        attributions: exactNonNegativeInteger,
        pending: exactNonNegativeInteger,
        qualified: exactNonNegativeInteger,
        rejected: exactNonNegativeInteger,
        reversed: exactNonNegativeInteger,
        qualificationRateBasisPoints: exactNonNegativeInteger,
        issuances: exactNonNegativeInteger,
        compensations: exactNonNegativeInteger,
        advocatePointsIssued: exactNonNegativeInteger,
        friendPointsIssued: exactNonNegativeInteger,
        advocatePointsReversed: exactNonNegativeInteger,
        friendPointsReversed: exactNonNegativeInteger,
        advocatePointsNet: exactNonNegativeInteger,
        friendPointsNet: exactNonNegativeInteger,
      })
      .strict(),
    campaigns: z
      .object({
        currency: analyticsCurrencyScopeV1,
        treatmentOutcomes: exactNonNegativeInteger,
        controlOutcomes: exactNonNegativeInteger,
        capacityExhausted: exactNonNegativeInteger,
        suppressed: exactNonNegativeInteger,
        influencedOrders: exactNonNegativeInteger,
        influencedMembers: exactNonNegativeInteger,
        influencedEligibleSpendMinor: exactNonNegativeInteger.nullable(),
        pointsAwardedGross: exactNonNegativeInteger,
        pointsReversed: exactNonNegativeInteger,
        pointsNet: exactNonNegativeInteger,
        rewardsReserved: exactNonNegativeInteger,
        manualReviewJobs: exactNonNegativeInteger,
        incrementality: z
          .object({
            status: z.literal("unavailable"),
            reason: z.literal("estimator_not_configured"),
            incrementalRevenueMinor: z.null(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    const from = Date.parse(report.period.from);
    const to = Date.parse(report.period.to);
    if (
      to !== Date.parse(report.asOf) ||
      to - from !== report.period.rangeDays * 86_400_000
    ) {
      context.addIssue({
        code: "custom",
        message: "Programme outcome period must match rangeDays and as-of",
        path: ["period"],
      });
    }
    if (
      Date.parse(report.rewards.maturity.cohortFrom) !==
        from - 24 * 3_600_000 ||
      Date.parse(report.rewards.maturity.cohortTo) !== to - 24 * 3_600_000
    ) {
      context.addIssue({
        code: "custom",
        message: "Reward realization cohort must be fully mature",
        path: ["rewards", "maturity"],
      });
    }
    const ratio = (numerator: string, denominator: string) =>
      BigInt(denominator) === 0n
        ? 0n
        : (BigInt(numerator) * 10_000n) / BigInt(denominator);
    if (
      BigInt(report.rewards.maturity.captureRateBasisPoints) !==
        ratio(
          report.rewards.maturity.captures,
          report.rewards.maturity.requests,
        ) ||
      BigInt(report.referrals.qualificationRateBasisPoints) !==
        ratio(report.referrals.qualified, report.referrals.attributions)
    ) {
      context.addIssue({
        code: "custom",
        message: "Programme outcome rate does not reconcile",
        path: ["rewards", "maturity", "captureRateBasisPoints"],
      });
    }
    const tierDecisionSum = [
      report.tiers.entry,
      report.tiers.reentry,
      report.tiers.upgrade,
      report.tiers.grace,
      report.tiers.downgrade,
      report.tiers.manual,
      report.tiers.none,
    ].reduce((total, value) => total + BigInt(value), 0n);
    const referralStateSum = [
      report.referrals.pending,
      report.referrals.qualified,
      report.referrals.rejected,
      report.referrals.reversed,
    ].reduce((total, value) => total + BigInt(value), 0n);
    if (
      tierDecisionSum !== BigInt(report.tiers.decisions) ||
      BigInt(report.tiers.movedMembers) >
        BigInt(report.tiers.decisions) - BigInt(report.tiers.none) ||
      referralStateSum !== BigInt(report.referrals.attributions) ||
      BigInt(report.rewards.maturity.captures) >
        BigInt(report.rewards.maturity.requests) ||
      BigInt(report.rewards.maturity.unresolved) >
        BigInt(report.rewards.maturity.requests)
    ) {
      context.addIssue({
        code: "custom",
        message: "Programme outcome counts do not reconcile",
        path: ["tiers"],
      });
    }
    const referralPointChecks = [
      [
        report.referrals.advocatePointsNet,
        BigInt(report.referrals.advocatePointsIssued) -
          BigInt(report.referrals.advocatePointsReversed),
      ],
      [
        report.referrals.friendPointsNet,
        BigInt(report.referrals.friendPointsIssued) -
          BigInt(report.referrals.friendPointsReversed),
      ],
      [
        report.campaigns.pointsNet,
        BigInt(report.campaigns.pointsAwardedGross) -
          BigInt(report.campaigns.pointsReversed),
      ],
    ] as const;
    if (
      referralPointChecks.some(
        ([actual, expected]) => expected < 0n || BigInt(actual) !== expected,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Programme outcome point movements do not reconcile",
        path: ["referrals"],
      });
    }
    if (
      BigInt(report.referrals.compensations) >
        BigInt(report.referrals.issuances) ||
      BigInt(report.referrals.advocatePointsReversed) >
        BigInt(report.referrals.advocatePointsIssued) ||
      BigInt(report.referrals.friendPointsReversed) >
        BigInt(report.referrals.friendPointsIssued)
    ) {
      context.addIssue({
        code: "custom",
        message: "Referral compensation exceeds issued value",
        path: ["referrals", "compensations"],
      });
    }
    if (
      (report.campaigns.currency.status === "available") !==
      (report.campaigns.influencedEligibleSpendMinor !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Campaign influenced spend must match exact currency scope",
        path: ["campaigns", "currency"],
      });
    }
  });

export type AnalyticsProgrammeOutcomeReportV1 = z.infer<
  typeof analyticsProgrammeOutcomeReportV1
>;
