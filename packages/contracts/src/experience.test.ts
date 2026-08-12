import { describe, expect, it } from "vitest";
import {
  contrastAgainstWhite,
  experienceThemeDefinitionV1,
  merchantSaveExperienceThemeCommandV1,
} from "./experience";

const theme = {
  version: "1" as const,
  brandColor: "#7c2d4f",
  displayFont: "editorial-serif" as const,
  cardRadiusPx: 14 as const,
  heroText: "Beauty that gives back",
  pointsLabel: "Petals",
  showTier: true,
  showRewards: true,
  widgetPosition: "right" as const,
};

describe("experience theme contracts", () => {
  it("accepts a bounded accessible token set", () => {
    expect(experienceThemeDefinitionV1.safeParse(theme).success).toBe(true);
    expect(contrastAgainstWhite(theme.brandColor)).toBeGreaterThanOrEqual(4.5);
  });

  it("rejects colors that cannot carry white text accessibly", () => {
    expect(
      experienceThemeDefinitionV1.safeParse({
        ...theme,
        brandColor: "#fce7f3",
      }).success,
    ).toBe(false);
  });

  it("rejects arbitrary CSS, font URLs, and unknown controls", () => {
    expect(
      experienceThemeDefinitionV1.safeParse({
        ...theme,
        customCss: "body{display:none}",
      }).success,
    ).toBe(false);
    expect(
      experienceThemeDefinitionV1.safeParse({
        ...theme,
        displayFont: "url(https://tracking.invalid/font.woff2)",
      }).success,
    ).toBe(false);
  });

  it("keeps tenant authority on public scope IDs", () => {
    expect(
      merchantSaveExperienceThemeCommandV1.safeParse({
        version: "1",
        workspaceId: "a1000000-0000-4000-8000-000000000001",
        programmeGroupId: "a1000000-0000-4000-8000-000000000002",
        theme,
        idempotencyKey: "experience:save:one",
        correlationId: "a1000000-0000-4000-8000-000000000003",
      }).success,
    ).toBe(true);
  });
});
