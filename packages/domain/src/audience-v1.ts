import type {
  AudienceConditionV1,
  AudienceDefinitionV1,
  AudienceEvaluationFactV1,
  AudienceEvaluationV1,
  AudienceMetricEvidenceV1,
  AudienceNumericConditionV1,
} from "@starfiniti/contracts/audience";

function canonicalCodes(codes: readonly string[]): string {
  return [...codes].sort().join(",");
}

function windowKey(window: AudienceNumericConditionV1["window"]): string {
  if (window === null) return "current";
  return window.kind === "lifetime"
    ? "lifetime"
    : `rolling_days:${window.days}`;
}

function metricKey(
  value: Pick<
    AudienceNumericConditionV1 | AudienceMetricEvidenceV1,
    "metric" | "window" | "activityCodes"
  >,
): string {
  return `${value.metric}|${windowKey(value.window)}|${canonicalCodes(value.activityCodes)}`;
}

function matchesNumeric(
  condition: AudienceNumericConditionV1,
  observedValue: string | null,
): boolean {
  if (observedValue === null) return false;
  const observed = BigInt(observedValue);
  const minimum = BigInt(condition.minimum);
  if (condition.operator === "at_least") return observed >= minimum;
  if (condition.operator === "at_most") return observed <= minimum;
  return observed >= minimum && observed <= BigInt(condition.maximum!);
}

function evaluateCondition(
  condition: AudienceConditionV1,
  fact: AudienceEvaluationFactV1,
  metrics: ReadonlyMap<string, AudienceMetricEvidenceV1>,
): { matched: boolean; observedValue: string | null } {
  if (condition.kind === "tier") {
    const selected =
      fact.tierCode !== null && condition.tierCodes.includes(fact.tierCode);
    return {
      matched: condition.operator === "in" ? selected : !selected,
      observedValue: null,
    };
  }
  const evidence = metrics.get(metricKey(condition));
  if (!evidence) {
    throw new Error(
      `missing audience metric evidence: ${metricKey(condition)}`,
    );
  }
  return {
    matched: matchesNumeric(condition, evidence.value),
    observedValue: evidence.value,
  };
}

export function evaluateAudienceV1(
  definition: AudienceDefinitionV1,
  fact: AudienceEvaluationFactV1,
): AudienceEvaluationV1 {
  const metrics = new Map<string, AudienceMetricEvidenceV1>();
  for (const evidence of fact.metrics) {
    const key = metricKey(evidence);
    if (metrics.has(key)) {
      throw new Error(`duplicate audience metric evidence: ${key}`);
    }
    metrics.set(key, evidence);
  }
  const results = definition.conditions.map((condition, conditionIndex) => ({
    conditionIndex,
    ...evaluateCondition(condition, fact, metrics),
  }));
  return {
    schemaVersion: "1",
    audienceCode: definition.code,
    subjectReference: fact.subjectReference,
    evaluatedAt: fact.evaluatedAt,
    included:
      definition.match === "all"
        ? results.every((result) => result.matched)
        : results.some((result) => result.matched),
    results,
  };
}
