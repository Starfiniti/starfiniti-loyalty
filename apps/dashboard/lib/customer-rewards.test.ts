import { describe, expect, it } from "vitest";
import { isSelfServiceRewardKind } from "./customer-rewards";

describe("isSelfServiceRewardKind", () => {
  it.each([
    "fixed_discount",
    "percentage_discount",
    "free_shipping",
    "free_product",
    "exclusive_access",
    "custom",
  ])("allows %s through the customer reservation flow", (kind) => {
    expect(isSelfServiceRewardKind(kind)).toBe(true);
  });

  it.each(["store_credit", "gift_card", "cash", "unknown"])(
    "keeps unsupported reward kind %s out of self-service redemption",
    (kind) => {
      expect(isSelfServiceRewardKind(kind)).toBe(false);
    },
  );
});
