import { describe, expect, it } from "vitest";
import {
  createEarningRuleTemplate,
  decimalToMinor,
  initialProgrammeDefinitionV2,
  selectorList,
} from "./earning-rules-model";

describe("earning rules editor model", () => {
  it("preserves the V1 tier and reward surface while creating a reviewed V2 draft", () => {
    const result = initialProgrammeDefinitionV2({
      version: "1",
      tiers: [
        {
          code: "rose",
          name: "Rose",
          minimumEligibleSpendMinor: "0",
          pointsPerMajorUnit: "5",
        },
      ],
      rewards: [
        {
          code: "five-off",
          name: "Five off",
          kind: "fixed_discount",
          costPoints: "500",
          configuration: {
            amountMinor: "500",
            currencyMinorUnitDigits: 2,
            validityDays: 30,
          },
        },
      ],
    });
    expect(result.migratedFromV1).toBe(true);
    expect(result.definition.tiers[0]?.code).toBe("rose");
    expect(result.definition.rewards[0]?.code).toBe("five-off");
    expect(result.definition.earningRules[0]?.effect).toEqual({
      kind: "base_rate",
      pointsPerMajorUnit: "5",
    });
    expect(result.definition.pointsExpiryPolicy).toEqual({
      version: "2",
      method: "earned_date",
      expireAfterDays: 365,
      notificationLeadDays: [30, 14, 7],
    });
  });

  it("builds unique, source-safe catalogue templates", () => {
    const first = createEarningRuleTemplate("custom_activity", []);
    const second = createEarningRuleTemplate("custom_activity", [first]);
    expect(first.conditions.activityCodes).toEqual(["custom_activity"]);
    expect(second.code).toBe("custom-activity-2");
    expect(second.purchaseExclusions).toBeNull();
  });

  it("normalizes selectors and converts money without floating point", () => {
    expect(selectorList(" vip, retail, vip,  ")).toEqual(["vip", "retail"]);
    expect(decimalToMinor("150.05", 2)).toBe("15005");
    expect(decimalToMinor("150.005", 2)).toBeNull();
  });
});
