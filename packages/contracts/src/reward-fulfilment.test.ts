import { describe, expect, it } from "vitest";
import {
  merchantResolveRewardFulfilmentCommandV1,
  merchantStartRewardFulfilmentCommandV1,
  rewardFulfilmentCaseV1,
  rewardFulfilmentSummaryV1,
} from "./reward-fulfilment";

describe("manual reward fulfilment contracts", () => {
  it("accepts a bounded start command", () => {
    expect(
      merchantStartRewardFulfilmentCommandV1.safeParse({
        version: "1",
        caseId: "84000000-0000-4000-8000-000000000001",
        idempotencyKey: "manual:start:1",
        correlationId: "84000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(true);
  });

  it("requires positive delivery evidence only for fulfilment", () => {
    expect(
      merchantResolveRewardFulfilmentCommandV1.safeParse({
        version: "1",
        caseId: "84000000-0000-4000-8000-000000000001",
        resolution: "fulfilled",
        resultReference: "store-case:901",
        reason: "Member confirmed delivery",
        idempotencyKey: "manual:resolve:1",
        correlationId: "84000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(true);
    expect(
      merchantResolveRewardFulfilmentCommandV1.safeParse({
        version: "1",
        caseId: "84000000-0000-4000-8000-000000000001",
        resolution: "fulfilled",
        resultReference: null,
        reason: null,
        idempotencyKey: "manual:resolve:2",
        correlationId: "84000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(false);
  });

  it("requires an attributable rejection and prohibits delivery evidence", () => {
    expect(
      merchantResolveRewardFulfilmentCommandV1.safeParse({
        version: "1",
        caseId: "84000000-0000-4000-8000-000000000001",
        resolution: "rejected",
        resultReference: null,
        reason: "Benefit is no longer available",
        idempotencyKey: "manual:reject:1",
        correlationId: "84000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(true);
  });

  it("parses minimized queue and exact summary outputs", () => {
    expect(
      rewardFulfilmentCaseV1.safeParse({
        caseId: "84000000-0000-4000-8000-000000000001",
        reservationId: "84000000-0000-4000-8000-000000000002",
        customerId: "84000000-0000-4000-8000-000000000003",
        customerReference: "Member 84000000",
        rewardCode: "studio-tour",
        rewardName: "Private studio tour",
        costPoints: "5000",
        state: "pending",
        instructions: "Contact the member to arrange the visit.",
        dueAt: "2026-08-20T12:00:00.000Z",
        resultReference: null,
        createdAt: "2026-08-13T12:00:00.000Z",
        updatedAt: "2026-08-13T12:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      rewardFulfilmentSummaryV1.parse({
        pending: 1,
        inProgress: 2,
        overdue: 0,
        fulfilled30d: 4,
        rejected30d: 1,
      }),
    ).toMatchObject({ inProgress: 2, fulfilled30d: 4 });
  });
});
