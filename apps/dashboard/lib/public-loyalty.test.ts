import { describe, expect, it } from "vitest";
import {
  formatEurMinor,
  formatPublicPoints,
  isPublicId,
  resolvePublicLocale,
} from "./public-loyalty";

describe("public loyalty presentation", () => {
  it("allows only explicit English and Slovenian locale selection", () => {
    expect(resolvePublicLocale("sl-SI")).toBe("sl-SI");
    expect(resolvePublicLocale("en")).toBe("en");
    expect(resolvePublicLocale(["sl-SI"])).toBe("en");
    expect(resolvePublicLocale("../../private")).toBe("en");
  });

  it("rejects malformed route identifiers before entering PostgreSQL", () => {
    expect(isPublicId("a1000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isPublicId("../../private")).toBe(false);
    expect(isPublicId("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("formats exact bigint point and EUR values without number coercion", () => {
    expect(formatPublicPoints("9007199254740993", "en")).toBe(
      "9,007,199,254,740,993",
    );
    expect(formatEurMinor("15000", "en")).toBe("€150");
    expect(formatEurMinor("15025", "sl-SI")).toBe("€150,25");
  });
});
