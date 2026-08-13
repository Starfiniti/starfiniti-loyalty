import type {
  EarningRuleConditionsV2,
  EarningRuleV2,
  EarningSourceV2,
  ProgrammeDefinitionV2,
  PurchaseExclusionsV2,
} from "@starfiniti/contracts/programme-v2";

const BASIS_POINTS = 10_000n;

export interface PurchaseLineFactV2 {
  readonly lineId: string;
  readonly productId: string;
  readonly categoryIds: readonly string[];
  readonly grossMinor: string;
  readonly discountMinor: string;
  readonly refundedMinor: string;
  readonly paymentKind: "money" | "gift-card" | "store-credit";
}

interface EarningFactBaseV2 {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly channel: string;
  readonly segmentCodes: readonly string[];
  readonly tierCode: string;
  readonly memberRuleUsage: Readonly<Record<string, string>>;
}

export interface PurchaseEarningFactV2 extends EarningFactBaseV2 {
  readonly source: "purchase";
  readonly currencyCode: string;
  readonly market: string;
  readonly lines: readonly PurchaseLineFactV2[];
  readonly shippingMinor: string;
  readonly shippingRefundedMinor: string;
  readonly taxMinor: string;
  readonly taxRefundedMinor: string;
  readonly feeMinor: string;
  readonly feeRefundedMinor: string;
}

export interface ActivityEarningFactV2 extends EarningFactBaseV2 {
  readonly source: Exclude<EarningSourceV2, "purchase">;
  readonly verified: boolean;
  readonly activityReference: string;
  readonly activityCode: string;
  readonly productId: string | null;
  readonly categoryIds: readonly string[];
}

export type EarningFactV2 = PurchaseEarningFactV2 | ActivityEarningFactV2;

export interface EarningRuleContributionV2 {
  readonly ruleCode: string;
  readonly effectKind: EarningRuleV2["effect"]["kind"];
  readonly uncappedPoints: string;
  readonly awardedPoints: string;
  readonly uncappedNumerator: string;
  readonly awardedNumerator: string;
  readonly denominator: string;
  readonly capApplied: "none" | "per_event" | "per_member";
}

export interface PurchaseLineExplanationV2 {
  readonly lineId: string;
  readonly eligibleSpendMinor: string;
  readonly outcome: "included" | "excluded";
  readonly reason: string;
}

export interface EarningEvaluationV2 {
  readonly version: "2";
  readonly eventId: string;
  readonly source: EarningSourceV2;
  readonly eligibleSpendMinor: string;
  readonly awardedPoints: string;
  readonly tierCodeSnapshot: string;
  readonly pendingAt: string;
  readonly availableAt: string;
  readonly expiresAt: string;
  readonly selectedMultiplierRuleCode: string | null;
  readonly contributions: readonly EarningRuleContributionV2[];
  readonly lines: readonly PurchaseLineExplanationV2[];
}

export interface EarningRuleConflictV2 {
  readonly code: "equal_priority_multiplier_overlap" | "duplicate_rule_code";
  readonly ruleCodes: readonly string[];
  readonly message: string;
}

function parseNonNegative(value: string, name: string): bigint {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new TypeError(`${name} must be a non-negative integer string`);
  }
  return BigInt(value);
}

function parsePositive(value: string, name: string): bigint {
  const parsed = parseNonNegative(value, name);
  if (parsed === 0n) throw new RangeError(`${name} must be positive`);
  return parsed;
}

function parseInstant(value: string, name: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime()))
    throw new TypeError(`${name} is invalid`);
  return instant;
}

function plusDays(value: Date, days: number): string {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

function matchesAny(
  configured: readonly string[],
  actual: readonly string[],
): boolean {
  return (
    configured.length === 0 || configured.some((item) => actual.includes(item))
  );
}

function commonConditionsMatch(
  conditions: EarningRuleConditionsV2,
  fact: EarningFactV2,
): boolean {
  const occurredAt = parseInstant(fact.occurredAt, "Event occurrence");
  const startsAt =
    conditions.startsAt === null
      ? null
      : parseInstant(conditions.startsAt, "Rule start");
  const endsAt =
    conditions.endsAt === null
      ? null
      : parseInstant(conditions.endsAt, "Rule end");
  return (
    matchesAny(conditions.channels, [fact.channel]) &&
    (fact.source === "purchase" ||
      matchesAny(conditions.activityCodes, [fact.activityCode])) &&
    matchesAny(conditions.segmentCodes, fact.segmentCodes) &&
    matchesAny(conditions.tierCodes, [fact.tierCode]) &&
    (!startsAt || occurredAt >= startsAt) &&
    (!endsAt || occurredAt < endsAt) &&
    (fact.source !== "purchase" ||
      (matchesAny(conditions.currencyCodes, [fact.currencyCode]) &&
        matchesAny(conditions.markets, [fact.market]))) &&
    (fact.source !== "verified_product_review" ||
      (fact.productId !== null &&
        matchesAny(conditions.productIds, [fact.productId]) &&
        matchesAny(conditions.categoryIds, fact.categoryIds)))
  );
}

function lineConditionMatches(
  conditions: EarningRuleConditionsV2,
  line: PurchaseLineFactV2,
): boolean {
  return (
    matchesAny(conditions.productIds, [line.productId]) &&
    matchesAny(conditions.categoryIds, line.categoryIds)
  );
}

function isExplicitlyExcluded(
  exclusions: PurchaseExclusionsV2,
  line: PurchaseLineFactV2,
): string | null {
  if (exclusions.productIds.includes(line.productId)) return "product_excluded";
  if (exclusions.categoryIds.some((code) => line.categoryIds.includes(code))) {
    return "category_excluded";
  }
  if (line.paymentKind === "gift-card" && exclusions.giftCardPayments) {
    return "gift_card_payment_excluded";
  }
  if (line.paymentKind === "store-credit")
    return "store_credit_payment_excluded";
  return null;
}

function eligibleLineMinor(
  exclusions: PurchaseExclusionsV2,
  line: PurchaseLineFactV2,
): bigint {
  const gross = parseNonNegative(line.grossMinor, "Line gross");
  const discount = parseNonNegative(line.discountMinor, "Line discount");
  const refunded = parseNonNegative(line.refundedMinor, "Line refund");
  const deductedDiscount = exclusions.discounts ? discount : 0n;
  if (deductedDiscount + refunded > gross) {
    throw new RangeError("Line discounts and refunds exceed gross value");
  }
  return gross - deductedDiscount - refunded;
}

function componentMinor(
  exclusions: PurchaseExclusionsV2,
  fact: PurchaseEarningFactV2,
): bigint {
  const eligibleComponent = (
    totalValue: string,
    refundedValue: string,
    name: string,
  ) => {
    const total = parseNonNegative(totalValue, name);
    const refunded = parseNonNegative(refundedValue, `${name} refund`);
    if (refunded > total) {
      throw new RangeError(`${name} refund exceeds original value`);
    }
    return total - refunded;
  };
  return (
    (exclusions.shipping
      ? 0n
      : eligibleComponent(
          fact.shippingMinor,
          fact.shippingRefundedMinor,
          "Shipping",
        )) +
    (exclusions.tax
      ? 0n
      : eligibleComponent(fact.taxMinor, fact.taxRefundedMinor, "Tax")) +
    (exclusions.fees
      ? 0n
      : eligibleComponent(fact.feeMinor, fact.feeRefundedMinor, "Fees"))
  );
}

function componentExplanations(
  exclusions: PurchaseExclusionsV2,
  fact: PurchaseEarningFactV2,
): readonly PurchaseLineExplanationV2[] {
  const components = [
    {
      lineId: "component:shipping",
      excluded: exclusions.shipping,
      total: fact.shippingMinor,
      refunded: fact.shippingRefundedMinor,
      reason: "shipping_excluded",
    },
    {
      lineId: "component:tax",
      excluded: exclusions.tax,
      total: fact.taxMinor,
      refunded: fact.taxRefundedMinor,
      reason: "tax_excluded",
    },
    {
      lineId: "component:fee",
      excluded: exclusions.fees,
      total: fact.feeMinor,
      refunded: fact.feeRefundedMinor,
      reason: "fees_excluded",
    },
  ];
  return components
    .filter(
      (component) => component.total !== "0" || component.refunded !== "0",
    )
    .map((component) => {
      const total = parseNonNegative(component.total, component.lineId);
      const refunded = parseNonNegative(
        component.refunded,
        `${component.lineId} refund`,
      );
      if (refunded > total) {
        throw new RangeError(
          `${component.lineId} refund exceeds original value`,
        );
      }
      return component.excluded
        ? {
            lineId: component.lineId,
            eligibleSpendMinor: "0",
            outcome: "excluded" as const,
            reason: component.reason,
          }
        : {
            lineId: component.lineId,
            eligibleSpendMinor: (total - refunded).toString(),
            outcome: "included" as const,
            reason: "component_eligible",
          };
    });
}

function matchingPurchaseSpend(
  rule: EarningRuleV2,
  fact: PurchaseEarningFactV2,
  restrictToLineIds?: ReadonlySet<string>,
): { spend: bigint; lines: ReadonlyMap<string, bigint> } {
  if (!rule.enabled || !commonConditionsMatch(rule.conditions, fact)) {
    return { spend: 0n, lines: new Map() };
  }
  const exclusions = rule.purchaseExclusions;
  if (!exclusions) throw new TypeError("Purchase rule is missing exclusions");
  let spend = 0n;
  const lines = new Map<string, bigint>();
  for (const line of [...fact.lines].sort((left, right) =>
    left.lineId.localeCompare(right.lineId),
  )) {
    if (restrictToLineIds && !restrictToLineIds.has(line.lineId)) continue;
    if (!lineConditionMatches(rule.conditions, line)) continue;
    if (isExplicitlyExcluded(exclusions, line)) continue;
    const eligible = eligibleLineMinor(exclusions, line);
    lines.set(line.lineId, eligible);
    spend += eligible;
  }
  if (
    !restrictToLineIds &&
    rule.conditions.productIds.length === 0 &&
    rule.conditions.categoryIds.length === 0
  ) {
    spend += componentMinor(exclusions, fact);
  }
  return { spend, lines };
}

function capContribution(
  rule: EarningRuleV2,
  numerator: bigint,
  denominator: bigint,
  usage: Readonly<Record<string, string>>,
): { numerator: bigint; capApplied: EarningRuleContributionV2["capApplied"] } {
  let capped = numerator;
  let capApplied: EarningRuleContributionV2["capApplied"] = "none";
  if (rule.cap.perEventPoints !== null) {
    const maximum =
      parsePositive(rule.cap.perEventPoints, "Per-event cap") * denominator;
    if (capped > maximum) {
      capped = maximum;
      capApplied = "per_event";
    }
  }
  if (rule.cap.perMemberPoints !== null) {
    const memberMaximum = parsePositive(rule.cap.perMemberPoints, "Member cap");
    const consumed = parseNonNegative(
      usage[rule.code] ?? "0",
      "Member cap usage",
    );
    const remaining = memberMaximum > consumed ? memberMaximum - consumed : 0n;
    const maximum = remaining * denominator;
    if (capped > maximum) {
      capped = maximum;
      capApplied = "per_member";
    }
  }
  return { numerator: capped, capApplied };
}

function ruleContribution(
  rule: EarningRuleV2,
  numerator: bigint,
  denominator: bigint,
  usage: Readonly<Record<string, string>>,
): { contribution: EarningRuleContributionV2; numerator: bigint } {
  const capped = capContribution(rule, numerator, denominator, usage);
  return {
    numerator: capped.numerator,
    contribution: {
      ruleCode: rule.code,
      effectKind: rule.effect.kind,
      uncappedPoints: (numerator / denominator).toString(),
      awardedPoints: (capped.numerator / denominator).toString(),
      uncappedNumerator: numerator.toString(),
      awardedNumerator: capped.numerator.toString(),
      denominator: denominator.toString(),
      capApplied: capped.capApplied,
    },
  };
}

function allocateContributionPoints(
  contributions: EarningRuleContributionV2[],
): bigint {
  if (contributions.length === 0) return 0n;
  const denominator = parsePositive(
    contributions[0]!.denominator,
    "Contribution denominator",
  );
  const allocations = contributions.map((contribution, index) => {
    const candidateDenominator = parsePositive(
      contribution.denominator,
      "Contribution denominator",
    );
    if (candidateDenominator !== denominator) {
      throw new TypeError("Contribution denominators must match");
    }
    const numerator = parseNonNegative(
      contribution.awardedNumerator,
      "Contribution numerator",
    );
    return {
      index,
      floor: numerator / denominator,
      remainder: numerator % denominator,
      ruleCode: contribution.ruleCode,
    };
  });
  const totalNumerator = contributions.reduce(
    (total, contribution) =>
      total +
      parseNonNegative(contribution.awardedNumerator, "Contribution numerator"),
    0n,
  );
  const totalPoints = totalNumerator / denominator;
  let remaining =
    totalPoints -
    allocations.reduce((total, allocation) => total + allocation.floor, 0n);
  for (const allocation of [...allocations].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return left.ruleCode.localeCompare(right.ruleCode);
  })) {
    if (remaining === 0n || allocation.remainder === 0n) break;
    allocation.floor += 1n;
    remaining -= 1n;
  }
  for (const allocation of allocations) {
    const current = contributions[allocation.index]!;
    contributions[allocation.index] = {
      ...current,
      awardedPoints: allocation.floor.toString(),
    };
  }
  return totalPoints;
}

function lifecycle(
  programme: ProgrammeDefinitionV2,
  occurredAtValue: string,
): Pick<EarningEvaluationV2, "pendingAt" | "availableAt" | "expiresAt"> {
  const occurredAt = parseInstant(occurredAtValue, "Event occurrence");
  const availableAt = new Date(plusDays(occurredAt, programme.pendingDays));
  return {
    pendingAt: occurredAt.toISOString(),
    availableAt: availableAt.toISOString(),
    expiresAt: plusDays(availableAt, programme.pointsExpireAfterDays),
  };
}

function orderRules(rules: readonly EarningRuleV2[]): readonly EarningRuleV2[] {
  const codes = new Set<string>();
  for (const rule of rules) {
    if (codes.has(rule.code))
      throw new TypeError(`Duplicate earning rule: ${rule.code}`);
    codes.add(rule.code);
  }
  return [...rules].sort(
    (left, right) =>
      right.priority - left.priority || left.code.localeCompare(right.code),
  );
}

function evaluatePurchase(
  programme: ProgrammeDefinitionV2,
  fact: PurchaseEarningFactV2,
): EarningEvaluationV2 {
  if (fact.currencyCode !== programme.currencyCode) {
    throw new RangeError(`Purchase currency must be ${programme.currencyCode}`);
  }
  const linesById = new Set<string>();
  for (const line of fact.lines) {
    if (linesById.has(line.lineId))
      throw new TypeError(`Duplicate line ID: ${line.lineId}`);
    linesById.add(line.lineId);
  }
  const rules = orderRules(programme.earningRules).filter(
    (rule) => rule.enabled && rule.source === "purchase",
  );
  const base = rules.find((rule) => rule.effect.kind === "base_rate");
  if (!base || base.effect.kind !== "base_rate") {
    throw new TypeError("Exactly one enabled purchase base rate is required");
  }
  const baseEligible = matchingPurchaseSpend(base, fact);
  const minorUnitsPerMajor = 10n ** BigInt(programme.currencyMinorUnitDigits);
  const tierLevel = programme.tierPolicy?.levels.find(
    (level) => level.tierCode === fact.tierCode,
  );
  if (programme.tierPolicy && !tierLevel) {
    throw new TypeError(`Tier ${fact.tierCode} has no advanced-policy level`);
  }
  const tierMultiplierBasisPoints = BigInt(
    tierLevel?.benefits.earningMultiplierBasisPoints ?? 10_000,
  );
  const denominator = programme.tierPolicy
    ? minorUnitsPerMajor * BASIS_POINTS * BASIS_POINTS
    : minorUnitsPerMajor * BASIS_POINTS;
  const contributions: EarningRuleContributionV2[] = [];

  const baseNumerator =
    baseEligible.spend *
    parsePositive(base.effect.pointsPerMajorUnit, "Base rate") *
    (programme.tierPolicy
      ? tierMultiplierBasisPoints * BASIS_POINTS
      : BASIS_POINTS);
  const baseContribution = ruleContribution(
    base,
    baseNumerator,
    denominator,
    fact.memberRuleUsage,
  );
  contributions.push(baseContribution.contribution);

  const baseLineIds = new Set(baseEligible.lines.keys());
  const selectedMultiplier = rules.find((rule) => {
    if (rule.effect.kind !== "multiplier") return false;
    return matchingPurchaseSpend(rule, fact, baseLineIds).spend > 0n;
  });
  if (selectedMultiplier?.effect.kind === "multiplier") {
    const multiplierSpend = matchingPurchaseSpend(
      selectedMultiplier,
      fact,
      baseLineIds,
    ).spend;
    const extraNumerator =
      multiplierSpend *
      parsePositive(base.effect.pointsPerMajorUnit, "Base rate") *
      (BigInt(selectedMultiplier.effect.multiplierBasisPoints) - BASIS_POINTS) *
      (programme.tierPolicy ? tierMultiplierBasisPoints : 1n);
    const contribution = ruleContribution(
      selectedMultiplier,
      extraNumerator,
      denominator,
      fact.memberRuleUsage,
    );
    contributions.push(contribution.contribution);
  }

  for (const rule of rules) {
    if (rule.effect.kind !== "fixed_bonus") continue;
    if (matchingPurchaseSpend(rule, fact, baseLineIds).spend === 0n) continue;
    const numerator =
      parsePositive(rule.effect.points, "Fixed bonus") * denominator;
    const contribution = ruleContribution(
      rule,
      numerator,
      denominator,
      fact.memberRuleUsage,
    );
    contributions.push(contribution.contribution);
  }

  const sortedLines = [...fact.lines].sort((left, right) =>
    left.lineId.localeCompare(right.lineId),
  );
  const lines = [
    ...sortedLines.map((line): PurchaseLineExplanationV2 => {
      const eligible = baseEligible.lines.get(line.lineId);
      if (eligible !== undefined) {
        return {
          lineId: line.lineId,
          eligibleSpendMinor: eligible.toString(),
          outcome: "included",
          reason: "base_rule_eligible",
        };
      }
      const excluded = isExplicitlyExcluded(base.purchaseExclusions!, line);
      return {
        lineId: line.lineId,
        eligibleSpendMinor: "0",
        outcome: "excluded",
        reason: excluded ?? "base_rule_conditions_not_met",
      };
    }),
    ...componentExplanations(base.purchaseExclusions!, fact),
  ];

  const awardedPoints = allocateContributionPoints(contributions);
  return {
    version: "2",
    eventId: fact.eventId,
    source: fact.source,
    eligibleSpendMinor: baseEligible.spend.toString(),
    awardedPoints: awardedPoints.toString(),
    tierCodeSnapshot: fact.tierCode,
    ...lifecycle(programme, fact.occurredAt),
    selectedMultiplierRuleCode: selectedMultiplier?.code ?? null,
    contributions,
    lines,
  };
}

function evaluateActivity(
  programme: ProgrammeDefinitionV2,
  fact: ActivityEarningFactV2,
): EarningEvaluationV2 {
  if (!fact.verified)
    throw new TypeError(
      "Activity facts must be verified by an authoritative source",
    );
  if (fact.activityReference.trim().length === 0) {
    throw new TypeError("Activity reference cannot be empty");
  }
  if (!/^[a-z][a-z0-9_-]{0,79}$/u.test(fact.activityCode)) {
    throw new TypeError("Activity code is invalid");
  }
  if (
    fact.source === "verified_product_review" &&
    (fact.productId === null || fact.productId.trim().length === 0)
  ) {
    throw new TypeError("Verified product reviews require a product");
  }
  const denominator = 1n;
  const contributions: EarningRuleContributionV2[] = [];
  for (const rule of orderRules(programme.earningRules)) {
    if (
      !rule.enabled ||
      rule.source !== fact.source ||
      rule.effect.kind !== "fixed_bonus" ||
      !commonConditionsMatch(rule.conditions, fact)
    ) {
      continue;
    }
    const contribution = ruleContribution(
      rule,
      parsePositive(rule.effect.points, "Fixed bonus"),
      denominator,
      fact.memberRuleUsage,
    );
    contributions.push(contribution.contribution);
  }
  const awardedPoints = allocateContributionPoints(contributions);
  return {
    version: "2",
    eventId: fact.eventId,
    source: fact.source,
    eligibleSpendMinor: "0",
    awardedPoints: awardedPoints.toString(),
    tierCodeSnapshot: fact.tierCode,
    ...lifecycle(programme, fact.occurredAt),
    selectedMultiplierRuleCode: null,
    contributions,
    lines: [],
  };
}

export function evaluateEarningV2(
  programme: ProgrammeDefinitionV2,
  fact: EarningFactV2,
): EarningEvaluationV2 {
  if (fact.eventId.trim().length === 0)
    throw new TypeError("Event ID cannot be empty");
  return fact.source === "purchase"
    ? evaluatePurchase(programme, fact)
    : evaluateActivity(programme, fact);
}

export function simulateEarningV2(
  programme: ProgrammeDefinitionV2,
  fact: EarningFactV2,
): EarningEvaluationV2 {
  return evaluateEarningV2(programme, fact);
}

function selectorOverlap(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === 0 ||
    right.length === 0 ||
    left.some((value) => right.includes(value))
  );
}

function conditionsCanOverlap(
  left: EarningRuleConditionsV2,
  right: EarningRuleConditionsV2,
): boolean {
  return (
    selectorOverlap(left.productIds, right.productIds) &&
    selectorOverlap(left.categoryIds, right.categoryIds) &&
    selectorOverlap(left.currencyCodes, right.currencyCodes) &&
    selectorOverlap(left.markets, right.markets) &&
    selectorOverlap(left.channels, right.channels) &&
    selectorOverlap(left.activityCodes, right.activityCodes) &&
    selectorOverlap(left.segmentCodes, right.segmentCodes) &&
    selectorOverlap(left.tierCodes, right.tierCodes)
  );
}

export function inspectEarningRuleConflictsV2(
  rules: readonly EarningRuleV2[],
): readonly EarningRuleConflictV2[] {
  const conflicts: EarningRuleConflictV2[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.code)) {
      conflicts.push({
        code: "duplicate_rule_code",
        ruleCodes: [rule.code],
        message: `Rule code ${rule.code} is duplicated`,
      });
    }
    seen.add(rule.code);
  }
  const multipliers = rules.filter(
    (rule) =>
      rule.enabled &&
      rule.source === "purchase" &&
      rule.effect.kind === "multiplier",
  );
  for (let index = 0; index < multipliers.length; index += 1) {
    for (
      let otherIndex = index + 1;
      otherIndex < multipliers.length;
      otherIndex += 1
    ) {
      const left = multipliers[index]!;
      const right = multipliers[otherIndex]!;
      if (
        left.priority === right.priority &&
        conditionsCanOverlap(left.conditions, right.conditions)
      ) {
        conflicts.push({
          code: "equal_priority_multiplier_overlap",
          ruleCodes: [left.code, right.code].sort(),
          message:
            "Equal-priority multipliers can match the same purchase; rule code would decide the winner",
        });
      }
    }
  }
  return conflicts;
}
