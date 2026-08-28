import { describe, expect, it } from "vitest";
import {
  expandedRewardValidationIssues,
  initialExpandedRewardEditorRows,
  isVersionedRewardCandidate,
  removeExpandedRewardEditorRow,
  replaceCollapsedRewardIssues,
  replaceExpandedRewardEditorRow,
  validationPathHasIssue,
} from "./expanded-rewards-validation";

const freeProductReward = {
  code: "free-product",
  name: "Free product",
  kind: "free_product" as const,
  costPoints: "1000",
  configuration: {
    version: "2" as const,
    fulfilmentMode: "woocommerce_coupon" as const,
    validityDays: 30,
    availability: {
      startsAt: null,
      endsAt: null,
      tierCodes: [],
      segmentCodes: [],
      perCustomerLimit: null,
      globalQuantity: null,
      pointsBudget: null,
    },
    restrictions: {
      minimumSpendMinor: null,
      productIds: [],
      excludedProductIds: [],
      categoryIds: [],
      excludedCategoryIds: [],
      excludeSaleItems: false,
      stacking: "exclusive" as const,
    },
    productId: "1",
    quantity: 1,
  },
};

describe("expanded reward draft validation", () => {
  it("keeps a temporarily invalid V2 reward in the expanded editor", () => {
    const invalidReward = { ...freeProductReward, code: "Invalid code" };

    expect(isVersionedRewardCandidate(invalidReward)).toBe(true);
    const issues = expandedRewardValidationIssues([invalidReward]);
    expect(issues).toEqual([
      expect.objectContaining({ path: ["rewards", 0, "code"] }),
    ]);
    expect(validationPathHasIssue(issues, "rewards.0.code")).toBe(true);
    expect(validationPathHasIssue(issues, "rewards.0.name")).toBe(false);
  });

  it("keeps an unversioned V1 reward in the legacy presentation", () => {
    expect(
      isVersionedRewardCandidate({
        ...freeProductReward,
        configuration: {},
      }),
    ).toBe(false);
  });

  it("replaces only a collapsed reward issue and retains cross-reward errors", () => {
    const merged = replaceCollapsedRewardIssues(
      [
        { message: "Invalid input", path: ["rewards", 1] },
        { message: "Duplicate reward code", path: ["rewards", 1, "code"] },
      ],
      [
        {
          message: "Budget is below one redemption",
          path: ["rewards", 1, "configuration", "availability", "pointsBudget"],
        },
      ],
    );

    expect(merged).toEqual([
      { message: "Duplicate reward code", path: ["rewards", 1, "code"] },
      {
        message: "Budget is below one redemption",
        path: ["rewards", 1, "configuration", "availability", "pointsBudget"],
      },
    ]);
  });

  it("keeps editor-only row identity stable through edits and removal", () => {
    const secondReward = {
      ...freeProductReward,
      code: "free-product-two",
      name: "Second free product",
    };
    const initial = initialExpandedRewardEditorRows([
      freeProductReward,
      secondReward,
    ]);

    expect(initial.map((row) => row.editorKey)).toEqual([
      "initial:0",
      "initial:1",
    ]);

    const edited = replaceExpandedRewardEditorRow(initial, 1, {
      ...secondReward,
      code: "edited-code",
    });
    expect(edited[1]?.editorKey).toBe("initial:1");
    expect(edited[1]?.reward.code).toBe("edited-code");

    const surviving = removeExpandedRewardEditorRow(edited, 0);
    expect(surviving).toEqual([
      {
        editorKey: "initial:1",
        reward: expect.objectContaining({ code: "edited-code" }),
      },
    ]);
    expect(JSON.stringify(surviving.map((row) => row.reward))).not.toContain(
      "editorKey",
    );
  });
});
