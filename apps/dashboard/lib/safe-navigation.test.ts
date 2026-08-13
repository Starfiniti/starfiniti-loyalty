import { describe, expect, it } from "vitest";
import { safeAppPath } from "./safe-navigation";

describe("safe application navigation", () => {
  it("keeps a local absolute path", () => {
    expect(safeAppPath("/programme?tab=rewards")).toBe(
      "/programme?tab=rewards",
    );
  });

  it.each([
    "https://attacker.example",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "/login?next=/login",
    `/${"a".repeat(4096)}`,
    null,
  ])("rejects redirect input %s", (value) => {
    expect(safeAppPath(value)).toBe("/");
  });
});
