import {
  calculateOrderAward,
  tierCode,
  type ProgrammeVersion,
  type TierCode,
} from "./programme";
import { minorUnit, points, type MinorUnit, type Points } from "./values";

export interface OrderLineFact {
  readonly lineId: string;
  readonly lineKind?: "product" | "shipping" | "tax" | "fee";
  readonly productId: string;
  readonly categoryIds: readonly string[];
  readonly collectionIds?: readonly string[];
  readonly grossMinor: MinorUnit;
  readonly discountMinor: MinorUnit;
  readonly refundedMinor: MinorUnit;
  readonly paymentKind: "money" | "gift-card" | "store-credit";
}

export interface OrderAwardFact {
  readonly orderId: string;
  readonly currencyCode: string;
  readonly market: string;
  readonly channel: string;
  readonly customerSegments: readonly string[];
  readonly occurredAt: string;
  readonly tierCodeSnapshot: TierCode;
  readonly lines: readonly OrderLineFact[];
}

export interface RuleCondition {
  readonly productIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly collectionIds?: readonly string[];
  readonly currencyCodes?: readonly string[];
  readonly markets?: readonly string[];
  readonly channels?: readonly string[];
  readonly customerSegments?: readonly string[];
  readonly startsAt?: string;
  readonly endsAt?: string;
}

export type AwardRule =
  | {
      readonly id: string;
      readonly priority: number;
      readonly kind: "exclude";
      readonly condition: RuleCondition;
      readonly reason: string;
    }
  | {
      readonly id: string;
      readonly priority: number;
      readonly kind: "rate";
      readonly condition: RuleCondition;
      readonly pointsPerMajorUnit: Points;
      readonly reason: string;
    };

export interface OrderLineExplanation {
  readonly lineId: string;
  readonly grossMinor: MinorUnit;
  readonly discountMinor: MinorUnit;
  readonly refundedMinor: MinorUnit;
  readonly eligibleSpendMinor: MinorUnit;
  readonly pointsPerMajorUnit: Points;
  readonly appliedRuleId: string;
  readonly outcome: "included" | "excluded";
  readonly reason: string;
}

export interface OrderAwardEvaluation {
  readonly programmeVersionId: string;
  readonly orderId: string;
  readonly tierCodeSnapshot: TierCode;
  readonly eligibleSpendMinor: MinorUnit;
  readonly awardedPoints: Points;
  readonly pendingAt: string;
  readonly availableAt: string;
  readonly expiresAt: string;
  readonly explanation: readonly OrderLineExplanation[];
}

export type RewardDefinition =
  | {
      readonly id: string;
      readonly kind: "fixed_discount";
      readonly costPoints: Points;
      readonly amountMinor: MinorUnit;
    }
  | {
      readonly id: string;
      readonly kind: "percentage_discount";
      readonly costPoints: Points;
      readonly percentageBasisPoints: number;
      readonly maximumDiscountMinor: MinorUnit | null;
    }
  | {
      readonly id: string;
      readonly kind: "free_product";
      readonly costPoints: Points;
      readonly productId: string;
    }
  | {
      readonly id: string;
      readonly kind:
        "free_shipping" | "store_credit" | "exclusive_access" | "custom";
      readonly costPoints: Points;
      readonly configuration: Readonly<Record<string, unknown>>;
    };

export interface RewardQuote {
  readonly rewardId: string;
  readonly kind: RewardDefinition["kind"];
  readonly costPoints: Points;
  readonly configuration: Readonly<Record<string, unknown>>;
}

export interface TierActivityFact {
  readonly occurredAt: string;
  readonly eligibleSpendMinor: MinorUnit;
  readonly earnedPoints: Points;
  readonly orderCount: number;
}

export type TierQualificationPolicy =
  | {
      readonly period: "lifetime";
      readonly metric: "spend" | "points" | "orders";
    }
  | {
      readonly period: "rolling";
      readonly metric: "spend" | "points" | "orders";
      readonly days: number;
    }
  | {
      readonly period: "calendar";
      readonly metric: "spend" | "points" | "orders";
      readonly unit: "month" | "quarter" | "year";
    };

export interface TierQualificationResult {
  readonly metric: TierQualificationPolicy["metric"];
  readonly period: TierQualificationPolicy["period"];
  readonly value: number;
  readonly windowStartsAt: string | null;
  readonly windowEndsAt: string;
}

function requireNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) throw new TypeError(`${name} cannot be empty`);
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}

function parseInstant(value: string, name: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${name} is invalid`);
  return parsed;
}

function calendarWindowStart(
  asOf: Date,
  unit: "month" | "quarter" | "year",
): Date {
  const month =
    unit === "year"
      ? 0
      : unit === "quarter"
        ? Math.floor(asOf.getUTCMonth() / 3) * 3
        : asOf.getUTCMonth();
  return new Date(Date.UTC(asOf.getUTCFullYear(), month, 1));
}

function matchesAny(
  required: readonly string[] | undefined,
  actual: readonly string[],
): boolean {
  return (
    required === undefined || required.some((value) => actual.includes(value))
  );
}

function conditionMatches(
  condition: RuleCondition,
  order: OrderAwardFact,
  line: OrderLineFact,
): boolean {
  const occurredAt = parseInstant(order.occurredAt, "Order occurrence");
  const startsAt = condition.startsAt
    ? parseInstant(condition.startsAt, "Rule start")
    : null;
  const endsAt = condition.endsAt
    ? parseInstant(condition.endsAt, "Rule end")
    : null;
  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new RangeError("Rule end must follow rule start");
  }
  return (
    matchesAny(condition.productIds, [line.productId]) &&
    matchesAny(condition.categoryIds, line.categoryIds) &&
    matchesAny(condition.collectionIds, line.collectionIds ?? []) &&
    matchesAny(condition.currencyCodes, [order.currencyCode]) &&
    matchesAny(condition.markets, [order.market]) &&
    matchesAny(condition.channels, [order.channel]) &&
    matchesAny(condition.customerSegments, order.customerSegments) &&
    (!startsAt || occurredAt >= startsAt) &&
    (!endsAt || occurredAt < endsAt)
  );
}

export function validateAwardRules(
  rules: readonly AwardRule[],
): readonly AwardRule[] {
  const ids = new Set<string>();
  for (const rule of rules) {
    requireNonEmpty(rule.id, "Rule ID");
    requireNonEmpty(rule.reason, "Rule reason");
    if (!Number.isSafeInteger(rule.priority)) {
      throw new TypeError("Rule priority must be a safe integer");
    }
    if (ids.has(rule.id)) throw new TypeError(`Duplicate rule ID: ${rule.id}`);
    ids.add(rule.id);
    if (rule.kind === "rate") {
      requirePositiveInteger(rule.pointsPerMajorUnit, "Rule earn rate");
    }
    if (rule.condition.startsAt)
      parseInstant(rule.condition.startsAt, "Rule start");
    if (rule.condition.endsAt) parseInstant(rule.condition.endsAt, "Rule end");
    if (
      rule.condition.startsAt &&
      rule.condition.endsAt &&
      new Date(rule.condition.startsAt) >= new Date(rule.condition.endsAt)
    ) {
      throw new RangeError("Rule end must follow rule start");
    }
  }
  return rules;
}

export function evaluateOrderAward(
  programme: ProgrammeVersion,
  rules: readonly AwardRule[],
  order: OrderAwardFact,
): OrderAwardEvaluation {
  requireNonEmpty(order.orderId, "Order ID");
  if (order.currencyCode !== programme.currencyCode) {
    throw new RangeError(`Order currency must be ${programme.currencyCode}`);
  }
  const occurredAt = parseInstant(
    order.occurredAt,
    "Order occurrence",
  ).toISOString();
  const tier = programme.tiers.find(
    (candidate) => candidate.code === order.tierCodeSnapshot,
  );
  if (!tier) throw new TypeError(`Unknown tier: ${order.tierCodeSnapshot}`);
  validateAwardRules(rules);
  const orderedRules = [...rules].sort(
    (left, right) =>
      right.priority - left.priority || left.id.localeCompare(right.id),
  );

  let eligibleSpend = 0;
  let awardNumerator = 0n;
  const explanation: OrderLineExplanation[] = [];
  const lineIds = new Set<string>();
  for (const line of order.lines) {
    requireNonEmpty(line.lineId, "Order line ID");
    requireNonEmpty(line.productId, "Product ID");
    if (lineIds.has(line.lineId))
      throw new TypeError(`Duplicate order line ID: ${line.lineId}`);
    lineIds.add(line.lineId);
    requireNonNegativeInteger(line.grossMinor, "Line gross");
    requireNonNegativeInteger(line.discountMinor, "Line discount");
    requireNonNegativeInteger(line.refundedMinor, "Line refunded amount");
    if (line.discountMinor + line.refundedMinor > line.grossMinor) {
      throw new RangeError("Line discounts and refunds exceed gross value");
    }

    const netMinor = minorUnit(
      line.grossMinor - line.discountMinor - line.refundedMinor,
    );
    const matched = orderedRules.find((rule) =>
      conditionMatches(rule.condition, order, line),
    );
    const exclusionRule = matched?.kind === "exclude" ? matched : null;
    const paymentExcluded = line.paymentKind !== "money";
    const lineKind = line.lineKind ?? "product";
    const componentExcluded = lineKind !== "product";
    if (paymentExcluded || componentExcluded || exclusionRule) {
      explanation.push({
        lineId: line.lineId,
        grossMinor: line.grossMinor,
        discountMinor: line.discountMinor,
        refundedMinor: line.refundedMinor,
        eligibleSpendMinor: minorUnit(0),
        pointsPerMajorUnit: points(0),
        appliedRuleId: paymentExcluded
          ? `payment:${line.paymentKind}`
          : componentExcluded
            ? `component:${lineKind}`
            : exclusionRule!.id,
        outcome: "excluded",
        reason: paymentExcluded
          ? `${line.paymentKind} payments are excluded`
          : componentExcluded
            ? `${lineKind} components are excluded`
            : exclusionRule!.reason,
      });
      continue;
    }

    const rate =
      matched?.kind === "rate"
        ? matched.pointsPerMajorUnit
        : tier.pointsPerMajorUnit;
    eligibleSpend += netMinor;
    awardNumerator += BigInt(netMinor) * BigInt(rate);
    explanation.push({
      lineId: line.lineId,
      grossMinor: line.grossMinor,
      discountMinor: line.discountMinor,
      refundedMinor: line.refundedMinor,
      eligibleSpendMinor: netMinor,
      pointsPerMajorUnit: rate,
      appliedRuleId: matched?.id ?? `tier:${tier.code}`,
      outcome: "included",
      reason: matched?.reason ?? `${tier.name} tier base rate`,
    });
  }
  if (!Number.isSafeInteger(eligibleSpend))
    throw new RangeError("Eligible spend exceeds safe range");
  const awarded = awardNumerator / BigInt(programme.minorUnitsPerMajor);
  if (awarded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Awarded points exceed safe range");
  }
  const lifecycle = calculateOrderAward(programme, {
    eligibleSpendMinor: minorUnit(0),
    tierCodeSnapshot: tierCode(order.tierCodeSnapshot),
    pendingAt: occurredAt,
  });
  return {
    programmeVersionId: programme.id,
    orderId: order.orderId,
    tierCodeSnapshot: order.tierCodeSnapshot,
    eligibleSpendMinor: minorUnit(eligibleSpend),
    awardedPoints: points(Number(awarded)),
    pendingAt: lifecycle.pendingAt,
    availableAt: lifecycle.availableAt,
    expiresAt: lifecycle.expiresAt,
    explanation,
  };
}

export function simulateOrderAward(
  programme: ProgrammeVersion,
  rules: readonly AwardRule[],
  order: OrderAwardFact,
): OrderAwardEvaluation {
  return evaluateOrderAward(programme, rules, order);
}

export function evaluateTierQualification(
  facts: readonly TierActivityFact[],
  policy: TierQualificationPolicy,
  asOfValue: string,
): TierQualificationResult {
  const asOf = parseInstant(asOfValue, "Tier evaluation instant");
  let startsAt: Date | null = null;
  if (policy.period === "rolling") {
    requirePositiveInteger(policy.days, "Rolling tier days");
    startsAt = new Date(asOf);
    startsAt.setUTCDate(startsAt.getUTCDate() - policy.days);
  } else if (policy.period === "calendar") {
    startsAt = calendarWindowStart(asOf, policy.unit);
  }
  let value = 0;
  for (const fact of facts) {
    const occurredAt = parseInstant(fact.occurredAt, "Tier activity instant");
    requireNonNegativeInteger(fact.eligibleSpendMinor, "Tier activity spend");
    requireNonNegativeInteger(fact.earnedPoints, "Tier activity points");
    requireNonNegativeInteger(fact.orderCount, "Tier activity order count");
    if (occurredAt > asOf || (startsAt && occurredAt < startsAt)) continue;
    value +=
      policy.metric === "spend"
        ? fact.eligibleSpendMinor
        : policy.metric === "points"
          ? fact.earnedPoints
          : fact.orderCount;
    if (!Number.isSafeInteger(value)) {
      throw new RangeError("Tier qualification value exceeds safe range");
    }
  }
  return {
    metric: policy.metric,
    period: policy.period,
    value,
    windowStartsAt: startsAt?.toISOString() ?? null,
    windowEndsAt: asOf.toISOString(),
  };
}

export function quoteReward(definition: RewardDefinition): RewardQuote {
  requireNonEmpty(definition.id, "Reward ID");
  requirePositiveInteger(definition.costPoints, "Reward cost");
  switch (definition.kind) {
    case "fixed_discount":
      requirePositiveInteger(definition.amountMinor, "Fixed discount amount");
      return {
        rewardId: definition.id,
        kind: definition.kind,
        costPoints: definition.costPoints,
        configuration: { amountMinor: definition.amountMinor },
      };
    case "percentage_discount":
      if (
        !Number.isSafeInteger(definition.percentageBasisPoints) ||
        definition.percentageBasisPoints < 1 ||
        definition.percentageBasisPoints > 10_000
      ) {
        throw new RangeError(
          "Percentage reward must be between 1 and 10000 basis points",
        );
      }
      if (definition.maximumDiscountMinor !== null) {
        requirePositiveInteger(
          definition.maximumDiscountMinor,
          "Maximum discount",
        );
      }
      return {
        rewardId: definition.id,
        kind: definition.kind,
        costPoints: definition.costPoints,
        configuration: {
          percentageBasisPoints: definition.percentageBasisPoints,
          maximumDiscountMinor: definition.maximumDiscountMinor,
        },
      };
    case "free_product":
      requireNonEmpty(definition.productId, "Reward product ID");
      return {
        rewardId: definition.id,
        kind: definition.kind,
        costPoints: definition.costPoints,
        configuration: { productId: definition.productId },
      };
    default:
      return {
        rewardId: definition.id,
        kind: definition.kind,
        costPoints: definition.costPoints,
        configuration: definition.configuration,
      };
  }
}
