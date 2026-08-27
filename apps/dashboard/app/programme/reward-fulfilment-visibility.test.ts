import { describe, expect, it } from "vitest";
import { shouldShowRewardFulfilmentQueue } from "./reward-fulfilment-visibility";

describe("shouldShowRewardFulfilmentQueue", () => {
  it("keeps accepted cases visible after expanded rewards are disabled", () => {
    expect(shouldShowRewardFulfilmentQueue(false, 1)).toBe(true);
  });

  it("hides an empty queue when expanded rewards are disabled", () => {
    expect(shouldShowRewardFulfilmentQueue(false, 0)).toBe(false);
  });

  it("shows the queue for an enabled empty catalogue", () => {
    expect(shouldShowRewardFulfilmentQueue(true, 0)).toBe(true);
  });
});
