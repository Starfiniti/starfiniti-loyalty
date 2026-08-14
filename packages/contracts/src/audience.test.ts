import { describe, expect, it } from "vitest";
import {
  audienceDefinitionV1,
  audienceEvaluationFactV1,
  merchantCreateAudienceDraftCommandV1,
} from "./audience";

const definition = {
  schemaVersion: "1" as const,
  code: "win_back_bloom",
  name: "Win back Bloom members",
  description: "Bloom members with a paid-order history who are inactive.",
  match: "all" as const,
  conditions: [
    {
      kind: "tier" as const,
      operator: "in" as const,
      tierCodes: ["bloom"],
    },
    {
      kind: "metric" as const,
      metric: "days_since_last_paid_order" as const,
      operator: "at_least" as const,
      minimum: "30",
      maximum: null,
      window: null,
      activityCodes: [],
    },
    {
      kind: "metric" as const,
      metric: "eligible_spend" as const,
      operator: "between" as const,
      minimum: "10000",
      maximum: "50000",
      window: { kind: "rolling_days" as const, days: 365 },
      activityCodes: [],
    },
  ],
};

describe("audienceDefinitionV1", () => {
  it("accepts allowlisted tier, recency, and rolling commerce conditions", () => {
    expect(audienceDefinitionV1.parse(definition)).toEqual(definition);
  });

  it("rejects arbitrary fields and invalid window or range combinations", () => {
    expect(
      audienceDefinitionV1.safeParse({
        ...definition,
        conditions: [
          {
            kind: "metric",
            metric: "available_points",
            operator: "between",
            minimum: "20",
            maximum: "10",
            window: { kind: "lifetime" },
            activityCodes: [],
            sql: "select true",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires activity selectors only on verified-action conditions", () => {
    expect(
      audienceDefinitionV1.safeParse({
        ...definition,
        conditions: [
          {
            kind: "metric",
            metric: "order_count",
            operator: "at_least",
            minimum: "1",
            maximum: null,
            window: { kind: "lifetime" },
            activityCodes: ["review"],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects bigint overflow at the public command boundary", () => {
    expect(
      merchantCreateAudienceDraftCommandV1.safeParse({
        schemaVersion: "1",
        programmeId: "00000000-0000-4000-8000-000000000001",
        definition: {
          ...definition,
          conditions: [
            {
              kind: "metric",
              metric: "available_points",
              operator: "at_least",
              minimum: "9223372036854775808",
              maximum: null,
              window: null,
              activityCodes: [],
            },
          ],
        },
        idempotencyKey: "audience:create:1",
        correlationId: "00000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(false);
  });
});

describe("audienceEvaluationFactV1", () => {
  it("keeps no-order recency explicit as null", () => {
    expect(
      audienceEvaluationFactV1.parse({
        schemaVersion: "1",
        subjectReference: "customer:1",
        evaluatedAt: "2026-08-14T05:00:00Z",
        tierCode: "rose",
        metrics: [
          {
            metric: "days_since_last_paid_order",
            window: null,
            activityCodes: [],
            value: null,
          },
        ],
      }).metrics[0]?.value,
    ).toBeNull();
  });

  it("preserves exact negative balances as evidence", () => {
    expect(
      audienceEvaluationFactV1.parse({
        schemaVersion: "1",
        subjectReference: "customer:negative",
        evaluatedAt: "2026-08-14T05:00:00Z",
        tierCode: "rose",
        metrics: [
          {
            metric: "available_points",
            window: null,
            activityCodes: [],
            value: "-250",
          },
        ],
      }).metrics[0]?.value,
    ).toBe("-250");
  });

  it("rejects missing fact windows, negative activity, and unknown balances", () => {
    const baseFact = {
      schemaVersion: "1",
      subjectReference: "customer:invalid",
      evaluatedAt: "2026-08-14T05:00:00Z",
      tierCode: "rose",
    } as const;
    expect(
      audienceEvaluationFactV1.safeParse({
        ...baseFact,
        metrics: [
          {
            metric: "order_count",
            window: null,
            activityCodes: [],
            value: "1",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      audienceEvaluationFactV1.safeParse({
        ...baseFact,
        metrics: [
          {
            metric: "earned_points",
            window: { kind: "lifetime" },
            activityCodes: [],
            value: "-1",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      audienceEvaluationFactV1.safeParse({
        ...baseFact,
        metrics: [
          {
            metric: "available_points",
            window: null,
            activityCodes: [],
            value: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
