import { describe, expect, it } from "vitest";
import { pointExpiryPolicyV2 } from "./point-expiry-v2";

describe("PointExpiryPolicyV2", () => {
  it("accepts the earned-date policy and a descending reminder schedule", () => {
    expect(
      pointExpiryPolicyV2.parse({
        version: "2",
        method: "earned_date",
        expireAfterDays: 365,
        notificationLeadDays: [30, 14, 7],
      }),
    ).toEqual({
      version: "2",
      method: "earned_date",
      expireAfterDays: 365,
      notificationLeadDays: [30, 14, 7],
    });
  });

  it.each([
    [[30, 30], "unique"],
    [[7, 14], "descending"],
    [[365], "precede"],
  ] as const)(
    "rejects an invalid %s schedule",
    (notificationLeadDays, issue) => {
      const result = pointExpiryPolicyV2.safeParse({
        version: "2",
        method: "earned_date",
        expireAfterDays: 365,
        notificationLeadDays,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((item) => item.message.includes(issue)),
        ).toBe(true);
      }
    },
  );
});
