import { describe, expect, it } from "vitest";
import {
  formatEurMinor,
  formatPublicPoints,
  formatPublicVipPeriod,
  formatPublicVipThreshold,
  isPublicId,
  PUBLIC_LOYALTY_ACCOUNT_PATH,
  resolvePublicLocale,
} from "./public-loyalty";

describe("public loyalty presentation", () => {
  it("uses English for every locale selector", () => {
    expect(resolvePublicLocale("sl-SI")).toBe("en");
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
    expect(formatEurMinor("15025", "en")).toBe("€150.25");
  });

  it("routes guests to the canonical same-origin loyalty sign-in", () => {
    expect(PUBLIC_LOYALTY_ACCOUNT_PATH).toBe(
      "/login?next=%2Faccount%2Floyalty",
    );
    expect(PUBLIC_LOYALTY_ACCOUNT_PATH).not.toMatch(/^https?:/u);
    expect(PUBLIC_LOYALTY_ACCOUNT_PATH).not.toContain("lang=");
  });

  it("formats every public VIP qualification without number coercion", () => {
    expect(
      formatPublicVipThreshold(
        { metric: "eligible_spend", minimum: "15025" },
        "en",
      ),
    ).toBe("Spend €150.25");
    expect(
      formatPublicVipThreshold(
        { metric: "earned_points", minimum: "9007199254740993" },
        "en",
      ),
    ).toBe("Earn 9,007,199,254,740,993 points");
    expect(
      formatPublicVipThreshold({ metric: "order_count", minimum: "1" }, "en"),
    ).toBe("Place 1 order");
    expect(
      formatPublicVipThreshold(
        { metric: "referral_count", minimum: "2" },
        "en",
      ),
    ).toBe("Refer 2 friends");
    expect(
      formatPublicVipThreshold(
        { metric: "verified_action_count", minimum: "3" },
        "en",
      ),
    ).toBe("Complete 3 qualifying activities");
  });

  it("explains each bounded VIP qualification window", () => {
    expect(formatPublicVipPeriod({ kind: "lifetime" })).toBe(
      "Lifetime activity",
    );
    expect(formatPublicVipPeriod({ kind: "rolling_days", days: 1 })).toBe(
      "Your latest 1 day",
    );
    expect(
      formatPublicVipPeriod({
        kind: "calendar_year",
        timeZone: "Europe/Ljubljana",
      }),
    ).toBe("Calendar year · Europe/Ljubljana");
  });
});
