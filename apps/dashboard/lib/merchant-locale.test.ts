import { describe, expect, it } from "vitest";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "./merchant-locale";

describe("English-only merchant presentation", () => {
  it("ignores legacy and unsupported locale selectors", () => {
    expect(resolveMerchantLocale("en")).toBe("en");
    expect(resolveMerchantLocale("sl-SI")).toBe("en");
    expect(resolveMerchantLocale("de-DE")).toBe("en");
  });

  it("removes legacy language parameters from navigation", () => {
    expect(merchantLocalePath("/programme", "en")).toBe("/programme");
    expect(merchantLocalePath("/?range=90&lang=sl-SI", "sl-SI")).toBe(
      "/?range=90",
    );
  });

  it("uses English copy and formatting for every legacy locale value", () => {
    expect(merchantIntlLocale("sl-SI")).toBe("en-GB");
    expect(merchantText("sl-SI", "Overview")).toBe("Overview");
    expect(merchantText("en", "Connector health")).toBe("Connector health");
  });
});
