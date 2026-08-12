import { describe, expect, it } from "vitest";
import {
  adjustPointsCommandV1,
  awardPointsCommandV1,
  ledgerCommandV1,
  merchantAdjustCustomerPointsCommandV1,
  merchantBulkAdjustmentPreviewCommandV1,
  merchantBulkAdjustmentPreviewResultV1,
  merchantExecuteBulkAdjustmentCommandV1,
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

  it("accepts an actorless merchant credit with explicit expiry", () => {
    expect(
      merchantAdjustCustomerPointsCommandV1.safeParse({
        version: "1",
        customerId: "bf2247d8-893e-49ae-8363-8423928e9cc1",
        programmeGroupId: "bf2247d8-893e-49ae-8363-8423928e9cc2",
        programmeVersionId: "bf2247d8-893e-49ae-8363-8423928e9cc3",
        points: "200",
        reason: "Approved service recovery credit",
        internalNote: "Ticket CS-1042",
        expiresAt: "2027-08-12T08:00:00Z",
        idempotencyKey: "customer:adjust:fixture",
        correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc4",
      }).success,
    ).toBe(true);
  });

  it("requires expiry only for credits and rejects caller authority", () => {
    const base = {
      version: "1",
      customerId: "bf2247d8-893e-49ae-8363-8423928e9cc1",
      programmeGroupId: "bf2247d8-893e-49ae-8363-8423928e9cc2",
      programmeVersionId: "bf2247d8-893e-49ae-8363-8423928e9cc3",
      reason: "Approved customer correction",
      internalNote: null,
      idempotencyKey: "customer:adjust:fixture",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc4",
    };
    expect(
      merchantAdjustCustomerPointsCommandV1.safeParse({
        ...base,
        points: "10",
        expiresAt: null,
      }).success,
    ).toBe(false);
    expect(
      merchantAdjustCustomerPointsCommandV1.safeParse({
        ...base,
        points: "-10",
        expiresAt: "2027-08-12T08:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      merchantAdjustCustomerPointsCommandV1.safeParse({
        ...base,
        points: "-10",
        expiresAt: null,
        actorId: "forged-admin",
      }).success,
    ).toBe(false);
  });

  it("requires a unique bounded customer set for bulk preview", () => {
    const base = {
      version: "1",
      customerIds: [
        "bf2247d8-893e-49ae-8363-8423928e9cc1",
        "bf2247d8-893e-49ae-8363-8423928e9cc5",
      ],
      programmeGroupId: "bf2247d8-893e-49ae-8363-8423928e9cc2",
      programmeVersionId: "bf2247d8-893e-49ae-8363-8423928e9cc3",
      pointsPerCustomer: "50",
      reason: "Approved bulk service recovery",
      expiresAt: "2027-08-12T08:00:00Z",
    };
    expect(merchantBulkAdjustmentPreviewCommandV1.safeParse(base).success).toBe(
      true,
    );
    expect(
      merchantBulkAdjustmentPreviewCommandV1.safeParse({
        ...base,
        customerIds: [base.customerIds[0], base.customerIds[0]],
      }).success,
    ).toBe(false);
    expect(
      merchantBulkAdjustmentPreviewCommandV1.safeParse({
        ...base,
        customerIds: base.customerIds.slice(0, 1),
      }).success,
    ).toBe(false);
  });

  it("binds bulk execution to one exact preview without caller authority", () => {
    const command = {
      version: "1",
      customerIds: [
        "bf2247d8-893e-49ae-8363-8423928e9cc1",
        "bf2247d8-893e-49ae-8363-8423928e9cc5",
      ],
      programmeGroupId: "bf2247d8-893e-49ae-8363-8423928e9cc2",
      programmeVersionId: "bf2247d8-893e-49ae-8363-8423928e9cc3",
      pointsPerCustomer: "-50",
      reason: "Approved bulk balance correction",
      expiresAt: null,
      expectedPreviewSha256: "a".repeat(64),
      idempotencyKey: "bulk:adjust:fixture",
      correlationId: "bf2247d8-893e-49ae-8363-8423928e9cc4",
    };
    expect(
      merchantExecuteBulkAdjustmentCommandV1.safeParse(command).success,
    ).toBe(true);
    expect(
      merchantExecuteBulkAdjustmentCommandV1.safeParse({
        ...command,
        organizationId: "42",
        actorId: "forged-owner",
      }).success,
    ).toBe(false);
  });

  it("verifies bulk preview arithmetic and one unique item per customer", () => {
    const preview = {
      previewSha256: "a".repeat(64),
      customerCount: 2,
      pointsPerCustomer: "50",
      totalPoints: "100",
      items: [
        {
          customerId: "bf2247d8-893e-49ae-8363-8423928e9cc1",
          displayReference: "Customer A",
          availablePoints: "100",
          projectedAvailablePoints: "150",
        },
        {
          customerId: "bf2247d8-893e-49ae-8363-8423928e9cc5",
          displayReference: "Customer B",
          availablePoints: "-20",
          projectedAvailablePoints: "30",
        },
      ],
    };
    expect(
      merchantBulkAdjustmentPreviewResultV1.safeParse(preview).success,
    ).toBe(true);
    expect(
      merchantBulkAdjustmentPreviewResultV1.safeParse({
        ...preview,
        totalPoints: "99",
      }).success,
    ).toBe(false);
    expect(
      merchantBulkAdjustmentPreviewResultV1.safeParse({
        ...preview,
        items: [preview.items[0], preview.items[0]],
      }).success,
    ).toBe(false);
  });
});
