import type {
  TierLevelProgressV2,
  TierMetricSnapshotV2,
  TierPolicyLevelV2,
  TierPolicyV2,
  TierQualificationEvaluationV2,
  TierQualificationExpressionV2,
  TierQualificationThresholdV2,
} from "@starfiniti/contracts/tier-policy-v2";

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const POSTGRES_BIGINT_MIN = -9_223_372_036_854_775_808n;
const DAY_MILLISECONDS = 86_400_000;

export type TierQualificationFactKindV2 =
  "purchase" | "refund" | "points_adjustment" | "referral" | "verified_action";

export interface TierQualificationFactV2 {
  readonly reference: string;
  readonly kind: TierQualificationFactKindV2;
  readonly effectiveAt: string;
  readonly recordedAt: string;
  readonly eligibleSpendMinorDelta: string;
  readonly earnedPointsDelta: string;
  readonly orderCountDelta: string;
  readonly referralCountDelta: string;
  readonly verifiedActionCountDelta: string;
  readonly activityCode: string | null;
}

export interface EvaluateTierQualificationInputV2 {
  readonly policy: TierPolicyV2;
  readonly facts: readonly TierQualificationFactV2[];
  readonly evaluatedAt: string;
  readonly currentTierCode: string | null;
  readonly previouslyHeldTierCodes: readonly string[];
  readonly belowThresholdSince: string | null;
}

export interface EvaluateTierQualificationSnapshotInputV2 {
  readonly policy: TierPolicyV2;
  readonly metrics: TierMetricSnapshotV2;
  readonly evaluatedAt: string;
  readonly currentTierCode: string | null;
  readonly previouslyHeldTierCodes: readonly string[];
  readonly belowThresholdSince: string | null;
}

type MutableMetrics = {
  eligibleSpendMinor: bigint;
  earnedPoints: bigint;
  orderCount: bigint;
  referralCount: bigint;
  verifiedActionCount: bigint;
  verifiedActionCounts: Map<string, bigint>;
};

function parseInstant(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} is invalid`);
  return parsed;
}

function parseSignedBigint(value: string, name: string): bigint {
  if (!/^-?(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new TypeError(`${name} must be an integer string`);
  }
  const parsed = BigInt(value);
  if (parsed < POSTGRES_BIGINT_MIN || parsed > POSTGRES_BIGINT_MAX) {
    throw new RangeError(`${name} exceeds PostgreSQL bigint capacity`);
  }
  return parsed;
}

function assertNonNegative(value: bigint, name: string): void {
  if (value < 0n) {
    throw new RangeError(
      `${name} cannot be negative after qualification facts`,
    );
  }
  if (value > POSTGRES_BIGINT_MAX) {
    throw new RangeError(`${name} exceeds PostgreSQL bigint capacity`);
  }
}

function zonedParts(instant: number, timeZone: string) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new TypeError("Qualification timezone is not a supported IANA zone");
  }
  const values = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
    second: values.second!,
  };
}

function localNewYearInstant(year: number, timeZone: string): number {
  const desiredLocal = Date.UTC(year, 0, 1, 0, 0, 0);
  let candidate = desiredLocal;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const parts = zonedParts(candidate, timeZone);
    const representedLocal = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const next = candidate + (desiredLocal - representedLocal);
    if (next === candidate) return candidate;
    candidate = next;
  }
  const resolved = zonedParts(candidate, timeZone);
  if (
    resolved.year !== year ||
    resolved.month !== 1 ||
    resolved.day !== 1 ||
    resolved.hour !== 0 ||
    resolved.minute !== 0 ||
    resolved.second !== 0
  ) {
    throw new RangeError("Qualification calendar boundary is not resolvable");
  }
  return candidate;
}

function qualificationWindow(
  policy: TierPolicyV2,
  evaluatedAt: number,
): TierQualificationEvaluationV2["window"] {
  const period = policy.qualificationPeriod;
  if (period.kind === "lifetime") {
    return { kind: period.kind, startsAt: null, endsAt: null };
  }
  if (period.kind === "rolling_days") {
    return {
      kind: period.kind,
      startsAt: new Date(
        evaluatedAt - period.days * DAY_MILLISECONDS,
      ).toISOString(),
      endsAt: new Date(evaluatedAt).toISOString(),
    };
  }
  const year = zonedParts(evaluatedAt, period.timeZone).year;
  return {
    kind: period.kind,
    startsAt: new Date(
      localNewYearInstant(year, period.timeZone),
    ).toISOString(),
    endsAt: new Date(
      localNewYearInstant(year + 1, period.timeZone),
    ).toISOString(),
  };
}

function aggregateFacts(
  facts: readonly TierQualificationFactV2[],
  evaluatedAt: number,
  window: TierQualificationEvaluationV2["window"],
): TierMetricSnapshotV2 {
  const startsAt =
    window.startsAt === null ? null : Date.parse(window.startsAt);
  const totals: MutableMetrics = {
    eligibleSpendMinor: 0n,
    earnedPoints: 0n,
    orderCount: 0n,
    referralCount: 0n,
    verifiedActionCount: 0n,
    verifiedActionCounts: new Map(),
  };
  const references = new Set<string>();
  for (const fact of facts) {
    if (fact.reference.trim().length === 0) {
      throw new TypeError("Qualification fact reference cannot be empty");
    }
    if (references.has(fact.reference)) {
      throw new TypeError(`Duplicate qualification fact: ${fact.reference}`);
    }
    references.add(fact.reference);
    const effectiveAt = parseInstant(
      fact.effectiveAt,
      "Fact effective instant",
    );
    const recordedAt = parseInstant(fact.recordedAt, "Fact recorded instant");
    if (recordedAt < effectiveAt) {
      throw new RangeError(
        "Qualification fact cannot be recorded before it is effective",
      );
    }
    if (
      effectiveAt > evaluatedAt ||
      recordedAt > evaluatedAt ||
      (startsAt !== null && effectiveAt < startsAt)
    ) {
      continue;
    }
    const eligibleSpend = parseSignedBigint(
      fact.eligibleSpendMinorDelta,
      "Eligible spend delta",
    );
    const earnedPoints = parseSignedBigint(
      fact.earnedPointsDelta,
      "Earned points delta",
    );
    const orderCount = parseSignedBigint(
      fact.orderCountDelta,
      "Order count delta",
    );
    const referralCount = parseSignedBigint(
      fact.referralCountDelta,
      "Referral count delta",
    );
    const actionCount = parseSignedBigint(
      fact.verifiedActionCountDelta,
      "Verified action count delta",
    );
    if (actionCount !== 0n && fact.activityCode === null) {
      throw new TypeError("Verified action deltas require an activity code");
    }
    if (actionCount === 0n && fact.activityCode !== null) {
      throw new TypeError("Activity codes require a verified action delta");
    }
    totals.eligibleSpendMinor += eligibleSpend;
    totals.earnedPoints += earnedPoints;
    totals.orderCount += orderCount;
    totals.referralCount += referralCount;
    totals.verifiedActionCount += actionCount;
    if (fact.activityCode !== null) {
      totals.verifiedActionCounts.set(
        fact.activityCode,
        (totals.verifiedActionCounts.get(fact.activityCode) ?? 0n) +
          actionCount,
      );
    }
  }
  assertNonNegative(totals.eligibleSpendMinor, "Eligible spend");
  assertNonNegative(totals.earnedPoints, "Earned points");
  assertNonNegative(totals.orderCount, "Order count");
  assertNonNegative(totals.referralCount, "Referral count");
  assertNonNegative(totals.verifiedActionCount, "Verified action count");
  for (const [activityCode, count] of totals.verifiedActionCounts) {
    assertNonNegative(count, `Verified action ${activityCode}`);
  }
  return {
    eligibleSpendMinor: totals.eligibleSpendMinor.toString(),
    earnedPoints: totals.earnedPoints.toString(),
    orderCount: totals.orderCount.toString(),
    referralCount: totals.referralCount.toString(),
    verifiedActionCount: totals.verifiedActionCount.toString(),
    verifiedActionCounts: Object.fromEntries(
      [...totals.verifiedActionCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([activityCode, count]) => [activityCode, count.toString()]),
    ),
  };
}

function validateMetricSnapshot(metrics: TierMetricSnapshotV2): void {
  for (const [name, value] of [
    ["Eligible spend", metrics.eligibleSpendMinor],
    ["Earned points", metrics.earnedPoints],
    ["Order count", metrics.orderCount],
    ["Referral count", metrics.referralCount],
    ["Verified action count", metrics.verifiedActionCount],
  ] as const) {
    assertNonNegative(parseSignedBigint(value, name), name);
  }
  for (const [activityCode, value] of Object.entries(
    metrics.verifiedActionCounts,
  )) {
    if (!/^[a-z][a-z0-9_-]{0,79}$/u.test(activityCode)) {
      throw new TypeError("Verified action metric code is invalid");
    }
    assertNonNegative(
      parseSignedBigint(value, `Verified action ${activityCode}`),
      `Verified action ${activityCode}`,
    );
  }
  const actionTotal = Object.values(metrics.verifiedActionCounts).reduce(
    (total, value) => total + BigInt(value),
    0n,
  );
  if (actionTotal !== BigInt(metrics.verifiedActionCount)) {
    throw new RangeError(
      "Verified action total must equal its per-activity metrics",
    );
  }
}

function actualForThreshold(
  threshold: TierQualificationThresholdV2,
  metrics: TierMetricSnapshotV2,
): bigint {
  if (threshold.metric === "eligible_spend") {
    return BigInt(metrics.eligibleSpendMinor);
  }
  if (threshold.metric === "earned_points") {
    return BigInt(metrics.earnedPoints);
  }
  if (threshold.metric === "order_count") return BigInt(metrics.orderCount);
  if (threshold.metric === "referral_count") {
    return BigInt(metrics.referralCount);
  }
  if (threshold.activityCodes.length === 0) {
    return BigInt(metrics.verifiedActionCount);
  }
  return threshold.activityCodes.reduce(
    (total, activityCode) =>
      total + BigInt(metrics.verifiedActionCounts[activityCode] ?? "0"),
    0n,
  );
}

function expressionProgress(
  expression: TierQualificationExpressionV2,
  metrics: TierMetricSnapshotV2,
): Pick<TierLevelProgressV2, "operator" | "matched" | "thresholds"> {
  const thresholds = expression.thresholds.map((threshold) => {
    const actual = actualForThreshold(threshold, metrics);
    const minimum = BigInt(threshold.minimum);
    return {
      metric: threshold.metric,
      activityCodes: threshold.activityCodes,
      actual: actual.toString(),
      minimum: threshold.minimum,
      remaining: (minimum > actual ? minimum - actual : 0n).toString(),
      matched: actual >= minimum,
    };
  });
  return {
    operator: expression.operator,
    matched:
      expression.operator === "all"
        ? thresholds.every((threshold) => threshold.matched)
        : thresholds.some((threshold) => threshold.matched),
    thresholds,
  };
}

function thresholdKind(
  level: TierPolicyLevelV2,
  currentTierCode: string | null,
  previouslyHeldTierCodes: ReadonlySet<string>,
): Exclude<TierLevelProgressV2["thresholdKind"], "base"> {
  if (currentTierCode === level.tierCode) return "retention";
  return previouslyHeldTierCodes.has(level.tierCode) ? "reentry" : "entry";
}

function levelProgress(
  level: TierPolicyLevelV2,
  index: number,
  metrics: TierMetricSnapshotV2,
  currentTierCode: string | null,
  previouslyHeldTierCodes: ReadonlySet<string>,
): TierLevelProgressV2 {
  if (index === 0) {
    return {
      tierCode: level.tierCode,
      thresholdKind: "base",
      operator: null,
      matched: true,
      thresholds: [],
    };
  }
  const kind = thresholdKind(level, currentTierCode, previouslyHeldTierCodes);
  const expression = level[kind];
  if (expression === null) {
    throw new TypeError(`Tier ${level.tierCode} is missing ${kind} thresholds`);
  }
  return {
    tierCode: level.tierCode,
    thresholdKind: kind,
    ...expressionProgress(expression, metrics),
  };
}

export function evaluateTierQualificationV2(
  input: EvaluateTierQualificationInputV2,
): TierQualificationEvaluationV2 {
  const evaluatedAt = parseInstant(input.evaluatedAt, "Evaluation instant");
  const window = qualificationWindow(input.policy, evaluatedAt);
  const metrics = aggregateFacts(input.facts, evaluatedAt, window);
  return evaluateTierQualificationSnapshotV2({
    policy: input.policy,
    metrics,
    evaluatedAt: input.evaluatedAt,
    currentTierCode: input.currentTierCode,
    previouslyHeldTierCodes: input.previouslyHeldTierCodes,
    belowThresholdSince: input.belowThresholdSince,
  });
}

export function evaluateTierQualificationSnapshotV2(
  input: EvaluateTierQualificationSnapshotInputV2,
): TierQualificationEvaluationV2 {
  const evaluatedAt = parseInstant(input.evaluatedAt, "Evaluation instant");
  const evaluatedAtIso = new Date(evaluatedAt).toISOString();
  validateMetricSnapshot(input.metrics);
  const codes = input.policy.levels.map((level) => level.tierCode);
  if (
    input.currentTierCode !== null &&
    !codes.includes(input.currentTierCode)
  ) {
    throw new TypeError(`Unknown current tier: ${input.currentTierCode}`);
  }
  for (const tierCode of input.previouslyHeldTierCodes) {
    if (!codes.includes(tierCode)) {
      throw new TypeError(`Unknown historical tier: ${tierCode}`);
    }
  }
  const window = qualificationWindow(input.policy, evaluatedAt);
  const metrics = input.metrics;
  const previouslyHeld = new Set(input.previouslyHeldTierCodes);
  const levels = input.policy.levels.map((level, index) =>
    levelProgress(level, index, metrics, input.currentTierCode, previouslyHeld),
  );
  let qualifiedIndex = 0;
  levels.forEach((level, index) => {
    if (level.matched) qualifiedIndex = index;
  });
  const qualified = levels[qualifiedIndex]!;
  const currentIndex =
    input.currentTierCode === null ? -1 : codes.indexOf(input.currentTierCode);
  let effectiveIndex = qualifiedIndex;
  let transition: TierQualificationEvaluationV2["transition"];
  let belowThresholdSince: string | null = null;
  let graceUntil: string | null = null;
  if (currentIndex < 0) {
    transition = "entry";
  } else if (qualifiedIndex > currentIndex) {
    transition = qualified.thresholdKind === "reentry" ? "reentry" : "upgrade";
  } else if (qualifiedIndex === currentIndex) {
    transition = "none";
  } else if (input.policy.downgradeGraceDays === 0) {
    transition = "downgrade";
  } else {
    const belowSince =
      input.belowThresholdSince === null
        ? evaluatedAt
        : parseInstant(input.belowThresholdSince, "Below-threshold instant");
    if (belowSince > evaluatedAt) {
      throw new RangeError("Below-threshold instant cannot be in the future");
    }
    belowThresholdSince = new Date(belowSince).toISOString();
    const graceUntilInstant =
      belowSince + input.policy.downgradeGraceDays * DAY_MILLISECONDS;
    graceUntil = new Date(graceUntilInstant).toISOString();
    if (evaluatedAt < graceUntilInstant) {
      effectiveIndex = currentIndex;
      transition = "grace";
    } else {
      transition = "downgrade";
    }
  }
  const nextMilestone =
    levels.find((_, index) => index > effectiveIndex) ?? null;
  return {
    version: "2",
    evaluatedAt: evaluatedAtIso,
    window,
    metrics,
    currentTierCode: input.currentTierCode,
    qualifiedTierCode: codes[qualifiedIndex]!,
    effectiveTierCode: codes[effectiveIndex]!,
    transition,
    belowThresholdSince,
    graceUntil,
    levels,
    nextMilestone,
  };
}

export function migrateLegacySpendTiersToPolicyV2(
  tiers: readonly Readonly<{
    code: string;
    minimumEligibleSpendMinor: string;
  }>[],
  options: Readonly<{ rollingDays: number; downgradeGraceDays: number }> = {
    rollingDays: 365,
    downgradeGraceDays: 30,
  },
): TierPolicyV2 {
  if (tiers.length === 0) throw new TypeError("At least one tier is required");
  return {
    version: "2",
    qualificationPeriod: {
      kind: "rolling_days",
      days: options.rollingDays,
    },
    downgradeGraceDays: options.downgradeGraceDays,
    levels: tiers.map((tier, index) => {
      const threshold =
        index === 0
          ? null
          : {
              operator: "all" as const,
              thresholds: [
                {
                  metric: "eligible_spend" as const,
                  minimum: tier.minimumEligibleSpendMinor,
                  activityCodes: [],
                },
              ],
            };
      return {
        tierCode: tier.code,
        entry: threshold,
        retention: threshold,
        reentry: threshold,
        benefits: {
          earningMultiplierBasisPoints: 10_000,
          rewardCodes: [],
          earlyAccess: false,
        },
      };
    }),
  };
}
