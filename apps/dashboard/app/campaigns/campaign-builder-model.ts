import {
  audienceDefinitionV1,
  campaignDefinitionV1,
  type AudienceDefinitionV1,
  type CampaignDefinitionV1,
} from "@starfiniti/contracts";
import { parseLocalDateTimeInTimeZone } from "@/lib/merchant-date-time";

const windowedMetrics = new Set([
  "eligible_spend",
  "earned_points",
  "order_count",
  "referral_count",
  "verified_action_count",
]);

const list = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const nullablePositive = (value: string) =>
  /^[1-9][0-9]*$/u.test(value.trim()) ? value.trim() : null;

export type AudienceConditionInput = Readonly<{
  kind: "metric" | "tier";
  metric: string;
  operator: "at_least" | "at_most" | "between";
  minimum: string;
  maximum: string;
  windowKind: "lifetime" | "rolling_days";
  rollingDays: string;
  activityCodes: string;
  tierOperator: "in" | "not_in";
  tierCodes: string;
}>;

export type AudienceDraftInput = Readonly<{
  code: string;
  name: string;
  description: string;
  match: "all" | "any";
  conditions: readonly AudienceConditionInput[];
}>;

export function buildAudienceDefinition(
  input: AudienceDraftInput,
): AudienceDefinitionV1 | null {
  const conditions = input.conditions.map((condition) => {
    if (condition.kind === "tier") {
      return {
        kind: "tier",
        operator: condition.tierOperator,
        tierCodes: list(condition.tierCodes),
      };
    }
    const needsWindow = windowedMetrics.has(condition.metric);
    return {
      kind: "metric",
      metric: condition.metric,
      operator: condition.operator,
      minimum: condition.minimum.trim(),
      maximum:
        condition.operator === "between" ? condition.maximum.trim() : null,
      window: needsWindow
        ? condition.windowKind === "rolling_days"
          ? { kind: "rolling_days", days: Number(condition.rollingDays) }
          : { kind: "lifetime" }
        : null,
      activityCodes:
        condition.metric === "verified_action_count"
          ? list(condition.activityCodes)
          : [],
    };
  });
  const parsed = audienceDefinitionV1.safeParse({
    schemaVersion: "1",
    code: input.code.trim().toLowerCase(),
    name: input.name.trim(),
    description: input.description.trim(),
    match: input.match,
    conditions,
  });
  return parsed.success ? parsed.data : null;
}

export function audienceDraftInputFromDefinition(
  definition: AudienceDefinitionV1,
): AudienceDraftInput {
  return {
    code: definition.code,
    name: definition.name,
    description: definition.description,
    match: definition.match,
    conditions: definition.conditions.map((condition) =>
      condition.kind === "tier"
        ? {
            ...blankAudienceConditionInput(),
            kind: "tier" as const,
            tierOperator: condition.operator,
            tierCodes: condition.tierCodes.join(", "),
          }
        : {
            ...blankAudienceConditionInput(),
            metric: condition.metric,
            operator: condition.operator,
            minimum: condition.minimum,
            maximum: condition.maximum ?? "",
            windowKind:
              condition.window?.kind === "rolling_days"
                ? ("rolling_days" as const)
                : ("lifetime" as const),
            rollingDays:
              condition.window?.kind === "rolling_days"
                ? String(condition.window.days)
                : "30",
            activityCodes: condition.activityCodes.join(", "),
          },
    ),
  };
}

function blankAudienceConditionInput(): AudienceConditionInput {
  return {
    kind: "metric",
    metric: "available_points",
    operator: "at_least",
    minimum: "0",
    maximum: "",
    windowKind: "lifetime",
    rollingDays: "30",
    activityCodes: "",
    tierOperator: "in",
    tierCodes: "rose",
  };
}

export type CampaignDraftInput = Readonly<{
  code: string;
  name: string;
  description: string;
  audienceSnapshotId: string;
  exclusionSnapshotIds: readonly string[];
  timezone: string;
  startsLocal: string;
  endsLocal: string;
  behaviorKind:
    | "bonus_points"
    | "purchase_multiplier"
    | "milestone"
    | "win_back"
    | "tier"
    | "referral"
    | "limited_quantity";
  earningRuleCodes: string;
  points: string;
  multiplierBasisPoints: string;
  priority: string;
  milestoneMetric: string;
  milestoneThreshold: string;
  activityCodes: string;
  minimumInactiveDays: string;
  minimumEligibleSpendMinor: string;
  tierMovement: "entry" | "retention" | "re_entry";
  tierCodes: string;
  referralParty: "advocate" | "friend";
  rewardKind: "points" | "programme_reward";
  rewardId: string;
  globalEffectLimit: string;
  perMemberEffectLimit: string;
  maximumPoints: string;
  maximumLiabilityMinor: string;
  liabilityMinorPerEffect: string;
  liabilityCurrencyCode: string;
  liabilityMinorUnitDigits: string;
  controlBasisPoints: string;
}>;

export type CampaignRewardLiability = Readonly<{
  id: string;
  amountMinor: string;
  currencyCode: string;
  currencyMinorUnitDigits: number;
}>;

function campaignReward(input: CampaignDraftInput) {
  return input.rewardKind === "programme_reward"
    ? { kind: "programme_reward" as const, rewardId: input.rewardId }
    : { kind: "points" as const, points: input.points.trim() };
}

function campaignBehavior(input: CampaignDraftInput) {
  switch (input.behaviorKind) {
    case "bonus_points":
      return {
        kind: "bonus_points" as const,
        earningRuleCodes: list(input.earningRuleCodes),
        reward: { kind: "points" as const, points: input.points.trim() },
      };
    case "purchase_multiplier":
      return {
        kind: "purchase_multiplier" as const,
        earningRuleCodes: list(input.earningRuleCodes),
        multiplierBasisPoints: Number(input.multiplierBasisPoints),
        priority: Number(input.priority),
      };
    case "milestone":
      return {
        kind: "milestone" as const,
        metric: input.milestoneMetric,
        threshold: input.milestoneThreshold.trim(),
        activityCodes:
          input.milestoneMetric === "verified_action_count"
            ? list(input.activityCodes)
            : [],
        reward: campaignReward(input),
      };
    case "win_back":
      return {
        kind: "win_back" as const,
        minimumInactiveDays: Number(input.minimumInactiveDays),
        minimumEligibleSpendMinor: input.minimumEligibleSpendMinor.trim(),
        reward: campaignReward(input),
      };
    case "tier":
      return {
        kind: "tier" as const,
        movement: input.tierMovement,
        tierCodes: list(input.tierCodes),
        reward: campaignReward(input),
      };
    case "referral":
      return {
        kind: "referral" as const,
        rewardedParty: input.referralParty,
        reward: campaignReward(input),
      };
    case "limited_quantity":
      return {
        kind: "limited_quantity" as const,
        reward: {
          kind: "programme_reward" as const,
          rewardId: input.rewardId,
        },
      };
  }
}

export function buildCampaignDefinition(
  input: CampaignDraftInput,
  rewardLiabilities: readonly CampaignRewardLiability[] = [],
): CampaignDefinitionV1 | null {
  const start = parseLocalDateTimeInTimeZone(input.startsLocal, input.timezone);
  const end = parseLocalDateTimeInTimeZone(input.endsLocal, input.timezone);
  if (!start || !end) return null;
  const behavior = campaignBehavior(input);
  const reward = "reward" in behavior ? behavior.reward : null;
  const issuesPoints =
    behavior.kind === "purchase_multiplier" || reward?.kind === "points";
  const usesNativeReward = reward?.kind === "programme_reward";
  const nativeLiability = usesNativeReward
    ? rewardLiabilities.find((candidate) => candidate.id === reward.rewardId)
    : null;
  if (usesNativeReward && !nativeLiability) return null;
  const parsed = campaignDefinitionV1.safeParse({
    schemaVersion: "1",
    code: input.code.trim().toLowerCase(),
    name: input.name.trim(),
    description: input.description.trim(),
    audienceSnapshotId: input.audienceSnapshotId,
    exclusionSnapshotIds: input.exclusionSnapshotIds,
    schedule: {
      timezone: input.timezone,
      startsAt: start.toISOString(),
      startsLocal: `${input.startsLocal}:00`,
      endsAt: end.toISOString(),
      endsLocal: `${input.endsLocal}:00`,
    },
    behavior,
    capacity: {
      globalEffectLimit: input.globalEffectLimit.trim(),
      perMemberEffectLimit:
        behavior.kind === "limited_quantity"
          ? 1
          : Number(input.perMemberEffectLimit),
      maximumPoints: issuesPoints
        ? nullablePositive(input.maximumPoints)
        : null,
      maximumLiabilityMinor: usesNativeReward
        ? nullablePositive(input.maximumLiabilityMinor)
        : null,
      liabilityMinorPerEffect: usesNativeReward
        ? nativeLiability?.amountMinor
        : null,
      liabilityCurrencyCode: usesNativeReward
        ? nativeLiability?.currencyCode
        : null,
      liabilityMinorUnitDigits: usesNativeReward
        ? nativeLiability?.currencyMinorUnitDigits
        : null,
    },
    controlBasisPoints: Number(input.controlBasisPoints),
  });
  return parsed.success ? parsed.data : null;
}

export function campaignDraftInputFromDefinition(
  definition: CampaignDefinitionV1,
): CampaignDraftInput {
  const behavior = definition.behavior;
  const reward = "reward" in behavior ? behavior.reward : null;
  return {
    code: definition.code,
    name: definition.name,
    description: definition.description,
    audienceSnapshotId: definition.audienceSnapshotId,
    exclusionSnapshotIds: definition.exclusionSnapshotIds,
    timezone: definition.schedule.timezone,
    startsLocal: definition.schedule.startsLocal.slice(0, 16),
    endsLocal: definition.schedule.endsLocal.slice(0, 16),
    behaviorKind: behavior.kind,
    earningRuleCodes:
      "earningRuleCodes" in behavior
        ? behavior.earningRuleCodes.join(", ")
        : "purchase-base",
    points: reward?.kind === "points" ? reward.points : "100",
    multiplierBasisPoints:
      behavior.kind === "purchase_multiplier"
        ? String(behavior.multiplierBasisPoints)
        : "20000",
    priority:
      behavior.kind === "purchase_multiplier"
        ? String(behavior.priority)
        : "100",
    milestoneMetric:
      behavior.kind === "milestone" ? behavior.metric : "order_count",
    milestoneThreshold:
      behavior.kind === "milestone" ? behavior.threshold : "5",
    activityCodes:
      behavior.kind === "milestone" ? behavior.activityCodes.join(", ") : "",
    minimumInactiveDays:
      behavior.kind === "win_back"
        ? String(behavior.minimumInactiveDays)
        : "30",
    minimumEligibleSpendMinor:
      behavior.kind === "win_back" ? behavior.minimumEligibleSpendMinor : "0",
    tierMovement: behavior.kind === "tier" ? behavior.movement : "entry",
    tierCodes:
      behavior.kind === "tier" ? behavior.tierCodes.join(", ") : "bloom",
    referralParty:
      behavior.kind === "referral" ? behavior.rewardedParty : "advocate",
    rewardKind: reward?.kind ?? "points",
    rewardId: reward?.kind === "programme_reward" ? reward.rewardId : "",
    globalEffectLimit: definition.capacity.globalEffectLimit,
    perMemberEffectLimit: String(definition.capacity.perMemberEffectLimit),
    maximumPoints: definition.capacity.maximumPoints ?? "100000",
    maximumLiabilityMinor:
      definition.capacity.maximumLiabilityMinor ?? "500000",
    liabilityMinorPerEffect:
      definition.capacity.liabilityMinorPerEffect ?? "500",
    liabilityCurrencyCode: definition.capacity.liabilityCurrencyCode ?? "EUR",
    liabilityMinorUnitDigits: String(
      definition.capacity.liabilityMinorUnitDigits ?? 2,
    ),
    controlBasisPoints: String(definition.controlBasisPoints),
  };
}
