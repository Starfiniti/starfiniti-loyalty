import { z } from "zod";
import {
  analyticsMetricDictionaryV3,
  analyticsMetricDefinitionV3,
  analyticsMetricKeyV3,
} from "./analytics-outcomes";

const exactNonNegativeInteger = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);
const exactSignedInteger = z.string().regex(/^(?:0|-?[1-9][0-9]*)$/u);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const ianaTimeZone = z.string().min(1).max(64);

const analyticsCohortMetricKeysV4 = [
  "cohorts.members.joined",
  "cohorts.members.activated_30d",
  "cohorts.members.activation_rate_30d",
  "cohorts.earning.qualified",
  "cohorts.earning.retained_days_31_60",
  "cohorts.earning.retention_rate_days_31_60",
  "experiments.campaigns.eligible",
  "experiments.campaigns.available",
  "experiments.campaigns.unavailable",
  "experiments.campaigns.treatment_members",
  "experiments.campaigns.control_members",
  "experiments.campaigns.treatment_eligible_spend",
  "experiments.campaigns.control_eligible_spend",
  "experiments.campaigns.incremental_eligible_spend",
] as const;

export const analyticsMetricKeyV4 = z.enum([
  ...analyticsMetricKeyV3.options,
  ...analyticsCohortMetricKeysV4,
]);

export const analyticsMetricDefinitionV4 = analyticsMetricDefinitionV3.extend({
  key: analyticsMetricKeyV4,
  timeZone: z.enum(["UTC", "report_parameter"]),
});

export const analyticsMetricDictionaryV4Schema = z
  .object({
    dictionaryVersion: z.literal("4"),
    effectiveFrom: z.iso.datetime({ offset: true }),
    definitions: z.array(analyticsMetricDefinitionV4).length(103),
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

export type AnalyticsMetricKeyV4 = z.infer<typeof analyticsMetricKeyV4>;
export type AnalyticsMetricDefinitionV4 = z.infer<
  typeof analyticsMetricDefinitionV4
>;
export type AnalyticsMetricDictionaryV4 = z.infer<
  typeof analyticsMetricDictionaryV4Schema
>;

type CohortDefinitionOptions = Readonly<{
  sources: readonly string[];
  formula: string;
  description: string;
  label: string;
  causalClass?: "operational" | "descriptive" | "experimental";
  availability?: "available" | "conditional";
  displayFormat?: "count" | "basis_points" | "currency_minor";
  currencyPolicy?:
    | "not_applicable"
    | "unavailable_if_mixed_currency"
    | "unavailable_without_experimental_estimator";
  timeBoundary?: string;
  caveats?: readonly string[];
}>;

const cohortDefinition = (
  key: (typeof analyticsCohortMetricKeysV4)[number],
  options: CohortDefinitionOptions,
) => ({
  key,
  label: options.label,
  description: options.description,
  formula: options.formula,
  sourceFields: [...options.sources],
  grain:
    "Selected organization and programme group; daily cohort rows disclose aggregates only.",
  timeBoundary:
    options.timeBoundary ??
    "Entry is grouped by the requested IANA local date; every member has a complete exact elapsed observation window before report as-of.",
  timeZone: "report_parameter" as const,
  currencyPolicy: options.currencyPolicy ?? ("not_applicable" as const),
  owner: "loyalty_analytics" as const,
  caveats: [...(options.caveats ?? [])],
  causalClass: options.causalClass ?? ("descriptive" as const),
  availability: options.availability ?? ("available" as const),
  displayFormat: options.displayFormat ?? ("count" as const),
});

const membershipSources = [
  "loyalty.wallets.created_at",
  "loyalty.point_lots.available_at",
  "loyalty.point_lots.created_at",
  "loyalty.ledger_transactions.transaction_kind",
] as const;
const experimentSources = [
  "loyalty.campaign_versions.starts_at",
  "loyalty.campaign_versions.ends_at",
  "loyalty_private.campaign_assignments.assignment",
  "loyalty_private.campaign_execution_batches.baseline_result.eligibleSpendMinor",
  "loyalty_private.campaign_purchase_refund_compensations.cumulative_refunded_eligible_spend_minor",
] as const;

export const analyticsMetricDictionaryV4 = {
  dictionaryVersion: "4",
  effectiveFrom: "2026-08-25T00:00:00Z",
  definitions: [
    ...analyticsMetricDictionaryV3.definitions,
    cohortDefinition("cohorts.members.joined", {
      label: "Joined members",
      description: "Wallets created in the mature membership cohort.",
      formula: "COUNT(wallets) grouped by wallet.created_at local date.",
      sources: membershipSources,
    }),
    cohortDefinition("cohorts.members.activated_30d", {
      label: "Members activated within 30 days",
      description:
        "Joined members whose first ledger-backed released earning became available within 30 elapsed days.",
      formula:
        "COUNT(cohort wallets with a release-backed point lot available in [joined_at, joined_at + 30 days]).",
      sources: membershipSources,
    }),
    cohortDefinition("cohorts.members.activation_rate_30d", {
      label: "30-day cohort activation rate",
      description: "Share of mature joined members activated within 30 days.",
      formula: "FLOOR(activated members * 10000 / joined members).",
      sources: membershipSources,
      displayFormat: "basis_points",
    }),
    cohortDefinition("cohorts.earning.qualified", {
      label: "First-earning cohort",
      description:
        "Members grouped by the local date of their first immutable released earning.",
      formula: "COUNT(wallets by MIN(point_lot.available_at)).",
      sources: membershipSources,
    }),
    cohortDefinition("cohorts.earning.retained_days_31_60", {
      label: "Members retained in days 31–60",
      description:
        "First-earning members with another distinct released earning after 30 and no later than 60 elapsed days.",
      formula:
        "COUNT(first-earning wallets with another release in (first_release + 30 days, first_release + 60 days]).",
      sources: membershipSources,
    }),
    cohortDefinition("cohorts.earning.retention_rate_days_31_60", {
      label: "Days 31–60 earning retention",
      description:
        "Share of mature first-earning members who earned again in the declared window.",
      formula: "FLOOR(retained members * 10000 / first-earning members).",
      sources: membershipSources,
      displayFormat: "basis_points",
      caveats: [
        "This is behavioral retention, not proof that loyalty caused the return.",
      ],
    }),
    cohortDefinition("experiments.campaigns.eligible", {
      label: "Eligible campaign experiments",
      description:
        "Campaign versions overlapping the report period with immutable treatment/control assignments.",
      formula: "COUNT(candidate campaign versions).",
      sources: experimentSources,
      timeBoundary:
        "Campaign schedule overlaps the UTC report period and was approved before report as-of.",
    }),
    cohortDefinition("experiments.campaigns.available", {
      label: "Measurable campaign experiments",
      description: "Candidate campaigns that pass every causal evidence gate.",
      formula: "COUNT(campaigns with incrementality.status = available).",
      sources: experimentSources,
      causalClass: "experimental",
      availability: "conditional",
    }),
    cohortDefinition("experiments.campaigns.unavailable", {
      label: "Unavailable campaign experiments",
      description: "Candidate campaigns whose causal evidence is incomplete.",
      formula: "COUNT(campaigns with incrementality.status = unavailable).",
      sources: experimentSources,
      availability: "conditional",
    }),
    cohortDefinition("experiments.campaigns.treatment_members", {
      label: "Treatment population",
      description:
        "All immutable treatment assignments, including zero outcomes.",
      formula: "COUNT(campaign_assignments WHERE assignment = treatment).",
      sources: experimentSources,
      causalClass: "experimental",
    }),
    cohortDefinition("experiments.campaigns.control_members", {
      label: "Control population",
      description:
        "All immutable control assignments, including zero outcomes.",
      formula: "COUNT(campaign_assignments WHERE assignment = control).",
      sources: experimentSources,
      causalClass: "experimental",
    }),
    cohortDefinition("experiments.campaigns.treatment_eligible_spend", {
      label: "Treatment eligible spend",
      description:
        "Refund-compensated eligible spend observed for treatment assignments during the immutable campaign window.",
      formula:
        "SUM(treatment net eligible spend minor), with zero-outcome members retained in the denominator.",
      sources: experimentSources,
      causalClass: "experimental",
      currencyPolicy: "unavailable_if_mixed_currency",
      displayFormat: "currency_minor",
    }),
    cohortDefinition("experiments.campaigns.control_eligible_spend", {
      label: "Control eligible spend",
      description:
        "Refund-compensated eligible spend observed for control assignments during the immutable campaign window.",
      formula:
        "SUM(control net eligible spend minor), with zero-outcome members retained in the denominator.",
      sources: experimentSources,
      causalClass: "experimental",
      currencyPolicy: "unavailable_if_mixed_currency",
      displayFormat: "currency_minor",
    }),
    cohortDefinition("experiments.campaigns.incremental_eligible_spend", {
      label: "Estimated incremental eligible spend",
      description:
        "Intention-to-treat difference-in-means point estimate for the treatment population.",
      formula:
        "ROUND((treatment spend / treatment N - control spend / control N) * treatment N); exact rational numerator = treatment spend * control N - control spend * treatment N, denominator = control N.",
      sources: experimentSources,
      causalClass: "experimental",
      availability: "conditional",
      currencyPolicy: "unavailable_without_experimental_estimator",
      displayFormat: "currency_minor",
      timeBoundary:
        "Outcomes occur in the immutable UTC campaign [starts_at, ends_at) window and are known before report as-of.",
      caveats: [
        "A point estimate is not statistical significance.",
        "The outcome is loyalty-eligible spend, not gross or accounting revenue.",
      ],
    }),
  ],
} satisfies AnalyticsMetricDictionaryV4;

const cohortRow = z
  .object({
    localDate,
    eligibleMembers: exactNonNegativeInteger,
    outcomeMembers: exactNonNegativeInteger,
    rateBasisPoints: exactNonNegativeInteger,
  })
  .strict();

const campaignIdentity = {
  campaignPublicId: z.uuid(),
  campaignVersionPublicId: z.uuid(),
  code: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u),
  versionNumber: z.int().positive(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  treatmentMembers: exactNonNegativeInteger,
  controlMembers: exactNonNegativeInteger,
} as const;

const unavailableExperiment = z
  .object({
    ...campaignIdentity,
    incrementality: z
      .object({
        status: z.literal("unavailable"),
        reason: z.enum([
          "incomplete_window",
          "unsupported_outcome",
          "assignment_reconciliation_failed",
          "insufficient_sample",
          "currency_unavailable",
          "purchase_evidence_unavailable",
        ]),
        estimator: z.literal("difference_in_means_itt_v1"),
        minimumMembersPerArm: z.literal(30),
        currencyCode: z.null(),
        minorUnitDigits: z.null(),
        treatmentEligibleSpendMinor: z.null(),
        controlEligibleSpendMinor: z.null(),
        exactNumerator: z.null(),
        exactDenominator: z.null(),
        estimatedIncrementalEligibleSpendMinor: z.null(),
        pointEstimateOnly: z.literal(true),
      })
      .strict(),
  })
  .strict();

const availableExperiment = z
  .object({
    ...campaignIdentity,
    incrementality: z
      .object({
        status: z.literal("available"),
        reason: z.literal("evidence_complete"),
        estimator: z.literal("difference_in_means_itt_v1"),
        minimumMembersPerArm: z.literal(30),
        currencyCode: z.string().regex(/^[A-Z]{3}$/u),
        minorUnitDigits: z.int().min(0).max(6),
        treatmentEligibleSpendMinor: exactNonNegativeInteger,
        controlEligibleSpendMinor: exactNonNegativeInteger,
        exactNumerator: exactSignedInteger,
        exactDenominator: exactNonNegativeInteger,
        estimatedIncrementalEligibleSpendMinor: exactSignedInteger,
        pointEstimateOnly: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const analyticsCohortRetentionReportV1 = z
  .object({
    reportVersion: z.literal("1"),
    dictionaryVersion: z.literal("4"),
    asOf: z.iso.datetime({ offset: true }),
    reportPeriod: z
      .object({
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
        rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
        timeZone: z.literal("UTC"),
      })
      .strict(),
    cohortPeriod: z
      .object({
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
        fromLocalDate: localDate,
        toLocalDateExclusive: localDate,
        rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
        timeZone: ianaTimeZone,
        maturityLagDays: z.literal(60),
        grain: z.literal("day"),
      })
      .strict(),
    membershipActivation: z
      .object({
        observationWindowDays: z.literal(30),
        joinedMembers: exactNonNegativeInteger,
        activatedMembers: exactNonNegativeInteger,
        activationRateBasisPoints: exactNonNegativeInteger,
        cohorts: z.array(cohortRow).min(7).max(90),
      })
      .strict(),
    earningRetention: z
      .object({
        qualification: z.literal("first_released_earning"),
        observationWindow: z
          .object({
            startsAfterDays: z.literal(30),
            endsAtDays: z.literal(60),
          })
          .strict(),
        qualifiedMembers: exactNonNegativeInteger,
        retainedMembers: exactNonNegativeInteger,
        retentionRateBasisPoints: exactNonNegativeInteger,
        cohorts: z.array(cohortRow).min(7).max(90),
      })
      .strict(),
    campaignExperiments: z
      .object({
        estimator: z.literal("difference_in_means_itt_v1"),
        population: z.literal("all_immutable_assignments"),
        outcome: z.literal("refund_compensated_eligible_spend_minor"),
        minimumMembersPerArm: z.literal(30),
        eligibleCampaigns: exactNonNegativeInteger,
        availableCampaigns: exactNonNegativeInteger,
        unavailableCampaigns: exactNonNegativeInteger,
        campaigns: z
          .array(z.union([availableExperiment, unavailableExperiment]))
          .max(100),
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    const ratio = (numerator: string, denominator: string) =>
      BigInt(denominator) === 0n
        ? 0n
        : (BigInt(numerator) * 10_000n) / BigInt(denominator);
    const checkCohorts = (
      cohorts: z.infer<typeof cohortRow>[],
      eligible: string,
      outcome: string,
      rate: string,
      path: (string | number)[],
    ) => {
      const eligibleSum = cohorts.reduce(
        (sum, row) => sum + BigInt(row.eligibleMembers),
        0n,
      );
      const outcomeSum = cohorts.reduce(
        (sum, row) => sum + BigInt(row.outcomeMembers),
        0n,
      );
      if (
        cohorts.length !== report.cohortPeriod.rangeDays ||
        eligibleSum !== BigInt(eligible) ||
        outcomeSum !== BigInt(outcome) ||
        BigInt(rate) !== ratio(outcome, eligible) ||
        cohorts.some(
          (row) =>
            BigInt(row.outcomeMembers) > BigInt(row.eligibleMembers) ||
            BigInt(row.rateBasisPoints) !==
              ratio(row.outcomeMembers, row.eligibleMembers),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Cohort rows and totals must reconcile",
          path,
        });
      }
    };

    if (
      Date.parse(report.reportPeriod.to) !== Date.parse(report.asOf) ||
      Date.parse(report.reportPeriod.to) -
        Date.parse(report.reportPeriod.from) !==
        report.reportPeriod.rangeDays * 86_400_000 ||
      report.reportPeriod.rangeDays !== report.cohortPeriod.rangeDays
    ) {
      context.addIssue({
        code: "custom",
        message: "Report period must match range and as-of",
        path: ["reportPeriod"],
      });
    }

    checkCohorts(
      report.membershipActivation.cohorts,
      report.membershipActivation.joinedMembers,
      report.membershipActivation.activatedMembers,
      report.membershipActivation.activationRateBasisPoints,
      ["membershipActivation", "cohorts"],
    );
    checkCohorts(
      report.earningRetention.cohorts,
      report.earningRetention.qualifiedMembers,
      report.earningRetention.retainedMembers,
      report.earningRetention.retentionRateBasisPoints,
      ["earningRetention", "cohorts"],
    );

    const experiments = report.campaignExperiments;
    const availableCount = experiments.campaigns.filter(
      (campaign) => campaign.incrementality.status === "available",
    ).length;
    if (
      BigInt(experiments.eligibleCampaigns) !==
        BigInt(experiments.campaigns.length) ||
      BigInt(experiments.availableCampaigns) !== BigInt(availableCount) ||
      BigInt(experiments.unavailableCampaigns) !==
        BigInt(experiments.campaigns.length - availableCount)
    ) {
      context.addIssue({
        code: "custom",
        message: "Campaign experiment counts must reconcile",
        path: ["campaignExperiments"],
      });
    }

    for (const [index, campaign] of experiments.campaigns.entries()) {
      const result = campaign.incrementality;
      if (result.status !== "available") continue;
      const exactNumerator =
        BigInt(result.treatmentEligibleSpendMinor) *
          BigInt(campaign.controlMembers) -
        BigInt(result.controlEligibleSpendMinor) *
          BigInt(campaign.treatmentMembers);
      const denominator = BigInt(campaign.controlMembers);
      const rounded =
        exactNumerator >= 0n
          ? (exactNumerator + denominator / 2n) / denominator
          : -((-exactNumerator + denominator / 2n) / denominator);
      if (
        BigInt(campaign.treatmentMembers) < 30n ||
        denominator < 30n ||
        BigInt(result.exactNumerator) !== exactNumerator ||
        BigInt(result.exactDenominator) !== denominator ||
        BigInt(result.estimatedIncrementalEligibleSpendMinor) !== rounded
      ) {
        context.addIssue({
          code: "custom",
          message: "Campaign incrementality arithmetic must reconcile",
          path: ["campaignExperiments", "campaigns", index],
        });
      }
    }
  });

export type AnalyticsCohortRetentionReportV1 = z.infer<
  typeof analyticsCohortRetentionReportV1
>;
