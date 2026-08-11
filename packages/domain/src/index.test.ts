import { describe, expect, it } from "vitest";
import { addPoints, minorUnit, points } from "./index";

describe("integer value types", () => {
  it("keeps monetary values and points out of floating point representations", () => {
    expect(minorUnit(18_432_000)).toBe(18_432_000);
    expect(addPoints(points(500), points(250))).toBe(750);
  });

  it("rejects decimals and unsafe integers", () => {
    expect(() => points(0.5)).toThrow("safe integer");
    expect(() => minorUnit(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "safe integer",
    );
  });
});
