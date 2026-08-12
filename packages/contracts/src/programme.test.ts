import { describe, expect, it } from "vitest";
import {
  createProgrammeDraftCommandV1,
  merchantCreateProgrammeCommandV1,
  merchantCreateProgrammeDraftCommandV1,
  merchantPublishProgrammeVersionCommandV1,
  programmeDefinitionV1,
  programmeEvaluationEvidenceV1,
  rewardTransitionCommandV1,
} from "./programme";

const definition = {
  version: "1" as const,
  tiers: [
    {
      code: "rose",
      name: "Rose",
      minimumEligibleSpendMinor: "0",
      pointsPerMajorUnit: "5",
    },
    {
      code: "bloom",
      name: "Bloom",
      minimumEligibleSpendMinor: "15000",
      pointsPerMajorUnit: "6",
    },
  ],
  rewards: [
    {
      code: "ten-euro",
      name: "Ten euro off",
      kind: "fixed_discount" as const,
      costPoints: "1000",
      configuration: { amountMinor: "1000" },
    },
  ],
};

describe("programme contracts", () => {
  it("accepts a versioned Rosy programme draft", () => {
    expect(
      createProgrammeDraftCommandV1.safeParse({
        version: "1",
        organizationId: "12",
        programmeId: "3",
        configurationSha256: "a".repeat(64),
        configuration: definition,
        createdByUserId: "61000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("rejects duplicated, decreasing, and non-zero starting tiers", () => {
    for (const tiers of [
      [definition.tiers[1]],
      [definition.tiers[0], { ...definition.tiers[1], code: "rose" }],
      [
        definition.tiers[0],
        { ...definition.tiers[1], minimumEligibleSpendMinor: "0" },
      ],
    ]) {
      expect(
        programmeDefinitionV1.safeParse({ ...definition, tiers }).success,
      ).toBe(false);
    }
  });

  it("keeps merchant commands on public IDs with server-derived authority", () => {
    expect(
      merchantCreateProgrammeCommandV1.safeParse({
        version: "1",
        programmeGroupId: "71000000-0000-4000-8000-000000000100",
        slug: "rosy-rewards",
        name: "Rosy Rewards",
        idempotencyKey: "programme:create:71000000",
        correlationId: "71000000-0000-4000-8000-000000000200",
      }).success,
    ).toBe(true);
    expect(
      merchantCreateProgrammeDraftCommandV1.safeParse({
        version: "1",
        programmeId: "71000000-0000-4000-8000-000000000101",
        configuration: definition,
        idempotencyKey: "programme:draft:71000000",
        correlationId: "71000000-0000-4000-8000-000000000201",
      }).success,
    ).toBe(true);
    expect(
      merchantPublishProgrammeVersionCommandV1.safeParse({
        version: "1",
        programmeVersionId: "71000000-0000-4000-8000-000000000102",
        expectedConfigurationSha256: "a".repeat(64),
        idempotencyKey: "programme:publish:71000000",
        correlationId: "71000000-0000-4000-8000-000000000202",
      }).success,
    ).toBe(true);
    expect(
      merchantPublishProgrammeVersionCommandV1.safeParse({
        version: "1",
        programmeVersionId: "71000000-0000-4000-8000-000000000102",
        expectedConfigurationSha256: "a".repeat(64),
        idempotencyKey: "programme:publish:forged",
        correlationId: "71000000-0000-4000-8000-000000000202",
        approvedByUserId: "71000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
    expect(
      merchantCreateProgrammeDraftCommandV1.safeParse({
        version: "1",
        programmeId: "3",
        configuration: definition,
        idempotencyKey: "programme:draft:bad",
        correlationId: "71000000-0000-4000-8000-000000000201",
      }).success,
    ).toBe(false);
    expect(
      merchantCreateProgrammeCommandV1.safeParse({
        version: "1",
        programmeGroupId: "71000000-0000-4000-8000-000000000100",
        slug: "Rosy Rewards",
        name: " Rosy Rewards ",
        idempotencyKey: "programme:create:bad",
        correlationId: "71000000-0000-4000-8000-000000000200",
      }).success,
    ).toBe(false);
  });

  it("requires stable hashes around evaluation evidence", () => {
    const evidence = {
      version: "1",
      organizationId: "12",
      programmeGroupId: "7",
      programmeVersionId: "9",
      canonicalEventId: null,
      kind: "simulation",
      subjectReference: "order:42",
      idempotencyKey: "evaluation:order:42",
      inputSha256: "b".repeat(64),
      resultSha256: "c".repeat(64),
      evaluatedAt: "2026-08-12T08:00:00Z",
      result: { awardedPoints: "250" },
      explanation: { ruleIds: ["base"] },
    };
    expect(programmeEvaluationEvidenceV1.safeParse(evidence).success).toBe(
      true,
    );
    expect(
      programmeEvaluationEvidenceV1.safeParse({
        ...evidence,
        kind: "live_refund",
      }).success,
    ).toBe(true);
    expect(
      programmeEvaluationEvidenceV1.safeParse({
        ...evidence,
        inputSha256: "bad",
      }).success,
    ).toBe(false);
  });

  it("accepts connector and ledger evidence on reward transitions", () => {
    expect(
      rewardTransitionCommandV1.safeParse({
        version: "1",
        reservationId: "bf2247d8-893e-49ae-8363-8423928e9cc1",
        toState: "issued",
        idempotencyKey: "reward:42:issued",
        requestSha256: "d".repeat(64),
        actorId: "woocommerce-worker",
        reason: null,
        ledgerTransactionId: null,
        connectorExecutionReference: "woocommerce:coupon:ROSY42",
      }).success,
    ).toBe(true);
  });
});
