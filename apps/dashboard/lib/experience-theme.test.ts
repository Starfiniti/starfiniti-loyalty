import { describe, expect, it } from "vitest";
import { experienceThemeDefinitionV1 } from "@starfiniti/contracts";
import {
  DEFAULT_EXPERIENCE_THEME,
  experienceFontStack,
} from "./experience-theme";

describe("experience theme presentation", () => {
  it("keeps the default theme contract-valid", () => {
    expect(
      experienceThemeDefinitionV1.safeParse(DEFAULT_EXPERIENCE_THEME).success,
    ).toBe(true);
  });

  it("maps every font token to a local stack without a URL", () => {
    for (const token of [
      "system-sans",
      "editorial-serif",
      "modern-serif",
    ] as const) {
      expect(experienceFontStack(token)).not.toContain("url(");
      expect(experienceFontStack(token)).not.toContain("http");
    }
  });
});
