import { describe, expect, it } from "vitest";
import type {
  AudienceDefinitionV1,
  AudienceEvaluationFactV1,
} from "@starfiniti/contracts/audience";
import { evaluateAudienceV1 } from "./audience-v1";

const definition: AudienceDefinitionV1 = {
  schemaVersion: "1",
  code: "win_back_bloom",
  name: "Win back Bloom members",
  description: "",
  match: "all",
  conditions: [
    { kind: "tier", operator: "in", tierCodes: ["bloom"] },
    {
      kind: "metric",
      metric: "days_since_last_paid_order",
      operator: "at_least",
      minimum: "30",
      maximum: null,
      window: null,
      activityCodes: [],
    },
    {
      kind: "metric",
      metric: "eligible_spend",
      operator: "between",
      minimum: "10000",
      maximum: "50000",
      window: { kind: "rolling_days", days: 365 },
      activityCodes: [],
    },
  ],
};

const fact: AudienceEvaluationFactV1 = {
  schemaVersion: "1",
  subjectReference: "customer:1",
  evaluatedAt: "2026-08-14T05:00:00.000Z",
  tierCode: "bloom",
  metrics: [
    {
      metric: "days_since_last_paid_order",
      window: null,
      activityCodes: [],
      value: "45",
    },
    {
      metric: "eligible_spend",
      window: { kind: "rolling_days", days: 365 },
      activityCodes: [],
      value: "25000",
    },
  ],
};

describe("evaluateAudienceV1", () => {
  it("matches all conditions with exact bigint and window evidence", () => {
    expect(evaluateAudienceV1(definition, fact)).toMatchObject({
      included: true,
      results: [
        { conditionIndex: 0, matched: true, observedValue: null },
        { conditionIndex: 1, matched: true, observedValue: "45" },
        { conditionIndex: 2, matched: true, observedValue: "25000" },
      ],
    });
  });

  it("does not treat a member with no paid order as infinitely inactive", () => {
    const withoutOrder = {
      ...fact,
      metrics: fact.metrics.map((metric) =>
        metric.metric === "days_since_last_paid_order"
          ? { ...metric, value: null }
          : metric,
      ),
    };
    expect(evaluateAudienceV1(definition, withoutOrder).included).toBe(false);
  });

  it("uses any semantics without changing condition evidence", () => {
    const evaluation = evaluateAudienceV1(
      { ...definition, match: "any" },
      { ...fact, tierCode: "rose" },
    );
    expect(evaluation.included).toBe(true);
    expect(evaluation.results[0]?.matched).toBe(false);
    expect(evaluation.results[1]?.matched).toBe(true);
  });

  it("fails closed when required metric evidence is absent or duplicated", () => {
    expect(() =>
      evaluateAudienceV1(definition, {
        ...fact,
        metrics: fact.metrics.slice(1),
      }),
    ).toThrow(/missing audience metric evidence/u);
    expect(() =>
      evaluateAudienceV1(definition, {
        ...fact,
        metrics: [...fact.metrics, fact.metrics[0]!],
      }),
    ).toThrow(/duplicate audience metric evidence/u);
  });
});
