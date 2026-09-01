import { describe, expect, it } from "vitest";
import { merchantNavigation } from "./merchant-navigation";

describe("merchant programme navigation", () => {
  it("gives every programme workflow a distinct route", () => {
    const programmeItems = merchantNavigation.filter((item) =>
      item.href.startsWith("/programme"),
    );

    expect(programmeItems.map((item) => item.href)).toEqual([
      "/programme",
      "/programme/earning-rules",
      "/programme/rewards",
      "/programme/vip-tiers",
    ]);
    expect(new Set(programmeItems.map((item) => item.href)).size).toBe(4);
    expect(programmeItems.every((item) => !item.href.includes("#"))).toBe(true);
  });

  it("marks only the exact programme workflow as current", () => {
    for (const current of merchantNavigation.filter((item) =>
      item.href.startsWith("/programme"),
    )) {
      const matches = merchantNavigation.filter((item) =>
        item.match(current.href),
      );
      expect(matches.map((item) => item.href)).toEqual([current.href]);
    }
  });

  it("exposes campaigns as a real Grow destination", () => {
    const campaign = merchantNavigation.find(
      (item) => item.href === "/campaigns",
    );
    expect(campaign?.label).toBe("Campaigns");
    expect(campaign?.match("/campaigns/history")).toBe(true);
  });

  it("exposes enterprise access as a real Platform destination", () => {
    const access = merchantNavigation.find(
      (item) => item.href === "/organization/access",
    );
    expect(access?.label).toBe("Team & access");
    expect(access?.group).toBeUndefined();
    expect(access?.match("/organization/access")).toBe(true);
  });

  it("exposes billing as a real Platform destination", () => {
    const billing = merchantNavigation.find((item) => item.href === "/billing");
    expect(billing?.label).toBe("Billing & plan");
    expect(billing?.group).toBeUndefined();
    expect(billing?.match("/billing/history")).toBe(true);
  });
});
