import { describe, expect, it } from "vitest";
import {
  adjustPointsCommandV1,
  awardPointsCommandV1,
  ledgerCommandV1,
  releasePointsCommandV1,
} from "./ledger";

const identity = {
  version: "1" as const,
  organizationId: "12",
  idempotencyKey: "order:42:award:v1",
  requestSha256: "a".repeat(64),
  effectiveAt: "2026-08-12T08:00:00Z",
};

describe("ledger command contracts", () => {
  it("accepts a versioned integer award with immutable programme attribution", () => {
    expect(
      awardPointsCommandV1.safeParse({
        ...identity,
        kind: "award",
        programmeGroupId: "7",
        programmeVersionId: "9",
        customerId: "31",
        points: "500",
        sourceEventId: "44",
        sourceReference: "woocommerce-order:42",
      }).success,
    ).toBe(true);
  });

  it("rejects fractional and negative awards", () => {
    for (const points of ["1.5", "-1", "0"]) {
      expect(
        awardPointsCommandV1.safeParse({
          ...identity,
          kind: "award",
          programmeGroupId: "7",
          programmeVersionId: "9",
          customerId: "31",
          points,
          sourceEventId: null,
          sourceReference: null,
        }).success,
      ).toBe(false);
    }
  });

  it("requires release operations to reference the original credit entry", () => {
    expect(
      releasePointsCommandV1.safeParse({
        ...identity,
        kind: "release",
        programmeGroupId: "7",
        programmeVersionId: "9",
        originEntryId: "0b1c8a33-4f83-4cc5-9a8f-4f2eb0f042de",
        expiresAt: "2027-08-12T08:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("requires manual adjustments to be non-zero and attributable", () => {
    expect(
      adjustPointsCommandV1.safeParse({
        ...identity,
        kind: "manual_adjustment",
        walletId: "bf2247d8-893e-49ae-8363-8423928e9cc1",
        programmeVersionId: "9",
        points: "-25",
        reason: "Approved correction",
        actorId: "merchant:owner",
        expiresAt: null,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown mutation kind before it reaches the database", () => {
    expect(
      ledgerCommandV1.safeParse({ ...identity, kind: "rewrite_balance" })
        .success,
    ).toBe(false);
  });
});
